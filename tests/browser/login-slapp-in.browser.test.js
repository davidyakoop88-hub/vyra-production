'use strict';
// SLAPP IN — dorren oppnas, gubben gar in, kortet blir gront (Davids onskan 2026-08-21).
//
// DET SOM KAN GA RIKTIGT FEL AR INTE ATT ANIMATIONEN AR FUL. Det ar att en LYCKAD inloggning
// fastnar i den. Anvandaren har redan angett ratt uppgifter, servern har redan svarat ja, sessionen
// ar redan satt — och sa star hen kvar pa framsidan for att en dekoration inte blev klar. Darfor
// mater provet FRAMKOMLIGHETEN forst och utseendet sen.
//
// Tre lagen:
//   normalt              dorren visas, och studion laddas anda inom rimlig tid
//   reduced-motion       INGEN dorr och INGEN vantan — rakt in
//   trasig festyta       om sekvensen kastar ska redirecten anda ske (fail-open, som resten av huset)
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.json': 'application/json', '.woff2': 'font/woff2' };

// Servern svarar JA pa inloggning. Vi provar sekvensen efter ett lyckat svar, inte auth-kedjan —
// den har egna prov.
function servera() {
  const server = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/api/auth/login') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, csrfToken: 'prov-token' }));
      return;
    }
    const rel = decodeURIComponent(u).replace(/^\/+/, '') || 'index.html';
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

// `reducedMotion` sätts ALLTID explicit, aldrig underforstatt.
//
// UPPMATT i CI 2026-08-21: provet "sekvensen spelas" foll efter 32 sekunder — den vantade pa en
// dorr som aldrig kom. Headless Chromium rapporterar `prefers-reduced-motion: reduce` som
// standard, och da hoppar slappIn() over hela steget med flit. Provet antog tyst att rorelse var
// tillaten; lokalt var den det, i CI inte.
//
// Att sanka provets krav vore fel svar: bada lagena ar riktiga och bada ska provas. De sags nu
// bara ut i klartext i stallet for att arvas fran vilken maskin som rakar kora.
async function loggaIn(opts = {}) {
  const page = await browser.newPage(Object.assign(
    { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' }, opts));
  await page.goto(`${bas}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#loginEmail', { timeout: 15000 });
  await page.fill('#loginEmail', 'prov@vyra.test');
  await page.fill('#loginPassword', 'ettlangtlosenord123');
  // Haka pa svaret INNAN klicket, annars kan det hinna komma medan vi staller oss i ko.
  page.__inloggningssvar = page
    .waitForResponse(r => /\/api\/auth\/login/.test(r.url()), { timeout: 40000 })
    .catch(() => null);
  await page.click('.login-knapp');
  return page;
}

test('sekvensen spelas: kortet blir gront och dorren visas', { skip, timeout: 60000 }, async () => {
  const page = await loggaIn();
  try {
    // VANTAN MATER RATT SAK NU. Forut stod har `timeout: 4000` raknat fran klicket — en gissning
    // om hur snabb maskinen ar, inte om hur produkten beter sig. UPPMATT I CI 2026-08-21: samma
    // fils granntest tog 22 s dar mot 2,2 s lokalt, sa fyra sekunder rackte inte ens fram till
    // inloggningssvaret och provet foll pa korrekt kod.
    //
    // Egenskapen som ska bevisas ar att dorren kommer NAR SVARET KOMMIT, inte inom en viss tid
    // fran klicket. Vi vantar darfor ut svaret forst och mater sedan dorren i ett eget fonster.
    // Att sekvensen inte far bli en grind mats av nasta prov, som klockar redirecten.
    await page.__inloggningssvar;
    await page.waitForSelector('.login-dorr', { timeout: 15000 });
    const m = await page.evaluate(() => ({
      gront: document.querySelector('.login-kort').classList.contains('login-klar'),
      gubbe: !!document.querySelector('.login-gubbe'),
      dold: document.querySelector('.login-dorr').getAttribute('aria-hidden'),
      besked: document.querySelector('.login-valkommen')?.textContent || null,
      roll: document.querySelector('.login-valkommen')?.getAttribute('role') || null
    }));
    assert.equal(m.gront, true, 'kortet blev inte gront');
    assert.equal(m.gubbe, true, 'ingen gubbe att ga in genom dorren');
    assert.equal(m.dold, 'true',
      'scenen ar inte aria-hidden — en skarmlasare skulle lasa upp tomma element som inte betyder nagot');
    assert.equal(m.besked, 'Välkommen in', `beskedet var "${m.besked}"`);
    assert.equal(m.roll, 'status',
      'beskedet har ingen role=status; den som inte SER animationen far da inget besked alls');
  } finally { await page.close() }
});

test('en lyckad inloggning fastnar ALDRIG i animationen', { skip, timeout: 60000 }, async () => {
  // Hela poangen. Sessionen ar redan satt nar sekvensen borjar — blir den kvar har ar anvandaren
  // inloggad men star still pa framsidan, och det ser ut som att inloggningen inte fungerade.
  const page = await loggaIn();
  try {
    // Klockan startar nar SVARET kommit, inte vid klicket: det ar dar sekvensen borjar, och
    // en langsam server ar inte animationens fel. Samma matfel som fallde grannprovet ovan i
    // CI — det har har hittills bara ratt sig ur.
    await page.__inloggningssvar;
    const start = Date.now();
    await page.waitForURL(/studio\.html/, { timeout: 20000 });
    const ms = Date.now() - start;
    assert.ok(ms < 6000, `studion laddades forst efter ${ms} ms — sekvensen far inte bli en grind`);
  } finally { await page.close() }
});

test('prefers-reduced-motion: ingen dorr och ingen vantan', { skip, timeout: 60000 }, async () => {
  // Den som bett om mindre rorelse ska inte betala 1,5 sekunder for en animation hen inte ser.
  // landing-login.js hoppar darfor over HELA steget, inte bara keyframes.
  const page = await loggaIn({ reducedMotion: 'reduce' });
  try {
    // Klockan startar nar SVARET kommit, inte vid klicket: det ar dar sekvensen borjar, och
    // en langsam server ar inte animationens fel. Samma matfel som fallde grannprovet ovan i
    // CI — det har har hittills bara ratt sig ur.
    await page.__inloggningssvar;
    const start = Date.now();
    await page.waitForURL(/studio\.html/, { timeout: 20000 });
    const ms = Date.now() - start;
    assert.ok(ms < 1200,
      `studion laddades efter ${ms} ms trots reduced-motion — steget ska hoppas over helt, `
      + 'inte bara animeras bort');
  } finally { await page.close() }
});
