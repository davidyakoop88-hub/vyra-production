'use strict';
// SEEDNINGSVÄGEN — de tre adminrutterna som faktiskt fyller katalogen.
//
// Modulen bakom dem är provad i gavokatalog.test.js, men RUTTERNA var helt obevisade när jag först
// skrev dem. Det är just den vägen som gör att katalogen alls hamnar i produktion: går den sönder
// postar David 783 gåvor och får ingenting, och felet upptäcks för hand.
//
// Fyra saker mäts här, och alla fyra kan gå fel var för sig:
//   1. behörigheten          — bara plattformsadministratör får seeda
//   2. bulkvägen             — hela listan i ett anrop, med sanering av utifrån kommande fält
//   3. verifieringen         — och att den vägrar ett id katalogen inte känner
//   4. statussvaret          — räknar, men avslöjar aldrig VILKA id som finns
//
// BLOCKERAT utan isolerad Postgres: behörighet och främmande nycklar går inte att prova mot en
// attrapp.
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
const K = require('../gavokatalog');
const ADMIN = 'cafe0000-0000-4000-8000-000000000001';
const VANLIG = 'cafe0000-0000-4000-8000-000000000002';
const auth = {};

const G1 = 'httprov-9001', G2 = 'httprov-9002';
const post = (id, namn) => ({ id, name: namn, diamond_count: 1,
  image: { url_list: ['https://p16.example.invalid/' + id + '.png'] } });

async function session(userId) {
  const ra = S.token(), csrf = S.token();
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)
     VALUES ($1,$2,$3, now() + interval '1 hour', now())`,
    [userId, S.digest(ra), S.digest(csrf)]);
  return { cookie: 'vyra_session=' + ra, csrf };
}

async function anrop(metod, vag, { som = null, kropp = null } = {}) {
  const vem = som ? auth[som] : null;
  const res = await fetch(bas + vag, {
    method: metod,
    headers: { ...(kropp ? { 'content-type': 'application/json' } : {}),
      ...(vem ? { cookie: vem.cookie, 'x-vyra-csrf': vem.csrf } : {}) },
    ...(kropp ? { body: JSON.stringify(kropp) } : {})
  });
  const text = await res.text();
  let d = null; try { d = JSON.parse(text) } catch { /* inte json */ }
  return { status: res.status, body: d };
}

// SKIP AVGORS INUTI KROPPEN, inte i optionsobjektet — och det ar inte en stilfraga.
//
// Uppmatt i Node: ett FALSKT varde som inte ar `false` — `null` eller tom strang — markerar provet
// som overhoppat MEN KOR KROPPEN ANDA, och kastar resultatet. (Sanna varden hoppar over korrekt;
// hela tabellen star i tests/goal-postgres-flode.test.js.) Med `skip: null` — vilket det blir har
// eftersom BLOCKED anvander null som "inte matt an" — kordes alla tolv proven i CI och
// rapporterades som SKIP. Ett fallande pastaende hade varit osynligt.
//
// Redis-kontrollen ar dessutom asynkron och kan inte hinna klart innan proven REGISTRERAS. Darfor
// samma monster som goal-ingest-http.test.js: vanta ut kontrollen i kroppen och anropa t.skip().
const prov = (namn, fn) => test('katalog-http: ' + namn, { timeout: 30000 }, async t => {
  const skal = await blockerad();
  if (skal) { t.skip(skal); return; }
  await fn();
});

test.before(async () => {
  if (await blockerad()) return;
  S = require('../security');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  for (const [id, admin] of [[ADMIN, true], [VANLIG, false]]) {
    await pool.query(
      `INSERT INTO users (id,email,password_hash,display_name,email_verified_at,is_platform_admin)
       VALUES ($1,$2,'x','katalogprov',now(),$3) ON CONFLICT (id) DO UPDATE SET is_platform_admin=$3`,
      [id, id + '@t.invalid', admin]);
  }
  auth.admin = await session(ADMIN);
  auth.vanlig = await session(VANLIG);

  await new Promise(klar => server.listen(0, '127.0.0.1', klar));
  bas = 'http://127.0.0.1:' + server.address().port;
});

async function rensa() {
  await pool.query("DELETE FROM gavoregel_kalla WHERE gift_id LIKE 'httprov-%'");
  await pool.query("DELETE FROM gavoregel WHERE gift_id LIKE 'httprov-%'");
  await pool.query("DELETE FROM gavokatalog WHERE gift_id LIKE 'httprov-%'");
}
// CACHEN TOMMS MELLAN PROV. rensa() raderar rader, men verifieradeId har en 30-sekunderscache i
// processen — och proven kor i SAMMA process som servern. Utan tomningen lever en verifiering fran
// ett tidigare prov vidare over rensningen, och nasta prov laser ett svar som inte langre stammer.
// Precis det fallet foll i CI.
test.beforeEach(async () => { if (!(await blockerad())) { await rensa(); K.tomCache(); } });
test.after(async () => {
  if (await blockerad()) return;
  await rensa();
  await pool.query('DELETE FROM sessions WHERE user_id = ANY($1::uuid[])', [[ADMIN, VANLIG]]);

  // TEARDOWN I TRE DELAR, och alla tre behovs. Forsta versionen gjorde bara server.close() och
  // HANGDE CI: keep-alive-anslutningarna fran fetch-anropen haller servern oppen, sa callbacken
  // loser aldrig ut. Redis-prenumerationen och Postgres-poolen haller dessutom handelseloopen vid
  // liv efter att provet ar klart.
  await new Promise(klar => {
    server.close(klar);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.end();
});

// ---- 1 · BEHÖRIGHETEN --------------------------------------------------------------------------

prov('utan inloggning går ingenting att seeda', async () => {
  const r = await anrop('POST', '/api/admin/gavokatalog', { kropp: { gifts: [post(G1, 'Rose')] } });
  assert.equal(r.status, 401);
  const q = await pool.query("SELECT count(*)::int n FROM gavokatalog WHERE gift_id LIKE 'httprov-%'");
  assert.equal(q.rows[0].n, 0, 'något skrevs trots 401');
});

prov('en vanlig inloggad användare nekas', async () => {
  // Katalogen styr vad hela plattformen känner igen. En vanlig kund får aldrig skriva i den.
  const r = await anrop('POST', '/api/admin/gavokatalog', { som: 'vanlig', kropp: { gifts: [post(G1, 'Rose')] } });
  assert.equal(r.status, 403);
  const q = await pool.query("SELECT count(*)::int n FROM gavokatalog WHERE gift_id LIKE 'httprov-%'");
  assert.equal(q.rows[0].n, 0);
});

prov('utan CSRF-huvud nekas även en administratör', async () => {
  const res = await fetch(bas + '/api/admin/gavokatalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: auth.admin.cookie },
    body: JSON.stringify({ gifts: [post(G1, 'Rose')] })
  });
  assert.equal(res.status, 401, 'en POST utan CSRF ska falla på sessionskontrollen');
});

// ---- 2 · BULKVÄGEN -----------------------------------------------------------------------------

prov('administratören seedar hela listan i ETT anrop', async () => {
  const r = await anrop('POST', '/api/admin/gavokatalog',
    { som: 'admin', kropp: { gifts: [post(G1, 'Rose'), post(G2, 'Heart Me')] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.skrivna, 2);

  const q = await pool.query(
    "SELECT gift_name,kalla FROM gavokatalog WHERE gift_id=$1", [G2]);
  assert.equal(q.rows[0].gift_name, 'Heart Me');
  assert.equal(q.rows[0].kalla, 'katalog');
});

prov('en trasig post fäller inte hela bulken', async () => {
  // En enda dålig post bland 783 får inte kosta katalogen.
  const r = await anrop('POST', '/api/admin/gavokatalog',
    { som: 'admin', kropp: { gifts: [post(G1, 'Rose'), { name: 'utan id' }, post(G2, 'X')] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.skrivna, 2);
  assert.equal(r.body.hoppade, 1);
});

prov('en tom eller felformad kropp skriver ingenting', async () => {
  for (const kropp of [{}, { gifts: null }, { gifts: 'inte en lista' }, { gifts: [] }]) {
    const r = await anrop('POST', '/api/admin/gavokatalog', { som: 'admin', kropp });
    assert.equal(r.status, 200, JSON.stringify(kropp) + ' gav fel status');
    assert.equal(r.body.skrivna, 0);
  }
});

prov('fält utifrån saneras — inget går orört in i databasen', async () => {
  const langt = 'A'.repeat(500);
  const langUrl = 'https://x.invalid/' + 'b'.repeat(2000);
  await anrop('POST', '/api/admin/gavokatalog', {
    som: 'admin',
    kropp: { gifts: [{ id: G1, name: langt, diamond_count: -5, image: { url_list: [langUrl] } }] }
  });
  const q = await pool.query(
    'SELECT gift_name,gift_image,diamanter FROM gavokatalog WHERE gift_id=$1', [G1]);
  assert.ok(q.rows[0].gift_name.length <= 160, 'namnet kapades inte');
  assert.equal(q.rows[0].diamanter, 0, 'ett negativt antal diamanter slapp igenom');
  // BILDEN ÄR DET ENDA FÄLTET SOM BÄR EN ANGRIPARSTYRD URL, och provet hette redan "fält utifrån
  // saneras" utan att röra den: `langUrl` byggdes på 2019 tecken och kastades sedan bort.
  // Mutationsmätt: ta bort `, 1200` ur text(...) i gavokatalog.js och provet var fortfarande grönt.
  assert.ok(q.rows[0].gift_image.length <= 1200, 'en 2019 tecken lång URL gick orörd in i databasen');
  assert.ok(q.rows[0].gift_image.startsWith('https://x.invalid/'), 'fel fält hamnade i gift_image');
});

// ---- 3 · VERIFIERINGEN -------------------------------------------------------------------------

prov('verifiering gör ett katalog-id matchbart', async () => {
  await anrop('POST', '/api/admin/gavokatalog', { som: 'admin', kropp: { gifts: [post(G2, 'Heart Me')] } });

  const fore = await pool.query("SELECT count(*)::int n FROM gavoregel WHERE status='verifierad' AND gift_id=$1", [G2]);
  assert.equal(fore.rows[0].n, 0, 'ett katalog-id var matchbart innan någon verifierat det');

  const r = await anrop('POST', '/api/admin/gavoregel/heart_me/verifiera', { som: 'admin', kropp: { giftId: G2 } });
  assert.equal(r.status, 200);

  assert.ok((await K.verifieradeId(pool, 'heart_me')).includes(G2));
});

prov('ett id katalogen inte känner kan inte verifieras', async () => {
  const r = await anrop('POST', '/api/admin/gavoregel/heart_me/verifiera',
    { som: 'admin', kropp: { giftId: 'httprov-finns-ej' } });
  assert.equal(r.status, 409);
  assert.equal(r.body.skal, 'okand-gava');
});

prov('en påhittad regelnyckel avvisas', async () => {
  // Nyckeln valideras av servern (regelnycklar.js) — webbläsaren väljer aldrig vilken låda något
  // hamnar i.
  const r = await anrop('POST', '/api/admin/gavoregel/hittepa/verifiera', { som: 'admin', kropp: { giftId: G2 } });
  assert.equal(r.status, 400);
});

prov('en vanlig användare kan inte verifiera', async () => {
  await anrop('POST', '/api/admin/gavokatalog', { som: 'admin', kropp: { gifts: [post(G2, 'Heart Me')] } });
  const r = await anrop('POST', '/api/admin/gavoregel/heart_me/verifiera', { som: 'vanlig', kropp: { giftId: G2 } });
  assert.equal(r.status, 403);
  assert.ok(!(await K.verifieradeId(pool, 'heart_me')).includes(G2));
});

// ---- 4 · STATUSSVARET AVSLÖJAR INGA ID ---------------------------------------------------------

prov('status räknar, men lämnar aldrig ut vilka id som finns', async () => {
  await anrop('POST', '/api/admin/gavokatalog', { som: 'admin', kropp: { gifts: [post(G1, 'Rose'), post(G2, 'Heart Me')] } });
  await anrop('POST', '/api/admin/gavoregel/heart_me/verifiera', { som: 'admin', kropp: { giftId: G2 } });

  const r = await anrop('GET', '/api/admin/gavokatalog/status', { som: 'admin' });
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes(G1) && !text.includes(G2), 'svaret bär råa gåvo-id');
  assert.ok(!text.includes('Heart Me'), 'svaret bär gåvonamn');
  // KONTROLLMÄTNING: det ska ändå säga något — annars bevisar negationerna ingenting.
  assert.ok(Array.isArray(r.body.katalog) && r.body.katalog.length > 0, 'status svarade tomt');
});
