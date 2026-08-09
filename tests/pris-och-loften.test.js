'use strict';
// Vad Vyra lovar om pengar (Etapp 6C-mikro).
//
// UPPMATT 2026-08-09, tre motsagelser i produktionskoden:
//
//   1. TVA PRISER I TVA VALUTOR. index.html sa 150 kr/man; entitlement-gate.js, billing-client.js,
//      terms.html och server/notifications.js sager alla 15 USD/manad. server/billing.js kraver
//      dessutom att Stripe-priset ar "exakt 15 USD per manad" — 150 kr var alltsa inte det som
//      debiterades.
//
//   2. GUIDEN LOVADE EN GRATISNIVA SOM INTE FINNS. "Grundfunktionerna ar gratis." Uppmatt i
//      server/billing.js: PLANS.free = { overlays: 0, widgets: 0, mediaBytes: 0, members: 1 }.
//      Noll overlays och noll widgetar — det finns ingenting att anvanda gratis.
//
//   3. TRE TVETYDIGA "GRATIS". Molnrosterna beskrivs som "helt gratis"; de ingar utan extra
//      kostnad I PREMIUM, vilket ar nagot annat nar ingen gratisniva finns.
//
// Beslut: 15 USD/manad ar enda priset. 3 dagar gratis provperiod. Ingen gratisniva.
//
// Vakten ar ett KALLKODSPROV med flit: priset star i statisk markup och i strangar, och det ar
// dar nasta felaktiga siffra kommer att skrivas in.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROT = path.join(__dirname, '..');

// Filer anvandaren laser text ur. Serverns notifications.js ingar — mejlen ar ocksa loften.
const ANVANDARVANDA = [
  'index.html', 'terms.html', 'privacy.html', 'status.html',
  'guide.js', 'entitlement-gate.js', 'billing-client.js', 'tts-chat.js',
  'download-client.js', 'standalone-links.js',
  path.join('server', 'notifications.js'),
];

const las = f => { try { return fs.readFileSync(path.join(ROT, f), 'utf8') } catch (_) { return null } };
const utanKommentarer = s => s.replace(/^\s*(\/\/|\*).*$/gm, '');

// ---- Prov 1 · ett pris, en valuta -------------------------------------------------------------
test('inget pris anges i kronor', () => {
  // "60 sek" ar sekunder, inte valuta — mönstret kraver en siffra tatt fore kr/SEK/kronor.
  const SEK = /\d[\d\s]{0,6}(kr\b|SEK\b|kronor\b)|\bkr\s*\/\s*(mån|månad)/gi;
  const brott = [];
  for (const fil of ANVANDARVANDA) {
    const s = las(fil);
    if (s === null) continue;
    const rader = utanKommentarer(s).split('\n');
    rader.forEach((rad, n) => {
      SEK.lastIndex = 0;
      let m;
      while ((m = SEK.exec(rad))) {
        brott.push(`${fil}:${n + 1} — "${rad.slice(Math.max(0, m.index - 40), m.index + 60).trim()}"`);
      }
    });
  }
  assert.deepEqual(brott, [],
    'Priset ar 15 USD per manad, och server/billing.js kraver att Stripe-priset ar exakt det. ' +
    'Ett kronpris i UI:t ar darfor inte vad kunden debiteras:\n  ' + brott.join('\n  '));
});

// ---- Prov 2 · priset star dar det ska ----------------------------------------------------------
test('landningssidan anger 15 USD per manad', () => {
  const s = las('index.html');
  assert.ok(s, 'kontrollmatning: index.html ska ga att lasa');
  assert.match(s, /15\s*USD/,
    'landningssidan namner inget USD-pris — kunden ska se samma siffra som Stripe debiterar');
  assert.match(s, /3 dagar gratis provperiod, därefter 15 USD\/månad/,
    'det finstilta under priskortet ska ange provperiod OCH loppris i samma mening');
});

// ---- Prov 3 · guiden lovar ingen gratisniva ----------------------------------------------------
test('guidens prisfraga beskriver provperiod, inte en gratisniva', () => {
  const s = las('guide.js');
  assert.ok(s, 'kontrollmatning: guide.js ska ga att lasa');
  assert.doesNotMatch(s, /Grundfunktionerna är gratis/,
    'PLANS.free ger noll overlays och noll widgetar — det finns inga gratis grundfunktioner');
  const i = s.indexOf('Kostar VYRA');
  assert.ok(i > 0, 'prisfragan ska finnas kvar i FAQ:n');
  const svar = s.slice(i, i + 320);
  assert.match(svar, /15 USD/, `svaret ska ange priset: ${svar.slice(0, 160)}`);
  assert.match(svar, /3 dagar/, `svaret ska ange provperioden: ${svar.slice(0, 160)}`);
});

// ---- Prov 4 · tvetydiga gratis ar kvalificerade ------------------------------------------------
test('molnrosterna beskrivs som inkluderade, inte som gratis', () => {
  const KVALIFICERAT = /ingår i Premium|inom Premium|inkluderat i planen|utan extra kostnad/;
  const brott = [];
  for (const fil of ['guide.js', 'tts-chat.js']) {
    const s = las(fil);
    if (s === null) continue;
    utanKommentarer(s).split('\n').forEach((rad, n) => {
      if (!/molnröst|Molnröster|molnröster/i.test(rad)) return;
      // Bara rader som faktiskt lovar "gratis" om rosterna.
      if (!/gratis/i.test(rad)) return;
      if (KVALIFICERAT.test(rad)) return;
      brott.push(`${fil}:${n + 1} — "${rad.trim().slice(0, 120)}"`);
    });
  }
  assert.deepEqual(brott, [],
    'Rosterna kostar inget EXTRA, men de kraver Premium som allt annat. Utan kvalificering laser ' +
    'det som en gratisniva:\n  ' + brott.join('\n  '));
});
