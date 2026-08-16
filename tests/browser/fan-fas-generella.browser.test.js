'use strict';
// Fan Level Up · GENERELLA VAKTER over hela modelltabellen — F1, F2, F3.
// Systerfil till gifter-fas-generella.browser.test.js (G1-G3). De modellspecifika proven bor
// i en fil per modell (16-serien = hero, 17 = stack, ...); de har loopar over VyraFanFas.modeller
// och far varje ny modell pa kopet.
//
// VARFOR DE KOMMER FORST NU: en vakt som loopar over en tabell med EN post bevisar nastan
// ingenting, och "tom lista gronskar" ar en kand falla — darfor faller F1-F3 explicit om
// listan ar tom. Nu nar tabellen far sin andra post bar de sin vikt.
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

const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];

async function studion() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(3000);
  return page;
}

// ---- F1. Decode-ankaret pekar pa nagot som faktiskt SYNS --------------------------------------
// En grind som vantar pa ett display:none-element avkodar anda (bilden laddas), sa modellens
// egna decode-prov skulle passera medan grinden i praktiken vaktar ingenting och fas 2 oppnar
// mot en tom yta. Ankaret lases ur tabellen via VyraFanFas.ankare — provet ska kontrollera det
// modellen SAGER, inte gissa bland kandidater.
test('F1. varje koreograferad Fan-modells decodeAnkare pekar pa ett synligt element',
  { skip, timeout: 300000 }, async () => {
    const page = await studion();
    const r = await page.evaluate(async () => {
      const F = window.VyraFanFas;
      if (!F || !Array.isArray(F.modeller)) return { fel: 'VyraFanFas.modeller saknas' };
      const ut = [];
      for (const layout of F.modeller) {
        state.widgets.length = 0;
        const w = window.VyraWidgets.create('catalog:fanlevel:layout:' + layout);
        w.x = 40; w.y = 40; w.fanDuration = 2;
        state.widgets.push(w); selected = null; render();
        for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
          await new Promise(r => requestAnimationFrame(r));
        const box = document.querySelector(`[data-id="${w.id}"]`);
        if (!box) { ut.push({ layout, fel: 'renderades inte' }); continue }

        if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
        window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 9 });
        // Widgeten ligger pa opacity:0 tills den tands — allt matt fore det blir SLACKT.
        const t0 = performance.now();
        while (performance.now() - t0 < 9000 &&
               !box.className.split(/\s+/).includes('fan-active'))
          await new Promise(r => setTimeout(r, 40));
        await new Promise(r => setTimeout(r, 400));

        const ankare = typeof F.ankare === 'function' ? F.ankare(layout) : undefined;
        const el = typeof ankare === 'string' ? box.querySelector(ankare) : null;
        const matt = (() => {
          if (!el) return { finns: false, synlig: false };
          const s = getComputedStyle(el), rect = el.getBoundingClientRect();
          return { finns: true,
            synlig: s.display !== 'none' && s.visibility !== 'hidden'
                    && Number(s.opacity) > 0.01 && rect.width > 1 && rect.height > 1,
            matt: Math.round(rect.width) + 'x' + Math.round(rect.height) };
        })();
        ut.push({ layout, ankare, ...matt });
      }
      return { fel: null, modeller: F.modeller.slice(), rader: ut };
    });
    await page.close();

    assert.equal(r.fel, null, r.fel);
    assert.ok(r.modeller.length > 0,
      'VyraFanFas.modeller ar TOM — vakten hade gronskat utan att prova nagonting');
    for (const u of r.rader) {
      assert.equal(u.fel, undefined, `${u.layout}: ${u.fel}`);
      assert.equal(typeof u.ankare, 'string',
        `VyraFanFas.ankare("${u.layout}") gav ${JSON.stringify(u.ankare)} — tabellen maste ` +
        'exponera sitt decodeAnkare, annars gar det inte att kontrollera vad grinden vaktar.');
      assert.ok(u.synlig,
        `Modell ${u.layout} deklarerar decodeAnkare "${u.ankare}" men elementet ` +
        `${u.finns ? 'ar SLACKT' : 'FINNS INTE'} i den tanda widgeten (matt ${u.matt}). ` +
        'Grinden vaktar nagot som aldrig renderas — fas 2 oppnar mot en tom yta.');
    }
  });

// ---- F2. Fas-CSS finns, och spenderar aldrig rorelse pa ett slackt element --------------------
// Gifters G2 vaktade EN kand fallucka (.gifter-bottom-profile). Fan har atta layouter som
// slacker olika delar — hero doljer vingar, puls, ring och banderoll; stack doljer aven dem;
// hearts saknar profilbild. En handskriven lista hade darfor blivit fel direkt. Provet loser
// upp fas-reglernas EGNA valjare mot en tand widget i stallet och kraver att det de traffar
// faktiskt syns.
test('F2. fas-CSS finns for varje Fan-modell och riktar sig aldrig mot ett slackt element',
  { skip, timeout: 300000 }, async () => {
    const page = await studion();
    const r = await page.evaluate(async (faser) => {
      const F = window.VyraFanFas;
      if (!F || !Array.isArray(F.modeller)) return { fel: 'VyraFanFas.modeller saknas' };

      /* Samla alla fas-scopade valjare ur stilmallarna. Filtret pa `[data-fas` ar medvetet
         UTAN avslutande hakparentes: med `]` ser man bara neutraliseringsblock, aldrig
         `[data-fas="ljus"]`, och en fasscopad regel slinker igenom. Samma falla som gifters 8f. */
      const valjare = [];
      /* Mediakontexten maste folja med ned i traversen. Forsta versionen slangde den, och da
         plockades `@media (prefers-reduced-motion: reduce){ .fan-layout-hero[data-fas] * }`
         upp som en vanlig fas-regel — dess `*` traffar sjalvklart varje slackt element i
         widgeten, och vakten rapporterade sju falska brott. Den regeln ar en GENERELL
         sakerhetssparr, inte rorelse spenderad pa en viss del. */
      const gaIgenom = (regler, media) => {
        for (const regel of regler) {
          if (regel.cssRules && !regel.selectorText) {
            gaIgenom(regel.cssRules, media || (regel.conditionText || regel.media
              && regel.media.mediaText) || '');
            continue;
          }
          if (regel.selectorText) valjare.push({ sel: regel.selectorText, media: media || '' });
        }
      };
      for (const ark of document.styleSheets) {
        try { gaIgenom(ark.cssRules, '') } catch (e) { /* cross-origin — finns inte lokalt */ }
      }

      const ut = [];
      for (const layout of F.modeller) {
        const mina = [];
        for (const v of valjare) {
          // Sakerhetssparren for reducerad rorelse ar med FLIT en blankettregel — den ska
          // trafta allt, aven det som ar slackt.
          if (/prefers-reduced-motion/.test(v.media)) continue;
          for (const del of v.sel.split(',')) {
            const d = del.trim();
            if (d.includes('.fan-layout-' + layout) && d.includes('[data-fas')) mina.push(d);
          }
        }

        state.widgets.length = 0;
        const w = window.VyraWidgets.create('catalog:fanlevel:layout:' + layout);
        w.x = 40; w.y = 40; w.fanDuration = 2;
        state.widgets.push(w); selected = null; render();
        for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
          await new Promise(r => requestAnimationFrame(r));
        const box = document.querySelector(`[data-id="${w.id}"]`);
        if (!box) { ut.push({ layout, fel: 'renderades inte' }); continue }

        if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
        window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 9 });
        const t0 = performance.now();
        while (performance.now() - t0 < 9000 &&
               !box.className.split(/\s+/).includes('fan-active'))
          await new Promise(r => setTimeout(r, 40));
        await new Promise(r => setTimeout(r, 400));

        /* Sla upp vad varje regel faktiskt TRAFFAR. Allt fram till och med [data-fas...] ar
           scopet; resten ar vagen ned i widgeten. Ar resten tom traffar regeln roten sjalv. */
        const brytare = [];
        for (const sel of mina) {
          let svans = sel.split(/\[data-fas[^\]]*\]/).pop().trim();
          if (!svans) continue;                      // regeln traffar roten — alltid synlig
          if (svans === '*') continue;               // blankettregel, inte riktad rorelse
          /* En svans som borjar med `>` ar ogiltig for querySelectorAll pa egen hand.
             `:scope` gor den giltig OCH bevarar att det ar ett DIREKT barn — utan det
             hoppades varje `> h2`-regel tyst over, och vakten hade inte sett dem alls. */
          if (svans.startsWith('>')) svans = ':scope ' + svans;
          let traffar = [];
          try { traffar = [...box.querySelectorAll(svans)] } catch (e) { continue }
          if (!traffar.length) { brytare.push({ sel, varfor: 'traffar ingenting alls' }); continue }
          for (const el of traffar) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none')
              brytare.push({ sel, varfor: 'traffar ett display:none-element' });
          }
        }
        ut.push({ layout, antal: mina.length, brytare });
      }
      return { fel: null, modeller: F.modeller.slice(), rader: ut, faser };
    }, FASER);
    await page.close();

    assert.equal(r.fel, null, r.fel);
    assert.ok(r.modeller.length > 0,
      'VyraFanFas.modeller ar TOM — vakten hade gronskat utan att prova nagonting');
    for (const u of r.rader) {
      assert.equal(u.fel, undefined, `${u.layout}: ${u.fel}`);
      assert.ok(u.antal > 0,
        `Modell ${u.layout} har noll CSS-regler som bade namner .fan-layout-${u.layout} och ` +
        '[data-fas] — fas-CSS:en ar inte skriven. Motorn skulle satta attributet utan att ' +
        'nagot syns.');
      assert.equal(u.brytare.length, 0,
        `Modell ${u.layout}: ${u.brytare.length} fas-regel(er) spenderar rorelse pa nagot som ` +
        'inte syns i den modellen. Rorelsen skulle aldrig markas.\n  ' +
        u.brytare.map(b => `${b.sel}  (${b.varfor})`).join('\n  '));
    }
  });

// ---- F3. Grinden vantar pa MODELLENS EGET ankare, inte pa en hardkodad valjare ----------------
// F1 ar strukturell: den sager att ankaret SYNS. Den kan inte saga att grinden tittar dit.
// METOD: gor EN bild langsam i taget.
//   A) langsam bild i det DEKLARERADE ankaret  -> fas 2 ska HALLAS TILLBAKA
//   B) langsam bild i den ANDRA kandidaten     -> fas 2 ska INTE hallas tillbaka
// Bara A hade passerat aven med en hardkodad valjare som rakade peka ratt.
//
// TVA MATFALLOR SOM GIFTERS G3 KOSTADE, bada undvikna har:
//   * Mat `ljus -> oppna`, ALDRIG fran triggern. `clear()` tommer de vantande men slapper inte
//     den SPELANDE sloten, sa nasta korning kan ligga och vanta i sekunder.
//   * Probens duration maste vara 1, inte 0. Kon slapper sloten efter
//     `Math.max(800, job.duration||5000)` — och `0||5000` ar 5000.
test('F3. decode-grinden vantar pa modellens egna decodeAnkare, inte pa en hardkodad valjare',
  { skip, timeout: 300000 }, async () => {
    const page = await studion();
    const r = await page.evaluate(async () => {
      const F = window.VyraFanFas;
      if (!F || !Array.isArray(F.modeller)) return { fel: 'VyraFanFas.modeller saknas' };
      if (typeof F.ankare !== 'function' || typeof F.decodeTak !== 'function')
        return { fel: 'VyraFanFas exporterar inte ankare()/decodeTak()' };

      const KANDIDATER = ['.fan-profile img', '.fan-burst img'];
      const ut = [];

      const vantaPaLedigKo = async () => {
        let kord = false;
        window.VyraAlertQueue.push(() => { kord = true }, 1, -100);
        const deadline = performance.now() + 15000;
        while (performance.now() < deadline && !kord)
          await new Promise(r => setTimeout(r, 20));
        await new Promise(r => setTimeout(r, 900));
        return kord;
      };

      for (const layout of F.modeller) {
        const tider = F.tider(layout) || {};
        const tak = F.decodeTak(layout);
        const ankare = F.ankare(layout);
        if (!(tak > (tider.anticipationMs || 0))) { ut.push({ layout, hoppad: true, tak }); continue }
        const andra = KANDIDATER.find(s => s !== ankare);
        if (!andra) { ut.push({ layout, fel: `okand ankarvaljare "${ankare}"` }); continue }

        const kor = async (langsamPa) => {
          state.widgets.length = 0;
          const w = window.VyraWidgets.create('catalog:fanlevel:layout:' + layout);
          w.x = 40; w.y = 40; w.fanDuration = 1;
          state.widgets.push(w); selected = null; render();
          for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
            await new Promise(r => requestAnimationFrame(r));
          const box = document.querySelector(`[data-id="${w.id}"]`);
          if (!box) return { fel: layout + ' renderades inte' };

          // Unik URL per hamtning — annars serverar webblasaren en REDAN AVKODAD bild ur sitt
          // minne och grinden ser ut att inte vakta. `cache-control: no-store` racker inte.
          for (const sel of KANDIDATER) {
            const el = box.querySelector(sel);
            if (!el) return { fel: `${layout}: ${sel} finns inte i markupen` };
            const ms = sel === langsamPa ? 800 : 60;
            el.src = `/bild.png?ms=${ms}&n=${encodeURIComponent(layout + ':' + langsamPa + ':' + sel)}`;
          }

          let ljus = null, oppna = null;
          new MutationObserver(() => {
            const f = box.getAttribute('data-fas');
            if (f === 'ljus' && ljus === null) ljus = performance.now();
            if (f === 'oppna' && oppna === null && ljus !== null)
              oppna = Math.round(performance.now() - ljus);
          }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

          if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
          window.triggerFanLevelUp({ __test: true, name: 'Prov', level: 9 });

          const deadline = performance.now() + 12000;
          while (performance.now() < deadline && oppna === null)
            await new Promise(r => setTimeout(r, 10));
          return { oppna };
        };

        const ledigA = await vantaPaLedigKo();
        const a = await kor(ankare);
        const ledigB = await vantaPaLedigKo();
        const b = await kor(andra);
        ut.push({ layout, ankare, andra, tak, anticipation: tider.anticipationMs,
                  aOppna: a.oppna, bOppna: b.oppna, ledigA, ledigB, fel: a.fel || b.fel });
      }
      return { fel: null, rader: ut };
    });
    await page.close();

    assert.equal(r.fel, null, r.fel);
    const matta = r.rader.filter(u => !u.hoppad);
    assert.ok(matta.length > 0,
      'ingen Fan-modell har decodeTak > anticipationMs, sa grinden kan inte binda nagonstans ' +
      'och provet har inte matt nagonting. Hoppade: ' +
      JSON.stringify(r.rader.map(u => `${u.layout} (tak ${u.tak})`)));

    for (const u of matta) {
      assert.equal(u.fel, undefined, `${u.layout}: ${u.fel}`);
      assert.ok(u.ledigA && u.ledigB,
        `${u.layout}: kon blev aldrig ledig fore korningarna — matningen skulle inte kunna ` +
        'skilja grindens fordrojning fran koslottens');
      assert.ok(u.aOppna != null && u.bOppna != null,
        `${u.layout}: fas 2 kom aldrig (A=${u.aOppna}, B=${u.bOppna})`);
      const grans = (u.anticipation + u.tak) / 2;
      assert.ok(u.aOppna > grans,
        `${u.layout}: en LANGSAM bild i det deklarerade ankaret "${u.ankare}" holl inte ` +
        `tillbaka fas 2 — den oppnade vid ${u.aOppna} ms. Grinden vaktar inte det modellen sager.`);
      assert.ok(u.bOppna < grans,
        `${u.layout}: en langsam bild i "${u.andra}" — som modellen INTE deklarerat — holl ` +
        `tillbaka fas 2 till ${u.bOppna} ms. Grinden vaktar nagot den inte borde.`);
    }
  });
