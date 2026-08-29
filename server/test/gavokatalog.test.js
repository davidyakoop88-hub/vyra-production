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
const REGION = 'SE';   // observerad region i riggen — aldrig gissad i produktion
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
// Cachen tomms mellan prov. Utan det kan en lista fran ett tidigare prov leva vidare over en
// rensning — en isoleringsbugg som cachen sjalv skapade.
test.beforeEach(async () => { if (!BLOCKED) { await rensa(); K.tomCache(); } });
test.after(async () => { if (BLOCKED) return; await rensa(); await pool.end(); });

const katalograd = async id => (await pool.query(
  'SELECT gift_name,gift_image,diamanter,kalla FROM gavokatalog WHERE gift_id=$1', [id])).rows[0] || null;
const regelrad = async (r, id) => (await pool.query(
  'SELECT status,bekraftelser FROM gavoregel WHERE rule_key=$1 AND gift_id=$2', [r, id])).rows[0] || null;

// ---- KATALOGEN ---------------------------------------------------------------------------------

prov('bulkinläggning skriver hela listan på en gång', async () => {
  const ut = await K.noteraKatalog(pool, [katalogpost(G1, 'Rose'), katalogpost(G2, 'Heart Me')], { region: REGION });
  assert.equal(ut.skrivna, 2);
  assert.equal((await katalograd(G1)).gift_name, 'Rose');
  assert.equal((await katalograd(G2)).kalla, 'katalog');
});

prov('poster utan id hoppas över i stället för att fälla hela bulken', async () => {
  // En enda trasig post i 783 får inte kosta hela katalogen.
  const ut = await K.noteraKatalog(pool, [katalogpost(G1, 'Rose'), { name: 'utan id' }, katalogpost(G2, 'X')], { region: REGION });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION });
  await K.noteraFranEvent(pool, gava(G1, { giftName: '', giftImage: '' }));
  const rad = await katalograd(G1);
  assert.equal(rad.gift_name, 'Rose', 'namnet skrevs över av ett tomt fält');
  assert.notEqual(rad.gift_image, '', 'bilden skrevs över av ett tomt fält');
});

prov('katalogkällan vinner över händelsekällan', async () => {
  await K.noteraFranEvent(pool, gava(G1, { giftName: 'Ofullständigt' }));
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION });
  const rad = await katalograd(G1);
  assert.equal(rad.gift_name, 'Rose', 'TikToks egen lista är mer korrekt än ett enstaka event');
  assert.equal(rad.kalla, 'katalog');
});

// ---- REGELN ÄR SKILD FRÅN KATALOGEN ------------------------------------------------------------

prov('EN GÅVA I KATALOGEN RÄKNAS INTE — det krävs en verifierad regel', async () => {
  // Kärnpåståendet. Katalogen beskriver; regeln avgör. Glider de ihop kan ett katalogtillägg ändra
  // vad ett mål räknar, utan att någon bestämt det.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [],
    'ett id i katalogen blev matchbart utan att någon verifierat det');
});

prov('en kandidat är inte heller matchbar', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  for (let i = 0; i < 100; i++) await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');

  const rad = await regelrad(REGEL, G1);
  assert.equal(rad.bekraftelser, 1, 'samma källa räknades mer än en gång');
  assert.equal(rad.status, 'kandidat');
  assert.deepEqual(await K.verifieradeId(pool, REGEL), []);
});

prov('tre OLIKA källor gör en KANDIDAT — aldrig facit', async () => {
  // DEN HÄR REGELN ÄR HELA SÄKERHETSMODELLEN. Funktionen skrev tidigare status='verifierad' vid
  // tröskeln, alltså kunde tre rum tillsammans få en gåva att börja trigga Gift Campaign, Gift
  // Fireworks och Goals hos ALLA kunder utan att en människa sett den.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-b');
  assert.equal((await regelrad(REGEL, G1)).mogen, undefined);

  const ut = await K.noteraKandidat(pool, REGEL, G1, 'kreator-c');
  assert.equal(ut.bekraftelser, 3, 'tre distinkta källor räknades inte');
  assert.equal(ut.mogen, true, 'tröskeln ska märka kandidaten som redo för granskning');
  assert.equal(ut.status, 'kandidat', 'AUTOMATISK AKTIVERING — tre rum aktiverade en gåva själva');
  assert.equal((await regelrad(REGEL, G1)).status, 'kandidat');
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [],
    'en kandidat fick matcha utan mänskligt godkännande');

  // Och hundra källor till ändrar ingenting. Ingen mängd maskinell enighet blir ett godkännande.
  for (let i = 0; i < 20; i++) await K.noteraKandidat(pool, REGEL, G1, 'kreator-' + i);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [], 'tröskeln blev en bakväg till facit');
});

prov('källan lagras hashad, aldrig i klartext', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  const q = await pool.query('SELECT kallnyckel FROM gavoregel_kalla WHERE gift_id=$1', [G1]);
  assert.equal(q.rowCount, 1);
  assert.match(q.rows[0].kallnyckel, /^[0-9a-f]{64}$/);
  assert.ok(!q.rows[0].kallnyckel.includes('kreator'), 'källan står i klartext');
});

prov('databasen vägrar en källnyckel som inte är en hash', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  await assert.rejects(() => pool.query(
    'INSERT INTO gavoregel_kalla (rule_key,gift_id,kallnyckel) VALUES ($1,$2,$3)',
    [REGEL, G1, 'kreator-b']), /kallnyckel/i, 'klartext accepterades');
});

prov('utan hemlighet noteras ingen källa — fail-closed', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me'), katalogpost(G2, 'Heart Me')], { region: REGION });
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

// ---- CACHEN ------------------------------------------------------------------------------------

prov('cachen svarar utan att fraga databasen igen', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  await K.verifiera(pool, REGEL, G1);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [G1]);

  // Raden tas bort BAKOM ryggen pa cachen. Svaret ska anda komma fran cachen inom TTL:en — det ar
  // beviset for att uppslaget inte gar till databasen for varje gava.
  await pool.query('DELETE FROM gavoregel WHERE gift_id=$1', [G1]);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [G1], 'uppslaget gick till databasen anda');

  // Och efter TTL:en hamtas sanningen pa nytt.
  const senare = () => Date.now() + K.CACHE_MS + 1;
  assert.deepEqual(await K.verifieradeId(pool, REGEL, { nu: senare }), [],
    'cachen slapper aldrig — en borttagen regel skulle rakna for alltid');
});

prov('verifiering slar igenom direkt, utan att vanta pa TTL', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [], 'cachar en tom lista');

  await K.verifiera(pool, REGEL, G1);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [G1],
    'den tomma listan lag kvar — en nyss verifierad gava hade inte raknats');
});

prov('mänskligt godkännande slar igenom direkt, utan att vanta pa cachen', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  assert.deepEqual(await K.verifieradeId(pool, REGEL), []);

  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-b');
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-c');
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [], 'kandidaten matchade av sig sjalv');

  await K.verifiera(pool, REGEL, G1);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [G1], 'godkannandet tomde inte cachen');
});

// ---- TENANTSTYRD INDATA MOT ETT GLOBALT BORD ---------------------------------------------------
//
// `gavokatalog` har ingen workspace-kolumn, och händelsevägen matas av POST /api/workspaces/:id/
// events — en rutt vilken editor som helst når i sitt EGET workspace, där bara `type` och
// `username` valideras. Proven nedan mäter de tre skydden som följde av den insikten.

prov('en katalogsatt rad kan INTE skrivas om av ett event', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION });

  // Riktningen som faktiskt inträffar i drift: seedning EN gång, sedan miljontals event. Det gamla
  // provet mätte bara den motsatta riktningen (event, sedan seedning) och gick därför grönt.
  await K.noteraFranEvent(pool, gava(G1, {
    giftName: 'Heart Me', giftImage: 'https://angripare.invalid/x.png'
  }));

  const rad = await katalograd(G1);
  assert.equal(rad.gift_name, 'Rose', 'ett event döpte om en auktoritativ katalogpost');
  assert.ok(!rad.gift_image.includes('angripare'), 'ett event bytte bild på en auktoritativ post');
  assert.equal(rad.kalla, 'katalog', 'källan ska fortsätta säga var värdet kom ifrån');
});

prov('ett event som inte är en gåva skriver ingen katalograd', async () => {
  await K.noteraFranEvent(pool, { type: 'chat', giftId: G2, giftName: 'Heart Me', comment: 'hej' });
  assert.equal(await katalograd(G2), null,
    'ett chattmeddelande med påhittat giftId hamnade i den globala katalogen');

  // KONTROLLMÄTNING: samma indata som en gåva SKA skrivas, annars mäter provet ingenting.
  await K.noteraFranEvent(pool, gava(G2));
  assert.ok(await katalograd(G2), 'typkontrollen stoppade även riktiga gåvor');
});

prov('diamanter skrivs aldrig från ett event — kombototalen är fel storhet', async () => {
  // event.value = coinsEach * repeatCount (normalizer.js:68). Kolumnen bär STYCKPRIS.
  await K.noteraFranEvent(pool, gava(G3, { value: 2500 }));
  assert.equal((await katalograd(G3)).diamanter, 0,
    'kombots totalsumma lagrades som styckpris, globalt för alla workspaces');

  // Bulkvägen är den enda som vet det riktiga styckpriset.
  await K.noteraKatalog(pool, [katalogpost(G3, 'Rose', { diamond_count: 1 })], { region: REGION });
  assert.equal((await katalograd(G3)).diamanter, 1, 'bulkvägen rättade inte det okända värdet');

  // Och ett senare event får inte förstöra det igen.
  await K.noteraFranEvent(pool, gava(G3, { value: 2500 }));
  assert.equal((await katalograd(G3)).diamanter, 1, 'ett event skrev över styckpriset');
});

prov('ett orimligt stort värde spränger inte int4 tyst', async () => {
  // `diamanter` är int4 (max 2 147 483 647); normalizer.js släpper igenom upp till 1e12. Anropet
  // är fire-and-forget med .catch(() => {}), så "integer out of range" hade blivit helt tyst.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Stor', { diamond_count: 1e12 })], { region: REGION });
  assert.equal((await katalograd(G1)).diamanter, 2147483647, 'värdet klampades inte uppåt');
});

prov('en halvtom lista tömmer inte poster som redan är ifyllda', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION });
  const ut = await K.noteraKatalog(pool,
    [{ id: G1, name: '', diamond_count: 1, image: { url_list: [''] } }], { region: REGION });
  // KONTROLLMÄTNING: anropet måste faktiskt ha SKRIVIT. Utan den här raden blir provet grönt även
  // när ingenting hände — och det var precis vad som hände när region blev obligatorisk och det
  // här anropet råkade sakna den.
  assert.equal(ut.skrivna, 1, 'anropet skrev inget alls — provet mäter ingenting');
  const rad = await katalograd(G1);
  assert.equal(rad.gift_name, 'Rose', 'en tom post i listan raderade ett korrekt namn');
  assert.ok(rad.gift_image, 'en tom post i listan raderade en korrekt bild');
});


// ---- ÅTERKALLA OCH TA BORT ---------------------------------------------------------------------

prov('en inaktiverad post slutar matcha omedelbart', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  await K.verifiera(pool, REGEL, G1);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [G1]);

  const ut = await K.inaktivera(pool, REGEL, G1);
  assert.equal(ut.ok, true);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [],
    'en återkallad post matchade vidare — cachen tömdes inte');

  // Historiken står kvar. Det är hela skälet till 'inaktiverad' i stället för DELETE.
  assert.equal((await regelrad(REGEL, G1)).status, 'inaktiverad');
});

prov('en inaktiverad post kan godkännas igen', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  await K.verifiera(pool, REGEL, G1);
  await K.inaktivera(pool, REGEL, G1);
  await K.verifiera(pool, REGEL, G1);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [G1], 'återaktivering fungerade inte');
});

prov('inaktivera rör inte en kandidat — bara godkända poster kan återkallas', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  const ut = await K.inaktivera(pool, REGEL, G1);
  assert.equal(ut.ok, false);
  assert.equal(ut.skal, 'ingen-verifierad-post');
  assert.equal((await regelrad(REGEL, G1)).status, 'kandidat', 'kandidaten ändrades');
});

prov('ta bort raderar posten OCH dess källräkning', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION });
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-b');

  const ut = await K.taBort(pool, REGEL, G1);
  assert.equal(ut.ok, true);
  assert.equal(await regelrad(REGEL, G1), null);
  const kallor = await pool.query(
    'SELECT count(*)::int n FROM gavoregel_kalla WHERE rule_key=$1 AND gift_id=$2', [REGEL, G1]);
  assert.equal(kallor.rows[0].n, 0, 'källorna kaskaderade inte — en ny post ärver gamla bekräftelser');

  // Katalogen är etikettering och ska INTE följa med. Främmande nyckeln är ON DELETE RESTRICT åt
  // andra hållet, så gåvan finns kvar och kan pekas ut igen.
  assert.ok(await katalograd(G1), 'katalogposten försvann med regeln');
});

prov('ta bort en post som inte finns är inte tyst lyckat', async () => {
  const ut = await K.taBort(pool, REGEL, 'prov-finns-inte');
  assert.equal(ut.ok, false);
  assert.equal(ut.skal, 'saknas');
});

prov('kandidatlistan visar mognad, aldrig källor', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me'), katalogpost(G2, 'Heart Me')], { region: REGION });
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-b');
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-c');
  await K.noteraKandidat(pool, REGEL, G2, 'kreator-a');

  const lista = await K.kandidater(pool, REGEL);
  const g1 = lista.find(r => r.gift_id === G1), g2 = lista.find(r => r.gift_id === G2);
  assert.equal(g1.bekraftelser, 3);
  assert.equal(g1.mogen, true, 'tre källor markerades inte som redo för granskning');
  assert.equal(g1.status, 'kandidat', 'listan visade en kandidat som godkänd');
  assert.equal(g2.mogen, false, 'en källa räckte för att se mogen ut');

  // Namn och bild är till för människans blick — men aldrig VILKA källorna var.
  assert.equal(g1.gift_name, 'Heart Me');
  const text = JSON.stringify(lista);
  assert.ok(!text.includes('kreator'), 'en källa läckte ut i kandidatlistan');
  assert.ok(!/[0-9a-f]{64}/.test(text), 'en källnyckel läckte ut i kandidatlistan');
});


// ---- OBSERVERAD REGION ------------------------------------------------------------------------
//
// En katalograd är inte en global sanning. Den är en OBSERVATION: den här gåvan sågs i den här
// regionen, vid den här tidpunkten, av den här källan. Uppmätt 2026-08-29: webcast/gift/list/ bär
// inget regionfält alls, så regionen måste komma utifrån — och får därför aldrig gissas.

prov('bulkvägen sparar källa, region och tidpunkt', async () => {
  const fore = Date.now();
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION });
  const q = await pool.query(
    'SELECT kalla, region, forsta_sedd, senast_sedd FROM gavokatalog WHERE gift_id=$1', [G1]);
  const rad = q.rows[0];
  assert.equal(rad.kalla, 'katalog', 'källan sparades inte');
  assert.equal(rad.region, REGION, 'regionen sparades inte');
  assert.ok(new Date(rad.forsta_sedd).getTime() >= fore - 60000, 'tidpunkten sparades inte');
  assert.ok(rad.senast_sedd, 'senast sedd saknas');
});

prov('utan giltig region skrivs INGENTING — inget tyst default', async () => {
  for (const region of [undefined, '', 'se', 'SWE', 'S', null, 12, 'Sverige']) {
    const ut = await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region });
    assert.equal(ut.skrivna, 0, JSON.stringify(region) + ' accepterades');
    assert.equal(ut.fel, 'okand-region');
  }
  assert.equal(await katalograd(G1), null, 'ett avvisat anrop hann ändå skriva');
});

prov('ett gåvoevent skriver ALDRIG en region, och tar aldrig bort en', async () => {
  // Ett event bär ingen region över huvud taget. En rad som seedats från SE ska inte tappa sin
  // proveniens för att någon skickade gåvan i ett annat rum.
  await K.noteraFranEvent(pool, gava(G2));
  const nyRad = await pool.query('SELECT region FROM gavokatalog WHERE gift_id=$1', [G2]);
  assert.equal(nyRad.rows[0].region, '', 'händelsevägen hittade på en region');

  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION });
  await K.noteraFranEvent(pool, gava(G1));
  const seedad = await pool.query('SELECT region FROM gavokatalog WHERE gift_id=$1', [G1]);
  assert.equal(seedad.rows[0].region, REGION, 'ett event raderade en seedad rads proveniens');
});

prov('en ny seedning från en ANNAN region skriver om provenienesen', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: 'SE' });
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: 'US' });
  assert.equal((await pool.query('SELECT region FROM gavokatalog WHERE gift_id=$1', [G1])).rows[0].region, 'US',
    'raden påstår fortfarande att den sågs i SE');
});

prov('svaret skiljer på antal poster och antal distinkta id', async () => {
  const ut = await K.noteraKatalog(pool,
    [katalogpost(G1, 'Rose'), katalogpost(G1, 'Rose'), katalogpost(G2, 'Heart Me')], { region: REGION });
  assert.equal(ut.skrivna, 3);
  assert.equal(ut.unikaId, 2, 'dubblerade id räknades som skilda');
  assert.equal(ut.region, REGION);
});

prov('databasen vägrar en region som inte är två versaler', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION });
  await assert.rejects(
    () => pool.query("UPDATE gavokatalog SET region='sverige' WHERE gift_id=$1", [G1]),
    /check|constraint/i, 'CHECK-villkoret på region saknas i databasen');
});

test('vakt: regionen gissas aldrig i modulen', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'gavokatalog.js'), 'utf8');
  // Inget default, ingen reserv, ingen hardkodad region.
  assert.ok(!/region\s*=\s*['"][A-Z]{2}['"]/.test(kall), 'en region hardkodad som reserv');
  assert.ok(!/region\s*\|\|\s*['"]/.test(kall), 'en region med tyst fallback');
  assert.equal(K.lasRegion('SE'), 'SE');
  for (const v of ['se', 'SWE', '', null, undefined, 'S', 12, ' SE ']) {
    if (v === ' SE ') { assert.equal(K.lasRegion(v), 'SE', 'blanksteg ska trimmas'); continue; }
    assert.equal(K.lasRegion(v), null, JSON.stringify(v) + ' accepterades som region');
  }
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
