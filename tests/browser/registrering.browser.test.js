'use strict';
// Polerad losenordsregistrering (Etapp 6C).
//
// Fas B matte att social inloggning INTE ar en kryssruta: noll oauth-hooks i server/index.js, och
// password_hash ar NOT NULL. Det ar en egen etapp. 6C polerar i stallet det flode som finns.
//
// Uppmatt fore arbetet:
//   Rubrik "Skapa ditt VYRA-konto", knapp "Skapa konto"
//   Visningsnamn saknar autocomplete (e-post och losenord har det)
//   Ingen aterkoppling pa losenordskravet (minlength 12) forran man trycker
//   Registrering loggar in TYST — verifieringsmailet namns aldrig i UI:t
//   Servern svarar { workspace } medan finish(), cloud-sync och entitlement-gate alla laser
//   { workspaces } — sa varje registrering kostar ett extra /api/auth/me
//
// ?verify-email hanteras REDAN av auth-security.js verify(). Prov 10-11 galler dess kopia och
// knappval, inte att bygga skarmen fran noll.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const api = require('../fixtures/api-svar.js');

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

// Inloggningsrutan visas nar config kraver auth men me svarar 401 — samma lage som produktion
// for en utloggad besokare (uppmatt pa vyralive.app 2026-08-09).
async function rutan(extra = {}) {
  const logg = [];
  const rigg = await servera({
    backend: true, logg,
    fel: Object.assign({ 'GET /api/auth/me': { status: 401, kropp: { error: 'Ej inloggad' } } }, extra.fel),
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}${extra.sokvag || '/studio.html'}`, { waitUntil: 'load' });
  await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
  return { rigg, context, page, logg, stang: async () => { await context.close(); await rigg.stang() } };
}

const TILL_REGISTRERING = async page => page.evaluate(async () => {
  document.querySelector('#authSwitch').click();
  await new Promise(r => setTimeout(r, 400));
});

// ---- Prov 1 · rubriken -------------------------------------------------------------------------
test('registreringsrubriken bjuder in i stallet for att be om ett konto', { skip, timeout: 90000 }, async () => {
  const s = await rutan();
  try {
    await TILL_REGISTRERING(s.page);
    const m = await s.page.evaluate(() => (document.querySelector('.auth-gate h1') || {}).textContent);
    assert.equal(m, 'Kom igång med Vyra',
      `rubriken sager "${m}" — ordet "konto" beskriver var administration, inte anvandarens arende`);
  } finally { await s.stang() }
});

// ---- Prov 2 · knappen --------------------------------------------------------------------------
test('knappen sager Kom igang', { skip, timeout: 90000 }, async () => {
  const s = await rutan();
  try {
    await TILL_REGISTRERING(s.page);
    const m = await s.page.evaluate(() =>
      (document.querySelector('.auth-gate button.primary') || {}).textContent);
    assert.equal(m, 'Kom igång', `knappen sager "${m}"`);
  } finally { await s.stang() }
});

// ---- Prov 3 · autocomplete ---------------------------------------------------------------------
test('visningsnamnet har autocomplete som de andra falten', { skip, timeout: 90000 }, async () => {
  const s = await rutan();
  try {
    await TILL_REGISTRERING(s.page);
    const m = await s.page.evaluate(() => [...document.querySelectorAll('.auth-gate input')]
      .map(i => ({ id: i.id, ac: i.getAttribute('autocomplete') })));
    const namn = m.find(x => x.id === 'authName');
    assert.ok(namn, 'kontrollmatning: visningsnamnsfaltet ska finnas i registreringslaget');
    assert.equal(namn.ac, 'nickname',
      `visningsnamnet har autocomplete="${namn.ac}" medan e-post och losenord bada har ett varde`);
  } finally { await s.stang() }
});

// ---- Prov 4 · matare finns och reagerar --------------------------------------------------------
test('losenordsstyrkan visas och uppdateras medan man skriver', { skip, timeout: 90000 }, async () => {
  const s = await rutan();
  try {
    await TILL_REGISTRERING(s.page);
    const m = await s.page.evaluate(async () => {
      const falt = document.querySelector('#authPassword');
      const skriv = async v => {
        falt.value = v;
        falt.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 120));
        const m = document.querySelector('[data-losenordsstyrka]');
        return m ? { niva: m.dataset.losenordsstyrka, bredd: getComputedStyle(m.querySelector('i')).width,
          text: (m.querySelector('span') || {}).textContent } : null;
      };
      return { tom: await skriv(''), kort: await skriv('abc'), langre: await skriv('abcdefghij') };
    });
    assert.ok(m.kort, 'malaren [data-losenordsstyrka] saknas');
    assert.notEqual(m.kort.niva, m.langre.niva,
      `nivan andrades inte mellan 3 och 10 tecken (bada "${m.kort.niva}") — mataren reagerar inte`);
  } finally { await s.stang() }
});

// ---- Prov 5 · for kort ------------------------------------------------------------------------
test('for kort losenord visas som svagt med besked om hur mycket som saknas', { skip, timeout: 90000 }, async () => {
  const s = await rutan();
  try {
    await TILL_REGISTRERING(s.page);
    const m = await s.page.evaluate(async () => {
      const falt = document.querySelector('#authPassword');
      falt.value = 'kort';
      falt.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      const el = document.querySelector('[data-losenordsstyrka]');
      return { niva: el.dataset.losenordsstyrka, text: el.querySelector('span').textContent,
        farg: getComputedStyle(el.querySelector('i')).backgroundColor };
    });
    assert.equal(m.niva, 'svag', `nivan ar "${m.niva}" for fyra tecken`);
    assert.match(m.text, /8/, `beskedet ska saga hur manga tecken som saknas: "${m.text}"`);
    assert.match(m.farg, /rgb\(2[0-9]{2}, [0-9]{1,2}, /,
      `stapeln ska vara rod for ett underkant losenord, ar ${m.farg}`);
  } finally { await s.stang() }
});

// ---- Prov 6 · godkant -------------------------------------------------------------------------
test('godkant losenord visas som starkt', { skip, timeout: 90000 }, async () => {
  const s = await rutan();
  try {
    await TILL_REGISTRERING(s.page);
    const m = await s.page.evaluate(async () => {
      const falt = document.querySelector('#authPassword');
      falt.value = 'Blomstermat42!';
      falt.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      const el = document.querySelector('[data-losenordsstyrka]');
      return { niva: el.dataset.losenordsstyrka, text: el.querySelector('span').textContent };
    });
    assert.equal(m.niva, 'stark', `nivan ar "${m.niva}" for fjorton blandade tecken`);
    assert.match(m.text, /Bra lösenord/, `beskedet ar "${m.text}"`);
  } finally { await s.stang() }
});

// Registrerar och returnerar sidan i inloggat lage.
async function registrera(s) {
  await TILL_REGISTRERING(s.page);
  await s.page.evaluate(async () => {
    document.querySelector('#authEmail').value = 'ny@vyra.test';
    document.querySelector('#authPassword').value = 'Blomstermat42!';
    document.querySelector('#authName').value = 'Ny Streamer';
    document.querySelector('.auth-gate form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 1800));
  });
}

// ---- Prov 7 · verifieringsbannern --------------------------------------------------------------
test('efter registrering visas en pamminnelse om verifieringsmailet', { skip, timeout: 90000 }, async () => {
  const s = await rutan();
  try {
    await registrera(s);
    const m = await s.page.evaluate(() => {
      const b = document.querySelector('[data-verifieringsbanner]');
      if (!b) return { saknas: true };
      const r = b.getBoundingClientRect();
      return { text: b.textContent.replace(/\s+/g, ' ').trim(), synlig: r.width > 0 && r.height > 0,
        overkant: Math.round(r.top) };
    });
    assert.ok(!m.saknas, 'bannern [data-verifieringsbanner] saknas efter registrering');
    assert.ok(m.synlig, 'bannern ska synas pa skarmen, inte bara finnas i DOM');
    assert.match(m.text, /ny@vyra\.test/, `bannern ska namna adressen mailet gick till: "${m.text}"`);
    assert.ok(m.overkant < 200, `bannern ska ligga hogst upp, ar pa y=${m.overkant}`);
  } finally { await s.stang() }
});

// ---- Prov 8 · gar att stanga -------------------------------------------------------------------
test('verifieringsbannern gar att stanga', { skip, timeout: 90000 }, async () => {
  const s = await rutan();
  try {
    await registrera(s);
    const m = await s.page.evaluate(async () => {
      const knapp = document.querySelector('[data-verifieringsbanner] [data-stang]');
      if (!knapp) return { saknasKnapp: true };
      knapp.click();
      await new Promise(r => setTimeout(r, 400));
      return { kvar: !!document.querySelector('[data-verifieringsbanner]'),
        sparat: sessionStorage.getItem('vyra-verifiering-stangd') };
    });
    assert.ok(!m.saknasKnapp, 'stangknappen [data-stang] saknas');
    assert.equal(m.kvar, false, 'bannern ska forsvinna nar man stanger den');
    assert.ok(m.sparat, 'valet ska ligga i sessionStorage — inte localStorage, den ska aterkomma');
  } finally { await s.stang() }
});

// ---- Prov 9 · aterkommer nasta session ---------------------------------------------------------
// Har svarar me 200 med en OVERIFIERAD anvandare — samma lage som direkt efter registrering, men
// utan att ga via formularet. Bannern ska da mounta redan vid laddning.
test('verifieringsbannern aterkommer i en ny session', { skip, timeout: 120000 }, async () => {
  const rigg = await servera({ backend: true });
  const nyFlik = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${rigg.bas}/studio.html`, { waitUntil: 'load' });
    await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
    return { context, page };
  };
  const a = await nyFlik();
  try {
    const fanns = await a.page.evaluate(() => !!document.querySelector('[data-verifieringsbanner]'));
    assert.equal(fanns, true,
      'kontrollmatning: en overifierad anvandare ska se pamminnelsen redan vid laddning');

    await a.page.evaluate(async () => {
      document.querySelector('[data-verifieringsbanner] [data-stang]').click();
      await new Promise(r => setTimeout(r, 300));
    });
    await a.page.reload({ waitUntil: 'load' });
    await a.page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
    const sammaSession = await a.page.evaluate(() => !!document.querySelector('[data-verifieringsbanner]'));
    assert.equal(sammaSession, false, 'inom samma session ska bannern sta kvar stangd');

    const b = await nyFlik();
    const nySession = await b.page.evaluate(() => !!document.querySelector('[data-verifieringsbanner]'));
    await b.context.close();
    assert.equal(nySession, true,
      'i en ny session ska pamminnelsen komma tillbaka sa lange e-posten ar overifierad');
  } finally { await a.context.close(); await rigg.stang() }
});

// ---- Prov 10 · bekraftelseskarmen --------------------------------------------------------------
test('verifieringslanken ger en bekraftelse som namner Premium', { skip, timeout: 90000 }, async () => {
  const s = await rutan({ sokvag: '/studio.html?verify-email=demo-token' });
  try {
    const m = await s.page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 1200));
      const el = document.querySelector('.auth-modal, .auth-gate');
      return el ? { text: el.textContent.replace(/\s+/g, ' ').trim(),
        knapp: (el.querySelector('button.primary') || {}).textContent } : { saknas: true };
    });
    assert.ok(!m.saknas, 'ingen bekraftelseskarm visades for ?verify-email');
    assert.match(m.text, /verifierad/i, `skarmen ska bekrafta verifieringen: "${m.text}"`);
    assert.match(m.text, /Premium/,
      `skarmen ska saga vad verifieringen LASTE UPP, inte bara att den skedde: "${m.text}"`);
  } finally { await s.stang() }
});

// ---- Prov 11 · knappen beror pa om man ar inloggad ----------------------------------------------
test('bekraftelseskarmens knapp skiljer inloggad fran utloggad', { skip, timeout: 120000 }, async () => {
  const utloggad = await rutan({ sokvag: '/studio.html?verify-email=demo-token' });
  let utloggadKnapp;
  try {
    utloggadKnapp = await utloggad.page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 1200));
      return (document.querySelector('.auth-modal button.primary, .auth-gate button.primary') || {}).textContent;
    });
  } finally { await utloggad.stang() }

  const rigg = await servera({ backend: true });   // me svarar 200 = inloggad
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}/studio.html?verify-email=demo-token`, { waitUntil: 'load' });
  await page.evaluate(() => new Promise(r => setTimeout(r, 1800)));
  const inloggadKnapp = await page.evaluate(() =>
    (document.querySelector('.auth-modal button.primary, .auth-gate button.primary') || {}).textContent);
  await context.close(); await rigg.stang();

  assert.ok(utloggadKnapp, 'utloggad: ingen knapp hittades');
  assert.ok(inloggadKnapp, 'inloggad: ingen knapp hittades');
  assert.notEqual(utloggadKnapp, inloggadKnapp,
    `knappen sager "${inloggadKnapp}" i bada lagen — en inloggad anvandare ska inte uppmanas ` +
    'att oppna det hon redan star i');
});

// ---- Prov 12 · serverns svarsform --------------------------------------------------------------
test('serverns register-svar bar workspaces i plural', { skip: false }, () => {
  const fs = require('fs'), path = require('path');
  const idx = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'index.js'), 'utf8');
  const i = idx.indexOf("p==='/api/auth/register'");
  assert.ok(i > 0, 'kontrollmatning: register-endpointen ska finnas');
  const svar = idx.slice(i, i + 1600);
  const skickar = svar.slice(svar.indexOf('send(res,201'), svar.indexOf('send(res,201') + 320);
  assert.match(skickar, /workspaces\s*:/,
    'svaret bar bara workspace i singular. finish(), cloud-sync.initialize() och ' +
    'entitlement-gate laser alla detail.workspaces[0] — sa varje registrering kostar ett extra ' +
    `/api/auth/me. Svaret: ${skickar.slice(0, 200)}`);
});

// ---- Prov 13 · inget extra me-anrop ------------------------------------------------------------
test('registreringen kostar inte ett extra /api/auth/me', { skip, timeout: 90000 }, async () => {
  const s = await rutan();
  try {
    const foreAntal = s.logg.filter(a => a.rutt === 'GET /api/auth/me').length;
    await registrera(s);
    const efterAntal = s.logg.filter(a => a.rutt === 'GET /api/auth/me').length;
    const registrerade = s.logg.some(a => a.rutt === 'POST /api/auth/register');
    assert.ok(registrerade, 'kontrollmatning: registreringen ska ha skickats');
    assert.equal(efterAntal - foreAntal, 0,
      `registreringen utloste ${efterAntal - foreAntal} extra me-anrop — svaret bar redan allt ` +
      'finish() behover');
  } finally { await s.stang() }
});

// ---- Prov 14 · regression: inloggningslaget ar orort -------------------------------------------
test('inloggningslaget ser ut och beter sig som forut', { skip, timeout: 90000 }, async () => {
  const s = await rutan();
  try {
    const m = await s.page.evaluate(() => {
      const g = document.querySelector('.auth-gate');
      return {
        rubrik: (g.querySelector('h1') || {}).textContent,
        knapp: (g.querySelector('button.primary') || {}).textContent,
        falt: [...g.querySelectorAll('input')].map(i => i.id),
        vaxel: (g.querySelector('#authSwitch') || {}).textContent,
        matare: !!g.querySelector('[data-losenordsstyrka]'),
      };
    });
    assert.equal(m.rubrik, 'Välkommen tillbaka', 'inloggningsrubriken ska vara oforandrad');
    assert.equal(m.knapp, 'Logga in', 'inloggningsknappen ska vara oforandrad');
    assert.deepEqual(m.falt, ['authEmail', 'authPassword'], 'inloggningen ska inte ha fatt fler falt');
    assert.equal(m.matare, false,
      'styrkematare hor hemma dar man VALJER ett losenord, inte dar man skriver ett man redan har');
  } finally { await s.stang() }
});
