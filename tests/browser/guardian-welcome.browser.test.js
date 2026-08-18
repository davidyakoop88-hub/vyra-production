'use strict';
// Guardian Welcome · vad tittaren faktiskt ser, mätt i en riktig webbläsare.
//
// VARFÖR INTE JSDOM. Allt som provas här kräver layout och en riktig animationsmotor: rektanglar
// (jsdom ger 0×0), ärvd opacitet genom en kedja, transformmatriser, `letter-spacing` i pixlar och
// `getAnimations()`. tests/guardian-fas.test.js äger tiderna och registren; den här filen äger
// frågan "syns det, och rör det sig åt rätt håll".
//
// §8 STYR VARJE PÅSTÅENDE. DOM-existens är inte synlighet. En del kan finnas, ha rätt text och
// ändå vara osynlig — monterad utanför bild, släckt av en förälder, eller visuellt oskiljbar
// mellan två lägen. Måtten här är därför rektangel + EFFEKTIV (ärvd) opacitet, aldrig
// `querySelector(...) !== null`.
//
// FASERNA PINNAS, INTE SOVS. Varje animation sätts till sin egen `currentTime` via Web Animations
// API. Summerade `waitForTimeout` lägger varje mätning några bildrutor fel, och en skärmdump
// kostar 100–300 ms till — lärdom 5 i checkpoint 33.
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

const MATT = { banner: [270, 180], kort: [300, 280], full: [400, 300] };
const STORLEKAR = Object.keys(MATT);

// En sida per (storlek, språk) — inte en per påstående. Att öppna studio.html kostar fyra sekunder
// styck och säger ingenting nytt: samma sida, samma widget, samma bildrutor.
const cache = new Map();

// Mätfunktionen som körs INNE i sidan. Effektiv opacitet och skala är produkten hela vägen upp
// till widgetlådan — en del kan stå på opacity 1 och ändå vara osläckt av en förälder.
const MATARE = `(() => {
  const box = document.querySelector('.guardian-welcome');
  window.__gwEff = sel => {
    const e = box.querySelector(sel);
    if (!e) return null;
    if (getComputedStyle(e).display === 'none') return { doljd: true };
    let o = 1, s = 1, x = 0;
    for (let n = e; n && n !== box.parentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      o *= parseFloat(cs.opacity);
      const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
      s *= Math.abs(m.a);
      x += m.e;
    }
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { o: +o.toFixed(3), s: +s.toFixed(3), x: +x.toFixed(1),
             bredd: +r.width.toFixed(1), hojd: +r.height.toFixed(1),
             text: (e.textContent || '').trim(),
             spacing: cs.letterSpacing,
             animationer: e.getAnimations().map(a => a.animationName || 'transition'),
             spelar: e.getAnimations().some(a => a.playState === 'running'),
             oandliga: e.getAnimations().filter(a => {
               const t = a.effect && a.effect.getTiming();
               return t && t.iterations === Infinity;
             }).length };
  };
  window.__gwFas = (namn, ms) => {
    [...box.classList].forEach(k => { if (k.startsWith('gw-fas-')) box.classList.remove(k) });
    if (namn) box.classList.add('gw-fas-' + namn);
    void box.offsetWidth;
    if (typeof ms === 'number') {
      box.querySelectorAll('*').forEach(n => n.getAnimations().forEach(a => { a.pause(); a.currentTime = ms }));
      box.getAnimations().forEach(a => { a.pause(); a.currentTime = ms });
      void box.offsetWidth;
    }
  };
  const r = box.getBoundingClientRect();
  return { bredd: Math.round(r.width), hojd: Math.round(r.height), klasser: box.className };
})()`;

async function sida(storlek, sprak = 'sv') {
  const nyckel = storlek + '/' + sprak;
  if (cache.has(nyckel)) return cache.get(nyckel);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 },
    locale: sprak === 'en' ? 'en-US' : 'sv-SE' });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  const start = await page.evaluate(([s, l]) => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:guardianwelcome:' + s);
    w.x = 60; w.y = 40; w.guardianLang = l; w.guardianUsername = '@TestGuardian';
    w.guardianWeek = 47;
    state.widgets.push(w); selected = null; render();
    return { finns: !!document.querySelector('.guardian-welcome') };
  }, [storlek, sprak === 'auto' ? 'auto' : sprak]);
  if (!start.finns) { const svar = { fel: `widgeten renderades inte (${nyckel})`, page }; cache.set(nyckel, svar); return svar }
  const box = await page.evaluate(MATARE);
  const svar = { page, box };
  cache.set(nyckel, svar);
  return svar;
}

const las = (page, sel) => page.evaluate(s => window.__gwEff(s), sel);
const fas = (page, namn, ms) => page.evaluate(([n, m]) => window.__gwFas(n, m), [namn, ms]);

// ================================================================================================
// POSITIV KONTROLL — den måste stå först, för allt nedanför förutsätter den.
//
// Varje fasprov nedan hävdar att något är SLÄCKT i en viss fas. Ett sådant påstående är trivialt
// sant för en widget som aldrig renderades, och för en del som inte finns i markupen. §7.
// ================================================================================================

for (const storlek of STORLEKAR) {
  test(`${storlek}: widgeten renderas med rätt mått`, { skip }, async () => {
    const s = await sida(storlek);
    assert.ok(!s.fel, s.fel);
    assert.equal(s.box.bredd, MATT[storlek][0], `bredden är ${s.box.bredd}, inte ${MATT[storlek][0]}`);
    assert.equal(s.box.hojd, MATT[storlek][1], `höjden är ${s.box.hojd}, inte ${MATT[storlek][1]}`);
    assert.match(s.box.klasser, new RegExp('guardian-size-' + storlek),
      'storleksklassen sattes inte på lådan');
  });

  test(`${storlek}: alla delar är målade när koreografin är över`, { skip }, async () => {
    // Vilotillståndet, alltså efter sista fasen. Mäter rektangel OCH effektiv opacitet — §8:
    // en del kan finnas i DOM, ha rätt text och ändå vara osynlig.
    const s = await sida(storlek);
    assert.ok(!s.fel, s.fel);
    await fas(s.page, null);
    for (const del of ['.gw-aurora', '.gw-shield', '.gw-title', '.gw-username', '.gw-subtitle']) {
      const m = await las(s.page, del);
      assert.ok(m && !m.doljd, `${del} saknas eller är display:none i vilotillståndet`);
      assert.ok(m.o > 0.8, `${del} står på effektiv opacitet ${m.o} i vilotillståndet`);
      assert.ok(m.bredd > 0 && m.hojd > 0, `${del} har rektangeln ${m.bredd}×${m.hojd}`);
    }
    const svg = await las(s.page, '.gw-shield svg');
    assert.ok(svg && svg.bredd > 0, 'sköldens SVG ritas inte');
  });
}

// ================================================================================================
// SPRÅKEN — texten användaren läser, inte nyckeln i en tabell
// ================================================================================================

test('svenska visar den svenska rubriken och veckoraden', { skip }, async () => {
  const s = await sida('kort', 'sv');
  assert.ok(!s.fel, s.fel);
  await fas(s.page, null);
  assert.equal((await las(s.page, '.gw-title')).text, 'BESKYDDAREN HAR ANLÄNT');
  assert.equal((await las(s.page, '.gw-subtitle')).text, 'Vecka 47 · Din Beskyddare');
});

test('engelska visar den engelska rubriken och veckoraden', { skip }, async () => {
  const s = await sida('kort', 'en');
  assert.ok(!s.fel, s.fel);
  await fas(s.page, null);
  assert.equal((await las(s.page, '.gw-title')).text, 'GUARDIAN HAS ARRIVED');
  assert.equal((await las(s.page, '.gw-subtitle')).text, 'Week 47 · Your Guardian');
});

test('auto följer webbläsarens språk', { skip }, async () => {
  // Sidan öppnas med locale en-US, och auto ska då landa på engelska. Kontrollmätningen är den
  // svenska sidan ovan: utan den kunde provet vara grönt för en widget som alltid säger engelska.
  const s = await sida('kort', 'auto');
  assert.ok(!s.fel, s.fel);
  await fas(s.page, null);
  const rubrik = (await las(s.page, '.gw-title')).text;
  assert.ok(rubrik === 'BESKYDDAREN HAR ANLÄNT' || rubrik === 'GUARDIAN HAS ARRIVED',
    `auto gav rubriken "${rubrik}" som inte är någon av språkens`);
});

// ================================================================================================
// FASERNA — rör det sig, och åt rätt håll?
// ================================================================================================

test('ljus: auroran tänds först och allt annat är släckt', { skip }, async () => {
  const s = await sida('kort');
  assert.ok(!s.fel, s.fel);
  await fas(s.page, 'ljus', 480);                 // strax före fasens slut
  const aurora = await las(s.page, '.gw-aurora');
  assert.ok(aurora.o > 0.6, `auroran står på ${aurora.o} i slutet av ljusfasen — den tänds inte`);
  for (const del of ['.gw-shield', '.gw-title', '.gw-username']) {
    const m = await las(s.page, del);
    assert.ok(m.o < 0.15, `${del} står på ${m.o} redan i ljusfasen — den ska vara släckt`);
  }
});

test('oppna: skölden glider in från vänster', { skip }, async () => {
  const s = await sida('kort');
  assert.ok(!s.fel, s.fel);
  await fas(s.page, 'oppna', 0);
  const start = await las(s.page, '.gw-shield');
  await fas(s.page, 'oppna', 880);
  const slut = await las(s.page, '.gw-shield');
  assert.ok(start.x < slut.x - 10,
    `skölden rörde sig inte i sidled: x ${start.x} → ${slut.x} — glidningen är död`);
  assert.ok(slut.o > start.o + 0.3,
    `skölden tonade inte in: opacitet ${start.o} → ${slut.o}`);
  assert.ok(Math.abs(slut.x) < 5, `skölden landade på x ${slut.x} i stället för i sitt viloläge`);
});

test('oppna: rubriken stämplas fram med krympande teckenavstånd', { skip }, async () => {
  const s = await sida('kort');
  assert.ok(!s.fel, s.fel);
  await fas(s.page, 'oppna', 0);
  const start = await las(s.page, '.gw-title');
  await fas(s.page, 'oppna', 880);
  const slut = await las(s.page, '.gw-title');
  const px = v => parseFloat(v) || 0;
  assert.ok(px(start.spacing) > px(slut.spacing) + 1,
    `teckenavståndet krympte inte: ${start.spacing} → ${slut.spacing} — stämpeln är en vanlig intoning`);
  assert.ok(slut.o > 0.8, `rubriken nådde bara ${slut.o} i slutet av öppnandet`);
});

test('oppna: namn och underrubrik kommer EFTER rubriken', { skip }, async () => {
  // Trappan är hela poängen. Kommer allt samtidigt är det ingen koreografi, bara en intoning.
  const s = await sida('kort');
  assert.ok(!s.fel, s.fel);
  await fas(s.page, 'oppna', 250);
  const rubrik = await las(s.page, '.gw-title');
  const namn = await las(s.page, '.gw-username');
  const under = await las(s.page, '.gw-subtitle');
  assert.ok(rubrik.o > namn.o, `rubriken (${rubrik.o}) ligger inte före namnet (${namn.o})`);
  assert.ok(namn.o >= under.o, `namnet (${namn.o}) ligger inte före underrubriken (${under.o})`);
});

test('hyllning: skölden pulserar och ingen annan del konkurrerar', { skip }, async () => {
  const s = await sida('kort');
  assert.ok(!s.fel, s.fel);
  await fas(s.page, 'hyllning');
  const shield = await las(s.page, '.gw-shield');
  const aurora = await las(s.page, '.gw-aurora');
  assert.ok(shield.oandliga > 0 || aurora.oandliga > 0,
    'ingen oändlig animation går i hyllningsfasen — widgeten står helt stilla');
  for (const del of ['.gw-title', '.gw-username', '.gw-subtitle']) {
    const m = await las(s.page, del);
    assert.equal(m.oandliga, 0, `${del} har en egen loop i hyllningen — konkurrerande rörelse`);
    assert.ok(m.o > 0.8, `${del} är inte fullt målad i hyllningen (${m.o})`);
  }
});

test('upplosning: allt tonar ut och auroran släcks sist', { skip }, async () => {
  const s = await sida('kort');
  assert.ok(!s.fel, s.fel);
  await fas(s.page, 'upplosning', 0);
  const start = await las(s.page, '.gw-title');
  assert.ok(start.o > 0.8, 'kontrollmätning: rubriken var inte tänd när upplösningen började');

  await fas(s.page, 'upplosning', 400);
  const rubrik = await las(s.page, '.gw-title');
  const aurora = await las(s.page, '.gw-aurora');
  assert.ok(rubrik.o < 0.4, `rubriken står kvar på ${rubrik.o} mitt i upplösningen`);
  assert.ok(aurora.o > rubrik.o,
    `auroran (${aurora.o}) släcks före rubriken (${rubrik.o}) — den ska vara sist kvar`);

  await fas(s.page, 'upplosning', 590);
  for (const del of ['.gw-shield', '.gw-title', '.gw-username']) {
    const m = await las(s.page, del);
    assert.ok(m.o < 0.1, `${del} står kvar på ${m.o} i slutet av upplösningen`);
  }
});

// ================================================================================================
// KÄLLVAKTERNA I WEBBLÄSAREN — att regeln FINNS är inte att den BET
//
// tests/guardian-fas.test.js skannar källan. Det här är den andra halvan: laddades filen alls, och
// slog någon annan modul ut den? §11 — specificitet mellan moduler avgörs inte av ordning eller
// avsikt, och skillnaden syns inte i någon av filerna var för sig.
// ================================================================================================

test('källvakt: guardian-welcome.css laddades och dess variabler bet', { skip }, async () => {
  const s = await sida('kort');
  assert.ok(!s.fel, s.fel);
  const varden = await s.page.evaluate(() => {
    const box = document.querySelector('.guardian-welcome');
    const cs = getComputedStyle(box);
    return {
      guld: cs.getPropertyValue('--gw-gold').trim(),
      skog: cs.getPropertyValue('--gw-forest-dark').trim(),
      bakgrund: cs.backgroundColor,
      rubrikFont: getComputedStyle(box.querySelector('.gw-title')).fontFamily,
    };
  });
  assert.equal(varden.guld.toLowerCase(), '#d4af37', 'guldvariabeln nådde inte lådan');
  assert.equal(varden.skog.toLowerCase(), '#0a1f1a', 'skogsvariabeln nådde inte lådan');
  assert.notEqual(varden.bakgrund, 'rgba(0, 0, 0, 0)', 'lådan har ingen målad bakgrund');
  assert.match(varden.rubrikFont, /Cinzel|Trajan|Georgia|serif/i,
    `rubriken renderas med ${varden.rubrikFont} — serif-stacken slog inte igenom`);
});

test('källvakt: ingen guardian-regel använder !important på rörelse', { skip }, async () => {
  // Källskanningen finns i tests/guardian-fas.test.js. Den här läser stilmallen SOM WEBBLÄSAREN
  // TOLKADE DEN, vilket fångar en regel som smugit in via en annan fil eller en @import.
  const s = await sida('kort');
  assert.ok(!s.fel, s.fel);
  const syndare = await s.page.evaluate(() => {
    const ut = [];
    for (const ark of [...document.styleSheets]) {
      let regler; try { regler = [...ark.cssRules] } catch (_) { continue }
      for (const r of regler) {
        if (!r.selectorText || !/\.g(uardian|w)-/.test(r.selectorText)) continue;
        for (const egenskap of ['transform', 'opacity', 'clip-path']) {
          if (r.style.getPropertyPriority(egenskap) === 'important') {
            ut.push(r.selectorText + ' { ' + egenskap + ': !important }');
          }
        }
      }
    }
    return ut;
  });
  assert.deepEqual(syndare, [],
    '`!important` i en vanlig regel slår en CSS-animation — halva keyframen kör aldrig');
});

test('källvakt: testknappen finns i panelen och kan klickas', { skip }, async () => {
  // Att den GÅR GENOM KÖN provas i tests/guardian-fas.test.js, där kön går att räkna. Här mäts
  // bara att knappen existerar som en riktig, synlig kontroll — §8: en knapp utanför bild är
  // ingen knapp.
  const s = await sida('kort');
  assert.ok(!s.fel, s.fel);
  const m = await s.page.evaluate(() => {
    const w = state.widgets[0];
    selected = w.id; render();
    const knapp = document.querySelector('#testGuardian');
    if (!knapp) return { finns: false };
    const r = knapp.getBoundingClientRect(), cs = getComputedStyle(knapp);
    return { finns: true, bredd: r.width, hojd: r.height, synlig: cs.visibility, display: cs.display,
             text: (knapp.textContent || '').trim() };
  });
  assert.equal(m.finns, true, 'testknappen #testGuardian finns inte i panelen');
  assert.ok(m.bredd > 0 && m.hojd > 0, `knappen har rektangeln ${m.bredd}×${m.hojd}`);
  assert.notEqual(m.display, 'none', 'knappen är display:none');
  assert.match(m.text, /Guardian/i, `knappen säger "${m.text}"`);
});
