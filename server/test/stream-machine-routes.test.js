'use strict';
// MASKINRUTTERNA — HTTP-förtroendegränsen för sändningsidentiteten.
//
//   POST /api/live-runs           { tiktokUsername, bridgeRunId }
//   POST /api/live-sessions       { tiktokUsername, roomId, bridgeRunId, seq }
//   POST /api/live-sessions/end   { tiktokUsername, roomId, bridgeRunId, seq }
//
// Auth hör hemma HÄR, inte i domänen: rutterna ligger i samma region som den gamla ingest-rutten —
// efter den globala origin-spärren men FÖRE den gemensamma sessionsraden — så cookie/CSRF kan
// strukturellt inte autentisera dem. C1/C2 från sessionssviten är omskrivna hit, mot den verkliga
// gränsen i stället för en modulstub.
//
// INGEN bakåtkompatibilitet: bridgeRunId (kanoniskt uuid) krävs överallt, seq (safe integer >= 1)
// på start och end. seq 0 avvisas — max_seq börjar på 0, och ett seq=0 hade blivit en idempotent
// no-op: första beskedet hade försvunnit tyst.
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. HTTP-gränsen går inte att prova mot en attrapp.';
if (!BLOCKED) process.env.DATABASE_URL = DB_URL;
// Sätts FÖRE require('../index'). Token minst 32 tecken — kortare öppnar ingenting, per design.
const TOKEN = 'maskinprov-' + 'x'.repeat(37);
process.env.TIKTOK_INGEST_TOKEN = TOKEN;
process.env.VYRA_SANDNINGSIDENTITET = '1';

let S, pool, server, base;

const OWNER = 'dddddddd-0000-4000-8000-000000000001';
const WS1 = 'dddddddd-1111-4000-8000-000000000001';
const KONTO = 'maskinprov';
const auth = {};

const prov = (namn, fn) => test('maskin: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);

let rumNr = 100;
// Strängkonkatenering, aldrig aritmetik nära 2^53 — se stream-room-reopen.test.js.
const nyttRum = () => '77' + String(rumNr++).padStart(16, '0');
const nyKorning = () => crypto.randomUUID();

async function call(path, { token = TOKEN, body = null, cookie = null, csrf = null } = {}) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-vyra-csrf': csrf } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const antalKorningar = () => pool.query(
  'SELECT count(*)::int AS n FROM bridge_runs WHERE account_key=$1', [KONTO]).then(r => r.rows[0].n);
const antalSessioner = () => pool.query(
  'SELECT count(*)::int AS n FROM stream_sessions WHERE workspace_id=$1', [WS1]).then(r => r.rows[0].n);

test.before(async () => {
  if (BLOCKED) return;
  S = require('../security');
  ({ pool } = require('../db'));
  ({ server } = require('../index'));

  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,'x','maskin-owner',now()) ON CONFLICT (id) DO NOTHING`,
    [OWNER, OWNER + '@t.invalid']);
  await pool.query(
    `INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'maskin-1',$2)
     ON CONFLICT (id) DO NOTHING`, [WS1, OWNER]);
  await pool.query(
    `INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,'owner')
     ON CONFLICT (workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role`, [WS1, OWNER]);
  await pool.query('INSERT INTO bridge_accounts(account_key) VALUES($1) ON CONFLICT DO NOTHING', [KONTO]);
  await pool.query(
    'INSERT INTO tiktok_connections(workspace_id,tiktok_username,active) VALUES($1,$2,true) '
    + 'ON CONFLICT (workspace_id) DO UPDATE SET tiktok_username=EXCLUDED.tiktok_username,active=true',
    [WS1, KONTO]);
  for (const t of ['stream_room_reopen', 'stream_event_outbox', 'stream_session_pointer']) {
    await pool.query(`DELETE FROM ${t} WHERE workspace_id=$1`, [WS1]);
  }
  await pool.query('DELETE FROM stream_session_reset WHERE session_id IN '
    + '(SELECT id FROM stream_sessions WHERE workspace_id=$1)', [WS1]);
  await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [WS1]);
  await pool.query('DELETE FROM bridge_runs WHERE account_key=$1', [KONTO]);

  // En riktig cookie-session med CSRF — för beviset att den INTE autentiserar maskinrutterna.
  const raw = S.token(), csrf = S.token();
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)
     VALUES ($1,$2,$3,now() + interval '1 hour', now())`, [OWNER, S.digest(raw), S.digest(csrf)]);
  auth.cookie = `vyra_session=${raw}`;
  auth.csrf = csrf;

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (BLOCKED) return;
  // HELA teardownen och mellanfilsstädningen — filerna delar databas i samma CI-jobb, och nästa
  // fil räknar delvis globalt. Se stream-room-reopen.test.js för läxorna bakom varje rad.
  await new Promise(resolve => {
    server.close(resolve);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  const { eventBus } = require('../index');
  if (eventBus) await eventBus.close().catch(() => {});
  for (const t of ['stream_room_reopen', 'stream_event_outbox', 'stream_session_pointer']) {
    await pool.query(`DELETE FROM ${t} WHERE workspace_id=$1`, [WS1]);
  }
  await pool.query('DELETE FROM stream_session_reset WHERE session_id IN '
    + '(SELECT id FROM stream_sessions WHERE workspace_id=$1)', [WS1]);
  await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [WS1]);
  await pool.query('DELETE FROM bridge_runs WHERE account_key=$1', [KONTO]);
  await pool.query('DELETE FROM sessions WHERE user_id=$1', [OWNER]);
  await pool.end();
});

// ---- Auth vid gränsen (C1/C2 omskrivna hit) -----------------------------------------------------

prov('C1 · en cookie-session med CSRF autentiserar INTE maskinrutterna', async () => {
  for (const path of ['/api/live-runs', '/api/live-sessions', '/api/live-sessions/end']) {
    const r = await call(path, { token: null, cookie: auth.cookie, csrf: auth.csrf,
      body: { tiktokUsername: KONTO, roomId: nyttRum(), bridgeRunId: nyKorning(), seq: 1 } });
    assert.equal(r.status, 401, path + ' släppte in en cookie-session');
    assert.equal(r.body.error, 'Ogiltig ingest-token');
  }
  assert.equal(await antalKorningar(), 0);
});

prov('C2 · fel token ger 401 utan att avslöja längd eller innehåll', async () => {
  for (const daligt of ['fel'.repeat(20), 'x', TOKEN.slice(0, -1), TOKEN + 'x']) {
    const r = await call('/api/live-runs', { token: daligt,
      body: { tiktokUsername: KONTO, bridgeRunId: nyKorning() } });
    assert.equal(r.status, 401);
    // Samma regex-krav som gamla C2: inga siffror, ingen längd, ingen token i meddelandet.
    assert.equal(/token=|längd|[0-9]{2,}/.test(String(r.body.error)), false,
      'felmeddelandet läcker: ' + r.body.error);
    assert.equal(r.body.error, 'Ogiltig ingest-token');
  }
  assert.equal(await antalKorningar(), 0);
});

prov('auth kontrolleras FÖRE flaggan', async () => {
  process.env.VYRA_SANDNINGSIDENTITET = '0';
  try {
    // Fel token + flagga av: 401, inte 503 — en oautentiserad anropare får inte veta om
    // funktionen är påslagen.
    const utanAuth = await call('/api/live-runs', { token: 'fel'.repeat(20),
      body: { tiktokUsername: KONTO, bridgeRunId: nyKorning() } });
    assert.equal(utanAuth.status, 401);
    // Rätt token + flagga av: 503, noll skrivningar.
    const medAuth = await call('/api/live-runs',
      { body: { tiktokUsername: KONTO, bridgeRunId: nyKorning() } });
    assert.equal(medAuth.status, 503);
  } finally {
    process.env.VYRA_SANDNINGSIDENTITET = '1';
  }
  assert.equal(await antalKorningar(), 0);
});

// ---- Förbjudna fält och validering --------------------------------------------------------------

prov('förbjudna fält ger 400 och ingen skrivning — tyst ignorering döljer trasiga bryggor', async () => {
  const korning = nyKorning();
  const bas = { tiktokUsername: KONTO, roomId: nyttRum(), bridgeRunId: korning, seq: 1 };
  const FORBJUDNA = ['workspaceId', 'sessionId', 'generation', 'reason', 'actor', 'actor_user_id',
    'eventId', 'startedAt', 'endedAt'];
  for (const falt of FORBJUDNA) {
    const r = await call('/api/live-sessions', { body: { ...bas, [falt]: 'nagot' } });
    assert.equal(r.status, 400, falt + ' gav ' + r.status);
    assert.match(String(r.body.error), new RegExp(falt), 'felet pekar inte ut fältet');
  }
  assert.equal(await antalKorningar(), 0, 'en körning skrevs trots förbjudet fält');
  assert.equal(await antalSessioner(), 0, 'en session skrevs trots förbjudet fält');
});

prov('saknat/ogiltigt bridgeRunId och seq ger 400', async () => {
  const rum = nyttRum();
  const fall = [
    [{ tiktokUsername: KONTO, roomId: rum, seq: 1 }, 'bridgeRunId saknas'],
    [{ tiktokUsername: KONTO, roomId: rum, bridgeRunId: 'kornings-id-1', seq: 1 }, 'icke-uuid'],
    [{ tiktokUsername: KONTO, roomId: rum, bridgeRunId: nyKorning() }, 'seq saknas'],
    [{ tiktokUsername: KONTO, roomId: rum, bridgeRunId: nyKorning(), seq: 0 }, 'seq=0'],
    [{ tiktokUsername: KONTO, roomId: rum, bridgeRunId: nyKorning(), seq: 1.5 }, 'seq=1.5'],
    [{ tiktokUsername: KONTO, roomId: rum, bridgeRunId: nyKorning(), seq: 2 ** 53 }, 'osafe seq'],
    [{ tiktokUsername: KONTO, roomId: rum, bridgeRunId: nyKorning(), seq: '3' }, 'seq som sträng'],
    [{ tiktokUsername: KONTO, roomId: 'abc', bridgeRunId: nyKorning(), seq: 1 }, 'roomId med bokstäver'],
    [{ tiktokUsername: 'x'.repeat(65), roomId: rum, bridgeRunId: nyKorning(), seq: 1 }, 'för långt namn'],
  ];
  for (const [body, vad] of fall) {
    for (const path of ['/api/live-sessions', '/api/live-sessions/end']) {
      const r = await call(path, { body });
      assert.equal(r.status, 400, vad + ' på ' + path + ' gav ' + r.status);
    }
  }
  // live-runs: bridgeRunId-kraven gäller där också.
  assert.equal((await call('/api/live-runs', { body: { tiktokUsername: KONTO } })).status, 400);
  assert.equal((await call('/api/live-runs',
    { body: { tiktokUsername: KONTO, bridgeRunId: 'inte-uuid' } })).status, 400);
  assert.equal(await antalSessioner(), 0);
});

// ---- Hela kedjan och minimala svar --------------------------------------------------------------

prov('run → session → end över den riktiga gränsen, med minimala svar', async () => {
  const korning = nyKorning(), rum = nyttRum();

  const run = await call('/api/live-runs', { body: { tiktokUsername: KONTO, bridgeRunId: korning } });
  assert.deepEqual([run.status, run.body], [200, { ok: true }], JSON.stringify(run));
  // Idempotent omregistrering: samma minimala svar.
  const runIgen = await call('/api/live-runs', { body: { tiktokUsername: KONTO, bridgeRunId: korning } });
  assert.deepEqual([runIgen.status, runIgen.body], [200, { ok: true }]);

  const start = await call('/api/live-sessions',
    { body: { tiktokUsername: KONTO, roomId: rum, bridgeRunId: korning, seq: 1 } });
  assert.deepEqual([start.status, start.body], [200, { ok: true, accepted: true }],
    'svaret bär mer än accepterat: ' + JSON.stringify(start.body));
  assert.equal(await antalSessioner(), 1, 'ingen session skapades i databasen');

  // MINIMALT PÅ RIKTIGT: inga uuid:n någonstans i svaret — varken sessioner, workspaces eller
  // generationer får läcka ut till bryggan.
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(JSON.stringify(start.body)), false,
    'ett uuid läckte i svaret');

  const dubblett = await call('/api/live-sessions',
    { body: { tiktokUsername: KONTO, roomId: rum, bridgeRunId: korning, seq: 1 } });
  assert.deepEqual(dubblett.body, { ok: true, idempotent: true });
  const lagre = await call('/api/live-sessions',
    { body: { tiktokUsername: KONTO, roomId: nyttRum(), bridgeRunId: korning, seq: 1 } });
  assert.deepEqual(lagre.body, { ok: true, idempotent: true },
    'samma seq med annat rum ska vara idempotent no-op');

  const slut = await call('/api/live-sessions/end',
    { body: { tiktokUsername: KONTO, roomId: rum, bridgeRunId: korning, seq: 2 } });
  assert.deepEqual([slut.status, slut.body], [200, { ok: true, accepted: true }]);
  const slutIgen = await call('/api/live-sessions/end',
    { body: { tiktokUsername: KONTO, roomId: rum, bridgeRunId: korning, seq: 2 } });
  assert.deepEqual(slutIgen.body, { ok: true, idempotent: true });

  const sent = await call('/api/live-sessions',
    { body: { tiktokUsername: KONTO, roomId: rum, bridgeRunId: korning, seq: 1 } });
  assert.deepEqual(sent.body, { ok: true, stale: true, skal: 'aldre-seq' });
});

prov('en avlöst körning som återregistrerar sig får 409', async () => {
  const gammal = nyKorning();
  await call('/api/live-runs', { body: { tiktokUsername: KONTO, bridgeRunId: gammal } });
  await call('/api/live-runs', { body: { tiktokUsername: KONTO, bridgeRunId: nyKorning() } });
  const r = await call('/api/live-runs', { body: { tiktokUsername: KONTO, bridgeRunId: gammal } });
  assert.equal(r.status, 409);
  // requestId är husets korrelations-id — slumpat per anrop av den globala felhanteraren och
  // redan synligt i x-request-id-headern. Det är INTE en intern identitet och undantas från
  // svepningen; allt annat i felsvaret måste vara uuid-fritt.
  const { requestId, ...utanKorrelation } = r.body || {};
  assert.ok(requestId, 'felhanteraren tappade sitt korrelations-id');
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(JSON.stringify(utanKorrelation)), false,
    'ett uuid läckte i felsvaret: ' + JSON.stringify(utanKorrelation));
});

prov('status från en avlöst körning är stale över gränsen', async () => {
  const gammal = nyKorning();
  await call('/api/live-runs', { body: { tiktokUsername: KONTO, bridgeRunId: gammal } });
  await call('/api/live-runs', { body: { tiktokUsername: KONTO, bridgeRunId: nyKorning() } });
  const r = await call('/api/live-sessions',
    { body: { tiktokUsername: KONTO, roomId: nyttRum(), bridgeRunId: gammal, seq: 1 } });
  assert.deepEqual(r.body, { ok: true, stale: true, skal: 'avlost-korning' });
});
