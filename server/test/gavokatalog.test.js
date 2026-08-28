'use strict';
// GÅVOKATALOGEN OCH DEN GLOBALA GÅVOREGELN.
//
// Problemet: fram till 2026-08-28 kunde VYRA bara lära sig en gåva i taget, genom att någon faktiskt
// skickade den. 783 gåvor en och en är ingen produkt.
//
// TVÅ TABELLER MED OLIKA JOBB, och proven mäter framför allt att de INTE glider ihop:
//
//   gavokatalog   namn och bild.  ETIKETTERING — får aldrig avgöra vad som räknas.
//   gavoregel     verifierat id.  IDENTITET — avgör precis vad som räknas.
//
// Om ett katalogtillägg kunde ändra vad ett mål räknar vore hela poängen borta. Därför krävs en
// EGEN, verifierad bindning innan något id blir matchbart.
//
// SYNTETISKA VÄRDEN ÖVERALLT. Inga riktiga gåvo-id, inga verkliga konton.
const test = require('node:test'), assert = require('node:assert/strict');
const { Pool } = require('pg');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Unikhet och befordran går inte att prova mot en attrapp.';

// Nyckelhärledningen kräver en giltig hemlighet. Syntetisk, satt före modulen laddas.
process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString('base64url');

const K = require('../gavokatalog');
const Regelnycklar = require('../regelnycklar');

const G1 = 'prov-9001', G2 = 'prov-9002', G3 = 'prov-9003';
const REGEL = Regelnycklar.HEART_ME;

let pool;
const prov = (namn, fn) => test('katalog: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);

const katalogpost = (id, namn, over = {}) => Object.assign({
  id, name: namn, diamond_count: 1,
  image: { url_list: ['https://p16.example.invalid/' + id + '.png'] }
}, over);

const gava = (id, over = {}) => Object.assign({
  type: 'gift', giftId: id, giftName: 'Provgåva', giftImage: 'https://p16.example.invalid/e.png', value: 5
}, over);

test.before(async () => { if (!BLOCKED) pool = new Pool({ connectionString: DB_URL }); });

async function rensa() {
  await pool.query("DELETE FROM gavoregel_kalla WHERE rule_key LIKE '%' AND gift_id LIKE 'prov-%'");
  await pool.query("DELETE FROM gavoregel WHERE gift_id LIKE 'prov-%'");
  await pool.query("DELETE FROM gavokatalog WHERE gift_id LIKE 'prov-%'");
}
test.beforeEach(async () => { if (!BLOCKED) await rensa(); });
test.after(async () => { if (BLOCKED) return; await rensa(); await pool.end(); });

const katalograd = async id => (await pool.query(
  'SELECT gift_name,gift_image,diamanter,kalla FROM gavokatalog WHERE gift_id=$1', [id])).rows[0] || null;
const regelrad = async (r, id) => (await pool.query(
  'SELECT status,bekraftelser FROM gavoregel WHERE rule_key=$1 AND gift_id=$2', [r, id])).rows[0] || null;

// ---- KATALOGEN ---------------------------------------------------------------------------------

prov('bulkinläggning skriver hela listan på en gång', async () => {
  const ut = await K.noteraKatalog(pool, [katalogpost(G1, 'Rose'), katalogpost(G2, 'Heart Me')]);
  assert.equal(ut.skrivna, 2);
  assert.equal((await katalograd(G1)).gift_name, 'Rose');
  assert.equal((await katalograd(G2)).kalla, 'katalog');
});

prov('poster utan id hoppas över i stället för att fälla hela bulken', async () => {
  // En enda trasig post i 783 får inte kosta hela katalogen.
  const ut = await K.noteraKatalog(pool, [katalogpost(G1, 'Rose'), { name: 'utan id' }, katalogpost(G2, 'X')]);
  assert.equal(ut.skrivna, 2);
  assert.equal(ut.hoppade, 1);
});

prov('ett gåvoevent fyller katalogen passivt', async () => {
  // Källan som täcker det TikToks lista INTE kan ge: exklusiva gåvor finns bara i sitt eget rum.
  await K.noteraFranEvent(pool, gava(G3));
  const rad = await katalograd(G3);
  assert.equal(rad.kalla, 'handelse');
  assert.equal(rad.gift_name, 'Provgåva');
});

prov('ett event utan namn TÖMMER inte en post katalogen fyllt', async () => {
  // Annars hade ett magert event kunnat radera ett korrekt namn — och felet syns först som en
  // namnlös gåva i gränssnittet långt senare.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')]);
  await K.noteraFranEvent(pool, gava(G1, { giftName: '', giftImage: '' }));
  const rad = await katalograd(G1);
  assert.equal(rad.gift_name, 'Rose', 'namnet skrevs över av ett tomt fält');
  assert.notEqual(rad.gift_image, '', 'bilden skrevs över av ett tomt fält');
});

prov('katalogkällan vinner över händelsekällan', async () => {
  await K.noteraFranEvent(pool, gava(G1, { giftName: 'Ofullständigt' }));
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')]);
  const rad = await katalograd(G1);
  assert.equal(rad.gift_name, 'Rose', 'TikToks egen lista är mer korrekt än ett enstaka event');
  assert.equal(rad.kalla, 'katalog');
});

// ---- REGELN ÄR SKILD FRÅN KATALOGEN ------------------------------------------------------------

prov('EN GÅVA I KATALOGEN RÄKNAS INTE — det krävs en verifierad regel', async () => {
  // Kärnpåståendet. Katalogen beskriver; regeln avgör. Glider de ihop kan ett katalogtillägg ändra
  // vad ett mål räknar, utan att någon bestämt det.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')]);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [],
    'ett id i katalogen blev matchbart utan att någon verifierat det');
});

prov('en kandidat är inte heller matchbar', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')]);
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  assert.equal((await regelrad(REGEL, G1)).status, 'kandidat');
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [], 'en kandidat får inte räknas');
});

prov('ett id som inte finns i katalogen kan inte bli kandidat', async () => {
  const ut = await K.noteraKandidat(pool, REGEL, 'prov-okand', 'kreator-a');
  assert.equal(ut.noterad, false);
  assert.equal(ut.skal, 'okand-gava');
});

// ---- BEFORDRAN KRÄVER DISTINKTA KÄLLOR ---------------------------------------------------------

prov('SAMMA källa hundra gånger befordrar ingenting', async () => {
  // Det farliga fallet: ett rum som skickar samma gåva om och om igen skulle annars kunna
  // verifiera sig självt.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')]);
  for (let i = 0; i < 100; i++) await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');

  const rad = await regelrad(REGEL, G1);
  assert.equal(rad.bekraftelser, 1, 'samma källa räknades mer än en gång');
  assert.equal(rad.status, 'kandidat');
  assert.deepEqual(await K.verifieradeId(pool, REGEL), []);
});

prov('tre OLIKA källor befordrar till verifierad', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')]);
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-b');
  assert.equal((await regelrad(REGEL, G1)).status, 'kandidat', 'två räcker inte');

  const ut = await K.noteraKandidat(pool, REGEL, G1, 'kreator-c');
  assert.equal(ut.befordrad, true);
  assert.equal((await regelrad(REGEL, G1)).status, 'verifierad');
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [G1]);
});

prov('källan lagras hashad, aldrig i klartext', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')]);
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  const q = await pool.query('SELECT kallnyckel FROM gavoregel_kalla WHERE gift_id=$1', [G1]);
  assert.equal(q.rowCount, 1);
  assert.match(q.rows[0].kallnyckel, /^[0-9a-f]{64}$/);
  assert.ok(!q.rows[0].kallnyckel.includes('kreator'), 'källan står i klartext');
});

prov('databasen vägrar en källnyckel som inte är en hash', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')]);
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  await assert.rejects(() => pool.query(
    'INSERT INTO gavoregel_kalla (rule_key,gift_id,kallnyckel) VALUES ($1,$2,$3)',
    [REGEL, G1, 'kreator-b']), /kallnyckel/i, 'klartext accepterades');
});

prov('utan hemlighet noteras ingen källa — fail-closed', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')]);
  const sparad = process.env.APP_ENCRYPTION_KEY;
  delete process.env.APP_ENCRYPTION_KEY;
  try {
    const ut = await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
    assert.equal(ut.noterad, false, 'en okrypterbar källa får inte räknas');
  } finally { process.env.APP_ENCRYPTION_KEY = sparad; }
});

// ---- FLERA ID PER REGEL ------------------------------------------------------------------------

prov('en regel kan bära FLERA verifierade id', async () => {
  // Samma gåva kan ha olika id i olika regioner. Regeln ska kunna växa utan kodändring — och
  // alternativet, att falla tillbaka på namnet, är förbjudet.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me'), katalogpost(G2, 'Heart Me')]);
  await K.verifiera(pool, REGEL, G1);
  await K.verifiera(pool, REGEL, G2);
  const ids = (await K.verifieradeId(pool, REGEL)).sort();
  assert.deepEqual(ids, [G1, G2]);
});

prov('manuell verifiering kräver att gåvan finns i katalogen', async () => {
  const ut = await K.verifiera(pool, REGEL, 'prov-finns-ej');
  assert.equal(ut.ok, false);
  assert.equal(ut.skal, 'okand-gava');
  assert.deepEqual(await K.verifieradeId(pool, REGEL), []);
});

// ---- KÄLLVAKTER (kräver ingen databas) ---------------------------------------------------------

test('vakt: namnet används aldrig för att välja ett id', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'gavokatalog.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(r => r.replace(/\/\/.*$/, '')).join('\n');

  // gift_name får SKRIVAS och LÄSAS som etikett, men aldrig stå i ett WHERE som väljer gåva.
  assert.ok(!/WHERE[^;]*gift_name\s*=/i.test(kall),
    'ett id väljs på namn — 49 av TikToks 783 namn är dubbletter i deras EGEN katalog');
  // KONTROLLMÄTNING: mönstret kan träffa.
  assert.ok(/WHERE[^;]*gift_name\s*=/i.test("select 1 WHERE gift_name = 'x'"));
});

test('vakt: modulen loggar ingenting', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'gavokatalog.js'), 'utf8');
  assert.ok(!/console\./.test(kall), 'katalogen ser varje gåva som passerar — den får inte logga');
});

test('vakt: källnyckeln är domänseparerad', () => {
  const crypto = require('node:crypto');
  const hemlig = Buffer.from(process.env.APP_ENCRYPTION_KEY, 'base64url');
  const rakt = crypto.createHmac('sha256', hemlig).update('kreator-a').digest('hex');
  assert.notEqual(K.kallnyckel('kreator-a'), rakt,
    'hemligheten används rakt av — samma bytes till två olika HMAC-syften');
  assert.match(K.ETIKETT, /:v\d+$/, 'etiketten måste bära en version');
});

test('vakt: källnyckeln normaliseras som resten av huset', () => {
  assert.equal(K.kallnyckel('Kreator-A'), K.kallnyckel('  kreator-a  '),
    'samma kreatör måste ge samma nyckel oavsett skiftläge och blanktecken');
  assert.equal(K.kallnyckel(''), '', 'tom källa ger ingen nyckel');
});
