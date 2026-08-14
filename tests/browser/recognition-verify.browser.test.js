'use strict';
// Kor recognition-systemets EGEN verifieringssvit i CI.
//
// Varfor den ligger har: recognition-* ar ~7 661 rader (controller, merge, normalizer, queue,
// rules, runtime, types, card, card-mapper + premium-widget-core) med en egen svit pa 3 184
// rader och 262 fall — men den var INTE kopplad till CI, bara till recognition-verify.html som
// ingen kor automatiskt. Uppmatt 2026-08-14: 262/262 godkanda, alltsa inte ruttnad. Nu ska den
// forbli det, for `widget-fas.js` lanar tre saker ur den koden (scheduleTimer + generation,
// klassvokabularen anticipation/reveal/settled/exit, och timing-formen).
//
// Provet later ANTALET vaxa men aldrig krympa: golvet fangar fall som tyst forsvinner, och
// likhetskravet fangar fall som borjar falla.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json' };

const GOLV = 262;   // uppmatt 2026-08-14

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let server, browser, bas;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) { skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)'; return }
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function kor() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const sidfel = [];
  page.on('pageerror', e => sidfel.push(e.message));
  await page.goto(`${bas}/recognition-verify.html`, { waitUntil: 'load' });

  // Sviten skriver "N / M fall godkanda" nar den ar klar. Vanta pa den raden i stallet for
  // en fast sovtid — nagra fall ar avsiktligt fordrojda (runDeferredCase).
  await page.waitForFunction(
    () => /\d+\s*\/\s*\d+\s+fall godk/i.test(document.body.innerText),
    null, { timeout: 60000, polling: 200 });

  const m = await page.evaluate(() => {
    const t = document.body.innerText;
    const sum = t.match(/(\d+)\s*\/\s*(\d+)\s+fall godk/i);
    return {
      godkanda: sum ? +sum[1] : -1,
      totalt: sum ? +sum[2] : -1,
      pass: (t.match(/\bPASS\b/g) || []).length,
      fail: (t.match(/\bFAIL\b/g) || []).length,
      felrader: t.split('\n').filter(l => /\bFAIL\b/.test(l)).slice(0, 5),
    };
  });
  await page.close();
  return { ...m, sidfel };
}

test('recognition-sviten: alla fall godkanda', { skip }, async () => {
  const r = await kor();
  assert.ok(r.totalt > 0, 'hittade ingen sammanfattningsrad — sviten kordes aldrig klart');
  assert.equal(r.fail, 0, `${r.fail} fall foll:\n  ${r.felrader.join('\n  ')}`);
  assert.equal(r.godkanda, r.totalt,
    `${r.godkanda} av ${r.totalt} godkanda`);
});

test('recognition-sviten: inga fall har forsvunnit', { skip }, async () => {
  const r = await kor();
  assert.ok(r.totalt >= GOLV,
    `sviten kor ${r.totalt} fall, golvet ar ${GOLV} — fall har tagits bort eller hoppas over`);
});

test('recognition-sviten: inga oupptackta sidfel', { skip }, async () => {
  const r = await kor();
  // favicon-404 raknas inte som sidfel (pageerror), sa listan ska vara helt tom
  assert.deepEqual(r.sidfel, [], 'ohanterade fel under korningen');
});
