'use strict';
// FLAGGA-AV-PROVET PÅ DEN VERKLIGA ENTRYPOINTEN — inte modulen, utan `node bridge.js <konto>`.
//
// Enhetsprovet i livscykel.test.js bevisar noop-varianten isolerat; det här beviset kör hela
// require.main-blocket i en forkad process med VYRA_SANDNINGSIDENTITET OSATT och en fejkad
// tiktok-live-connector (preload — se test/hjalp/fejk-connector-preload.js):
//   · noll anrop till /api/live-runs, /api/live-sessions och /api/live-sessions/end,
//   · det gamla moln-eventet når mock-molnet med exakt dagens URL, headers och body (byte för
//     byte mot N.cloudEvent),
//   · randomUUID anropas aldrig i hela processen (preloaden räknar globalt, skriver uuid=N på exit).
// Ingen lifecycle-timer/kö existerar med flaggan av — det är bevisat i enhetsprovet (vanta
// aldrig anropad, inga köobjekt); här bevisas den observerbara halvan: ingen trafik.
const test = require('node:test'), assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const N = require('../normalizer');

const TOKEN = 'entrypointprov-' + 'x'.repeat(33);
const WS = 'ws-entrypointprov';
const KONTO = 'provkonto060';

test('entrypoint: flaggan osatt — inga live-anrop, byteidentiskt moln-event, uuid=0', { timeout: 30000 }, async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      requests.push({ url: req.url, method: req.method, headers: req.headers, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const env = { ...process.env,
    VYRA_CLOUD_URL: `http://127.0.0.1:${port}`,
    VYRA_WORKSPACE_ID: WS,
    VYRA_INGEST_TOKEN: TOKEN,
  };
  delete env.VYRA_SANDNINGSIDENTITET;   // osatt — inte '0': så ser produktionen ut
  delete env.VYRA_SERVER_URL;           // molnläge: ingen lokal server, inga döda POST-rader

  const preload = path.join(__dirname, 'hjalp', 'fejk-connector-preload.js');
  const child = fork(path.join(__dirname, '..', 'bridge.js'), [KONTO], {
    env, execArgv: ['-r', preload], silent: true,
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d; });
  child.stderr.on('data', d => { stderr += d; });
  const kod = await new Promise(r => child.on('exit', r));

  try {
    assert.equal(kod, 0, `bryggprocessen dog med kod ${kod}. stderr: ${stderr.slice(0, 400)}`);

    // 1. Inte ett enda livscykelanrop.
    const liv = requests.filter(r => r.url.includes('/api/live-'));
    assert.equal(liv.length, 0, 'flaggan var av men livscykelrutter anropades: '
      + liv.map(r => r.url).join(', '));

    // 2. Det gamla moln-eventet — exakt dagens form.
    const events = requests.filter(r => r.url.includes('/api/events/tiktok/'));
    assert.equal(events.length, 1, `väntade exakt ett moln-event, fick ${events.length}. `
      + `Alla: ${requests.map(r => r.url).join(', ')}`);
    const ev = events[0];
    assert.equal(ev.url, `/api/events/tiktok/${WS}`);
    assert.equal(ev.method, 'POST');
    assert.equal(ev.headers['content-type'], 'application/json');
    assert.equal(ev.headers['authorization'], `Bearer ${TOKEN}`);
    const skickad = JSON.parse(ev.body);
    assert.equal(skickad.type, 'follow');
    // Byte för byte mot dagens N.cloudEvent-form, med samma id/at som processen valde.
    assert.equal(ev.body, JSON.stringify(N.cloudEvent(skickad.id, 'follow',
      N.baseUser({ userId: '42', uniqueId: 'givare', nickname: 'Givaren' }), skickad.at)),
      'moln-eventets body är inte byteidentisk med dagens form');

    // 3. randomUUID anropades aldrig i hela processen.
    const uuidRad = stdout.split('\n').find(r => r.includes('[fejk] uuid='));
    assert.ok(uuidRad, 'preloadens uuid-räknare saknas i stdout: ' + stdout.slice(-300));
    assert.equal(uuidRad.trim(), '[fejk] uuid=0', 'randomUUID anropades trots att flaggan är av');
  } finally {
    await new Promise(r => server.close(r));
  }
});
