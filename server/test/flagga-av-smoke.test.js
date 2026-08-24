'use strict';
// FLAGGA-AV-SMOKE — den verkliga servern startad med VYRA_SANDNINGSIDENTITET OSATT.
//
// Det här är dormant-beviset inför merge: hela sessionsmodellen ligger i imagen, men med flaggan
// av ska servern bete sig EXAKT som före PR:n — befintliga rutter svarar, maskinrutterna nekar
// (401 före 503: auth avslöjar aldrig flaggläget), ingenting skrivs, och ingen outbox-worker
// startar av sig själv. Osatt variabel, inte '0': det är så produktionen faktiskt ser ut tills
// aktiveringsbeslutet fattas, och flaggkontrakten är fail-closed (=== '1').
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Serverstart går inte att prova mot en attrapp.';
if (!BLOCKED) process.env.DATABASE_URL = DB_URL;
// FÖRE require('../index'): flaggan bort ur miljön, riktig token in.
delete process.env.VYRA_SANDNINGSIDENTITET;
const TOKEN = 'flaggavprov-' + 'x'.repeat(36);
process.env.TIKTOK_INGEST_TOKEN = TOKEN;

let S, pool, server, base, start;

const OWNER = 'eeeeeeee-0000-4000-8000-000000000001';
const WS1 = 'eeeeeeee-1111-4000-8000-000000000001';
const KONTO = 'flaggavprov';
const auth = {};

const prov = (namn, fn) => test('flagga-av: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);

// Globala nulägen — filerna kör sekventiellt i jobbet (ett node --test-steg i taget), så en
// global differens under den här filens livstid är deterministisk.
const RAKNADE = ['bridge_runs', 'stream_sessions', 'stream_session_pointer',
  'stream_session_reset', 'stream_event_outbox', 'stream_room_reopen'];
async function nulage() {
  const ut = {};
  for (const tab of RAKNADE) {
    ut[tab] = (await pool.query(`SELECT count(*)::int AS n FROM ${tab}`)).rows[0].n;
  }
  return ut;
}

async function post(path, { token = null, body = null, cookie = null, csrf = null } = {}) {
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
async function get(path) {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json().catch(() => null) };
}

test.before(async () => {
  if (BLOCKED) return;
  S = require('../security');
  ({ pool } = require('../db'));
  // Nuläget mäts FÖRE require('../index'): allt servern hunnit skriva vid uppstart syns då som
  // en differens i uppstartsprovet nedan.
  start = await nulage();
  ({ server } = require('../index'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,'x','flaggav-owner',now()) ON CONFLICT (id) DO NOTHING`,
    [OWNER, OWNER + '@t.invalid']);
  await pool.query(
    `INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'flaggav-1',$2)
     ON CONFLICT (id) DO NOTHING`, [WS1, OWNER]);
  await pool.query(
    `INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,'owner')
     ON CONFLICT (workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role`, [WS1, OWNER]);

  const raw = S.token(), csrf = S.token();
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)
     VALUES ($1,$2,$3,now() + interval '1 hour', now())`, [OWNER, S.digest(raw), S.digest(csrf)]);
  auth.cookie = `vyra_session=${raw}`;
  auth.csrf = csrf;
});

test.after(async () => {
  if (BLOCKED) return;
  // HELA teardownen och mellanfilsstädningen — se stream-room-reopen.test.js för läxorna.
  await new Promise(resolve => {
    server.close(resolve);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  const { eventBus } = require('../index');
  if (eventBus) await eventBus.close().catch(() => {});
  await pool.query("DELETE FROM stream_event_outbox WHERE event_id LIKE 'flaggav:%'");
  await pool.query('DELETE FROM sessions WHERE user_id=$1', [OWNER]);
  await pool.end();
});

prov('servern startar och befintliga rutter svarar', async () => {
  const live = await get('/health/live');
  assert.equal(live.status, 200);
  assert.equal(live.body.status, 'live');
  const cfg = await get('/api/auth/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.ok, true);
  const status = await get('/api/public/status'); // går hela vägen ner i Postgres
  assert.equal(status.status, 200);
  assert.equal(status.body.ok, true);
});

prov('maskinrutt utan token ger 401 — flaggläget läcker inte före auth', async () => {
  for (const path of ['/api/live-runs', '/api/live-sessions', '/api/live-sessions/end']) {
    const r = await post(path, { body: { tiktokUsername: KONTO, bridgeRunId: crypto.randomUUID(), seq: 1 } });
    assert.equal(r.status, 401, path + ' utan token gav ' + r.status);
    assert.equal(r.body.error, 'Ogiltig ingest-token');
  }
});

prov('korrekt token men flaggan osatt ger 503 och noll skrivningar', async () => {
  const fore = await nulage();
  for (const path of ['/api/live-runs', '/api/live-sessions', '/api/live-sessions/end']) {
    const r = await post(path, { token: TOKEN,
      body: { tiktokUsername: KONTO, roomId: '760000000000000001', bridgeRunId: crypto.randomUUID(), seq: 1 } });
    assert.equal(r.status, 503, path + ' med flaggan osatt gav ' + r.status);
    assert.equal(r.body.error, 'Sändningsidentiteten är inte aktiverad');
  }
  assert.deepEqual(await nulage(), fore, 'en 503:a skrev ändå rader');
});

prov('admin-reopen skriver ingenting när flaggan är av', async () => {
  const fore = await nulage();
  const audit = async () => (await pool.query(
    "SELECT count(*)::int AS n FROM audit_log WHERE action='stream_room_reopened'")).rows[0].n;
  const auditFore = await audit();
  const r = await post(`/api/workspaces/${WS1}/stream-rooms/760000000000000002/reopen`,
    { cookie: auth.cookie, csrf: auth.csrf, body: { reason: 'flagga-av-smoke' } });
  assert.equal(r.status, 503, 'reopen med flaggan osatt gav ' + r.status);
  assert.deepEqual(await nulage(), fore, 'reopen skrev rader trots flaggan av');
  assert.equal(await audit(), auditFore, 'reopen auditerade trots flaggan av');
});

prov('uppstarten skapade inga sessions-, reset- eller utkorgsrader', async () => {
  // start mättes före require('../index'). Alla anrop hittills var flagga-av-vägar som bevisat
  // inte skriver — differensen är alltså serverns egen.
  assert.deepEqual(await nulage(), start, 'servern skrev sessionsmodellrader vid uppstart');
});

prov('ingen outbox-worker autostartar — en väntande rad förblir orörd', async () => {
  const eventId = 'flaggav:' + crypto.randomUUID();
  await pool.query(
    `INSERT INTO stream_event_outbox (workspace_id, event_id, topic, payload)
     VALUES ($1,$2,'livesession','{}')`, [WS1, eventId]);
  await new Promise(resolve => setTimeout(resolve, 2000));
  const r = await pool.query(
    `SELECT published_at, parked_at, lease_owner, attempts::int AS attempts
       FROM stream_event_outbox WHERE event_id=$1`, [eventId]);
  assert.equal(r.rows.length, 1, 'provraden försvann — någonting konsumerade den');
  assert.deepEqual(r.rows[0], { published_at: null, parked_at: null, lease_owner: null, attempts: 0 },
    'en worker rörde utkorgsraden fast ingen ska vara igång');
  await pool.query('DELETE FROM stream_event_outbox WHERE event_id=$1', [eventId]);
});
