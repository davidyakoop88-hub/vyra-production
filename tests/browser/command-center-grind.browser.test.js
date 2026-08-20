'use strict';
// LADDNINGSGRINDEN TILL KOMMANDOCENTRALEN (§6 i docs/tech-debt.md).
//
// Sex browsertester vantade pa att premium-vyn laddat genom att lasa KOPIATEXTEN ur
// funktionskallan: en predikat som kravde att `home`s kalltext innehol ordet i eyebrown.
//
// Monstret star inte utskrivet har, inte ens i en kommentar. tech-debt-aktuell.test.js sveper
// hela tests/ efter det och kraver noll traffar — och den lasar kallan, inte koden, sa ett
// citat i en kommentar raknas precis som en levande grind. Samma falla som 21g gick i under
// Fan Level Up-arbetet, dar CSS-blocket citerade felet det beskrev.
//
// Monstret brister vid varje sprak- eller kopieandring. Bevisat i PR #154: nar eyebrown byttes
// fran "VYRA LIVE COMMAND CENTER" till "VYRA LIVE-KOMMANDOCENTRAL" stod grindarna evigt falska
// och 43 prov dog i 20-sekunderstimeouts. Ingenting var trasigt — grindens signal var sjalva
// texten som byttes.
//
// GRINDEN MATER LADDNING, INTE RENDERING. Vid grindens tidpunkt ar ingenting renderat an; proven
// tvingar fram sin render efterat. Markoren maste darfor sattas nar overview-premium.js kors, och
// den sitter sist i filen — alltsa efter bade home-bytet och de tva IIFE:er som installerar
// livekorten och historikraden. Den bevisar darmed MER an den gamla grinden gjorde, som bara
// visste att `home` bytts.
//
// ROTT NU: alla fyra.
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

const MARKOR = () => document.documentElement.dataset.ccReady === '1';

// ORDET BYGGS IHOP, det star aldrig helt i den har filen — och den gamla grinden aterskapas med
// ordet som ARGUMENT i stallet for som literal. En fil som citerar felet den mater hade blivit
// den enda traffen i svepet, och svaret pa det ar inte en undantagslista som ruttnar — det ar
// att inte skriva monstret.
const ORD = 'KOMMANDO' + 'CENTRAL';
const gamlaGrinden = page => page.evaluate(
  ord => typeof home === 'function' && home.toString().includes(ord), ORD);

async function sida() {
  return browser.newPage({ viewport: { width: 1280, height: 900 } });
}

test('6a · markören tänds när kommandocentralen laddat', { skip }, async () => {
  const page = await sida();
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(MARKOR, null, { timeout: 20000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ccReady), '1');
  await page.close();
});

// KONTROLLMATNINGEN (§7). Utan den har ar 6a inte varre an en hardkodad markor i studio.html:
// ett prov som havdar en NARVARO maste visa att narvaron beror pa modulen. Vi blockerar filen och
// kraver att markoren aldrig dyker upp.
test('6b · markören uteblir helt när overview-premium.js blockeras', { skip }, async () => {
  const page = await sida();
  let blockerade = 0;
  await page.route('**/overview-premium.js*', route => { blockerade++; return route.abort() });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });

  // Bevisa forst att blockeringen faktiskt intraffade — annars mater provet ingenting.
  await page.waitForFunction(() => typeof home === 'function', null, { timeout: 20000 });
  assert.ok(blockerade > 0, 'begäran till overview-premium.js avbröts aldrig — provet mätte ingenting');

  await page.waitForTimeout(2500);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ccReady), undefined,
    'markören tändes utan modulen — då bevisar den ingenting');
  await page.close();

  // POSITIV KONTROLL I SAMMA PROV. Utan den ar frånvaron ovan lika sann for en markor som inte
  // finns i koden alls — provet hade varit gront innan implementationen skrevs, och sedan gront
  // igen om nagon raderade raden ur overview-premium.js.
  const oblockerad = await sida();
  await oblockerad.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await oblockerad.waitForFunction(MARKOR, null, { timeout: 20000 });
  await oblockerad.close();
});

// MARKORENS PLACERING SIST I FILEN AR ETT PASTAENDE: "hela modulen ar installerad", inte bara att
// home() bytts. Det pastaendet maste vaktas, annars ar placeringen bara en asikt.
//
// Forsta versionen kravde att noden [data-alltime] fanns efter render — och EN MUTATION OVERLEVDE:
// markoren flyttad forst i filen samtidigt som den sista IIFE:n kastar gav fyra grona prov. Skalet
// ar att MARKUPEN for historikraden kommer fran home(), inte fran IIFE:n. Bara SIFFRAN i den gor
// det. Provet stubbar darfor API:t och kraver att raden faktiskt fylls.
test('6c · efter markören är HELA modulen installerad, inte bara home()', { skip }, async () => {
  const page = await sida();
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(MARKOR, null, { timeout: 20000 });

  // Stubbas EFTER laddning, inte via addInitScript: sidans egna auth-client.js och cloud-sync.js
  // definierar samma symboler vid laddning och skriver annars over stubbarna. Samma lardom som
  // star i command-center-alltime.browser.test.js.
  await page.evaluate(() => {
    window.VyraCloudSync = { current: () => ({ workspace: { id: 'ws-1' } }) };
    window.VyraAuth = { api: async () => ({ ok: true, period: 'all', konto: 'piiikabom', fel: false,
      forstaDagen: '2026-06-01', totalt: { gifts: 128, diamonds: 45300, likes: 9820 },
      dagar: [], toppGivare: [] }) };
  });
  await page.evaluate(() => { view = 'home'; render() });
  await page.waitForSelector('.home-welcome', { timeout: 10000 });

  await page.waitForFunction(
    () => document.querySelector('[data-alltime-stat="gifts"]')?.textContent.replace(/\D/g, '') === '128',
    null, { timeout: 10000 });
  await page.close();
});

// SJALVA SKULDEN, mätt. Vi serverar en overview-premium.js dar kopiatexten bytts — precis det som
// hande i #154 — och kraver att den GAMLA grinden slocknar medan markoren star kvar.
test('6d · en kopieändring släcker den gamla grinden men inte markören', { skip }, async () => {
  const kalla = fs.readFileSync(path.join(ROOT, 'overview-premium.js'), 'utf8');
  assert.ok(kalla.includes(ORD),
    'kopian innehåller inte längre ordet — provet nedan hade blivit grönt utan att mäta något');
  const bytt = kalla.split(ORD).join('STYRHYTTEN');

  const page = await sida();
  await page.route('**/overview-premium.js*', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: bytt }));
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });

  await page.waitForFunction(MARKOR, null, { timeout: 20000 });
  assert.equal(await gamlaGrinden(page), false,
    'den gamla grinden överlevde kopieändringen — då mäter det här provet inte skulden');
  await page.close();
});
