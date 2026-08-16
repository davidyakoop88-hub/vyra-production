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

/* En 1x1-pixel som kan serveras med godtycklig fordrojning. G3 behover kunna gora EN bild
   langsam i taget for att visa vilket element grinden faktiskt vantar pa. */
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

      // Ankaret lases nu ur tabellen via G.ankare(layout). Bada kandidaterna mats anda, dels
      // for att felmeddelandet ska kunna saga vilken som HADE dugt, dels for att skilja
      // "modellen deklarerar fel ankare" fran "ingen av dem syns".
      const matt = sel => {
        const el = box.querySelector(sel);
        if (!el) return { finns: false, synlig: false };
        const s = getComputedStyle(el), rect = el.getBoundingClientRect();
        return { finns: true,
                 synlig: s.display !== 'none' && s.visibility !== 'hidden' &&
                         Number(s.opacity) > 0.01 && rect.width > 1 && rect.height > 1,
                 matt: Math.round(rect.width) + 'x' + Math.round(rect.height) };
      };
      const deklarerat = typeof G.ankare === 'function' ? G.ankare(layout) : undefined;
      ut.push({ layout, deklarerat,
                deklaratMatt: typeof deklarerat === 'string' ? matt(deklarerat) : null,
                orbit: matt('.gifter-orbit img'), botten: matt('.gifter-bottom-profile img') });
    }
    return { fel: null, koreograferade, rader: ut };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.ok(r.koreograferade.length > 0,
    'VyraGifterFas.modeller ar TOM — den generella vakten hade gronskat utan att prova nagonting');

  for (const u of r.rader) {
    assert.equal(u.fel, undefined, `${u.layout}: ${u.fel}`);

    // Kontrollmatning FORST: finns det overhuvudtaget ett synligt portratt i modellen?
    // Utan den skulle nasta pastaende inte kunna skilja "fel ankare valt" fran
    // "modellen har inget portratt alls", och felmeddelandet hade skickat felsokningen fel.
    assert.ok(u.orbit.synlig || u.botten.synlig,
      `Modell ${u.layout} har inget synligt portratt att grinda fas 2 pa: ` +
      `.gifter-orbit img ${u.orbit.finns ? '(slackt)' : '(saknas)'}, ` +
      `.gifter-bottom-profile img ${u.botten.finns ? '(slackt)' : '(saknas)'}. ` +
      `Decode-grinden skulle vakta ingenting.`);

    // OCH att det ar det DEKLARERADE ankaret som syns. Den forra versionen godtog att
    // NAGON av kandidaterna syntes, sa en modell kunde deklarera `.gifter-orbit img` medan
    // bara bottenportrattet var synligt — grinden hade da vantat pa ett element som aldrig
    // renderas, och provet hade varit gront. Det ar precis den fallan `number` star i.
    assert.equal(typeof u.deklarerat, 'string',
      `VyraGifterFas.ankare("${u.layout}") gav ${JSON.stringify(u.deklarerat)} — tabellen ` +
      'exporterar inte sitt decodeAnkare, sa provet kan inte kontrollera VILKET element ' +
      'grinden vaktar. Lagg till ankare() i exporten.');
    assert.ok(u.deklaratMatt && u.deklaratMatt.synlig,
      `Modell ${u.layout} deklarerar decodeAnkare "${u.deklarerat}" men det elementet ` +
      `${u.deklaratMatt && u.deklaratMatt.finns ? 'ar SLACKT' : 'FINNS INTE'} i den tanda ` +
      `widgeten. Synliga kandidater: ` +
      `${[u.orbit.synlig && '.gifter-orbit img', u.botten.synlig && '.gifter-bottom-profile img']
        .filter(Boolean).join(', ') || 'inga'}. ` +
      'Grinden vaktar ett element som aldrig renderas — fas 2 oppnar mot en tom yta.');
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

// ---- G3. Grinden vantar pa MODELLENS EGET ankare, inte pa en hardkodad valjare ----------------
// G1 ar strukturell: den sager att det deklarerade ankaret SYNS. Den kan inte saga att grinden
// faktiskt tittar dit. Skillnaden spelar roll i det ogonblick en modell behover ett annat
// portratt an de ovriga — `number` slacker `.gifter-orbit img` och maste peka pa
// `.gifter-bottom-profile img`. Vore uppslaget hardkodat nagonstans skulle G1 vara gron medan
// fas 2 anda oppnade mot en oavkodad bild.
//
// METOD: gor EN bild langsam i taget.
//   A) langsam bild i det DEKLARERADE ankaret  -> fas 2 ska HALLAS TILLBAKA
//   B) langsam bild i den ANDRA kandidaten     -> fas 2 ska INTE hallas tillbaka
// Bagge behovs. Bara A hade passerat aven med en hardkodad valjare som rakade peka ratt for
// de modeller som provas i dag; det ar B som visar att grinden inte vaktar nagot annat.
//
// Provet kan bara mata modeller dar grinden overhuvudtaget KAN binda, alltsa dar
// decodeTak > anticipationMs. Med tak 500 mot en ljusfas pa 500 tacker uppbyggnaden redan hela
// avkodningsfonstret och grinden ar en strukturell no-op — da finns ingen skillnad att mata.
test('G3. decode-grinden vantar pa modellens egna decodeAnkare, inte pa en hardkodad valjare',
  { skip, timeout: 300000 }, async () => {
    const page = await studion();
    const r = await page.evaluate(async () => {
      const G = window.VyraGifterFas;
      if (!G || !Array.isArray(G.modeller)) return { fel: 'VyraGifterFas.modeller saknas' };
      if (typeof G.ankare !== 'function' || typeof G.decodeTak !== 'function')
        return { fel: 'VyraGifterFas exporterar inte ankare()/decodeTak() — provet kan inte ' +
                      'veta vilket element modellen sager sig vakta, eller om grinden kan binda' };

      const KANDIDATER = ['.gifter-orbit img', '.gifter-bottom-profile img'];
      const ut = [];

      for (const layout of G.modeller) {
        const tider = G.tider(layout) || {};
        const tak = G.decodeTak(layout);
        const ankare = G.ankare(layout);
        if (!(tak > (tider.anticipationMs || 0))) { ut.push({ layout, hoppad: true, tak, tider }); continue }
        const andra = KANDIDATER.find(s => s !== ankare);
        if (!andra) { ut.push({ layout, fel: `okand ankarvaljare "${ankare}"` }); continue }

        /* KON MASTE VARA LEDIG INNAN VARJE KORNING — annars mater provet fel sak.
           `clear()` tommer de VANTANDE men slapper inte den SPELANDE sloten, och slotten ar
           gifterDuration + koreografins langd. Andra korningens trigger lag darfor och vantade
           i ~3 s medan den langsamma bilden i lugn och ro laddades klart: nar sekvensen val
           startade var bilden REDAN AVKODAD och grinden slapp igenom vid 508 ms. Det sag ut
           som en grind som inte vaktade. Reveal (forsta modellen, tom ko) matte ratt, flip och
           duo fel — samma signatur som en cache, vilket forst ledde mig fel.
           Proben har lagsta prioritet och kor darfor forst nar allt annat slappt sloten; att
           den KOR ar beviset. Sedan vantas dess egen slot (kon haller minst 800 ms) ut.
           OBS DURATION 1, INTE 0. Kon slapper sloten efter `Math.max(800, job.duration||5000)`
           (runtime-controls.js:38), och `0||5000` ar 5000 — en probe med duration 0 haller
           alltsa sloten i FEM SEKUNDER. Med det felet startade sekvensen forst vid 4089 ms
           medan bilden var klar vid 820, sa grinden slapp igenom vid 504 ms och det sag ut som
           att den inte vaktade. Uppmatt med scratchpad/mat-grind.js. */
        const vantaPaLedigKo = async () => {
          let kord = false;
          window.VyraAlertQueue.push(() => { kord = true }, 1, -100);
          const deadline = performance.now() + 15000;
          while (performance.now() < deadline && !kord)
            await new Promise(r => setTimeout(r, 20));
          await new Promise(r => setTimeout(r, 900));
          return kord;
        };

        const kor = async (langsamPa) => {
          state.widgets.length = 0;
          const g = window.VyraWidgets.create('catalog:gifterlevel:' + layout);
          g.x = 40; g.y = 40; g.gifterDuration = 1;
          state.widgets.push(g); selected = null; render();
          for (let i = 0; i < 90 && !document.querySelector(`[data-id="${g.id}"]`); i++)
            await new Promise(r => requestAnimationFrame(r));
          const box = document.querySelector(`[data-id="${g.id}"]`);
          if (!box) return { fel: layout + ' renderades inte' };

          /* VARJE HAMTNING MASTE VARA UNIK. Forsta forsoket ateranvande samma URL for alla
             modeller: reveal (den forsta) matte ratt, men flip och duo fick en REDAN AVKODAD
             bild ur webblasarens minnescache och oppnade vid 510 ms — det sag ut som en grind
             som inte vaktade, fast det var cachen. `cache-control: no-store` racker inte;
             den styr HTTP-lagret, inte dokumentets avkodade bilder. */
          for (const sel of KANDIDATER) {
            const el = box.querySelector(sel);
            if (!el) return { fel: `${layout}: ${sel} finns inte i markupen` };
            const ms = sel === langsamPa ? 800 : 60;
            el.src = `/bild.png?ms=${ms}&n=${encodeURIComponent(layout + ':' + langsamPa + ':' + sel)}`;
          }

          /* MAT FRAN LJUSFASENS BORJAN, inte fran triggern. De tva korningarna ligger i
             foljd och kon slapper inte sin spelande slot bara for att clear() anropas —
             forsta forsoket matte 2695 ms och sag ut som en grind som holl kvar, medan det
             i sjalva verket var run A:s koslot (gifterDuration 1 s + koreografins 2 s).
             Avstandet ljus -> oppna ar immunt mot allt som hander fore tandningen. */
          let ljus = null, oppna = null;
          new MutationObserver(() => {
            const f = box.getAttribute('data-fas');
            if (f === 'ljus' && ljus === null) ljus = performance.now();
            if (f === 'oppna' && oppna === null && ljus !== null)
              oppna = Math.round(performance.now() - ljus);
          }).observe(box, { attributes: true, attributeFilter: ['data-fas'] });

          if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
          window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

          // ABSOLUT grans tagen FORE loopen, och tilltagen sa den rymmer koslotten.
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
    // Utan den har raden hade provet varit tyst gront den dag alla modeller far tak 500.
    assert.ok(matta.length > 0,
      'ingen modell har decodeTak > anticipationMs, sa grinden kan inte binda nagonstans och ' +
      'provet har inte matt nagonting. Hoppade: ' +
      JSON.stringify(r.rader.map(u => `${u.layout} (tak ${u.tak})`)));

    for (const u of matta) {
      assert.equal(u.fel, undefined, `${u.layout}: ${u.fel}`);
      // Kontrollmatning: bekraftar att kon faktiskt var ledig fore bada korningarna. Utan den
      // kan ett rott utfall lika garna vara kolatens som en felvaktande grind.
      assert.ok(u.ledigA && u.ledigB,
        `${u.layout}: kon blev aldrig ledig fore korningarna (A=${u.ledigA}, B=${u.ledigB}) — ` +
        'matningen skulle inte kunna skilja grindens fordrojning fran koslottens');
      assert.ok(u.aOppna != null && u.bOppna != null,
        `${u.layout}: fas 2 kom aldrig (A=${u.aOppna}, B=${u.bOppna})`);
      const grans = (u.anticipation + u.tak) / 2;   // 700 ms vid 500/900
      assert.ok(u.aOppna > grans,
        `${u.layout}: en LANGSAM bild i det deklarerade ankaret "${u.ankare}" holl inte ` +
        `tillbaka fas 2 — den oppnade vid ${u.aOppna} ms (uppbyggnaden ar ${u.anticipation} ms). ` +
        'Grinden vaktar alltsa inte det element modellen sager.');
      assert.ok(u.bOppna < grans,
        `${u.layout}: en langsam bild i "${u.andra}" — som modellen INTE deklarerat — holl ` +
        `tillbaka fas 2 till ${u.bOppna} ms. Grinden vaktar ett element den inte borde, ` +
        'sannolikt en hardkodad valjare.');
    }
  });
