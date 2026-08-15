'use strict';
// Gifter Level Up · risingtier — fyrafaskoreografi. Prov 7a-7e, skrivna FORE koden.
//
// VALD MODELL: risingtier. Den har 25 CSS-regler och den enda fardiga uppsattningen separat
// animerbara element (.gd-1/.gd-2/.gd-3 med graderad opacitet 1/.5/.22 och egen --tier-end-op),
// plus .gifter-arrow-up som bara visas i den har layouten. Fas 1 behover nagot att bygga upp.
//
// Proven mater `data-fas`-attributet via MutationObserver i stallet for att haka i motorns
// vidFas-aterrop. Da provas INTEGRATIONEN — att dekoratorn faktiskt driver widgeten — och inte
// bara att motorn kan rakna.
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

    // Bild med styrbar fordrojning — proven for decode-grinden behover exakta tider.
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

const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];
const PLAN = { anticipationMs: 500, enterMs: 900, exitMs: 600 };

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

/* Tander en risingtier-widget och loggar nar varje fas BORJADE, mätt pa data-fas.
   `bildSrc` byter ut profilbildens src innan tandningen sa decode-grinden kan provas. */
async function korGifter(page, { gifterDuration = 2, bildSrc = null, ocksaFan = false } = {}) {
  return page.evaluate(async (arg) => {
    state.widgets.length = 0;
    const g = window.VyraWidgets.create('catalog:gifterlevel:risingtier');
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
    if (!box) return { fel: 'risingtier renderades inte' };

    const bild = box.querySelector('.gifter-orbit img');
    if (arg.bildSrc) { if (!bild) return { fel: 'ingen profilbild i .gifter-orbit' }; bild.src = arg.bildSrc; }

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
    // Fan tands DIREKT efter — det ar hela poangen med 7c: kon far inte slappa fram den
    // mitt i Gifters sekvens.
    if (fan) window.triggerFanLevelUp({ __test: true, name: 'FanProv', level: 9 });

    let fanVid = null;
    const slut = arg.gifterDuration * 1000 + 6000;
    const start = performance.now();
    while (performance.now() - start < slut) {
      if (fan && fanVid === null) {
        const fe = document.querySelector(`[data-id="${fan.id}"]`);
        if (fe?.className.split(/\s+/).includes('fan-active')) fanVid = Math.round(performance.now() - t0);
      }
      if (!fan && logg.length >= 4 && performance.now() - t0 >
          logg[3].vid + 800) break;
      await new Promise(r => setTimeout(r, 25));
    }
    return { fel: null, logg, fanVid,
             gifterAktivSattes: box.dataset.sagGifterActive === '1' || undefined,
             slutKlass: box.className, slutDataFas: box.getAttribute('data-fas') };
  }, { gifterDuration, bildSrc, ocksaFan });
}

// ---- 7a. Fasordning och langder --------------------------------------------------------------
test('7a. risingtier kor alla fyra faser i ratt ordning med planerade langder', { skip }, async () => {
  const page = await studion();
  const r = await korGifter(page, { gifterDuration: 2 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.deepEqual(r.logg.map(l => l.fas), FASER,
    `fasordningen blev ${JSON.stringify(r.logg.map(l => l.fas))}`);

  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  const nara = (fick, vantat, vad) => assert.ok(Math.abs(fick - vantat) <= 150,
    `${vad}: ${fick} ms, planerat ~${vantat} ms`);
  nara(vid.ljus, 0, 'ljus startar direkt');
  nara(vid.oppna, PLAN.anticipationMs, 'oppna startar efter anticipationMs');
  nara(vid.hyllning, PLAN.anticipationMs + PLAN.enterMs, 'hyllning startar efter enterMs');
  nara(vid.upplosning, PLAN.anticipationMs + PLAN.enterMs + 2000, 'upplosning startar efter holdMs');
});

// ---- 7b. holdMs kommer fran widgetens gifterDuration ------------------------------------------
// Samma anda som prov 6e: skydd mot att nagon skriver in ett fast varde. 3 s ar medvetet skilt
// fran standardvardet 6 s, sa ett hardkodat 6000 inte kan smita igenom.
test('7b. hyllningsfasen laser gifterDuration, inte ett fast varde', { skip }, async () => {
  const page = await studion();
  const r = await korGifter(page, { gifterDuration: 3 });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.hyllning != null && vid.upplosning != null, 'hyllning eller upplosning uteblev');
  const hyllning = vid.upplosning - vid.hyllning;
  assert.ok(Math.abs(hyllning - 3000) <= 250,
    `hyllningen varade ${hyllning} ms — widgetens gifterDuration ar 3 s. ` +
    `Ligger den nara 6000 ms laser koreografin ett fast varde i stallet for widgeten.`);
});

// ---- 7c. Kointegration -------------------------------------------------------------------------
// Fan tands direkt efter Gifter. Kon far inte slappa fram Fan mitt i Gifters sekvens.
// OBS: om provet visar att kon bara kanner till gifterDuration och inte hela sekvenslangden
// (500 + 900 + hold + 600) ska det RAPPORTERAS, inte lagas har — runtime-controls.js ar last.
test('7c. kon slapper inte fram nasta alert mitt i Gifters sekvens', { skip }, async () => {
  const page = await studion();
  const r = await korGifter(page, { gifterDuration: 2, ocksaFan: true });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.upplosning != null, 'Gifter nadde aldrig upplosningsfasen');
  const sekvensSlut = vid.upplosning + PLAN.exitMs;
  assert.notEqual(r.fanVid, null, 'Fan fick aldrig sin tur inom provets tidsfonster');
  assert.ok(r.fanVid >= sekvensSlut - 200,
    `Fan tandes vid ${r.fanVid} ms men Gifters sekvens var klar forst vid ${sekvensSlut} ms — ` +
    `kon kanner bara till gifterDuration, inte hela sekvenslangden. RAPPORTERA, laga inte har.`);
});

// ---- 7d. Isolering — sjalvunderhallande mot modelltabellen ------------------------------------
// Provet hade fram till modell 2 en HANDSKRIVEN lista over de atta okoreograferade modellerna och
// kravde att de saknade data-fas. Den listan hade behovt andras atta ganger till — en gang per ny
// koreografi — och varje sadant tillfalle ar ett tillfalle att glomma.
//
// Nu laser provet i stallet modelltabellen (VyraGifterFas.modeller) och kontrollerar hela
// niomodellsuppsattningen i BADA riktningarna:
//     star i tabellen      -> ska FA data-fas och vyra-fas-klass
//     star inte i tabellen -> ska INTE fa nagondera, men behalla gifter-active
// Det ar en starkare invariant an den gamla (som bara tackte ena hallet), den blir aldrig tom nar
// alla nio ar klara, och den behover aldrig roras igen.
const ALLA_NIO = ['profile', 'number', 'stack', 'sidebadge', 'reveal',
                  'orbitlevel', 'risingtier', 'flip', 'duo'];

test('7d. en modell far koreografi om och endast om den star i modelltabellen', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(async (alla) => {
    const G = window.VyraGifterFas;
    if (!G || !Array.isArray(G.modeller)) return { fel: 'VyraGifterFas.modeller saknas' };
    const tabellen = G.modeller.slice();
    const ut = [];

    for (const layout of alla) {
      state.widgets.length = 0;
      let w = null;
      try { w = window.VyraWidgets.create('catalog:gifterlevel:' + layout) }
      catch (e) { ut.push({ layout, fel: e.message }); continue }
      w.x = 40; w.y = 40; w.gifterDuration = 1;
      state.widgets.push(w); selected = null; render();
      for (let i = 0; i < 90 && !document.querySelector(`[data-id="${w.id}"]`); i++)
        await new Promise(r => requestAnimationFrame(r));
      const box = document.querySelector(`[data-id="${w.id}"]`);
      if (!box) { ut.push({ layout, fel: 'renderades inte' }); continue }

      /* Faserna SAMLAS over hela sekvensen i stallet for att lasas av vid en tidpunkt.
         data-fas tas bort nar sekvensen ar slut, sa en enda avlasning kan missa den helt
         beroende pa var i forloppet man rakar titta. */
      const faser = [];
      let fasKlass = false, aktiv = false;
      const las = () => {
        const f = box.getAttribute('data-fas');
        if (f && faser.indexOf(f) === -1) faser.push(f);
        const kl = box.className.split(/\s+/);
        if (kl.some(c => c.indexOf('vyra-fas-') === 0)) fasKlass = true;
        if (kl.indexOf('gifter-active') !== -1) aktiv = true;
      };
      const obs = new MutationObserver(las);
      obs.observe(box, { attributes: true, attributeFilter: ['data-fas', 'class'] });

      if (window.VyraAlertQueue) window.VyraAlertQueue.clear();
      window.triggerGifterLevelUp({ __test: true, name: 'Prov', level: 12 });

      // Vanta pa att alerten far sin tur i kon i stallet for en fast tid. clear() tommer
      // bara den vantande listan — `busy` star kvar tills den pagaende alertens timer gatt ut,
      // sa nasta layout i loopen hamnar bakom den.
      const t0 = performance.now();
      while (performance.now() - t0 < 9000 && !aktiv) { las(); await new Promise(r => setTimeout(r, 40)) }
      await new Promise(r => setTimeout(r, 300));   // lat fas 1 landa aven om den kommer strax efter
      las();
      obs.disconnect();

      ut.push({ layout, iTabellen: tabellen.indexOf(layout) !== -1, faser, fasKlass, aktiv });
    }
    return { fel: null, tabellen, rader: ut };
  }, ALLA_NIO);
  await page.close();

  assert.equal(r.fel, null, r.fel);

  /* En felstavad nyckel i tabellen skulle aldrig traffa nagon widget, och loopen nedan hade
     aldrig provat den — modellen vore tyst okoreograferad. Fang det har i stallet. */
  for (const m of r.tabellen)
    assert.ok(ALLA_NIO.includes(m),
      `VyraGifterFas.modeller innehaller "${m}", som inte ar nagon av de nio Gifter-layouterna ` +
      `(${ALLA_NIO.join(', ')}) — felstavad modellnyckel?`);

  assert.equal(r.rader.length, ALLA_NIO.length,
    `${r.rader.length} av ${ALLA_NIO.length} modeller provades — provet ska vara uttommande`);

  for (const u of r.rader) {
    assert.equal(u.fel, undefined, `${u.layout}: ${u.fel}`);
    assert.equal(u.aktiv, true, `${u.layout} tappade gifter-active — regression`);

    if (u.iTabellen) {
      assert.ok(u.faser.length > 0,
        `Modell ${u.layout} finns i VyraGifterFas.modeller men saknar fasordning — ` +
        `koreografin ar inte kopplad. Inget data-fas sattes under hela sekvensen, vilket betyder ` +
        `att dekoratorn aldrig drev widgeten (kontrollera postens passar() och decodeAnkare).`);
      assert.equal(u.fasKlass, true,
        `Modell ${u.layout} finns i VyraGifterFas.modeller men fick ingen vyra-fas-klass — ` +
        `koreografin ar inte kopplad.`);
    } else {
      assert.equal(u.faser.length, 0,
        `${u.layout} star INTE i modelltabellen men fick data-fas ${JSON.stringify(u.faser)} — ` +
        `koreografin lacker till en okoreograferad modell`);
      assert.equal(u.fasKlass, false,
        `${u.layout} star INTE i modelltabellen men fick en vyra-fas-klass — koreografin lacker`);
    }
  }
});

// ---- 7e. Decode-grinden i den har koreografin -------------------------------------------------
// Motorns generella prov 3 visar att grinden fungerar. Det har provet visar att den ar RATT
// INKOPPLAD i risingtier: fas 2 far aldrig oppna ramen mot en tom cirkel.
for (const fall of [
  { namn: 'snabb bild (100 ms)', src: '/bild.png?ms=100', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'langsam men inom tidsgransen (300 ms)', src: '/bild.png?ms=300', minOppna: 400, maxOppna: 800, varning: false },
  { namn: 'for sen bild (700 ms, over 500 ms)', src: '/bild.png?ms=700', minOppna: 450, maxOppna: 900, varning: true },
  { namn: 'bilden fallerar (404)', src: '/bild.png?ms=50&fel=1', minOppna: 400, maxOppna: 900, varning: true },
]) {
  test(`7e. decode-grind pa risingtier — ${fall.namn}`, { skip }, async () => {
    const page = await studion();
    const r = await korGifter(page, { gifterDuration: 1, bildSrc: fall.src });
    const varningar = page._varningar.filter(v => /VyraFas/.test(v));
    await page.close();

    assert.equal(r.fel, null, r.fel);
    assert.deepEqual(r.logg.map(l => l.fas), FASER,
      `sekvensen bröts vid "${fall.namn}": ${JSON.stringify(r.logg.map(l => l.fas))}`);
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

// ---- 7f. Dekoreringens engangsgaranti ---------------------------------------------------------
// Filen dekorerade fran borjan en enda modell och vaktade med en boolesk `__vyraFas`. Den vakten
// gjorde det omojligt for en andra koreografifil att installera sig, sa nio modeller hade krävt
// nio filer med var sin flagga — nio wrappers ovanpa varandra pa samma trigger. Modelltabellen
// finns for att det aldrig ska hända: EN dekorator, EN wrapper, N modeller.
//
// Provet raknar lagren utifran, genom wrapperns egen kedja (`__vyraFasInre`), i stallet for att
// lita pa en intern raknare. Aterinfors ett lager-per-modell-monster gar det rott direkt.
test('7f. gifter-fas dekorerar EN gang, oavsett hur manga modeller som ar koreograferade', { skip }, async () => {
  const page = await studion();
  const r = await page.evaluate(() => {
    const G = window.VyraGifterFas;
    if (!G) return { fel: 'VyraGifterFas saknas' };

    const fore = { lager: G.lager(), dekorationer: G.dekorationer() };
    // Be den dekorera igen — versionsvakten ska gora det till en nollhandling.
    const andraForsoket = G.dekorera();
    const efter = { lager: G.lager(), dekorationer: G.dekorationer() };

    const kallor = (window.VyraFasKoreografi || [])
      .map(k => k && k.__kalla).filter(k => typeof k === 'string' && k.indexOf('gifter-fas') === 0);

    return {
      fel: null, fore, efter, andraForsoket,
      // Versionen lases fran VAR wrapper. window.triggerGifterLevelUp ar vid det har laget
      // kons wrapper, som ligger ovanpa oss och inte bar vara flaggor.
      version: G.wrapperVersion(),
      koLiggerOvanpa: window.triggerGifterLevelUp !== undefined &&
                      window.triggerGifterLevelUp.__vyraFasVersion === undefined,
      modeller: G.modeller,
      kallor,
      unikaKallor: [...new Set(kallor)].length,
    };
  });
  await page.close();

  assert.equal(r.fel, null, r.fel);
  assert.equal(r.fore.lager, 1,
    `${r.fore.lager} wrappers ligger pa triggern — det ska vara exakt 1 oavsett antal modeller`);
  assert.equal(r.fore.dekorationer, 1,
    `dekorera() installerade ${r.fore.dekorationer} ganger — forvantat exakt 1`);

  assert.equal(r.andraForsoket, false, 'ett andra dekorera() installerade ett lager till');
  assert.equal(r.efter.lager, 1, `efter ett andra dekorera() ligger ${r.efter.lager} lager pa triggern`);
  assert.equal(r.efter.dekorationer, 1, 'raknaren okade trots att ingen ny wrapper installerades');

  assert.match(String(r.version), /^\d+\.\d+\.\d+$/,
    `wrappern ska bara en semver-version, fick "${r.version}"`);
  // Lagerordningen ar hela forutsattningen for att koreografin kor INUTI kon.
  assert.equal(r.koLiggerOvanpa, true,
    'kons wrapper ligger inte langre ytterst — koreografin riskerar att kora utanfor kon');

  // En publiceringspost per modell, utan dubbletter — kon summerar tiderna och en dubblett
  // hade forlangt luckan tva ganger.
  assert.ok(Array.isArray(r.modeller) && r.modeller.length >= 1, 'modelltabellen ar tom');
  assert.equal(r.kallor.length, r.modeller.length,
    `${r.kallor.length} publiceringsposter for ${r.modeller.length} modeller`);
  assert.equal(r.unikaKallor, r.kallor.length,
    `publiceringslistan har dubbletter: ${JSON.stringify(r.kallor)}`);
});
