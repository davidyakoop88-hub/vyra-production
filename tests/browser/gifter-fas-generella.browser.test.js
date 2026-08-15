'use strict';
// GENERELLA VAKTER FOR ALLA REGISTRERADE GIFTER-MODELLER.
//
// G1 hette tidigare 8d, G2 hette tidigare 8f. Bada bodde i gifter-fas-stack.browser.test.js
// men gallde aldrig bara stack — de loopar over window.VyraGifterFas.modeller och tacker varje
// modell som ar inkopplad i modelltabellen. Att de lag i en modellspecifik fil var semantiskt
// fel: hade stack-filen nagon gang tagits bort hade alla modeller tappat sina generella vakter.
//
// VID FLYTTEN TOGS EN KOPPLING BORT. Bada tog `MODELL` ('stack') som parameter och gjorde
//     attProva = koreograferade.includes(modell) ? koreograferade : koreograferade.concat([modell])
// vilket tvingade in en modell som ANNU INTE stod i tabellen. Det var mekanismen som gjorde dem
// roda for stack fore implementationen. Den behovs inte har: en ny modells egna prov (9a/9b/9c/9e
// osv) faller redan med "Star <modell> i modelltabellen…", och G2:s krav pa minst en fas-regel
// fangar "modell i tabellen utan CSS" sa fort modellen ar registrerad.
// Medlemskapsassertionen ("stack star inte i tabellen") var genuint modellspecifik och ligger
// kvar i stack-filen som 8d.
//
// TOM LISTA FAR ALDRIG PASSERA TYST. Bada proven kraver att tabellen har minst en modell —
// annars hade loopen varit tom och vakterna gronskat utan att ha provat nagonting.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
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

async function studion() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(3000);   // kowrapparna installeras vid 500/2200 ms
  return page;
}

// ---- G1 (tidigare 8d). Decode-ankaret pekar pa nagot som faktiskt SYNS ------------------------
// `.gifter-bottom-profile` ar slackt av basregeln i studio.css:202, och `.gifter-orbit img` ar
// slackt i `number`. En grind som vantar pa ett display:none-element avkodar anda (bilden laddas)
// — modellens egna decode-prov skulle alltsa passera medan grinden i praktiken vaktar ingenting
// och fas 2 oppnar mot en tom cirkel.
test('G1. varje koreograferad modells decodeAnkare pekar pa ett synligt element', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    const G = window.VyraGifterFas;
    if (!G || !Array.isArray(G.modeller)) return { fel: 'VyraGifterFas.modeller saknas' };
    const koreograferade = G.modeller.slice();
    const ut = [];

    for (const layout of koreograferade) {
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
      ut.push({ layout, orbit: matt('.gifter-orbit img'), botten: matt('.gifter-bottom-profile img') });
    }
    return { fel: null, koreograferade, rader: ut };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.koreograferade.length > 0,
    'VyraGifterFas.modeller ar TOM — den generella vakten hade gronskat utan att prova nagonting');

  for (const u of r.rader) {
    assert.equal(u.fel, undefined, `${u.layout}: ${u.fel}`);
    assert.ok(u.orbit.synlig || u.botten.synlig,
      `Modell ${u.layout} har inget synligt portratt att grinda fas 2 pa: ` +
      `.gifter-orbit img ${u.orbit.finns ? '(slackt)' : '(saknas)'}, ` +
      `.gifter-bottom-profile img ${u.botten.finns ? '(slackt)' : '(saknas)'}. ` +
      `Decode-grinden skulle vakta ingenting.`);
  }
});

// ---- G2 (tidigare 8f). Fas-CSS finns, och spenderar ingen rorelse pa ett slackt element -------
// FYND B, mätt 2026-08-15: `.gifter-big-level,.gifter-bottom-profile{display:none}`
// (studio.css:202) ar en BASREGEL. Bara `number` tander bottenportrattet igen. Flera modellers
// befintliga -active/-exit-regler animerar darfor ett display:none-element — dod rorelse.
// Vi stadar INTE det bakat (beslut 2026-08-15), men koreografierna far inte upprepa felet.
//
// Provet laser den LEVANDE CSSOM:en (document.styleSheets), inte filtext — det ar det
// webblasaren faktiskt parsat, och det tacker bade studio.css och premium-final.css.
test('G2. fas-CSS finns for varje koreograferad modell och riktar sig aldrig mot ett slackt .gifter-bottom-profile',
  { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async () => {
    const G = window.VyraGifterFas;
    if (!G || !Array.isArray(G.modeller)) return { fel: 'VyraGifterFas.modeller saknas' };
    const koreograferade = G.modeller.slice();

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
    for (const layout of koreograferade) {
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

    const ut = koreograferade.map(layout => {
      const klass = '.gifter-layout-' + layout;
      /* `[data-fas` UTAN avslutande hakparentes. Fasreglerna skrivs `[data-fas="ljus"]` osv,
         och ett filter pa `[data-fas]` hittar bara neutraliseringsblocket — alltsa just de
         regler som INTE gor nagot. Uppmatt: 8 traffar i stallet for hela koreografin, och en
         bottenprofil-regel scopad till en enskild fas hade sluppit rakt igenom vakten. */
      const fasRegler = valjare.filter(v => v.sel.includes(klass) && v.sel.includes('[data-fas'));
      return {
        layout,
        antalFasRegler: fasRegler.length,
        bottenSlackt: bottenSlackt[layout],
        brytare: fasRegler.filter(v => v.sel.includes('.gifter-bottom-profile')).map(v => v.sel),
      };
    });
    return { fel: null, koreograferade, rader: ut };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.koreograferade.length > 0,
    'VyraGifterFas.modeller ar TOM — den generella vakten hade gronskat utan att prova nagonting');

  for (const u of r.rader) {
    assert.ok(u.antalFasRegler > 0,
      `Modell ${u.layout} har noll CSS-regler som bade namner ${'.gifter-layout-' + u.layout} ` +
      `och [data-fas] — fas-CSS:en ar inte skriven. Motorn skulle satta attributet utan att ` +
      `nagot syns.`);

    if (u.bottenSlackt) {
      assert.equal(u.brytare.length, 0,
        `Modell ${u.layout}: ${u.brytare.length} fas-regel(er) riktar sig mot ` +
        `.gifter-bottom-profile, som ar display:none i den modellen (basregeln i ` +
        `studio.css:202). Rorelsen skulle aldrig synas. Brytande valjare:\n  ` +
        u.brytare.join('\n  '));
    }
  }
});
