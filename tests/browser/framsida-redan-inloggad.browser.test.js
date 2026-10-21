'use strict';
// REDAN INLOGGAD → DIREKT TILL STUDION (Davids beslut 2026-10-21). Skrivet RÖTT FÖRST.
//
// "När du redan är inloggad och öppnar framsidan → gå direkt till studion." landing-inloggad.js
// frågar GET /api/auth/me när framsidan laddas. Fem lägen provas mot en rigg som svarar som servern:
//
//   inloggad (200)         -> location.replace('studio.html'), och framsidan syns aldrig emellan
//   inte inloggad (401)    -> framsidan som förut
//   väntar på MFA (403)    -> framsidan — en halv session släpps aldrig in
//   utloggad               -> framsidan, ingen studs tillbaka; ?stanna=1 stannar även inloggad
//   server nere (inget svar) -> framsidan syns efter tidsgränsen (1,5 s), sidan låses inte
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

// Riggens läge styrs av kakan, precis som servern: vyra_session=ok är en färdig session,
// vyra_session=mfa väntar på koden, ingen kaka = utloggad. `nere` gör att me aldrig svarar.
let nere = false, meFordrojning = 0, meAnrop = 0;
function servera() {
  const server = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    const kaka = (/vyra_session=([^;]+)/.exec(req.headers.cookie || '') || [])[1];
    const json = (status, d, h = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(d)) };
    if (u === '/api/auth/me') {
      meAnrop++;
      if (nere) return;   // svarar aldrig — som en server som hänger
      return setTimeout(() => {
        if (kaka === 'ok') return json(200, { ok: true, user: { id: 'u1', email: 'a@b.se' }, workspaces: [], csrfToken: 'ny' });
        if (kaka === 'mfa') return json(403, { ok: false, error: 'MFA krävs', mfaRequired: true, csrfToken: 'ny' });
        return json(401, { ok: false, error: 'Inte inloggad' });
      }, meFordrojning);
    }
    if (u === '/api/auth/logout') return json(200, { ok: true }, { 'set-cookie': 'vyra_session=; Path=/; Max-Age=0' });
    if (u.startsWith('/api/')) return json(401, { ok: false, error: 'Inte inloggad' });
    // Studion byts mot en stubbe: provet gäller VART framsidan skickar, inte studion själv.
    if (u === '/studio.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>studio</title><p id="stubbe">studio</p>') }
    const rel = decodeURIComponent(u).replace(/^\/+/, '') || 'index.html';
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); return res.end('nej') }
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
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections?.(); await new Promise(r => server.close(r)) }
});
test.beforeEach(() => { nere = false; meFordrojning = 0; meAnrop = 0 });

async function sida(kaka) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  if (kaka) await context.addCookies([{ name: 'vyra_session', value: kaka, url: bas }]);
  return { context, page: await context.newPage() };
}
const synlig = page => page.evaluate(() => getComputedStyle(document.documentElement).visibility === 'visible'
  && !!document.querySelector('[data-login]') && document.querySelector('[data-login]').getBoundingClientRect().height > 0);
const vantaPa = async (fn, ms = 4000) => { const slut = Date.now() + ms; while (Date.now() < slut) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)) } return false };

test('inloggad: framsidan skickar direkt till studion och syns aldrig emellan', { skip, timeout: 30000 }, async () => {
  meFordrojning = 500;   // ett mätbart fönster där sidan annars skulle ha blinkat fram
  const { context, page } = await sida('ok');
  try {
    const framme = page.waitForURL(/\/studio\.html$/, { timeout: 5000 });
    await page.goto(bas + '/index.html', { waitUntil: 'commit' });
    await page.waitForSelector('[data-login]', { state: 'attached', timeout: 5000 });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).visibility), 'hidden',
      'framsidan syntes medan sessionen kontrollerades — den blinkar fram före bytet');
    await framme;
    assert.ok(await page.$('#stubbe'), 'studion laddades inte');
    // replace, inte href: bakåtknappen från studion ska inte landa på en framsida som studsar igen.
    await page.goBack({ timeout: 3000 }).catch(() => null);
    assert.doesNotMatch(page.url(), /index.html/, 'bakåt från studion landade på framsidan — bytet lade en post i historiken');
  } finally { await context.close() }
});

test('inte inloggad: framsidan som förut', { skip, timeout: 30000 }, async () => {
  const { context, page } = await sida(null);
  try {
    await page.goto(bas + '/index.html');
    assert.ok(await vantaPa(() => synlig(page), 1200), 'framsidan visades inte direkt efter 401');
    await new Promise(r => setTimeout(r, 400));
    assert.match(page.url(), /\/index\.html$/);
    assert.equal(meAnrop, 1);
  } finally { await context.close() }
});

test('väntar på tvåstegskoden: stannar på framsidan', { skip, timeout: 30000 }, async () => {
  const { context, page } = await sida('mfa');
  try {
    await page.goto(bas + '/index.html');
    assert.ok(await vantaPa(() => synlig(page), 1200), 'framsidan visades inte för en MFA-väntande session');
    await new Promise(r => setTimeout(r, 400));
    assert.match(page.url(), /\/index\.html$/, 'en session som väntar på MFA skickades in i studion');
  } finally { await context.close() }
});

test('utloggning: framsidan stannar, ingen studs tillbaka till studion', { skip, timeout: 30000 }, async () => {
  const { context, page } = await sida('ok');
  try {
    await page.goto(bas + '/index.html');
    await page.waitForURL(/\/studio\.html$/, { timeout: 5000 });
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }));
    await page.goto(bas + '/index.html');
    assert.ok(await vantaPa(() => synlig(page), 1500), 'framsidan visades inte efter utloggning');
    await new Promise(r => setTimeout(r, 400));
    assert.match(page.url(), /\/index\.html$/, 'framsidan studsade tillbaka efter utloggning');
  } finally { await context.close() }
});

test('?stanna=1: även en inloggad stannar, och studions logga länkar dit', { skip, timeout: 30000 }, async () => {
  const { context, page } = await sida('ok');
  try {
    await page.goto(bas + '/index.html?stanna=1');
    assert.ok(await vantaPa(() => synlig(page), 1000), 'framsidan visades inte med ?stanna=1');
    await new Promise(r => setTimeout(r, 400));
    assert.match(page.url(), /index\.html\?stanna=1$/);
    assert.equal(meAnrop, 0, '?stanna=1 ska inte ens fråga efter sessionen');
  } finally { await context.close() }
  const studio = fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8');
  assert.match(studio, /<a href="index\.html\?stanna=1" class="brand">/,
    'studions logga leder till framsidan — utan ?stanna=1 studsar en inloggad rakt tillbaka');
});

test('server nere: framsidan syns efter tidsgränsen och låses inte', { skip, timeout: 30000 }, async () => {
  nere = true;
  const { context, page } = await sida('ok');
  try {
    const start = Date.now();
    await page.goto(bas + '/index.html', { waitUntil: 'domcontentloaded' });
    assert.ok(await vantaPa(() => synlig(page), 3500), 'framsidan förblev dold när servern inte svarade');
    const tid = Date.now() - start;
    assert.ok(tid >= 1000, `sidan visades efter ${tid} ms — före tidsgränsen, alltså kontrollerades inget`);
    assert.ok(tid < 3500, `sidan visades först efter ${tid} ms`);
    assert.match(page.url(), /\/index\.html$/);
  } finally { await context.close() }
});
