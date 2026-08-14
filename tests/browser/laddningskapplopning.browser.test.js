'use strict';
// Kapplopningen mellan auth-handelserna och de filer som lyssnar pa dem.
//
// UPPTACKT SOM EN FLAKIG CI-KORNING, BEVISAD SOM EN PRODUKTBUGG.
//
// tests/browser/mock-backend.browser.test.js prov 10 foll slumpvis i CI och var alltid gront
// lokalt. Forsta gissningen var langsamhet, och en vantan pa 6 s lades in — nasta CI-korning tog
// 9,3 s och foll anda. Vantan var alltsa inte svaret.
//
// Beviset: fordroj cloud-sync.js med 1200 ms och felet blir DETERMINISTISKT.
//
//   utan broms                  skrivbar: true    lokalSession: true
//   cloud-sync.js bromsad       skrivbar: FALSE   lokalSession: true
//
// auth-client.js kor init() direkt vid laddning. Svarar /api/auth/config snabbt hinner
// 'vyra-auth-local' avfyras INNAN cloud-sync.js registrerat sin lyssnare, och handelsen ar borta
// for alltid. Ingen projicerar den lokala sessionen, writeActive svarar not-writable, och save()
// gor ingenting — resten av sidans livstid, utan ett ord till anvandaren.
//
// Samma monster galler 'vyra-auth-ready'. entitlement-gate.js har redan skyddet:
//   setTimeout(() => check(window.VyraAuth?.lastDetail?.()), 500)
// cloud-sync.js saknade det.
//
// ROTT NU: bada proven faller nar filen bromsas.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
});
test.after(async () => { if (browser) await browser.close() });

// 1200 ms ar valt sa att /api/auth/config hinner svara med god marginal fore filen laddats.
// CI:s verkliga glapp ar mycket mindre — men det ar samma glapp.
const BROMS = { 'cloud-sync.js': 1200 };

async function studion(opts) {
  const rigg = await servera(opts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}/studio.html`, { waitUntil: 'load' });
  // Rejalt tilltaget: bromsen ar 1200 ms, och efterkollen ska hinna med.
  await page.evaluate(() => new Promise(r => setTimeout(r, 4000)));
  return { rigg, context, page, stang: async () => { await context.close(); await rigg.stang() } };
}

const LAGE = page => page.evaluate(async () => {
  const skriv = await window.VyraSessionState.writeActive('vyra-state', JSON.stringify({ widgets: [] }));
  return {
    skrivbar: skriv.ok === true,
    anledning: skriv.reason || null,
    lokalSession: window.VyraAuth?.isLocalSession?.() ?? null,
    anvandare: !!window.VyraAuth?.currentUser?.(),
  };
});

// ---- Prov 1 · lokal session overlever en sen cloud-sync ----------------------------------------
test('lokal session projiceras aven nar cloud-sync.js laddas sent', { skip, timeout: 90000 }, async () => {
  const s = await studion({
    backend: true,
    brommade: BROMS,
    fel: { 'GET /api/auth/config': { status: 200, kropp: { authRequired: false } } },
  });
  try {
    const m = await LAGE(s.page);
    assert.equal(m.lokalSession, true,
      'kontrollmatning: auth-client ska ha bestamt att det ar en lokal session');
    assert.equal(m.skrivbar, true,
      `writeActive svarade "${m.anledning}". Handelsen vyra-auth-local avfyrades innan ` +
      'cloud-sync.js registrerat sin lyssnare, och ingen projicerade sessionen. Studion ar tyst ' +
      'skrivskyddad: save() gor ingenting och inget sags till anvandaren.');
  } finally { await s.stang() }
});

// ---- Prov 2 · inloggad session overlever samma broms -------------------------------------------
test('inloggad session initieras aven nar cloud-sync.js laddas sent', { skip, timeout: 90000 }, async () => {
  const s = await studion({ backend: true, brommade: BROMS });
  try {
    const m = await LAGE(s.page);
    assert.equal(m.anvandare, true, 'kontrollmatning: anvandaren ska vara inloggad');
    assert.equal(m.skrivbar, true,
      `writeActive svarade "${m.anledning}". vyra-auth-ready avfyrades innan cloud-sync.js ` +
      'lyssnade, sa initialize() kordes aldrig och sessionen blev aldrig skrivbar.');
  } finally { await s.stang() }
});

// ---- Prov 3 · vakt: utan broms ska allt vara som forut -----------------------------------------
test('utan broms ar bada lagen skrivbara som forut', { skip, timeout: 90000 }, async () => {
  const lokal = await studion({
    backend: true,
    fel: { 'GET /api/auth/config': { status: 200, kropp: { authRequired: false } } },
  });
  const inloggad = await studion({ backend: true });
  try {
    const a = await LAGE(lokal.page), b = await LAGE(inloggad.page);
    assert.equal(a.skrivbar, true, `lokalt lage: ${a.anledning}`);
    assert.equal(b.skrivbar, true, `inloggat lage: ${b.anledning}`);
  } finally { await lokal.stang(); await inloggad.stang() }
});
