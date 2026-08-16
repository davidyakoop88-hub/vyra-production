'use strict';
// Gifter Level Up · modell `number` — fyrafaskoreografi. Prov 14a-14g, skrivna FORE koden.
//
// Egen fil per modell: stack 8, reveal 9, sidebadge 10, flip 11, duo 12, profile 13 — number 14.
// De generella vakterna G1-G3 ligger i gifter-fas-generella.browser.test.js och loopar over
// modelltabellen; de far number pa kopet nar posten laggs till.
//
// PREMISS: "RAKNEVERKET". Number ar den siffercentrerade modellen — .gifter-big-level ar 88x68
// och sitter INUTI orbiten. Och siffrans forvandling ar REDAN koreograferad, i JS, sedan lange:
//
//   gifterTransform (media.js:589), XFORM_GAMMAL 450 / XFORM_BURST 300 / XFORM_TOTAL 1250
//     0-450 ms    .gifter-xform-old    gamla siffran star kvar, dampad — tittaren ser VAD den
//                                      byts fran
//     450-750     .gifter-xform-burst  burst
//     750         siffran byts MITT I bursten, nar den ar som ljusast — bytet ses aldrig som
//                                      ett hopp
//     750-1250    .gifter-xform-new    gifter-land .5s
//
// Koreografin ska INTE duplicera den utan rama in den. Tiderna mots exakt: fas 1 ar 0-500 ms,
// alltsa nastan precis den gamla siffrans egen beat, och bytet vid 750 ms ligger 250 ms in i
// fas 2 = 27,78 % av 900. Monteringen av resten borjar dar.
//
// DARFOR AR NUMBER DEN ENDA MODELLEN VARS FAS 1 INTE AR EN TOM SCEN. Den gamla siffran och
// ringen ar redan dar; de ar sjalva anticipationen. Prov 14f vaktar exakt det.
//
// TRE MATNINGAR SOM PROVEN AR BYGGDA RUNT:
//
//   1. `.gifter-orbit img` ar SLACKT i number (studio.css). Ankaret maste darfor vara
//      `.gifter-bottom-profile img` — synlig 42x42, och number ar ENDA modellen dar
//      .gifter-bottom-profile inte ar display:none. Prov G1 faller annars.
//
//   2. decodeTimeoutMs 900, inte 500. Bottenavataren ar modellens enda portratt och ar SISTA
//      beaten i monteringen; en oavkodad bild ger en tom cirkel i klimax. Ett tak pa 500 kan
//      dessutom aldrig bli bindande mot en ljusfas pa 500, sa grinden hade varit en no-op och
//      prov G3 hade hoppat over modellen helt.
//      KAND INTERAKTION: med ett bindande tak kan fas 2 skjutas fram till som mest 900 ms medan
//      gifterTransform gar pa sin EGEN klocka och byter siffra vid 750. Vid en mycket langsam
//      bild sker bytet alltsa strax fore monteringen i stallet for samtidigt. Det ar acceptabelt
//      — siffran ar anda synlig hela tiden — men det ar darfor 14f mater bytet relativt
//      FASBYTET och inte relativt triggern.
//
//   3. Inget att neutralisera. Som profile har number ingen konkurrerande entre. Det enda
//      rorliga i basdesignen ar de tva omarkta <b>-gnistorna i orbiten (heartSpark 1.5s
//      infinite) — de ror vi inte.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64');

function servera() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === 'bild.png') {
      const ms = Number(url.searchParams.get('ms')) || 0;
      if (url.searchParams.get('fel') === '1') {
        setTimeout(() => { res.writeHead(404); res.end('nej') }, ms);
        return;
      }
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
        res.end(PIXEL);
      }, ms);
      return;
    }
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

const MODELL = 'number';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
// Taktningen inuti fas 2, ur den godkanda fastabellen.
const TAKT = { bytetVid: 250, vagAFran: 250, vagATill: 630, vagBFran: 405, vagBTill: 860 };
// Delarna som INTE far synas forran siffran har bytts.
const MONTERAS = ['.gifter-diamond-row', 'h2', '.gifter-level-badge', 'h3', 'p',
                  '.gifter-bottom-profile'];
const SAKNAS = `Star "${MODELL}" i modelltabellen MODELLER i gifter-fas.js?`;

async function studion() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const varningar = [];
  page.on('console', m => { if (m.type() === 'warning') varningar.push(m.text()) });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(3000);   // kowrapparna installeras vid 500/2200 ms
  page._varningar = varningar;
  return page;
}

async function korNumber(page, { gifterDuration = 2, bildSrc = null, ocksaFan = false } = {}) {
  return page.evaluate(async (arg) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + arg.modell);
    g.x = 40; g.y = 40; g.gifterDuration = arg.gifterDuration;
    state.widgets.push(g);
    let fan = null;
    if (arg.ocksaFan) {
      fan = window.VyraWidgets.create('catalog:fanlevel:layout:duo');
      fan.x = 420; fan.y = 40; fan.fanDuration = 1;
      state.widgets.push(fan);
    }
    selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: arg.modell + ' renderades inte' };

    /* Ankaret i number ar bottenavataren, inte orbitbilden — orbitbilden ar display:none har. */
    const bild = box.querySelector('.gifter-bottom-profile img');
    if (arg.bildSrc) {
      if (!bild) return { fel: 'ingen bild i .gifter-bottom-profile' };
      bild.src = arg.bildSrc;
    }

    const logg = [];
    const t0 = performance.now();
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.attributeName !== 'data-fas') continue;
        const f = box.getAttribute('data-fas');
        if (f) logg.push({ fas: f, vid: Math.round(performance.now() - t0) });
      }
    }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12, fromLevel: 11 });
    if (fan) window.triggerFanLevelUp({ __test: true, name: 'FanProv', level: 9 });

    let fanVid = null;
    const slut = arg.gifterDuration * 1000 + 6000;
    const start = performance.now();
    while (performance.now() - start < slut) {
      if (fan && fanVid === null) {
        const fe = document.querySelector(`[data-id="${fan.id}"]`);
        if (fe?.className.split(/\s+/).includes('fan-active')) fanVid = Math.round(performance.now() - t0);
      }
      if (!fan && logg.length >= 4 && performance.now() - t0 > logg[3].vid + 800) break;
      await new Promise(r => setTimeout(r, 25));
    }
    return { fel: null, logg, fanVid,
             slutKlass: box.className, slutDataFas: box.getAttribute('data-fas') };
  }, { gifterDuration, bildSrc, ocksaFan, modell: MODELL });
}

/* REALTIDSPROVTAGNING for premissvakten.
   Siffrans forvandling ar TIMERDRIVEN i JS (textContent byts av gifterTransform), inte en
   CSS-animation. Den deterministiska tekniken "pausa och satt currentTime" — som 13f/13g
   anvander — bits alltsa inte pa den. Vi maste sampla i realtid.
   Allt mats relativt FAS 2:s borjan, inte relativt triggern: med ett bindande decode-tak kan
   fas 2 skjutas fram medan gifterTransform gar pa sin egen klocka. */
async function provaRakneverket(page, { gifterDuration = 3 } = {}) {
  return page.evaluate(async (arg) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + arg.modell);
    g.x = 40; g.y = 40; g.gifterDuration = arg.gifterDuration;
    state.widgets.push(g); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: arg.modell + ' renderades inte' };
    const stor = box.querySelector('.gifter-big-level');
    if (!stor) return { fel: '.gifter-big-level saknas' };

    const faser = {};
    new MutationObserver(() => {
      const f = box.getAttribute('data-fas');
      if (f && faser[f] === undefined) faser[f] = performance.now();
    }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12, fromLevel: 11 });

    const bytesVid = { t: null };
    const forstSynlig = {};              // selektor -> tidpunkt da opacity forst > .05
    const iFas1 = { orbit: null, stor: null };

    /* ABSOLUT tidsgrans tagen FORE loopen — annars snurrar loopen for evigt vid rod baslinje. */
    const deadline = performance.now() + 9000;
    while (performance.now() < deadline) {
      const nu = performance.now();
      if (bytesVid.t === null && (stor.textContent || '').trim() === '12') bytesVid.t = nu;
      for (const sel of arg.monteras) {
        if (forstSynlig[sel] !== undefined) continue;
        const el = box.querySelector(sel);
        if (!el) continue;
        if (Number(getComputedStyle(el).opacity) > 0.05) forstSynlig[sel] = nu;
      }
      // Mitt i fas 1: ar ringen och siffran redan uppe?
      if (faser.ljus !== undefined && faser.oppna === undefined && nu - faser.ljus > 250
          && iFas1.orbit === null) {
        iFas1.orbit = Number(getComputedStyle(box.querySelector('.gifter-orbit')).opacity);
        iFas1.stor = Number(getComputedStyle(stor).opacity);
        iFas1.text = (stor.textContent || '').trim();
      }
      if (faser.hyllning !== undefined && bytesVid.t !== null
          && arg.monteras.every(s => forstSynlig[s] !== undefined)) break;
      await new Promise(r => setTimeout(r, 16));
    }

    const rel = (t) => (t === null || t === undefined || faser.oppna === undefined)
      ? null : Math.round(t - faser.oppna);
    return { fel: null,
      faser: Object.fromEntries(Object.entries(faser).map(([k, v]) => [k, Math.round(v)])),
      sagFas2: faser.oppna !== undefined,
      bytetRel: rel(bytesVid.t),
      montering: Object.fromEntries(arg.monteras.map(s => [s, rel(forstSynlig[s])])),
      iFas1 };
  }, { gifterDuration, modell: MODELL, monteras: MONTERAS });
}

/* Deterministisk provtagning av MONTERINGENS CSS-animationer (14g). Samma teknik som 13g. */
async function provaFas2(page, punkter, { gifterDuration = 4 } = {}) {
  return page.evaluate(async (arg) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:' + arg.modell);
    g.x = 40; g.y = 40; g.gifterDuration = arg.gifterDuration;
    state.widgets.push(g); selected = null; render();
    for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
      await new Promise(r => requestAnimationFrame(r));
    const box = document.querySelector(`[data-id="${g.id}"]`);
    if (!box) return { fel: arg.modell + ' renderades inte' };

    if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12, fromLevel: 11 });

    const deadline = performance.now() + 6000;
    while (performance.now() < deadline && box.getAttribute('data-fas') !== 'oppna')
      await new Promise(r => setTimeout(r, 10));
    if (box.getAttribute('data-fas') !== 'oppna')
      return { fel: 'fas 2 ("oppna") kom aldrig inom 6000 ms — sedd fas: ' +
                    JSON.stringify(box.getAttribute('data-fas')) };

    const anims = box.getAnimations({ subtree: true });
    for (const a of anims) a.pause();

    const las = () => {
      const ut = {};
      for (const sel of arg.monteras) {
        const el = box.querySelector(sel);
        if (!el) { ut[sel] = null; continue }
        const cs = getComputedStyle(el);
        const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
        ut[sel] = { ty: +m.f.toFixed(2), opacitet: +cs.opacity };
      }
      return ut;
    };

    const matningar = {};
    for (const p of arg.punkter) {
      for (const a of anims) {
        const ti = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
        if (ti.iterations === Infinity) { try { a.currentTime = 0 } catch (e) {} continue }
        try { a.currentTime = p } catch (e) {}
      }
      matningar[p] = las();
    }
    return { fel: null, matningar, antalAnimationer: anims.length };
  }, { punkter, gifterDuration, modell: MODELL, monteras: MONTERAS });
}

// ---- 14a. Fasordning och langder --------------------------------------------------------------
test(`14a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korNumber(page, { gifterDuration: 2 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.deepEqual(r.logg.map(l => l.fas), FASER,
    `${MODELL} korde faserna ${JSON.stringify(r.logg.map(l => l.fas))} — forvantat ` +
    `${JSON.stringify(FASER)}. ${SAKNAS}`);

  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  const nara = (fick, vantat, vad) => assert.ok(Math.abs(fick - vantat) <= 150,
    `${vad}: ${fick} ms, planerat ~${vantat} ms`);
  nara(vid.ljus, 0, 'ljus startar direkt');
  nara(vid.oppna, PLAN.anticipationMs, 'oppna startar efter anticipationMs');
  nara(vid.hyllning, PLAN.anticipationMs + PLAN.enterMs, 'hyllning startar efter enterMs');
  nara(vid.upplosning, PLAN.anticipationMs + PLAN.enterMs + 2000, 'upplosning startar efter holdMs');
});

// ---- 14b. holdMs kommer fran widgetens gifterDuration -----------------------------------------
test('14b. hyllningsfasen laser gifterDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korNumber(page, { gifterDuration: 3 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.hyllning != null && vid.upplosning != null,
    `hyllning eller upplosning uteblev — faser sedda: ${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const hyllning = vid.upplosning - vid.hyllning;
  assert.ok(Math.abs(hyllning - 3000) <= 250,
    `hyllningen varade ${hyllning} ms — widgetens gifterDuration ar 3 s.`);
});

// ---- 14c. Kointegration ------------------------------------------------------------------------
test('14c. kon slapper inte fram nasta alert mitt i numbers sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korNumber(page, { gifterDuration: 2, ocksaFan: true });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.upplosning != null,
    `${MODELL} nadde aldrig upplosningsfasen — faser sedda: ` +
    `${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const sekvensSlut = vid.upplosning + PLAN.exitMs;
  assert.notEqual(r.fanVid, null, 'Fan fick aldrig sin tur inom provets tidsfonster');
  assert.ok(r.fanVid >= sekvensSlut - 200,
    `Fan tandes vid ${r.fanVid} ms men ${MODELL}s sekvens var klar forst vid ${sekvensSlut} ms. ` +
    `Saknas posten "gifter-fas:${MODELL}" i window.VyraFasKoreografi?`);
});

// ---- 14d. Number ar inkopplad i modelltabellen, med RATT ankare --------------------------------
test('14d. number star i modelltabellen och deklarerar bottenavataren som ankare', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(() => {
    const G = window.VyraGifterFas;
    if (!G || !Array.isArray(G.modeller)) return { fel: 'VyraGifterFas.modeller saknas' };
    return { fel: null, modeller: G.modeller.slice(),
             ankare: typeof G.ankare === 'function' ? G.ankare('number') : undefined,
             tak: typeof G.decodeTak === 'function' ? G.decodeTak('number') : undefined };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.modeller.includes(MODELL),
    `"${MODELL}" star inte i VyraGifterFas.modeller. Registrerade: ` +
    `${JSON.stringify(r.modeller)}. ${SAKNAS}`);
  // Det generella provet G1 vaktar att ankaret SYNS. Har vaktas att det ar det RATTA — number
  // ar enda modellen som inte kan anvanda .gifter-orbit img, den ar display:none dar.
  assert.equal(r.ankare, '.gifter-bottom-profile img',
    `number deklarerar decodeAnkare ${JSON.stringify(r.ankare)} — men .gifter-orbit img ar ` +
    'display:none i den har modellen. Grinden skulle vakta ett element som aldrig renderas.');
  assert.equal(r.tak, 900,
    `numbers decodeTak ar ${r.tak} ms. Med 500 mot en ljusfas pa 500 kan grinden aldrig bli ` +
    'bindande, och bottenavataren — modellens enda portratt och sista beaten i monteringen — ' +
    'kan da dyka upp oavkodad.');
});

// ---- 14e. Decode-grinden i numbers koreografi -------------------------------------------------
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  /* 1100 ms, inte 700: taket ar 900, sa en 700 ms-bild avkodas INOM gransen och varnar inte. */
  { namn: 'langsam men inom taket (700 ms)', src: '/bild.png?ms=700', minOppna: 550, maxOppna: 1000, varning: false },
  { namn: 'for sen bild (1100 ms, over taket 900 ms)', src: '/bild.png?ms=1100', minOppna: 800, maxOppna: 1300, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 1000, varning: true },
]) {
  test(`14e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korNumber(page, { gifterDuration: 1, bildSrc: fall.src });
    const varningar = page._varningar.filter(v => /VyraFas/.test(v));
    await page.close();

    assert.equal(r.fel, null, r.fel);
    assert.deepEqual(r.logg.map(l => l.fas), FASER,
      `sekvensen brots vid "${fall.namn}": ${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
    const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
    assert.ok(vid.oppna >= fall.minOppna,
      `oppna startade vid ${vid.oppna} ms — fore uppbyggnaden var klar`);
    assert.ok(vid.oppna <= fall.maxOppna,
      `oppna startade forst vid ${vid.oppna} ms — grinden holl kvar for lange`);
    if (fall.varning) {
      assert.ok(varningar.length > 0,
        'ingen console.warn loggades trots att bilden aldrig blev avkodad i tid');
    }
  });
}

// ---- 14f. PREMISSVAKTEN · "Rakneverket" --------------------------------------------------------
// Tre pastaenden, alla matta pa BERAKNADE varden i realtid (siffrans byte ar timerdrivet i JS
// och gar inte att stega med currentTime):
//   1. FAS 1 AR INTE TOM — ringen OCH den gamla siffran ar uppe, och siffran visar det GAMLA
//      vardet. Det ar hela premissen: den gamla siffran ar anticipationen.
//   2. INGET ANNAT SYNS FORE BYTET — de sex delar som ska monteras ligger pa opacity 0 anda
//      tills siffran har bytts.
//   3. MONTERINGEN BORJAR EFTER BYTET, matt relativt fas 2:s borjan.
test('14f. number visar gamla siffran i fas 1 och monterar forst efter bytet', { skip }, async () => {
  const page = await studion();
  const r = await provaRakneverket(page, { gifterDuration: 3 });
  await page.close();

  assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
  assert.ok(r.sagFas2,
    `fas 2 ("oppna") kom aldrig — faser sedda: ${JSON.stringify(Object.keys(r.faser))}. ${SAKNAS}`);

  // 1. Fas 1 ar inte tom.
  assert.ok(r.iFas1.orbit != null,
    'hann aldrig mata mitt i fas 1 — ljusfasen var kortare an 250 ms?');
  assert.ok(r.iFas1.orbit > 0.05,
    `ringen (.gifter-orbit) ar slackt mitt i fas 1 (opacitet ${r.iFas1.orbit}). I number ar ` +
    'fas 1 INTE en tom scen — ringen och den gamla siffran ar anticipationen.');
  assert.ok(r.iFas1.stor > 0.05,
    `den stora siffran ar slackt mitt i fas 1 (opacitet ${r.iFas1.stor}). Da spelas ` +
    'gifterTransforms "gamla siffran star kvar"-beat osynligt, och premissen ar borta.');
  assert.equal(r.iFas1.text, '11',
    `den stora siffran visar "${r.iFas1.text}" mitt i fas 1 — den ska visa det GAMLA vardet ` +
    '(11), annars ser tittaren aldrig vad nivan byts fran.');

  // 2 + 3. Ingen av monteringsdelarna far synas fore bytet.
  assert.ok(r.bytetRel != null,
    'siffran byttes aldrig till 12 inom provets tidsfonster');
  for (const [sel, vid] of Object.entries(r.montering)) {
    assert.ok(vid != null, `${sel} blev aldrig synlig inom provets tidsfonster`);
    assert.ok(vid >= r.bytetRel - 60,
      `${sel} blev synlig ${vid} ms in i fas 2, men siffran byttes forst vid ${r.bytetRel} ms. ` +
      'Premissen ar att widgeten monteras RUNT den nya siffran — inte fore den.');
  }
});

// ---- 14g. HALVA ROVELSEN VID HALVA TIDEN -------------------------------------------------------
// Samma arbetsregel som 13g, riktad mot monteringens forsta vag. Vaktar keyframe-VARDENA:
// med en mellankeyframe nara matpunkten later timingfunktionen sig inte matas, se 13g.
test('14g. monteringens forsta vag har sin halva vid halva tiden', { skip }, async () => {
  const page = await studion();
  const halva = Math.round(TAKT.vagAFran + (TAKT.vagATill - TAKT.vagAFran) / 2);
  const r = await provaFas2(page, [TAKT.vagAFran + 5, halva, TAKT.vagATill, PLAN.enterMs - 10]);
  await page.close();

  assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
  assert.ok(r.antalAnimationer > 0,
    `inga animationer alls i widgeten under fas 2 — koreografins CSS saknas. ${SAKNAS}`);

  const sel = 'h2';
  const start = r.matningar[TAKT.vagAFran + 5][sel];
  const halv = r.matningar[halva][sel];
  const slut = r.matningar[TAKT.vagATill][sel];
  assert.ok(start && halv && slut, `${sel} gick inte att mata i fas 2`);
  assert.ok(Math.abs(start.ty) > 1,
    `${sel} borjar sin montering pa ${start.ty} px — den ska starta forskjuten.`);
  assert.ok(Math.abs(slut.ty) <= 1,
    `${sel} har inte landat vid ${TAKT.vagATill} ms (${slut.ty} px).`);
  const andel = (start.ty - halv.ty) / (start.ty - slut.ty);
  assert.ok(andel > 0.35 && andel < 0.65,
    `vid halva monteringstiden (${halva} ms) har ${(andel * 100).toFixed(0)} % av rorelsen skett ` +
    `(${halv.ty} px av strackan ${start.ty} -> ${slut.ty}). Utanfor 35-65 % snappar rorelsen.`);

  const slutOpacitet = r.matningar[PLAN.enterMs - 10][sel].opacitet;
  assert.ok(slutOpacitet > 0.95,
    `${sel} slutar fas 2 pa opacitet ${slutOpacitet} — monteringen ska vara klar da.`);
});
