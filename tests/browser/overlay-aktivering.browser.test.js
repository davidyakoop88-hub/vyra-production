'use strict';
// DOLD TILLS FORSTA RIKTIGA HANDELSEN — overlay-aktivering.js, i en riktig Chrome.
//
// Davids regel (2026-10-21): ingen widget syns i OBS/overlay-utgangen forran den i den PAGAENDE
// sandningen tagit emot sin forsta riktiga handelse av ratt slag. Och nar den syns far den bara
// visa den riktiga personens namn, bild och varde — aldrig sparade exempel-, test- eller demonamn.
// I studion syns allt som forut. Egen text/bild/video ar undantag (streamerns eget innehall).
//
// RIGGEN ar samma som nollstallning-vid-ny-sandning: repot serveras, och det en OBS-lank lever pa
// harmas — bootstrap (med sandningens session), SSE-strommen och malsnapshotet. Allt daremellan ar
// produktionskod: handelsen gar genom live-client.js ingest() precis som i sandningen.
//
// Webblasaren startas med { aktivering: true }: utan det far sidan provriggens utvag (se
// tests/helpers/webblasare.js) och visar allt, och provet hade matt ingenting.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

const TOKEN = 'provtoken-aktivering';
const OVERLAY_ID = 'OV-AKT';
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const BILDER = path.join(process.env.VYRA_AKTIVERAD_BILDER || '', '');

const NYCKLAR = [...new Set(
  fs.readFileSync(path.join(ROOT, 'docs/katalogkarta.md'), 'utf8')
    .match(/catalog:[A-Za-z0-9:._-]+/g) || [])].sort();
// Boxgame-klockan (2026-10-25) är streamerns egen rond, ingen händelse: den står i OBS från början.
const UNDANTAG = new Set(['templateCustomText', 'templateCustomImage', 'templateCustomVideo', 'templateBoxgameClock', 'templateSocialAlert']);

function rigg() {
  const lada = { version: 1, state: { widgets: [] }, session: undefined, hamtningar: 0 };
  const strommar = [];
  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u === `/api/overlay-access/${TOKEN}`) {
      lada.hamtningar += 1;
      const kropp = { ok: true, overlay: { id: OVERLAY_ID, version: lada.version, state: lada.state } };
      if (lada.session !== undefined) kropp.session = lada.session;
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(kropp));
      return;
    }
    if (u === `/api/overlay-access/${TOKEN}/goals`) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, goals: [] }));
      return;
    }
    if (u === `/api/overlay-access/${TOKEN}/events/stream`) {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
      res.write(': hej\n\n');
      strommar.push(res);
      req.on('close', () => { const i = strommar.indexOf(res); if (i !== -1) strommar.splice(i, 1); });
      return;
    }
    const rel = decodeURIComponent(u).replace(/^\/+/, '') || 'index.html';
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  let strom = 0;
  const ram = (namn, data) => {
    strom += 1;
    for (const s of strommar) s.write(`id: ${strom}-0\nevent: ${namn}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const sandning = (handelse, sessionId) => ram('live', { type: 'livesession', event: handelse,
    eventId: handelse + ':' + sessionId, sessionId,
    [handelse === 'live:start' ? 'startedAt' : 'endedAt']: new Date().toISOString() });
  let nasta = 0;
  const live = (handelse) => { nasta += 1; ram('live', { id: 'akt-' + Date.now() + '-' + nasta, at: Date.now(), ...handelse }) };
  return { server, lada, sandning, live, strommar };
}

// Samma matt som overlay-dolda-widgetar: storlek, inte display:none/visibility:hidden uppat,
// arvd opacity > 0.02 och nagot som faktiskt malas.
const MATT = `(() => {
  const malar = e => {
    const cs = getComputedStyle(e);
    return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none'
      || ['IMG', 'CANVAS', 'VIDEO', 'svg', 'SVG'].includes(e.tagName)
      || [...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())
      || cs.boxShadow !== 'none' || cs.borderTopWidth !== '0px';
  };
  const synlig = e => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    let o = 1;
    for (let n = e; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      o *= parseFloat(cs.opacity);
    }
    return o > 0.02 && malar(e);
  };
  window.__synliga = id => {
    const box = document.querySelector('.canvas [data-id="' + id + '"]') || document.querySelector('[data-id="' + id + '"]');
    if (!box) return -1;
    return [box, ...box.querySelectorAll('*')].filter(synlig).length;
  };
  // Det publiken SER: text och bilder i synliga element.
  window.__syns = id => {
    const box = document.querySelector('.canvas [data-id="' + id + '"]') || document.querySelector('[data-id="' + id + '"]');
    if (!box) return null;
    const alla = [box, ...box.querySelectorAll('*')].filter(synlig);
    const text = alla.map(e => [...e.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent).join(' ')).join(' ').replace(/\\s+/g, ' ').trim();
    const bilder = alla.filter(e => e.tagName === 'IMG').map(e => e.getAttribute('src') || '');
    return { text, bilder };
  };
  return true;
})()`;

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
  if (r) {
    for (const s of r.strommar.slice()) { try { s.end() } catch (e) {} }
    await new Promise(res => r.server.close(res));
  }
});

async function vantaPa(villkor, meddelande, { timeout = 15000, intervall = 60 } = {}) {
  const slut = Date.now() + timeout;
  while (Date.now() < slut) {
    if (await villkor()) return;
    await new Promise(res => setTimeout(res, intervall));
  }
  throw new assert.AssertionError({ message: meddelande + ' (inom ' + timeout + ' ms)', actual: false, expected: true, operator: '==' });
}

// En sida i en given kontext. Kontexten ar "OBS-kallans profil": localStorage delas mellan sidor i
// samma kontext precis som mellan omladdningar av samma webblasarkalla.
async function oppna(kontext, url = `/studio.html?overlay=1&access=${TOKEN}`) {
  const sida = await kontext.newPage();
  sida.__fel = [];
  sida.on('pageerror', e => sida.__fel.push(String(e && e.message).slice(0, 160)));
  // domcontentloaded, inte load: med hela katalogen (173 widgetar, videor och bilder) under en
  // parallell svit kan 'load' ta over 30 s utan att nagot ar fel. Villkoren nedan ar det som vantas pa.
  await sida.goto(`${bas}${url}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sida.waitForFunction(() => typeof render === 'function' && !!window.VyraWidgets, null, { timeout: 60000 });
  if (url.includes('access=')) {
    await sida.waitForFunction(() => !!document.querySelector('[data-id]'), null, { timeout: 30000 });
    await sida.waitForFunction(() => document.documentElement.dataset.overlayConnection === 'connected', null, { timeout: 30000 });
  }
  await sida.waitForFunction(() => !!window.VyraDoldaWidgetar, null, { timeout: 30000 });
  await sida.waitForTimeout(1500);
  await sida.evaluate(MATT);
  return sida;
}
const synliga = (sida, id) => sida.evaluate(i => window.__synliga(i), id);
const syns = (sida, id) => sida.evaluate(i => window.__syns(i), id);
async function bild(sida, namn) {
  if (!process.env.VYRA_AKTIVERAD_BILDER) return;
  await sida.screenshot({ path: path.join(BILDER, namn), omitBackground: true });
}

const prov = (namn, fn) => test('aktivering: ' + namn, { skip, timeout: 240000 }, fn);

// Widgetar som fabriken skapar dem, med fasta id:n.
async function skapa(sida, lista) {
  return sida.evaluate(l => l.map(([nyckel, id, x, y, over]) => {
    const w = window.VyraWidgets.create(nyckel);
    return Object.assign(JSON.parse(JSON.stringify(w)), { id, x, y }, over || {});
  }), lista);
}

// ---- 1. INGENTING SYNS UTAN HANDELSER ---------------------------------------------------------
prov('varje katalognyckel ar osynlig i overlay utan handelser (utom egen text/bild/video)', async () => {
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const bygg = await oppna(kontext, '/studio.html?overlay=1');
    const widgets = await skapa(bygg, NYCKLAR.map((k, i) => [k, 'k' + i, 20 + (i % 6) * 200, 20 + (Math.floor(i / 6) % 3) * 220]));
    await bygg.close();
    r.lada.version = 1; r.lada.state = { widgets }; r.lada.session = { sessionId: S1, startedAt: new Date().toISOString() };
    const sida = await oppna(kontext);
    await sida.waitForTimeout(1500);
    const lack = [], undantagSyns = [];
    for (const w of widgets) {
      const n = await synliga(sida, w.id);
      if (UNDANTAG.has(w.type)) { if (w.type === 'templateCustomText') undantagSyns.push(n > 0); continue }
      if (n > 0) lack.push(`${w.createdFrom || w.id} (${w.type}): ${n} synliga element`);
    }
    await bild(sida, 'fore-hela-katalogen.png');
    assert.deepEqual(lack, [], `${lack.length} av ${widgets.length} widgetar syns i overlay utan en enda handelse:\n  ` + lack.join('\n  '));
    assert.ok(undantagSyns[0] === true, 'egen text ska synas som forut (bild och video utan kalla malar ingenting): ' + JSON.stringify(undantagSyns));
    assert.deepEqual(sida.__fel, []);
  } finally { await kontext.close() }
});

// ---- 2. RATT HANDELSE AKTIVERAR, FEL HANDELSE INTE, OCH BARA RIKTIG DATA SYNS ------------------
const DEMO = /streamqueen|testalpha|thundergifter|heartriser|aurora vale|\balex\b|\bmia\b|\bleo\b|\bsara\b|\bzoe\b|\bemma\b|\bnoah\b|\bsofia\b|\bliam\b|\bella\b|testgifter|testuser|test-profile|@vakt|exempel/i;

prov('en gava aktiverar Top Coins och Top Gift men inte Top Likes; en like tvartom; dold forblir dold', async () => {
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const bygg = await oppna(kontext, '/studio.html?overlay=1');
    const widgets = await skapa(bygg, [
      ['catalog:ranking:templateTopCoins:voltage', 'tc', 20, 20],
      ['catalog:toplike:voltage', 'tl', 340, 20],
      ['catalog:topgift:premium:neon', 'tg', 660, 20],
      ['catalog:socialgoal:followers:crown-orbit:circle', 'sg', 980, 20],
      ['catalog:custom:text', 'ct', 20, 420],
      ['catalog:ranking:templateTopCoins:basic-v2', 'th', 340, 420, { hidden: true }],
    ]);
    await bygg.close();
    r.lada.version = 1; r.lada.state = { widgets }; r.lada.session = { sessionId: S1, startedAt: new Date().toISOString() };
    const sida = await oppna(kontext);
    await bild(sida, 'fore-topplistor.png');
    for (const id of ['tc', 'tl', 'tg', 'sg', 'th']) assert.equal(await synliga(sida, id), 0, id + ' syns fore forsta handelsen');
    assert.ok(await synliga(sida, 'ct') > 0, 'egen text ska synas utan handelser');

    // En like: Top Likes, inte Top Coins/Top Gift.
    r.live({ type: 'like', username: 'riktig_gillare', name: 'Riktig Gillare', count: 5,
      profileImage: 'assets/images/hero-creator.png' });
    await vantaPa(async () => await synliga(sida, 'tl') > 0, 'en like aktiverade inte Top Likes');
    await sida.waitForTimeout(400);
    assert.equal(await synliga(sida, 'tc'), 0, 'en like aktiverade Top Coins');
    assert.equal(await synliga(sida, 'tg'), 0, 'en like aktiverade Top Gift');

    // En gava: Top Coins och Top Gift.
    r.live({ type: 'gift', username: 'riktig_givare', name: 'Riktig Givare', giftName: 'Rose', giftId: 5655,
      coins: 1, diamondCount: 1, count: 1, repeatEnd: true, profileImage: 'assets/images/hero-creator.png' });
    await vantaPa(async () => await synliga(sida, 'tc') > 0 && await synliga(sida, 'tg') > 0, 'en gava aktiverade inte Top Coins/Top Gift');
    await sida.waitForTimeout(1500);
    assert.equal(await synliga(sida, 'sg'), 0, 'en gava aktiverade folj-malet');
    assert.equal(await synliga(sida, 'th'), 0, 'en dold widget syns efter aktiveringen');
    await bild(sida, 'efter-topplistor.png');

    // Bara riktig data: inga exempel-, test- eller demonamn och inga reservbilder for personer.
    for (const id of ['tc', 'tl', 'tg']) {
      const s = await syns(sida, id);
      assert.doesNotMatch(s.text, DEMO, `${id} visar ett exempelnamn efter aktiveringen: "${s.text}"`);
      assert.ok(!s.bilder.some(b => DEMO.test(b)), `${id} visar en reservbild: ${JSON.stringify(s.bilder)}`);
    }
    assert.match((await syns(sida, 'tc')).text, /Riktig Givare|riktig_givare/, 'Top Coins visar inte givaren');
    assert.doesNotMatch((await syns(sida, 'tc')).text, /Riktig Gillare/, 'Top Coins visar en gillare');
    assert.match((await syns(sida, 'tl')).text, /Riktig Gillare|riktig_gillare/, 'Top Likes visar inte gillaren');
    assert.match((await syns(sida, 'tg')).text, /Riktig Givare|riktig_givare/, 'Top Gift visar inte givaren');

    // ---- OMLADDNING I SAMMA SANDNING: aktiveringen star kvar ------------------------------------
    // a) OBS "Uppdatera" = samma flik laddas om.
    await sida.reload({ waitUntil: 'load' });
    await sida.waitForFunction(() => !!window.VyraDoldaWidgetar && !!document.querySelector('[data-id]'), null, { timeout: 30000 });
    await sida.evaluate(MATT);
    for (const id of ['tc', 'tl', 'tg']) {
      await vantaPa(async () => await synliga(sida, id) > 0, id + ' blev dold igen efter en omladdning i samma sandning');
    }
    assert.equal(await synliga(sida, 'sg'), 0);
    assert.equal(await synliga(sida, 'th'), 0);
    await sida.close();
    // b) OBS river och aterskapar kallan (scenbyte, omstart): ny flik, samma profil. Aktiveringen
    // ligger i localStorage och overlever. (Topplistornas raknare ligger i sessionStorage och ar en
    // separat fraga for live-domanen; tomma listor doljs av vyra-tom-widget.js.)
    const igen = await oppna(kontext);
    const lage = await igen.evaluate(() => window.VyraAktivering.lage());
    assert.equal(lage.session, S1);
    for (const id of ['tc', 'tl', 'tg']) assert.ok(lage.ids.includes(id), id + ' tappade aktiveringen nar kallan aterskapades: ' + JSON.stringify(lage));
    assert.ok(!lage.ids.includes('sg'));

    // ---- NY SANDNING: allt ar dolt igen -----------------------------------------------------
    r.sandning('live:start', S2);
    await igen.waitForFunction(id => window.VyraLiveSession.runtime().aktivSession() === id, S2, { timeout: 30000 });
    await igen.waitForTimeout(1200);
    for (const id of ['tc', 'tl', 'tg', 'sg', 'th']) assert.equal(await synliga(igen, id), 0, id + ' syns efter live:start utan ny handelse');
    assert.ok(await synliga(igen, 'ct') > 0, 'egen text forsvann vid live:start');
    assert.deepEqual(igen.__fel, []);
    await igen.close();
  } finally { await kontext.close() }
});

// ---- 3. TESTHANDELSER AKTIVERAR INTE ----------------------------------------------------------
prov('serverns testevent och simulerade event aktiverar inte (exempelnamn far aldrig synas i sandningen)', async () => {
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const bygg = await oppna(kontext, '/studio.html?overlay=1');
    const widgets = await skapa(bygg, [['catalog:ranking:templateTopCoins:voltage', 'tc', 20, 20]]);
    await bygg.close();
    r.lada.version = 1; r.lada.state = { widgets }; r.lada.session = { sessionId: S1, startedAt: new Date().toISOString() };
    const sida = await oppna(kontext);
    // Formen POST /api/test/event bygger (server/index.js buildTestEvent): id `test-<uuid>`.
    for (const s of r.strommar) s.write(`id: t1-0\nevent: live\ndata: ${JSON.stringify({ id: 'test-0b6f', type: 'gift', username: 'TestGifter', coins: 1, count: 1, at: Date.now() })}\n\n`);
    await sida.evaluate(() => window.VyraLive.ingest({ id: 'sim-1', type: 'gift', username: 'TestGifter', coins: 1, count: 1, __simulerad: true }));
    await sida.waitForTimeout(1200);
    assert.equal(await synliga(sida, 'tc'), 0, 'ett testevent aktiverade Top Coins');
  } finally { await kontext.close() }
});

// ---- 4. STUDION VISAR ALLT SOM FORUT ----------------------------------------------------------
prov('studions editor visar widgetarna utan handelser', async () => {
  const kontext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  try {
    const sida = await oppna(kontext, '/studio.html?open=layout');
    await sida.evaluate(() => { view = 'editor'; render() });
    const ids = await sida.evaluate(() => {
      state.widgets.length = 0;
      ['catalog:ranking:templateTopCoins:voltage', 'catalog:topgift:premium:neon', 'catalog:pggoal:1'].forEach((k, i) => {
        const w = window.VyraWidgets.create(k); w.x = 20 + i * 140; w.y = 20; state.widgets.push(w);
      });
      render();
      return state.widgets.map(w => w.id);
    });
    await sida.waitForTimeout(800);
    await sida.evaluate(MATT);
    for (const id of ids) assert.ok(await synliga(sida, id) > 0, id + ' syns inte i studion');
    assert.equal(await sida.evaluate(() => window.VyraAktivering && window.VyraAktivering.aktiv), false);
  } finally { await kontext.close() }
});

// ---- 5. ▶ TESTA WIDGET I OBS - BARA NAR INGEN SANDNING PAGAR ----------------------------------
// Servern publicerar `event: testspel` (server/goal-sse.js) bara nar den vet att ingen sandning
// pagar. Har provas overlayns halva: ramen spelas med motorns klon pa widgetens plats, stoppas av
// ett stoppbesked, aktiverar ingenting, ror inga livedata - och spelas inte alls under en sandning.
// Och studions halva: beskedet skickas bara nar ingen sandning pagar, och ■ Stoppa skickar stopp.
const testspelRam = (d) => { for (const s of r.strommar) s.write(`event: testspel\ndata: ${JSON.stringify(d)}\n\n`) };
const klonSyns = (sida, id) => synliga(sida, id + '__prov');

prov('testspel i OBS: spelas med exempeldata, aktiverar inget och overlayn ar dold igen efterat', async () => {
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const bygg = await oppna(kontext, '/studio.html?overlay=1');
    const widgets = await skapa(bygg, [['catalog:topgift:premium:neon', 'tg', 60, 60]]);
    await bygg.close();
    r.lada.version = 1; r.lada.state = { widgets }; r.lada.session = null;
    const sida = await oppna(kontext);
    assert.equal(await synliga(sida, 'tg'), 0, 'Top Gift syns fore testet');
    testspelRam({ atgard: 'spela', widgetId: 'tg', typ: null, spelId: 'p1' });
    await vantaPa(async () => await klonSyns(sida, 'tg') > 0, 'testet spelades aldrig i overlayn');
    await bild(sida, 'testspel-i-obs.png');
    assert.equal((await sida.evaluate(() => window.VyraTestspel.status())).aktiv, true);
    await vantaPa(async () => await klonSyns(sida, 'tg') === -1, 'testet avslutades aldrig i overlayn', { timeout: 40000 });
    const efter = await sida.evaluate(() => ({
      status: window.VyraTestspel.status(), ids: window.VyraAktivering.lage().ids,
      topp: window.VyraLeaderboard ? window.VyraLeaderboard.getTop('diamonds', 5).length : 0,
      liveEvent: localStorage.getItem('vyra-live-event'),
    }));
    assert.equal(efter.status.senaste && efter.status.senaste.orsak, 'klar');
    assert.deepEqual(efter.status.senaste.brott, [], 'testet forsokte na en forbjuden vag');
    assert.deepEqual(efter.ids, [], 'testet raknades som aktivering');
    assert.equal(efter.topp, 0, 'testet hamnade i topplistan');
    assert.equal(efter.liveEvent, null, 'testet sparades som livehandelse');
    assert.equal(await synliga(sida, 'tg'), 0, 'Top Gift syns efter testet utan en riktig handelse');

    // ■ Stoppa i studion stoppar aven i overlayn.
    testspelRam({ atgard: 'spela', widgetId: 'tg', typ: null, spelId: 'p2' });
    await vantaPa(async () => await klonSyns(sida, 'tg') > 0, 'andra testet spelades aldrig');
    testspelRam({ atgard: 'stoppa', widgetId: 'tg', typ: null, spelId: 'p2' });
    await vantaPa(async () => await klonSyns(sida, 'tg') === -1, 'stoppbeskedet stoppade inte testet i overlayn', { timeout: 3000 });
    assert.equal(await sida.evaluate(() => window.VyraTestspel.status().senaste.orsak), 'studion');
    assert.deepEqual(sida.__fel, []);
  } finally { await kontext.close() }
});

prov('testspel i OBS: under en pagaende sandning spelas ingenting i overlayn', async () => {
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const bygg = await oppna(kontext, '/studio.html?overlay=1');
    const widgets = await skapa(bygg, [['catalog:topgift:premium:neon', 'tg', 60, 60]]);
    await bygg.close();
    r.lada.version = 1; r.lada.state = { widgets }; r.lada.session = { sessionId: S1, startedAt: new Date().toISOString() };
    const sida = await oppna(kontext);
    await sida.waitForFunction(id => window.VyraLiveSession.runtime().aktivSession() === id, S1, { timeout: 30000 });
    testspelRam({ atgard: 'spela', widgetId: 'tg', typ: null, spelId: 'p3' });
    await sida.waitForTimeout(1500);
    assert.equal(await klonSyns(sida, 'tg'), -1, 'testet spelades i overlayn under en sandning');
    assert.equal(await synliga(sida, 'tg'), 0);
  } finally { await kontext.close() }
});

prov('testspel i studion: skickar till OBS bara nar ingen sandning pagar, och ■ Stoppa skickar stopp', async () => {
  const kontext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  try {
    const sida = await oppna(kontext, '/studio.html?open=layout');
    await sida.waitForFunction(() => !!window.VyraOverlayTestspel && !!window.VyraTestspel, null, { timeout: 30000 });
    const forbered = () => sida.evaluate(() => {
      view = 'editor';
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:topgift:premium:neon'); w.x = 40; w.y = 40;
      state.widgets.push(w); selected = w.id; render();
      window.__anrop = [];
      window.VyraAuth = window.VyraAuth || {};
      window.VyraAuth.lastDetail = () => ({ workspaces: [{ id: '00000000-0000-4000-8000-000000000001' }] });
      // Webblaget utan sandning (riggens localhost ser ut som skrivbordsappen, som saknar testvag).
      window.VyraLive.tillstand = () => ({ lage: 'webb', connector: 'väntar', live: 'inte aktiv' });
      window.VyraAuth.api = async (url, opt) => { window.__anrop.push([url, JSON.parse(opt.body)]); return { ok: true, lage: 'inte-live' }; };
      return w.id;
    });
    const rad = () => sida.evaluate(() => document.querySelector('[data-testspel] .pr-testspel-obs')?.textContent || null);

    // Inte live: testet gar till OBS.
    let id = await forbered();
    await sida.waitForTimeout(400);
    assert.equal(await sida.evaluate(i => window.VyraTestspel.spela(liveWidget(i)), id), true, 'testet startade inte i studion');
    await vantaPa(async () => (await sida.evaluate(() => window.__anrop.length)) > 0, 'inget testbesked skickades');
    let anrop = await sida.evaluate(() => window.__anrop);
    assert.match(anrop[0][0], /\/api\/workspaces\/[0-9a-f-]+\/testspel$/);
    assert.equal(anrop[0][1].atgard, 'spela');
    assert.equal(anrop[0][1].widgetId, id);
    await vantaPa(async () => (await rad()) === 'Visas även i OBS', 'raden "Visas även i OBS" visades inte');
    await sida.evaluate(() => window.VyraTestspel.stoppa());
    await vantaPa(async () => (await sida.evaluate(() => window.__anrop.length)) > 1, 'stoppet skickades aldrig till OBS');
    anrop = await sida.evaluate(() => window.__anrop);
    assert.equal(anrop[1][1].atgard, 'stoppa');

    // Live: inget skickas, raden sager det.
    id = await forbered();
    await sida.evaluate(() => {
      const rt = window.VyraLiveSession.runtime();
      window.VyraLiveSession.runtime = () => Object.assign({}, rt, { aktivSession: () => '11111111-1111-4111-8111-111111111111' });
    });
    await sida.waitForTimeout(400);
    assert.equal(await sida.evaluate(i => window.VyraTestspel.spela(liveWidget(i)), id), true);
    await sida.waitForTimeout(800);
    assert.equal(await rad(), 'Visas bara här – du är live');
    assert.deepEqual(await sida.evaluate(() => window.__anrop), [], 'ett testbesked skickades under en sandning');
    await sida.evaluate(() => window.VyraTestspel.stoppa());

    // Okant lage (ingen arbetsyta, ingen sandning): testet stannar i studion, men raden pastar inte
    // att du ar live (slutrundan 2026-10-21 - raden sade "du är live" i en studio utan sandning).
    id = await forbered();
    await sida.evaluate(() => {
      const rt = window.VyraLiveSession.runtime();
      window.VyraLiveSession.runtime = () => Object.assign({}, rt, { aktivSession: () => null });
      window.VyraAuth.lastDetail = () => ({});
    });
    await sida.waitForTimeout(400);
    assert.equal(await sida.evaluate(i => window.VyraTestspel.spela(liveWidget(i)), id), true);
    await sida.waitForTimeout(800);
    assert.equal(await rad(), 'Visas bara här i studion');
    assert.deepEqual(await sida.evaluate(() => window.__anrop), [], 'ett testbesked skickades utan arbetsyta');
    await sida.evaluate(() => window.VyraTestspel.stoppa());
  } finally { await kontext.close() }
});

// ---- 6. TESTHANDELSER RAKNAS ALDRIG I SANDNINGENS TOPPLISTOR -----------------------------------
// En aktiverad topplista far inte fa en TestGifter-rad bredvid den riktiga personen.
prov('testhandelser hamnar aldrig i topplistor, Top Gift eller MVP i overlay', async () => {
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const bygg = await oppna(kontext, '/studio.html?overlay=1');
    const widgets = await skapa(bygg, [
      ['catalog:ranking:templateTopCoins:voltage', 'tc', 20, 20],
      ['catalog:topgift:premium:neon', 'tg', 340, 20],
    ]);
    await bygg.close();
    r.lada.version = 1; r.lada.state = { widgets }; r.lada.session = { sessionId: S1, startedAt: new Date().toISOString() };
    const sida = await oppna(kontext);
    r.live({ type: 'gift', username: 'riktig_givare', name: 'Riktig Givare', giftName: 'Rose', giftId: 5655,
      coins: 1, diamondCount: 1, count: 1, repeatEnd: true, profileImage: 'assets/images/hero-creator.png' });
    await vantaPa(async () => await synliga(sida, 'tc') > 0, 'den riktiga gavan aktiverade inte Top Coins');
    // Serverns testevent (POST /api/test/event: id test-<uuid>) och simulatorns, med STORRE varde.
    for (const s of r.strommar) s.write(`id: t9-0\nevent: live\ndata: ${JSON.stringify({ id: 'test-9a1c', type: 'gift', username: 'TestGifter', name: 'TestGifter', giftName: 'Lion', coins: 29999, diamondCount: 29999, count: 1, repeatEnd: true, at: Date.now() })}\n\n`);
    await sida.evaluate(() => window.VyraLive.ingest({ id: 'sim-9', type: 'gift', username: 'SimGivare', name: 'SimGivare', giftName: 'Lion', coins: 29999, diamondCount: 29999, count: 1, repeatEnd: true, __simulerad: true }));
    await sida.evaluate(() => window.VyraLive.ingest({ id: 'knapp-9', type: 'like', username: 'KnappGillare', count: 50, __test: true }));
    await sida.waitForTimeout(1800);
    const topp = await sida.evaluate(() => window.VyraLeaderboard.getTop('diamonds', 10).map(p => p.name || p.username));
    assert.deepEqual(topp, ['Riktig Givare'], 'en testhandelse hamnade i sandningens topplista: ' + JSON.stringify(topp));
    for (const id of ['tc', 'tg']) {
      const s = await syns(sida, id);
      assert.doesNotMatch(s.text, /TestGifter|SimGivare|KnappGillare/, `${id} visar en testperson: "${s.text}"`);
    }
    assert.match((await syns(sida, 'tg')).text, /Riktig Givare/, 'Top Gift tappade den riktiga givaren');
    assert.deepEqual(sida.__fel, []);
  } finally { await kontext.close() }
});

// ---- 7. TOPPLISTAN OVERLEVER EN ATERSKAPAD OBS-KALLA -------------------------------------------
prov('aterskapad OBS-kalla mitt i sandningen: topplistan och widgeten star kvar', async () => {
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const bygg = await oppna(kontext, '/studio.html?overlay=1');
    const widgets = await skapa(bygg, [
      ['catalog:ranking:templateTopCoins:voltage', 'tc', 20, 20],
      ['catalog:topgift:premium:neon', 'tg', 340, 20],
    ]);
    await bygg.close();
    r.lada.version = 1; r.lada.state = { widgets }; r.lada.session = { sessionId: S1, startedAt: new Date().toISOString() };
    const sida = await oppna(kontext);
    r.live({ type: 'gift', username: 'riktig_givare', name: 'Riktig Givare', giftName: 'Rose', giftId: 5655,
      coins: 5, diamondCount: 5, count: 1, repeatEnd: true, profileImage: 'assets/images/hero-creator.png' });
    await vantaPa(async () => await synliga(sida, 'tc') > 0 && await synliga(sida, 'tg') > 0, 'gavan aktiverade inte');
    await sida.waitForTimeout(1500);              // tickern skriver ogonblicksbilden en gang i sekunden
    await sida.close();
    // Ny flik i samma profil = OBS har rivit och aterskapat kallan. sessionStorage ar tomt.
    const ny = await oppna(kontext);
    assert.equal(await ny.evaluate(() => sessionStorage.getItem('vyra-leaderboard-stream-v1')), null, 'riggen aterskapade inte kallan');
    for (const id of ['tc', 'tg']) {
      await vantaPa(async () => await synliga(ny, id) > 0, id + ' forsvann nar kallan aterskapades');
      await vantaPa(async () => /Riktig Givare/.test((await syns(ny, id)).text), id + ' tappade sandningens givare nar kallan aterskapades');
    }
    // Och ny sandning tommer den ocksa.
    r.sandning('live:start', S2);
    await ny.waitForFunction(id => window.VyraLiveSession.runtime().aktivSession() === id, S2, { timeout: 30000 });
    await ny.waitForTimeout(1200);
    assert.deepEqual(await ny.evaluate(() => window.VyraLeaderboard.getTop('diamonds', 5)), []);
    for (const id of ['tc', 'tg']) assert.equal(await synliga(ny, id), 0, id + ' syns efter live:start');
    await ny.close();
  } finally { await kontext.close() }
});

// ---- 8. STUDIONS PANEL SAGER NAR WIDGETEN BORJAR SYNAS -----------------------------------------
prov('panelen i studion: "Syns i sändningen först när …" i Innehåll', async () => {
  const kontext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  try {
    const sida = await oppna(kontext, '/studio.html?open=layout');
    const rad = async (nyckel) => {
      await sida.evaluate(k => {
        view = 'editor'; state.widgets.length = 0;
        const w = window.VyraWidgets.create(k); w.x = 40; w.y = 40; state.widgets.push(w); selected = w.id; render();
      }, nyckel);
      await sida.waitForTimeout(500);
      return sida.evaluate(() => document.querySelector('.properties [data-aktivering-rad]')?.textContent || null);
    };
    assert.equal(await rad('catalog:topgift:premium:neon'), 'Syns i sändningen först när första gåvan kommer.');
    assert.equal(await rad('catalog:toplike:voltage'), 'Syns i sändningen först när första liken kommer.');
    assert.equal(await rad('catalog:custom:text'), null, 'egen text har ingen aktivering');
  } finally { await kontext.close() }
});
