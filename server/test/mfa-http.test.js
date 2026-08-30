'use strict';
// TVÅFAKTOR ÖVER HTTP — rutterna, inte modulen.
//
// server/test/mfa.test.js provar mfa.js: HOTP-vektorerna, driftfönstret, förseglingen. Allt det är
// korrekt och har alltid varit det. RUTTERNA var obevisade, och där låg felet.
//
// 2026-08-30 mättes att /api/auth/mfa/confirm faller när koden är RÄTT. Raden binder en JS-array
// mot `mfa_recovery_hashes jsonb` (schema.sql:10), och node-pg serialiserar JS-arrayer till
// POSTGRES ARRAYLITTERAL — {"a","b"} — inte till JSON. Postgres svarar 22P02, transaktionen
// rullar tillbaka, och den globala felhanteraren gör 500 av det. Alltså:
//
//     fel kod  -> 401 "Fel kod"           (avvisas före transaktionen)
//     RÄTT kod -> 500 "Internt serverfel"  (transaktionen kastar)
//
// Och eftersom mfa_enabled_at aldrig sätts trippar 409:an i /mfa/setup aldrig, så nästa försök
// skriver en NY hemlighet över den gamla — därav "Fel kod" på alla efterföljande försök. Två
// symptom, en rot.
//
// Rutten var oförändrad sedan 8bb0cdf "Initial VYRA production release". Ingen kund har någonsin
// kunnat slå på tvåfaktor. Källkoden ser korrekt ut — det är därför den här filen mäter mot en
// RIKTIG Postgres i stället för att läsa koden.
//
// TRE SKRIVSTÄLLEN TILL bär samma fel och är LATENTA bara så länge confirm faller. De blir aktiva
// i samma sekund som confirm lagas, så de provas här också:
//   rad 375  /mfa/setup            — lagrar tyst {} (objekt) där schemat menar [] (array)
//   rad 249  checkMfaCode          — förbrukningen av en återställningskod
//   rad 377  /mfa/recovery-codes   — utfärdandet av nya koder
//
// BLOCKERAT utan isolerad Postgres: en attrapp kan inte skilja en arraylitteral från JSON. Det är
// hela poängen med provet.
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
const ANV = 'beef0000-0000-4000-8000-000000000001';
const LOSEN = 'Prov-Losenord-9134!';

// Sessionen skapas direkt i databasen. mfaVerifierad=false behövs för utmaningsprovet: rutten
// /mfa/challenge kräver en session som ÄNNU INTE är verifierad.
async function session(mfaVerifierad = true) {
  const ra = S.token(), csrf = S.token();
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)' +
    " VALUES ($1,$2,$3, now() + interval '1 hour', " + (mfaVerifierad ? 'now()' : 'NULL') + ')',
    [ANV, S.digest(ra), S.digest(csrf)]);
  return { cookie: 'vyra_session=' + ra, csrf };
}

async function anrop(vag, kropp, vem) {
  const res = await fetch(bas + vag, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: vem.cookie, 'x-vyra-csrf': vem.csrf },
    body: JSON.stringify(kropp || {})
  });
  const text = await res.text();
  let d = null; try { d = JSON.parse(text) } catch { /* inte json */ }
  return { status: res.status, body: d };
}

// KODEN RÄKNAS FRAM UR HEMLIGHETEN, inte hårdkodad. Samma steg som servern använder:
// floor(now/30000). Driftfönstret i verify() är -1..+1, så ett fönsterbyte mellan raderna spelar
// ingen roll.
const kodFor = hemlighet => MFA.hotp(hemlighet, Math.floor(Date.now() / 30000));

// Läser tillståndet SOM POSTGRES SER DET. jsonb_typeof är hela provet: en arraylitteral kan aldrig
// bli 'array'. jsonb_array_length kastar på icke-arrayer, därav CASE.
async function lagrat() {
  const q = await pool.query(
    "SELECT jsonb_typeof(mfa_recovery_hashes) AS typ," +
    "       CASE WHEN jsonb_typeof(mfa_recovery_hashes)='array'" +
    '            THEN jsonb_array_length(mfa_recovery_hashes) END AS antal,' +
    '       mfa_enabled_at, mfa_secret_enc' +
    '  FROM users WHERE id=$1', [ANV]);
  return q.rows[0];
}

// Slår på MFA hela vägen och returnerar hemligheten + koderna. Påståendet om status ligger HÄR så
// att de prov som bygger vidare faller med ett läsbart skäl i stället för på en följdkrasch.
async function slaPaMfa(vem) {
  const upp = await anrop('/api/auth/mfa/setup', {}, vem);
  assert.equal(upp.status, 200, 'setup svarade inte 200');
  const bekraft = await anrop('/api/auth/mfa/confirm', { code: kodFor(upp.body.secret) }, vem);
  assert.equal(bekraft.status, 200,
    'confirm med RÄTT kod svarade ' + bekraft.status + ' (' + (bekraft.body && bekraft.body.error) + ')');
  return { hemlighet: upp.body.secret, koder: bekraft.body.recoveryCodes };
}

// SKIP AVGÖRS INUTI KROPPEN. skip:null kör kroppen men kastar resultatet — hela tabellen står i
// tests/goal-postgres-flode.test.js. Redis-kontrollen är dessutom asynkron och hinner inte klart
// innan proven REGISTRERAS.
const prov = (namn, fn) => test('mfa-http: ' + namn, { timeout: 30000 }, async t => {
  const skal = await blockerad();
  if (skal) { t.skip(skal); return; }
  await fn();
});

test.before(async () => {
  if (await blockerad()) return;
  S = require('../security');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  await pool.query(
    'INSERT INTO users (id,email,password_hash,display_name,email_verified_at)' +
    " VALUES ($1,$2,$3,'mfaprov',now())" +
    ' ON CONFLICT (id) DO UPDATE SET password_hash=$3, email_verified_at=now()',
    [ANV, ANV + '@t.invalid', S.hashPassword(LOSEN)]);

  await new Promise(klar => server.listen(0, '127.0.0.1', klar));
  bas = 'http://127.0.0.1:' + server.address().port;
});

// Varje prov börjar från ett konto UTAN tvåfaktor. Utan det ärver prov nummer två 409:an från
// prov nummer ett.
test.beforeEach(async () => {
  if (await blockerad()) return;
  await pool.query('DELETE FROM sessions WHERE user_id=$1', [ANV]);
  await pool.query(
    'UPDATE users SET mfa_secret_enc=NULL, mfa_enabled_at=NULL,' +
    "                 mfa_recovery_hashes='[]'::jsonb WHERE id=$1", [ANV]);
});

test.after(async () => {
  if (await blockerad()) return;
  await pool.query('DELETE FROM sessions WHERE user_id=$1', [ANV]);
  await pool.query('DELETE FROM users WHERE id=$1', [ANV]);
  // TEARDOWN I TRE DELAR. Utan closeAllConnections håller keep-alive-anslutningarna servern öppen
  // och hela jobbet hänger.
  await new Promise(klar => {
    server.close(klar);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.end();
});

// ---- 1 · SETUP -------------------------------------------------------------------------------

prov('setup lagrar en jsonb-ARRAY, inte ett objekt', async () => {
  const vem = await session();
  const r = await anrop('/api/auth/mfa/setup', {}, vem);
  assert.equal(r.status, 200);
  assert.ok(r.body.secret, 'setup gav ingen hemlighet');
  assert.ok(String(r.body.uri || '').startsWith('otpauth://totp/'), 'setup gav ingen otpauth-URI');

  const rad = await lagrat();
  // En JS-array [] binds som arraylitteralen {} — vilket Postgres tar emot som ett jsonb-OBJEKT.
  // Skillnaden är osynlig i källkoden och osynlig i svaret, men inte här.
  assert.equal(rad.typ, 'array',
    'mfa_recovery_hashes lagrades som ' + rad.typ + ', inte array — arraylitteral i stället för JSON');
  assert.equal(rad.antal, 0);
});

// QR-KODEN OVER RUTTEN. mfa.test.js provar att modulen kodar ratt; det har provet stanger luckan
// mellan modulen och RUTTEN — att `qrModuler` faktiskt matas med `uri` och inte med `secret`,
// `email` eller nagot annat som ger en giltig QR som ingen autentiseringsapp forstar.
const jsQR = require('jsqr');
function qrTillBild(qr, skala = 4, tyst = 4) {
  const n = qr.storlek, sid = (n + tyst * 2) * skala;
  const d = new Uint8ClampedArray(sid * sid * 4).fill(255);
  for (let y = 0; y < sid; y++) for (let x = 0; x < sid; x++) {
    const r = Math.floor(y / skala) - tyst, c = Math.floor(x / skala) - tyst;
    if (r >= 0 && c >= 0 && r < n && c < n && qr.moduler.charCodeAt(r * n + c) === 49) {
      const i = (y * sid + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0;
    }
  }
  return { data: d, sid };
}

prov('setup levererar en QR-kod som avkodas till samma uri som svaret bär', async () => {
  const vem = await session();
  const r = await anrop('/api/auth/mfa/setup', {}, vem);
  assert.equal(r.status, 200);
  assert.ok(r.body.qr && r.body.qr.storlek, 'setup-svaret bar ingen QR-kod');
  assert.equal(r.body.qr.moduler.length, r.body.qr.storlek * r.body.qr.storlek,
    'moduldatan ar inte kvadratisk');

  const b = qrTillBild(r.body.qr);
  const avkodat = jsQR(b.data, b.sid, b.sid);
  assert.ok(avkodat, 'QR-koden gick inte att avkoda alls');
  // Det harda pastaendet: koden bar EXAKT den uri rutten sjalv returnerade.
  assert.equal(avkodat.data, r.body.uri, 'QR-koden och `uri` i svaret ar inte samma strang');
  assert.ok(avkodat.data.includes('secret=' + r.body.secret),
    'QR-koden bar inte den hemlighet som just utfardades');
});

// ---- 2 · CONFIRM -----------------------------------------------------------------------------

prov('confirm med RÄTT kod ger 200 — inte 500', async () => {
  const vem = await session();
  const upp = await anrop('/api/auth/mfa/setup', {}, vem);
  assert.equal(upp.status, 200);

  const r = await anrop('/api/auth/mfa/confirm', { code: kodFor(upp.body.secret) }, vem);
  // Det här påståendet är hela filens existensberättigande. 500 här = felet lever.
  assert.equal(r.status, 200,
    'confirm svarade ' + r.status + ' på en KORREKT kod: ' + JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.ok(Array.isArray(r.body.recoveryCodes), 'confirm gav inga återställningskoder');
  assert.equal(r.body.recoveryCodes.length, 10);
});

prov('confirm lagrar tio hashar som en jsonb-array och sätter mfa_enabled_at', async () => {
  const vem = await session();
  await slaPaMfa(vem);

  const rad = await lagrat();
  assert.equal(rad.typ, 'array', 'hasharna lagrades som ' + rad.typ + ', inte array');
  assert.equal(rad.antal, 10, 'fel antal lagrade hashar');
  assert.ok(rad.mfa_enabled_at, 'mfa_enabled_at sattes aldrig — transaktionen rullade tillbaka');
});

prov('confirm med FEL kod ger fortfarande 401 och slår inte på MFA', async () => {
  const vem = await session();
  const upp = await anrop('/api/auth/mfa/setup', {}, vem);
  assert.equal(upp.status, 200);

  // Kontrollprov mot en fix som gör allt till 200. Koden är giltig till formen men fel till värdet.
  const fel = String((Number(kodFor(upp.body.secret)) + 1) % 1000000).padStart(6, '0');
  const r = await anrop('/api/auth/mfa/confirm', { code: fel }, vem);
  assert.equal(r.status, 401, 'en FELAKTIG kod ska avvisas, inte accepteras');
  assert.equal((await lagrat()).mfa_enabled_at, null, 'MFA slogs på trots fel kod');
});

// ---- 3 · ÅTERSTÄLLNINGSKODERNA ---------------------------------------------------------------

prov('en återställningskod förbrukas och arrayen krymper till nio', async () => {
  const vem = await session();
  const { koder } = await slaPaMfa(vem);

  // Utmaningen kräver en session som ännu inte är MFA-verifierad. confirm nollar dessutom
  // mfa_verified_at för alla sessioner, så den skapas EFTER påslaget.
  const ny = await session(false);
  const r = await anrop('/api/auth/mfa/challenge', { code: koder[0] }, ny);
  assert.equal(r.status, 200, 'en giltig återställningskod nekades: ' + JSON.stringify(r.body));
  assert.equal(r.body.recoveryCodeUsed, true);

  const rad = await lagrat();
  assert.equal(rad.typ, 'array', 'förbrukningen skrev ' + rad.typ + ', inte array');
  assert.equal(rad.antal, 9, 'den förbrukade koden togs inte bort');
});

prov('recovery-codes utfärdar tio nya och behåller arraytypen', async () => {
  const vem = await session();
  const { koder } = await slaPaMfa(vem);

  const r = await anrop('/api/auth/mfa/recovery-codes', { password: LOSEN }, vem);
  assert.equal(r.status, 200, 'recovery-codes svarade ' + r.status + ': ' + JSON.stringify(r.body));
  assert.equal(r.body.recoveryCodes.length, 10);
  assert.notDeepEqual(r.body.recoveryCodes, koder, 'samma koder utfärdades igen');

  const rad = await lagrat();
  assert.equal(rad.typ, 'array', 'de nya koderna lagrades som ' + rad.typ + ', inte array');
  assert.equal(rad.antal, 10);
});
