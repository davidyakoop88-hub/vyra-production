'use strict';
// FAS 3 — EN CSS-ÄNDRING SKA FÄLLA EXAKT DE NYCKLAR SOM ANVÄNDER REGELN.
//
// Vakten i visuell-regression.browser.test.js jämför mot incheckade referensbilder, och de gäller
// bara på den Chromium-build de togs på. Ett prov som ändrar en CSS-regel och läser av vilka
// nycklar som faller mot REFERENSERNA kan därför bara köras i CI — vilket gör beviset omöjligt att
// upprepa för den som utvecklar.
//
// Det här provet bevisar samma sak UTAN referenser: det fotograferar samma nyckel före och efter
// att en regel injicerats i sidan, och jämför de två fotona med varandra genom exakt samma
// V.JAMFOR som vakten använder. Då blir beviset körbart överallt, och det mäter det som faktiskt
// är intressant:
//
//   Ga  en widget som ANVÄNDER den ändrade regeln ser annorlunda ut efteråt
//   Gb  en widget som INTE använder regeln ser likadan ut — ändringen läcker inte
//   Gc  utan CSS-ändring är två foton av samma widget identiska (nolltoleransen håller,
//       annars vore Ga:s utslag brus och inte bevis)
//
// Ga och Gb tillsammans är påståendet "exakt de nycklar som använder regeln faller". Gc är
// kontrollmätningen som gör de två andra läsbara.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const { kravNycklar, ALERTS, utanReferens } = require('../helpers/katalognycklar.js');
const V = require('../helpers/visuell.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };

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

let browser, server, sida;
let skip = hoppaOver();

// Regeln som ändras och de två nycklarna: en som målar med `--gifter` (Gifter Level Up:s
// huvudfärg) och en som aldrig rör den. Variabeln är vald med flit framför en klassregel —
// den går att ändra utan att känna till någon modells interna markup, och den syns garanterat
// i pixlarna eftersom den bär widgetens ram, glöd och accenter.
const REGEL = '.gifter-level-up{--gifter:#00d0a0!important;--gifter-light:#b8ffe8!important}';
const NYCKEL_SOM_ANVANDER = 'catalog:gifterlevel:profile';
const NYCKEL_SOM_INTE_ANVANDER = 'catalog:socialgoal:followers:1:landscape';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  const bas = `http://127.0.0.1:${server.address().port}`;
  sida = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await sida.waitForFunction(() => typeof window.render === 'function', null,
    { timeout: 30000, polling: 100 });
  await sida.waitForTimeout(4500);
  await sida.evaluate(V.RIGG);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

const fotografera = nyckel => V.fotografera(sida, nyckel, ALERTS);
const injicera = css => sida.evaluate(regel => {
  const el = document.createElement('style');
  el.id = 'fas3-injektion';
  el.textContent = regel;
  document.head.append(el);
}, css);
const taBort = () => sida.evaluate(() => document.getElementById('fas3-injektion')?.remove());
const jamfor = (a, b) => sida.evaluate(V.JAMFOR, [a, b, V.KANALTROSKEL]);

// Kontrollmätningen först: finns nycklarna alls? Ett prov som tyst hoppar över sin egen
// mätpunkt är värre än inget prov.
test('kontrollmätning: båda nycklarna finns i katalogen', { skip }, async () => {
  const alla = await kravNycklar(sida);
  for (const n of [NYCKEL_SOM_ANVANDER, NYCKEL_SOM_INTE_ANVANDER]) {
    assert.ok(alla.includes(n), `nyckeln ${n} finns inte i katalogen längre — provet mäter ingenting`);
    assert.ok(!utanReferens(n), `nyckeln ${n} står i undantagslistan och går inte att fotografera stilla`);
  }
});

test('Gc: utan CSS-ändring är två foton av samma widget identiska', { skip }, async () => {
  await taBort();
  const a = await fotografera(NYCKEL_SOM_ANVANDER);
  const b = await fotografera(NYCKEL_SOM_ANVANDER);
  assert.ok(!a.fel && !b.fel, `kunde inte fotograferas: ${a.fel || b.fel}`);
  const r = await jamfor(a.b64, b.b64);
  assert.equal(r.matt, undefined, 'måtten ändrades mellan två foton av samma widget');
  assert.equal(r.olika, 0,
    `två foton av samma widget utan ändring skiljde ${r.olika} pixlar (största kanalskillnad `
    + `${r.storsta}) — då är utslaget i Ga brus, inte bevis`);
});

test('Ga: en widget som använder regeln ser annorlunda ut efter ändringen', { skip }, async () => {
  await taBort();
  const fore = await fotografera(NYCKEL_SOM_ANVANDER);
  await injicera(REGEL);
  const efter = await fotografera(NYCKEL_SOM_ANVANDER);
  await taBort();
  assert.ok(!fore.fel && !efter.fel, `kunde inte fotograferas: ${fore.fel || efter.fel}`);
  const r = await jamfor(fore.b64, efter.b64);
  assert.notEqual(r.olika, 0,
    'widgeten såg exakt likadan ut efter att dess huvudfärg bytts — då skulle vakten inte se '
    + 'en verklig CSS-regression heller');
  assert.ok(r.storsta >= 20,
    `största kanalskillnad var bara ${r.storsta} — en färgändring ska flytta kanaler med tiotal`);
  assert.ok(r.olika >= 200,
    `bara ${r.olika} av ${r.total} pixlar skiljde — färgen bär ram, glöd och accenter och ska `
    + 'synas över en yta, inte i enstaka pixlar');
});

test('Gb: en widget som inte använder regeln är oförändrad', { skip }, async () => {
  await taBort();
  const fore = await fotografera(NYCKEL_SOM_INTE_ANVANDER);
  await injicera(REGEL);
  const efter = await fotografera(NYCKEL_SOM_INTE_ANVANDER);
  await taBort();
  assert.ok(!fore.fel && !efter.fel, `kunde inte fotograferas: ${fore.fel || efter.fel}`);
  const r = await jamfor(fore.b64, efter.b64);
  assert.equal(r.olika, 0,
    `${r.olika} pixlar ändrades i en widget som inte använder regeln (största kanalskillnad `
    + `${r.storsta}) — ändringen läcker, och då säger ett rött utslag inget om VILKEN regel som `
    + 'orsakade det');
});
