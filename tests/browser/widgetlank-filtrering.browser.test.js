'use strict';
// EN WIDGETLÄNK SKA VISA EN WIDGET.
//
// Uppmätt i produktion 2026-08-22 med en tillfällig, sedan spärrad token: en individuell
// widgetlänk renderade HELA overlayn — samma sex widgetar som hela overlay-länken, trots att
// URL:en bar rätt `widget=<id>` och att widgeten fanns.
//
// UPPMÄTT ORSAK (lokalt, tre widgetar, stubbad server — ingen produktionstoken):
//   widget=w2          vyraRenderWidgets() ger ["w2"]   duken visar w1,w2,w3
//   widget=finns-inte  vyraRenderWidgets() ger []       duken visar w1,w2,w3
//   .canvas-frame / .stage-shell  (studio.js editor())      SAKNAS
//   .workarea > .editor-toolbar   (layout-safe.js)          FINNS
//
// Filtret är alltså inte trasigt. Det blir ÖVERSKRIVET.
//
// layout-safe.js laddas villkorslöst i studio.html och ersätter den globala render():
//     var fullRender = render;
//     render = function () { if (view === 'editor') { renderSafeLayout(); return; } fullRender(); };
// och renderSafeLayout() bygger duken ur layoutItems() — state.widgets.slice(0, 30) — i stället
// för ur vyraRenderWidgets(). Parametern konsulteras aldrig.
//
// Overlay-utdata KÖR med view === 'editor'. Det är samma arkitekturfaktum som orsakade #264.
// Därför träffar overlayn layout-safe-grenen, och overlay-access.js apply() anropar root.render()
// direkt efter ögonblicksbilden — och vid VARJE konfigurationsuppdatering. Den filtrerade första
// målningen överlever alltså aldrig.
//
// Ett okänt id är det värsta fallet: i stället för en tom transparent overlay får sändningen hela
// layouten. En raderad widgetlänk blir en läcka av allt annat.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif' };

const NL = String.fromCharCode(10);

// Igenkännlig token — men PÅHITTAD. Provet får aldrig behöva en riktig produktionstoken.
const TOKEN = 'provtoken-aldrig-i-produktion-9f2c';
const OVERLAY_ID = 'OV-PROV';

const W = (id, x) => ({ id, type: 'templateTopLike', x, y: 40, width: 300, height: 220 });
// MINST TRE widgetar: med två kan ett prov vara grönt för att fel widget råkade vara den enda kvar.
const STATE_V1 = { widgets: [W('w1', 20), W('w2', 360), W('w3', 700)] };
// Version 2 lägger till en FJÄRDE. Efter en konfigurationsuppdatering utan omladdning ska
// widgetlänken fortfarande visa exakt en — inte fyra.
const STATE_V2 = { widgets: [W('w1', 20), W('w2', 360), W('w3', 700), W('w4', 1040)] };

let browser, server, bas, version = 1;
const stromsvar = [];
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u === '/api/overlay-access/' + TOKEN) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, overlay: { id: OVERLAY_ID, version,
        state: version === 1 ? STATE_V1 : STATE_V2 } }));
      return;
    }
    if (u === '/api/overlay-access/' + TOKEN + '/events/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' });
      res.write(': oppen' + NL + NL);
      stromsvar.push(res);
      return;
    }
    if (u.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return; }
    const f = path.join(ROOT, decodeURIComponent(u).replace(/^\/+/, '') || 'index.html');
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  bas = 'http://127.0.0.1:' + server.address().port;
});

test.after(async () => {
  if (skip) return;
  stromsvar.forEach(r => { try { r.end(); } catch (e) {} });
  if (browser) await browser.close();
  if (server) server.close();
});

// Skickar en handelse pa den oppna SSE-strommen, precis som servern gor.
function sandHandelse(typ, data) {
  const rad = 'event: ' + typ + NL + 'data: ' + JSON.stringify(data) + NL + NL;
  stromsvar.forEach(r => { try { r.write(rad); } catch (e) {} });
}

async function oppna(widgetId) {
  const sida = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const url = bas + '/studio.html?overlay=1&access=' + TOKEN
    + (widgetId == null ? '' : '&widget=' + encodeURIComponent(widgetId));
  await sida.goto(url, { waitUntil: 'load' });
  await sida.waitForFunction(() => document.querySelector('.canvas') != null, null, { timeout: 30000 });
  await sida.waitForTimeout(3500);
  return sida;
}

const las = sida => sida.evaluate(() => {
  const genomskinlig = f => !f || f === 'transparent' || f.indexOf('rgba(0, 0, 0, 0)') >= 0;
  const noder = [...document.querySelectorAll('.canvas [data-id]')];
  const c = document.querySelector('.canvas');
  return {
    ider: noder.map(n => n.getAttribute('data-id')),
    synliga: noder.filter(n => {
      const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
      return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
    }).map(n => n.getAttribute('data-id')),
    domd: !!document.querySelector('.widget-link-gone'),
    lankrad: !!document.querySelector('.overlay-link-bar'),
    text: (document.body.innerText || ''),
    faltvarden: [...document.querySelectorAll('input,select,textarea')].map(e => e.value || ''),
    canvasTop: c ? Math.round(c.getBoundingClientRect().top) : null,
    transparent: genomskinlig(getComputedStyle(document.body).backgroundColor)
      && genomskinlig(getComputedStyle(document.documentElement).backgroundColor),
  };
});

test('hela overlay-lanken visar ALLA aktiva widgetar', async t => {
  if (skip) return t.skip(skip);
  version = 1;
  const sida = await oppna(null);
  const m = await las(sida);
  assert.deepEqual(m.ider.slice().sort(), ['w1', 'w2', 'w3'],
    'hela overlayn ska rita alla tre — annars har filtret blivit for aggressivt');
  await sida.close();
});

test('en widgetlank visar EXAKT en widget', async t => {
  if (skip) return t.skip(skip);
  version = 1;
  const sida = await oppna('w2');
  const m = await las(sida);
  assert.deepEqual(m.ider, ['w2'],
    'widgetlanken ritade ' + m.ider.length + ' widgetar: ' + JSON.stringify(m.ider));
  await sida.close();
});

test('ovriga widgetar finns INTE i renderings-DOM — inte bara dolda', async t => {
  if (skip) return t.skip(skip);
  version = 1;
  const sida = await oppna('w2');
  const m = await las(sida);
  // Doljning racker inte: en dold widget ar fortfarande byggd, fortfarande animerad och
  // fortfarande last av allt som fragar DOM:en.
  assert.equal(m.ider.includes('w1'), false, 'w1 ligger kvar i DOM:en');
  assert.equal(m.ider.includes('w3'), false, 'w3 ligger kvar i DOM:en');
  assert.deepEqual(m.synliga, ['w2']);
  await sida.close();
});

test('okant widget-id ger TOM transparent overlay — aldrig hela layouten', async t => {
  if (skip) return t.skip(skip);
  version = 1;
  const sida = await oppna('detta-id-finns-inte');
  const m = await las(sida);
  assert.deepEqual(m.ider, [],
    'en dod widgetlank lackte hela layouten: ' + JSON.stringify(m.ider));
  assert.equal(m.transparent, true, 'bakgrunden ska vara transparent aven nar inget ritas');
  assert.equal(m.canvasTop, 0);
  await sida.close();
});

test('konfigurationsuppdatering utan omladdning behaller filtret', async t => {
  if (skip) return t.skip(skip);
  version = 1;
  const sida = await oppna('w2');
  assert.deepEqual((await las(sida)).ider, ['w2'], 'utgangslaget maste vara filtrerat');
  version = 2;                                   // servern har nu en fjarde widget
  sandHandelse('konfig', { overlayId: OVERLAY_ID, revision: 2 });
  await sida.waitForTimeout(2500);               // 400 ms hopslagning + hamtning + omritning
  const m = await las(sida);
  assert.deepEqual(m.ider, ['w2'],
    'efter konfigurationsuppdateringen ritades ' + JSON.stringify(m.ider));
  await sida.close();
});

test('live-handelse och repaint bryter inte filtret', async t => {
  if (skip) return t.skip(skip);
  version = 1;
  const sida = await oppna('w2');
  sandHandelse('live', { type: 'like', user: 'provanvandare', count: 3 });
  await sida.evaluate(() => dispatchEvent(new Event('vyra-live-repaint')));
  await sida.waitForTimeout(1500);
  const m = await las(sida);
  assert.deepEqual(m.ider, ['w2'], 'live-handelsen aterinforde ovriga widgetar');
  await sida.close();
});

test('ingen Studio-UI och ingen access-adress aterkommer i widgetlanken', async t => {
  if (skip) return t.skip(skip);
  version = 1;
  const sida = await oppna('w2');
  const m = await las(sida);
  assert.equal(m.lankrad, false, 'lankraden ar tillbaka i DOM:en');
  assert.equal(m.text.includes(TOKEN), false, 'token star i sidans text');
  assert.equal(m.text.includes('access='), false, 'adressen star i sidans text');
  assert.equal(m.faltvarden.some(v => v.includes(TOKEN) || v.includes('http')), false,
    'ett inputfalt bar adressen');
  assert.equal(m.transparent, true);
  assert.equal(m.canvasTop, 0);
  await sida.close();
});
