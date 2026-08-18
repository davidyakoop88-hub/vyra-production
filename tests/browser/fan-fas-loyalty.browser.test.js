'use strict';
// Fan Level Up · loyalty · UTTONINGEN — sockeln ska följa med ner.
//
// VAD SOM MÄTS. Inte vilken selektor som står i CSS:en, utan vad som är MÅLAT. En del ärver sin
// synlighet av allt den hänger i, så måttet är produkten av `opacity` och transformens skala hela
// vägen från delen upp till widgetlådan. Det är den enda siffra som betyder något för en tittare,
// och den enda som inte bryr sig om VILKET element som råkar bära animationen.
//
// Det är också hela poängen med att mäta så här. Ett prov som kräver att `.fan-profile img` tonar
// ut hade varit grönt före lagningen och RÖTT efter den — efter lagningen har ankaret ingen egen
// animation alls, det rider med behållaren. Markupmåttet hade alltså vaktat buggen. Samma fälla
// som `hearts`-provet gick i (lärdom 1, checkpoint 33).
//
// LÄGET FÖRE, uppmätt i Chromium 2026-08-18. Effektiv opacitet (o) och skala (s) för
// `.fan-profile`, pinnat med Web Animations API, `--fed` = 500 ms:
//
//     modell      |   0 ms      |  250 ms                  |  480 ms
//     ------------+-------------+--------------------------+--------------------------
//     stack       | o1.00 s1.00 | o0.69 s1.00              | o0.07 s1.00
//     heartbeat   | o1.00 s1.00 | o0.56 s1.00              | o0.09 s1.00
//     badgereveal | o1.00 s1.00 | o0.32 s0.73              | o0.00 s0.60
//     ribbon      | o1.00 s1.00 | o0.43 s0.77              | o0.03 s0.61
//     duo         | o1.00 s1.00 | o0.32 s0.80              | o0.00 s0.70
//     loyalty     | o1.00 s1.00 | o1.00 s1.00  (ankaret 0.32) | o1.00 s1.00  (ankaret 0.00)
//
// SOCKELFÄLLAN, SPEGELVÄND. Fas 1 hade den redan en gång: poppen låg på ankaret medan behållaren
// bär `linear-gradient(145deg,var(--fan-light),var(--fan))` och `box-shadow:0 0 13px var(--fan)`,
// alltså en glödande orange skiva på 80×80 px. Vid uttoningen låg felet åt andra hållet:
// `.fan-layout-loyalty.fan-exit .fan-profile img` krympte och släckte ANSIKTET medan skivan stod
// kvar på 1.00 i 500 ms, tills rotens transition städade bort hela widgeten. Fotograferat vid
// 490 ms: en tom lysande orange skiva över texten, i varje enda alert.
//
// Regeln är densamma åt båda hållen: **rör BEHÅLLAREN, aldrig ankaret.** Ankaret rider med.
//
// TVÅ MODELLER ÄR MED FLIT UTANFÖR FAMILJEVAKTEN. `hearts` döljer profilbilden helt
// (`display:none`), och `hero` har ingen uttoningskoreografi alls — där tonar hela lådan ut samlat
// via rotens transition, vilket är symmetriskt och alltså inte samma fel. Den skillnaden är
// beskriven, inte lagad, och U6 räknar upp exakt vilka modeller som omfattas så att en nionde
// modell inte kan glida in i undantaget utan att någon skriver ut den här.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Varje modell bootas EN gång och mätningen sparas. Att öppna studio.html per påstående kostar
// fyra sekunder styck och säger ingenting nytt — samma sida, samma widget, samma bildrutor.
const cache = new Map();

// Andelar av `--fed` att mäta på. 0.96 i stället för 1.00: vid exakt slutet har `both` redan låst
// sluttillståndet, och en modell som glappar en bildruta före det syns inte. 0.96 av 500 ms är
// 480 ms, alltså den sista bildrutan tittaren faktiskt ser.
const ANDELAR = [0, 0.25, 0.5, 0.75, 0.96];

async function mat(layout) {
  if (cache.has(layout)) return cache.get(layout);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
      { timeout: 30000, polling: 100 });
    await page.waitForTimeout(2500);
    const start = await page.evaluate(l => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:fanlevel:layout:' + l);
      w.x = 60; w.y = 40; state.widgets.push(w); selected = null; render();
      const el = document.querySelector('.fan-level-up');
      if (!el) return { fel: 'widgeten renderades inte' };
      el.classList.add('fan-active');          // alerten är osynlig utan den — se referensprovet
      return { ok: true };
    }, layout);
    if (start.fel) { cache.set(layout, start); return start }

    // ENTRÉN MÅSTE VARA SLUT. Mäter man uttoningen medan entréfaserna fortfarande äger sina
    // element mäter man summan av två koreografier och tror att uttoningen börjar på fel värde.
    await page.waitForTimeout(1600);

    const m = await page.evaluate(andelar => {
      const el = document.querySelector('.fan-level-up');
      el.classList.add('fan-exit');
      const fed = parseFloat(getComputedStyle(el).getPropertyValue('--fed')) || 500;

      // Effektiv, ärvd opacitet och skala: produkten hela vägen upp till widgetlådan. En del kan
      // stå på opacity 1 och ändå vara osynlig för att något ovanför den tonat ut.
      const eff = sel => {
        const e = el.querySelector(sel);
        if (!e) return null;
        if (getComputedStyle(e).display === 'none') return { doljd: true };
        let o = 1, s = 1;
        for (let n = e; n && n !== el.parentElement; n = n.parentElement) {
          const cs = getComputedStyle(n);
          o *= parseFloat(cs.opacity);
          const mtx = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
          s *= Math.abs(mtx.a);
        }
        return { o: +o.toFixed(3), s: +s.toFixed(3) };
      };

      const prover = [];
      for (const andel of andelar) {
        const ms = Math.round(fed * andel);
        // PINNAT, INTE SOVET. `waitForTimeout` mellan avläsningarna hade lagt varje mätning några
        // bildrutor efter sin egen tid, och en skärmdump kostar 100–300 ms till. Varje animation
        // sätts i stället till SIN EGEN currentTime — då är avläsningen exakt och tar noll tid.
        el.querySelectorAll('*').forEach(n => n.getAnimations().forEach(a => { a.pause(); a.currentTime = ms }));
        el.getAnimations().forEach(a => { a.pause(); a.currentTime = ms });
        void el.offsetWidth;
        prover.push({ andel, ms, behallare: eff('.fan-profile'), ankare: eff('.fan-profile img'),
                      ring: eff('.fan-ring') });
      }
      return { fed, prover };
    }, ANDELAR);
    cache.set(layout, m);
    return m;
  } finally {
    await page.close();
  }
}

const vid = (m, andel) => m.prover.find(p => p.andel === andel);
const SLUTET = 0.96;

// ---- U1–U5 · loyalty ---------------------------------------------------------------------------

test('U1: baslinjen — sockeln är fullt målad när uttoningen börjar', { skip }, async () => {
  // POSITIV KONTROLL. Utan den kan U2 bli grön för att widgeten aldrig renderades, för att klassen
  // aldrig bet, eller för att mätningen råkade läsa ett element som redan var borta. Ett
  // frånvaroprov utan positiv kontroll är grönt innan koden finns (lärdom 2, checkpoint 33).
  const m = await mat('loyalty');
  assert.ok(!m.fel, m.fel);
  const p = vid(m, 0);
  assert.ok(p.behallare && !p.behallare.doljd, 'loyalty har ingen synlig .fan-profile att mäta');
  assert.ok(p.behallare.o > 0.95,
    `sockeln står redan på ${p.behallare.o} när uttoningen börjar — mätningen läser fel bildruta`);
  assert.ok(p.behallare.s > 0.95,
    `sockeln är redan krympt till ${p.behallare.s} när uttoningen börjar`);
  assert.equal(m.fed, 500, `--fed är ${m.fed} ms, inte de 500 tabellen ovan är mätt mot`);
});

test('U2: sockeln tonar ut, inte bara ansiktet', { skip }, async () => {
  const m = await mat('loyalty');
  assert.ok(!m.fel, m.fel);
  const p = vid(m, SLUTET);
  assert.ok(p.behallare.o <= 0.15,
    `.fan-profile står kvar på effektiv opacitet ${p.behallare.o} vid ${p.ms} ms av ${m.fed}. ` +
    'Behållaren bär den orangea gradienten och glöden — animeras bara ankaret krymper ansiktet ' +
    'bort medan skivan lyser vidare tills rotens transition städar upp.');
});

test('U3: sockeln krymper med ansiktet', { skip }, async () => {
  const m = await mat('loyalty');
  assert.ok(!m.fel, m.fel);
  const p = vid(m, SLUTET);
  assert.ok(p.behallare.s < 0.9,
    `.fan-profile står kvar på effektiv skala ${p.behallare.s} vid ${p.ms} ms — ` +
    'fbProfilePop baklänges ska ta den mot 0.6, annars är det bara ankaret som rör sig');
});

test('U4: sockelvakten — behållaren får aldrig vara mer målad än ankaret den bär', { skip }, async () => {
  // DET HÄR ÄR HELA SKULDEN, uttryckt som ett mått. Går de isär betyder det att en ram, en sockel
  // eller en glöd överlever sitt eget innehåll. Åt andra hållet är fritt: ankaret FÅR vara mindre
  // målat än behållaren under entrén, det är så en avtäckning ser ut.
  const m = await mat('loyalty');
  assert.ok(!m.fel, m.fel);
  for (const p of m.prover) {
    assert.ok(p.behallare.o <= p.ankare.o + 0.02,
      `vid ${p.ms} ms ligger behållaren på ${p.behallare.o} medan ankaret ligger på ${p.ankare.o} — ` +
      'sockeln överlever ansiktet');
  }
});

test('U5: uttoningen går bara nedåt', { skip }, async () => {
  const m = await mat('loyalty');
  assert.ok(!m.fel, m.fel);
  let forra = Infinity;
  for (const p of m.prover) {
    assert.ok(p.behallare.o <= forra + 0.02,
      `sockeln tänds igen vid ${p.ms} ms: ${forra} → ${p.behallare.o}`);
    forra = p.behallare.o;
  }
});

// ---- U6 · familjen -----------------------------------------------------------------------------
//
// De sex modeller vars profilbehållare har en uttoning. `hearts` (display:none) och `hero` (ingen
// uttoningskoreografi alls) står med flit utanför — se filhuvudet.
const UTTONANDE = ['stack', 'heartbeat', 'badgereveal', 'ribbon', 'duo', 'loyalty'];

for (const layout of UTTONANDE) {
  test(`U6 ${layout}: profilbehållaren tonar ut med sitt innehåll`, { skip }, async () => {
    const m = await mat(layout);
    assert.ok(!m.fel, m.fel);
    const start = vid(m, 0), slut = vid(m, SLUTET);
    assert.ok(start.behallare && !start.behallare.doljd,
      `${layout} har ingen synlig .fan-profile — modellen hör inte hemma i UTTONANDE`);
    assert.ok(start.behallare.o > 0.95,
      `${layout}s sockel börjar på ${start.behallare.o}, inte fullt målad`);
    assert.ok(slut.behallare.o <= 0.15,
      `${layout}s sockel står kvar på ${slut.behallare.o} vid ${slut.ms} ms av ${m.fed}`);
    assert.ok(slut.behallare.o <= slut.ankare.o + 0.02,
      `${layout}s sockel (${slut.behallare.o}) överlever sitt ankare (${slut.ankare.o})`);
  });
}
