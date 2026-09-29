'use strict';
// PANELEN STÅR KVAR DÄR MAN ÄR (vyra-panelplats.js). Davids rapport 2026-09-25: "varje gång man
// trycker på nått längst ner så går meny upp, man måste scrolla ner igen".
//
// UPPMÄTT FÖRE FIXEN, Top Gift med panelen nerskrollad: alla ramval, kollektionsflikarna,
// animationslistan och kryssrutan kastade .properties från ~2000 px till 0. Ramgalleriet har dessutom
// en egen inre scrollruta som också började om — ramen man klickade på hamnade på y=987 i ett
// 860 px högt fönster.
//
// Provet mäter det användaren ser: kontrollen man tryckte på ska ligga kvar på samma höjd i fönstret.
// RIKTIG WEBBLÄSARE: scroll och getBoundingClientRect finns inte i jsdom.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { seedaStudioState } = require('../helpers/seed-studio-state.js');

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


async function editorn(nycklar) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  const idn = await seedaStudioState(page, nycklar, { placering: [{ x: 40, y: 60 }, { x: 40, y: 420 }] });
  await page.waitForTimeout(500);
  return { page, idn };
}

// Scrollar kontrollen till mitten, klickar och mäter dess höjd i fönstret före och efter.
async function klickaOchMat(page, valjare, text) {
  const hitta = `[...document.querySelectorAll(${JSON.stringify(valjare)})].filter(e => e.offsetParent).find(e => (e.textContent || '').includes(${JSON.stringify(text)}))`;
  const fore = await page.evaluate(`(() => { const el = ${hitta}; el.scrollIntoView({ block: 'center' });
    return { y: el.getBoundingClientRect().top, st: document.querySelector('.properties').scrollTop } })()`);
  await page.evaluate(`(${hitta}).click()`);
  await page.waitForTimeout(400);
  const efter = await page.evaluate(`(() => { const el = ${hitta};
    return { y: el ? el.getBoundingClientRect().top : null, st: document.querySelector('.properties').scrollTop } })()`);
  return { fore, efter };
}

test('ett ramval längst ner lämnar panelen och ramgalleriet där de var', { skip }, async () => {
  const { page } = await editorn(['catalog:topgift']);
  try {
    // Ramgruppen kan vara hopfälld: öppna den som användaren gör.
    await page.evaluate(() => {
      if ([...document.querySelectorAll('.properties .ws-frame-swatch')].some(e => e.offsetParent)) return;
      [...document.querySelectorAll('.properties button')].find(b => /AVATAR-RAM/.test(b.textContent))?.click();
    });
    await page.waitForTimeout(300);
    const namn = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.properties .ws-frame-swatch')].filter(e => e.offsetParent);
      return (r[r.length - 1] || {}).textContent.trim();
    });
    assert.ok(namn, 'ramgalleriet saknas i panelen');
    const { fore, efter } = await klickaOchMat(page, '.properties .ws-frame-swatch', namn);
    assert.ok(fore.st > 300, `panelen skulle vara nerskrollad före klicket (scrollTop ${fore.st})`);
    assert.ok(efter.y !== null, 'ramknappen finns inte kvar efter klicket');
    assert.ok(Math.abs(efter.y - fore.y) <= 2,
      `ramen hoppade från y=${Math.round(fore.y)} till y=${Math.round(efter.y)} (scrollTop ${fore.st} → ${efter.st})`);
  } finally { await page.close(); }
});

test('animationslistan längst ner hoppar inte heller', { skip }, async () => {
  const { page } = await editorn(['catalog:topgift']);
  try {
    const LISTA = `[...document.querySelectorAll('.properties select')].find(s => [...s.options].some(o => /Tona in/.test(o.textContent)))`;
    // Animationsgruppen kan vara hopfälld: öppna den som användaren gör.
    await page.evaluate(`(() => { const s = ${LISTA}; if (s && s.offsetParent) return;
      [...document.querySelectorAll('.properties button')].find(b => /ANIMATION/.test(b.textContent))?.click() })()`);
    await page.waitForTimeout(300);
    const fore = await page.evaluate(`(() => { const s = ${LISTA}; s.scrollIntoView({ block: 'center' });
      return { y: s.getBoundingClientRect().top, st: document.querySelector('.properties').scrollTop } })()`);
    await page.evaluate(`(() => { const s = ${LISTA}; const o = [...s.options].find(o => o.value !== s.value);
      s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })) })()`);
    await page.waitForTimeout(400);
    const efter = await page.evaluate(`(() => { const s = ${LISTA};
      return { y: s ? s.getBoundingClientRect().top : null, st: document.querySelector('.properties').scrollTop } })()`);
    assert.ok(fore.st > 300, `panelen skulle vara nerskrollad (scrollTop ${fore.st})`);
    assert.ok(efter.y !== null, 'animationslistan finns inte kvar');
    assert.ok(Math.abs(efter.y - fore.y) <= 2,
      `animationslistan hoppade från y=${Math.round(fore.y)} till y=${Math.round(efter.y)} (scrollTop ${fore.st} → ${efter.st})`);
  } finally { await page.close(); }
});

test('byter man widget börjar panelen från toppen som förut', { skip }, async () => {
  const { page, idn } = await editorn(['catalog:topgift', 'catalog:toplike:voltage']);
  try {
    await page.evaluate(() => { document.querySelector('.properties').scrollTop = 1200 });
    assert.ok(await page.evaluate(() => document.querySelector('.properties').scrollTop) > 300);
    await page.click(`.canvas .widget[data-id="${idn[1]}"]`, { position: { x: 10, y: 10 } });
    await page.waitForFunction(id => selected === id, idn[1], { timeout: 5000 });
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => document.querySelector('.properties').scrollTop);
    assert.equal(st, 0, `en ny widget ska visa sin panel från början (scrollTop ${st})`);
  } finally { await page.close(); }
});
