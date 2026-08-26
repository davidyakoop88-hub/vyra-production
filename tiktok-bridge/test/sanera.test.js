'use strict';
// SANERING AV FELTEXT — prov för att hemligheter aldrig når en logg.
//
// Två verkliga fynd i den här koden ligger bakom:
//   1. `err?.message || err` skrev ut HELA felobjektet när message saknades. Uppmätt i produktion
//      2026-08-26: gåvokatalogens SignatureMissingTokensError hade inget message, så bridge.js:501
//      loggade objektet med stackspår och alla fält.
//   2. `bridge.js` loggade PROXY_LIST-adressen ORDAGRANT vid varje misslyckat anslutningsförsök.
//      Formatet dokumenteras i proxy-manager.js:6 som "http://user:pass@ip:port" — alltså
//      inloggningsuppgifter rakt in i Railways logg, en gång per försök.
//
// Alla hemligheter nedan är påhittade.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { sanera, saneraUrl, TAK } = require('../sanera');

const HEMLIGT = {
  losenord: 'sup3rhemligt_provlosen',
  token: 'tok_provvarde_0123456789abcdef',
  proxyAnv: 'proxyanvandare'
};

// ---- ALDRIG HELA OBJEKT -----------------------------------------------------------------------

test('ett objekt utan message serialiseras ALDRIG — bara typnamnet', () => {
  class SignatureMissingTokensError extends Error {}
  const fel = new SignatureMissingTokensError();
  fel.message = '';                                   // precis som det verkliga fallet
  fel.info = 'Failed to fetch room gifts.';
  fel.requestId = 'req-provvarde';
  fel.headers = { authorization: `Bearer ${HEMLIGT.token}` };

  const ut = sanera(fel);
  assert.ok(!ut.includes(HEMLIGT.token), 'headers får aldrig läcka');
  assert.ok(!ut.includes('req-provvarde'), 'interna id:n får inte med');
  assert.ok(!ut.includes('Failed to fetch room gifts'), 'okända fält serialiseras inte');
  assert.equal(ut, 'SignatureMissingTokensError', 'typnamnet räcker som felsökningsvärde');
});

test('ett rent objekt utan message ger konstruktornamnet, inte innehållet', () => {
  const ut = sanera({ info: 'x', reason: 'Empty Payload', secretField: HEMLIGT.token });
  assert.ok(!ut.includes(HEMLIGT.token));
  assert.ok(!ut.includes('Empty Payload'));
  assert.equal(ut, '<Object utan message>');
});

// ---- UPPKOPPLINGSSTRÄNGAR ---------------------------------------------------------------------

test('user:pass@host maskeras i vilken URL som helst', () => {
  for (const url of [
    `postgres://vyra:${HEMLIGT.losenord}@db.internal:5432/vyra`,
    `redis://default:${HEMLIGT.losenord}@redis.internal:6379`,
    `http://${HEMLIGT.proxyAnv}:${HEMLIGT.losenord}@10.0.0.1:8080`
  ]) {
    const ut = sanera(new Error(`kunde inte ansluta: ${url}`));
    assert.ok(!ut.includes(HEMLIGT.losenord), `lösenordet läckte ur ${url.split(':')[0]}`);
    assert.ok(ut.includes('<uppkoppling>@'), 'maskeringen ska synas');
  }
});

test('password=, token: och apikey= i fritext maskeras', () => {
  for (const rad of [
    `password=${HEMLIGT.losenord}`,
    `token: ${HEMLIGT.token}`,
    `api_key=${HEMLIGT.token}`,
    `secret = ${HEMLIGT.losenord}`
  ]) {
    const ut = sanera(new Error(rad));
    assert.ok(!ut.includes(HEMLIGT.losenord) && !ut.includes(HEMLIGT.token), `läckte i "${rad}"`);
    assert.ok(ut.includes('<dolt>'));
  }
});

// ---- PROXYADRESSEN ----------------------------------------------------------------------------

test('saneraUrl behåller värd och port men slänger uppgifterna', () => {
  const ut = saneraUrl(`http://${HEMLIGT.proxyAnv}:${HEMLIGT.losenord}@10.0.0.1:8080`);
  assert.ok(!ut.includes(HEMLIGT.losenord), 'lösenordet får aldrig loggas');
  assert.ok(!ut.includes(HEMLIGT.proxyAnv), 'användarnamnet heller inte');
  assert.equal(ut, 'http://<uppgifter>@10.0.0.1:8080');
  // KONTROLLMÄTNING: värd och port är kvar — det är felsökningsvärdet.
  assert.ok(ut.includes('10.0.0.1:8080'), 'utan värden är raden värdelös');
});

test('en proxy UTAN uppgifter lämnas orörd', () => {
  assert.equal(saneraUrl('http://10.0.0.1:8080'), 'http://10.0.0.1:8080');
  assert.equal(saneraUrl(''), '');
  assert.equal(saneraUrl(null), '');
});

// ---- ÖVRIGT -----------------------------------------------------------------------------------

test('vanliga felmeddelanden går fram oförändrade', () => {
  assert.equal(sanera(new Error('The requested user isn\'t online :(')),
    'The requested user isn\'t online :(');
  assert.equal(sanera('en ren sträng'), 'en ren sträng');
  assert.equal(sanera(null), 'okänt fel');
  assert.equal(sanera(undefined), 'okänt fel');
});

test('längden är begränsad', () => {
  assert.equal(sanera(new Error('x'.repeat(5000))).length, TAK);
});

// ---- KÄLLKODSVAKT: inga råa fel kvar i bryggan -------------------------------------------------

test('KALLKODSVAKT: inget loggar raa felobjekt eller oredigerad proxy', () => {
  const dir = path.join(__dirname, '..');
  const filer = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  assert.ok(filer.length >= 5, 'vakten ska läsa bryggans källfiler');

  // TA BORT KOMMENTARER FORE SOKNING. Tredje gangen strangankarfallan slog till i det har
  // arbetet: vakten fallde sig sjalv pa sin egen forklarande prosa. Att jaga smartare monster
  // loser inte grundproblemet — koden ar det enda som ska vaktas.
  const utanKommentarer = kall => kall
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(r => r.replace(/\/\/.*$/, '')).join('\n');

  for (const fil of filer) {
    const kall = utanKommentarer(fs.readFileSync(path.join(dir, fil), 'utf8'));
    // `err?.message || err` och `err.message || err` — fallbacken som serialiserar objektet.
    assert.ok(!/\?\.message\s*\|\|\s*err\b/.test(kall),
      `${fil} har kvar fallbacken som loggar hela felobjektet`);
    // Proxyadressen får aldrig interpoleras rå in i en loggrad.
    assert.ok(!/\$\{currentProxy\}/.test(kall),
      `${fil} interpolerar currentProxy oredigerat — använd saneraUrl()`);
  }

  // KONTROLLMÄTNING: mönstren KAN träffa, annars vaktar de ingenting.
  assert.ok(/\?\.message\s*\|\|\s*err\b/.test('console.error(x, err?.message || err);'));
  assert.ok(/\$\{currentProxy\}/.test('`via ${currentProxy}`'));
});
