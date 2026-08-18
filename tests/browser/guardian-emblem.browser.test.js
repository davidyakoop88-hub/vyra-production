'use strict';
// Guardian Emblem · G-STEG-HÖJD. Växer prakten på riktigt, mätt i en riktig webbläsare.
//
// VARFÖR INTE JSDOM. Allt här kräver layout och en riktig animationsmotor: rektanglar (jsdom ger
// 0×0), ärvd opacitet genom en kedja och transformmatriser. tests/guardian-emblem-fas.test.js äger
// registren, tiderna och markupen; den här filen äger den enda frågan jsdom inte kan svara på —
// SYNS det, och växer det åt rätt håll.
//
// §8 STYR VARJE PÅSTÅENDE. DOM-existens är inte synlighet. En del kan finnas, ha rätt klass och
// ändå vara osynlig — monterad utanför bild, släckt av en förälder, eller nollstor. Måtten här är
// därför rektangel + EFFEKTIV (ärvd) opacitet, aldrig `querySelector(...) !== null`.
//
// LÅDANS HÖJD HÅLLS KONSTANT I ALLA FYRA STEGEN, med flit. Fabriken ger varje steg en egen
// utgångshöjd, och att mäta den hade bara läst tillbaka en siffra jsdom redan vaktar — ett prov
// som bevisar sin egen fixtur. Det som mäts är i stället DELARNAS omfång: översta delens ovankant
// till understa delens underkant. Växer det när lådan står stilla, så är det prakten som växer.
//
// FASERNA PINNAS, INTE SOVS. Varje animation sätts till sin egen `currentTime` via Web Animations
// API, och `render()` körs före varje mätning så noden är ny och animationsfri — en pausad
// animation överlever att dess CSS-regel slutar gälla, och `cancel()`/`play()` ger detachade
// respektive dubblerade animationer (lärdom 5 i checkpoint 33 och mätningen i PR #222).
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

const STEG = ['1', '2', '3', '4'];
const LADHOJD = 680;   // samma i alla fyra stegen — se filhuvudet

// Mätfunktionerna körs INNE i sidan.
//
// `__geOmfang` mäter delarnas gemensamma rektangel och räknar bara delar som FAKTISKT MÅLAS:
// effektiv opacitet över noll, och en rektangel med både bredd och höjd. En del som ligger
// gömd bakom `opacity:0` bidrar inte till prakten och ska inte heller bidra till måttet.
const MATARE = `(() => {
  const box = () => document.querySelector('.guardian-emblem');
  const effektiv = e => {
    let o = 1;
    for (let n = e; n && n !== box().parentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  };
  window.__geEff = sel => {
    const e = box().querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { o: +effektiv(e).toFixed(3), bredd: +r.width.toFixed(1), hojd: +r.height.toFixed(1) };
  };
  window.__geOmfang = () => {
    const b = box();
    const delar = [...b.querySelectorAll('[class*="ge-"]')].filter(e => {
      if (!/(^|\\s)ge-(?!fas-|step-)/.test(e.className.baseVal || e.className || '')) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && effektiv(e) > 0.01;
    });
    if (!delar.length) return { antal: 0 };
    const rutor = delar.map(e => e.getBoundingClientRect());
    const topp = Math.min(...rutor.map(r => r.top));
    const botten = Math.max(...rutor.map(r => r.bottom));
    const vanster = Math.min(...rutor.map(r => r.left));
    const hoger = Math.max(...rutor.map(r => r.right));
    const lada = b.getBoundingClientRect();
    return { antal: delar.length, hojd: +(botten - topp).toFixed(1), bredd: +(hoger - vanster).toFixed(1),
             ladhojd: +lada.height.toFixed(1), ladbredd: +lada.width.toFixed(1) };
  };
  window.__geFas = (namn, ms) => {
    render();                                   // ny nod, noll animationer
    const b = box();
    if (namn) b.classList.add('ge-fas-' + namn);
    void b.offsetWidth;
    if (typeof ms === 'number') {
      const alla = [...b.getAnimations()];
      b.querySelectorAll('*').forEach(n => alla.push(...n.getAnimations()));
      alla.forEach(a => { a.pause(); a.currentTime = ms });
      void b.offsetWidth;
    }
  };
  return true;
})()`;

// En sida per steg — inte en per påstående. Att öppna studio.html kostar fyra sekunder styck och
// säger ingenting nytt: samma sida, samma widget, samma bildrutor.
const cache = new Map();

async function sida(steg) {
  if (cache.has(steg)) return cache.get(steg);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'sv-SE' });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  const start = await page.evaluate(([s, h]) => {
    try {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:guardianemblem:' + s);
      w.x = 60; w.y = 40; w.height = h; w.guardianLang = 'sv'; w.guardianUsername = '@TestGuardian';
      state.widgets.push(w); selected = null; render();
      return { finns: !!document.querySelector('.guardian-emblem') };
    } catch (e) { return { finns: false, fel: String(e && e.message || e) } }
  }, [steg, LADHOJD]);
  const svar = { page };
  if (!start.finns) svar.fel = `steg ${steg} renderades inte${start.fel ? ': ' + start.fel : ''}`;
  else await page.evaluate(MATARE);
  cache.set(steg, svar);
  return svar;
}

const fas = (page, namn, ms) => page.evaluate(([n, m]) => window.__geFas(n, m), [namn, ms]);
const omfang = page => page.evaluate(() => window.__geOmfang());
const las = (page, sel) => page.evaluate(s => window.__geEff(s), sel);

// Alla fyra stegen mätta mitt i hyllningen, där vapnet står färdigt och stilla.
async function allaSteg() {
  const matt = {};
  for (const s of STEG) {
    const { page, fel } = await sida(s);
    assert.ok(!fel, `kontrollmätning: ${fel}`);   // utan den här raden vore provet grönt av ingenting
    await fas(page, 'hyllning', 200);
    matt[s] = await omfang(page);
    assert.ok(matt[s].antal > 0, `steg ${s} målar inte en enda del — omfånget är tomt`);
  }
  return matt;
}

// ================================================================================================
// G-STEG-HÖJD — PRAKTEN VÄXER, OCH DET SYNS
// ================================================================================================

test('G-STEG-HÖJD: delarnas omfång växer för varje steg, med lådan konstant', { skip }, async () => {
  const matt = await allaSteg();
  const hojder = STEG.map(s => matt[s].hojd);
  assert.deepEqual([...new Set(STEG.map(s => matt[s].ladhojd))], [LADHOJD],
    `lådan är inte lika hög i alla steg (${STEG.map(s => matt[s].ladhojd).join('/')}) — då mäter provet fixturen, inte prakten`);
  for (let i = 1; i < STEG.length; i++) {
    assert.ok(hojder[i] > hojder[i - 1],
      `steg ${STEG[i]} målar inte högre än steg ${STEG[i - 1]}: ${hojder.join(' / ')} px`);
  }
});

test('G-STEG-HÖJD: fler delar målas för varje steg', { skip }, async () => {
  const matt = await allaSteg();
  const antal = STEG.map(s => matt[s].antal);
  for (let i = 1; i < STEG.length; i++) {
    assert.ok(antal[i] > antal[i - 1],
      `steg ${STEG[i]} målar inte fler delar än steg ${STEG[i - 1]}: ${antal.join(' / ')}`);
  }
});

test('G-STEG-HÖJD: inget steg målar utanför sin 400 px breda låda', { skip }, async () => {
  // Automatisk höjd betyder att höjden får växa. Bredden får den inte — familjens format är 400 px,
  // och en del som sticker ut blir avklippt i overlayn utan att någon ser det i studion.
  const matt = await allaSteg();
  for (const s of STEG) {
    assert.equal(matt[s].ladbredd, 400, `steg ${s} har inte 400 px bred låda`);
    assert.ok(matt[s].bredd <= 400.5,
      `steg ${s} målar ${matt[s].bredd} px brett i en 400 px låda — kanterna klipps i overlayn`);
  }
});

test('G-STEG-PROGRESSION (synlig halva): stegets nya delar är verkligen målade', { skip }, async () => {
  // Den här är kontrollen som gör G-STEG-HÖJD ärlig. Omfånget kan växa av ETT stort element lika
  // gärna som av tre nya — det här provet pekar ut varje ny del vid namn och kräver att just den
  // har både yta och ärvd opacitet över noll i sitt eget steg.
  const NYA = { 2: ['innerring', 'kronskold'],
                3: ['hjort', 'kronspets', 'skold-vanster', 'skold-hoger'],
                4: ['kristall-vanster', 'kristall-yttre-hoger', 'banderoll'] };
  for (const steg of ['2', '3', '4']) {
    const { page, fel } = await sida(steg);
    assert.ok(!fel, `kontrollmätning: ${fel}`);
    await fas(page, 'hyllning', 200);
    for (const del of NYA[steg]) {
      const m = await las(page, '.ge-' + del);
      assert.ok(m, `steg ${steg} renderar inte .ge-${del}`);
      assert.ok(m.o > 0.01, `.ge-${del} är släckt i steg ${steg} (effektiv opacitet ${m && m.o})`);
      assert.ok(m.bredd > 0 && m.hojd > 0, `.ge-${del} är nollstor i steg ${steg}`);
    }
  }
});
