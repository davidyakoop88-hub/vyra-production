'use strict';
// GRANSKNINGEN 2026-10-17, steg 2: inloggningskortet på startsidan (index.html + landing-login.js).
//
// Sex fynd om kortets beteende, ett prov per fynd. Alla skrevs RÖDA FÖRST mot main.
//
//   F17  flikarna sa "Logga in" för skärmläsaren fast Skapa konto var valt (aria-selected stod still)
//   F18  rollen tab utan flikens tangentbord — piltangenterna gjorde ingenting
//   F19  lösenordets golv (12 tecken) syntes först när det redan blivit fel
//   F20  Skapa konto → Glömt lösenord? → "Tillbaka till inloggningen" landade i Skapa konto
//   F21  villkor och integritet låg bara i sidfoten, långt från Skapa konto
//   F22  tvåstegsrutan saknade väg tillbaka, egen väg för reservkod och hjälp vid förlorad app
//
// Layoutfynden (F28 klickytor, F29 finstilt, F30 hero mot formulär) kräver en riktig motor och bor
// i tests/browser/framsida-konto-yta.browser.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Kortet laddas mot en attrapp-fetch. Inga riktiga konton, ingen server.
function startsidan({ svar = {} } = {}) {
  const html = las('index.html').replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://vyra.test/' });
  const w = dom.window;
  const anrop = [];
  w.fetch = async (url, opt) => {
    anrop.push({ url: String(url), opt });
    const d = svar[String(url)] || { ok: true };
    return { ok: d.ok !== false, json: async () => d };
  };
  w.matchMedia = () => ({ matches: true });   // reduced motion: ingen dörr, ingen väntan
  w.eval(las('landing-login.js'));
  return { w, d: w.document, anrop };
}
const synlig = el => {
  for (let e = el; e; e = e.parentElement) if (e.hidden) return false;
  return true;
};
const flik = (d, namn) => d.querySelector(`[data-login-flik="${namn}"]`);
const tryck = (w, el, key) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const vanta = () => new Promise(r => setTimeout(r, 0));

test('F17 · den valda fliken är också vald för skärmläsaren, och panelen pekar på den', () => {
  const { d } = startsidan();
  const login = flik(d, 'login'), reg = flik(d, 'register');
  const panel = d.querySelector('[data-login] form');
  assert.equal(panel.getAttribute('role'), 'tabpanel', 'formuläret ska vara flikarnas tabpanel');
  for (const f of [login, reg]) {
    assert.ok(f.id, 'varje flik behöver ett id som panelen kan peka på');
    assert.equal(f.getAttribute('aria-controls'), panel.id, `${f.textContent} styr inte panelen`);
  }
  reg.click();
  assert.equal(reg.getAttribute('aria-selected'), 'true',
    'Skapa konto är vald på skärmen men aria-selected säger fortfarande false');
  assert.equal(login.getAttribute('aria-selected'), 'false', 'Logga in säger fortfarande att den är vald');
  assert.equal(panel.getAttribute('aria-labelledby'), reg.id, 'panelen ska namnges av den valda fliken');
  assert.equal(reg.tabIndex, 0, 'den valda fliken ska vara den som nås med Tab');
  assert.equal(login.tabIndex, -1, 'den ovalda fliken ska nås med piltangenterna, inte med Tab');
  login.click();
  assert.equal(login.getAttribute('aria-selected'), 'true');
  assert.equal(reg.getAttribute('aria-selected'), 'false');
  assert.equal(panel.getAttribute('aria-labelledby'), login.id);
});

test('F18 · piltangenter, Home och End flyttar fokus och väljer flik', () => {
  const { w, d } = startsidan();
  const login = flik(d, 'login'), reg = flik(d, 'register');
  const namn = d.querySelector('[data-login-namn]');
  login.focus();
  tryck(w, login, 'ArrowRight');
  assert.equal(d.activeElement, reg, 'ArrowRight från Logga in ska flytta fokus till Skapa konto');
  assert.equal(reg.getAttribute('aria-selected'), 'true', 'och välja den');
  assert.ok(synlig(namn), 'formuläret ska byta till registrering (visningsnamnet syns)');
  tryck(w, reg, 'ArrowRight');
  assert.equal(d.activeElement, login, 'ArrowRight från sista fliken går runt till den första');
  tryck(w, login, 'ArrowLeft');
  assert.equal(d.activeElement, reg, 'ArrowLeft från första fliken går runt till den sista');
  tryck(w, reg, 'Home');
  assert.equal(d.activeElement, login, 'Home ska ge första fliken');
  assert.equal(login.getAttribute('aria-selected'), 'true');
  assert.ok(!synlig(namn), 'tillbaka i inloggning ska visningsnamnet döljas');
  tryck(w, login, 'End');
  assert.equal(d.activeElement, reg, 'End ska ge sista fliken');
});

test('F19 · lösenordskravet syns under fältet före inmatning, och lösenordet kan visas', () => {
  const { d } = startsidan();
  flik(d, 'register').click();
  const falt = d.querySelector('#loginPassword');
  const ids = (falt.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  const hjalp = ids.map(id => d.getElementById(id)).filter(Boolean);
  assert.ok(hjalp.length, 'lösenordsfältet saknar aria-describedby till en hjälptext');
  const krav = hjalp.find(el => /12 tecken/.test(el.textContent));
  assert.ok(krav, `ingen av hjälptexterna (${ids.join(', ')}) säger "12 tecken"`);
  assert.ok(synlig(krav), 'kravet ska synas i Skapa konto INNAN något skrivits');
  assert.equal(falt.value, '', 'kontrollmätning: inget är inmatat');
  // Visa/dölj lösenord
  const visa = d.querySelector('[data-login-visa]');
  assert.ok(visa, 'knappen för att visa lösenordet saknas');
  assert.equal(visa.getAttribute('aria-controls'), 'loginPassword');
  assert.equal(visa.getAttribute('aria-pressed'), 'false');
  visa.click();
  assert.equal(falt.type, 'text', 'Visa ska göra lösenordet läsbart');
  assert.equal(visa.getAttribute('aria-pressed'), 'true');
  visa.click();
  assert.equal(falt.type, 'password', 'ett andra tryck döljer det igen');
});

test('F20 · Tillbaka till inloggningen ger inloggning — oavsett ingång', () => {
  for (const ingang of ['register', 'login']) {
    const { d } = startsidan();
    flik(d, ingang).click();
    d.querySelector('[data-login-glomt]').click();
    assert.ok(synlig(d.querySelector('[data-login-forgot]')), 'kontrollmätning: glömt-steget visas');
    d.querySelector('[data-login-tillbaka]').click();
    const form = d.querySelector('[data-login] form');
    assert.ok(synlig(form), 'formuläret ska visas igen');
    assert.equal(flik(d, 'login').getAttribute('aria-selected'), 'true',
      `ingång ${ingang}: knappen lovar inloggningen men en annan flik är vald`);
    assert.ok(flik(d, 'login').classList.contains('active'), `ingång ${ingang}: Logga in ska vara aktiv`);
    assert.ok(!synlig(d.querySelector('[data-login-namn]')), `ingång ${ingang}: visningsnamnet hör till registreringen`);
    assert.match(form.querySelector('button[type="submit"]').textContent, /Logga in/,
      `ingång ${ingang}: knappen ska säga Logga in`);
  }
});

test('F21 · villkor och integritet står intill Skapa konto, inte bara i sidfoten', () => {
  const { d } = startsidan();
  flik(d, 'register').click();
  const form = d.querySelector('[data-login] form');
  const knapp = form.querySelector('button[type="submit"]');
  const rad = form.querySelector('[data-login-villkor]');
  assert.ok(rad, 'raden [data-login-villkor] saknas i registreringsformuläret');
  assert.ok(synlig(rad), 'raden ska synas i läget Skapa konto');
  const lankar = [...rad.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
  assert.ok(lankar.includes('terms.html'), `villkorslänken saknas (hittade ${lankar.join(', ')})`);
  assert.ok(lankar.includes('privacy.html'), `integritetslänken saknas (hittade ${lankar.join(', ')})`);
  const syskon = [knapp.previousElementSibling, knapp.nextElementSibling, knapp.previousElementSibling?.previousElementSibling];
  assert.ok(syskon.includes(rad), 'raden ska stå direkt intill registreringsknappen');
  assert.match(rad.textContent, /Skapa konto/, 'raden ska säga vad ett klick på knappen innebär');
  flik(d, 'login').click();
  assert.ok(!synlig(rad), 'en inloggning godkänner inga villkor — raden hör till registreringen');
});

test('F22 · tvåsteg: väg tillbaka, egen väg för reservkod och hjälp vid förlorad app', async () => {
  const { w, d, anrop } = startsidan({ svar: { '/api/auth/login': { ok: true, csrfToken: 'prov', mfaRequired: true } } });
  d.querySelector('#loginEmail').value = 'prov@example.test';
  d.querySelector('#loginPassword').value = 'provlosenord123';
  d.querySelector('[data-login] form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await vanta(); await vanta();
  const mfa = d.querySelector('[data-login-mfa]');
  assert.ok(synlig(mfa), 'kontrollmätning: tvåstegsrutan visas');
  assert.equal(w.sessionStorage.getItem('vyra-csrf'), 'prov');

  // Egen väg för reservkod
  const reserv = mfa.querySelector('[data-login-reserv]');
  assert.ok(reserv && synlig(reserv), 'knappen för återställningskod saknas');
  const kod = d.querySelector('#loginMfaCode');
  const etikett = kod.closest('label');
  reserv.click();
  assert.match(etikett.textContent, /Återställningskod/i, 'fältet ska byta till återställningskod');
  assert.notEqual(kod.getAttribute('inputmode'), 'numeric', 'en återställningskod har bokstäver — inte sifferbord');
  assert.ok(d.activeElement === kod, 'fokus ska stå i kodfältet efter bytet');

  // Hjälp vid förlorad autentiseringsapp
  const hjalp = mfa.querySelector('[data-login-mfa-hjalp]');
  assert.ok(hjalp && synlig(hjalp), 'hjälpen för förlorad åtkomst saknas');
  assert.ok(hjalp.querySelector('a[href^="mailto:support@vyralive.app"]'), 'hjälpen ska leda till supporten');

  // Väg tillbaka
  const avbryt = mfa.querySelector('[data-login-mfa-avbryt]');
  assert.ok(avbryt && synlig(avbryt), 'Avbryt/Byt konto saknas i tvåstegsrutan');
  avbryt.click();
  await vanta(); await vanta();
  assert.ok(anrop.some(a => a.url === '/api/auth/logout'),
    'den halva sessionen ska stängas med /api/auth/logout — annars ligger den kvar på servern');
  assert.equal(w.sessionStorage.getItem('vyra-csrf'), null, 'CSRF-tokenen hör till den avbrutna sessionen');
  assert.ok(!synlig(mfa), 'tvåstegsrutan ska stängas');
  assert.ok(synlig(d.querySelector('[data-login] form')), 'inloggningsformuläret ska visas igen');
  assert.equal(d.querySelector('#loginPassword').value, '', 'lösenordet ska inte ligga kvar');
  assert.equal(kod.value, '', 'koden ska inte ligga kvar');
  assert.equal(d.activeElement, d.querySelector('#loginEmail'), 'fokus ska stå i e-postfältet');
});

test('cachebustarna höjdes med filerna, i formatet datum-siffra', () => {
  const index = las('index.html');
  for (const fil of ['styles.css', 'landing-login.js']) {
    const v = (index.match(new RegExp(fil.replace('.', '\\.') + '\\?v=([^"]+)"')) || [])[1];
    assert.ok(v, `index.html laddar ${fil}`);
    assert.notEqual(v, '20261017-epost', `${fil} bär fortfarande versionen från före granskningen`);
    assert.match(v, /^\d{8}-\d+$/, `cachebusten för ${fil} ska vara datum-siffra: ${v}`);
  }
});
