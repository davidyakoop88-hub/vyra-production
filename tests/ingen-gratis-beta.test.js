'use strict';
// INGEN GRATIS BETA FÖR NYA KONTON (David 2026-11-08: "vi ska inte använda beta gratis konto till folk").
//
// Historik: #579 gav de första 30 registrerade 30 dagars gratis Premium (provider='comp'), och från
// 2026-10-17 fick varje nytt konto det (tests/beta-alla-konton.test.js, ersatt av den här filen).
// Nu börjar ett nytt konto på gratisplanen och möter betalväggen, med PayPals provperiod.
//
// Befintliga comp-rader rörs inte: de har cancel_at_period_end=true och billing.js entitlement()
// flippar dem själv till free när de 30 dagarna gått. Ingen migrering tar bort någons Premium.
//
// Källtextprov med flit: registreringen kräver Postgres, och server/test-sviten hoppar över de proven
// lokalt. Vakten läser själva registreringsrutten, inte hela filen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const KALLA = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
const RUTT = (() => {
  const start = KALLA.indexOf("p==='/api/auth/register'");
  assert.notEqual(start, -1, 'hittade inte registreringsrutten i server/index.js');
  return KALLA.slice(start, KALLA.indexOf('\n', start));
})();

test('registreringen skapar ingen prenumeration — ingen gratis Premium', () => {
  assert.doesNotMatch(RUTT, /INSERT INTO subscriptions/i, 'registreringen ger fortfarande ett abonnemang');
  assert.doesNotMatch(RUTT, /'comp'/, "registreringen skriver fortfarande provider='comp'");
});

test('ingen comp-rad tas bort i efterhand — befintliga beta-konton löper ut av sig själva', () => {
  assert.doesNotMatch(KALLA, /DELETE FROM subscriptions[^;]*comp/i);
  assert.doesNotMatch(KALLA, /UPDATE subscriptions SET[^;]*WHERE[^;]*provider='comp'/i);
  const billing = fs.readFileSync(path.join(__dirname, '..', 'server', 'billing.js'), 'utf8');
  assert.match(billing, /cancel_at_period_end&&sub\.current_period_end/, 'entitlement() flippar inte längre utgångna perioder till free');
});

test('KONTROLLMÄTNING — fönstret är registreringsrutten', () => {
  assert.match(RUTT, /INSERT INTO users/);
  assert.match(RUTT, /INSERT INTO workspace_members/);
  assert.ok(RUTT.length < KALLA.length / 10, 'fönstret omfattar för mycket av filen för att bevisa något');
});
