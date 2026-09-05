'use strict';
// GÖR DEN GAMLA LÄNKEN VERKLIGEN? Mot en RIKTIG Postgres.
//
// Provet i auth-flow-token.test.js kör mot en attrapp-pool som aldrig håller några rader. Det kan
// därför bara mäta vilka SQL-strängar som skickas — inte utfallet. Och utfallet är hela påståendet:
// att länken i det FÖRSTA mejlet fortfarande fungerar efter att man tryckt "Skicka igen".
//
// En attrapp kan inte svara på det. `id NOT IN (SELECT id ... ORDER BY created_at DESC LIMIT $3)`
// med $3 bundet som parameter i en LIMIT inuti en underfråga är en påstådd Postgres-semantik, och
// ett stavfel eller en felaktig typbindning hade varit grönt i alla åtta attrapp-proven medan
// kundens länk fortsatte dö. Samma fälla som jsonb-arrayen i /mfa/confirm, som överlevde
// kodgranskning och gröna modulprov i fyra månader.
//
// Här går vägen hela varvet: issue() skriver, utkorgens förseglade adress låses upp precis som
// mejlutskicket gör, och den råa token matas in i verifyEmail(). Det är samma resa som en människa.
//
// BLOCKERAT utan isolerad Postgres — en attrapp kan per konstruktion inte bevisa det som mäts här.
const test = require('node:test'), assert = require('node:assert/strict');

const DB_URL = process.env.TEST_DATABASE_URL || '';
if (DB_URL) process.env.DATABASE_URL = DB_URL;
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || Buffer.alloc(32, 13).toString('base64url');
process.env.APP_ORIGIN = process.env.APP_ORIGIN || 'https://vyra.test';

// SKIP AVGÖRS INUTI KROPPEN, aldrig via `skip: <variabel>`. `skip: null` — och lika gärna en tom
// sträng — kör kroppen men KASTAR resultatet, så ett fallande prov ser grönt ut. Hela tabellen står
// i tests/goal-postgres-flode.test.js, som vaktar just den kombinationen.
let BLOCKED = '';
if (!DB_URL) BLOCKED = 'BLOCKERAT: ingen isolerad Postgres.';

const prov = (namn, fn) => test('auth-flow: ' + namn, { timeout: 30000 }, async t => {
  if (BLOCKED) { t.skip(BLOCKED); return }
  await fn();
});

let pool = null, S = null, Vault = null, AuthFlow = null;
const ANV = 'beef0000-0000-4000-8000-0000000000a1';
const POST = ANV + '@t.invalid';

// Plockar ut den RÅA token ur utkorgen, samma väg som mejlutskicket: nyttolasten bär bara en
// förseglad adress, aldrig token i klartext.
async function raaTokenUrUtkorgen(ordning = 'ASC') {
  const { rows } = await pool.query(
    `SELECT payload FROM notification_outbox WHERE recipient=$1 AND template='verify_email'
      ORDER BY id ${ordning === 'ASC' ? 'ASC' : 'DESC'}`, [POST]);
  return rows.map(r => {
    const url = Vault.open(r.payload.sealedActionUrl);
    return new URL(url).searchParams.get('verify-email');
  });
}

const levande = async purpose => (await pool.query(
  'SELECT count(*)::int AS n FROM auth_tokens WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL',
  [ANV, purpose])).rows[0].n;

test.before(async () => {
  if (BLOCKED) return;
  S = require('../security');
  Vault = require('../token-vault');
  AuthFlow = require('../auth-flow');
  ({ pool } = require('../db'));
  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,$3,'authflowprov',NULL)
     ON CONFLICT (id) DO UPDATE SET password_hash=$3, email_verified_at=NULL`,
    [ANV, POST, S.hashPassword('Prov-Losenord-9134!')]);
});

test.beforeEach(async () => {
  if (BLOCKED) return;
  await pool.query('DELETE FROM auth_tokens WHERE user_id=$1', [ANV]);
  await pool.query('DELETE FROM notification_outbox WHERE recipient=$1', [POST]);
  await pool.query('UPDATE users SET email_verified_at=NULL WHERE id=$1', [ANV]);
});

test.after(async () => { if (!BLOCKED) await pool.end().catch(() => {}) });

prov('LÄNKEN I DET FÖRSTA MEJLET FUNGERAR EFTER ETT NYTT UTSKICK', async () => {
  // Det här är buggen, hela vägen. Registrering skickar mejl 1. Mejlet dröjer, användaren trycker
  // "Skicka verifieringsmejl" och får mejl 2. Sedan klickar hen i MEJL 1 — det som låg överst.
  await AuthFlow.issue(pool, { id: ANV, email: POST }, 'verify_email', 1440);
  await AuthFlow.issue(pool, { id: ANV, email: POST }, 'verify_email', 1440);

  const [forsta] = await raaTokenUrUtkorgen('ASC');
  assert.ok(forsta, 'kunde inte lasa ut den forsta token ur utkorgen');

  await AuthFlow.verifyEmail(pool, forsta);   // fore fixen: kastade "Lanken ar ogiltig..."

  const { rows } = await pool.query('SELECT email_verified_at FROM users WHERE id=$1', [ANV]);
  assert.ok(rows[0].email_verified_at, 'e-posten skulle blivit verifierad av det FORSTA mejlets lank');
});

prov('taket haller — det fjarde utskicket lamnar tre levande, och det ar de NYASTE', async () => {
  for (let i = 0; i < 4; i++) await AuthFlow.issue(pool, { id: ANV, email: POST }, 'verify_email', 1440);
  assert.equal(await levande('verify_email'), 3, 'tre lankar ska leva, varken fler eller farre');

  const raa = await raaTokenUrUtkorgen('ASC');
  assert.equal(raa.length, 4, 'fyra mejl ska ha koats');

  // Den ALLRA aldsta ska vara borta, de tre senare kvar. Behalls fel ande overlever den lank
  // anvandaren minst sannolikt klickar pa.
  const finns = async t => (await pool.query(
    'SELECT 1 FROM auth_tokens WHERE token_hash=$1 AND consumed_at IS NULL', [S.digest(t)])).rowCount > 0;
  assert.equal(await finns(raa[0]), false, 'den aldsta skulle ha rensats bort');
  for (let i = 1; i < 4; i++) assert.ok(await finns(raa[i]), `token ${i} skulle ha overlevt`);
});

prov('losenordsaterstallning behaller EXAKT en lank', async () => {
  await AuthFlow.issue(pool, { id: ANV, email: POST }, 'reset_password', 30);
  await AuthFlow.issue(pool, { id: ANV, email: POST }, 'reset_password', 30);
  assert.equal(await levande('reset_password'), 1,
    'en aterstallningslank ar ett kontoovertagande — bara den nyaste far leva');
});

prov('ett losenordsbyte dodar INTE verifieringslankarna', async () => {
  // resetPassword konsumerade tidigare ALLA oanvanda token for anvandaren, utan att filtrera pa
  // syfte. En ny kund som glomt sitt losenord innan hen hann verifiera e-posten fick da 1-3
  // verifieringsmejl som alla var doda samtidigt — och felmeddelandet bad henne oppna "det senaste",
  // vilket var omojligt att lyckas med.
  await AuthFlow.issue(pool, { id: ANV, email: POST }, 'verify_email', 1440);
  await AuthFlow.issue(pool, { id: ANV, email: POST }, 'verify_email', 1440);
  await AuthFlow.issue(pool, { id: ANV, email: POST }, 'reset_password', 30);

  const { rows } = await pool.query(
    `SELECT payload FROM notification_outbox WHERE recipient=$1 AND template='reset_password'
      ORDER BY id DESC LIMIT 1`, [POST]);
  const raaReset = new URL(Vault.open(rows[0].payload.sealedActionUrl)).searchParams.get('reset-password');

  await AuthFlow.resetPassword(pool, raaReset, 'Nytt-Losenord-4471!');

  assert.equal(await levande('verify_email'), 2,
    'verifieringslankarna ska vara ororda — losenordsbytet handlade inte om dem');
  assert.equal(await levande('reset_password'), 0,
    'aterstallningslankarna ska daremot vara forbrukade');

  // Och de ska fortfarande GA ATT ANVANDA, inte bara finnas kvar som rader.
  const [forsta] = await raaTokenUrUtkorgen('ASC');
  await AuthFlow.verifyEmail(pool, forsta);
  assert.ok((await pool.query('SELECT email_verified_at FROM users WHERE id=$1', [ANV])).rows[0].email_verified_at);
});
