'use strict';
// "HÅLL MIG INLOGGAD" ÖVER HTTP — skrivet RÖTT FÖRST (2026-10-21).
//
// Davids önskan: en ruta vid inloggningen så att man inte behöver skriva lösenordet varje gång.
// Kontraktet som provas här, mot en RIKTIG Postgres (kakans Max-Age och radens expires_at måste
// räknas ur samma tal, och det går bara att se på raden som databasen faktiskt sparade):
//
//   remember:true  -> kakan får Max-Age = REMEMBER_DAYS (30 dgr), raden remember=true och
//                     expires_at = nu + 30 dgr; /api/auth/me rullar BÅDA framåt.
//   inget fält     -> EXAKT som före ändringen: Max-Age = SESSION_DAYS (14 dgr), fast utgång,
//                     /api/auth/me sätter ingen kaka och rör inte expires_at.
//   tvåsteg        -> valet bärs på raden genom /api/auth/mfa/challenge.
//   utloggning, "Logga ut alla andra" och lösenordsåterställning tar bort även en ihågkommen session.
//
// Bara Postgres krävs: rutterna här rör aldrig Redis (räknarna faller tillbaka på det lokala
// minnet). Utan TEST_DATABASE_URL hoppas filen över, som de andra Postgres-proven.
const test = require('node:test'), assert = require('node:assert/strict');

const DB_URL = process.env.TEST_DATABASE_URL || '';
if (DB_URL) process.env.DATABASE_URL = DB_URL;
process.env.TIKTOK_INGEST_TOKEN = process.env.TIKTOK_INGEST_TOKEN || 'prov-ingest-token-0123456789';
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || Buffer.alloc(32, 13).toString('base64url');
// Filen loggar in ett tjugotal gånger på en minut från 127.0.0.1. Inloggningsgränsen provas på
// annat ställe (login-protection.test.js); här skulle den bara ge 429 mitt i ett påstående.
process.env.AUTH_RATE_LIMIT = '1000';
const BLOCKED = DB_URL ? '' : 'BLOCKERAT: ingen isolerad Postgres (TEST_DATABASE_URL).';

const DAG = 86400;
const MINNE = 30 * DAG, VANLIG = 14 * DAG;
const ANV = 'beef0000-0000-4000-8000-0000000000a7';
const EPOST = 'hall-mig-inloggad@t.invalid';
const LOSEN = 'Prov-Losenord-9134!';

let server = null, eventBus = null, pool = null, S = null, MFA = null, bas = '';

const prov = (namn, fn) => test('hall-mig-inloggad: ' + namn, { timeout: 30000 }, async t => {
  if (BLOCKED) { t.skip(BLOCKED); return; }
  await fn();
});

test.before(async () => {
  if (BLOCKED) return;
  S = require('../security');
  MFA = require('../mfa');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));
  await pool.query(
    'INSERT INTO users (id,email,password_hash,display_name,email_verified_at)' +
    " VALUES ($1,$2,$3,'minnesprov',now())" +
    ' ON CONFLICT (id) DO UPDATE SET email=$2, password_hash=$3, email_verified_at=now()',
    [ANV, EPOST, S.hashPassword(LOSEN)]);
  await new Promise(klar => server.listen(0, '127.0.0.1', klar));
  bas = 'http://127.0.0.1:' + server.address().port;
});

test.beforeEach(async () => {
  if (BLOCKED) return;
  await pool.query('DELETE FROM sessions WHERE user_id=$1', [ANV]);
  await pool.query(
    "UPDATE users SET mfa_secret_enc=NULL, mfa_enabled_at=NULL, mfa_recovery_hashes='[]'::jsonb," +
    ' failed_login_count=0, locked_until=NULL WHERE id=$1', [ANV]);
});

test.after(async () => {
  if (BLOCKED) return;
  await pool.query('DELETE FROM sessions WHERE user_id=$1', [ANV]);
  await pool.query('DELETE FROM audit_log WHERE actor_user_id=$1', [ANV]).catch(() => {});
  await pool.query('DELETE FROM notification_outbox WHERE recipient=$1', [EPOST]).catch(() => {});
  await pool.query('DELETE FROM users WHERE id=$1', [ANV]);
  await new Promise(klar => {
    server.close(klar);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.end();
});

async function anrop(metod, vag, kropp, vem) {
  const headers = { 'content-type': 'application/json' };
  if (vem) { headers.cookie = vem.cookie; if (vem.csrf) headers['x-vyra-csrf'] = vem.csrf; }
  const res = await fetch(bas + vag, { method: metod, headers, body: kropp === undefined ? undefined : JSON.stringify(kropp) });
  const text = await res.text();
  let body = null; try { body = JSON.parse(text) } catch { /* inte json */ }
  return { status: res.status, body, kaka: res.headers.get('set-cookie') };
}

function kakvarde(kaka) {
  const m = /vyra_session=([^;]*)/.exec(kaka || '');
  return m ? decodeURIComponent(m[1]) : null;
}
function maxAge(kaka) {
  const m = /Max-Age=(\d+)/.exec(kaka || '');
  return m ? Number(m[1]) : null;
}
async function rad(raw) {
  const q = await pool.query(
    'SELECT id, remember, expires_at, mfa_verified_at, extract(epoch FROM expires_at - now())::int AS kvar' +
    ' FROM sessions WHERE token_hash=$1', [S.digest(raw)]);
  return q.rows[0] || null;
}
// En sekunds tolerans per håll räcker gott: raden och kakan räknas i samma anrop.
function nara(faktiskt, vantat, meddelande) {
  assert.ok(Math.abs(faktiskt - vantat) <= 60, `${meddelande}: ${faktiskt} s, väntat ~${vantat} s`);
}

async function loggaIn(extra) {
  const r = await anrop('POST', '/api/auth/login', { email: EPOST, password: LOSEN, ...extra });
  assert.equal(r.status, 200, 'inloggningen svarade ' + r.status + ': ' + JSON.stringify(r.body));
  const raw = kakvarde(r.kaka);
  assert.ok(raw, 'inloggningen satte ingen sessionskaka');
  return { ...r, raw, vem: { cookie: 'vyra_session=' + raw, csrf: r.body.csrfToken } };
}

// ---- 1 · INLOGGNINGEN -------------------------------------------------------------------------

prov('remember:true ger en beständig kaka på 30 dagar och en rad som lever lika länge', async () => {
  const r = await loggaIn({ remember: true });
  assert.match(r.kaka, /HttpOnly/); assert.match(r.kaka, /Secure/); assert.match(r.kaka, /SameSite=Strict/);
  assert.match(r.kaka, /Path=\//);
  assert.equal(maxAge(r.kaka), MINNE, 'kakans Max-Age är inte 30 dagar');
  const s = await rad(r.raw);
  assert.equal(s.remember, true, 'raden minns inte valet');
  nara(s.kvar, MINNE, 'radens utgång matchar inte kakan');
});

prov('utan fältet är allt som förut: 14 dagar, remember=false', async () => {
  const r = await loggaIn({});
  assert.equal(maxAge(r.kaka), VANLIG, 'Max-Age ändrades för den som inte kryssade i rutan');
  const s = await rad(r.raw);
  assert.equal(s.remember, false);
  nara(s.kvar, VANLIG, 'radens utgång ändrades för den som inte kryssade i rutan');
});

prov('bara ett äkta true räknas — "true", 1 och false ger dagens beteende', async () => {
  for (const varde of ['true', 1, false, null]) {
    const r = await loggaIn({ remember: varde });
    assert.equal(maxAge(r.kaka), VANLIG, 'remember=' + JSON.stringify(varde) + ' gav en lång kaka');
    assert.equal((await rad(r.raw)).remember, false);
  }
});

prov('varje inloggning ger ett NYTT sessions-id — även med rutan ikryssad', async () => {
  const a = await loggaIn({ remember: true }), b = await loggaIn({ remember: true });
  assert.notEqual(a.raw, b.raw, 'samma sessionsvärde utfärdades två gånger');
  assert.notEqual((await rad(a.raw)).id, (await rad(b.raw)).id);
});

// ---- 2 · RULLANDE UTGÅNG ----------------------------------------------------------------------

prov('/api/auth/me rullar en ihågkommen session: raden och kakan förnyas med samma tal', async () => {
  const r = await loggaIn({ remember: true });
  await pool.query("UPDATE sessions SET expires_at=now()+interval '2 days' WHERE token_hash=$1", [S.digest(r.raw)]);
  const me = await anrop('GET', '/api/auth/me', undefined, r.vem);
  assert.equal(me.status, 200);
  assert.equal(kakvarde(me.kaka), r.raw, 'me ska förnya SAMMA kaka, inte byta värde');
  assert.equal(maxAge(me.kaka), MINNE, 'me förnyade inte kakans Max-Age');
  assert.match(me.kaka, /HttpOnly/);
  nara((await rad(r.raw)).kvar, MINNE, 'me rullade inte radens utgång');
});

prov('/api/auth/me rör varken kaka eller utgång utan rutan', async () => {
  const r = await loggaIn({});
  const fore = (await rad(r.raw)).expires_at.getTime();
  const me = await anrop('GET', '/api/auth/me', undefined, r.vem);
  assert.equal(me.status, 200);
  assert.equal(me.kaka, null, 'me satte en kaka för en vanlig session');
  assert.equal((await rad(r.raw)).expires_at.getTime(), fore, 'me flyttade utgången på en vanlig session');
});

// ---- 3 · TVÅSTEG ------------------------------------------------------------------------------

async function slaPaMfa() {
  const hemlighet = MFA.newSecret();
  await pool.query('UPDATE users SET mfa_secret_enc=$1, mfa_enabled_at=now() WHERE id=$2',
    [MFA.encryptedSecret(hemlighet), ANV]);
  return hemlighet;
}
const kodFor = h => MFA.hotp(h, Math.floor(Date.now() / 30000));

prov('tvåsteget bär valet: challenge förnyar kakan och raden till 30 dagar', async () => {
  const h = await slaPaMfa();
  const r = await loggaIn({ remember: true });
  assert.equal(r.body.mfaRequired, true);
  const fore = await rad(r.raw);
  assert.equal(fore.remember, true, 'valet tappades redan vid lösenordssteget');
  assert.equal(fore.mfa_verified_at, null);
  // me före verifieringen får aldrig rulla en halv session.
  const tidig = await anrop('GET', '/api/auth/me', undefined, r.vem);
  assert.equal(tidig.status, 403);
  assert.equal(tidig.kaka, null, 'me förnyade kakan för en session som inte klarat tvåsteget');
  const vem = { cookie: r.vem.cookie, csrf: tidig.body.csrfToken };
  await pool.query("UPDATE sessions SET expires_at=now()+interval '1 hour' WHERE id=$1", [fore.id]);
  const c = await anrop('POST', '/api/auth/mfa/challenge', { code: kodFor(h) }, vem);
  assert.equal(c.status, 200, 'challenge svarade ' + c.status + ': ' + JSON.stringify(c.body));
  assert.equal(kakvarde(c.kaka), r.raw);
  assert.equal(maxAge(c.kaka), MINNE, 'challenge gav inte den ihågkomna sessionen sin långa kaka');
  const efter = await rad(r.raw);
  assert.ok(efter.mfa_verified_at, 'sessionen verifierades inte');
  nara(efter.kvar, MINNE, 'challenge gav inte raden 30 dagar');
});

prov('tvåsteg utan rutan: challenge sätter ingen kaka och flyttar inte utgången', async () => {
  const h = await slaPaMfa();
  const r = await loggaIn({});
  assert.equal(maxAge(r.kaka), VANLIG);
  const fore = (await rad(r.raw)).expires_at.getTime();
  const c = await anrop('POST', '/api/auth/mfa/challenge', { code: kodFor(h) }, r.vem);
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.kaka, null, 'challenge satte en kaka för en vanlig session');
  assert.equal((await rad(r.raw)).expires_at.getTime(), fore);
});

// ---- 4 · ALLT SOM AVSLUTAR EN SESSION AVSLUTAR ÄVEN EN IHÅGKOMMEN ------------------------------

prov('utloggning tar bort den ihågkomna sessionen och nollar kakan', async () => {
  const r = await loggaIn({ remember: true });
  const ut = await anrop('POST', '/api/auth/logout', {}, r.vem);
  assert.equal(ut.status, 200);
  assert.match(ut.kaka, /vyra_session=;/); assert.match(ut.kaka, /Max-Age=0/);
  assert.match(ut.kaka, /HttpOnly/); assert.match(ut.kaka, /SameSite=Strict/);
  assert.equal(await rad(r.raw), null, 'raden ligger kvar efter utloggning');
  assert.equal((await anrop('GET', '/api/auth/me', undefined, r.vem)).status, 401,
    'den gamla kakan släpps fortfarande in');
});

prov('"Logga ut alla andra" tar bort ihågkomna sessioner på andra enheter', async () => {
  const andra = await loggaIn({ remember: true }), denna = await loggaIn({});
  const r = await anrop('DELETE', '/api/auth/sessions/all-others', undefined, denna.vem);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await rad(andra.raw), null, 'den ihågkomna sessionen överlevde "Logga ut alla andra"');
  assert.equal((await anrop('GET', '/api/auth/me', undefined, andra.vem)).status, 401);
  assert.ok(await rad(denna.raw), 'den egna sessionen ska vara kvar');
});

prov('lösenordsåterställning avslutar även en ihågkommen session', async () => {
  const r = await loggaIn({ remember: true });
  // Länken läggs direkt i tabellen: issue() lämnar aldrig ut råvärdet, bara mejlet gör det.
  const raw = S.token(32);
  await pool.query("INSERT INTO auth_tokens(user_id,purpose,token_hash,expires_at) VALUES($1,'reset_password',$2,now()+interval '30 minutes')",
    [ANV, S.digest(raw)]);
  const ny = await anrop('POST', '/api/auth/password/reset', { token: raw, password: LOSEN });
  assert.equal(ny.status, 200, JSON.stringify(ny.body));
  assert.equal(await rad(r.raw), null, 'den ihågkomna sessionen överlevde lösenordsbytet');
});
