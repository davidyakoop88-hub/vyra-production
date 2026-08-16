'use strict';
// Gifter Level Up · modell `profile` — fyrafaskoreografi. Prov 13a-13g, skrivna FORE koden.
//
// Egen fil per modell: stack 8, reveal 9, sidebadge 10, flip 11, duo 12 — profile ar 13.
// De generella vakterna (decode-ankarets synlighet, fas-CSS som inte ror ett slackt
// .gifter-bottom-profile) ligger som G1/G2 i gifter-fas-generella.browser.test.js och
// loopar over hela modelltabellen. De far profile pa kopet nar posten laggs till.
//
// PREMISS: "Classic Rise & Pop" (Davids ord). Profile ar renderarens DEFAULT
// (media.js:578, `w.gifterLayout||'profile'`) och alltsa den modell varje anvandare far som
// aldrig oppnar modellvaljaren. Den ska vara ren, snarv och professionell — inget overdrivet.
// En mjuk men snabb uppstigning av HELA widgeten, sedan namnet mjukt fram, sedan nivabrickan
// i en tydlig pop.
//
// TRE MATNINGAR SOM PROVEN AR BYGGDA RUNT:
//
//   1. INGEN KONKURRERANDE ENTRE ATT NEUTRALISERA. Profile ar den enda av nio utan. Det enda
//      rorliga i basdesignen ar de tva omarkta <b>-gnistorna i orbiten (`heartSpark 1.5s
//      infinite`) — de ror vi inte. `.gifter-orbit-arrow` bar samma animation men ar slackt:
//      dod animation, samma familj som prov 8f vaktar.
//
//   2. ROTENS TRANSFORM GAR INTE ATT ANIMERA. studio.css:201 satter
//      `transform:scale(.8)!important` i viloläge och `.gifter-active` satter
//      `scale(1)!important`. I kaskadordningen slar viktiga forfattardeklarationer OVER
//      CSS-animationer, och en animation kan inte markas !important. Uppmatt: en provanimation
//      pa rotens transform gav identitetsmatris. Det ar ocksa forklaringen till att ingen av
//      de sex befintliga koreografierna ror roten — deras [data-fas]-regler pa roten
//      deklarerar bara CSS-variabler. Premissen "hela widgeten stiger" bars darfor av de SEX
//      BARNEN som grupp, och prov 13f mater just att de ror sig som EN kropp.
//      (Draghanterarna ar oskyldiga: studio.js:201 och layout-safe.js:93 skriver style.left/top,
//      storleksgreppet skriver style.zoom. Uppmatt: noll skrivningar till transform.)
//
//   3. DECODE-ANKARET FLYTTAR ORDAGRANT. `.gifter-orbit img` ar synligt 86x86 i profile,
//      samma som risingtier och stack. Profile TONAR IN portrattet, det avslojar det inte,
//      sa decodeTimeoutMs ar 500 av samma skal som sidebadge — grinden blir da en strukturell
//      no-op, vilket ar acceptabelt for en intoning. Prov 13e vaktar anda att sekvensen haller
//      nar bilden ar sen eller fallerar.
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

const MODELL = 'profile';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
// Taktningen inuti fas 2, ur den godkanda fastabellen.
const TAKT = { stigTill: 520, namnFran: 380, namnTill: 640, popFran: 560, popTill: 860 };
const STIG_PX = 22;          // rotens... nej, gruppens starthojd. Se 13f.
const KROPPEN = ['.gifter-orbit', '.gifter-diamond-row', '.gifter-level-badge', 'h2', 'h3', 'p'];
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

/* Tander en profile-widget och loggar nar varje fas BORJADE, matt pa data-fas via
   MutationObserver — sa provet mater INTEGRATIONEN (att dekoratorn driver widgeten) och inte
   bara att motorn kan rakna. Samma rigg som 7-seriens korGifter, riktad mot profile. */
async function korProfile(page, { gifterDuration = 2, bildSrc = null, ocksaFan = false } = {}) {
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

    const bild = box.querySelector('.gifter-orbit img');
    if (arg.bildSrc) {
      if (!bild) return { fel: 'ingen profilbild i .gifter-orbit' };
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
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });
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

/* DETERMINISTISK PROVTAGNING I FAS 2.
   Vanta-och-mat duger inte: element.screenshot och en vanlig matning fangar en SENARE bildruta
   an anropsogonblicket, och driften ackumuleras. Vi tander, vantar tills data-fas blir "oppna",
   PAUSAR varje animation i widgeten och satter currentTime — da ger samma varde samma
   ogonblick i fasen for alla animationer, delay inraknad.

   De oandliga vilolagren (heartSpark pa gnistorna) pausas ocksa, men lases till 0 sa de inte
   varierar mellan provkorningar.

   Returnerar per provpunkt: varje kroppsdels transformmatris och opacitet. */
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
    window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

    /* ABSOLUT tidsgrans, tagen FORE loopen. En grans som mats mot ett varde som kan vara null
       vid rod baslinje snurrar for evigt — sidebadges prov 10f gick i den fallan och slog i
       600-sekunderstaket i stallet for att bli rott. */
    const deadline = performance.now() + 6000;
    while (performance.now() < deadline && box.getAttribute('data-fas') !== 'oppna')
      await new Promise(r => setTimeout(r, 10));
    if (box.getAttribute('data-fas') !== 'oppna')
      return { fel: 'fas 2 ("oppna") kom aldrig inom 6000 ms — ' +
                    'sedd fas: ' + JSON.stringify(box.getAttribute('data-fas')) };

    const anims = box.getAnimations({ subtree: true });
    for (const a of anims) a.pause();

    const las = () => {
      const ut = {};
      for (const sel of arg.kroppen) {
        const el = box.querySelector(sel) || (box.matches(sel) ? box : null);
        if (!el) { ut[sel] = null; continue }
        const cs = getComputedStyle(el);
        const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
        ut[sel] = { ty: +m.f.toFixed(2), skalaX: +m.a.toFixed(3), skalaY: +m.d.toFixed(3),
                    opacitet: +cs.opacity };
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
  }, { punkter, gifterDuration, modell: MODELL, kroppen: KROPPEN });
}

// ---- 13a. Fasordning och langder --------------------------------------------------------------
test(`13a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korProfile(page, { gifterDuration: 2 });
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

// ---- 13b. holdMs kommer fran widgetens gifterDuration -----------------------------------------
// 3 s ar medvetet skilt fran standardvardet 6 s, sa ett hardkodat 6000 inte kan smita igenom.
test('13b. hyllningsfasen laser gifterDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korProfile(page, { gifterDuration: 3 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.hyllning != null && vid.upplosning != null,
    `hyllning eller upplosning uteblev — faser sedda: ${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const hyllning = vid.upplosning - vid.hyllning;
  assert.ok(Math.abs(hyllning - 3000) <= 250,
    `hyllningen varade ${hyllning} ms — widgetens gifterDuration ar 3 s. ` +
    `Ligger den nara 6000 ms laser koreografin ett fast varde i stallet for widgeten.`);
});

// ---- 13c. Kointegration ------------------------------------------------------------------------
// Profile ar DEFAULTLAYOUTEN, sa den har kopplingen ar den som traffar flest anvandare: utan
// posten i window.VyraFasKoreografi haller kon bara visningstiden och slapper fram nasta alert
// mitt i sekvensen.
test('13c. kon slapper inte fram nasta alert mitt i profiles sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korProfile(page, { gifterDuration: 2, ocksaFan: true });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.upplosning != null,
    `${MODELL} nadde aldrig upplosningsfasen — faser sedda: ` +
    `${JSON.stringify(r.logg.map(l => l.fas))}. ${SAKNAS}`);
  const sekvensSlut = vid.upplosning + PLAN.exitMs;
  assert.notEqual(r.fanVid, null, 'Fan fick aldrig sin tur inom provets tidsfonster');
  assert.ok(r.fanVid >= sekvensSlut - 200,
    `Fan tandes vid ${r.fanVid} ms men ${MODELL}s sekvens var klar forst vid ${sekvensSlut} ms — ` +
    `kon kanner bara till gifterDuration. Saknas posten "gifter-fas:${MODELL}" i ` +
    `window.VyraFasKoreografi? RAPPORTERA, laga inte i runtime-controls.js.`);
});

// ---- 13d. Profile ar inkopplad i modelltabellen ------------------------------------------------
test('13d. profile star i modelltabellen VyraGifterFas.modeller', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(() => {
    const G = window.VyraGifterFas;
    if (!G || !Array.isArray(G.modeller)) return { fel: 'VyraGifterFas.modeller saknas' };
    return { fel: null, modeller: G.modeller.slice() };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.modeller.includes(MODELL),
    `"${MODELL}" star inte i VyraGifterFas.modeller — koreografin ar inte inkopplad. ` +
    `Registrerade modeller: ${JSON.stringify(r.modeller)}. ${SAKNAS}`);
});

// ---- 13e. Decode-grinden i profiles koreografi -------------------------------------------------
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom tidsgransen (300 ms)', src: '/bild.png?ms=300', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'for sen bild (700 ms, over 500 ms)', src: '/bild.png?ms=700', minOppna: 450, maxOppna: 900, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 900, varning: true },
]) {
  test(`13e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korProfile(page, { gifterDuration: 1, bildSrc: fall.src });
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

// ---- 13f. PREMISSVAKTEN · "Classic Rise & Pop" -------------------------------------------------
// Tre pastaenden, alla mätta pa BERAKNADE varden (transformmatrisen), aldrig pa klassnamn:
//   1. EN KROPP  — vid 260 ms i fas 2, alltsa fore namnets egen rorelse borjar (380 ms), ska
//                  alla sex kroppsdelar ha SAMMA vertikala forskjutning, och den ska ligga
//                  strikt mellan 0 och starthojden. Rors de olika mycket ar det inte en kropp
//                  som stiger utan sex delar som rors var for sig.
//   2. NAMNET EFTER — h3 ska ha en EGEN rorelse utover kroppens: vid 500 ms skiljer sig dess
//                  forskjutning fran gruppens, och dess opacitet ar annu inte full.
//   3. BRICKAN POPPAR — brickans skala ska passera OVER 1 nagon gang i popfonstret och ha
//                  landat pa 1 vid fasens slut. En pop som bara vaxer till 1 ar ingen pop.
test('13f. profile stiger som en kropp, namnet foljer efter och brickan poppar', { skip }, async () => {
  const page = await studion();
  const r = await provaFas2(page, [260, 500, 700, TAKT.popTill - 20, PLAN.enterMs - 10]);
  await page.close();

  assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);
  assert.ok(r.antalAnimationer > 0,
    `inga animationer alls i widgeten under fas 2 — koreografins CSS saknas. ${SAKNAS}`);

  // 1. EN KROPP vid 260 ms.
  const vid260 = r.matningar[260];
  for (const sel of KROPPEN)
    assert.ok(vid260[sel], `kroppsdelen ${sel} hittades inte i widgeten`);
  const ty = KROPPEN.map(sel => vid260[sel].ty);
  const spridning = Math.max(...ty) - Math.min(...ty);
  assert.ok(spridning <= 1.5,
    `vid 260 ms i fas 2 star kroppsdelarna pa olika hojd (spridning ${spridning.toFixed(2)} px): ` +
    KROPPEN.map((s, i) => `${s}=${ty[i]}`).join(', ') +
    ' — premissen ar att HELA widgeten stiger som en kropp.');
  assert.ok(ty[0] > 1 && ty[0] < STIG_PX,
    `vid 260 ms ar forskjutningen ${ty[0]} px — forvantat strikt mellan 0 och ${STIG_PX} px ` +
    '(stigningen ska vara pagaende, varken osjosatt eller redan landad).');

  // 2. NAMNET har en egen rorelse utover kroppens.
  const vid500 = r.matningar[500];
  const kroppen500 = vid500['.gifter-orbit'].ty;
  assert.ok(Math.abs(vid500['h3'].ty - kroppen500) > 0.5,
    `vid 500 ms star namnet pa samma hojd som kroppen (${vid500['h3'].ty} mot ${kroppen500}) — ` +
    'namnet ska trada fram med en EGEN rorelse efter uppstigningen.');
  assert.ok(vid500['h3'].opacitet < 1,
    `namnets opacitet ar redan ${vid500['h3'].opacitet} vid 500 ms — det ska tona in ` +
    `mellan ${TAKT.namnFran} och ${TAKT.namnTill} ms, alltsa efter kroppen.`);

  // 3. BRICKAN poppar over 1 och landar pa 1.
  const popPunkter = [700, TAKT.popTill - 20].map(p => r.matningar[p]['.gifter-level-badge'].skalaX);
  assert.ok(Math.max(...popPunkter) > 1.01,
    `brickans skala nadde som mest ${Math.max(...popPunkter)} i popfonstret — ` +
    'en pop maste passera over 1, annars ar det bara en intoning.');
  const slutSkala = r.matningar[PLAN.enterMs - 10]['.gifter-level-badge'].skalaX;
  assert.ok(Math.abs(slutSkala - 1) <= 0.02,
    `brickan slutar fas 2 pa skala ${slutSkala} — den ska landa pa 1.`);
});

// ---- 13g. HALVA ROVELSEN VID HALVA TIDEN -------------------------------------------------------
// Arbetsregeln: en rorelse som ska lasas visuellt maste ha sin halva vid halva tiden. Fronttunga
// easings far rorelsen att SNAPPA i stallet for att ga — den ar da klar i sin forsta fjardedel
// och det finns inget mellanlage att se. Reveal, flip och sidebadge gick alla i den fallan.
//
// VAD PROVET FAKTISKT VAKTAR — utrakningen ar gjord, inte gissad. Provet ar OKANSLIGT for
// `animation-timing-function` pa den har modellen, och det ar korrekt: mellankeyframen vid 30 %
// laser `ty` till .4808 av strackan, och matpunkten 260 ms ligger vid 28,89 % — 1,11
// procentenheter fore den. Varje timingfunktion MASTE passera keyframens varde, sa matpunkten
// kan inte flytta sig mer an ~1 px oavsett kurva. Trajektorian bestams alltsa av
// keyframe-VARDENA, och det ar dem provet vaktar.
// Mutationsprovat: att byta linear mot en fronttung bezier faller INTE (mutationen ar
// verkningslos, se ovan), men att gora keyframevardet fronttungt (.4808 -> .05) faller.
// Popens tva pastaenden faller pa att hela popen flyttas efter matpunkten respektive pa att
// den ar helt over fore halva poptiden. Att bara flytta EN keyframe till en hogre procentsats
// faller inte — webblasaren sorterar om keyframes, sa toppen vid 78,89 % overlever.
test('13g. prStig och prBrickaPop har sin halva vid halva tiden', { skip }, async () => {
  const page = await studion();
  const halvaStig = Math.round(TAKT.stigTill / 2);
  const halvaPop = Math.round(TAKT.popFran + (TAKT.popTill - TAKT.popFran) / 2);
  const r = await provaFas2(page, [1, halvaStig, TAKT.stigTill, TAKT.popFran + 5, halvaPop]);
  await page.close();

  assert.equal(r.fel, null, r.fel + ` ${SAKNAS}`);

  // Stigningen: forskjutningen vid halva tiden ska ligga kring halva strackan.
  const start = r.matningar[1]['.gifter-orbit'].ty;
  const halv = r.matningar[halvaStig]['.gifter-orbit'].ty;
  const slut = r.matningar[TAKT.stigTill]['.gifter-orbit'].ty;
  assert.ok(Math.abs(start) > 1,
    `stigningen borjar pa ${start} px — den ska starta forskjuten (~${STIG_PX} px).`);
  assert.ok(Math.abs(slut) <= 1,
    `stigningen har inte landat vid ${TAKT.stigTill} ms (${slut} px).`);
  const andel = (start - halv) / (start - slut);
  assert.ok(andel > 0.35 && andel < 0.65,
    `vid halva stigtiden (${halvaStig} ms) har ${(andel * 100).toFixed(0)} % av rorelsen skett ` +
    `(${halv} px av strackan ${start} -> ${slut}). Utanfor 35-65 % snappar rorelsen i stallet ` +
    'for att ga, och det finns inget mellanlage att lasa.');

  // Popen: skalan vid halva poptiden ska vara pa vag, inte redan framme.
  const popStart = r.matningar[TAKT.popFran + 5]['.gifter-level-badge'].skalaX;
  const popHalv = r.matningar[halvaPop]['.gifter-level-badge'].skalaX;
  assert.ok(popHalv > popStart + 0.02,
    `brickans skala star still vid halva poptiden (${popStart} -> ${popHalv}) — popen har inte borjat.`);
  assert.ok(Math.abs(popHalv - 1) > 0.005,
    `brickans skala ar redan ${popHalv} vid halva poptiden — popen ar da over innan den syns.`);
});
