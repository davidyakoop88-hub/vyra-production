'use strict';
// SÄNDNINGSIDENTITETENS LIVSCYKEL — röda prov före implementation (design godkänd 2026-08-24).
//
// Provar den nya modulen livscykel.js: körningsidentitet (bridgeRunId), livscykel-FIFO:n med
// seq och retry, grindmaskinen (disabled/registering/waiting-start/draining/open/ending/stale),
// fail-stop-policyn (409/stale=exit 86, 400=exit 65, 401 bounded=exit 78) och flagga-av-vägen
// som ska vara byteidentisk med dagens moln-postning i bridge.js:255.
//
// Allt injiceras — fetch, väntan, uuid, logg, exit — så inte ett enda prov rör nätverk, klocka
// eller process.exit.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer');

let L = null;
try { L = require('../livscykel'); } catch {}
const finns = () => assert.ok(L && typeof L.skapaLivscykel === 'function',
  'tiktok-bridge/livscykel.js finns inte än — modulen som äger sändningsidentiteten');

const TOKEN = 'livscykelprov-' + 'x'.repeat(34);
const CLOUD = 'https://moln.prov';
const WS = 'ws-livscykelprov';
const KONTO = 'provkonto060';

// Mock-molnet: spelar in varje request (url, headers, body som TEXT — byteidentitet, inte
// strukturell likhet) och svarar enligt ett skript. Utan skriptpost: 200 accepted/ok.
function mockMoln() {
  const requests = [];
  const skript = [];   // [{match: url-del, svar: {status, body} | fn(req)}]
  const fetchFn = async (url, opts = {}) => {
    const req = { url: String(url), method: opts.method || 'GET',
      headers: opts.headers || {}, body: opts.body === undefined ? null : String(opts.body) };
    requests.push(req);
    for (let i = 0; i < skript.length; i++) {
      if (req.url.includes(skript[i].match)) {
        const post = skript.splice(i, 1)[0];
        const svar = typeof post.svar === 'function' ? await post.svar(req) : post.svar;
        if (svar instanceof Error) throw svar;
        return { ok: svar.status < 400, status: svar.status,
          json: async () => svar.body, text: async () => JSON.stringify(svar.body) };
      }
    }
    const body = req.url.includes('/api/live-runs') ? { ok: true }
      : req.url.includes('/api/live-sessions') ? { ok: true, accepted: true }
      : { ok: true };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { requests, skript, fetchFn,
    av: (del) => requests.filter(r => r.url.includes(del)),
    // Väntar tills mock-molnet sett n requests vars url innehåller del — mikrotasker, ingen klocka.
    tills: async (n, del = '') => {
      for (let i = 0; i < 5000; i++) {
        if (requests.filter(r => !del || r.url.includes(del)).length >= n) return;
        await new Promise(r => setImmediate(r));
      }
      assert.fail(`mock-molnet såg aldrig ${n} requests (${del || 'alla'}); har ${requests.length}`);
    } };
}

function fangare() {
  const rader = [];
  return { rader,
    log: (...a) => rader.push(a.join(' ')),
    error: (...a) => rader.push('ERROR ' + a.join(' ')) };
}

let uuidNr = 0;
function rigg(over = {}) {
  finns();
  const moln = mockMoln(), logg = fangare(), exits = [], vantader = [], raknat = [];
  const lc = L.skapaLivscykel({
    pa: true, tiktokUsername: KONTO, cloud: CLOUD, workspace: WS, token: TOKEN,
    fetchFn: moln.fetchFn,
    vanta: async (ms) => { vantader.push(ms); },
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuidNr).padStart(12, '0')}`,
    logg, avsluta: kod => exits.push(kod),
    buffertTak: 500,
    raknad: nyckel => raknat.push(nyckel),
    ...over,
  });
  return { lc, moln, logg, exits, vantader, raknat };
}

const startBody = (roomId, runId, seq) =>
  JSON.stringify({ tiktokUsername: KONTO, roomId, bridgeRunId: runId, seq });

// ---- §6 · Flagga av — byteidentiskt med dagens bridge.js:255 -----------------------------------

test('livscykel: flagga av — moln() gör exakt dagens fetch, byte för byte', async () => {
  finns();
  const moln = mockMoln(), logg = fangare(); let uuidAnrop = 0, vantaAnrop = 0;
  const lc = L.skapaLivscykel({
    pa: false, tiktokUsername: KONTO, cloud: CLOUD, workspace: WS, token: TOKEN,
    fetchFn: moln.fetchFn, vanta: async () => { vantaAnrop++; },
    randomUUID: () => { uuidAnrop++; return 'skulle-aldrig-skapas'; }, logg,
    avsluta: () => assert.fail('avsluta anropades med flaggan av'),
  });
  assert.equal(lc.lage(), 'disabled');
  assert.equal(lc.bridgeRunId, null, 'bridgeRunId ska inte existera med flaggan av');

  // Livscykelmetoderna är synkrona no-ops — inga anrop, inga fel.
  lc.startad('760000000000000001');
  lc.slut('760000000000000001');

  // Dagens rad, ordagrant efter bridge.js:255: url, headers och body.
  const fields = { username: 'givare', coins: 5 };
  await lc.moln('gift:abc123', 'gift', fields);
  await moln.tills(1);
  assert.equal(moln.requests.length, 1, 'exakt ett anrop: eventet, inga live-*');
  const r = moln.requests[0];
  assert.equal(r.url, `${CLOUD}/api/events/tiktok/${WS}`);
  assert.equal(r.method, 'POST');
  assert.deepEqual(r.headers, { 'content-type': 'application/json', 'authorization': `Bearer ${TOKEN}` });
  // Byte för byte mot N.cloudEvent — samma tidskälla injiceras inte här, så jämför utan `at`
  // genom att bygga referensen med exakt samma at-värde som skickades.
  const skickad = JSON.parse(r.body);
  assert.equal(r.body, JSON.stringify(N.cloudEvent('gift:abc123', 'gift', fields, skickad.at)),
    'bodyn är inte byteidentisk med dagens N.cloudEvent-form');
  assert.equal(uuidAnrop, 0, 'randomUUID anropades trots flaggan av');
  assert.equal(vantaAnrop, 0, 'en timer/backoff skapades trots flaggan av');
  assert.equal(logg.rader.length, 0, 'flagga av ska inte logga någonting nytt');
});

// ---- Körningsidentitet -------------------------------------------------------------------------

test('livscykel: ett bridgeRunId per instans — behålls över återanslutningar, nytt per instans', async () => {
  const a = rigg();
  const id1 = a.lc.bridgeRunId;
  assert.match(String(id1), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  a.lc.startad('760000000000000001');
  a.lc.startad('760000000000000001');   // återanslutning: samma instans, samma id
  assert.equal(a.lc.bridgeRunId, id1);
  const b = rigg();                      // ny process = ny instans = nytt id
  assert.notEqual(b.lc.bridgeRunId, id1);
});

test('livscykel: registreringen är kööbjekt #0 — före start, före alla events', async () => {
  const { lc, moln } = rigg();
  // Eventet anländer FÖRE connect-resultatet — får inte passera före registrering+start.
  lc.moln('gift:1', 'gift', { coins: 1 });
  lc.startad('760000000000000001');
  await moln.tills(3);
  assert.ok(moln.requests[0].url.endsWith('/api/live-runs'), 'första anropet är registreringen');
  assert.equal(JSON.parse(moln.requests[0].body).tiktokUsername, KONTO);
  assert.equal(JSON.parse(moln.requests[0].body).bridgeRunId, lc.bridgeRunId);
  assert.ok(moln.requests[1].url.endsWith('/api/live-sessions'), 'andra anropet är starten');
  assert.ok(moln.requests[2].url.includes('/api/events/tiktok/'), 'eventet kommer efter accepterat start');
});

// ---- Seq och retry -----------------------------------------------------------------------------

test('livscykel: seq 1, 2, 3 över start → end → start, exakta bodies', async () => {
  const { lc, moln } = rigg();
  lc.startad('760000000000000001');
  lc.slut('760000000000000001');
  lc.startad('760000000000000002');
  await moln.tills(2, '/api/live-sessions');
  await moln.tills(1, '/api/live-sessions/end');
  const liv = moln.requests.filter(r => r.url.includes('/api/live-sessions'));
  assert.equal(liv[0].body, startBody('760000000000000001', lc.bridgeRunId, 1));
  assert.ok(liv[1].url.endsWith('/end'));
  assert.equal(liv[1].body, startBody('760000000000000001', lc.bridgeRunId, 2));
  assert.equal(liv[2].body, startBody('760000000000000002', lc.bridgeRunId, 3));
});

test('livscykel: retry efter nätfel återanvänder exakt samma seq och body', async () => {
  const { lc, moln, vantader } = rigg();
  moln.skript.push({ match: '/api/live-sessions', svar: new Error('ECONNRESET') });
  lc.startad('760000000000000001');
  await moln.tills(2, '/api/live-sessions');
  const forsok = moln.av('/api/live-sessions');
  assert.equal(forsok[0].body, forsok[1].body, 'retryn ändrade bodyn');
  assert.equal(JSON.parse(forsok[1].body).seq, 1, 'seq ökades för att ett svar saknades');
  assert.ok(vantader.length >= 1, 'retryn väntade inte (backoff saknas)');
  assert.ok(vantader.every(ms => ms >= 1000 && ms <= 60000), 'backoff utanför 1s–60s: ' + vantader);
});

test('livscykel: 503 ger bounded backoff-retry på samma besked', async () => {
  const { lc, moln, vantader, exits } = rigg();
  moln.skript.push({ match: '/api/live-runs', svar: { status: 503, body: { ok: false, error: 'Sändningsidentiteten är inte aktiverad' } } });
  lc.startad('760000000000000001');
  await moln.tills(2, '/api/live-runs');
  const reg = moln.av('/api/live-runs');
  assert.equal(reg[0].body, reg[1].body);
  assert.ok(vantader.every(ms => ms <= 60000), 'backoff över taket 60s');
  assert.deepEqual(exits, [], 'en 503 är inte fatal');
});

// ---- Grindmaskinen (§2) ------------------------------------------------------------------------

test('livscykel: grindens ordning — event före connect, under väntande start, under dränering', async () => {
  const { lc, moln } = rigg();
  let slappStart;
  moln.skript.push({ match: '/api/live-sessions', svar: () => new Promise(r => {
    slappStart = () => r({ status: 200, body: { ok: true, accepted: true } });
  }) });
  lc.moln('e:1', 'gift', { n: 1 });                 // före connect-resultatet
  lc.startad('760000000000000001');
  await moln.tills(1, '/api/live-sessions');
  assert.equal(lc.lage(), 'waiting-start');
  lc.moln('e:2', 'gift', { n: 2 });                 // medan start-POST väntar
  assert.equal(moln.av('/api/events/tiktok/').length, 0, 'ett event passerade före accepterat start');
  slappStart();
  await moln.tills(1, '/api/events/tiktok/');
  lc.moln('e:3', 'gift', { n: 3 });                 // mitt under dräneringen
  await moln.tills(3, '/api/events/tiktok/');
  const events = moln.av('/api/events/tiktok/').map(r => JSON.parse(r.body).id);
  assert.deepEqual(events, ['e:1', 'e:2', 'e:3'], 'FIFO-ordningen bröts');
  await lc.stilla();
  assert.equal(lc.lage(), 'open', 'grinden öppnade inte när kön blev tom');
  lc.moln('e:4', 'gift', { n: 4 });                 // precis efter tom kö: direkt igenom
  await moln.tills(4, '/api/events/tiktok/');
  assert.equal(JSON.parse(moln.av('/api/events/tiktok/')[3].body).id, 'e:4');
});

test('livscykel: overflow är drop-oldest, strukturerad error EN gång plus räknare — aldrig tyst', async () => {
  const { lc, moln, logg, raknat, exits } = rigg({ buffertTak: 3 });
  let slappStart;
  moln.skript.push({ match: '/api/live-sessions', svar: () => new Promise(r => {
    slappStart = () => r({ status: 200, body: { ok: true, accepted: true } });
  }) });
  lc.startad('760000000000000001');
  await moln.tills(1, '/api/live-sessions');
  for (let i = 1; i <= 5; i++) lc.moln(`e:${i}`, 'gift', { n: i });
  slappStart();
  await lc.stilla();
  const events = moln.av('/api/events/tiktok/').map(r => JSON.parse(r.body).id);
  assert.deepEqual(events, ['e:3', 'e:4', 'e:5'], 'drop-oldest: exakt de två äldsta skulle släppas');
  const errorRader = logg.rader.filter(r => r.includes('ERROR') && r.includes('grindbuffert'));
  assert.equal(errorRader.length, 1, 'strukturerad error exakt EN gång per grindstängning');
  assert.equal(raknat.filter(n => n === 'gate-drop').length, 2, 'varje släppt event räknas');
  assert.deepEqual(exits, [], 'overflow är drop, inte fatal');
});

// ---- End-ordningen (§4) ------------------------------------------------------------------------

test('livscykel: STREAM_END stänger grinden direkt, väntar ut in-flight och skickar sedan exakt ett end', async () => {
  const { lc, moln, raknat } = rigg();
  lc.startad('760000000000000001');
  await lc.stilla();
  let slappEvent;
  moln.skript.push({ match: '/api/events/tiktok/', svar: () => new Promise(r => {
    slappEvent = () => r({ status: 200, body: { ok: true } });
  }) });
  lc.moln('e:langsam', 'gift', { n: 1 });           // startad molnpost, långsam
  await moln.tills(1, '/api/events/tiktok/');
  lc.slut('760000000000000001');
  assert.equal(lc.lage(), 'ending');
  lc.moln('e:eftersläntrare', 'gift', { n: 2 });    // efter STREAM_END: passerar aldrig
  await new Promise(r => setImmediate(r));
  assert.equal(moln.av('/api/live-sessions/end').length, 0,
    'endet skickades innan den startade molnposten avslutats');
  slappEvent();
  await moln.tills(1, '/api/live-sessions/end');
  assert.equal(moln.av('/api/events/tiktok/').length, 1, 'eftersläntraren släpptes igenom');
  assert.ok(raknat.some(n => n.includes('drop')), 'eftersläntraren räknades inte');
  lc.slut('760000000000000001');                    // dubblett-END coalescas
  await lc.stilla();
  assert.equal(moln.av('/api/live-sessions/end').length, 1, 'dubbla STREAM_END gav två end');
});

test('livscykel: snabb reconnect-start hamnar EFTER endet i kön, med senare seq', async () => {
  const { lc, moln } = rigg();
  lc.startad('760000000000000001');
  await lc.stilla();
  let slappEvent;
  moln.skript.push({ match: '/api/events/tiktok/', svar: () => new Promise(r => {
    slappEvent = () => r({ status: 200, body: { ok: true } });
  }) });
  lc.moln('e:1', 'gift', { n: 1 });
  await moln.tills(1, '/api/events/tiktok/');
  lc.slut('760000000000000001');
  lc.startad('760000000000000002');                 // reconnect INNAN dräneringen är klar
  slappEvent();
  await moln.tills(3, '/api/live-sessions');
  const liv = moln.requests.filter(r => r.url.includes('/api/live-sessions'));
  assert.ok(liv[1].url.endsWith('/end'), 'endet kom inte före det nya startet');
  assert.equal(JSON.parse(liv[1].body).seq, 2);
  assert.equal(JSON.parse(liv[2].body).roomId, '760000000000000002');
  assert.equal(JSON.parse(liv[2].body).seq, 3);
});

// ---- Fatala policies (§1) ----------------------------------------------------------------------

test('livscykel: 409 på registreringen är fail-stop — tystnad och exit 86', async () => {
  const { lc, moln, exits } = rigg();
  moln.skript.push({ match: '/api/live-runs', svar: { status: 409, body: { ok: false, error: 'avlöst' } } });
  lc.startad('760000000000000001');
  await moln.tills(1, '/api/live-runs');
  await lc.stilla();
  assert.equal(lc.lage(), 'stale');
  assert.deepEqual(exits, [L.AVLOST_EXIT], 'processen ska avslutas med AVLOST_EXIT');
  assert.equal(L.AVLOST_EXIT, 86);
  const fore = moln.requests.length;
  lc.moln('e:1', 'gift', { n: 1 });                 // efter stale: ingenting går ut
  lc.startad('760000000000000002');
  await new Promise(r => setImmediate(r));
  assert.equal(moln.requests.length, fore, 'en avlöst process fortsatte tala');
});

test('livscykel: stale:true på start är samma fail-stop', async () => {
  const { lc, moln, exits } = rigg();
  moln.skript.push({ match: '/api/live-sessions', svar: { status: 200, body: { ok: true, stale: true, skal: 'avlost-korning' } } });
  lc.startad('760000000000000001');
  await moln.tills(1, '/api/live-sessions');
  await lc.stilla();
  assert.equal(lc.lage(), 'stale');
  assert.deepEqual(exits, [L.AVLOST_EXIT]);
});

test('livscykel: 400 är fatal kontraktsdefekt — exit 65', async () => {
  const { lc, moln, exits, logg } = rigg();
  moln.skript.push({ match: '/api/live-sessions', svar: { status: 400, body: { ok: false, error: 'bridgeRunId måste vara ett uuid' } } });
  lc.startad('760000000000000001');
  await moln.tills(1, '/api/live-sessions');
  await lc.stilla();
  assert.deepEqual(exits, [L.KONTRAKT_EXIT]);
  assert.equal(L.KONTRAKT_EXIT, 65);
  assert.ok(logg.rader.some(r => r.includes('ERROR')), 'kontraktsdefekten loggades inte');
});

test('livscykel: 401 är bounded — fem försök, sedan högljutt stopp med exit 78', async () => {
  const { lc, moln, exits, logg } = rigg();
  for (let i = 0; i < 9; i++) moln.skript.push({ match: '/api/live-runs', svar: { status: 401, body: { ok: false, error: 'Ogiltig ingest-token' } } });
  lc.startad('760000000000000001');
  await lc.stilla();
  assert.equal(moln.av('/api/live-runs').length, 5, 'exakt fem försök vid 401');
  assert.deepEqual(exits, [L.KONFIG_EXIT]);
  assert.equal(L.KONFIG_EXIT, 78);
  assert.ok(logg.rader.some(r => r.includes('ERROR')), '401-stoppet var tyst');
});

// ---- Loggdisciplin -----------------------------------------------------------------------------

test('livscykel: token, Authorization och hela bodies förekommer aldrig i loggen', async () => {
  const { lc, moln, logg } = rigg();
  moln.skript.push({ match: '/api/live-runs', svar: new Error('ECONNRESET') });
  moln.skript.push({ match: '/api/live-sessions', svar: { status: 200, body: { ok: true, stale: true, skal: 'avlost-korning' } } });
  lc.startad('760000000000000001');
  await lc.stilla();
  const allt = logg.rader.join('\n');
  assert.ok(!allt.includes(TOKEN), 'token läckte i loggen');
  assert.ok(!/authorization/i.test(allt), 'Authorization-headern läckte i loggen');
  assert.ok(!allt.includes('"tiktokUsername"'), 'en hel body-JSON läckte i loggen');
});

// ---- Bryggans koppling (källkodsvakt, samma mönster som battle-probe-v3) -----------------------

test('livscykel: bridge.js kopplar slut() ENDAST i STREAM_END — paus/disconnect/misslyckad connect skapar aldrig end', () => {
  finns();
  const fs = require('node:fs'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');
  assert.ok(src.includes('livscykel'), 'bridge.js är inte kopplad till livscykel.js än');
  const slutAnrop = [...src.matchAll(/\.slut\(/g)];
  assert.equal(slutAnrop.length, 1, 'slut() ska anropas från exakt ETT ställe');
  const rad = src.slice(0, slutAnrop[0].index).split('\n').length;
  const streamEndRad = src.slice(0, src.indexOf('STREAM_END,')).split('\n').length;
  assert.ok(Math.abs(rad - streamEndRad) <= 2,
    `slut() (rad ${rad}) sitter inte i STREAM_END-hanteraren (rad ${streamEndRad})`);
  assert.ok(!/DISCONNECTED[\s\S]{0,200}\.slut\(/.test(src), 'slut() nås från DISCONNECTED');
  assert.ok(!/CONTROL_MESSAGE[\s\S]{0,400}\.slut\(/.test(src), 'slut() nås från paushanteraren');
});
