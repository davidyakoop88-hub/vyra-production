'use strict';
// GÅVOIDENTITET — RÖDA PROV FÖRE IMPLEMENTATION.
//
// Syftet (docs/gavoidentitet-inlarning.md): lära in paret (giftId, giftName) ur de gåvoevent som
// redan passerar ingest-kedjan, BEKRÄFTA mappningen innan den får användas, och därefter matcha
// regler på giftId — aldrig på namnet.
//
// Bakgrunden är uppmätt, inte antagen: repots katalog saknar giftId helt, och rummets katalog
// kräver en betald Business-plan (docs/gavokatalog-matresultat.md, uppmätt i produktion
// 2026-08-26). Gåvoeventen är den enda kvarvarande källan som varken kostar eller kräver signering.
//
// BEKRÄFTELSEN ÄR HELA POÄNGEN. Tre gåvor från samma person är en observation upprepad, inte tre
// oberoende. Därför krävs BÅDE ≥3 observationer OCH ≥2 distinkta avsändare, och avsändaren räknas
// med husets serverägda identitet (identitet() i stream-stats.js) så att '@Anna' och 'anna' är
// samma person.
//
// Alla värden är syntetiska. Inga verkliga konto-, rums- eller gåvo-id.
const test = require('node:test'), assert = require('node:assert/strict');
const { Pool } = require('pg');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Räkning av distinkta avsändare går inte att prova mot en attrapp.';

let G = null;
try { G = require('../gavoidentitet'); } catch {}

const finns = () => assert.ok(G && typeof G.laraFranEvent === 'function' && typeof G.slaUppGiftId === 'function',
  'server/gavoidentitet.js finns inte än — modulen som äger inlärning och uppslag');

const AGARE = 'aaaaaaaa-0000-4000-8000-000000000001';
const WS = 'aaaaaaaa-1111-4000-8000-000000000001';
const WS2 = 'aaaaaaaa-2222-4000-8000-000000000002';

// Syntetiska gåvo-id. HEART_ME är den vi bygger för först.
const HEART_ME = '9101';
const HEART_ME_ANNAN_REGION = '9102';
const ROSE = '9103';

const A = 'provgivare_a', B = 'provgivare_b', C = 'provgivare_c';

let pool;
const prov = (namn, fn) => test('gavoidentitet: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);

let nr = 0;
const gava = (avsandare, giftId = HEART_ME, giftName = 'Heart Me', over = {}) => ({
  id: over.id || `gprov:${++nr}:${avsandare}`,
  type: 'gift', giftId, giftName,
  userId: over.userId !== undefined ? over.userId : avsandare,
  username: over.username !== undefined ? over.username : avsandare,
  count: 1, value: 5
});

const rader = async (ws = WS) => (await pool.query(
  'SELECT gift_id, gift_name, observationer, avsandare, bekraftad_at FROM gift_identity WHERE workspace_id=$1 ORDER BY gift_id, gift_name',
  [ws])).rows;

test.before(async () => {
  if (BLOCKED) return;
  pool = new Pool({ connectionString: DB_URL });
  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,'x','gavoidentitet-agare',now()) ON CONFLICT (id) DO NOTHING`, [AGARE, AGARE + '@t.invalid']);
  for (const [ws, namn] of [[WS, 'gid-a'], [WS2, 'gid-b']]) {
    await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,$2,$3)
      ON CONFLICT (id) DO NOTHING`, [ws, namn, AGARE]);
  }
});

test.beforeEach(async () => {
  if (BLOCKED) return;
  await pool.query('DELETE FROM gift_identity WHERE workspace_id IN ($1,$2)', [WS, WS2]);
});

test.after(async () => {
  if (BLOCKED) return;
  await pool.query('DELETE FROM gift_identity WHERE workspace_id IN ($1,$2)', [WS, WS2]);
  await pool.end();
});

// ---- INLÄRNINGEN ------------------------------------------------------------------------------

prov('en gåva skapar en oberäknad rad — men bekräftar ingenting', async () => {
  finns();
  await G.laraFranEvent(pool, WS, gava(A));
  const r = await rader();
  assert.equal(r.length, 1);
  assert.equal(r[0].gift_id, HEART_ME);
  assert.equal(r[0].gift_name, 'Heart Me');
  assert.equal(Number(r[0].observationer), 1);
  assert.equal(Number(r[0].avsandare), 1);
  assert.equal(r[0].bekraftad_at, null, 'en enda observation får aldrig bekräfta');
});

prov('tre gåvor från SAMMA person bekräftar inte', async () => {
  finns();
  for (let i = 0; i < 3; i++) await G.laraFranEvent(pool, WS, gava(A));
  const r = await rader();
  assert.equal(Number(r[0].observationer), 3);
  assert.equal(Number(r[0].avsandare), 1, 'samma person är en avsändare, oavsett antal gåvor');
  assert.equal(r[0].bekraftad_at, null, 'en ensam person får inte lära systemet på egen hand');

  // KONTROLLMÄTNING: en andra avsändare tippar över den och bekräftar.
  await G.laraFranEvent(pool, WS, gava(B));
  const r2 = await rader();
  assert.ok(r2[0].bekraftad_at, 'med 4 observationer och 2 avsändare ska den vara bekräftad');
});

prov('tröskeln är BÅDE 3 observationer OCH 2 avsändare', async () => {
  finns();
  // Två avsändare men bara två observationer — inte nog.
  await G.laraFranEvent(pool, WS, gava(A));
  await G.laraFranEvent(pool, WS, gava(B));
  let r = await rader();
  assert.equal(Number(r[0].observationer), 2);
  assert.equal(Number(r[0].avsandare), 2);
  assert.equal(r[0].bekraftad_at, null, '2 observationer räcker inte, även med 2 avsändare');

  // Tredje observationen tippar över.
  await G.laraFranEvent(pool, WS, gava(C));
  r = await rader();
  assert.ok(r[0].bekraftad_at);
});

prov('avsändarnyckeln kanoniseras — @Namn och namn är samma person', async () => {
  finns();
  await G.laraFranEvent(pool, WS, gava(A, HEART_ME, 'Heart Me', { username: '@Provgivare_A', userId: '@Provgivare_A' }));
  await G.laraFranEvent(pool, WS, gava(A, HEART_ME, 'Heart Me', { username: 'provgivare_a', userId: 'provgivare_a' }));
  await G.laraFranEvent(pool, WS, gava(A, HEART_ME, 'Heart Me', { username: 'PROVGIVARE_A', userId: 'PROVGIVARE_A' }));
  const r = await rader();
  assert.equal(Number(r[0].observationer), 3);
  assert.equal(Number(r[0].avsandare), 1, 'samma person i tre skiftlägen är EN avsändare');
  assert.equal(r[0].bekraftad_at, null);
});

prov('event utan giftId lär ingenting', async () => {
  finns();
  await G.laraFranEvent(pool, WS, gava(A, '', 'Heart Me'));
  assert.equal((await rader()).length, 0, 'utan id finns ingen identitet att lära');

  // KONTROLLMÄTNING.
  await G.laraFranEvent(pool, WS, gava(A, HEART_ME, 'Heart Me'));
  assert.equal((await rader()).length, 1);
});

prov('event utan användbar avsändare räknas inte som avsändare', async () => {
  finns();
  await G.laraFranEvent(pool, WS, gava('', HEART_ME, 'Heart Me', { userId: '', username: '' }));
  const r = await rader();
  if (r.length) assert.equal(Number(r[0].avsandare), 0, 'tom nyckel är ingen avsändare');
});

prov('likes och andra icke-gåvor lär ingenting', async () => {
  finns();
  await G.laraFranEvent(pool, WS, { id: 'gprov:like', type: 'like', userId: A, username: A, count: 100 });
  await G.laraFranEvent(pool, WS, { id: 'gprov:follow', type: 'follow', userId: A, username: A });
  assert.equal((await rader()).length, 0);
});

prov('workspaces lär var för sig', async () => {
  finns();
  for (const av of [A, B, C]) await G.laraFranEvent(pool, WS, gava(av));
  assert.ok((await rader(WS))[0].bekraftad_at);
  assert.equal((await rader(WS2)).length, 0, 'ett annat workspace ärver ingenting');
});

// ---- UPPSLAGET — BARA BEKRÄFTADE ID -----------------------------------------------------------

prov('obekräftad mappning ger INGEN träff', async () => {
  finns();
  await G.laraFranEvent(pool, WS, gava(A));
  assert.equal(await G.slaUppGiftId(pool, WS, 'Heart Me'), null,
    'en obekräftad mappning får aldrig användas för matchning');

  // KONTROLLMÄTNING: bekräfta den, då ska uppslaget svara.
  await G.laraFranEvent(pool, WS, gava(B));
  await G.laraFranEvent(pool, WS, gava(C));
  assert.equal(await G.slaUppGiftId(pool, WS, 'Heart Me'), HEART_ME);
});

prov('exakt namnmatchning vid uppslag — Heart Me Flex är en annan gåva', async () => {
  finns();
  for (const av of [A, B, C]) await G.laraFranEvent(pool, WS, gava(av, HEART_ME, 'Heart Me'));
  for (const av of [A, B, C]) await G.laraFranEvent(pool, WS, gava(av, '9199', 'Heart Me Flex'));

  assert.equal(await G.slaUppGiftId(pool, WS, 'Heart Me'), HEART_ME);
  assert.equal(await G.slaUppGiftId(pool, WS, 'Heart Me Flex'), '9199');
  assert.equal(await G.slaUppGiftId(pool, WS, 'Heart'), null, 'delsträng får aldrig matcha');
});

prov('TVETYDIGT: samma namn med två bekräftade id ger ingen träff', async () => {
  finns();
  // Regional variation är strukturellt verklig — katalogroutens webcastLanguage visar att TikTok
  // självt behandlar gåvor som språkberoende.
  for (const av of [A, B, C]) await G.laraFranEvent(pool, WS, gava(av, HEART_ME, 'Heart Me'));
  for (const av of [A, B, C]) await G.laraFranEvent(pool, WS, gava(av, HEART_ME_ANNAN_REGION, 'Heart Me'));

  assert.equal(await G.slaUppGiftId(pool, WS, 'Heart Me'), null,
    'två bekräftade id för samma namn är tvetydigt — hellre noll än fel gåva');
});

prov('tvetydigheten går att RAPPORTERA, inte bara tystna', async () => {
  finns();
  for (const av of [A, B, C]) await G.laraFranEvent(pool, WS, gava(av, HEART_ME, 'Heart Me'));
  for (const av of [A, B, C]) await G.laraFranEvent(pool, WS, gava(av, HEART_ME_ANNAN_REGION, 'Heart Me'));

  const ut = await G.status(pool, WS, 'Heart Me');
  assert.equal(ut.tvetydig, true);
  assert.equal(ut.bekraftade, 2, 'antalet ska gå att se — annars är läget osynligt för drift');
});

prov('okänt namn och tomt namn ger null', async () => {
  finns();
  assert.equal(await G.slaUppGiftId(pool, WS, 'Finns Inte'), null);
  assert.equal(await G.slaUppGiftId(pool, WS, ''), null);
  assert.equal(await G.slaUppGiftId(pool, WS, null), null);
});

// ---- REPLAY OCH SAMTIDIGHET -------------------------------------------------------------------

prov('samma eventId räknas en gång', async () => {
  finns();
  const e = gava(A);
  await G.laraFranEvent(pool, WS, e);
  await G.laraFranEvent(pool, WS, e);
  await G.laraFranEvent(pool, WS, e);
  const r = await rader();
  assert.equal(Number(r[0].observationer), 1, 'en replay är inte en ny observation');
});

prov('samtidiga observationer — sex omgångar, alltid rätt räkning', async () => {
  finns();
  // En kapplöpning räcker inte som samtidighetsvakt: vem som hinner först varierar.
  for (let omgang = 0; omgang < 6; omgang++) {
    await pool.query('DELETE FROM gift_identity WHERE workspace_id=$1', [WS]);
    await Promise.all([
      G.laraFranEvent(pool, WS, gava(A, HEART_ME, 'Heart Me', { id: `gprov:race:${omgang}:a` })),
      G.laraFranEvent(pool, WS, gava(B, HEART_ME, 'Heart Me', { id: `gprov:race:${omgang}:b` })),
      G.laraFranEvent(pool, WS, gava(C, HEART_ME, 'Heart Me', { id: `gprov:race:${omgang}:c` }))
    ]);
    const r = await rader();
    assert.equal(r.length, 1, `omgång ${omgang}: en rad, inte tre`);
    assert.equal(Number(r[0].observationer), 3, `omgång ${omgang}: alla tre ska räknas`);
    assert.equal(Number(r[0].avsandare), 3, `omgång ${omgang}: tre distinkta avsändare`);
    assert.ok(r[0].bekraftad_at, `omgång ${omgang}: ska vara bekräftad`);
  }
});

// ---- SAMMA ID, OLIKA NAMN ---------------------------------------------------------------------

prov('samma id med två namn blir två rader — inget skrivs över tyst', async () => {
  finns();
  await G.laraFranEvent(pool, WS, gava(A, HEART_ME, 'Heart Me'));
  await G.laraFranEvent(pool, WS, gava(A, HEART_ME, 'Hjärta Mig'));
  const r = await rader();
  assert.equal(r.length, 2, 'ett id som dyker upp med två namn är information, inte en dubblett');
});

// ---- ICKE-REGRESSION --------------------------------------------------------------------------

prov('inlärningen rör inte mål, statistik eller presentationssystem', async () => {
  finns();
  // Modulen får äga exakt en tabell. Ett prov som bara säger "inget annat hände" går grönt när
  // ingenting alls händer — därför kontrollmätningen först.
  for (const av of [A, B, C]) await G.laraFranEvent(pool, WS, gava(av));
  assert.ok((await rader())[0].bekraftad_at, 'kontrollmätning: inlärningen gjorde något');

  const goal = await pool.query('SELECT count(*)::int AS n FROM goal_runtime');
  const gifter = await pool.query('SELECT count(*)::int AS n FROM gifter_totals WHERE workspace_id=$1', [WS]);
  assert.equal(goal.rows[0].n, 0, 'inlärningen får inte skapa målrader');
  assert.equal(gifter.rows[0].n, 0, 'och inte statistikrader — det ägs av stream-stats');
});
