'use strict';
// Mock-backend for riggen (Etapp 6B).
//
// Fas B matte att INLOGGAT LAGE ar helt otestat: hela auth-kedjan gar via /api/*, och riggens
// filserver 404:ar pa allt. 28 anrop over 7 unika rutter i forsta-flodet, noll av dem besvarade.
//
// KONTRAKTETS PROV 9 VAR FEL, OCH MATNINGEN AVGJORDE DET. Kontraktet sa att ett natverksfel ska
// ge en lokal session. Uppmatt 2026-08-09 mot riktig Chrome, fem lagen:
//
//   {authRequired:false}   SKRIVBAR session       ingen inloggningsruta
//   {authRequired:true}    ej skrivbar            inloggningsruta visas
//   HTTP 500               ej skrivbar            ingen ruta
//   natverksfel            ej skrivbar            ingen ruta
//   HTTP 404               ej skrivbar            ingen ruta
//
// Bara ett UTTRYCKLIGT authRequired:false oppnar skrivlaget. Det ar en starkare egenskap an
// kontraktet beskrev, och den ar precis vad auth-client.js kommentar lovar: "ett natverksfel ar
// inte ett bevis pa att kontosystemet saknas". Prov 8 och 9 vaktar den uppmatta regeln.
//
// ROTT NU: tests/rigg/servera.js och tests/rigg/mock-backend.js finns inte.
const test = require('node:test'), assert = require('node:assert/strict');

let servera = null, api = null, felmodul = null;
try {
  ({ servera } = require('../rigg/servera.js'));
  api = require('../fixtures/api-svar.js');
  felmodul = require('../fixtures/api-fel.js');
} catch (_) { /* rott lage: riggen finns inte an */ }

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let browser;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)';
});
test.after(async () => { if (browser) await browser.close() });

function riggFinns() {
  assert.ok(servera, 'tests/rigg/servera.js saknas');
  assert.ok(api, 'tests/fixtures/api-svar.js saknas');
  assert.ok(felmodul, 'tests/fixtures/api-fel.js saknas');
}

// Startar servern, laddar Studion och later auth-kedjan koras klart.
async function studion(opts) {
  const rigg = await servera(opts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}/studio.html`, { waitUntil: 'load' });
  await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
  return { rigg, context, page, stang: async () => { await context.close(); await rigg.stang() } };
}

// projectLocalSession() och projectActive() ar ASYNKRONA och gar via Web Locks. En fast vantan
// racker inte: provet var gront lokalt och foll i CI, dar maskinen ar langsammare. Vi provar
// darfor tills sessionen svarar — eller tills tiden tar slut, och da ar svaret arligt nej.
//
// Att skriva samma vyra-state flera ganger ar ofarligt: det ar samma varde varje gang, och
// writeActive ar den enda vagen in i tillstandet anda.
const LAGE = async (page, { vantaPa = null, ms = 6000 } = {}) => {
  const slut = Date.now() + ms;
  let sista, forsok = 0;
  do {
    forsok++;
    sista = await page.evaluate(async () => {
      const skriv = await window.VyraSessionState.writeActive('vyra-state', JSON.stringify({ widgets: [] }));
      return {
        skrivbar: skriv.ok === true,
        anledning: skriv.reason || null,
        inloggningsruta: !!document.querySelector('.auth-gate'),
        // Diagnostik: forsta hardningen gissade pa langsamhet och hade fel — provet korde 9,3 s
        // i CI och blev anda inte skrivbart. Utan de har faltet star nasta CI-fall lika tyst.
        lokalSession: window.VyraAuth?.isLocalSession?.() ?? null,
        authKravs: window.VyraAuth?.isRequired?.() ?? null,
        anvandare: !!window.VyraAuth?.currentUser?.(),
      };
    });
    sista.forsok = forsok;
    if (vantaPa === null || sista.skrivbar === vantaPa) return sista;
    await new Promise(r => setTimeout(r, 250));
  } while (Date.now() < slut);
  return sista;
};

// Alla falt i ett felmeddelande — CI visar bara det som star har.
const beskriv = m => `skrivbar=${m.skrivbar} anledning=${m.anledning} forsok=${m.forsok} ` +
  `lokalSession=${m.lokalSession} authKravs=${m.authKravs} anvandare=${m.anvandare} ` +
  `inloggningsruta=${m.inloggningsruta}`;

// ---- Prov 1 · av som default -------------------------------------------------------------------
test('mock-backenden ar AV som default', { skip, timeout: 60000 }, async () => {
  riggFinns();
  const rigg = await servera();
  try {
    const r = await fetch(`${rigg.bas}/api/auth/config`);
    assert.equal(r.status, 404,
      'utan { backend: true } ska /api/* svara 404 — annars andras forutsattningarna for de 23 ' +
      'provfiler som redan forutsatter det');
    const html = await fetch(`${rigg.bas}/studio.html`);
    assert.equal(html.status, 200, 'filservern ska fungera som forut');
  } finally { await rigg.stang() }
});

// ---- Prov 2 · pa via flaggan --------------------------------------------------------------------
test('mock-backenden aktiveras med { backend: true }', { skip, timeout: 60000 }, async () => {
  riggFinns();
  const rigg = await servera({ backend: true });
  try {
    const r = await fetch(`${rigg.bas}/api/auth/config`);
    assert.equal(r.status, 200, 'med flaggan ska /api/auth/config svara');
    assert.equal(r.headers.get('content-type'), 'application/json');
  } finally { await rigg.stang() }
});

// ---- Prov 3 · config-formen ---------------------------------------------------------------------
test('/api/auth/config svarar med authRequired', { skip, timeout: 60000 }, async () => {
  riggFinns();
  const rigg = await servera({ backend: true });
  try {
    const d = await (await fetch(`${rigg.bas}/api/auth/config`)).json();
    assert.equal(d.authRequired, true,
      'grunden ar "auth kravs" — det ar det laget som gor inloggat lage testbart');
  } finally { await rigg.stang() }
});

// ---- Prov 4 · me-formen -------------------------------------------------------------------------
test('/api/auth/me svarar med user, workspaces och csrfToken', { skip, timeout: 60000 }, async () => {
  riggFinns();
  const rigg = await servera({ backend: true });
  try {
    const d = await (await fetch(`${rigg.bas}/api/auth/me`)).json();
    assert.ok(d.user && d.user.email, 'user med e-post kravs — finish() visar den');
    assert.ok(Array.isArray(d.workspaces) && d.workspaces.length,
      'workspaces kravs, annars gor finish() ett EXTRA me-anrop for att berika');
    assert.ok(d.csrfToken, 'csrfToken kravs — init() sparar den i sessionStorage');
  } finally { await rigg.stang() }
});

// ---- Prov 5 · klienten foljer kedjan -------------------------------------------------------------
test('klienten anropar /api/auth/me nar config sager authRequired', { skip, timeout: 90000 }, async () => {
  riggFinns();
  const logg = [];
  const s = await studion({ backend: true, logg });
  try {
    const rutter = logg.map(a => `${a.metod} ${a.sokvag}`);
    assert.ok(rutter.includes('GET /api/auth/config'), `config anropades inte: ${rutter.join(', ')}`);
    assert.ok(rutter.includes('GET /api/auth/me'),
      `me anropades inte trots authRequired:true — kedjan bryts: ${rutter.join(', ')}`);
    assert.ok(rutter.indexOf('GET /api/auth/config') < rutter.indexOf('GET /api/auth/me'),
      'config maste komma FORE me — det ar den ordningen grinden bygger pa');
  } finally { await s.stang() }
});

// ---- Prov 6 · inloggat lage ar skrivbart --------------------------------------------------------
test('fejkad inloggning ger ett skrivbart lage', { skip, timeout: 90000 }, async () => {
  riggFinns();
  const s = await studion({ backend: true });
  try {
    const m = await LAGE(s.page, { vantaPa: true });
    assert.equal(m.inloggningsruta, false,
      'med ett giltigt me-svar ska ingen inloggningsruta visas');
    assert.equal(m.skrivbar, true,
      `inloggat lage ska na studio-committed. ${beskriv(m)}`);
  } finally { await s.stang() }
});

// ---- Prov 7 · molnsync-kedjan --------------------------------------------------------------------
test('molnsync-kedjan gar hela vagen: config, me, overlays, overlay', { skip, timeout: 90000 }, async () => {
  riggFinns();
  const logg = [];
  const s = await studion({ backend: true, logg });
  try {
    await s.page.evaluate(async () => {
      view = 'editor';
      state.widgets = [{ id: 'm1', type: 'templateTopLike', x: 20, y: 20, width: 300 }];
      if (typeof save === 'function') save();
      await new Promise(r => setTimeout(r, 800));
      if (window.VyraCloudSync && window.VyraCloudSync.push) {
        try { await window.VyraCloudSync.push() } catch (_) {}
      }
      await new Promise(r => setTimeout(r, 1200));
    });
    const rutter = logg.map(a => a.rutt).filter(Boolean);
    for (const steg of ['GET /api/auth/config', 'GET /api/auth/me', 'GET /api/workspaces/:ws/overlays']) {
      assert.ok(rutter.includes(steg), `steget "${steg}" saknas i kedjan: ${[...new Set(rutter)].join(' · ')}`);
    }
    const skrev = logg.some(a => (a.metod === 'PUT' || a.metod === 'POST') && /\/overlays/.test(a.sokvag));
    assert.ok(skrev, `ingen skrivning mot overlays: ${logg.map(a => a.metod + ' ' + a.sokvag).join(' · ')}`);
  } finally { await s.stang() }
});

// ---- Prov 8 · configKnown-vakten, serverfel -----------------------------------------------------
test('HTTP 500 pa config oppnar INGEN skrivbar session', { skip, timeout: 90000 }, async () => {
  riggFinns();
  const s = await studion({ backend: true, fel: felmodul.fel({ 'GET /api/auth/config': 'serverfel' }) });
  try {
    const m = await LAGE(s.page);
    assert.equal(m.skrivbar, false,
      'servern svarade med fel — det ar INTE ett bevis pa att kontosystemet saknas, och en ' +
      'skrivbar session utan verifierad identitet ar precis det auth-client.js vaktar mot');
  } finally { await s.stang() }
});

// ---- Prov 9 · configKnown-vakten, natverksfel ---------------------------------------------------
test('natverksfel pa config oppnar INGEN skrivbar session', { skip, timeout: 90000 }, async () => {
  riggFinns();
  const s = await studion({ backend: true, fel: felmodul.fel({ 'GET /api/auth/config': 'natverksfel' }) });
  try {
    const m = await LAGE(s.page);
    // Uppmatt, tvartemot kontraktets formulering: ett natverksfel ger inte heller en session.
    assert.equal(m.skrivbar, false,
      'ett natverksfel ar inte ett besked om att auth saknas — bara ett uttryckligt ' +
      'authRequired:false far oppna skrivlaget');
    assert.equal(m.inloggningsruta, false,
      'och ingen inloggningsruta heller: klienten VET inte om konto kravs');
  } finally { await s.stang() }
});

// ---- Prov 10 · lokalt lage ar det enda som oppnar -------------------------------------------------
test('bara ett uttryckligt authRequired:false oppnar skrivlaget', { skip, timeout: 90000 }, async () => {
  riggFinns();
  const s = await studion({
    backend: true,
    fel: { 'GET /api/auth/config': { status: 200, kropp: { authRequired: false } } },
  });
  try {
    const m = await LAGE(s.page, { vantaPa: true });
    assert.equal(m.skrivbar, true,
      'authRequired:false ar det ENDA svar som ska ge en skrivbar lokal session. ' + beskriv(m));
    assert.equal(m.inloggningsruta, false, 'och ingen inloggningsruta');
  } finally { await s.stang() }
});

// ---- Prov 11 · CSRF-headern skickas --------------------------------------------------------------
test('api-hjalparens CSRF-header foljer med efter inloggning', { skip, timeout: 90000 }, async () => {
  riggFinns();
  const logg = [];
  const s = await studion({ backend: true, logg });
  try {
    await s.page.evaluate(async () => {
      await window.VyraAuth.api('/api/auth/sessions').catch(() => {});
      await new Promise(r => setTimeout(r, 400));
    });
    const efterMe = logg.slice(logg.findIndex(a => a.rutt === 'GET /api/auth/me') + 1);
    const medCsrf = efterMe.filter(a => a.csrf === api.CSRF);
    assert.ok(medCsrf.length > 0,
      'inget anrop efter inloggningen bar X-VYRA-CSRF. Det ar precis den kedja en objektstubb ' +
      `hoppar over. Anrop efterat: ${efterMe.map(a => a.sokvag + '(' + a.csrf + ')').join(' · ')}`);
  } finally { await s.stang() }
});

// ---- Prov 12 · api() kastar pa 4xx/5xx ------------------------------------------------------------
test('api-hjalparen kastar vid 4xx och 5xx fran mocken', { skip, timeout: 90000 }, async () => {
  riggFinns();
  const s = await studion({
    backend: true,
    fel: felmodul.fel({ 'GET /api/auth/sessions': 'obehorig', 'GET /api/auth/security-events': 'serverfel' }),
  });
  try {
    const m = await s.page.evaluate(async () => {
      const prova = async rutt => {
        try { await window.VyraAuth.api(rutt); return { kastade: false } }
        catch (e) { return { kastade: true, status: e.status, meddelande: e.message } }
      };
      return { obehorig: await prova('/api/auth/sessions'), serverfel: await prova('/api/auth/security-events') };
    });
    assert.equal(m.obehorig.kastade, true, '401 ska kasta');
    assert.equal(m.obehorig.status, 401, `status skulle vara 401, blev ${m.obehorig.status}`);
    assert.match(m.obehorig.meddelande, /inloggad/i, 'felmeddelandet ska komma ur svarets error-falt');
    assert.equal(m.serverfel.kastade, true, '500 ska kasta');
    assert.equal(m.serverfel.status, 500, `status skulle vara 500, blev ${m.serverfel.status}`);
  } finally { await s.stang() }
});
