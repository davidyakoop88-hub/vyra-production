'use strict';
// ÅTERSTÄLL TVÅSTEG ÅT EN KUND — POST /api/admin/mfa-aterstallning, över HTTP mot riktig Postgres.
//
// Innan rutten fanns kom en kund som tappat både autentiseringsappen och återställningskoderna
// inte tillbaka alls, utom genom en handskriven UPDATE i produktionens databas. Rutten stänger av
// skyddet på ett ANNAT konto, så det som provas här är framför allt spärrarna:
//   - bara plattformsadministratörer
//   - administratören måste själv ha tvåsteg påslaget och verifierat
//   - administratören bekräftar med en färsk kod (stegvis verifiering)
//   - ett skäl krävs, det egna kontot kan inte återställas, okänt konto ger 404
// och att den lyckade återställningen gör ALLT: tömmer hemlighet och koder, loggar ut kunden,
// skriver audit_log och lägger säkerhetsmejlet i kön.
//
// BLOCKERAT utan isolerad Postgres + Redis, precis som mfa-http.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const net = require('node:net');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
if (DB_URL) process.env.DATABASE_URL = DB_URL;
process.env.TIKTOK_INGEST_TOKEN = process.env.TIKTOK_INGEST_TOKEN || 'prov-ingest-token-0123456789';
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || Buffer.alloc(32, 13).toString('base64url');

let BLOCKED = DB_URL ? null : 'BLOCKERAT: ingen isolerad Postgres.';
async function blockerad() {
  if (BLOCKED !== null) return BLOCKED;
  const url = new URL(REDIS_URL);
  BLOCKED = await new Promise(klar => {
    const s = net.connect({ host: url.hostname, port: Number(url.port) || 6379 });
    const av = svar => { s.destroy(); klar(svar); };
    s.once('connect', () => av(''));
    s.once('error', () => av('BLOCKERAT: ingen Redis.'));
    s.setTimeout(1500, () => av('BLOCKERAT: Redis svarade inte.'));
  });
  return BLOCKED;
}

let server = null, eventBus = null, pool = null, S = null, bas = '';
const MFA = require('../mfa');
const ADMIN = 'beef0000-0000-4000-8000-0000000000a1';
const KUND = 'beef0000-0000-4000-8000-0000000000c1';
const VANLIG = 'beef0000-0000-4000-8000-0000000000d1';
const KUND_EPOST = 'Kund.Aterstall@t.invalid';
const ADMIN_HEMLIGHET = MFA.newSecret(), KUND_HEMLIGHET = MFA.newSecret();
const VAG = '/api/admin/mfa-aterstallning';
const kodFor = hemlighet => MFA.hotp(hemlighet, Math.floor(Date.now() / 30000));

async function session(anv, mfaVerifierad = true) {
  const ra = S.token(), csrf = S.token();
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)' +
    " VALUES ($1,$2,$3, now() + interval '1 hour', " + (mfaVerifierad ? 'now()' : 'NULL') + ')',
    [anv, S.digest(ra), S.digest(csrf)]);
  return { cookie: 'vyra_session=' + ra, csrf };
}

async function anrop(kropp, vem) {
  const res = await fetch(bas + VAG, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: vem.cookie, 'x-vyra-csrf': vem.csrf },
    body: JSON.stringify(kropp || {})
  });
  const text = await res.text();
  let d = null; try { d = JSON.parse(text) } catch { /* inte json */ }
  return { status: res.status, body: d };
}

async function slaPaMfa(anv, hemlighet) {
  await pool.query(
    "UPDATE users SET mfa_secret_enc=$2, mfa_enabled_at=now(), mfa_recovery_hashes=$3::jsonb WHERE id=$1",
    [anv, MFA.encryptedSecret(hemlighet), JSON.stringify([MFA.hashRecovery('AAAA-BBBB')])]);
}

async function kundensRad() {
  const q = await pool.query('SELECT mfa_secret_enc, mfa_enabled_at, mfa_recovery_hashes FROM users WHERE id=$1', [KUND]);
  return q.rows[0];
}
const antal = async (sql, par) => (await pool.query(sql, par)).rows[0].n;

const giltig = () => ({ email: KUND_EPOST, skal: 'Mejl från kontots egen adress', adminKod: kodFor(ADMIN_HEMLIGHET) });

const prov = (namn, fn) => test('mfa-aterstallning: ' + namn, { timeout: 30000 }, async t => {
  const skal = await blockerad();
  if (skal) { t.skip(skal); return; }
  await fn();
});

test.before(async () => {
  if (await blockerad()) return;
  S = require('../security');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));
  const losen = S.hashPassword('Prov-Losenord-9134!');
  for (const [id, epost, admin] of [[ADMIN, ADMIN + '@t.invalid', true], [KUND, KUND_EPOST, false], [VANLIG, VANLIG + '@t.invalid', false]]) {
    await pool.query(
      'INSERT INTO users (id,email,password_hash,display_name,email_verified_at,is_platform_admin)' +
      " VALUES ($1,$2,$3,'aterstallprov',now(),$4)" +
      ' ON CONFLICT (id) DO UPDATE SET email=$2, password_hash=$3, is_platform_admin=$4',
      [id, epost, losen, admin]);
  }
  await new Promise(klar => server.listen(0, '127.0.0.1', klar));
  bas = 'http://127.0.0.1:' + server.address().port;
});

test.beforeEach(async () => {
  if (await blockerad()) return;
  for (const id of [ADMIN, KUND, VANLIG]) {
    await pool.query('DELETE FROM sessions WHERE user_id=$1', [id]);
    await pool.query("UPDATE users SET mfa_secret_enc=NULL, mfa_enabled_at=NULL, mfa_recovery_hashes='[]'::jsonb WHERE id=$1", [id]);
  }
  await pool.query("DELETE FROM audit_log WHERE action='mfa_aterstalld_av_admin' AND target_id=$1", [KUND]);
  await pool.query("DELETE FROM notification_outbox WHERE template='mfa_reset' AND lower(recipient)=lower($1)", [KUND_EPOST]);
  await slaPaMfa(ADMIN, ADMIN_HEMLIGHET);
  await slaPaMfa(KUND, KUND_HEMLIGHET);
});

test.after(async () => {
  if (await blockerad()) return;
  for (const id of [ADMIN, KUND, VANLIG]) await pool.query('DELETE FROM sessions WHERE user_id=$1', [id]);
  await pool.query("DELETE FROM audit_log WHERE action='mfa_aterstalld_av_admin' AND target_id=$1", [KUND]);
  await pool.query("DELETE FROM notification_outbox WHERE template='mfa_reset' AND lower(recipient)=lower($1)", [KUND_EPOST]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ADMIN, KUND, VANLIG]]);
  await new Promise(klar => {
    server.close(klar);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.end();
});

prov('lyckad återställning tömmer tvåsteg, loggar ut kunden, skriver logg och mejl', async () => {
  const admin = await session(ADMIN);
  await session(KUND); await session(KUND);
  const r = await anrop(giltig(), admin);
  assert.equal(r.status, 200, 'svarade ' + r.status + ' (' + (r.body && r.body.error) + ')');
  assert.equal(r.body.utloggadeSessioner, 2);
  const rad = await kundensRad();
  assert.equal(rad.mfa_secret_enc, null, 'hemligheten låg kvar');
  assert.equal(rad.mfa_enabled_at, null, 'tvåsteg stod kvar som påslaget');
  assert.deepEqual(rad.mfa_recovery_hashes, [], 'återställningskoderna låg kvar');
  assert.equal(await antal('SELECT count(*)::int n FROM sessions WHERE user_id=$1', [KUND]), 0, 'kunden var inte utloggad');
  const logg = await pool.query("SELECT actor_user_id, metadata FROM audit_log WHERE action='mfa_aterstalld_av_admin' AND target_id=$1", [KUND]);
  assert.equal(logg.rowCount, 1, 'ingen rad i audit_log');
  assert.equal(String(logg.rows[0].actor_user_id), ADMIN);
  assert.equal(logg.rows[0].metadata.skal, 'Mejl från kontots egen adress');
  assert.equal(await antal("SELECT count(*)::int n FROM notification_outbox WHERE template='mfa_reset' AND recipient=$1", [KUND_EPOST]), 1, 'säkerhetsmejlet lades inte i kön');
});

prov('e-postadressen matchas utan hänsyn till versaler', async () => {
  const r = await anrop({ ...giltig(), email: '  kund.aterstall@T.INVALID ' }, await session(ADMIN));
  assert.equal(r.status, 200);
  assert.equal((await kundensRad()).mfa_enabled_at, null);
});

prov('fel kod från administratörens app ger 401 och rör ingenting', async () => {
  const r = await anrop({ ...giltig(), adminKod: '000000' }, await session(ADMIN));
  assert.equal(r.status, 401);
  assert.notEqual((await kundensRad()).mfa_enabled_at, null, 'kundens tvåsteg stängdes av trots fel kod');
});

prov('kundens kod duger inte som administratörens bekräftelse', async () => {
  const r = await anrop({ ...giltig(), adminKod: kodFor(KUND_HEMLIGHET) }, await session(ADMIN));
  assert.equal(r.status, 401);
});

prov('administratör utan eget tvåsteg nekas med 403', async () => {
  await pool.query("UPDATE users SET mfa_secret_enc=NULL, mfa_enabled_at=NULL WHERE id=$1", [ADMIN]);
  const r = await anrop(giltig(), await session(ADMIN));
  assert.equal(r.status, 403);
  assert.notEqual((await kundensRad()).mfa_enabled_at, null);
});

prov('icke-administratör nekas med 403', async () => {
  const r = await anrop(giltig(), await session(VANLIG));
  assert.equal(r.status, 403);
  assert.notEqual((await kundensRad()).mfa_enabled_at, null);
});

prov('skäl saknas ger 400', async () => {
  const r = await anrop({ ...giltig(), skal: '' }, await session(ADMIN));
  assert.equal(r.status, 400);
});

prov('okänt konto ger 404', async () => {
  const r = await anrop({ ...giltig(), email: 'finns-inte@t.invalid' }, await session(ADMIN));
  assert.equal(r.status, 404);
});

prov('konto utan tvåsteg ger 409', async () => {
  await pool.query("UPDATE users SET mfa_secret_enc=NULL, mfa_enabled_at=NULL WHERE id=$1", [KUND]);
  const r = await anrop(giltig(), await session(ADMIN));
  assert.equal(r.status, 409);
});

prov('det egna kontot kan inte återställas här', async () => {
  const r = await anrop({ ...giltig(), email: ADMIN + '@t.invalid' }, await session(ADMIN));
  assert.equal(r.status, 400);
  const q = await pool.query('SELECT mfa_enabled_at FROM users WHERE id=$1', [ADMIN]);
  assert.notEqual(q.rows[0].mfa_enabled_at, null, 'administratörens eget tvåsteg stängdes av');
});
