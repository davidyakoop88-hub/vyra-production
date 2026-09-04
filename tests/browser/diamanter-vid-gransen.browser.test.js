'use strict';
// DIAMANTERNA VID KLIENTGRÄNSEN — mätt på den körande sidan, inte i källtexten.
//
// `coins` bär diamanter (#133). Källfältet heter `diamondCount` i båda bryggorna, så talet har
// alltid varit diamanter — det är NAMNET som ljuger. `live-client.js` normaliserar därför vid
// gränsen: både `coins` och `diamonds` sätts till `e.diamonds ?? e.coins ?? e.diamondCount`, och
// ~20 filer nedströms läser det interna `coins` utan att veta något om trådformatet.
//
// VARFÖR DET HÄR PROVET FINNS. Vakten i tests/diamanter-faltnamn.test.js är en KÄLLTEXTSVAKT:
//
//     assert.match(kalla, /diamonds:Number\(e\.diamonds\?\?e\.coins\?\?e\.diamondCount\?\?0\)/)
//
// Den uppfylls av en kommentar som råkar innehålla strängen, och den faller på en omformatering
// som inte ändrar någonting. Båda felen är samma fel: den mäter tecken, inte beteende. Samma fälla
// har fällt tre vakter i det här repot — senast Glove Snipes teardown, som var grön både före
// fixen och när funktionen fanns men aldrig anropades.
//
// Det här provet anropar i stället `window.VyraLive.mapEvent` i en riktig sida och läser vad en
// konsument faktiskt får ut.
//
// TRE FALL, och det tredje är det som betyder något:
//   ny avsändare  {diamonds}          — molnbryggan och 1.2.4+
//   gammal        {coins}             — den PUBLICERADE .exe:n v1.2.3 skickar bara det namnet
//   båda          {diamonds, coins}   — `diamonds` ska vinna; annars är omdöpningen verkningslös
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

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

let server, browser, bas, sida;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
  sida = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  // live-client.js laddas DYNAMISKT — ingen HTML i repot har en <script>-tagg for den. Vanta ut
  // den i stallet for att anta att den finns direkt efter load.
  await sida.waitForFunction(
    () => !!(window.VyraLive && typeof window.VyraLive.mapEvent === 'function'),
    null, { timeout: 30000, polling: 100 });
}, { timeout: 90000 });

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Plockar ut gift-nyttolasten ur mapEvents retur, som ar [[namn, payload], ...].
async function gava(handelse) {
  return sida.evaluate((h) => {
    const trafffar = window.VyraLive.mapEvent({ type: 'gift', username: 'provgivare',
      giftName: 'Rose', ...h });
    const g = (trafffar || []).find(x => x && x[0] === 'gift');
    if (!g) return { fel: 'mapEvent gav ingen gift-trigger' };
    return { coins: g[1].coins, diamonds: g[1].diamonds };
  }, handelse);
}

test('en ny avsandare som skickar diamonds nar bada namnen', { skip, timeout: 60000 }, async () => {
  const p = await gava({ diamonds: 100 });
  assert.equal(p.fel, undefined, p.fel);
  assert.equal(p.diamonds, 100, `diamonds ska bara talet, fick ${p.diamonds}`);
  assert.equal(p.coins, 100,
    `coins maste ge SAMMA tal, fick ${p.coins} — annars beror beloppet pa vilket namn lasaren `
    + 'rakar valja, och ~20 filer nedstroms laser fortfarande coins');
});

test('den publicerade .exe:n som bara skickar coins tappar ingenting', { skip, timeout: 60000 }, async () => {
  // v1.2.3 ligger i drift och kan inte uppdateras retroaktivt. Slutar klienten lasa `coins` blir
  // varje gava fran den vard noll — tyst, och bara for de anvandarna.
  const p = await gava({ coins: 50 });
  assert.equal(p.fel, undefined, p.fel);
  assert.equal(p.diamonds, 50, `diamonds ska harledas ur coins, fick ${p.diamonds}`);
  assert.equal(p.coins, 50, `coins ska bevaras, fick ${p.coins}`);
});

test('nar bada namnen finns vinner diamonds', { skip, timeout: 60000 }, async () => {
  // SJALVA POANGEN MED #133. Vinner `coins` har ar omdopningen verkningslos: en avsandare som
  // skickar ratt tal i ratt falt far det overkort av det felnamngivna.
  const p = await gava({ diamonds: 7, coins: 999 });
  assert.equal(p.fel, undefined, p.fel);
  assert.equal(p.diamonds, 7, `diamonds ska vinna, fick ${p.diamonds}`);
  assert.equal(p.coins, 7,
    `aven coins ska bara det sanna talet, fick ${p.coins} — annars visar tva widgetar som laser `
    + 'olika falt olika belopp for samma gava');
});

test('ett saknat tal blir 0, aldrig NaN', { skip, timeout: 60000 }, async () => {
  // NaN faller inte — det sprider sig. En summa som en gang blivit NaN forblir NaN i varje
  // topplista och varje mal den nar.
  const p = await gava({});
  assert.equal(p.fel, undefined, p.fel);
  assert.equal(p.diamonds, 0, `fick ${p.diamonds}`);
  assert.equal(p.coins, 0, `fick ${p.coins}`);
});
