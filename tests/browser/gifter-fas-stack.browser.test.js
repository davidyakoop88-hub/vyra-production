'use strict';
// Gifter Level Up · modell `stack` — fyrafaskoreografi. Prov 8a-8f, skrivna FORE koden.
//
// Egen fil: 7-serien ar last och far inte roras. Den vaktar risingtier (referensen) och
// KOPPLINGEN mellan modelltabellen och koreografin. Den har filen vaktar INNEHALLET i stacks
// koreografi — faslangder, hyllningens kalla, kons lucka, decode-ankaret och fas-CSS:en.
//
// VALD MODELL: stack. Uppmatt: 18 CSS-regler, 12 adresserade delar, 6 element redan i rorelse,
// samma 86x86 portratt i `.gifter-orbit img` som risingtier — receptet flyttar darfor ordagrant.
// Silhuetten ar en fallande diamant som landar pa ringen (.gifter-diamond-row order:1,
// .gifter-orbit order:2 med margin-top:-14px), alltsa FALL OCH NEDSLAG — inversen av
// risingtiers uppatstigande, samma dramaturgi.
//
// TVA FYND SOM PROVEN AR BYGGDA RUNT:
//   1. Stack har TVA konkurrerande entreer i dag: `gStackBounceIn` (studio.css:204) och
//      `gl-drop`/`gl-rise`/`gl-sharpen` (studio.css:562-564). Neutraliseringsblocket maste
//      tacka BADA — annars sipprar en av dem igenom under koreografin.
//   2. `.gifter-bottom-profile` ar slackt av en BASREGEL (studio.css:202
//      `.gifter-big-level,.gifter-bottom-profile{display:none}`) i alla modeller utom `number`.
//      Stacks `gl-rise` (563) och `gl-sink` (565) ar darfor DOD rorelse i dag. Prov 8f finns
//      for att koreografin inte ska upprepa felet, och 8d for att decode-ankaret inte ska
//      peka pa ett slackt element.
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

const MODELL = 'stack';
const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };
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

/* Tander en stack-widget och loggar nar varje fas BORJADE, mätt pa data-fas via
   MutationObserver — sa provet mater INTEGRATIONEN (att dekoratorn driver widgeten) och inte
   bara att motorn kan rakna. Samma rigg som 7-seriens korGifter, riktad mot stack. */
async function korStack(page, { gifterDuration = 2, bildSrc = null, ocksaFan = false } = {}) {
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

// ---- 8a. Fasordning och langder ---------------------------------------------------------------
test(`8a. ${MODELL} kor alla fyra faser i ratt ordning med planerade langder`, { skip }, async () => {
  const page = await studion();
  const r = await korStack(page, { gifterDuration: 2 });
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

// ---- 8b. holdMs kommer fran widgetens gifterDuration ------------------------------------------
// 3 s ar medvetet skilt fran standardvardet 6 s, sa ett hardkodat 6000 inte kan smita igenom.
test('8b. hyllningsfasen laser gifterDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korStack(page, { gifterDuration: 3 });
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

// ---- 8c. Kointegration -------------------------------------------------------------------------
// Fan tands direkt efter. Kon far inte slappa fram den mitt i stacks sekvens. Det kraver att
// stacks post finns i window.VyraFasKoreografi — publiceringen sker per modell ur tabellen.
test('8c. kon slapper inte fram nasta alert mitt i stacks sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korStack(page, { gifterDuration: 2, ocksaFan: true });
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

// ---- 8d. Decode-ankaret pekar pa nagot som faktiskt SYNS --------------------------------------
// ERSATTER det ursprungligen planerade 8d ("de atta andra modellerna ar ororda"), som blev
// redundant nar 7d skrevs om till biconditionell form — 7d tacker bada riktningarna for alla nio.
//
// Det har provar i stallet nagot ingen annan gor: att modellens decodeAnkare pekar pa ett
// SYNLIGT element. `.gifter-bottom-profile` ar slackt av basregeln i studio.css:202, och
// `.gifter-orbit img` ar slackt i `number`. En grind som vantar pa ett display:none-element
// avkodar anda (bilden laddas) — 8e skulle alltsa passera medan grinden i praktiken vaktar
// ingenting och fas 2 oppnar mot en tom cirkel.
test('8d. varje koreograferad modells decodeAnkare pekar pa ett synligt element', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async (modell) => {
    const G = window.VyraGifterFas;
    if (!G || !Array.isArray(G.modeller)) return { fel: 'VyraGifterFas.modeller saknas' };
    const koreograferade = G.modeller.slice();
    const ut = [];
    // Stack provas alltid, aven innan den star i tabellen — det ar hela poangen med baslinjen.
    const attProva = koreograferade.indexOf(modell) === -1
      ? koreograferade.concat([modell]) : koreograferade;

    for (const layout of attProva) {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:gifterlevel:' + layout);
      w.x = 40; w.y = 40; w.gifterDuration = 2;
      state.widgets.push(w); selected = null; render();
      for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));
      const box = document.querySelector(`[data-id="${w.id}"]`);
      if (!box) { ut.push({ layout, fel: 'renderades inte' }); continue }

      if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
      window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });
      // Widgeten ligger pa opacity:0 tills den tands — allt matt fore det blir SLACKT.
      const t0 = performance.now();
      while (performance.now() - t0 < 9000 &&
             !box.className.split(/\s+/).includes('gifter-active'))
        await new Promise(r => setTimeout(r, 40));
      await new Promise(r => setTimeout(r, 400));

      const iTabellen = koreograferade.indexOf(layout) !== -1;
      // Ankaret ar inte utlast ur tabellen (den exporterar inte valjaren), sa provet
      // kontrollerar bada kandidaterna och rapporterar vilken som duger.
      const matt = sel => {
        const el = box.querySelector(sel);
        if (!el) return { finns: false, synlig: false };
        const s = getComputedStyle(el), rect = el.getBoundingClientRect();
        return { finns: true,
                 synlig: s.display !== 'none' && s.visibility !== 'hidden' &&
                         Number(s.opacity) > 0.01 && rect.width > 1 && rect.height > 1,
                 matt: Math.round(rect.width) + 'x' + Math.round(rect.height) };
      };
      ut.push({ layout, iTabellen,
                orbit: matt('.gifter-orbit img'), botten: matt('.gifter-bottom-profile img') });
    }
    return { fel: null, koreograferade, rader: ut };
  }, MODELL);
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.koreograferade.includes(MODELL),
    `"${MODELL}" star inte i VyraGifterFas.modeller — koreografin ar inte inkopplad. ${SAKNAS}`);

  for (const u of r.rader) {
    assert.equal(u.fel, undefined, `${u.layout}: ${u.fel}`);
    assert.ok(u.orbit.synlig || u.botten.synlig,
      `Modell ${u.layout} har inget synligt portratt att grinda fas 2 pa: ` +
      `.gifter-orbit img ${u.orbit.finns ? '(slackt)' : '(saknas)'}, ` +
      `.gifter-bottom-profile img ${u.botten.finns ? '(slackt)' : '(saknas)'}. ` +
      `Decode-grinden skulle vakta ingenting.`);
  }
});

// ---- 8e. Decode-grinden i stacks koreografi ---------------------------------------------------
// Motorns generella prov 3 visar att grinden fungerar. Det har visar att den ar RATT INKOPPLAD
// i stack: fas 2 far aldrig oppna ringen mot en tom cirkel nar diamanten landar.
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom tidsgransen (300 ms)', src: '/bild.png?ms=300', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'for sen bild (700 ms, over 500 ms)', src: '/bild.png?ms=700', minOppna: 450, maxOppna: 900, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 900, varning: true },
]) {
  test(`8e. decode-grind pa ${MODELL} — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korStack(page, { gifterDuration: 1, bildSrc: fall.src });
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

// ---- 8f. Fas-CSS:en finns, och spenderar ingen rorelse pa ett slackt element -------------------
// FYND B, mätt 2026-08-15: `.gifter-big-level,.gifter-bottom-profile{display:none}`
// (studio.css:202) ar en BASREGEL. Bara `number` tander bottenportrattet igen. Stacks
// befintliga `gl-rise` (563) och `gl-sink` (565) animerar darfor ett display:none-element —
// dod rorelse. Samma sak galler reveal, orbitlevel, flip, duo och referensen risingtier.
// Vi stadar INTE det bakat nu (beslut 2026-08-15), men koreografin far inte upprepa felet.
//
// Provet laser den LEVANDE CSSOM:en (document.styleSheets), inte filtext — det ar det
// webblasaren faktiskt parsat, och det tacker bade studio.css och premium-final.css.
// Generellt over alla koreograferade modeller, sa varje framtida modell tacks automatiskt.
test('8f. fas-CSS finns for varje koreograferad modell och riktar sig aldrig mot ett slackt .gifter-bottom-profile',
  { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async (modell) => {
    const G = window.VyraGifterFas;
    if (!G || !Array.isArray(G.modeller)) return { fel: 'VyraGifterFas.modeller saknas' };
    const koreograferade = G.modeller.slice();
    const attProva = koreograferade.indexOf(modell) === -1
      ? koreograferade.concat([modell]) : koreograferade;

    // Samla alla stilregler ur den levande CSSOM:en, aven de som ligger i @media.
    const valjare = [];
    const gaIgenom = regler => {
      for (const regel of regler) {
        if (regel.cssRules && !regel.selectorText) { gaIgenom(regel.cssRules); continue }
        if (regel.selectorText) valjare.push({ sel: regel.selectorText, css: regel.cssText });
      }
    };
    for (const ark of document.styleSheets) {
      try { gaIgenom(ark.cssRules) } catch (e) { /* cross-origin — finns inte lokalt */ }
    }

    // Ar bottenportrattet slackt i modellen? Provas pa en TAND widget.
    const bottenSlackt = {};
    for (const layout of attProva) {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:gifterlevel:' + layout);
      w.x = 40; w.y = 40; w.gifterDuration = 2;
      state.widgets.push(w); selected = null; render();
      for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));
      const box = document.querySelector(`[data-id="${w.id}"]`);
      if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
      window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });
      const t0 = performance.now();
      while (performance.now() - t0 < 9000 &&
             !box.className.split(/\s+/).includes('gifter-active'))
        await new Promise(r => setTimeout(r, 40));
      await new Promise(r => setTimeout(r, 300));
      const bp = box.querySelector('.gifter-bottom-profile');
      bottenSlackt[layout] = !bp || getComputedStyle(bp).display === 'none';
    }

    const ut = attProva.map(layout => {
      const klass = '.gifter-layout-' + layout;
      /* `[data-fas` UTAN avslutande hakparentes. Fasreglerna skrivs `[data-fas="ljus"]` osv,
         och ett filter pa `[data-fas]` hittar bara neutraliseringsblocket — alltsa just de
         regler som INTE gor nagot. Uppmatt: 8 traffar i stallet for hela koreografin, och en
         bottenprofil-regel scopad till en enskild fas hade sluppit rakt igenom vakten. */
      const fasRegler = valjare.filter(v => v.sel.includes(klass) && v.sel.includes('[data-fas'));
      return {
        layout,
        iTabellen: koreograferade.indexOf(layout) !== -1,
        antalFasRegler: fasRegler.length,
        bottenSlackt: bottenSlackt[layout],
        brytare: fasRegler
          .filter(v => v.sel.includes('.gifter-bottom-profile'))
          .map(v => v.sel),
      };
    });
    return { fel: null, koreograferade, rader: ut };
  }, MODELL);
  await page.close();

  assert.equal(r.fel, null, r.fel);

  for (const u of r.rader) {
    assert.ok(u.antalFasRegler > 0,
      `Modell ${u.layout} har noll CSS-regler som bade namner ${'.gifter-layout-' + u.layout} ` +
      `och [data-fas] — fas-CSS:en ar inte skriven. Motorn skulle satta attributet utan att ` +
      `nagot syns. ${u.layout === MODELL ? SAKNAS : ''}`);

    if (u.bottenSlackt) {
      assert.equal(u.brytare.length, 0,
        `Modell ${u.layout}: ${u.brytare.length} fas-regel(er) riktar sig mot ` +
        `.gifter-bottom-profile, som ar display:none i den modellen (basregeln i ` +
        `studio.css:202). Rorelsen skulle aldrig synas. Brytande valjare:\n  ` +
        u.brytare.join('\n  '));
    }
  }
});
