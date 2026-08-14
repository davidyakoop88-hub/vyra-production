'use strict';
// widget-fas.js — de sex proven David kravde INNAN motorn kopplas in i nagon widget.
//
// Motorn ar en ADAPTER, inte en renderare: recognition-* bygger sin egen DOM, vara sex
// widgetfamiljer ritas av media.js/premium-final.js. Darfor lanas bara tre saker darifran
// (scheduleTimer + generation, klassvokabularen anticipation/reveal/settled/exit, och
// timing-formen) och appliceras pa BEFINTLIGA noder.
//
// Prov 6 ar avsiktligt en BASLINJE: motorn ar annu inte inkopplad, sa provet laser fast hur
// -active/-exit beter sig IDAG. Nar motorn sedan kopplas in kan den inte tyst andra det.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

// En 1x1 genomskinlig PNG — minsta mojliga bild som faktiskt gar att avkoda.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64');

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');

    // Bild som ALDRIG svarar: enda sattet att prova att decode-grinden slapper igenom pa tid.
    if (rel === 'langsam.png') { res.writeHead(200, { 'content-type': 'image/png' }); return; }
    // Bild som svarar direkt.
    if (rel === 'snabb.png') {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      return res.end(PIXEL);
    }
    // Bild som svarar med skrap -> decode() ska AVVISA, inte hanga.
    if (rel === 'trasig.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(Buffer.from('inte en png alls'));
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

async function riggen() {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(`${bas}/tests/fixtures/fas-rigg.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VyraFas, null, { timeout: 10000, polling: 50 });
  return page;
}

const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];

// Kor en sekvens och returnera nar varje fas BORJADE, i ms fran start.
async function korSekvens(page, { timing, bildSrc, decodeTimeoutMs, extra } = {}) {
  return page.evaluate(async (arg) => {
    const el = window.nyWidget();
    const bild = arg.bildSrc ? window.nyBild(el, arg.bildSrc) : null;
    const start = performance.now();
    const logg = [];
    const klasser = [];

    const id = window.VyraFas.kor(el, Object.assign({
      aktivKlass: 'prov-active',
      exitKlass: 'prov-exit',
      timing: arg.timing,
      bild: bild,
      decodeTimeoutMs: arg.decodeTimeoutMs,
      vidFas: function (fas) {
        logg.push({ fas: fas, vid: Math.round(performance.now() - start) });
        klasser.push({ fas: fas, klass: el.className, dataFas: el.dataset.fas });
      },
    }, arg.extra || {}));

    await new Promise(r => {
      const t = setInterval(() => {
        if (!window.VyraFas.aktiva()) { clearInterval(t); r(); }
      }, 10);
      setTimeout(() => { clearInterval(t); r(); }, 12000);
    });

    return { id, logg, klasser, slutKlass: el.className, slutDataFas: el.dataset.fas || null,
             kvarTimrar: window.VyraFas.aktivaTimrar(), kvarInstanser: window.VyraFas.aktiva() };
  }, { timing, bildSrc, decodeTimeoutMs, extra });
}

// ---- 1. Fas-kontraktet ---------------------------------------------------------------------
test('1. alla fyra faser kors i ratt ordning med ratt langder', { skip }, async () => {
  const page = await riggen();
  const T = { anticipationMs: 200, enterMs: 300, holdMs: 400, exitMs: 200 };
  const r = await korSekvens(page, { timing: T });
  await page.close();

  assert.deepEqual(r.logg.map(l => l.fas), FASER,
    `fasordningen blev ${JSON.stringify(r.logg.map(l => l.fas))}`);

  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  const nara = (fick, vantat, vad) => assert.ok(Math.abs(fick - vantat) <= 90,
    `${vad}: ${fick} ms, vantat ~${vantat} ms`);
  nara(vid.ljus, 0, 'ljus startar direkt');
  nara(vid.oppna, T.anticipationMs, 'oppna startar efter anticipationMs');
  nara(vid.hyllning, T.anticipationMs + T.enterMs, 'hyllning startar efter enterMs');
  nara(vid.upplosning, T.anticipationMs + T.enterMs + T.holdMs, 'upplosning startar efter holdMs');

  // Klassvokabularen ska folja recognitions namn, sa CSS kan delas senare.
  const k = Object.fromEntries(r.klasser.map(x => [x.fas, x]));
  assert.match(k.ljus.klass, /vyra-fas-anticipation/, 'ljus saknar anticipation-klassen');
  assert.match(k.oppna.klass, /vyra-fas-reveal/, 'oppna saknar reveal-klassen');
  assert.match(k.hyllning.klass, /vyra-fas-settled/, 'hyllning saknar settled-klassen');
  assert.match(k.upplosning.klass, /vyra-fas-exit/, 'upplosning saknar exit-klassen');
  for (const f of FASER) assert.equal(k[f].dataFas, f, `data-fas ar fel i fasen ${f}`);

  // De befintliga klasserna ska satta som idag: aktiv genom hela, exit fran upplosningen.
  assert.match(k.ljus.klass, /prov-active/, 'aktivklassen sattes inte vid start');
  assert.match(k.upplosning.klass, /prov-exit/, 'exitklassen sattes inte vid upplosningen');
  assert.doesNotMatch(k.hyllning.klass, /prov-exit/, 'exitklassen sattes for tidigt');

  // Efterat ska allt vara borta och inget ligga kvar.
  assert.doesNotMatch(r.slutKlass, /prov-active|prov-exit|vyra-fas-/, `kvar: "${r.slutKlass}"`);
  assert.equal(r.slutDataFas, null, 'data-fas ligger kvar efter sekvensen');
  assert.equal(r.kvarTimrar, 0, 'timrar kvar efter avslutad sekvens');
});

// ---- 2. Oberoende-provet -------------------------------------------------------------------
test('2. kort visningstid klipper aldrig ljus, oppna eller upplosning', { skip }, async () => {
  const page = await riggen();
  const T = { anticipationMs: 250, enterMs: 350, holdMs: 1, exitMs: 250 };
  const r = await korSekvens(page, { timing: T });
  await page.close();

  assert.deepEqual(r.logg.map(l => l.fas), FASER, 'faser hoppades over vid kort visningstid');
  const vid = Object.fromEntries(r.logg.map(l => [l.fas, l.vid]));
  assert.ok(vid.oppna >= T.anticipationMs - 40,
    `ljus klipptes: oppna startade redan vid ${vid.oppna} ms (anticipationMs ${T.anticipationMs})`);
  assert.ok(vid.hyllning - vid.oppna >= T.enterMs - 40,
    `oppna klipptes: bara ${vid.hyllning - vid.oppna} ms (enterMs ${T.enterMs})`);
  // Hela sekvensen maste rymma avslutet aven nar hold ar 1 ms.
  const slut = vid.upplosning + T.exitMs;
  assert.ok(slut - vid.upplosning >= T.exitMs - 40, 'upplosningen klipptes');
});

// ---- 3. Decode-grinden ---------------------------------------------------------------------
test('3. reveal startar aldrig fore avkodad bild — men slapper igenom pa tidsgransen', { skip }, async () => {
  const page = await riggen();
  const T = { anticipationMs: 50, enterMs: 100, holdMs: 50, exitMs: 50 };

  // Bilden svarar aldrig: grinden ska slappa igenom vid tidsgransen, inte hanga.
  const langsam = await korSekvens(page, { timing: T, bildSrc: '/langsam.png', decodeTimeoutMs: 500 });
  assert.deepEqual(langsam.logg.map(l => l.fas), FASER, 'sekvensen frost pa en bild som aldrig svarar');
  const vidL = Object.fromEntries(langsam.logg.map(l => [l.fas, l.vid]));
  assert.ok(vidL.oppna >= 450, `oppna startade vid ${vidL.oppna} ms — grinden slapp igenom for tidigt`);
  assert.ok(vidL.oppna <= 800, `oppna startade forst vid ${vidL.oppna} ms — grinden holl kvar for lange`);

  // Trasig bild: decode() avvisar. Sekvensen ska ga vidare anda, inte frysa.
  const trasig = await korSekvens(page, { timing: T, bildSrc: '/trasig.png', decodeTimeoutMs: 500 });
  assert.deepEqual(trasig.logg.map(l => l.fas), FASER, 'en trasig bild fros sekvensen');

  // Snabb bild: grinden far inte fordroja nagot i onodan.
  const snabb = await korSekvens(page, { timing: T, bildSrc: '/snabb.png', decodeTimeoutMs: 500 });
  const vidS = Object.fromEntries(snabb.logg.map(l => [l.fas, l.vid]));
  assert.ok(vidS.oppna <= 300,
    `en redan avkodbar bild fordrojde oppna till ${vidS.oppna} ms`);
  await page.close();
});

// ---- 4. Teardown ---------------------------------------------------------------------------
test('4. vyra-session-ended lamnar noll aktiva timrar', { skip }, async () => {
  const page = await riggen();
  const r = await page.evaluate(async () => {
    const T = { anticipationMs: 400, enterMs: 800, holdMs: 4000, exitMs: 400 };
    for (let i = 0; i < 3; i++) {
      const el = window.nyWidget('w' + i);
      window.VyraFas.kor(el, { aktivKlass: 'prov-active', exitKlass: 'prov-exit', timing: T });
    }
    await new Promise(r => setTimeout(r, 120));
    const fore = { instanser: window.VyraFas.aktiva(), timrar: window.VyraFas.aktivaTimrar() };

    window.dispatchEvent(new CustomEvent('vyra-session-ended'));
    await new Promise(r => setTimeout(r, 60));
    const efter = { instanser: window.VyraFas.aktiva(), timrar: window.VyraFas.aktivaTimrar() };

    // Ingen fas far ticka vidare efteråt heller.
    await new Promise(r => setTimeout(r, 900));
    const senare = { instanser: window.VyraFas.aktiva(), timrar: window.VyraFas.aktivaTimrar(),
                     kvarKlasser: [...document.querySelectorAll('.provwidget')]
                       .map(e => e.className).join(' ') };
    return { fore, efter, senare };
  });
  await page.close();

  assert.ok(r.fore.instanser === 3 && r.fore.timrar > 0, 'sekvenserna kom aldrig igang');
  assert.equal(r.efter.instanser, 0, 'instanser kvar efter vyra-session-ended');
  assert.equal(r.efter.timrar, 0, 'timrar kvar efter vyra-session-ended');
  assert.equal(r.senare.timrar, 0, 'nya timrar startade efter teardown');
  assert.doesNotMatch(r.senare.kvarKlasser, /vyra-fas-|prov-active|prov-exit/,
    'fasklasser ligger kvar pa elementen efter teardown');
});

// ---- 5. Omtandning -------------------------------------------------------------------------
test('5. ny kor() mitt i sekvensen tystar gamla generationen rent', { skip }, async () => {
  const page = await riggen();
  const r = await page.evaluate(async () => {
    const el = window.nyWidget();
    const T = { anticipationMs: 100, enterMs: 200, holdMs: 2000, exitMs: 100 };
    const logg = [];
    const gor = (marke) => window.VyraFas.kor(el, {
      aktivKlass: 'prov-active', exitKlass: 'prov-exit', timing: T,
      vidFas: f => logg.push(marke + ':' + f),
    });

    gor('a');
    await new Promise(r => setTimeout(r, 250));      // mitt i forsta sekvensens oppna-fas
    const foreOm = logg.slice();
    gor('b');
    await new Promise(r => setTimeout(r, 500));

    return { foreOm, logg, instanser: window.VyraFas.aktiva(),
             dataFas: el.dataset.fas, klass: el.className };
  });
  await page.close();

  // Den gamla generationen far inte lagga till nagot efter omtandningen.
  const efterOm = r.logg.slice(r.foreOm.length);
  assert.ok(efterOm.length > 0, 'den nya sekvensen startade aldrig');
  assert.deepEqual(efterOm.filter(x => x.startsWith('a:')), [],
    `gamla generationen fortsatte: ${JSON.stringify(efterOm)}`);
  assert.equal(efterOm[0], 'b:ljus', `nya sekvensen startade inte i fas 1: ${efterOm[0]}`);
  assert.equal(r.instanser, 1, 'omtandningen skapade en andra instans pa samma element');
});
