'use strict';
// GÅVOIDENTITET — MANUELLT LÄRLÄGE. RÖDA PROV FÖRE IMPLEMENTATION.
//
// Flödet (docs/gavoidentitet-inlarning.md): välj regel → armera → NÄSTA giltiga, icke-dubblerade
// gåvoevent fångas → Studio visar namn och bild → Bekräfta eller Avbryt → först vid Bekräfta
// sparas giftId för just den regeln och det workspacet.
//
// INGEN observationströskel, INGA avsändarlistor, INGEN automatisk namn→id-katalog. Människan i
// mitten ÄR bekräftelsen. Proven vaktar särskilt att fångsten inte i sig sparar något, och att
// ingenting om avsändaren någonsin lagras.
//
// SLUTFRAMES: en streak levererar många frames för samma gåva, men mellanframes filtreras bort
// redan vid källan. Varje gåvoevent som når servern ÄR därför en slutframe.
//
// KÄLLAN ÄR TVÅ, INTE EN. Molnbryggan (tiktok-bridge/bridge.js) och Electron-appen
// (electron-app/tiktok-service.js) har VAR SIN egen kopia av regeln — appen har den inline, inte
// via normalizer.js. En vakt över bara bryggan bevisar ingenting om Windows-appen, och en
// användare på desktop hade fått mellanframes utan att något prov märkte det. Båda vaktas nedan.
//
// Alla värden är syntetiska.
const test = require('node:test'), assert = require('node:assert/strict');
const { Pool } = require('pg');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Armering med utgångstid går inte att prova mot en attrapp.';

let G = null;
try { G = require('../gavoidentitet'); } catch {}

const finns = () => assert.ok(G
  && typeof G.armera === 'function' && typeof G.fangaFranEvent === 'function'
  && typeof G.bekrafta === 'function' && typeof G.avbryt === 'function'
  && typeof G.slaUppGiftId === 'function',
  'server/gavoidentitet.js finns inte än — modulen som äger lärläget');

const AGARE = 'aaaaaaaa-0000-4000-8000-000000000001';
const WS = 'aaaaaaaa-1111-4000-8000-000000000001';
const WS2 = 'aaaaaaaa-2222-4000-8000-000000000002';

// STABIL TEKNISK NYCKEL, inte den synliga texten. Gavans visningsnamn ar regionaliserat och
// kan andras av TikTok; en primarnyckel som byter varde med sprak ar ingen primarnyckel.
const REGEL = 'heart_me';
const REGEL_2 = 'rose';

// Syntetiska gåvo-id och en syntetisk bild-URL.
const HEART_ME = '9101';
const ANNAN_GAVA = '9102';
const BILD = 'https://exempel.invalid/prov-gava.png';

let pool;
const prov = (namn, fn) => test('larlage: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);

let nr = 0;
const gava = (giftId = HEART_ME, giftName = 'Heart Me', over = {}) => ({
  id: over.id || `lprov:${++nr}`,
  type: 'gift', giftId, giftName,
  giftImage: over.giftImage !== undefined ? over.giftImage : BILD,
  userId: 'provgivare_a', username: 'provgivare_a',
  count: 1, value: 5
});

const armRad = async (ws = WS, regel = REGEL) => (await pool.query(
  'SELECT * FROM gift_learn_arm WHERE workspace_id=$1 AND rule_key=$2', [ws, regel])).rows[0] || null;

const identitet = async (ws = WS, regel = REGEL) => (await pool.query(
  'SELECT * FROM gift_rule_identity WHERE workspace_id=$1 AND rule_key=$2', [ws, regel])).rows[0] || null;

test.before(async () => {
  if (BLOCKED) return;
  pool = new Pool({ connectionString: DB_URL });
  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,'x','larlage-agare',now()) ON CONFLICT (id) DO NOTHING`, [AGARE, AGARE + '@t.invalid']);
  for (const [ws, namn] of [[WS, 'larlage-a'], [WS2, 'larlage-b']]) {
    await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,$2,$3)
      ON CONFLICT (id) DO NOTHING`, [ws, namn, AGARE]);
  }
});

test.beforeEach(async () => {
  if (BLOCKED) return;
  await pool.query('DELETE FROM gift_learn_arm WHERE workspace_id IN ($1,$2)', [WS, WS2]);
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id IN ($1,$2)', [WS, WS2]);
});

test.after(async () => {
  if (BLOCKED) return;
  await pool.query('DELETE FROM gift_learn_arm WHERE workspace_id IN ($1,$2)', [WS, WS2]);
  await pool.query('DELETE FROM gift_rule_identity WHERE workspace_id IN ($1,$2)', [WS, WS2]);
  await pool.end();
});

// ---- UTAN ARMERING HÄNDER INGENTING -----------------------------------------------------------

prov('ej armerad: gåvoevent ändrar ingenting', async () => {
  finns();
  await G.fangaFranEvent(pool, WS, gava());
  assert.equal(await armRad(), null, 'ingen armering ⇒ ingen fångst');
  assert.equal(await identitet(), null, 'och absolut ingen sparad identitet');
});

// ---- FÅNGSTEN ---------------------------------------------------------------------------------

prov('armerad: nästa gåva fångas — men sparar INGENTING än', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava());

  const arm = await armRad();
  assert.ok(arm, 'armeringen ska finnas kvar med fångsten');
  assert.equal(arm.fangad_gift_id, HEART_ME);
  assert.equal(arm.fangad_gift_name, 'Heart Me');
  assert.equal(arm.fangad_gift_image, BILD, 'bilden behövs för kontrollen i Studio');
  assert.ok(arm.fangad_at);

  assert.equal(await identitet(), null,
    'FÅNGST ÄR INTE SPARANDE — bara Bekräfta får skriva identiteten');
});

prov('bara NÄSTA gåva fångas — en andra skriver inte över', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava(HEART_ME, 'Heart Me'));
  await G.fangaFranEvent(pool, WS, gava(ANNAN_GAVA, 'Rose'));

  const arm = await armRad();
  assert.equal(arm.fangad_gift_id, HEART_ME,
    'annars vore "nästa gåva" i praktiken "senaste gåva" och du bekräftar något du inte såg');
});

prov('dubblett fångas inte', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  const e = gava();
  await G.fangaFranEvent(pool, WS, e, { duplicate: true });
  assert.equal((await armRad()).fangad_gift_id, null, 'en replay är inte fångsten');

  // KONTROLLMÄTNING: samma event som icke-dubblett fångas.
  await G.fangaFranEvent(pool, WS, e);
  assert.equal((await armRad()).fangad_gift_id, HEART_ME);
});

prov('gåva utan giftId fångas inte — armeringen står kvar', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava('', 'Heart Me'));
  const arm = await armRad();
  assert.ok(arm, 'armeringen ska INTE förbrukas av ett oanvändbart event');
  assert.equal(arm.fangad_gift_id, null);

  // KONTROLLMÄTNING.
  await G.fangaFranEvent(pool, WS, gava(HEART_ME));
  assert.equal((await armRad()).fangad_gift_id, HEART_ME);
});

prov('likes och follows fångas inte', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, { id: 'lprov:like', type: 'like', count: 100 });
  await G.fangaFranEvent(pool, WS, { id: 'lprov:follow', type: 'follow' });
  assert.equal((await armRad()).fangad_gift_id, null);
});

// ---- BEKRÄFTA OCH AVBRYT ----------------------------------------------------------------------

prov('Bekräfta sparar identiteten och rensar armeringen', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava());
  const ut = await G.bekrafta(pool, WS, REGEL);

  assert.equal(ut.ok, true);
  const id = await identitet();
  assert.equal(id.gift_id, HEART_ME);
  assert.equal(id.gift_name, 'Heart Me');
  assert.ok(id.bekraftad_at);
  assert.equal(await armRad(), null, 'armeringen ska vara förbrukad');
});

prov('Bekräfta utan fångst sparar ingenting', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  const ut = await G.bekrafta(pool, WS, REGEL);
  assert.equal(ut.ok, false);
  assert.equal(await identitet(), null);
});

prov('Avbryt rensar armeringen utan att spara', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava());
  await G.avbryt(pool, WS, REGEL);

  assert.equal(await armRad(), null);
  assert.equal(await identitet(), null, 'Avbryt får aldrig lämna något sparat');
});

prov('fel gåva fångad: avbryt, armera om, fånga rätt', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava(ANNAN_GAVA, 'Rose'));
  assert.equal((await armRad()).fangad_gift_id, ANNAN_GAVA);

  await G.avbryt(pool, WS, REGEL);
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava(HEART_ME, 'Heart Me'));
  await G.bekrafta(pool, WS, REGEL);

  assert.equal((await identitet()).gift_id, HEART_ME, 'omstart ska ge rätt gåva');
});

prov('Bekräfta skriver över en tidigare inlärd identitet', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava(ANNAN_GAVA, 'Rose'));
  await G.bekrafta(pool, WS, REGEL);
  assert.equal((await identitet()).gift_id, ANNAN_GAVA);

  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava(HEART_ME, 'Heart Me'));
  await G.bekrafta(pool, WS, REGEL);
  assert.equal((await identitet()).gift_id, HEART_ME, 'en ominlärning ska ersätta, inte dubblera');

  const antal = await pool.query(
    'SELECT count(*)::int AS n FROM gift_rule_identity WHERE workspace_id=$1 AND rule_key=$2', [WS, REGEL]);
  assert.equal(antal.rows[0].n, 1, 'EN rad per regel — det här är ingen katalog');
});

// ---- UTGÅNGSTID -------------------------------------------------------------------------------

prov('utgången armering fångar ingenting', async () => {
  finns();
  const nu = Date.now();
  await G.armera(pool, WS, REGEL, { nu: () => nu });
  // 301 s senare — default är 300 s.
  await G.fangaFranEvent(pool, WS, gava(), { nu: () => nu + 301000 });
  const arm = await armRad();
  assert.ok(!arm || arm.fangad_gift_id === null, 'en utgången armering får inte fånga');
});

prov('utgången FÅNGST går inte att bekräfta', async () => {
  finns();
  const nu = Date.now();
  await G.armera(pool, WS, REGEL, { nu: () => nu });
  await G.fangaFranEvent(pool, WS, gava(), { nu: () => nu + 10000 });
  const ut = await G.bekrafta(pool, WS, REGEL, { nu: () => nu + 301000 });

  assert.equal(ut.ok, false, 'hann du inte trycka Bekräfta måste du armera om');
  assert.equal(await identitet(), null);
});

prov('utgångstiden är 300 s som default', async () => {
  finns();
  const nu = Date.now();
  await G.armera(pool, WS, REGEL, { nu: () => nu });
  // 299 s: fortfarande giltig.
  await G.fangaFranEvent(pool, WS, gava(), { nu: () => nu + 299000 });
  assert.equal((await armRad()).fangad_gift_id, HEART_ME,
    'ändras defaulten ska det här provet falla — det är meningen');
});

// ---- ISOLERING --------------------------------------------------------------------------------

prov('regler och workspaces är isolerade', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava(HEART_ME, 'Heart Me'));
  await G.bekrafta(pool, WS, REGEL);

  assert.equal(await identitet(WS, REGEL_2), null, 'en annan regel ärver ingenting');
  assert.equal(await identitet(WS2, REGEL), null, 'ett annat workspace ärver ingenting');
});

prov('armering i ett workspace fångar inte ett annats gåvor', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS2, gava());
  assert.equal((await armRad(WS)).fangad_gift_id, null);
});

// ---- SAMTIDIGHET ------------------------------------------------------------------------------

prov('två samtidiga gåvor — sex omgångar, exakt en fångas', async () => {
  finns();
  // En kapplöpning räcker inte som samtidighetsvakt: vem som hinner först varierar.
  for (let omgang = 0; omgang < 6; omgang++) {
    await pool.query('DELETE FROM gift_learn_arm WHERE workspace_id=$1', [WS]);
    await G.armera(pool, WS, REGEL);
    await Promise.all([
      G.fangaFranEvent(pool, WS, gava(HEART_ME, 'Heart Me', { id: `lprov:race:${omgang}:a` })),
      G.fangaFranEvent(pool, WS, gava(ANNAN_GAVA, 'Rose', { id: `lprov:race:${omgang}:b` }))
    ]);
    const arm = await armRad();
    assert.ok([HEART_ME, ANNAN_GAVA].includes(arm.fangad_gift_id),
      `omgång ${omgang}: en av dem ska ha fångats`);
    const antal = await pool.query(
      'SELECT count(*)::int AS n FROM gift_learn_arm WHERE workspace_id=$1 AND rule_key=$2', [WS, REGEL]);
    assert.equal(antal.rows[0].n, 1, `omgång ${omgang}: en armering, inte två`);
  }
});

// ---- MATCHNING --------------------------------------------------------------------------------

prov('matchning sker bara på sparat giftId — namnet aldrig', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava(HEART_ME, 'Heart Me'));
  await G.bekrafta(pool, WS, REGEL);

  assert.equal(await G.slaUppGiftId(pool, WS, REGEL), HEART_ME);
  assert.equal(await G.slaUppGiftId(pool, WS, REGEL_2), null, 'oinlärd regel matchar ingenting');
});

prov('oinlärd regel är fail-closed', async () => {
  finns();
  assert.equal(await G.slaUppGiftId(pool, WS, REGEL), null);
  assert.equal(await G.slaUppGiftId(pool, WS, ''), null);
  assert.equal(await G.slaUppGiftId(pool, WS, null), null);
});

// ---- INTEGRITET: INGEN AVSÄNDARDATA -----------------------------------------------------------

prov('ingenting om avsändaren lagras någonsin', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava());
  await G.bekrafta(pool, WS, REGEL);

  // Kolumnnivå, inte bara värden: fältet ska inte ens finnas att fylla.
  for (const tabell of ['gift_learn_arm', 'gift_rule_identity']) {
    const kol = await pool.query(
      'SELECT column_name FROM information_schema.columns WHERE table_name=$1', [tabell]);
    const namn = kol.rows.map(r => r.column_name).join(',');
    for (const forbjudet of ['user', 'sender', 'avsandare', 'viewer', 'username']) {
      assert.ok(!namn.includes(forbjudet),
        `${tabell} har en kolumn som liknar avsändardata (${forbjudet}) — lärläget ska veta VILKEN gåva, aldrig VEM`);
    }
  }
});

// ---- ICKE-REGRESSION --------------------------------------------------------------------------

prov('lärläget rör inte mål eller statistik', async () => {
  finns();
  await G.armera(pool, WS, REGEL);
  await G.fangaFranEvent(pool, WS, gava());
  await G.bekrafta(pool, WS, REGEL);
  assert.ok(await identitet(), 'kontrollmätning: lärläget gjorde något');

  const goal = await pool.query('SELECT count(*)::int AS n FROM goal_runtime');
  const gifter = await pool.query('SELECT count(*)::int AS n FROM gifter_totals WHERE workspace_id=$1', [WS]);
  assert.equal(goal.rows[0].n, 0, 'inga målrader');
  assert.equal(gifter.rows[0].n, 0, 'inga statistikrader — det ägs av stream-stats');
});

// ---- VAKT: SLUTFRAME-INVARIANTEN I BRYGGAN ----------------------------------------------------

test('vakt: MOLNBRYGGAN filtrerar bort mellanframes i en streak', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', '..', 'tiktok-bridge', 'bridge.js'), 'utf8');
  assert.ok(/isStreakable\(data\)\s*&&\s*!\s*isFinalFrame\(data\)/.test(kall.replace(/N\./g, '')),
    'bridge.js-filtret är borta — lärläget kan då fånga en mellanframe i molnvägen');
});

test('vakt: ELECTRON-APPEN filtrerar bort mellanframes i en streak', () => {
  // Windows-appen har sin EGEN inline-kopia av regeln (electron-app/tiktok-service.js), inte ett
  // anrop till normalizer.js. Bryggvakten ovan säger därför ingenting om den här vägen.
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', '..', 'electron-app', 'tiktok-service.js'), 'utf8');
  assert.ok(/streakable\s*&&\s*!\s*finalFrame/.test(kall),
    'tiktok-service.js-filtret är borta — lärläget kan då fånga en mellanframe i desktopvägen');
  // Och att regeln faktiskt är den vi tror: repeatEnd avgör, och saknad repeatEnd = komplett.
  assert.ok(/repeatEnd\s*===\s*undefined\s*\?\s*true/.test(kall),
    'saknad repeatEnd måste behandlas som en komplett gåva, annars tappas enskilda gåvor');
});
