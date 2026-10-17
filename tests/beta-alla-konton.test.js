'use strict';
// BETAN GÄLLER ALLA NYA KONTON — INTE BARA DE FÖRSTA 30.
//
// #579 gav de första 30 registrerade kontona 30 dagars gratis Premium (provider='comp'). Konto
// nummer 31 fick ingenting, hamnade på plan 'free' och möttes av betalväggen i entitlement-gate.js
// i stället för studion. Beslut av David 2026-10-17: "alla som skapar konto nu är beta, de ska få
// gratis 30 dagar". Taket tas därför bort.
//
// Det som INTE får ändras: ON CONFLICT DO NOTHING (en betald prenumeration skrivs aldrig över),
// cancel_at_period_end=true och de 30 dagarna (entitlement() flippar själv till free efteråt).
//
// Ett källtextprov med flit: registreringen kräver Postgres, och server/test-sviten hoppar över de
// proven lokalt. Vakten läser själva registreringsrutten, inte hela filen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const KALLA = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
const RUTT = (() => {
  const start = KALLA.indexOf("p==='/api/auth/register'");
  assert.notEqual(start, -1, 'hittade inte registreringsrutten i server/index.js');
  return KALLA.slice(start, KALLA.indexOf('\n', start));
})();

test('beta: registreringen ger comp-Premium i 30 dagar', () => {
  assert.match(RUTT, /INSERT INTO subscriptions\([^)]*\) VALUES\(\$1,'premium','active','comp',true,now\(\)\+interval '30 days'\)/,
    'nya konton får inte längre 30 dagars gratis Premium');
  assert.match(RUTT, /ON CONFLICT \(workspace_id\) DO NOTHING/, 'en befintlig prenumeration får aldrig skrivas över');
});

test('beta: inget tak — konto nummer 31 får samma 30 dagar som konto nummer 1', () => {
  assert.doesNotMatch(RUTT, /count\(\*\)[^;]*provider='comp'/,
    'registreringen räknar fortfarande comp-rader — då stängs betan efter ett tak');
  assert.doesNotMatch(RUTT, /\.n\s*<\s*\d+/, 'det finns fortfarande en gräns på antalet beta-konton');
});

test('beta: KONTROLLMÄTNING — fönstret är registreringsrutten', () => {
  assert.match(RUTT, /INSERT INTO users/);
  assert.ok(RUTT.length < KALLA.length / 10, 'fönstret omfattar för mycket av filen för att bevisa något');
});
