'use strict';
// TVÅSTEGSINLOGGNING I SKRIVBORDSAPPEN — ETT GARANTERAT FEL, INTE EN KAPPLÖPNING.
//
// Uppmätt i produktion 2026-09-15: David kom in på vyralive.app men aldrig i appen. Loggen visade
// POST /api/auth/login 200 följt av POST /api/auth/mfa/challenge 401, om och om igen.
//
// Orsaken låg i mötet mellan två rader som var för sig är riktiga:
//   - GET /api/auth/me ROTERAR csrf_hash vid varje anrop,
//   - appens huvudprocess pollar just den rutten EN GÅNG I SEKUNDEN medan man loggar in.
// Sidan sparar sin token när lösenordet går igenom. Att läsa en sexsiffrig kod från telefonen tar
// längre tid än en sekund, så token hann ALLTID roteras bort. session(req,{csrf:true}) gav null och
// svaret blev 401 innan koden ens lästes — därför hjälpte inte heller en återställningskod.
//
// Provet mäter det som faktiskt gick sönder: att en INAKTUELL token inte längre sänker utmaningen.
// Ett prov som bara skickar färsk token hade varit grönt hela tiden buggen fanns.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const KALLA = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

// ---------------------------------------------------------------- utan databas: ordningen i källan
// Rutten MÅSTE ligga före den delade session-raden. Flyttas den tillbaka återuppstår buggen exakt,
// och då ska det här provet falla — även på en maskin utan Postgres.
test('utmaningsrutten avgörs före den delade csrf-raden', () => {
  const rutt = KALLA.indexOf("p==='/api/auth/mfa/challenge'");
  const delad = KALLA.indexOf("await session(req,{csrf:req.method!=='GET'})");
  assert.ok(rutt > 0, 'hittade inte utmaningsrutten');
  assert.ok(delad > 0, 'hittade inte den delade session-raden');
  assert.ok(rutt < delad,
    'utmaningsrutten ligger efter den delade csrf-raden igen — då kräver den en token som '
    + 'skrivbordsappens pollning roterar bort, och tvåsteg i appen slutar fungera helt');
});

test('utmaningen och utloggningen skyddas av ursprung i stället för delad token', () => {
  for (const rutt of ["/api/auth/mfa/challenge", "/api/auth/logout"]) {
    const i = KALLA.indexOf(`p==='${rutt}'`);
    assert.ok(i > 0, `hittade inte ${rutt}`);
    const block = KALLA.slice(i, i + 400);
    assert.match(block, /sameOrigin\(req\)/,
      `${rutt} saknar ursprungskontroll — utan den är rutten oskyddad när csrf-kravet är borta`);
    assert.doesNotMatch(block.slice(0, 200), /session\(req,\{csrf:true\}\)/,
      `${rutt} kräver delad csrf-token igen`);
  }
});

// ------------------------------------------------------------------ med databas: rutten på riktigt
const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Rutten är oprövad tills TEST_DATABASE_URL pekar på en '
    + 'engångsdatabas — källäsningen ovan bevisar ordningen, inte beteendet.';
const http = (namn, fn) => test(`http: ${namn}`, { timeout: 30000, skip: BLOCKED }, fn);

// Nyckeln måste stå INNAN token-vault laddas, precis som i mfa-http.test.js: seal() läser
// process.env vid anrop och CI sätter ingen nyckel för det här jobbet. Utan raden kastar
// before()-haken — och en trasig before fäller HELA filen, även källäsningarna ovan som inte
// rör databasen alls. Det var precis så det såg ut i första CI-körningen.
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || Buffer.alloc(32, 13).toString('base64url');
if (!BLOCKED) process.env.DATABASE_URL = DB_URL;

let server = null, eventBus = null, pool = null, S = null, MFA = null, base = '';
const ANVANDARE = 'cccccccc-0000-0000-0000-000000000abc';
let hemlighet = null, kaka = null, gammalCsrf = null;

test.before(async () => {
  if (BLOCKED) return;
  S = require('../security');
  MFA = require('../mfa');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  hemlighet = MFA.newSecret();
  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at,mfa_enabled_at,mfa_secret_enc,mfa_recovery_hashes)
     VALUES ($1,$2,'x','mfa-csrf',now(),now(),$3,$4::jsonb)
     ON CONFLICT (id) DO UPDATE SET mfa_enabled_at=now(),mfa_secret_enc=EXCLUDED.mfa_secret_enc,
       mfa_recovery_hashes=EXCLUDED.mfa_recovery_hashes,email_verified_at=now()`,
    [ANVANDARE, `${ANVANDARE}@test.invalid`, MFA.encryptedSecret(hemlighet),
      // jsonb tar en STRÄNG, aldrig en JS-array: node-pg binder arrayer som Postgres arrayliteral
      // och en tom array blir '{}', som tyst accepteras som ett objekt.
      JSON.stringify([MFA.hashRecovery('AAAA-BBBB')])]);

  // En session som klarat lösenordet men INTE andra steget — exakt appens läge.
  const raw = S.token(); gammalCsrf = S.token();
  await pool.query(
    `INSERT INTO sessions (user_id,token_hash,csrf_hash,expires_at,mfa_verified_at)
     VALUES ($1,$2,$3,now() + interval '1 hour', NULL)`,
    [ANVANDARE, S.digest(raw), S.digest(gammalCsrf)]);
  kaka = `vyra_session=${raw}`;

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (BLOCKED) return;
  await new Promise(r => { server.close(r); server.closeAllConnections?.(); });
  await eventBus.close().catch(() => {});
  await pool.query('DELETE FROM sessions WHERE user_id=$1', [ANVANDARE]);
  await pool.query('DELETE FROM users WHERE id=$1', [ANVANDARE]);
  await pool.end();
});

const utmana = (kod, extra = {}) => fetch(`${base}/api/auth/mfa/challenge`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: kaka, ...extra },
  body: JSON.stringify({ code: kod }),
});

http('appens pollning roterar token — utmaningen släpper ändå igenom rätt kod', async () => {
  // Steg 1: precis det appen gör varje sekund. Rutten skriver ett nytt csrf_hash.
  const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: kaka } });
  assert.equal(me.status, 403, 'sessionen ska sakna andra steget');

  // Steg 2: sidans sparade token är nu inaktuell. Före fixen gav det 401 utan att koden lästes.
  const res = await utmana(MFA.hotp(hemlighet, Math.floor(Date.now() / 30000)),
    { 'x-vyra-csrf': gammalCsrf });
  const kropp = await res.json();
  assert.equal(res.status, 200,
    `inaktuell token sänkte utmaningen igen (svar: ${JSON.stringify(kropp)})`);

  const q = await pool.query('SELECT mfa_verified_at FROM sessions WHERE user_id=$1', [ANVANDARE]);
  assert.ok(q.rows[0].mfa_verified_at, 'sessionen markerades aldrig som verifierad');
});

http('fel kod nekas fortfarande — och 401 betyder nu verkligen fel kod', async () => {
  await pool.query('UPDATE sessions SET mfa_verified_at=NULL WHERE user_id=$1', [ANVANDARE]);
  const res = await utmana('000000');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'Fel kod',
    'svaret ska skilja fel kod från utkastad session — den tvetydigheten dolde buggen i fyra timmar');
});

http('ett anrop från en annan sajt stoppas av ursprungskontrollen', async () => {
  const res = await utmana(MFA.hotp(hemlighet, Math.floor(Date.now() / 30000)),
    { origin: 'https://angripare.invalid' });
  assert.equal(res.status, 403, 'utan token är ursprunget hela skyddet — det måste hålla');
});
