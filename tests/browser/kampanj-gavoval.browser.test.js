'use strict';
// GIFT CAMPAIGNS GÅVOVAL — EN FLIK PER GÅVA (vyra-kampanj-gavoval.js, 2026-10-20).
//
// David: "kan man få de som flick att tycka på nr 1 väljer man gift sen kommer nr två o sånt", med en
// rullgardin där varje rad har gåvans bild, namn och mynt. Provet går vägen som streamern går den:
//   * flikraden har lika många flikar som Antal gåvor, svenska aria-etiketter och minst 44×32 px,
//   * flik 1 → Gåva-listan (Action & Events gåvokatalog: inlärda gåvor med svenska namn och mynt) →
//     välj en gåva → widgeten på duken visar dess bild och namn, och fliken bär gåvans bild,
//   * flik 2 → en annan gåva → widgeten visar båda, och flik 1 är orörd,
//   * gåvorna finns kvar efter omritning (render) och efter omladdning av sidan,
//   * piltangenterna (och Home/End) går mellan flikarna, Escape stänger listan,
//   * de gamla raderna "Gåva N: namn"/"Gåva N: mål" står inte kvar (inga dubbletter),
//   * en riktig gåva genom livevägen räknas på den valda gåvan även när visningsnamnet ändrats.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
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

// Inlärda gåvor, som efter en sändning (svenska namn, riktiga mynt). Katalogen läser dem först.
const E = 'assets/gifts/events/';
// Ros är inlärd med combons summa (5 rosor = 5), som inlärningen gjorde före 2026-10-21; molnets
// katalog har TikToks pris per gåva (1), och det ska vinna. Utan bild ska inte visas alls.
const INLARDA = [
  { name: 'Solglasögon', image: E + '0016_Cool.png', coins: 199 },
  { name: 'Ros', image: E + '0001_Rose.png', coins: 5 },
  { name: 'Glasstrut', image: E + '0033_Ice_Cream_Cone.png', coins: 1 },
  { name: 'Utan Bild', image: '', coins: 3 },
];
const MOLN = [{ name: 'Ros', image: E + '0001_Rose.png', coins: 1 }, { name: 'Trasig Bild', image: 'assets/finns-inte.png', coins: 2 }];

let server, browser, bas;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function vantaPanel(page) {
  await page.waitForFunction(() => document.querySelector('.properties')?.dataset.panelram === '1'
    && !!document.querySelector('.properties [data-panelram-sektion="2"] #gcGavoflikar'), null, { timeout: 15000, polling: 100 });
  await page.evaluate(() => document.querySelector('.properties [data-panelram-sektion="2"]').classList.add('open'));
}

async function startaStudio(page) {
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraPanelregister, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  // Lokal projektion (ingen inloggning): state läses från och sparas till localStorage.
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
}

const lasFlikar = page => page.evaluate(() => [...document.querySelectorAll('.properties .gc-flik')].map(f => {
  const r = f.getBoundingClientRect();
  return { aria: f.getAttribute('aria-label'), vald: f.getAttribute('aria-selected'), tab: f.tabIndex, b: r.width, h: r.height,
    bild: (f.querySelector('img') || {}).getAttribute?.('src') || '' };
}));
const widgeten = page => page.evaluate(() => {
  const n = document.querySelector('.canvas .widget[data-id="gc"]');
  return n ? { text: n.innerText.replace(/\s+/g, ' '), bilder: [...n.querySelectorAll('article img')].map(i => i.getAttribute('src')) } : null;
});

async function valjGava(page, namn) {
  await page.click('.properties .gc-valj');
  await page.waitForSelector('.properties .gc-lista:not([hidden]) [role="option"]');
  const rader = await page.evaluate(() => [...document.querySelectorAll('.properties .gc-lista [role="option"]')].slice(0, 5).map(b => b.textContent));
  await page.click(`.properties .gc-lista [role="option"][data-gc-namn="${namn}"]`);
  await page.waitForTimeout(500);
  return rader;
}

test('Gift Campaign: flik 1 och 2 väljer var sin gåva, gåvorna står kvar, flikarna går med tangentbord', { skip, timeout: 180000 }, async () => {
  const fel = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.addInitScript(([l, m]) => { try { if (!localStorage.getItem('vyra-seen-gifts-v1')) localStorage.setItem('vyra-seen-gifts-v1', JSON.stringify(l)); localStorage.setItem('vyra-gift-cloud-v1', JSON.stringify(m)); } catch (_) {} }, [INLARDA, MOLN]);
  try {
    await startaStudio(page);
    await page.evaluate(() => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:giftcampaign:gold:landscape'); w.id = 'gc'; w.x = 100; w.y = 150;
      state.widgets.push(w); selected = 'gc'; save(); render();
    });
    await vantaPanel(page);

    // Flikraden: fyra flikar (Antal gåvor 4), svenska etiketter, flik 1 vald, minst 44×32 px.
    let flikar = await lasFlikar(page);
    assert.deepEqual(flikar.map(f => f.aria), ['Gåva 1', 'Gåva 2', 'Gåva 3', 'Gåva 4']);
    assert.deepEqual(flikar.map(f => f.vald), ['true', 'false', 'false', 'false']);
    assert.deepEqual(flikar.map(f => f.tab), [0, -1, -1, -1], 'rörlig tabbordning: bara den valda fliken nås med Tab');
    for (const f of flikar) assert.ok(f.b >= 44 && f.h >= 32, `${f.aria} är ${f.b}×${f.h} px`);

    // De gamla raderna är borta; Namn och Mål (st) står en gång var.
    const etiketter = await page.evaluate(() => [...document.querySelectorAll('.properties [data-panelram-sektion="2"] label')]
      .filter(l => l.getBoundingClientRect().height > 0).map(l => { const c = l.cloneNode(true); c.querySelectorAll('input,select,button,b,small').forEach(n => n.remove()); return c.textContent.trim(); }));
    assert.ok(!etiketter.some(e => /^Gåva \d: (namn|mål)$/.test(e)), 'de gamla raderna står kvar: ' + etiketter.join(', '));
    assert.equal(etiketter.filter(e => e === 'Namn').length, 1);
    assert.equal(etiketter.filter(e => e === 'Mål (st)').length, 1);

    // Listan: sorterad billigast först, coins (inte mynt), katalogens pris per gåva (Ros 1, inte 5),
    // ingen gåva utan bild, och en bild som inte laddar blir gåvoikonen — aldrig profil-silhuetten.
    await page.click('.properties .gc-valj');
    await page.waitForSelector('.properties .gc-lista:not([hidden]) [role="option"]');
    await page.waitForTimeout(800);
    const lista = await page.evaluate(() => [...document.querySelectorAll('.properties .gc-lista [role="option"]')].map(b => ({
      text: b.textContent.replace(/\u00a0/g, ' '), src: b.querySelector('img') && b.querySelector('img').getAttribute('src') })));
    const pris = lista.map(r => +((/\(([\d ]+) coins\)/.exec(r.text) || [])[1] || '0').replace(/ /g, '')).filter(Boolean);
    assert.deepEqual(pris, [...pris].sort((a, b) => a - b), 'listan är inte sorterad efter coins: ' + lista.slice(0, 8).map(r => r.text).join(', '));
    assert.ok(lista.some(r => r.text === 'Ros (1 coins)'), 'Ros ska kosta 1 coins: ' + lista.filter(r => /^Ros/.test(r.text)).map(r => r.text));
    assert.ok(!lista.some(r => /mynt/.test(r.text)), 'ordet mynt står kvar');
    assert.ok(!lista.some(r => /^Utan Bild/.test(r.text)), 'en gåva utan bild visas');
    const trasig = lista.find(r => /^Trasig Bild/.test(r.text));
    assert.ok(trasig && /^data:image\/svg/.test(trasig.src), 'trasig bild ska bli gåvoikonen, inte ' + (trasig && trasig.src));
    assert.ok(!lista.some(r => /test-profile/.test(r.src || '')), 'profil-silhuetten i gåvolistan');
    await page.click('.properties .gc-valj');

    // Flik 1 → Solglasögon.
    const rader = await valjGava(page, 'Solglasögon');
    assert.ok(rader.length > 0);
    let w = await widgeten(page);
    assert.match(w.text, /Solglasögon/, 'widgeten visar gåvans namn');
    assert.equal(w.bilder[0], E + '0016_Cool.png', 'widgeten visar gåvans bild');
    assert.match(await page.evaluate(() => document.querySelector('.properties .gc-valj').textContent), /Solglasögon.*\(199 coins\)/);
    assert.equal(await page.evaluate(() => document.querySelector('#gcGavaNamn').value), 'Solglasögon', 'Namn förifylls från gåvan');

    // Flik 2 → Glasstrut. Flik 1 är orörd.
    await page.click('.properties .gc-flik[data-gc-flik="1"]');
    assert.deepEqual((await lasFlikar(page)).map(f => f.vald), ['false', 'true', 'false', 'false']);
    await valjGava(page, 'Glasstrut');
    w = await widgeten(page);
    assert.match(w.text, /Solglasögon.*Glasstrut/);
    assert.deepEqual(w.bilder.slice(0, 2), [E + '0016_Cool.png', E + '0033_Ice_Cream_Cone.png']);
    flikar = await lasFlikar(page);
    assert.equal(flikar[1].vald, 'true', 'flik 2 är fortfarande vald efter omritningen');
    assert.equal(flikar[0].bild, E + '0016_Cool.png', 'flik 1 bär sin gåvas bild');
    assert.equal(flikar[1].bild, E + '0033_Ice_Cream_Cone.png', 'flik 2 bär sin gåvas bild');

    // Mål (st) skrivs till giftTarget för vald flik, och widgeten visar det.
    await page.fill('#gcGavaMal', '77');
    await page.press('#gcGavaMal', 'Enter');
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => liveWidget('gc').giftTarget1), 77);
    assert.match((await widgeten(page)).text, /\/ 77/);

    // Tangentbordet: pil höger, pil vänster, End och Home.
    await page.focus('.properties .gc-flik[data-gc-flik="1"]');
    const fokus = () => page.evaluate(() => [document.activeElement?.dataset?.gcFlik, document.querySelector('.properties .gc-flik[aria-selected="true"]')?.dataset.gcFlik]);
    await page.keyboard.press('ArrowRight'); assert.deepEqual(await fokus(), ['2', '2']);
    await page.keyboard.press('ArrowLeft'); assert.deepEqual(await fokus(), ['1', '1']);
    await page.keyboard.press('End'); assert.deepEqual(await fokus(), ['3', '3']);
    await page.keyboard.press('ArrowRight'); assert.deepEqual(await fokus(), ['0', '0'], 'pil höger från sista fliken går runt till första');
    await page.keyboard.press('Home'); assert.deepEqual(await fokus(), ['0', '0']);

    // Listan med tangentbord: pil ned öppnar, Escape stänger och lämnar fokus på knappen.
    await page.focus('.properties .gc-valj');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.querySelector('.properties .gc-lista').hidden), false);
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => [document.querySelector('.properties .gc-lista').hidden, document.activeElement?.classList.contains('gc-valj')]), [true, true]);

    // Omritning och omladdning: gåvorna finns kvar.
    await page.evaluate(() => { render(); });
    await vantaPanel(page);
    assert.deepEqual(await page.evaluate(() => { const x = liveWidget('gc'); return [x.giftName0, x.giftImage0, x.giftName1, x.giftImage1]; }),
      ['Solglasögon', E + '0016_Cool.png', 'Glasstrut', E + '0033_Ice_Cream_Cone.png']);
    await page.waitForTimeout(800);
    await startaStudio(page);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.widgets.some(x => x.id === 'gc'), null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => { selected = 'gc'; render(); });
    await vantaPanel(page);
    flikar = await lasFlikar(page);
    assert.deepEqual(flikar.slice(0, 2).map(f => f.bild), [E + '0016_Cool.png', E + '0033_Ice_Cream_Cone.png'], 'flikarna bär de sparade gåvorna efter omladdning');
    w = await widgeten(page);
    assert.match(w.text, /Solglasögon.*Glasstrut/);

    // Visningsnamnet ändras; en riktig gåva genom livevägen räknas ändå på gåvan som valdes.
    await page.fill('#gcGavaNamn', 'Coola glasögon');
    await page.press('#gcGavaNamn', 'Enter');
    await page.waitForTimeout(400);
    assert.match((await widgeten(page)).text, /Coola glasögon/);
    const fore = await page.evaluate(() => Number(liveWidget('gc').giftCurrent0) || 0);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'gift', giftName: 'Solglasögon', count: 3, username: 'Prov' } })));
    await page.waitForTimeout(400);
    const efter = await page.evaluate(() => Number(liveWidget('gc').giftCurrent0) || 0);
    assert.equal(efter - fore, 3, 'gåvan räknades på flik 1:s gåva');

    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});
