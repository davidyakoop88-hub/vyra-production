'use strict';
// TEXTRADEN ERSATTER DEN GAMLA RULLANDE TEXTEN (David 2026-11-07).
//
// Samma widget (catalog:custom:text, templateCustomText) far playgroundens textrad: rubrikflik +
// rullande meddelande, tre stilar, placering Overst / Under ovre delen och hastighet Lugn/Normal/Snabb.
// Provet haller fast det som ar latt att tappa bort:
//   * en sparad widget fran fore textraden ritas med sina egna falt och far ingen rubrik den inte hade,
//   * allt anvandaren skriver ar text (escapas), aven i panelens falt,
//   * en kort text i ett brett fonster upprepas sa loopen aldrig visar ett tomrum,
//   * loopen hoppar inte, och overlayn ar transparent utan studioram och utan dolda widgetar.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const TOKEN = 'provtoken-textrad';
const MEDDELANDE = 'Välkommen till liven! 💜 Följ och bli en del av teamet · Tack för alla gåvor! ✨';
const BAS = { type: 'templateCustomText', x: 11, width: 410, height: 40, textFontSize: 15, textLabel: 'VÄLKOMMEN', customText: MEDDELANDE, textSpeed: 'normal' };
const GAMMAL = { id: 'gammal', type: 'templateCustomText', x: 6, y: 400, width: 420, height: 90, customText: 'Gammal <b>sparad</b> & "text"', textScrollSpeed: 8, textFontSize: 32, textColor: '#ffd45b' };
const OVERLAY = [
  { ...BAS, id: 'a', y: 91, textStyle: 'broadcast' },
  { ...BAS, id: 'b', y: 192, textStyle: 'guld', textLabel: 'TACK', customText: 'Kort' },
  { ...BAS, id: 'c', y: 290, textStyle: 'minimal', textSpeed: 'snabb' },
  GAMMAL,
  { ...BAS, id: 'dold', y: 520, hidden: true, customText: 'DOLD SKA INTE SYNAS' },
];

function servera() {
  const server = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === `/api/overlay-access/${TOKEN}`) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, overlay: { id: 'OV-TEXTRAD', version: 1, state: { widgets: OVERLAY } } })); return; }
    if (u === `/api/overlay-access/${TOKEN}/goals`) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true,"goals":[]}'); return; }
    if (u === `/api/overlay-access/${TOKEN}/events/stream`) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': hej\n\n'); return; }
    const fil = path.join(ROOT, decodeURIComponent(u).replace(/^\/+/, ''));
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

async function editorn(page) {
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState, null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => { await window.VyraSessionState.projectLocalSession(); window.toast = () => {}; });
}

test('katalogen ger textraden; tre stilar, sparad widget orord och all text escapad', { skip, timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  try {
    await editorn(page);
    const m = await page.evaluate(async ([gammal]) => {
      state.widgets = [];
      const ny = o => { const w = Object.assign(VyraWidgets.create('catalog:custom:text'), o); state.widgets.push(w); return w; };
      const standard = ny({ id: 'std' });
      ny({ id: 'guld', y: 150, textStyle: 'guld', textLabel: '<i>TACK</i>', customText: 'Kort' });
      ny({ id: 'min', y: 210, textStyle: 'minimal', customText: 'Långt '.repeat(40) + '🎉' });
      state.widgets.push(JSON.parse(JSON.stringify(gammal)));
      selected = null; go('editor');
      await new Promise(r => setTimeout(r, 1200));
      const nod = id => document.querySelector(`.canvas [data-id="${id}"]`);
      const spar = id => { const t = nod(id).querySelector('.ctw-track'); return { halva: t.children[0].offsetWidth, fonster: t.parentElement.clientWidth, perHalva: t.children[0].children.length, anim: getComputedStyle(t).animationName }; };
      return {
        standard: { label: standard.textLabel, stil: standard.textStyle, fart: standard.textSpeed, text: standard.customText },
        stilar: ['std', 'guld', 'min'].map(id => nod(id).dataset.vtrStil),
        ramar: ['std', 'guld', 'min'].map(id => nod(id).querySelector('.vtr-ram').className),
        guldLabel: nod('guld').querySelector('.vtr-label').textContent,
        guldHtml: nod('guld').querySelector('.vtr-label').innerHTML,
        kort: spar('guld'), lang: spar('min'),
        gammalLabel: !!nod('gammal').querySelector('.vtr-label'),
        gammalText: nod('gammal').querySelector('.ctw-text').textContent,
        gammalFarg: nod('gammal').querySelector('.ctw-text').style.color,
        gammalFont: nod('gammal').querySelector('.ctw-text').style.fontSize,
        gammalSparad: state.widgets.find(w => w.id === 'gammal'),
        etikettFarg: getComputedStyle(nod('std').querySelector('.vtr-label span')).color,
      };
    }, [GAMMAL]);
    assert.deepEqual(m.standard, { label: 'VÄLKOMMEN', stil: 'broadcast', fart: 'normal', text: MEDDELANDE });
    assert.deepEqual(m.stilar, ['broadcast', 'guld', 'minimal']);
    assert.ok(m.ramar[1].includes('vtr-guld') && m.ramar[2].includes('vtr-minimal'), m.ramar.join(' | '));
    assert.equal(m.guldLabel, '<i>TACK</i>', 'rubriken ska visas som text');
    assert.ok(!/<i>/.test(m.guldHtml), 'rubriken tolkades som HTML: ' + m.guldHtml);
    // Etiketten ska vara mork pa den ljusa fliken, inte studio.css .widget span-grått.
    assert.equal(m.etikettFarg, 'rgb(19, 17, 36)');
    // Kort text: varje halva minst lika bred som fonstret, annars syns ett glapp i loopen.
    assert.ok(m.kort.perHalva > 1 && m.kort.halva >= m.kort.fonster, JSON.stringify(m.kort));
    assert.equal(m.kort.anim, 'vtrRull');
    assert.equal(m.lang.perHalva, 1, 'en lang text ska inte upprepas: ' + JSON.stringify(m.lang));
    // Sparad widget fran fore textraden: ingen rubrik, egen text som text, egna falt orörda.
    assert.equal(m.gammalLabel, false);
    assert.equal(m.gammalText, 'Gammal <b>sparad</b> & "text"');
    assert.equal(m.gammalFarg, 'rgb(255, 212, 91)');
    assert.equal(m.gammalFont, '32px');
    assert.deepEqual(m.gammalSparad, GAMMAL);
  } finally { await page.close(); }
});

test('panelen styr rubrik, stil, placering och hastighet', { skip, timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  try {
    await editorn(page);
    await page.evaluate(async () => { state.widgets = []; const w = VyraWidgets.create('catalog:custom:text'); w.id = 'tr'; state.widgets.push(w); selected = 'tr'; go('editor'); await new Promise(r => setTimeout(r, 1200)); });
    const fore = await page.evaluate(() => ({ plats: document.querySelector('#ctwPlace').value, fart: document.querySelector('#ctwFart').value, stil: document.querySelector('#ctwStyle').value, varv: parseFloat(document.querySelector('.canvas [data-id="tr"] .ctw-track').style.getPropertyValue('--speed')) }));
    assert.deepEqual([fore.plats, fore.fart, fore.stil], ['top', 'normal', 'broadcast']);
    await page.selectOption('#ctwStyle', 'guld'); await page.waitForTimeout(300);
    await page.selectOption('#ctwPlace', 'middle'); await page.waitForTimeout(300);
    await page.selectOption('#ctwFart', 'snabb'); await page.waitForTimeout(500);
    const efter = await page.evaluate(() => { const w = state.widgets.find(x => x.id === 'tr'); const n = document.querySelector('.canvas [data-id="tr"]'); return { textStyle: w.textStyle, textSpeed: w.textSpeed, x: w.x, y: w.y, width: w.width, stil: n.dataset.vtrStil, varv: parseFloat(n.querySelector('.ctw-track').style.getPropertyValue('--speed')) }; });
    assert.deepEqual({ ...efter, varv: undefined }, { textStyle: 'guld', textSpeed: 'snabb', x: 11, y: 192, width: 410, stil: 'guld', varv: undefined });
    // Snabb ar 90/65 av Normal: samma text tar kortare tid per varv.
    assert.ok(efter.varv < fore.varv * 0.8, `varvet blev inte kortare: ${fore.varv} -> ${efter.varv}`);
  } finally { await page.close(); }
});

test('overlayn: transparent, utan studioram, dold syns inte och loopen hoppar inte', { skip, timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 432, height: 768 } });
  const fel = []; page.on('pageerror', e => fel.push(String(e)));
  try {
    await page.goto(`${bas}/studio.html?overlay=1&access=${TOKEN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('.custom-text-widget').length >= 4, null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor,
      ramar: [...document.querySelectorAll('.custom-text-widget')].filter(n => n.getBoundingClientRect().height > 0 && getComputedStyle(n).display !== 'none').map(n => n.dataset.id + ':' + getComputedStyle(n).borderTopStyle),
      dold: document.body.innerText.includes('DOLD SKA INTE SYNAS'),
    }));
    assert.equal(m.html, 'rgba(0, 0, 0, 0)'); assert.equal(m.body, 'rgba(0, 0, 0, 0)');
    assert.deepEqual(m.ramar.sort(), ['a:none', 'b:none', 'c:none', 'gammal:none']);
    assert.equal(m.dold, false, 'en dold textrad ritades i overlayn');
    const loop = await page.evaluate(async () => {
      const t = document.querySelector('[data-id="b"] .ctw-track'), halva = t.children[0].offsetWidth;
      let forra = null, hopp = 0, n = 0; const s0 = performance.now();
      while (performance.now() - s0 < 2500) {
        await new Promise(r => requestAnimationFrame(r));
        const x = new DOMMatrix(getComputedStyle(t).transform).m41;
        if (forra !== null) { let d = forra - x; if (d < -halva / 2) d += halva; if (d < -0.5 || d > halva / 4) hopp++; }
        forra = x; n++;
      }
      return { hopp, n };
    });
    assert.ok(loop.n > 20, 'for fa bildrutor: ' + loop.n);
    assert.equal(loop.hopp, 0, 'loopen hoppade ' + loop.hopp + ' ganger');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});
