'use strict';
// HJÄRTAN & MOLN I OBS-UTGÅNGEN — hjartmoln.js i en riktig Chrome (OBS webbläsarkälla är Chromium).
//
// Riggen är densamma som overlay-aktiveringens: repot serveras, och det en OBS-länk lever på härmas —
// bootstrap, SSE-strömmen och målsnapshotet. Händelserna går genom live-client.js ingest() precis
// som i en sändning. Inget når en riktig sändning.
//
// Det som provas är det publiken ser:
//   · ingenting målas innan en händelse — och lådan är genomskinlig, ingen bakgrund;
//   · en färsk like startar klippet, och bilden har RIKTIG alfa (genomskinligt runt molnet, täckt i
//     molnet) — en svart eller grå ruta hade fallit här;
//   · videon börjar inte om när overlayn ritas om, och den pausas när det blivit tyst;
//   · historik (gamla likes), fel slag (gåva när läget är likes) och dolda widgetar startar ingenting;
//   · läget "Hela tiden" syns direkt utan händelse;
//   · profilhjärtan kommer bara från tittare med profilbild.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const TOKEN = 'provtoken-hjartmoln';
const S1 = '33333333-3333-4333-8333-333333333333';

function rigg() {
  const lada = { version: 1, state: { widgets: [] }, session: { sessionId: S1, startedAt: new Date().toISOString() } };
  const strommar = [];
  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u === `/api/overlay-access/${TOKEN}`) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, overlay: { id: 'OV-HM', version: lada.version, state: lada.state }, session: lada.session }));
      return;
    }
    if (u === `/api/overlay-access/${TOKEN}/goals`) {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true,"goals":[]}'); return;
    }
    if (u === `/api/overlay-access/${TOKEN}/events/stream`) {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
      res.write(': hej\n\n'); strommar.push(res);
      req.on('close', () => { const i = strommar.indexOf(res); if (i !== -1) strommar.splice(i, 1); });
      return;
    }
    const rel = decodeURIComponent(u).replace(/^\/+/, '') || 'index.html';
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  let strom = 0, nasta = 0;
  const live = (handelse) => {
    strom += 1; nasta += 1;
    const data = { id: 'hm-' + Date.now() + '-' + nasta, at: Date.now(), ...handelse };
    for (const s of strommar) s.write(`id: ${strom}-0\nevent: live\ndata: ${JSON.stringify(data)}\n\n`);
  };
  return { server, lada, live, strommar };
}

let browser, r, bas;
const skip = hoppaOver();
test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare({ aktivering: true });
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  r = rigg();
  await new Promise(res => r.server.listen(0, '127.0.0.1', res));
  bas = `http://127.0.0.1:${r.server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (r) { for (const s of r.strommar.slice()) { try { s.end() } catch (e) {} } await new Promise(res => r.server.close(res)); }
});

async function vantaPa(sida, fn, arg, meddelande, timeout = 15000) {
  try { await sida.waitForFunction(fn, arg, { timeout, polling: 60 }); }
  catch (e) { throw new assert.AssertionError({ message: meddelande, actual: false, expected: true, operator: '==' }); }
}

// Bygger widgetar med fabriken i en studioflik och öppnar sedan OBS-länken med dem.
async function overlay(lista) {
  const kontext = await browser.newContext({ viewport: { width: 432, height: 768 } });
  const bygg = await kontext.newPage();
  await bygg.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await bygg.waitForFunction(() => !!window.VyraWidgets && !!window.VyraHjartMoln, null, { timeout: 60000 });
  const widgets = await bygg.evaluate(l => l.map(([nyckel, id, over]) =>
    Object.assign(JSON.parse(JSON.stringify(window.VyraWidgets.create(nyckel))), { id }, over || {})), lista);
  await bygg.close();
  r.lada.version += 1; r.lada.state = { widgets };
  const sida = await kontext.newPage();
  sida.__fel = [];
  sida.on('pageerror', e => sida.__fel.push(String(e && e.message).slice(0, 160)));
  await sida.goto(`${bas}/studio.html?overlay=1&access=${TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sida.waitForFunction(() => document.documentElement.dataset.overlayConnection === 'connected', null, { timeout: 60000 });
  await sida.waitForFunction(() => !!document.querySelector('.vyra-hjartmoln') && !!window.VyraHjartMoln, null, { timeout: 30000 });
  await sida.waitForTimeout(800);
  return { kontext, sida };
}
const lage = (sida, id) => sida.evaluate(i => {
  const rot = document.querySelector(`.vyra-hjartmoln[data-id="${i}"]`);
  const v = rot && rot.querySelector('video');
  return rot && { pa: rot.classList.contains('hm-pa'), opacitet: +getComputedStyle(rot.querySelector('.hm-vard')).opacity,
    video: !!v, spelar: !!v && !v.paused, t: v ? v.currentTime : 0, src: v ? v.getAttribute('src') : '', bg: getComputedStyle(rot).backgroundColor,
    portratt: rot.querySelectorAll('.hm-ph').length, portrattSrc: [...rot.querySelectorAll('.hm-ph img')].map(b => b.getAttribute('src')) };
}, id);

// Alfa i det som faktiskt målas: skärmdump utan bakgrund, PNG-avkodad i sidan själv.
async function alfa(sida) {
  const png = await sida.screenshot({ omitBackground: true });
  return sida.evaluate(async b64 => {
    const bild = new Image(); bild.src = 'data:image/png;base64,' + b64; await bild.decode();
    const c = document.createElement('canvas'); c.width = bild.width; c.height = bild.height;
    const x = c.getContext('2d'); x.drawImage(bild, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let noll = 0, tackt = 0, delvis = 0;
    for (let i = 3; i < d.length; i += 4) { if (d[i] === 0) noll++; else if (d[i] > 230) tackt++; else delvis++; }
    const n = d.length / 4, horn = [d[3], d[(c.width - 1) * 4 + 3], d[(c.height - 1) * c.width * 4 + 3], d[d.length - 1]];
    return { genomskinligt: noll / n, tackt: tackt / n, delvis: delvis / n, horn };
  }, png.toString('base64'));
}

const prov = (namn, fn) => test('hjärtan & moln: ' + namn, { skip, timeout: 180000 }, fn);

prov('genomskinlig i vila, en färsk like startar klippet med riktig alfa, och det pausas när det blir tyst', async () => {
  const { kontext, sida } = await overlay([['catalog:heartcloud:glodande', 'hm1', { hmHall: 3 }]]);
  try {
    const fore = await lage(sida, 'hm1');
    assert.equal(fore.pa, false); assert.equal(fore.opacitet, 0, 'effekten syns innan någon tappat');
    assert.equal(fore.bg, 'rgba(0, 0, 0, 0)', 'lådan har en bakgrund — OBS-källan blir inte genomskinlig');
    assert.match(fore.src, /assets\/videos\/hjartmoln\/glodande\.webm$/, 'overlayn ska ha transparent WebM, inte MP4');
    const tom = await alfa(sida);
    assert.ok(tom.genomskinligt > 0.999, `något målas i vila: ${JSON.stringify(tom)}`);

    r.live({ type: 'like', username: 'tittare_ett', count: 5 });
    await vantaPa(sida, () => { const v = document.querySelector('.vyra-hjartmoln video'); return v && !v.paused && v.currentTime > 0.6 && document.querySelector('.vyra-hjartmoln.hm-pa'); }, null, 'en färsk like startade inte klippet');
    await sida.waitForTimeout(700);
    const a = await alfa(sida);
    assert.ok(a.genomskinligt > 0.35, `för lite genomskinligt — rutan runt molnet syns: ${JSON.stringify(a)}`);
    assert.ok(a.tackt > 0.01, `molnet målas inte täckt: ${JSON.stringify(a)}`);
    assert.deepEqual(a.horn, [0, 0, 0, 0], 'hörnen är inte genomskinliga');

    // Overlayn ritar om: samma videonod, tiden fortsätter, ingen paus.
    const t0 = (await lage(sida, 'hm1')).t;
    await sida.evaluate(() => { window.__hmNod = document.querySelector('.vyra-hjartmoln video'); render(); render(); });
    await sida.waitForTimeout(400);
    const efter = await sida.evaluate(() => { const v = document.querySelector('.vyra-hjartmoln video'); return { samma: v === window.__hmNod, spelar: !v.paused, t: v.currentTime }; });
    assert.ok(efter.samma, 'render() byggde en ny videonod — klippet börjar om vid varje omritning');
    assert.ok(efter.spelar && efter.t > t0, `videon stannade eller hoppade vid omritning: ${JSON.stringify({ t0, efter })}`);

    await vantaPa(sida, () => { const v = document.querySelector('.vyra-hjartmoln video'); return v && v.paused && !document.querySelector('.vyra-hjartmoln.hm-pa'); }, null, 'effekten pausades inte när det blev tyst', 12000);
    assert.deepEqual(sida.__fel, []);
  } finally { await kontext.close(); }
});

prov('historik, fel slag och dolda widgetar startar ingenting — rätt slag gör det', async () => {
  const { kontext, sida } = await overlay([
    ['catalog:heartcloud:hjartmoln', 'likes'],
    ['catalog:heartcloud:kristall', 'gavor', { hmLage: 'gavor' }],
    ['catalog:heartcloud:blixt', 'dold', { hidden: true }],
    ['catalog:heartcloud:levande', 'minst', { hmMinLikes: 20 }]
  ]);
  try {
    r.live({ type: 'like', username: 'gammal', count: 50, at: Date.now() - 60000 });
    await sida.waitForTimeout(1200);
    for (const id of ['likes', 'gavor', 'dold', 'minst']) assert.equal((await lage(sida, id)).pa, false, `${id} startade av en gammal like`);

    r.live({ type: 'gift', username: 'givare', giftName: 'Rose', count: 1, diamondCount: 1 });
    await vantaPa(sida, () => !!document.querySelector('.vyra-hjartmoln[data-id="gavor"].hm-pa'), null, 'gåvoläget startade inte på en gåva');
    assert.equal((await lage(sida, 'likes')).pa, false, 'likesläget startade på en gåva');

    r.live({ type: 'like', username: 'tappare', count: 5 });
    await vantaPa(sida, () => !!document.querySelector('.vyra-hjartmoln[data-id="likes"].hm-pa'), null, 'likesläget startade inte på en like');
    assert.equal((await lage(sida, 'dold')).spelar, false, 'en dold widget spelar i OBS');
    assert.equal((await lage(sida, 'minst')).pa, false, 'ett paket under minsta antal likes startade effekten');
    r.live({ type: 'like', username: 'tappare2', count: 25 });
    await vantaPa(sida, () => !!document.querySelector('.vyra-hjartmoln[data-id="minst"].hm-pa'), null, 'ett paket över minsta antal startade inte');
    assert.deepEqual(sida.__fel, []);
  } finally { await kontext.close(); }
});

prov('"Hela tiden" syns direkt, och profilhjärtan kommer bara från tittare med bild', async () => {
  const { kontext, sida } = await overlay([
    ['catalog:heartcloud:organiskt', 'alltid', { hmLage: 'alltid' }],
    ['catalog:heartcloud:profilhjartan', 'profil']
  ]);
  try {
    await vantaPa(sida, () => { const v = document.querySelector('.vyra-hjartmoln[data-id="alltid"] video'); return v && !v.paused && v.currentTime > 0.3; }, null, '"Hela tiden" spelar inte utan händelse');
    const a = await lage(sida, 'alltid');
    assert.ok(a.pa && a.opacitet > 0.9, `"Hela tiden" syns inte: ${JSON.stringify(a)}`);
    assert.match((await lage(sida, 'profil')).src, /organiskt\.webm$/, 'profilhjärtan ska ligga på det organiska molnet');

    r.live({ type: 'like', username: 'utan_bild', count: 3 });
    await vantaPa(sida, () => !!document.querySelector('.vyra-hjartmoln[data-id="profil"].hm-pa'), null, 'profilhjärtan startade inte');
    assert.equal((await lage(sida, 'profil')).portratt, 0, 'ett porträtt ritades för en tittare utan profilbild');
    r.live({ type: 'like', username: 'med_bild', count: 3, profileImage: '/assets/images/test-profile.svg' });
    await vantaPa(sida, () => document.querySelectorAll('.vyra-hjartmoln[data-id="profil"] .hm-ph img').length > 0, null, 'tittarens profilbild föll inte ur molnet');
    assert.deepEqual((await lage(sida, 'profil')).portrattSrc, ['/assets/images/test-profile.svg']);
    await vantaPa(sida, () => document.querySelectorAll('.vyra-hjartmoln[data-id="profil"] .hm-ph').length === 0, null, 'porträttet togs inte bort efter fallet', 6000);
    assert.deepEqual(sida.__fel, []);
  } finally { await kontext.close(); }
});
