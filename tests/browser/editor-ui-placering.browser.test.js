'use strict';
// Tre flyttar i editorns skal, efter Davids markeringar 2026-08-13.
//
// LAGET FORE, uppmatt:
//   * "+ Lagg till widget" (#toggleWidgetCatalog) byggs som SISTA barn i .live-layer-panel
//     (media.js mountLiveLayers) och hamnar darfor hogt upp — y=189 i en sidopanel som ar
//     852 px hog. Den ska ligga langst NER i sidopanelen.
//   * Zoomkontrollerna (.vy-kontroll) monteras i .workarea med position:sticky;bottom:12px
//     (vyra-zoom.js montera). De ska upp i verktygsraden bredvid formatvaljaren.
//   * .workarea rullar lodratt: scrollHeight 864 mot clientHeight 852. Jag TRODDE forst att
//     zoomboxens 12 px var orsaken — fel. Uppmatt kommer overskottet ur layouten sjalv:
//     40 px verktygsrad + 768 px duk + 28 px marginal = 864. Rullningen behalls darfor och
//     bara listen doljs; stanger man av rullningen blir dukens nederkant onabar i sma fonster.
//
// VARFOR RIKTIG WEBBLASARE: allt harinne ar getBoundingClientRect och scrollHeight. jsdom
// saknar layout och svarar 0, sa provet hade varit gront aven utan implementation.
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

async function editorn() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:topgift');
    w.x = 40; w.y = 60; state.widgets.push(w); selected = w.id; render();
  });
  await page.waitForTimeout(900);
  return page;
}

test('"+ Lagg till widget" ligger langst ner i sidopanelen', { skip }, async () => {
  const page = await editorn();
  const m = await page.evaluate(() => {
    const knapp = document.querySelector('#toggleWidgetCatalog') || document.querySelector('.live-layer-add');
    const panel = document.querySelector('.elements');
    if (!knapp || !panel) return { fel: 'knappen eller sidopanelen saknas' };
    const k = knapp.getBoundingClientRect(), p = panel.getBoundingClientRect();
    return { avstandTillBotten: Math.round(p.bottom - k.bottom),
             direktBarn: knapp.parentElement === panel,
             sistaBarnet: panel.lastElementChild === knapp,
             panelHojd: Math.round(p.height) };
  });
  await page.close();
  assert.ok(!m.fel, m.fel);
  assert.ok(m.direktBarn, 'knappen maste vara ett direkt barn till .elements for att kunna bottenjusteras');
  assert.ok(m.sistaBarnet, 'knappen ska vara sista elementet i sidopanelen');
  assert.ok(m.avstandTillBotten <= 24,
    `knappens underkant ligger ${m.avstandTillBotten} px fran sidopanelens botten (panelen ar ${m.panelHojd} px hog)`);
});

test('zoomkontrollerna sitter i verktygsraden, inte over duken', { skip }, async () => {
  const page = await editorn();
  const m = await page.evaluate(() => {
    const box = document.querySelector('[data-vy-kontroll]');
    const toolbar = document.querySelector('.editor-shell .editor-toolbar');
    const workarea = document.querySelector('.workarea');
    if (!box || !toolbar) return { fel: 'zoomboxen eller verktygsraden saknas' };
    return { iToolbar: toolbar.contains(box),
             stickyOverDuken: getComputedStyle(box).position === 'sticky',
             position: getComputedStyle(box).position,
             overkant: Math.round(box.getBoundingClientRect().top),
             toolbarOverkant: Math.round(toolbar.getBoundingClientRect().top) };
  });
  await page.close();
  assert.ok(!m.fel, m.fel);
  assert.ok(m.iToolbar, 'zoomboxen ligger inte i .editor-toolbar');
  // .editor-toolbar ar SJALV ett barn till .workarea (uppmatt), sa "ligger inte i workarea"
  // gick aldrig att krava. Det som betyder nagot ar att boxen inte langre svavar over duken.
  assert.ok(!m.stickyOverDuken, 'zoomboxen ar fortfarande position:sticky och svavar over duken');
  assert.ok(Math.abs(m.overkant - m.toolbarOverkant) <= 40,
    `zoomboxen ar ${Math.round(m.overkant - m.toolbarOverkant)} px fran verktygsradens overkant`);
});

test('duken har ingen lodrat rullningslist', { skip }, async () => {
  const page = await editorn();
  const m = await page.evaluate(() => {
    const w = document.querySelector('.workarea');
    if (!w) return { fel: '.workarea saknas' };
    return { scrollHeight: w.scrollHeight, clientHeight: w.clientHeight,
             // bredden pa rullningslistens ranna: 0 betyder att ingen list ritas ut
             ranna: w.offsetWidth - w.clientWidth,
             overflowY: getComputedStyle(w).overflowY };
  });
  await page.close();
  assert.ok(!m.fel, m.fel);
  // Innehallet FAR overstiga ytan — rullningen behalls sa att dukens nederkant nas i sma
  // fonster. Det som ska bort ar sjalva listen, och den syns som en ranna i elementets bredd.
  assert.equal(m.ranna, 0,
    `rullningslisten tar ${m.ranna} px i bredd — den ska vara dold (scrollHeight ${m.scrollHeight} `
    + `mot clientHeight ${m.clientHeight}, overflow-y: ${m.overflowY})`);
});

test('zoomknapparna fungerar fortfarande efter flytten', { skip }, async () => {
  const page = await editorn();
  const fore = await page.evaluate(() => document.querySelector('[data-zoom-niva]').textContent);
  await page.click('[data-zoom="ut"]');
  await page.waitForTimeout(400);
  const efter = await page.evaluate(() => document.querySelector('[data-zoom-niva]').textContent);
  await page.close();
  assert.notEqual(efter, fore,
    `zoomnivan stod kvar pa ${fore} efter klick pa minus — knappen tappade sin bindning i flytten`);
});

// ---- widgetlistan far inte rulla i en liten ruta -----------------------------------------------
//
// "den hanger pa liten jag vill alla ska synas" — Davids skarmbild visade tre av fyra rader i en
// hop hogst upp, med rullningslist, och darunder tomrum anda ner till "+ Lagg till widget".
//
// EN TIDIGARE FIX RACKTE INTE. Kommentaren i studio.css lat .live-layer-panel vaxa och panelen
// blev full hojd — men listan INUTI bar kvar sitt eget tak (`.live-layer-list{max-height:112px}`).
// Tomrummet flyttade alltsa bara in i panelen. UPPMATT 2026-09-03: panel 710 px, lista 112 px,
// innehall 230 px (5 rader a 42). Provet nedan mater LISTAN, inte panelen, just darfor.
//
// ANDRA HALVAN AV KRAVET: raderna far inte strackas ut for att fylla ytan. Utan
// `align-content:start` fordelar griden overskottet pa raderna — uppmatt 124 px per rad i stallet
// for 42, alltsa fem utdragna kort. Bada halvorna provas: alla syns OCH ingen ar uppsvalld.
async function medFemWidgets() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    state.widgets.length = 0;
    // RIKTIGA katalognycklar, hamtade ur kravNycklar(). Forsta versionen gissade pa
    // 'catalog:heartgoal' m.fl. — create() kastar pa en okand nyckel, och ett try/catch svalde det:
    // bara tva av fem rader byggdes och provet matte nastan ingenting. Darfor kastar det nu vidare.
    for (const nyckel of ['catalog:toplike:center', 'catalog:heartgoal:citrus',
                          'catalog:giftfireworks:bloom', 'catalog:guardianemblem:1',
                          'catalog:fanlevel:layout:badgereveal'])
      state.widgets.push(window.VyraWidgets.create(nyckel));
    render();
  });
  await page.waitForTimeout(900);
  return page;
}

test('alla widgets i live-lagret syns utan att listan rullar', { skip, timeout: 120000 }, async () => {
  const page = await medFemWidgets();
  const m = await page.evaluate(() => {
    const lista = document.querySelector('.live-layer-list');
    const panel = document.querySelector('.live-layer-panel');
    if (!lista || !panel) return { fel: 'live-lagerlistan eller panelen saknas' };
    const rader = [...lista.querySelectorAll('article')];
    const l = lista.getBoundingClientRect();
    return {
      antal: rader.length,
      rullar: lista.scrollHeight > lista.clientHeight + 1,
      utanfor: rader.filter(r => { const b = r.getBoundingClientRect();
        return b.top < l.top - 1 || b.bottom > l.bottom + 1 }).length,
      radhojder: rader.map(r => Math.round(r.getBoundingClientRect().height)),
      listaHojd: Math.round(l.height),
      panelHojd: Math.round(panel.getBoundingClientRect().height),
    };
  });
  await page.close();
  assert.ok(!m.fel, m.fel);
  assert.ok(m.antal >= 4, `bara ${m.antal} rader byggdes — provet mater ingenting`);

  assert.equal(m.rullar, false,
    `listan rullar: ${m.listaHojd} px synligt i en panel pa ${m.panelHojd} px. Utrymmet finns — `
    + 'det ar listans eget max-height som klammer den.');
  assert.equal(m.utanfor, 0, `${m.utanfor} av ${m.antal} rader ligger utanfor listans synliga yta`);

  // Uppsvallda rader "loser" ocksa rullningen — men ser fel ut. Naturlig radhojd ar ~42 px.
  const svallda = m.radhojder.filter(h => h > 70);
  assert.deepEqual(svallda, [],
    `${svallda.length} rader ar utdragna (${m.radhojder.join(', ')} px). Griden fordelar `
    + 'overskottet pa raderna — det kraver align-content:start.');
});
