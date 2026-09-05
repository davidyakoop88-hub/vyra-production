'use strict';
// VERIFIERINGSLÄNKAR SOM DÖDADE VARANDRA.
//
// `issue()` raderade ALLA oanvända token vid varje nytt utskick. Följden i verkligheten (uppmätt på
// ett riktigt konto 2026-09-05): du registrerar dig, mejlet dröjer, du trycker "Skicka
// verifieringsmejl", och i samma stund dör länken i det FÖRSTA mejlet — det du sedan klickar på,
// eftersom mejlen ser identiska ut. Svaret blev "Länken är ogiltig eller har gått ut", vilket var
// osant på båda punkterna.
//
// Utan verifierad e-post svarar servern 403 på varje sparning och ingen provperiod kan startas, så
// en ny kund som fastnar här kommer ingenstans alls.
//
// Proven kör mot en attrapp-pool: `issue()` tar emot poolen som argument, så hela beslutet går att
// mäta utan Postgres. Det som mäts är SQL:ens parametrar — det är där taket bor.
const test = require('node:test'), assert = require('node:assert/strict');

process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64url');
process.env.APP_ORIGIN = 'https://vyra.test';
const { issue, LEVANDE_TAK } = require('../auth-flow');

function fejkpool() {
  const fragor = [];
  return {
    fragor,
    query: async (sql, params) => {
      fragor.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
      return { rows: [{ id: 'token-1' }] };
    },
  };
}
const ANVANDARE = { id: 'u-1', email: 'kund@exempel.test' };
const stadningen = p => p.fragor.find(f => /^DELETE FROM auth_tokens/.test(f.sql));

test('verifiering behaller flera levande lankar — det aldre mejlet slutar inte fungera', async () => {
  const p = fejkpool();
  await issue(p, ANVANDARE, 'verify_email', 1440);
  const d = stadningen(p);
  assert.ok(d, 'nagon stadning maste ske, annars vaxer tabellen obegransat');
  assert.equal(d.params[2], LEVANDE_TAK.verify_email - 1,
    'antalet BEHALLNA ska vara taket minus den vi lagger till');
  assert.ok(d.params[2] >= 1,
    'behalls noll aterstar det gamla beteendet: forra mejlets lank dor vid varje utskick');
  assert.match(d.sql, /NOT IN \(SELECT id FROM auth_tokens/,
    'de nyaste ska undantas fran raderingen, inte alla raderas');
  assert.match(d.sql, /ORDER BY created_at DESC LIMIT/,
    'det ar de NYASTE som ska overleva, annars behalls fel token');
});

test('losenordsaterstallning behaller EXAKT en — en sadan lank ar ett kontoovertagande', async () => {
  const p = fejkpool();
  await issue(p, ANVANDARE, 'reset_password', 30);
  assert.equal(LEVANDE_TAK.reset_password, 1);
  assert.equal(stadningen(p).params[2], 0,
    'noll behallna = alla tidigare raderas, alltsa det stranga beteendet bevaras');
});

test('ett okant syfte behandlas strangt, inte tillatande', async () => {
  // Om nagon lagger till ett tredje syfte utan att fylla i taket ska reservlaget vara EN levande
  // token, aldrig obegransat. En reserv som slapper efter ar en tyst sakerhetsregression.
  const p = fejkpool();
  await issue(p, ANVANDARE, 'nagot_nytt', 30);
  assert.equal(stadningen(p).params[2], 0);
});

test('stadningen kor FORE insattningen — annars raderas den nya token direkt', async () => {
  const p = fejkpool();
  await issue(p, ANVANDARE, 'verify_email', 1440);
  const iDelete = p.fragor.findIndex(f => /^DELETE FROM auth_tokens/.test(f.sql));
  const iInsert = p.fragor.findIndex(f => /^INSERT INTO auth_tokens/.test(f.sql));
  assert.ok(iDelete >= 0 && iInsert >= 0);
  assert.ok(iDelete < iInsert, 'DELETE maste komma fore INSERT');
});

test('lanken i mejlet ar forseglad — den rana token far aldrig ligga i utkorgen', async () => {
  const p = fejkpool();
  await issue(p, ANVANDARE, 'verify_email', 1440);
  const utkorg = p.fragor.find(f => /^INSERT INTO notification_outbox/.test(f.sql));
  assert.ok(utkorg, 'ett mejl ska koas');
  const nyttolast = utkorg.params[2];
  assert.ok(nyttolast.sealedActionUrl, 'nyttolasten ska bara bara den forseglade adressen');
  assert.doesNotMatch(JSON.stringify(nyttolast), /verify-email=/,
    'den oforseglade lanken far inte lagras i utkorgen');
  assert.equal(utkorg.params[0], ANVANDARE.email);
});
