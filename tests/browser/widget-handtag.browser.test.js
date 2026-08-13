'use strict';
// Handtag pa ALLA sidor, inte bara sydostra hornet.
//
// LAGET FORE: varje renderare sander ut ETT `<span class="resize-handle">` (30 stallen i sex
// filer) och studio.css:88 satter det i `right:-9px;bottom:-9px`. Draget andrar `w.widgetScale`
// for nastan alla widgetar — likformig skalning, inte bredd eller hojd.
//
// KONTRAKTET som det har provet later:
//   * atta handtag pa den valda widgeten, markta `data-vyra-handle` med vaderstrecken
//   * vanster/hoger andrar `w.width`; hoger vaxer at hoger, vanster haller hogerkanten stilla
//   * upp/ned andrar `w.widgetScaleY` (transform:scaleY); ned haller overkanten stilla,
//     upp haller underkanten stilla
//   * rorelsen delas med kanvasskalan — samma dragning ska ge samma resultat vid zoom 1 och 0.5
//
// VARFOR RIKTIG WEBBLASARE: allt harinne ar getBoundingClientRect och riktiga pekarhandelser.
// jsdom saknar layout och svarar 0, sa provet hade varit gront aven utan implementation.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

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

const RIKTNINGAR = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

// `?open=layout` gar direkt till editorn. Att vaxla vy med go() efterat lamnar sidopaneler kvar.
async function editorMedWidget(skala = 1) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  const id = await page.evaluate(s => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create('catalog:topgift');
    w.x = 60; w.y = 90;
    state.widgets.push(w);
    selected = w.id;              // markering ar det som far handtagen att sandas ut
    render();
    return w.id;
  }, skala);
  await page.waitForTimeout(600);
  // Kanvasskalan MASTE sattas efter render(): uppmatt 2026-08-13 byter render() ut hela
  // .canvas-elementet, sa en transform satt innan forsvinner med det gamla elementet.
  if (skala !== 1) {
    const aktiv = await page.evaluate(s => {
      document.querySelector('.canvas').style.transform = `scale(${s})`;
      return getEditorCanvasScale();
    }, skala);
    assert.equal(aktiv, skala, `kanvasskalan gick inte att satta till ${skala}, fick ${aktiv}`);
    await page.waitForTimeout(200);
  }
  return { page, id };
}

const box = (page, sel) => page.evaluate(s => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect();
  return { v: r.left, h: r.right, o: r.top, u: r.bottom, bredd: r.width, hojd: r.height,
           mx: r.left + r.width / 2, my: r.top + r.height / 2 };
}, sel);

async function dra(page, riktning, dx, dy) {
  const h = await box(page, `[data-vyra-handle="${riktning}"]`);
  assert.ok(h, `handtaget ${riktning} saknas`);
  await page.mouse.move(h.mx, h.my);
  await page.mouse.down();
  await page.mouse.move(h.mx + dx / 2, h.my + dy / 2, { steps: 4 });
  await page.mouse.move(h.mx + dx, h.my + dy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

test('den valda widgeten har handtag i alla atta lagen', { skip }, async () => {
  const { page } = await editorMedWidget();
  const funna = await page.evaluate(() =>
    [...document.querySelectorAll('[data-vyra-handle]')].map(e => e.dataset.vyraHandle).sort());
  await page.close();
  assert.deepEqual(funna, [...RIKTNINGAR].sort(),
    `hittade ${funna.length} handtag (${funna.join(',')}) — kontraktet ar atta, ett per vaderstreck`);
});

test('handtagen sitter pa widgetens kanter och horn', { skip }, async () => {
  const { page } = await editorMedWidget();
  const w = await box(page, '.widget.selected');
  const fel = [];
  for (const r of RIKTNINGAR) {
    const h = await box(page, `[data-vyra-handle="${r}"]`);
    if (!h) { fel.push(`${r} saknas`); continue }
    const vantadX = r.includes('w') ? w.v : r.includes('e') ? w.h : (w.v + w.h) / 2;
    const vantadY = r.startsWith('n') ? w.o : r.startsWith('s') ? w.u : (w.o + w.u) / 2;
    if (Math.abs(h.mx - vantadX) > 14) fel.push(`${r}: x ${Math.round(h.mx)} mot vantat ${Math.round(vantadX)}`);
    if (Math.abs(h.my - vantadY) > 14) fel.push(`${r}: y ${Math.round(h.my)} mot vantat ${Math.round(vantadY)}`);
  }
  await page.close();
  assert.equal(fel.length, 0, 'handtag pa fel plats: ' + fel.join(' | '));
});

test('hoger handtag andrar bredden och haller vansterkanten stilla', { skip }, async () => {
  const { page, id } = await editorMedWidget();
  const fore = await page.evaluate(i => ({ bredd: state.widgets.find(w => w.id === i).width,
    v: document.querySelector('.widget.selected').getBoundingClientRect().left }), id);
  await dra(page, 'e', 70, 0);
  const efter = await page.evaluate(i => ({ bredd: state.widgets.find(w => w.id === i).width,
    v: document.querySelector('.widget.selected').getBoundingClientRect().left }), id);
  await page.close();
  assert.ok(efter.bredd > fore.bredd + 40,
    `bredden gick fran ${fore.bredd} till ${efter.bredd} — dragningen pa 70 px bet inte`);
  assert.ok(Math.abs(efter.v - fore.v) <= 2,
    `vansterkanten flyttade sig ${Math.round(efter.v - fore.v)} px, den ska sta stilla`);
});

test('vanster handtag andrar bredden och haller hogerkanten stilla', { skip }, async () => {
  const { page, id } = await editorMedWidget();
  const fore = await page.evaluate(i => ({ bredd: state.widgets.find(w => w.id === i).width,
    h: document.querySelector('.widget.selected').getBoundingClientRect().right }), id);
  await dra(page, 'w', -70, 0);
  const efter = await page.evaluate(i => ({ bredd: state.widgets.find(w => w.id === i).width,
    h: document.querySelector('.widget.selected').getBoundingClientRect().right }), id);
  await page.close();
  assert.ok(efter.bredd > fore.bredd + 40,
    `bredden gick fran ${fore.bredd} till ${efter.bredd} vid drag at vanster`);
  assert.ok(Math.abs(efter.h - fore.h) <= 3,
    `hogerkanten flyttade sig ${Math.round(efter.h - fore.h)} px, den ska sta stilla`);
});

test('nedre handtag strackar lodratt och haller overkanten stilla', { skip }, async () => {
  const { page, id } = await editorMedWidget();
  const fore = await page.evaluate(i => ({ sy: state.widgets.find(w => w.id === i).widgetScaleY || 1,
    o: document.querySelector('.widget.selected').getBoundingClientRect().top }), id);
  await dra(page, 's', 0, 60);
  const efter = await page.evaluate(i => ({ sy: state.widgets.find(w => w.id === i).widgetScaleY || 1,
    o: document.querySelector('.widget.selected').getBoundingClientRect().top }), id);
  await page.close();
  assert.ok(efter.sy > fore.sy + 0.1,
    `widgetScaleY gick fran ${fore.sy} till ${efter.sy} — strackningen bet inte`);
  assert.ok(Math.abs(efter.o - fore.o) <= 2,
    `overkanten flyttade sig ${Math.round(efter.o - fore.o)} px, den ska sta stilla`);
});

test('ovre handtag strackar lodratt och haller underkanten stilla', { skip }, async () => {
  const { page, id } = await editorMedWidget();
  const fore = await page.evaluate(i => ({ sy: state.widgets.find(w => w.id === i).widgetScaleY || 1,
    u: document.querySelector('.widget.selected').getBoundingClientRect().bottom }), id);
  await dra(page, 'n', 0, -60);
  const efter = await page.evaluate(i => ({ sy: state.widgets.find(w => w.id === i).widgetScaleY || 1,
    u: document.querySelector('.widget.selected').getBoundingClientRect().bottom }), id);
  await page.close();
  assert.ok(efter.sy > fore.sy + 0.1,
    `widgetScaleY gick fran ${fore.sy} till ${efter.sy} vid drag uppat`);
  assert.ok(Math.abs(efter.u - fore.u) <= 3,
    `underkanten flyttade sig ${Math.round(efter.u - fore.u)} px, den ska sta stilla`);
});

// Fallan fran PR #158–#163: en hanterare som glommer kanvasskalan ger olika resultat vid olika
// zoom. Uppmatt da: 1.45 vid skala 1 mot 1.56 vid 0.5. Samma dragning maste ge samma widgetmatt.
test('samma dragning ger samma bredd vid kanvasskala 1 och 0.5', { skip }, async () => {
  const matt = [];
  for (const skala of [1, 0.5]) {
    const { page, id } = await editorMedWidget(skala);
    const fore = await page.evaluate(i => state.widgets.find(w => w.id === i).width, id);
    await dra(page, 'e', 80 * skala, 0);   // lika lang rorelse i WIDGETENS koordinater
    const efter = await page.evaluate(i => state.widgets.find(w => w.id === i).width, id);
    await page.close();
    matt.push({ skala, delta: efter - fore });
  }
  const [a, b] = matt;
  assert.ok(Math.abs(a.delta - b.delta) <= 6,
    `breddandringen blev ${a.delta} px vid skala 1 men ${b.delta} px vid 0.5 — `
    + 'hanteraren delar inte rorelsen med kanvasskalan');
});
