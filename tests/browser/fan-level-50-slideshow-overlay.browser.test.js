'use strict';
// FAN LEVEL 50 — SLIDESHOWEN SKA BYTA KORT I EN RIKTIG OVERLAY (LIVE 2026-10-17).
//
// DAVIDS ORD: "när man har den på rullande band funkar [den], men när den är på slideshow funkar
// [den] inte."
//
// UPPMATT 2026-10-18 i overlay.html?access=… med aktiv sandning och tre level-50-fans pa SSE:
// slideshowen stod pa forsta fanet i 10 s med bytestid 2 s — i alla fall (1/2/3 fans, med och utan
// konfig-omritning var 300 ms, med klientklockan +20 s). Bandet ar ren CSS och paverkades inte.
// Orsaken: swap() laste `root.state`, men `state` ar en const i studio.js och hamnar aldrig pa
// window. Listan var tom och motorn gjorde ingenting.
//
// Provet kor den riktiga vagen: overlay.html -> studio.html?overlay=1&access=…, sessionen fran
// bootstrapsvaret, fansen som bryggans `live`-ramar pa SSE, och en `konfig`-storm som ritar om hela
// overlayn mitt i kortbytena.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const TOKEN = 'fl50tok';
const OVERLAY_ID = 'OV-FL50';

function rigg(mode) {
  const lada = { version: 1, state: { widgets: [{ id: 'fl', type: 'templateFanLevel50', x: 40, y: 40, width: 300,
    fanl50Mode: mode, fanl50Source: 'both', fanl50Design: 'alla', fanl50Interval: 2 }] },
    session: { sessionId: '11111111-1111-4111-8111-111111111111', startedAt: new Date().toISOString() } };
  const strommar = [];
  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u === `/api/overlay-access/${TOKEN}`) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, overlay: { id: OVERLAY_ID, version: lada.version, state: lada.state }, session: lada.session }));
      return;
    }
    if (u === `/api/overlay-access/${TOKEN}/events/stream`) {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
      res.write(': hej\n\n'); strommar.push(res); return;
    }
    const rel = decodeURIComponent(u).replace(/^\/+/, '') || 'index.html';
    if (rel.startsWith('api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{}'); return; }
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  let n = 0;
  const live = ev => { n += 1; for (const s of strommar) s.write(`id: ${n}-0\nevent: live\ndata: ${JSON.stringify(ev)}\n\n`); };
  const konfig = () => { lada.version += 1; for (const s of strommar) s.write(`event: konfig\ndata: ${JSON.stringify({ overlayId: OVERLAY_ID, revision: lada.version })}\n\n`); };
  return { server, strommar, live, konfig };
}

const skip = hoppaOver();
let browser;
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('hittade en webblasare men kunde inte starta den'); });
test.after(async () => { if (browser) await browser.close(); });

async function kor({ mode, fans, konfigMs = 0, ritaOm = false, klockaMs = 0, sekunder = 9 }) {
  const r = rigg(mode);
  await new Promise(res => r.server.listen(0, '127.0.0.1', res));
  const sida = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
  const fel = []; sida.on('pageerror', e => fel.push(String(e && e.message).slice(0, 160)));
  let timer = null;
  try {
    await sida.addInitScript(k => { try { localStorage.clear() } catch (_) {} if (k) { const o = Date.now; Date.now = () => o() + k; } }, klockaMs);
    await sida.goto(`http://127.0.0.1:${r.server.address().port}/overlay.html?access=${TOKEN}`, { waitUntil: 'load' });
    await sida.waitForFunction(() => document.documentElement.dataset.overlayConnection === 'connected', null, { timeout: 60000 });
    await sida.waitForFunction(() => !!(window.VyraTomWidget && VyraTomWidget.aktivSession()), null, { timeout: 30000 });
    for (let i = 0; i < fans; i++) {
      r.live({ id: 9000 + i, type: 'chat', username: 'fan' + i, nickname: 'Fan ' + i, profileImage: '', comment: 'hej',
        teamLevel: 50, fanLevelUp: { from: 49, to: 50 }, timestamp: Date.now() });
    }
    if (fans) await sida.waitForFunction(n => window.VyraFanLevel50.roster().length === n, fans, { timeout: 15000 });
    // addAuto ritar om via en 300 ms-debounce (schedule()). Utan den har vantan samplade riggen den
    // gamla, dolda ritningen och foll aven for bandet — det var riggen, inte livevagen (uppmatt
    // 2026-10-18: prov 1 dolt, prov 2 och framat synligt).
    if (fans) await sida.waitForFunction(() => { const b = document.querySelector('[data-id="fl"]'); return !!b && getComputedStyle(b).display !== 'none' && !!b.querySelector('.fl50-card'); }, null, { timeout: 15000 });
    if (konfigMs) timer = setInterval(() => r.konfig(), konfigMs);
    const prov = [];
    for (let t = 0; t < sekunder * 4; t++) {
      await sida.waitForTimeout(250);
      // Direkt omritning var 250 ms: landar garanterat inne i fl50-out-fasen (420 ms) av varje byte.
      // Konfigstormen ensam racker inte — synken slar ihop tata ramar, och var 300:e ms ritade den
      // aldrig om (uppmatt: samma kortnod efter 1,5 s), var 700:e ms gjorde den det.
      if (ritaOm) await sida.evaluate(() => { const fore = document.querySelector('[data-id="fl"] .fl50-card'); render(); if (document.querySelector('[data-id="fl"] .fl50-card') === fore) throw new Error('render() byggde inte om kortet'); });
      prov.push(await sida.evaluate(() => {
        const b = document.querySelector('[data-id="fl"]');
        const c = b && b.querySelector('.fl50-card');
        return { syns: !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 0,
          band: b ? [...b.querySelectorAll('.fl50-track .fl50-name span')].map(s => s.textContent) : [],
          namn: c ? (c.querySelector('.fl50-name span') || {}).textContent : null,
          opacitet: c ? Number(getComputedStyle(c).opacity) : null,
          ute: !!c && c.classList.contains('fl50-out') };
      }));
    }
    if (timer) clearInterval(timer);
    // Efter stormen: slideshowen fortsatter byta, sa ett enskilt prov kan landa mitt i en overgang
    // (fl50-out 420 ms + fl50-in 500 ms). Ett kort som INTE fastnat nar opacity 1 inom ett bytesvarv.
    const slut = await sida.waitForFunction(() => { const c = document.querySelector('[data-id="fl"] .fl50-card'); return !!c && !c.classList.contains('fl50-out') && Number(getComputedStyle(c).opacity) === 1; }, null, { timeout: 2500, polling: 50 })
      .then(() => 1, async () => sida.evaluate(() => { const c = document.querySelector('[data-id="fl"] .fl50-card'); return c ? c.className + ' opacity ' + getComputedStyle(c).opacity : null; }));
    return { prov, slut, fel };
  } finally {
    if (timer) clearInterval(timer);
    await sida.close();
    for (const s of r.strommar) { try { s.end() } catch (_) {} }
    await new Promise(res => r.server.close(res));
  }
}

const namnSedda = prov => [...new Set(prov.map(p => p.namn).filter(Boolean))];

test('slideshow i overlay: tre fans byts, med och utan omritning mitt i bytet', { skip, timeout: 240000 }, async () => {
  for (const fall of [{ konfigMs: 0 }, { ritaOm: true }, { konfigMs: 300 }, { konfigMs: 700, klockaMs: 20000 }]) {
    const { prov, slut, fel } = await kor({ mode: 'slideshow', fans: 3, ...fall });
    assert.deepEqual(fel, [], `sidfel i ${JSON.stringify(fall)}`);
    assert.ok(prov.every(p => p.syns), `widgeten doldes i ${JSON.stringify(fall)}`);
    const sedda = namnSedda(prov);
    assert.deepEqual(sedda.sort(), ['fan0', 'fan1', 'fan2'],
      `slideshowen visade bara ${JSON.stringify(sedda)} pa 9 s med bytestid 2 s i ${JSON.stringify(fall)} — motorn byter inte kort`);
    // fl50-out varar 420 ms; fler an 4 prov i rad (1 s) betyder att kortet fastnat ute.
    let rad = 0, langst = 0; for (const p of prov) { rad = p.ute ? rad + 1 : 0; langst = Math.max(langst, rad); }
    assert.ok(langst <= 4, `kortet stod i fl50-out ${langst * 250} ms i ${JSON.stringify(fall)}`);
    assert.equal(slut, 1, `kortet fastnade osynligt (${slut}) efter omritningarna i ${JSON.stringify(fall)}`);
  }
});

test('slideshow i overlay: noll fans dold, ett fan syns och star still', { skip, timeout: 120000 }, async () => {
  const tom = await kor({ mode: 'slideshow', fans: 0, sekunder: 3 });
  assert.ok(tom.prov.every(p => !p.syns), 'tom roster i sandning ska ge en dold widget, inte demot');
  const en = await kor({ mode: 'slideshow', fans: 1, sekunder: 5 });
  assert.ok(en.prov.every(p => p.syns && p.namn === 'fan0' && p.opacitet === 1), 'ett fan ska synas hela tiden');
});

test('band i overlay: samma tre fans syns (kontroll)', { skip, timeout: 120000 }, async () => {
  const { prov } = await kor({ mode: 'band', fans: 3, sekunder: 2 });
  assert.ok(prov.every(p => p.syns), 'bandet ska synas');
  // Bandet ritar listan tva ganger (somlos loop): alla tre fans, tva varv.
  assert.ok(prov.every(p => JSON.stringify(p.band) === JSON.stringify(['fan0', 'fan1', 'fan2', 'fan0', 'fan1', 'fan2'])),
    `bandet ska bara alla tre fans: ${JSON.stringify(prov[0].band)}`);
});
