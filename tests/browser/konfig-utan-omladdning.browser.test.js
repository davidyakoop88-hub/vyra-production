'use strict';
// KONFIGURATION UTAN OMLADDNING — de tre sakerna David bad om, mätta samtidigt i en riktig Chrome.
//
//   1. designen ändras utan att OBS-källan laddas om
//   2. räknaren behåller EXAKT samma värde genom omritningen
//   3. bara den valda overlayn reagerar
//
// Riggen serverar repot och härmar de två slutpunkter en OBS-länk lever på:
// `/api/overlay-access/{token}` (konfigurationen) och `.../events/stream` (SSE). Strömmen hålls
// öppen så att provet kan skicka in ett `konfig`-besked precis som servern gör efter en sparning.
// Allt däremellan är PRODUKTIONSKOD: overlay-access.js, overlay-config-sync.js, session-state.js
// och render().
//
// Punkt 2 är den som kan gå sönder på riktigt. `apply()` anropar `render()`, och en omritning som
// bygger widgetarnas DOM på nytt skulle slå tillbaka en räknare till konfigurationens värde —
// alltså noll — mitt i en sändning. Provet sätter därför ett live-värde via samma väg som en
// riktig like och kräver att siffran står kvar EFTER omritningen.
//
// TRE MÄTFEL PÅ VÄGEN, alla hittade genom att mäta i stället för att anta:
//   · `title` renderas inte i widgetens DOM — texten syntes bara i länkradens rullgardin.
//   · `width` respekteras inte av den här mallen: satt till 320 renderades den 220 px bred.
//   · "högsta siffran i widgeten" plockade upp radnumren 1–5 och rapporterade 5 innan något hänt.
// Designändringen mäts därför som POSITION, och räknaren läses på sin EGEN rad.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif' };

const TOKEN = 'provtoken';
const OVERLAY_ID = 'OV-1';
const X_FORE = 40, X_EFTER = 420;

const widget = (x) => ({ id: 'w1', type: 'templateTopLike', x, y: 40, width: 320, height: 240 });

function rigg() {
  const lada = { version: 1, state: { widgets: [widget(X_FORE)] } };
  const strommar = [];

  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];

    if (u === `/api/overlay-access/${TOKEN}`) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true,
        overlay: { id: OVERLAY_ID, version: lada.version, state: lada.state } }));
      return;
    }
    if (u === `/api/overlay-access/${TOKEN}/events/stream`) {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
      res.write(': hej\n\n');
      strommar.push(res);
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

  // Härmar servern efter en sparning: höj versionen, byt state, publicera TECKNET.
  const besked = (id, revision) => {
    for (const s of strommar) {
      s.write(`event: konfig\ndata: ${JSON.stringify({ overlayId: id, revision })}\n\n`);
    }
  };
  const spara = (nyttState) => {
    lada.version += 1;
    lada.state = nyttState;
    besked(OVERLAY_ID, lada.version);
    return lada.version;
  };
  const sparaAnnan = () => besked('OV-ANNAN', 999);

  return { server, lada, spara, sparaAnnan, strommar };
}

let browser, r, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  r = rigg();
  await new Promise(res => r.server.listen(0, '127.0.0.1', res));
  bas = `http://127.0.0.1:${r.server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (r) {
    for (const s of r.strommar) { try { s.end() } catch (e) {} }
    await new Promise(res => r.server.close(res));
  }
});

// Mätfunktionerna installeras INNE i sidan en gång, så provet slipper skicka regexar genom flera
// escaping-lager — den vägen har redan kostat två trasiga filer den här kvällen.
async function installeraMatare(sida) {
  await sida.evaluate(() => {
    const box = () => document.querySelector('[data-id]');
    const HJARTA = String.fromCharCode(9829);
    window.__provX = () => {
      const el = box();
      return el ? Math.round(parseFloat(el.style.left || '0') || 0) : -1;
    };
    window.__provRaknare = () => {
      const el = box();
      if (!el) return 0;
      const rader = (el.innerText || '').split(String.fromCharCode(10));
      const rad = rader.find(r => r.indexOf(HJARTA) >= 0);
      if (!rad) return 0;
      // Tal formateras med tusenmellanslag ("44 999"), så mellanslag måste rymmas — men bara på
      // raden. En match över hela innerText svalde nästa radnummer och gav tal som 122.
      const bara = rad.split(HJARTA).join(' ');
      const m = bara.match(/[0-9][0-9  ]*/);
      return m ? Number(m[0].replace(/[\s ]/g, '')) : 0;
    };
  });
}

async function oppna() {
  const sida = await browser.newPage({ viewport: { width: 1280, height: 720 },
    reducedMotion: 'no-preference' });
  sida.__fel = [];
  sida.on('pageerror', e => sida.__fel.push(String(e && e.message).slice(0, 120)));
  await sida.goto(`${bas}/studio.html?overlay=1&access=${TOKEN}`, { waitUntil: 'load' });
  await sida.waitForFunction(() => !!document.querySelector('[data-id]'), null, { timeout: 30000 });
  await sida.waitForFunction(
    () => document.documentElement.dataset.overlayConnection === 'connected',
    null, { timeout: 30000 });
  await installeraMatare(sida);
  return sida;
}

test('designen ändras utan omladdning, räknaren står kvar, och bara rätt overlay reagerar',
  { skip, timeout: 120000 }, async () => {
  const sida = await oppna();
  try {
    const laddadEn = await sida.evaluate(() => performance.getEntriesByType('navigation').length);

    const xFore = await sida.evaluate(() => window.__provX());
    assert.equal(xFore, X_FORE,
      `startdesignen star pa x=${xFore}, vantade ${X_FORE} — riggen ar fel, inte koden`);

    // ---- Ett live-värde, samma väg som en riktig like ---------------------------------------
    await sida.evaluate(() => {
      for (const n of [3, 4, 5]) window.VyraLive?.ingest?.(
        { type: 'like', username: 'Provaren', name: 'Provaren', likes: n });
    });
    // VÄNTA UT SIFFRAN, inte en fast tid: topplistan målar på egen kadens, uppmätt över 1,5 s.
    await sida.waitForFunction(() => window.__provRaknare() > 0, null, { timeout: 20000 });
    const fore = await sida.evaluate(() => window.__provRaknare());
    assert.ok(fore > 0,
      'raknaren star pa noll innan omritningen, sa provet hade inte kunnat upptacka en '
      + 'nollstallning — punkt 2 hade da varit gron utan att bevisa nagot');

    // ---- Ett besked för en ANNAN overlay: ingenting ska hända -------------------------------
    r.sparaAnnan();
    await sida.waitForTimeout(1500);
    assert.equal(await sida.evaluate(() => window.__provX()), X_FORE,
      'en ANNAN overlays sparning ritade om den har scenen — fel scen reagerade');

    // ---- Sparning på RÄTT overlay ------------------------------------------------------------
    //
    // SAMPLA HELA ÖVERGÅNGEN, inte bara slutläget. Ett prov som läser en gång efter att designen
    // bytt missar ett glapp — och det fanns ett: uppmätt 2026-08-22 kom widgeten upp med sina
    // DEMOSIFFROR (Alex 98,7K, Mia 82,4K …) vid 439 ms och fick tillbaka live-värdet först vid
    // 990 ms. En halv sekund med påhittade tal i OBS vid varje ändring. Orsaken var att
    // topplistan målar en gång per sekund, så en nybyggd widget stod kvar med sin demo tills
    // tickern gick. `vyra-live-repaint` ber live-lagren måla om genast efter varje applicering.
    await sida.evaluate(() => {
      window.__provSpar = [];
      window.__provTimer = setInterval(() => {
        try { window.__provSpar.push(window.__provRaknare()) } catch (e) {}
      }, 50);
    });
    r.spara({ widgets: [widget(X_EFTER)] });
    await sida.waitForFunction((mal) => window.__provX() === mal, X_EFTER, { timeout: 20000 });
    await sida.waitForTimeout(1200);   // ta med tiden EFTER bytet, dar glappet låg
    const sedda = await sida.evaluate(() => {
      clearInterval(window.__provTimer);
      return [...new Set(window.__provSpar)];
    });
    assert.deepEqual(sedda, [fore],
      `under omritningen visade widgeten ${JSON.stringify(sedda)} — den ska stå orörd på ${fore} `
      + 'hela vägen. Ett annat värde här är demosiffror eller en nollställning, och det är siffror '
      + 'tittarna ser i sändningen');

    // 1 · ingen omladdning
    assert.equal(await sida.evaluate(() => performance.getEntriesByType('navigation').length),
      laddadEn, 'sidan laddades om. Hela poangen ar att OBS-kallan INTE ska behova laddas om');

    // 2 · räknaren står kvar, exakt
    const efter = await sida.evaluate(() => window.__provRaknare());
    // Rätexten foljer med i beskedet. Ett prov som bara sager "12 blev 98" tvingar nasta lasare att
    // aterskapa hela lopet for att se VAD som stod pa skarmen.
    const ratext = await sida.evaluate(
      () => (document.querySelector('[data-id]') || {}).innerText || '(ingen widget)');
    assert.equal(efter, fore, `raknaren gick fran ${fore} till ${efter}. Widgeten visade: `
      + JSON.stringify(ratext) + ' · ');
    assert.equal(efter, fore,
      `raknaren gick fran ${fore} till ${efter} nar designen byttes. En omritning mitt i en `
      + 'sandning far inte sla tillbaka ett live-varde — det ar siffran tittarna redan sett');

    assert.deepEqual(sida.__fel, [], 'sidan kastade under omritningen');
  } finally { await sida.close() }
});

test('efter ett nätavbrott hämtas den ändring som gjordes medan strömmen låg nere',
  { skip, timeout: 120000 }, async () => {
  // DET HAR AR DEN ENDA VAGEN TILLBAKA. Konfigbeskedet bar med flit ingen `id:`-rad och ligger
  // darfor inte i Last-Event-ID-historiken — ett besked som skickas medan strommen ar nere kommer
  // ALDRIG igen. Sparar agaren nagot precis da, och klienten inte fragar sjalv vid ateranslutning,
  // star OBS kvar med en gammal design resten av sandningen utan att nagon forstar varfor.
  // RIGGEN AR DELAD MELLAN PROVEN. Forsta provet lamnar lādan pa X_EFTER, sa utan den har
  // nollstallningen laser det har provet in 420 som startlage och mater sedan att 420 blir 420 —
  // gront utan att nagot bevisats. Uppmatt: det fallde direkt pa startpastaendet, vilket var
  // billigare an att vara gront av fel skal.
  r.lada.version += 1;
  r.lada.state = { widgets: [widget(X_FORE)] };

  const sida = await oppna();
  try {
    assert.equal(await sida.evaluate(() => window.__provX()), X_FORE,
      'startlaget ar inte X_FORE — riggens lada nollstalldes inte mellan proven');

    // VANTA UT DEN ANDRA MONTERINGEN FORST. overlay-access.js kor `mount()` bade direkt och via
    // `setTimeout(mount, 1200)`, sa viewern hamtar konfigurationen tva ganger vid start. Utan den
    // har vantan hann den andra hamtningen plocka upp andringen, och provet blev GRONT AVEN NAR
    // ateranslutningsfragan var bortmuterad — alltsa ett prov som bevisade ingenting.
    await sida.waitForTimeout(2500);

    // Klipp stromen. EventSource ateransluter av sig sjalv.
    for (const s of r.strommar) { try { s.end() } catch (e) {} }
    r.strommar.length = 0;
    await sida.waitForFunction(
      () => document.documentElement.dataset.overlayConnection === 'reconnecting',
      null, { timeout: 20000 });

    // Andringen sker MEDAN det ar nere — beskedet nar aldrig fram.
    r.lada.version += 1;
    r.lada.state = { widgets: [widget(X_EFTER)] };

    // Nar strommen kommer tillbaka ska klienten fraga sjalv.
    await sida.waitForFunction((mal) => window.__provX() === mal, X_EFTER, { timeout: 40000 });
    assert.deepEqual(sida.__fel, [], 'sidan kastade under ateranslutningen');
  } finally { await sida.close() }
});
