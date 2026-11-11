'use strict';
// GALLERIET I OVERLAY-VYN (katalog-scen.js, David 2026-11-11).
//
// Uppmätt före: 164 kort i en lista gav en katalog på ~14 600 px. Galleriet visar en familj i taget
// — scen överst, familjens kort på en rad under. Provet håller fast det som inte får gå sönder:
//   • korten ligger KVAR i katalogen med sina nycklar (kartan, sökningen och layouter bygger på dem),
//   • scenen är inget kort och bär ingen katalognyckel,
//   • en riktig gest VÄLJER ett kort; den lägger inte widgeten i layouten,
//   • ett kodklick och scenens knapp lägger till, precis som kortet alltid gjort,
//   • sökning och växeln Lista ger den gamla listan tillbaka.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

async function oppna() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!window.VyraKatalogScen && typeof window.owgRenderCardThumb === 'function', null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => {
    await window.VyraSessionState.projectLocalSession();
    let forra = -1;
    for (let t = 0; t < 40; t++) {
      view = 'overlay'; selected = null; render(); bind(); await new Promise(r => setTimeout(r, 250));
      const n = document.querySelectorAll('.widget-catalog [data-catalog-key]').length;
      if (n > 100 && n === forra) break; forra = n;
    }
    await new Promise(r => setTimeout(r, 400));
  });
  return page;
}
const lage = page => page.evaluate(() => {
  const g = document.querySelector('.overlay-widget-gallery'), c = g.querySelector(':scope > .widget-catalog');
  const synliga = [...c.children].filter(s => s.getBoundingClientRect().height > 0);
  return {
    pa: g.classList.contains('kat-scen-pa'),
    kort: c.querySelectorAll('button[data-catalog-key]').length,
    nycklarUtanfor: document.querySelectorAll('[data-catalog-key]').length - c.querySelectorAll('[data-catalog-key]').length,
    synligaFamiljer: synliga.length,
    kataloghojd: Math.round(c.getBoundingClientRect().height),
    familjeknappar: g.querySelectorAll('.kat-familjer [data-kat-familj]').length,
    scenRitad: !!g.querySelector('.kat-scen-kort .owg-thumb'),
    namn: (g.querySelector('.kat-scen-namn b')?.textContent || '').trim(),
    aktiva: c.querySelectorAll('.kat-scen-aktiv').length,
    widgets: state.widgets.length
  };
});

test('galleriet visar en familj i taget och korten ligger kvar i katalogen', { skip, timeout: 120000 }, async () => {
  const page = await oppna();
  try {
    const g = await lage(page);
    assert.equal(g.pa, true, 'galleriet ska vara förvalt');
    assert.ok(g.kort > 100, `katalogen byggdes inte (${g.kort} kort)`);
    assert.equal(g.synligaFamiljer, 1, 'bara vald familj ska synas');
    assert.ok(g.familjeknappar >= 20, `familjelistan saknar familjer (${g.familjeknappar})`);
    assert.ok(g.kataloghojd < 400, `remsan ska vara en rad, inte en lista (${g.kataloghojd} px)`);
    assert.equal(g.scenRitad, true, 'scenen ritade ingen widget');
    assert.ok(g.namn, 'scenen saknar namn på vald design');
    assert.equal(g.aktiva, 1, 'exakt ett kort ska vara markerat');
    assert.equal(g.nycklarUtanfor, 0, 'scenen får inte bära en katalognyckel — den är inget kort');

    await page.evaluate(() => window.VyraKatalogScen.vy('lista'));
    const l = await lage(page);
    assert.equal(l.pa, false);
    assert.equal(l.kort, g.kort, 'galleriet får inte lägga till eller ta bort kort');
    assert.ok(l.synligaFamiljer >= 20, 'Lista ska visa alla familjer');
    assert.ok(l.kataloghojd > 5000, `Lista ska vara den gamla listan (${l.kataloghojd} px)`);
    await page.evaluate(() => window.VyraKatalogScen.vy('galleri'));
  } finally { await page.close(); }
});

test('en riktig gest väljer kortet; kodklick och scenens knapp lägger till', { skip, timeout: 120000 }, async () => {
  const page = await oppna();
  try {
    await page.evaluate(() => window.VyraKatalogScen.vy('galleri'));
    const fore = await lage(page);
    // Riktig gest på andra kortet i remsan: väljs, läggs inte till.
    const andra = page.locator('.widget-catalog > .kat-scen-vald button[data-catalog-key]:visible').nth(1);
    const nyckel = await andra.getAttribute('data-catalog-key');
    await andra.click();
    await page.waitForTimeout(400);
    const valt = await lage(page);
    assert.equal(valt.widgets, fore.widgets, 'ett klick i remsan ska välja, inte lägga till');
    assert.equal(await page.evaluate(() => window.VyraKatalogScen.vald().kort), nyckel, 'kortet blev inte valt');
    assert.equal(await page.evaluate(() => document.querySelector('.widget-catalog .kat-scen-aktiv')?.dataset.catalogKey), nyckel);

    // Piltangent bläddrar.
    await page.focus('.kat-scen-yta');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    assert.notEqual(await page.evaluate(() => window.VyraKatalogScen.vald().kort), nyckel, 'högerpil bytte inte design');

    // Scenens knapp lägger till genom kortets egen handler.
    await page.click('.kat-scen [data-kat-gor="lagg"]');
    await page.waitForTimeout(600);
    const efterKnapp = await lage(page);
    assert.equal(efterKnapp.widgets, fore.widgets + 1, 'Lägg till i Layout lade inte till widgeten');
    assert.equal(efterKnapp.pa, true, 'galleriet ska stå kvar efter att vyn ritats om');
    assert.equal(efterKnapp.scenRitad, true, 'scenen ska ritas om efter render()');

    // Ett kodklick på ett kort gör som förut — andra skript och prov förlitar sig på det.
    // (En ny Top Like ersätter den som redan ligger i layouten, så antalet säger inget: provet läser
    // vilken widget som blev vald.)
    const klickad = await page.evaluate(() => {
      const kort = document.querySelector('.widget-catalog > .kat-scen-vald button[data-catalog-key]');
      selected = null; kort.click();
      return kort.dataset.catalogKey;
    });
    await page.waitForFunction(() => !!selected, null, { timeout: 5000 });
    const lagd = await page.evaluate(() => { const w = liveWidget(selected); return w ? w.type + ':' + (w.skin || w.likeTheme || '') : null; });
    assert.equal(klickad, 'catalog:toplike:voltage');
    assert.equal(lagd, 'templateTopLike:voltage', 'kort.click() från kod ska lägga till widgeten');
  } finally { await page.close(); }
});

test('sökning visar listan, och galleriet kommer tillbaka när sökfältet töms', { skip, timeout: 120000 }, async () => {
  const page = await oppna();
  try {
    await page.evaluate(() => window.VyraKatalogScen.vy('galleri'));
    await page.fill('.overlay-widget-gallery .widget-search', 'heart');
    await page.waitForTimeout(500);
    const s = await lage(page);
    assert.equal(s.pa, false, 'medan man söker ska träffar i flera familjer synas samtidigt');
    assert.ok(s.synligaFamiljer > 1, `sökningen visade bara ${s.synligaFamiljer} familj`);
    await page.fill('.overlay-widget-gallery .widget-search', '');
    await page.waitForTimeout(500);
    const t = await lage(page);
    assert.equal(t.pa, true);
    assert.equal(t.synligaFamiljer, 1);
  } finally { await page.close(); }
});

test('▶ Testa widget spelar designen på scenen utan att röra layouten', { skip, timeout: 120000 }, async () => {
  const page = await oppna();
  try {
    await page.evaluate(() => window.VyraKatalogScen.vy('galleri'));
    const valj = rubrik => page.evaluate(r => {
      const b = [...document.querySelectorAll('.kat-familjer [data-kat-familj]')].find(x => new RegExp(r).test(x.dataset.katFamilj));
      b.click();
      return new Promise(k => setTimeout(k, 400));
    }, rubrik);
    // Layouten i minnet och den sparade layouten. Övriga nycklar i lagringen (sessionens egna
    // tidsstämplar m.m.) skrivs av annat än testet och hör inte hit.
    const bild = () => page.evaluate(() => JSON.stringify(state.widgets) + '|' + localStorage.getItem('vyra-state'));

    // En familj utan testadapter visar ingen knapp.
    await valj('^ORDJAKTEN');
    assert.equal(await page.evaluate(() => document.querySelector('[data-kat-gor="testa"]').hidden), true, 'Ordjakten har ingen testadapter och ska inte visa knappen');

    await valj('^LAST-X');
    assert.equal(await page.evaluate(() => document.querySelector('[data-kat-gor="testa"]').hidden), false, 'Last-X har en testadapter');
    const fore = await bild();
    await page.click('.kat-scen [data-kat-gor="testa"]');
    // Vänta på det som ska mätas i stället för en fast tid: entrén börjar från noll storlek.
    await page.waitForFunction(() => {
      const n = document.querySelector('.kat-scen-prov-inre')?.firstElementChild;
      return window.VyraTestspel.status().aktiv && !!n && n.getBoundingClientRect().width > 20;
    }, null, { timeout: 10000, polling: 50 });
    const m = await page.evaluate(() => {
      const st = window.VyraTestspel.status(), inre = document.querySelector('.kat-scen-prov-inre'), nod = inre.firstElementChild;
      const q = nod ? nod.getBoundingClientRect() : null, y = document.querySelector('.kat-scen-yta').getBoundingClientRect();
      return {
        aktiv: st.aktiv, adapter: st.adapter, klon: !!nod && nod.dataset.testspelKlon === '1',
        paDuken: !!document.querySelector('.canvas [data-testspel-klon]'),
        inne: !!q && q.width > 20 && q.left >= y.left - 2 && q.right <= y.right + 2 && q.top >= y.top - 2 && q.bottom <= y.bottom + 2,
        stillbildSyns: document.querySelector('.kat-scen-vard').getClientRects().length > 0,
        knapp: document.querySelector('[data-kat-gor="testa"]').textContent
      };
    });
    assert.equal(m.aktiv, true, 'testet startade inte');
    assert.equal(m.adapter, 'lastx');
    assert.equal(m.klon, true, 'klonen ska ligga i scenens provyta');
    assert.equal(m.paDuken, false, 'ett katalogtest får aldrig lägga en klon på duken');
    assert.equal(m.inne, true, 'klonen ska rymmas på scenen');
    assert.equal(m.stillbildSyns, false, 'stillbilden ska vila under testet, annars syns widgeten dubbelt');
    assert.equal(m.knapp, '■ Stoppa test');

    // Byter man familj mitt i testet stoppas det, och scenen är ren.
    await valj('^GIFT JAR');
    await page.waitForFunction(() => !window.VyraTestspel.status().aktiv, null, { timeout: 10000, polling: 50 });
    const efter = await page.evaluate(() => ({
      aktiv: window.VyraTestspel.status().aktiv, kvar: document.querySelector('.kat-scen-prov-inre').children.length,
      testar: document.querySelector('.kat-scen').classList.contains('kat-scen-testar'),
      knapp: document.querySelector('[data-kat-gor="testa"]').textContent, brott: window.VyraTestspel.brott().length
    }));
    assert.deepEqual(efter, { aktiv: false, kvar: 0, testar: false, knapp: '▶ Testa widget', brott: 0 });
    assert.equal(await bild(), fore, 'testet ändrade layouten eller lagringen');
  } finally { await page.close(); }
});

test('Top Like, Top Coins och Top Points är en design med en växel', { skip, timeout: 120000 }, async () => {
  const page = await oppna();
  try {
    await page.evaluate(() => window.VyraKatalogScen.vy('galleri'));
    await page.evaluate(() => {
      [...document.querySelectorAll('.kat-familjer [data-kat-familj]')].find(b => /^RANKING/.test(b.dataset.katFamilj)).click();
      return new Promise(k => setTimeout(k, 400));
    });
    const las = () => page.evaluate(() => {
      const sek = document.querySelector('.overlay-widget-gallery .widget-catalog > .kat-scen-vald');
      const alla = [...sek.querySelectorAll('button[data-catalog-key]')], syn = alla.filter(b => b.getClientRects().length);
      return {
        alla: alla.length, synliga: syn.map(b => b.dataset.catalogKey),
        vaxel: [...document.querySelectorAll('.kat-scen-varianter:not([hidden]) button')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')),
        namn: document.querySelector('.kat-scen-namn b').textContent, vald: window.VyraKatalogScen.vald().kort,
        raknare: document.querySelector('.kat-scen-raknare').textContent, typer: state.widgets.map(w => w.type)
      };
    });
    const start = await las();
    assert.ok(start.alla >= 15, `rankingsektionen byggdes inte (${start.alla} kort)`);
    assert.ok(start.synliga.length < start.alla, 'varianterna ska vara ihopslagna i remsan');
    assert.deepEqual(start.vaxel, ['Top Like*', 'Top Coins', 'Top Points']);
    assert.equal(start.namn, 'Voltage', 'en design med varianter heter som designen');
    assert.ok(start.synliga.every(k => !/templateTop(Coins|Points)/.test(k)), 'från start visar remsan Top Like-varianten');
    assert.match(start.raknare, new RegExp('av ' + start.synliga.length + '$'), 'räknaren räknar designer, inte kort');
    // Neonramarnas lägen har olika undertext och är egna designer, inte varianter.
    assert.equal(start.synliga.filter(k => /^catalog:toplike:ljusring/.test(k)).length, 5);

    await page.locator('.kat-scen-varianter button', { hasText: 'Top Coins' }).click();
    await page.waitForFunction(() => window.VyraKatalogScen.vald().kort === 'catalog:ranking:templateTopCoins:voltage', null, { timeout: 5000 });
    const coins = await las();
    assert.deepEqual(coins.vaxel, ['Top Like', 'Top Coins*', 'Top Points']);
    assert.equal(coins.synliga.length, start.synliga.length, 'växeln byter variant, inte antal designer');
    assert.equal(coins.alla, start.alla, 'inga kort försvinner ur katalogen');

    // Varianten följer med när man bläddrar, och det är den som läggs till.
    await page.click('.kat-scen-fram');
    await page.waitForFunction(() => /templateTopCoins/.test(window.VyraKatalogScen.vald().kort) && !/voltage/.test(window.VyraKatalogScen.vald().kort), null, { timeout: 5000 });
    await page.evaluate(() => { selected = null; });
    await page.click('.kat-scen [data-kat-gor="lagg"]');
    await page.waitForFunction(() => !!selected, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => liveWidget(selected)?.type), 'templateTopCoins');

    // I Lista syns alla kort som förut.
    await page.evaluate(() => window.VyraKatalogScen.vy('lista'));
    const synligaILista = await page.evaluate(() => [...document.querySelectorAll('.rk6-katalog button[data-catalog-key]')].filter(b => b.getClientRects().length).length);
    assert.equal(synligaILista, start.alla, 'Lista ska visa varje variant som ett eget kort');
  } finally { await page.close(); }
});

// Fyra familjer utan registerpost testas genom katalogadaptrar (katalog-testadaptrar.js).
test('Quiz, Hjärtan & moln, Energimätare och Viewer Showcase spelar på scenen', { skip, timeout: 180000 }, async () => {
  const page = await oppna();
  try {
    await page.evaluate(() => window.VyraKatalogScen.vy('galleri'));
    const bild = () => page.evaluate(() => JSON.stringify(state.widgets) + '|' + localStorage.getItem('vyra-state')
      + '|' + Object.keys(localStorage).filter(k => /^vyra-(quiz|energi)-/.test(k)).sort().join(','));
    const fore = await bild();
    const spela = async (rubrik, adapter) => {
      await page.evaluate(r => {
        [...document.querySelectorAll('.kat-familjer [data-kat-familj]')].find(x => new RegExp(r).test(x.dataset.katFamilj)).click();
        return new Promise(k => setTimeout(k, 400));
      }, rubrik);
      assert.equal(await page.evaluate(() => document.querySelector('[data-kat-gor="testa"]').hidden), false, rubrik + ' ska ha en testknapp');
      await page.click('.kat-scen [data-kat-gor="testa"]');
      await page.waitForFunction(() => {
        const n = document.querySelector('.kat-scen-prov-inre')?.firstElementChild;
        return window.VyraTestspel.status().aktiv && !!n && n.getBoundingClientRect().width > 20;
      }, null, { timeout: 10000, polling: 50 });
      assert.equal(await page.evaluate(() => window.VyraTestspel.status().adapter), adapter);
    };
    const stoppa = async () => {
      await page.evaluate(() => window.VyraTestspel.stoppa());
      await page.waitForFunction(() => !window.VyraTestspel.status().aktiv, null, { timeout: 5000, polling: 50 });
    };
    const klon = sel => '.kat-scen-prov-inre ' + sel;

    // Energimätaren fylls till full.
    await spela('^ENERGIMÄTARE', 'energi');
    await page.waitForFunction(s => document.querySelector(s)?.textContent === '100%', klon('.em-varde'), { timeout: 8000, polling: 100 });
    assert.equal(await page.textContent(klon('.em-tips')), 'Full energi!');
    await stoppa();

    // Quizet tar emot tre svar och går till rättning, med en ledare.
    await spela('^QUIZ', 'quiz');
    await page.waitForFunction(s => /3 svar/.test(document.querySelector(s)?.textContent || ''), klon('.qz-tips'), { timeout: 8000, polling: 100 });
    await page.waitForFunction(s => document.querySelector(s)?.textContent === 'RÄTTNING', klon('.qz-klocka'), { timeout: 8000, polling: 100 });
    assert.equal(await page.evaluate(s => document.querySelectorAll(s).length, klon('.qz-ratt')), 1, 'rätt svar ska vara markerat');
    assert.match(await page.textContent(klon('.qz-ledare')), /^Leder: /);
    await stoppa();

    // Viewer Showcase spelar sitt firande med exempelnamnet.
    await spela('^VIEWER SHOWCASE', 'showcase');
    assert.equal(await page.evaluate(() => document.querySelector('.kat-scen-prov-inre').firstElementChild.classList.contains('vs-spelar')), true);
    assert.equal(await page.textContent(klon('.vs-namn')), 'Alex');
    await stoppa();

    // Hjärtan & moln får en egen videonod i klonen, med familjens klipp.
    await spela('^HJÄRTAN', 'hjartmoln');
    const moln = await page.evaluate(() => {
      const nod = document.querySelector('.kat-scen-prov-inre').firstElementChild, v = nod.querySelector('.hm-vard video');
      return { pa: nod.classList.contains('hm-pa'), src: v ? v.getAttribute('src') : null };
    });
    assert.equal(moln.pa, true);
    assert.match(moln.src || '', /^assets\/videos\/hjartmoln\/.+\.webm$/);
    await stoppa();

    const efter = await page.evaluate(() => ({
      brott: window.VyraTestspel.brott().length, kvar: document.querySelector('.kat-scen-prov-inre').children.length,
      quiz: [...window.VyraQuiz._lage.keys()].filter(k => /__prov$/.test(k)).length,
      energi: [...window.VyraEnergimatare._lage.keys()].filter(k => /__prov$/.test(k)).length
    }));
    assert.deepEqual(efter, { brott: 0, kvar: 0, quiz: 0, energi: 0 }, 'testen ska städa efter sig och aldrig slå i vakterna');
    assert.equal(await bild(), fore, 'testen ändrade layouten eller sparade ett läge');
  } finally { await page.close(); }
});

// VAL PÅ SCENEN: Neonramarnas 21 ramar och 12 fyrkantiga modeller väljs under scenen (David 2026-11-11).
test('Neonramar: ramen väljs på scenen och följer med till layouten och testet', { skip, timeout: 180000 }, async () => {
  const page = await oppna();
  try {
    await page.evaluate(() => window.VyraKatalogScen.vy('galleri'));
    await page.evaluate(() => {
      [...document.querySelectorAll('.kat-familjer [data-kat-familj]')].find(b => /^RANKING/.test(b.dataset.katFamilj)).click();
      return new Promise(k => setTimeout(k, 400));
    });
    const las = () => page.evaluate(() => {
      const v = document.querySelector('.kat-scen-val'), t = document.querySelector('.kat-scen-kort .owg-thumb'), rot = t && (t.shadowRoot || t);
      return {
        synlig: !v.hidden,
        vaxel: [...v.querySelectorAll('.kat-scen-val-vaxel button')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')),
        antal: v.querySelectorAll('.kat-scen-val-rad button').length,
        namn: v.querySelector('.kat-scen-valnamn')?.textContent || null,
        ring: rot ? (rot.querySelector('.tl-ram-ring')?.getAttribute('src') || null) : null,
        klasser: rot ? (rot.querySelector('.tl')?.className || '') : ''
      };
    });
    // En design utan val inuti visar ingen rad.
    assert.equal((await las()).synlig, false, 'Voltage har inga val och ska inte visa raden');

    await page.evaluate(() => {
      const kort = document.querySelector('.widget-catalog [data-tln-skapa="liggande"]');
      kort.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    await page.locator('.widget-catalog [data-tln-skapa="liggande"]').click();
    await page.waitForFunction(() => !document.querySelector('.kat-scen-val').hidden, null, { timeout: 5000 });
    const start = await las();
    assert.deepEqual(start.vaxel, ['Rund*', 'Fyrkant']);
    assert.equal(start.antal, 21, 'alla 21 ramarna ska gå att välja');
    assert.equal(start.namn, 'Blå · 1 av 21');
    assert.match(start.ring || '', /ram-1-ring\.png$/);

    // Ett klick byter ram på scenen — ingenting läggs till.
    const fore = await page.evaluate(() => state.widgets.length);
    await page.click('.kat-scen-val [data-kat-varde="guld"]');
    await page.waitForFunction(() => /Guld · 8 av 21/.test(document.querySelector('.kat-scen-valnamn')?.textContent || ''), null, { timeout: 5000 });
    await page.waitForFunction(() => { const t = document.querySelector('.kat-scen-kort .owg-thumb'); return /ram-8-ring/.test((t && (t.shadowRoot || t).querySelector('.tl-ram-ring')?.getAttribute('src')) || ''); }, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => state.widgets.length), fore, 'att välja en ram får inte lägga till något');
    assert.deepEqual(await page.evaluate(() => window.VyraKatalogScen.val('catalog:toplike:ljusring:liggande')), { tlnRam: 'guld' });

    // ▶ Testa widget spelar med den valda ramen.
    await page.click('.kat-scen [data-kat-gor="testa"]');
    await page.waitForFunction(() => window.VyraTestspel.status().aktiv && !!document.querySelector('.kat-scen-prov-inre .tl-ram-ring'), null, { timeout: 10000, polling: 50 });
    assert.match(await page.evaluate(() => document.querySelector('.kat-scen-prov-inre .tl-ram-ring').getAttribute('src')), /ram-8-ring\.png$/);
    await page.evaluate(() => window.VyraTestspel.stoppa());

    // Fyrkant byter raden till de tolv modellerna.
    await page.click('.kat-scen-val [data-kat-varde="fyrkant"]');
    await page.waitForFunction(() => document.querySelectorAll('.kat-scen-val-rad button').length === 12, null, { timeout: 5000 });
    await page.click('.kat-scen-val [data-kat-varde="diamant"]');
    await page.waitForFunction(() => /form-fyrkant/.test((() => { const t = document.querySelector('.kat-scen-kort .owg-thumb'); return (t && (t.shadowRoot || t).querySelector('.tl')?.className) || ''; })()) && /Diamant · 3 av 12/.test(document.querySelector('.kat-scen-valnamn')?.textContent || ''), null, { timeout: 5000 });
    assert.match((await las()).klasser, /fyr-diamant/);

    // Lägg till i Layout tar med valet; kortet bär det bara under klicket.
    await page.evaluate(() => { selected = null; });
    await page.click('.kat-scen [data-kat-gor="lagg"]');
    await page.waitForFunction(() => !!selected, null, { timeout: 5000 });
    const lagd = await page.evaluate(() => { const w = liveWidget(selected); return { skin: w.skin, lage: w.tlnLage, ram: w.tlnRam, form: w.tlnForm, fyr: w.tlnFyr }; });
    assert.deepEqual(lagd, { skin: 'ljusring', lage: 'liggande', ram: 'guld', form: 'fyrkant', fyr: 'diamant' });
    assert.equal(await page.evaluate(() => '__katScenVal' in document.querySelector('.widget-catalog [data-tln-skapa="liggande"]')), false);

    // Ett kodklick på kortet (utan scenens val) ger standardramen, som förut.
    await page.evaluate(() => { selected = null; document.querySelector('.widget-catalog [data-tln-skapa="pall"]').click(); });
    await page.waitForFunction(() => !!selected, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => liveWidget(selected).tlnRam), 'bla');
  } finally { await page.close(); }
});
