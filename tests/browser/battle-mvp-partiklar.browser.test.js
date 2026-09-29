'use strict';
// Frame rate for the Battle MVP particle engine, measured in a real Chromium.
//
// TVÅ FÄLLOR SOM GÖR ETT SÅDANT HÄR PROV FALSKT GRÖNT, och vad riggen gör åt dem:
//
//   1. Headless Chromium rapporterar `prefers-reduced-motion: reduce` som standard.
//      Motorn slutar då sända ut partiklar, duken är tom, och en tom duk renderar i
//      felfria 60 FPS. Riggen sätter därför `reducedMotion:'no-preference'` explicit
//      och KRÄVER sedan att partiklar faktiskt fanns — annars mätte den ingenting.
//
//   2. Ett mått som ger samma värde oavsett belastning mäter inte det man tror.
//      Sista provet är en kontrollmätning: samma sekvens körd på 20 % och 250 %
//      intensitet. Skiljer sig inte partikelantalet är riggen trasig, inte koden.
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
let skip = hoppaOver();                    // måste vara let: node:test läser { skip } vid registrering

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

const SEKUNDER = 9;
// Samma brytpunkter som motorns rateAt(), så faserna i rapporten är motorns egna.
const FASER = [
  { namn: '1 · Ljus',      fran: 0,    till: 0.18 },
  { namn: '2 · Entre',     fran: 0.18, till: 0.45 },
  { namn: '3 · Hyllning',  fran: 0.45, till: 0.90 },
  { namn: '4 · Avslut',    fran: 0.90, till: 1.00 }
];

async function mat({ intensitet = 100, design = 'coronation', utanMotor = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  // Baslinje: samma widget, samma trigger, samma render() - men ingen motor alls.
  // Utan den gar det inte att veta hur mycket av en spik som ens ar vart.
  if (utanMotor) await page.route('**/battle-mvp-particles.js*', r => r.abort());
  // Utan den här raden mäter provet en tom duk och rapporterar perfekta 60 FPS.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  if (!utanMotor) await page.waitForFunction(() => !!window.VyraMvpParticles, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1200);

  const resultat = await page.evaluate(async ({ design, intensitet, sekunder, faser }) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:battlemvp:celebration:' + design);
    Object.assign(w, { x: 40, y: 40, width: 760, mvpDuration: sekunder,
      mvpFxIntensity: intensitet, mvpName: 'FPS', profileImage: 'assets/images/test-profile.svg' });
    state.widgets.push(w); selected = null; render();

    const rutor = [], partiklar = [];
    let kor = true;
    const ticka = t => {
      if (!kor) return;
      rutor.push(t);
      partiklar.push(window.VyraMvpParticles ? window.VyraMvpParticles.count() : 0);
      requestAnimationFrame(ticka);
    };
    requestAnimationFrame(ticka);

    const t0 = performance.now();
    triggerBattleMvp({ name: 'FPS', score: 1500, profileImage: 'assets/images/test-profile.svg' });
    await new Promise(r => setTimeout(r, sekunder * 1000 + 350));
    kor = false;

    const box = document.querySelector('.mvp-celebration');
    const scen = box && box.querySelector('.mvc-stage');
    const dukar = box ? box.querySelectorAll('canvas.mvc-fx').length : 0;

    // Bucketera bildrutorna per fas ur motorns egen tidsandel.
    const ut = faser.map(f => ({ namn: f.namn, deltan: [], toppPartiklar: 0 }));
    for (let i = 1; i < rutor.length; i++) {
      const andel = (rutor[i] - t0) / (sekunder * 1000);
      if (andel < 0 || andel > 1) continue;
      const fas = faser.findIndex(f => andel >= f.fran && andel < f.till);
      const idx = fas < 0 ? faser.length - 1 : fas;
      ut[idx].deltan.push(rutor[i] - rutor[i - 1]);
      if (partiklar[i] > ut[idx].toppPartiklar) ut[idx].toppPartiklar = partiklar[i];
    }

    const sammanfatta = f => {
      const d = f.deltan.slice().sort((a, b) => a - b);
      if (!d.length) return { ...f, deltan: undefined, rutor: 0 };
      const medel = f.deltan.reduce((a, b) => a + b, 0) / f.deltan.length;
      return {
        namn: f.namn,
        rutor: d.length,
        fps: +(1000 / medel).toFixed(1),
        median: +d[Math.floor(d.length / 2)].toFixed(2),
        p95: +d[Math.min(d.length - 1, Math.floor(d.length * 0.95))].toFixed(2),
        varst: +d[d.length - 1].toFixed(2),
        // En tappad bildruta = ett hopp på mer än en och en halv vsync vid 60 Hz.
        tappade: f.deltan.filter(x => x > 25).length,
        toppPartiklar: f.toppPartiklar
      };
    };

    return {
      faser: ut.map(sammanfatta),
      dukar,
      motorStartad: !!(scen && scen.classList.contains('mvc-fx-on')),
      reservenDold: !!(scen && scen.classList.contains('mvc-fx-on')),
      toppPartiklar: Math.max(0, ...partiklar),
      totaltRutor: rutor.length,
      reducerad: matchMedia('(prefers-reduced-motion: reduce)').matches,
      motorFinns: !!window.VyraMvpParticles
    };
  }, { design, intensitet, sekunder: SEKUNDER, faser: FASER });
  if (utanMotor) resultat.dukar = 0;

  await page.close();
  return resultat;
}

function rapportera(rubrik, m) {
  console.log('\n  ' + rubrik);
  console.log('    dukar: ' + m.dukar + '  motor startad: ' + m.motorStartad +
              '  topp-partiklar: ' + m.toppPartiklar + '  bildrutor: ' + m.totaltRutor);
  console.log('    fas              rutor     FPS   median     p95    varst  tappade  partiklar');
  for (const f of m.faser) {
    console.log('    ' + f.namn.padEnd(14) +
      String(f.rutor).padStart(7) +
      String(f.fps ?? '-').padStart(8) +
      String(f.median ?? '-').padStart(9) +
      String(f.p95 ?? '-').padStart(8) +
      String(f.varst ?? '-').padStart(9) +
      String(f.tappade ?? '-').padStart(9) +
      String(f.toppPartiklar).padStart(11));
  }
}

test('bildfrekvensen halls uppe genom hela sekvensen, med bada dukarna igang', { skip }, async () => {
  const m = await mat({ intensitet: 100 });
  rapportera('coronation · 100 % intensitet', m);

  // Först: mätte vi över huvud taget något?
  assert.equal(m.reducerad, false, 'reducerad rorelse var pa - da ar duken tom och matningen vardelos');
  assert.equal(m.dukar, 2, 'bada dukarna ska finnas');
  assert.ok(m.motorStartad, 'mvc-fx-on sattes aldrig - motorn startade inte');
  assert.ok(m.toppPartiklar > 40, 'for fa partiklar (' + m.toppPartiklar + ') - matningen sag en nastan tom duk');
  assert.ok(m.totaltRutor > SEKUNDER * 30, 'for fa bildrutor spelades in: ' + m.totaltRutor);

  // Sedan: höll den?
  for (const f of m.faser) {
    assert.ok(f.rutor > 0, f.namn + ' fick inga bildrutor alls');
    assert.ok(f.fps >= 50, f.namn + ' snittade ' + f.fps + ' FPS (golv 50)');
    assert.ok(f.p95 <= 26, f.namn + ' hade p95 ' + f.p95 + ' ms (tak 26)');
  }

  // Fas 3 och 4 ar de tunga - dar bygger utslappet mot landningen och finalen.
  const fas3 = m.faser[2], fas4 = m.faser[3];
  assert.ok(fas3.toppPartiklar > 0, 'fas 3 hade inga partiklar');
  assert.ok(fas4.toppPartiklar > 0, 'fas 4 hade inga partiklar');
});

test('matningen reagerar pa belastning - annars mater den ingenting', { skip }, async () => {
  const lag = await mat({ intensitet: 20 });
  const hog = await mat({ intensitet: 250 });
  rapportera('kontroll · 20 % intensitet', lag);
  rapportera('kontroll · 250 % intensitet', hog);

  // Det har ar provet pa riggen, inte pa koden. Ror sig inte partikelantalet nar
  // intensiteten gar fran 20 % till 250 % sa las inte installningen, och da sager
  // FPS-siffran ovan ingenting om den verkliga belastningen.
  assert.ok(hog.toppPartiklar > lag.toppPartiklar * 1.5,
    'partikelantalet foljde inte intensiteten: ' + lag.toppPartiklar + ' vs ' + hog.toppPartiklar);

  // Och aven under full belastning ska den halla.
  for (const f of hog.faser) {
    assert.ok(f.fps >= 45, '250 %: ' + f.namn + ' snittade ' + f.fps + ' FPS (golv 45)');
  }
});

// FORVARMNINGEN: dukarna finns vid render, och en ny scan allokerar ingenting.
//
// DEN HAR VAKTEN MATTE FORR TID, OCH DET GICK INTE. Den tog motorns ANDEL av varsta
// bildrutan -- `med.varst - utan.varst` -- och kravde att den lag under 8 ms. Men
// `varst` ar det storsta rAF-INTERVALLET, och rAF-intervall ar kvantiserade till
// vsync: en stall av vilken storlek som helst rapporteras som en multipel av 16,67 ms.
// Differensen mellan tva sadana tal kan darfor i praktiken bara bli -16,7, 0 eller
// +16,7. Taket pa 8 lag i ett hal dar inget matvarde kan landa, sa vakten var ett
// myntkast: tappade korningen med motor en bildruta mer an baslinjen foll den, annars
// passerade den med stor marginal. Uppmatt: tre lokala korningar gav -16,6 / -16,4 /
// -16,6 ms medan CI gav +16,7 pa exakt samma kod.
//
// DET SOM GAR ATT MATA UTAN BRUS ar allokeringarna. `canvas.width = X` omallokerar
// backing storen AVEN nar vardet ar oforandrat, sa settern raknas oavsett vardet, och
// motorns resize() ska returnera tidigt utan att rora den nar matten redan stammer.
//
// VAD VAKTEN INTE PASTAR. Entrerutan ar fortfarande inte allokeringsfri, och det ar
// INTE motorns fel: `triggerBattleMvp` (media.js:1021) kor `save()` och ett fullt
// `render()` innan den satter klassen, sa hela scenen rivs och byggs om -- och da
// skapas dukarna igen. Uppmatt pa entrerutan: 2 x createElement(canvas) plus fyra
// skrivningar av width/height. Det ar issue #448 och ska lagas dar, i media.js.
// Forvarmningen gor det den kan: den flyttar arbetet till render-steget. Sa lange
// triggern sjalv renderar om hamnar det steget anda pa entrerutan.
test('forvarmningen: dukarna finns vid render och en ny scan allokerar ingenting', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
      { timeout: 30000, polling: 100 });
    await page.waitForFunction(() => !!window.VyraMvpParticles, null,
      { timeout: 30000, polling: 100 });
    await page.waitForTimeout(1200);

    const r = await page.evaluate(async () => {
      const logg = [];
      let raknar = false;
      const origCreate = document.createElement.bind(document);
      document.createElement = function (taggnamn, val) {
        if (raknar && String(taggnamn).toLowerCase() === 'canvas') logg.push('createElement(canvas)');
        return origCreate(taggnamn, val);
      };
      for (const falt of ['width', 'height']) {
        const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, falt);
        Object.defineProperty(HTMLCanvasElement.prototype, falt, {
          configurable: true, enumerable: d.enumerable, get: d.get,
          set(v) { if (raknar) logg.push('canvas.' + falt + ' = ' + v); d.set.call(this, v); }
        });
      }

      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:battlemvp:celebration:coronation');
      Object.assign(w, { x: 40, y: 40, width: 760, mvpDuration: 9, mvpFxIntensity: 100,
        mvpName: 'FPS', profileImage: 'assets/images/test-profile.svg' });
      state.widgets.push(w); selected = null; render();
      await new Promise(r => setTimeout(r, 400));

      const dukar = [...document.querySelectorAll('canvas.mvc-fx')];
      const matt = dukar.map(c => c.width + 'x' + c.height);

      // Scenen ar oforandrad. En ny scan far darfor inte skapa nagot och inte rora
      // ett enda width/height -- det ar hela forvarmningens kontrakt.
      raknar = true;
      window.VyraMvpParticles.scan();
      window.VyraMvpParticles.scan();
      raknar = false;

      return { antal: dukar.length, matt, logg };
    });

    console.log('\n    dukar vid render: ' + r.antal + ' (' + r.matt.join(', ') + ')' +
                '   allokeringar vid ny scan: ' + r.logg.length +
                (r.logg.length ? ' -> ' + r.logg.join(', ') : '') + '\n');

    assert.equal(r.antal, 2, 'forvarmningen skapade inte de tva dukarna vid render() - hittade ' + r.antal);
    assert.ok(r.matt.every(m => !/^0x|x0$/.test(m)), 'en duk lamnades odimensionerad: ' + r.matt.join(', '));
    assert.equal(r.logg.length, 0,
      'en scan pa en oforandrad scen allokerade ' + r.logg.length + ' gang(er): ' +
      r.logg.join(', ') + ' - resize() ar inte langre en akta no-op');
  } finally { await page.close(); }
});
