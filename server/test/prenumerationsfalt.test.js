'use strict';
// Vad vi laser ur en Stripe-prenumeration innan den skrivs till subscriptions-tabellen.
//
// UPPMATT UR STRIPES EGEN OPENAPI-SPEC 2026-08-09 (8 MB, den de genererar sina bibliotek ur):
//
//   subscription.current_period_end     FINNS INTE LANGRE pa objektet
//   subscription_item.current_period_end "The end time of this subscription item's current
//                                        billing period."
//   subscription.trial_end               "If the subscription has a trial, the end of that trial."
//
// Foljden for en nedrakning under provperioden: periodslutet ar RATT svar, men bara via en
// outtalad slutledning (trialen ar den aktuella faktureringsperioden). trial_end sager det
// uttryckligen — och det faltet kastades bort, bade i tabellen och i /billing-svaret.
//
// Dessutom: fallbacken slutade pa `|| 0`, vilket blir to_timestamp(0) = 1 januari 1970. En
// nedrakning byggd pa det hade visat cirka -20 500 dagar i stallet for att saga "vi vet inte".
// Kolumnen ar timestamptz och tillater NULL. NULL ar det arliga vardet.
//
// Mappningen gick inte att prova alls forut: den lag inbakad i webhook(), som kraver en databas
// och en signerad Stripe-nyttolast. Den ar utbruten till en REN funktion — samma varde, matbart.
//
// ROTT NU: prenumerationsfalt() finns inte.
const test = require('node:test'), assert = require('node:assert/strict');
const billing = require('../billing');

// En prenumeration som Stripe skickar den i DAG: inget current_period_end pa objektet.
const NUTIDA_TRIAL = {
  id: 'sub_1',
  status: 'trialing',
  trial_start: 1754700000,
  trial_end: 1754959200,
  metadata: { workspaceId: 'ws-1' },
  items: { data: [{ price: { id: 'price_x' }, current_period_end: 1754959200 }] },
};

// Som Stripe skickade den forr, och som aldre API-versioner fortfarande kan gora.
const GAMMAL_AKTIV = {
  id: 'sub_2',
  status: 'active',
  current_period_end: 1757551200,
  trial_end: null,
  items: { data: [{ price: { id: 'price_x' } }] },
};

test('faltlasningen finns som en ren funktion', () => {
  assert.equal(typeof billing.prenumerationsfalt, 'function',
    'mappningen lag inbakad i webhook(), som kraver bade databas och signerad nyttolast — ' +
    'den gick darfor inte att prova alls');
});

test('trial_end lases ur prenumerationen', () => {
  const f = billing.prenumerationsfalt(NUTIDA_TRIAL);
  assert.equal(f.trialEnd, 1754959200,
    'trial_end ar det ENDA falt Stripe uttryckligen definierar som provperiodens slut');
});

test('periodslutet lases ur artikeln nar objektet saknar det', () => {
  const f = billing.prenumerationsfalt(NUTIDA_TRIAL);
  assert.equal(f.periodEnd, 1754959200,
    'current_period_end finns inte langre pa subscription — det bor pa subscription_item');
});

test('det gamla faltet anvands fortfarande nar det finns', () => {
  const f = billing.prenumerationsfalt(GAMMAL_AKTIV);
  assert.equal(f.periodEnd, 1757551200, 'aldre API-versioner skickar det pa objektet');
  assert.equal(f.trialEnd, null, 'utan provperiod ska trial_end vara null, inte 0');
});

test('saknat periodslut blir null, inte 1970', () => {
  const f = billing.prenumerationsfalt({ id: 'sub_3', status: 'active', items: { data: [{}] } });
  assert.equal(f.periodEnd, null,
    'fallbacken slutade pa 0, vilket blir to_timestamp(0) = 1 januari 1970. En nedrakning pa ' +
    'det hade visat cirka -20 500 dagar i stallet for att saga "vi vet inte".');
  assert.equal(f.trialEnd, null);
});

test('tomt eller trasigt objekt kraschar inte', () => {
  for (const indata of [null, undefined, {}, { items: null }, { items: { data: [] } }]) {
    const f = billing.prenumerationsfalt(indata);
    assert.equal(f.periodEnd, null, `indata: ${JSON.stringify(indata)}`);
    assert.equal(f.trialEnd, null);
    assert.equal(f.priceId, null);
  }
});

test('prisidentiteten lases ur forsta artikeln', () => {
  assert.equal(billing.prenumerationsfalt(NUTIDA_TRIAL).priceId, 'price_x');
});

// ---- Tabellen och svaret ------------------------------------------------------------------------
const fs = require('fs'), path = require('path');
const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
const KALLA = fs.readFileSync(path.join(__dirname, '..', 'billing.js'), 'utf8');

test('subscriptions-tabellen har en kolumn for trial_end', () => {
  const i = SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS subscriptions');
  assert.ok(i > 0, 'kontrollmatning: tabellen ska finnas i schema.sql');
  const tabell = SCHEMA.slice(i, SCHEMA.indexOf(');', i));
  assert.match(tabell, /trial_end\s+timestamptz/,
    'utan kolumnen gar provperiodens slut forlorat i det ogonblick webhooken tas emot');
});

// Det har provet ar det viktigaste i filen.
//
// migrate.js kor hela schema.sql mot databasen. CREATE TABLE IF NOT EXISTS hoppas over for en
// tabell som REDAN FINNS — alltsa alla befintliga databaser, inklusive produktionens. En ny
// kolumn i CREATE-satsen nar dem aldrig.
//
// Utan ALTER-raden hade webhookens INSERT kraschat pa "column trial_end does not exist" vid
// forsta prenumerationshandelsen efter utrullning, och varje handelse darefter gatt forlorad
// medan proven har hemma var grona. Repot har redan monstret pa tolv andra stallen.
test('den nya kolumnen nar aven en befintlig databas', () => {
  assert.match(SCHEMA, /ALTER TABLE subscriptions\s+ADD COLUMN IF NOT EXISTS trial_end/,
    'CREATE TABLE IF NOT EXISTS rors inte av en tabell som redan finns. Produktionens databas ' +
    'hade behallit den gamla tabellen, och varje INSERT fran webhooken hade kraschat.');
});

test('entitlement returnerar trial_end till klienten', () => {
  const i = KALLA.indexOf('async function entitlement');
  const fn = KALLA.slice(i, i + 420);
  assert.match(fn, /trial_end/,
    'klienten kan inte rakna ner till nagot den aldrig far se — /billing valde bara plan, ' +
    'status, current_period_end och cancel_at_period_end');
});

test('webhooken skriver inte langre 0 som periodslut', () => {
  assert.doesNotMatch(KALLA, /current_period_end\s*\|\|\s*0/,
    'to_timestamp(0) ar 1 januari 1970, inte "okant"');
});
