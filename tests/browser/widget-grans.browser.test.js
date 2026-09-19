'use strict';
// DUKENS GRÄNS I ETT RIKTIGT DRAG.
//
// Uppmätt 2026-09-19 i Davids layout: Top Gift låg på x=-16 och Top Like på x=688 i en duk
// som är 432 bred. Editorn lät honom dra dit och sa ingenting, så widgetarna fanns kvar i
// datan men syntes aldrig i OBS eller TikTok LIVE Studio. Samma sak fanns i bandet från
// sändningen 2026-09-18 (Top Gift x=736, Battle MVP y=768).
//
// Provet drar på riktigt — pointerdown/move/up genom studio.js dragmått — och kräver två
// saker av varje drag: att det SPARADE läget ryms i duken, och att det läge användaren SER
// under draget redan är inne. Klämmer man bara vid pointerup hoppar widgeten tillbaka när
// man släpper, och det ser ut som en bugg även när datan blir rätt.
//
// Ett drag inne på duken måste lämnas orört. Utan det provet hade en gräns som klämmer allt
// till 0 varit grön.
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
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

const WIDGET = { id: 'd1', type: 'templateTopLike', x: 40, y: 40, width: 300 };

async function editorn() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function', null, { timeout: 20000 });
  await page.evaluate(async w => {
    await window.VyraSessionState.projectLocalSession();
    view = 'editor'; state.widgets = [w]; selected = 'd1';
    render(); if (typeof bind === 'function') bind();
    await new Promise(r => setTimeout(r, 700));
  }, WIDGET);
  return { context, page };
}

// Drar d1 sa att dess RAA lage hamnar pa malLeft/malTop i dukpixlar, och rapporterar bade
// det SEDDA laget mitt i draget och det SPARADE laget efterat.
async function dra(page, malLeft, malTop) {
  return page.evaluate(async ({ malLeft, malTop }) => {
    const skala = window.getEditorCanvasScale();
    const el = document.querySelector('.canvas [data-id="d1"]');
    el.setPointerCapture = () => {}; el.releasePointerCapture = () => {};
    const startLeft = parseInt(el.style.left, 10), startTop = parseInt(el.style.top, 10);
    const r = el.getBoundingClientRect();
    const x0 = r.left + 5, y0 = r.top + 5;
    const dx = (malLeft - startLeft) * skala, dy = (malTop - startTop) * skala;
    const skicka = (typ, x, y) => el.dispatchEvent(new PointerEvent(typ,
      { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
    skicka('pointerdown', x0, y0);
    skicka('pointermove', x0 + dx, y0 + dy);
    await new Promise(res => setTimeout(res, 200));
    const sett = { left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10) };
    skicka('pointerup', x0 + dx, y0 + dy);
    await new Promise(res => setTimeout(res, 300));
    const c = document.querySelector('.editor-shell .canvas');
    const w = state.widgets.find(x => x.id === 'd1');
    return {
      sett,
      sparat: { x: w.x, y: w.y },
      duk: { bredd: c.offsetWidth, hojd: c.offsetHeight },
      widget: { bredd: el.offsetWidth, hojd: el.offsetHeight },
      minKvar: window.VyraGrans.MIN_KVAR
    };
  }, { malLeft, malTop });
}

test('ett drag langt ut till hoger stannar vid kanten', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, 688, 200);          // Davids faktiska varde
    const tak = m.duk.bredd - m.minKvar;
    assert.equal(m.sparat.x, tak, `x ${m.sparat.x} skulle vara ${tak} (duk ${m.duk.bredd})`);
    assert.ok(m.sparat.x < m.duk.bredd, 'widgeten hamnade helt utanfor duken');
    assert.equal(m.sett.left, tak, 'laget under draget slapptes ut och hoppade tillbaka forst vid slappet');
  } finally { await context.close() }
});

test('ett drag ut till vanster stannar vid noll', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, -160, 100);
    assert.equal(m.sparat.x, 0, `x ${m.sparat.x} skulle vara 0`);
    assert.equal(m.sett.left, 0, 'laget under draget var negativt');
  } finally { await context.close() }
});

test('ett drag nedanfor duken stannar vid nederkanten', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const m = await dra(page, 100, 900);
    const tak = m.duk.hojd - m.minKvar;
    assert.equal(m.sparat.y, tak, `y ${m.sparat.y} skulle vara ${tak} (duk ${m.duk.hojd})`);
    assert.ok(m.sparat.y < m.duk.hojd, 'widgeten hamnade helt utanfor duken');
  } finally { await context.close() }
});

test('ett drag INNE pa duken lamnas orort av gransen', { skip, timeout: 90000 }, async () => {
  // Utan det har provet hade en gräns som klämmer allt till 0 varit grön.
  const { context, page } = await editorn();
  try {
    const m = await dra(page, 64, 120);
    assert.ok(m.sparat.x > 0 && m.sparat.x < m.duk.bredd - m.minKvar,
      `x ${m.sparat.x} blev inte ett fritt lage inne pa duken`);
    assert.ok(m.sparat.y > 0, `y ${m.sparat.y} klamdes till kanten trots att draget var inne pa duken`);
  } finally { await context.close() }
});

test('en widget som sticker ut markeras i editorn — utan att flyttas', { skip, timeout: 90000 }, async () => {
  // Markeringen ar det som faktiskt tjanar malet: gransen hindrar att en widget TAPPAS BORT,
  // men den slapper igenom lagen dar det mesta hamnar utanfor bild. Da ska editorn saga det.
  // Den far INTE flytta nagot: en engangsflytt hade skrivit om kundens sparade layout.
  const { context, page } = await editorn();
  try {
    const m = await page.evaluate(async () => {
      const w = state.widgets.find(x => x.id === 'd1');
      w.x = 300; w.y = 40;                       // 300 + 220 = 520 > 432
      render(); if (typeof bind === 'function') bind();
      await new Promise(r => setTimeout(r, 400));
      const el = document.querySelector('.canvas [data-id="d1"]');
      return { markerad: el.dataset.utanforDuken === '1', x: w.x, y: w.y };
    });
    assert.equal(m.markerad, true, 'widgeten som sticker ut fick ingen markering');
    assert.equal(m.x, 300, 'markeringen FLYTTADE widgeten — den ska bara markera');
  } finally { await context.close() }
});

test('en widget inne pa duken markeras inte', { skip, timeout: 90000 }, async () => {
  const { context, page } = await editorn();
  try {
    const markerad = await page.evaluate(async () => {
      const w = state.widgets.find(x => x.id === 'd1');
      w.x = 40; w.y = 40;
      render(); if (typeof bind === 'function') bind();
      await new Promise(r => setTimeout(r, 400));
      return document.querySelector('.canvas [data-id="d1"]').dataset.utanforDuken === '1';
    });
    assert.equal(markerad, false, 'en widget inne pa duken blev felaktigt markerad');
  } finally { await context.close() }
});
