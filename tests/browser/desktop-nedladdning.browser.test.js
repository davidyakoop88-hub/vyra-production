'use strict';
// Skrivbordsappen gick inte att na inifran Studion.
//
// Uppmatt 2026-08-09, fore det har arbetet:
//   - Tva tomma tillstand sager "Anslut VYRA Desktop sa visas..." (oversikt-puls,
//     statistik-tillvaxt). Guiden sager "Kraver VYRA Desktop" pa OBS-kortet och i FAQ.
//   - Ingen av de fyra namnena ar en lank.
//   - download-client.js laddas BARA pa index.html, och binder .desktop-download EN gang vid
//     laddning — den kan darfor aldrig betjana en vy som ritas om.
//   - Enda mekanismen ar studio.html?intent=download, och enda platsen som producerar den
//     lanken ar startmodalen pa landningssidan.
//   - Sidonavigeringens fjorton poster har ingen nedladdning.
//
// Produktionen ar mott samma dag: /api/downloads/windows?meta=1 svarar
// {"ok":true,"version":"1.2.3","sizeBytes":281005462,...}. Nedladdningen ar publicerad — det
// som saknas ar vagen dit, inte filen.
//
// Rutten kraver session (401), verifierad e-post (403) och premium (402), och svarar 302 till
// filen. Handlingen ar darfor en riktig <a href> — vanlig hogerklick-och-spara fungerar — med
// en delegerad lyssnare som stoppar klicket och sager varfor nar anvandaren inte far ladda ner.
//
// PROVEN NAVIGERAR ALDRIG. En 268 MB-nedladdning i en testrigg ar ingen matning, det ar en
// vantetid. Behorigheten mats genom VyraDesktop.kanLaddaNer(), lanken genom href, och
// avvisningen genom att klicket blir defaultPrevented.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');
const { SYNLIG } = require('../fixtures/synlighet.js');

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

// Formen ar UPPMATT ur produktionen 2026-08-09, inte pahittad.
const META = { status: 200, kropp: { ok: true, version: '1.2.3',
  sha256: '592261d4940d723bb09d3d3078f97e43b3c1b5c69a7699613f5a570927f3f3cd',
  sizeBytes: 281005462, platform: 'Windows 10/11', format: 'EXE installer' } };

const VERIFIERAD = { status: 200, kropp: { ok: true, csrfToken: 'mock-csrf-token',
  user: { id: 'u-mock', email: 'mock@vyra.test', display_name: 'Mock Streamer',
    emailVerified: true, email_verified_at: '2026-08-01T00:00:00.000Z' },
  workspaces: [{ id: 'ws-mock', name: 'Mock-arbetsyta', slug: 'mock' }] } };

async function studion({ fel = {}, verifierad = true, logg = null } = {}) {
  const rigg = await servera({ backend: true, logg, fel: Object.assign(
    { 'GET /api/downloads/windows': META },
    verifierad ? { 'GET /api/auth/me': VERIFIERAD } : {},
    fel) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}/studio.html`, { waitUntil: 'load' });
  await page.evaluate(() => new Promise(r => setTimeout(r, 2600)));
  return { rigg, context, page, stang: async () => { await context.close(); await rigg.stang() } };
}

// Sidonavigeringen ar <button data-view> och <button data-extra> — inte lankar. Forsta
// versionen av det har provet sokte 'aside a' och fann tva traffar (loggan och Layout), sa
// varje klick blev en tyst nullhandling och alla prov foll av fel skal.
// Installningssidan ar hogre an fonstret: auth-security.js lagger till MFA, sessioner,
// sakerhetshandelser och integritet, sa nedladdningsraden hamnar runt y=1075. Att krava att
// den ligger ovanfor vikningen ar fel krav — kravet ar att den GAR ATT NA. Samma miss som
// sidfoten i #172.
//
// Rullningen sker i SAMMA evaluate som matningen. Ett separat anrop foll: auth-security.js
// hann lagga till ytterligare sektioner mellan rullningen och matningen, och raden knuffades
// tillbaka under vikningen.
const RULLA = "el.scrollIntoView({ block: 'center' });";

async function tillVy(page, nyckel) {
  const traffade = await page.evaluate(n => {
    const knapp = document.querySelector(`aside [data-view="${n}"], aside [data-extra="${n}"]`);
    if (!knapp) return false;
    knapp.click();
    return true;
  }, nyckel);
  assert.equal(traffade, true, `kontrollmatning: sidonavigeringen har ingen "${nyckel}"`);
  await page.waitForTimeout(1300);
}

// Klickar utan att navigera. Handelsen skickas med cancelable:true och vi laser
// defaultPrevented efterat — blev den stoppad hade ingen navigering skett, sa vi behover
// aldrig utfora den.
//
// Detta ar en RIKTIG funktion, inte en strang. page.evaluate() med en strang behandlar den som
// ett UTTRYCK och skickar inga argument — forsta versionen returnerade darfor sjalva
// pilfunktionen, som inte gar att serialisera, och `m` blev undefined.
async function klickaUtanNavigering(page, valjare) {
  return page.evaluate(async v => {
    const el = document.querySelector(v);
    if (!el) return { saknas: true };
    const handelse = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(handelse);
    await new Promise(r => setTimeout(r, 500));
    const t = document.querySelector('.toast');
    return { stoppad: handelse.defaultPrevented, besked: t ? t.textContent.trim() : '' };
  }, valjare);
}

// ---- Prov 1 · en permanent vag finns -----------------------------------------------------------
test('Installningar visar en nedladdningsrad for VYRA Desktop', { skip, timeout: 90000 }, async () => {
  const s = await studion();
  try {
    await tillVy(s.page, 'settings');
    const m = await s.page.evaluate(`(() => {
      const el = document.querySelector('[data-desktop-nedladdning]');
      if (!el) return { saknas: true };
      ${RULLA}
      const k = el.querySelector('[data-ladda-desktop]');
      return { text: el.textContent.replace(/\\s+/g, ' ').trim(),
        synlig: (${SYNLIG})(el), handling: !!k, handlingSynlig: k ? (${SYNLIG})(k) : null };
    })()`);
    assert.ok(!m.saknas, '[data-desktop-nedladdning] saknas i Installningar');
    assert.equal(m.synlig.ok, true, `raden syns inte (${m.synlig.skal})`);
    assert.equal(m.handling, true, 'raden ska ha en handling, inte bara text');
    assert.equal(m.handlingSynlig.ok, true, `handlingen syns inte (${m.handlingSynlig.skal})`);
  } finally { await s.stang() }
});

// ---- Prov 2 · den sager vilken version och hur stor den ar -------------------------------------
test('raden anger version och storlek ur det riktiga svaret', { skip, timeout: 90000 }, async () => {
  const s = await studion();
  try {
    await tillVy(s.page, 'settings');
    const text = await s.page.evaluate(() =>
      ((document.querySelector('[data-desktop-nedladdning]') || {}).textContent || '')
        .replace(/\s+/g, ' ').trim());
    assert.match(text, /1\.2\.3/, 'versionen ska komma fran ?meta=1, inte vara hardkodad');
    // 281005462 byte = 268 MiB. En anvandare pa mobilt bredband ska veta det fore klicket.
    assert.match(text, /268\s*MB/, `storleken saknas — "${text.slice(0, 140)}"`);
  } finally { await s.stang() }
});

// ---- Prov 3 · den ritas inte om till dubbletter -------------------------------------------------
test('raden laggs till en gang, inte en per omritning', { skip, timeout: 120000 }, async () => {
  const s = await studion();
  try {
    // MutationObserver-monstret utan idempotensvakt ger en rad per besok — och auth-security.js
    // observerar hela documentElement, sa varje tillagg triggar en ny omgang.
    for (let i = 0; i < 3; i++) {
      await tillVy(s.page, 'settings');
      await tillVy(s.page, 'home');
    }
    await tillVy(s.page, 'settings');
    const antal = await s.page.evaluate(() =>
      document.querySelectorAll('[data-desktop-nedladdning]').length);
    assert.equal(antal, 1, `${antal} nedladdningsrader efter fyra besok i Installningar`);
  } finally { await s.stang() }
});

// ---- Prov 4 · handlingen ar en riktig lank ------------------------------------------------------
test('handlingen ar en lank till /api/downloads/windows', { skip, timeout: 90000 }, async () => {
  const s = await studion();
  try {
    await tillVy(s.page, 'settings');
    const m = await s.page.evaluate(() => {
      const el = document.querySelector('[data-ladda-desktop]');
      if (!el) return { saknas: true };
      return { tagg: el.tagName, href: el.getAttribute('href'),
        behorig: window.VyraDesktop && window.VyraDesktop.kanLaddaNer() };
    });
    assert.ok(!m.saknas, 'handlingen saknas');
    assert.equal(m.tagg, 'A',
      'en <a href> gar att hogerklicka och spara, och fungerar utan JavaScript — en <button> inte');
    assert.equal(m.href, '/api/downloads/windows', 'lanken ska peka pa rutten som svarar 302');
    assert.equal(m.behorig?.ok, true,
      `en verifierad premiumanvandare ska fa ladda ner — fick "${m.behorig?.skal}"`);
  } finally { await s.stang() }
});

// ---- Prov 5 · overifierad e-post far ett besked, inte ra JSON -----------------------------------
test('overifierad anvandare stoppas med ett begripligt besked', { skip, timeout: 90000 }, async () => {
  // Mockens grundlage ar overifierat — precis som ett nyss skapat konto. Rutten hade svarat
  // 403 med JSON rakt i webblasarfonstret.
  const s = await studion({ verifierad: false });
  try {
    await tillVy(s.page, 'settings');
    const behorig = await s.page.evaluate(() =>
      window.VyraDesktop && window.VyraDesktop.kanLaddaNer());
    assert.equal(behorig?.ok, false, 'en overifierad anvandare far inte ladda ner');
    const m = await klickaUtanNavigering(s.page, '[data-ladda-desktop]');
    assert.ok(!m.saknas, 'handlingen saknas');
    assert.equal(m.stoppad, true, 'klicket ska stoppas innan det blir en 403-sida');
    assert.match(m.besked, /[Vv]erifiera/, `beskedet ska saga vad som saknas — fick "${m.besked}"`);
  } finally { await s.stang() }
});

// ---- Prov 6 · utan premium ----------------------------------------------------------------------
test('utan premium stoppas nedladdningen med skalet', { skip, timeout: 90000 }, async () => {
  const s = await studion({ fel: { 'GET /api/workspaces/:ws/billing': { status: 200,
    kropp: { ok: true, plan: 'free', subscription: null } } } });
  try {
    // Grinden ligger over Studion i det har laget, sa raden i Installningar gar inte att na.
    // Behorighetsbeslutet gar anda att mata — det ar det som ska stamma.
    const behorig = await s.page.evaluate(() =>
      window.VyraDesktop && window.VyraDesktop.kanLaddaNer());
    assert.equal(behorig?.ok, false, 'utan premium far man inte ladda ner');
    assert.match(String(behorig?.skal), /[Pp]remium/,
      `skalet ska namna premium — fick "${behorig?.skal}"`);
  } finally { await s.stang() }
});

// ---- Prov 7 · nar nedladdningen inte ar publicerad ----------------------------------------------
test('opublicerad nedladdning sags rakt ut och handlingen ar inaktiv', { skip, timeout: 90000 }, async () => {
  const s = await studion({ fel: { 'GET /api/downloads/windows': { status: 503,
    kropp: { ok: false, error: 'Desktopversionen är inte publicerad ännu' } } } });
  try {
    await tillVy(s.page, 'settings');
    const m = await s.page.evaluate(`(() => {
      const el = document.querySelector('[data-desktop-nedladdning]');
      if (!el) return { saknas: true };
      ${RULLA}
      const k = el.querySelector('[data-ladda-desktop]');
      return { text: el.textContent.replace(/\\s+/g, ' ').trim(), synlig: (${SYNLIG})(el),
        inaktiv: k ? k.getAttribute('aria-disabled') === 'true' : null };
    })()`);
    assert.ok(!m.saknas, 'raden ska finnas aven nar metadata inte gar att hamta');
    assert.equal(m.synlig.ok, true, `raden syns inte (${m.synlig.skal})`);
    assert.equal(m.inaktiv, true,
      'en handling som inte kan gora nagot ska inte se ut som en som kan');
    assert.match(m.text, /publiceras|inte publicerad/i,
      `raden ska saga varfor — "${m.text.slice(0, 140)}"`);
  } finally { await s.stang() }
});

// ---- Prov 8 · guiden lovar Desktop och maste kunna halla loftet ---------------------------------
test('guidens OBS-kort bar en riktig handling, inte bara ordet Desktop', { skip, timeout: 90000 }, async () => {
  const s = await studion();
  try {
    await tillVy(s.page, 'guide');
    const m = await s.page.evaluate(`(() => {
      const kort = [...document.querySelectorAll('#view .guide-feature')]
        .find(el => /OBS-koppling/.test(el.textContent));
      if (!kort) return { saknas: true };
      const h = kort.querySelector('[data-ladda-desktop]');
      // Guiden ar en lang sida — kortet ligger langt ner. Kravet ar att handlingen gar att na,
      // inte att den rakar ligga ovanfor vikningen.
      if (h) h.scrollIntoView({ block: 'center' });
      const s = h && getComputedStyle(h);
      return { handling: !!h, synlig: h ? (${SYNLIG})(h) : null,
        bakgrund: s && s.backgroundColor, display: s && s.display };
    })()`);
    assert.ok(!m.saknas, 'kontrollmatning: OBS-kortet ska finnas i guiden');
    assert.equal(m.handling, true,
      'kortet sager "Kraver VYRA Desktop" — da ska det ga att skaffa den harifran');
    assert.equal(m.synlig.ok, true, `handlingen syns inte (${m.synlig.skal})`);
    // Synlig racker inte. Forsta versionen av regeln hamnade i styles.css — landningssidans
    // stilmall, som studio.html inte laddar — och lanken renderades som en naken blaa
    // webblasarlank tvars over platsraden. Provet var gront hela tiden, for SYNLIG mater
    // geometri, inte utseende. Samma sort som §8: syns ar inte samma sak som ser ratt ut.
    assert.notEqual(m.bakgrund, 'rgba(0, 0, 0, 0)',
      'handlingen ar ostylad — bor regeln i en stilmall som studio.html faktiskt laddar?');
    assert.notEqual(m.display, 'inline',
      'en handling ska vara en knappyta, inte inline-text mitt i kortet');
  } finally { await s.stang() }
});

// ---- Prov 9 · mekanismen tal att vyn ritas om ---------------------------------------------------
test('handlingen fungerar aven pa noder som skapats efter sidladdningen', { skip, timeout: 90000 }, async () => {
  // Hela orsaken till att download-client.js inte gick att ateranvanda: den binder
  // querySelectorAll('.desktop-download') EN gang i sin IIFE. En delegerad lyssnare maste
  // klara en nod som skapats efter det — annars kan de tomma tillstanden aldrig bara
  // handlingen, och det ar hela poangen med nasta PR.
  const s = await studion({ verifierad: false });
  try {
    const m = await s.page.evaluate(async () => {
      const ny = document.createElement('a');
      ny.setAttribute('data-ladda-desktop', '');
      ny.setAttribute('href', '/api/downloads/windows');
      ny.textContent = 'Ladda ner';
      document.body.append(ny);
      const handelse = new MouseEvent('click', { bubbles: true, cancelable: true });
      ny.dispatchEvent(handelse);
      await new Promise(r => setTimeout(r, 500));
      const t = document.querySelector('.toast');
      ny.remove();
      return { stoppad: handelse.defaultPrevented, besked: t ? t.textContent.trim() : '' };
    });
    assert.equal(m.stoppad, true,
      'en nod som skapats efter laddningen maste ocksa na lyssnaren');
    assert.match(m.besked, /[Vv]erifiera/, `beskedet ska na fram — fick "${m.besked}"`);
  } finally { await s.stang() }
});

// ---- Prov 10 · inget av det har skriver till sessionen ------------------------------------------
test('nedladdningsvagen ror inte skrivmonopolet', { skip, timeout: 90000 }, async () => {
  const s = await studion({ verifierad: false });
  try {
    await tillVy(s.page, 'settings');
    const m = await s.page.evaluate(async () => {
      let skrivningar = 0;
      const inre = window.VyraSessionState.writeActive;
      window.VyraSessionState.writeActive = function () {
        skrivningar++; return inre.apply(this, arguments);
      };
      const el = document.querySelector('[data-ladda-desktop]');
      el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 500));
      window.VyraSessionState.writeActive = inre;
      return { skrivningar, fanns: !!el };
    });
    assert.equal(m.fanns, true, 'kontrollmatning: handlingen ska ha funnits och klickats');
    assert.equal(m.skrivningar, 0,
      'att ladda ner en app ar ingen layoutandring och far inte bli ett angra-steg');
  } finally { await s.stang() }
});

// ---- Prov 11 · metadata hamtas en gang ----------------------------------------------------------
test('metadata hamtas en gang och ateranvands', { skip, timeout: 120000 }, async () => {
  const logg = [];
  const s = await studion({ logg });
  try {
    for (let i = 0; i < 3; i++) { await tillVy(s.page, 'settings'); await tillVy(s.page, 'guide') }
    const anrop = logg.filter(r => /\/api\/downloads\/windows/.test(r.sokvag || r.url || r.path || ''));
    assert.ok(anrop.length >= 1, 'kontrollmatning: metadata ska ha hamtats minst en gang');
    assert.ok(anrop.length <= 2,
      `${anrop.length} anrop till nedladdningsmetadata — versionen andras inte mellan vybyten`);
  } finally { await s.stang() }
});
