'use strict';
// F08: ett sent render() skrev over en aktiv extra-vy med Oversikt.
//
// Uppmatt pa origin/main f11cd7d: efter omladdning och klick pa "Action & Event" sa sidomenyn och
// brodsmulan "Action & Event", men #title och #view var Oversikt. Orsaken: extra-vyerna ritas av
// sina egna moduler och lamnar studio.js `view` pa 'home', och render() skriver alltid #view/#title
// ur m[view]. Sena anrop efter omladdningen — account-profile.js pa vyra-auth-ready,
// fan-level-50.js pa vyra-live-session, overview-premium.js, battle-mvp-session.js — ritade
// darfor Oversikt rakt over extra-vyn.
//
// Vakten (vyra-extravy-vakt.js) hindrar render() medan en extra-knapp i sidomenyn ar markerad.
// Provet kraver ocksa att vanlig navigering fungerar efterat, och att vakten haller aven nar
// `view` star kvar pa 'editor' (Layout -> extra-vy), dar layout-safe.js annars ritar editorn
// innan nagon inre vakt nas.
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
const skip = hoppaOver();

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

async function oppnaStudio(sok = '') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html${sok}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('[data-view],[data-extra]'),
    null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  return page;
}

// Samma sena anrop som efter en riktig omladdning: inloggningen blir klar (account-profile.js
// ritar om om view==='home'), sedan en LIVE-session (fan-level-50.js ritar om ovillkorligt och
// schemalagger en till), och till sist ett naket render() for alla andra sena anropare.
async function senaAnrop(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vyra-auth-ready',
    { detail: { user: { displayName: 'Provkonto' }, workspaces: [] } })));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vyra-live-session', { detail: {} })));
  await page.waitForTimeout(500);
  await page.evaluate(() => render());
  await page.waitForTimeout(100);
}

const las = page => page.evaluate(() => ({
  titel: document.querySelector('#title')?.textContent.trim(),
  view: typeof view !== 'undefined' ? view : null,
  ae: !!document.querySelector('#view .ae-workspace'),
  aktiva: [...document.querySelectorAll('[data-view].active,[data-extra].active')]
    .map(b => b.dataset.view || b.dataset.extra),
}));

test('Action & Event star kvar efter sena render()-anrop, och Oversikt nas efterat',
  { skip, timeout: 90000 }, async () => {
    const page = await oppnaStudio();
    try {
      await page.click('[data-extra="actions"]');
      await page.waitForFunction(() => !!document.querySelector('#view .ae-workspace'), null, { timeout: 5000 });
      await senaAnrop(page);
      const efter = await las(page);
      assert.equal(efter.titel, 'Action & Event', `rubriken skrevs over: ${JSON.stringify(efter)}`);
      assert.ok(efter.ae, `Action & Event-ytan revs: ${JSON.stringify(efter)}`);
      assert.deepEqual(efter.aktiva, ['actions']);

      await page.click('[data-view="home"]');
      await page.waitForTimeout(400);
      const hem = await las(page);
      assert.equal(hem.view, 'home');
      assert.deepEqual(hem.aktiva, ['home']);
      assert.ok(!hem.ae, 'Action & Event-ytan lag kvar efter klick pa Oversikt');
      assert.match(hem.titel, /^God kväll/, `Oversikt ritades inte: ${JSON.stringify(hem)}`);

      // Och render() fungerar som vanligt igen nar ingen extra-vy ar aktiv.
      await page.evaluate(() => { document.querySelector('#title').textContent = 'gammal'; render(); });
      assert.match((await las(page)).titel, /^God kväll/);
    } finally { await page.close(); }
  });

test('Sound Alerts och LIVE-kontroll skyddas likadant', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    await page.click('[data-extra="soundAlerts"]');
    await page.waitForTimeout(400);
    await senaAnrop(page);
    let s = await las(page);
    assert.equal(s.titel, 'Sound Alerts', `Sound Alerts skrevs over: ${JSON.stringify(s)}`);
    assert.deepEqual(s.aktiva, ['soundAlerts']);

    await page.click('[data-extra="liveControl"]');
    await page.waitForTimeout(400);
    const fore = await page.evaluate(() => document.querySelector('#view').innerHTML);
    assert.ok(/lc-page/.test(fore), 'LIVE-kontroll ritades inte');
    await senaAnrop(page);
    s = await las(page);
    assert.ok(await page.evaluate(() => !!document.querySelector('#view .lc-page')),
      `LIVE-kontroll skrevs over: ${JSON.stringify(s)}`);
    assert.deepEqual(s.aktiva, ['liveControl']);
  } finally { await page.close(); }
});

test('vakten haller aven nar view star kvar pa editor (Layout -> extra-vy)', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    await page.evaluate(() => go('editor'));
    await page.waitForTimeout(400);
    await page.click('[data-extra="actions"]');
    await page.waitForFunction(() => !!document.querySelector('#view .ae-workspace'), null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => view), 'editor');
    await page.evaluate(() => render());
    await page.waitForTimeout(100);
    const s = await las(page);
    assert.equal(s.titel, 'Action & Event', `layout ritades over extra-vyn: ${JSON.stringify(s)}`);
    assert.ok(s.ae);
    assert.deepEqual(s.aktiva, ['actions']);
  } finally { await page.close(); }
});

test('overlay-laget far ingen vakt', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio('?overlay=1');
  try {
    const vakt = await page.evaluate(() => ({
      api: typeof window.VyraExtraVyVakt, flagga: !!(typeof render === 'function' && render.__vyraExtraVakt),
    }));
    assert.deepEqual(vakt, { api: 'undefined', flagga: false });
  } finally { await page.close(); }
});
