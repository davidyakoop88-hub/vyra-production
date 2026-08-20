'use strict';
// ALLA TRE KNAPPARNA I SIDHUVUDET SKA LYSA (Davids beslut 2026-08-20).
//
// Läget före: bara "TikTok ansluten" lyste. Den gröna glöden ligger i studio.css och kom med
// §-fixen som gjorde anslutningsstatus avläsbar på avstånd. De två andra — "⬇ VYRA Desktop" och
// "🎨 Färgschema" — var platta paneler med en dov ram.
//
// DE BOR PÅ TRE OLIKA STÄLLEN, vilket är hela skälet att det här provet finns:
//   .head-desktop        auth-client.css  — ett <a>, alltså INTE träffad av `.head-actions button`
//   #openBrandKit        studio.css       — via `.head-actions button`
//   .connection.connected studio.css      — egen regel med !important
// En ändring som "lyser upp knapparna" är därför lätt att göra till hälften utan att märka det.
//
// DEN ANDRA HALVAN AV PROVET ÄR VIKTIGARE ÄN DEN FÖRSTA. Den gröna glöden BETYDER något: den
// säger att TikTok är anslutet. Om alla tre lyser i samma färg är statusen inte längre avläsbar —
// då har vi bytt bort information mot dekoration. Provet kräver därför att anslutningsknappen
// lyser i en annan färg än de två andra, inte bara att alla tre lyser.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser, rigg;
let skip = hoppaOver();

const META = { status: 200, kropp: { ok: true, version: '1.2.3',
  sha256: '592261d4940d723bb09d3d3078f97e43b3c1b5c69a7699613f5a570927f3f3cd',
  sizeBytes: 281005462, platform: 'Windows 10/11', format: 'EXE installer' } };
const VERIFIERAD = { status: 200, kropp: { ok: true, csrfToken: 'mock-csrf-token',
  user: { id: 'u-mock', email: 'mock@vyra.test', display_name: 'Mock Streamer',
    emailVerified: true, email_verified_at: '2026-08-01T00:00:00.000Z' },
  workspaces: [{ id: 'ws-mock', name: 'Mock-arbetsyta', slug: 'mock' }] } };

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  rigg = await servera({ backend: true, fel: {
    'GET /api/downloads/windows': META, 'GET /api/auth/me': VERIFIERAD } });
});
test.after(async () => { if (browser) await browser.close(); if (rigg) await rigg.stang() });

// Mäter glöden på de tre knapparna. Anslutningsknappen sätts i ansluten-läge först — annars
// mäter vi den gula "inte ansluten"-punkten och svarar på fel fråga.
const MAT = `(() => {
  const anslut = document.querySelector('.head-actions .connection');
  if (anslut) anslut.classList.add('connected');
  const glod = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { skugga: cs.boxShadow, ram: cs.borderColor };
  };
  return {
    desktop: glod(document.querySelector('.head-actions [data-ladda-desktop]')),
    fargschema: glod(document.querySelector('.head-actions #openBrandKit')),
    anslutning: glod(anslut),
  };
})()`;

async function sidhuvudet() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}/studio.html`, { waitUntil: 'load' });
  await page.evaluate(() => new Promise(r => setTimeout(r, 2600)));
  return { context, page };
}

// En glöd är en box-shadow som faktiskt ritar något. 'none' är ingen glöd, och en skugga med
// nollutbredning eller helt genomskinlig färg är heller ingen glöd — bara en rad i CSS:en.
function lyser(m, namn) {
  assert.ok(m, `${namn} finns inte i sidhuvudet`);
  assert.notEqual(m.skugga, 'none', `${namn} har ingen box-shadow — den lyser inte`);
  assert.ok(!/rgba\([^)]*,\s*0\)/.test(m.skugga),
    `${namn} har en helt genomskinlig skugga: "${m.skugga}"`);
  assert.ok(/\d+px/.test(m.skugga), `${namn} har en skugga utan utbredning: "${m.skugga}"`);
}

test('alla tre knapparna i sidhuvudet lyser', { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidhuvudet();
  try {
    const m = await page.evaluate(MAT);
    lyser(m.desktop, '⬇ VYRA Desktop');
    lyser(m.fargschema, '🎨 Färgschema');
    lyser(m.anslutning, 'TikTok ansluten');
  } finally { await context.close() }
});

test('anslutningsknappen lyser i en EGEN färg — statusen får inte drunkna i dekoration',
  { skip, timeout: 60000 }, async () => {
  const { context, page } = await sidhuvudet();
  try {
    const m = await page.evaluate(MAT);
    // Grönt mot violett: jämför de faktiska skuggfärgerna, inte klassnamnen. Klassnamn kan vara
    // rätt medan färgen är fel — det är färgen tittaren läser.
    assert.notEqual(m.anslutning.skugga, m.desktop.skugga,
      'anslutningsknappen har samma glöd som nedladdningsknappen; då säger den gröna färgen '
      + 'inte längre att TikTok ÄR anslutet');
    assert.notEqual(m.anslutning.skugga, m.fargschema.skugga,
      'anslutningsknappen har samma glöd som färgschemaknappen');
    assert.equal(m.desktop.skugga, m.fargschema.skugga,
      'de två neutrala knapparna ska lysa likadant — olika glöd på dem antyder en skillnad i '
      + `betydelse som inte finns (desktop="${m.desktop.skugga}", färgschema="${m.fargschema.skugga}")`);
  } finally { await context.close() }
});
