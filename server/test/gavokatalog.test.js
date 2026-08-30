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
  id, name: namn, diamond_count: 1, is_global_gift: true,
  image: { url_list: ['https://p16.example.invalid/' + id + '-' + namn + '.png'] }
}, over);

// HJÄLPARE FÖR PROV SOM INTE HANDLAR OM FULLSTÄNDIGHET. Den räknar fram kontrolltalen ur listan,
// vilket är EXAKT det som är förbjudet i produktion — men här mäter proven något annat, och en
// literal per anrop hade bara varit brus. Fullständighetsproven längre ner anger literaler.
const kontrolltal = poster => {
  const unika = new Set();
  let utanId = 0;
  for (const p of poster) {
    const id = String((p && (p.id ?? p.gift_id)) || '');
    if (id) unika.add(id); else utanId += 1;
  }
  return { poster: poster.length, unikaId: unika.size, utanId, digest: K.digestAvPoster(poster) };
};

const gava = (id, over = {}) => Object.assign({
  type: 'gift', giftId: id, giftName: 'Provgåva', giftImage: 'https://p16.example.invalid/e.png', value: 5
}, over);

test.before(async () => { if (!BLOCKED) pool = new Pool({ connectionString: DB_URL }); });

async function rensa() {
  await pool.query("DELETE FROM gavoregel_kalla WHERE rule_key LIKE '%' AND gift_id LIKE 'prov-%'");
  await pool.query("DELETE FROM gavoregel WHERE gift_id LIKE 'prov-%'");
  await pool.query("DELETE FROM gavokatalog WHERE gift_id LIKE 'prov-%'");   // observationer kaskaderar
  // gavoseedning KASKADERAR INTE — den har ingen gift_id. Utan den här raden svarar
  // seedningStatus('SE') 'klar' från ett TIDIGARE prov, och atomicitetsprovet blir falskt grönt.
  await pool.query('DELETE FROM gavoseedning');
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
  const ut = await K.noteraKatalog(pool, [katalogpost(G1, 'Rose'), katalogpost(G2, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Rose'), katalogpost(G2, 'Heart Me')]) });
  assert.equal(ut.skrivna, 2);
  assert.equal((await katalograd(G1)).gift_name, 'Rose');
  assert.equal((await katalograd(G2)).kalla, 'katalog');
});

prov('poster utan id hoppas över i stället för att fälla hela bulken', async () => {
  // En enda trasig post i 783 får inte kosta hela katalogen.
  const ut = await K.noteraKatalog(pool, [katalogpost(G1, 'Rose'), { name: 'utan id' }, katalogpost(G2, 'X')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Rose'), { name: 'utan id' }, katalogpost(G2, 'X')]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Rose')]) });
  await K.noteraFranEvent(pool, gava(G1, { giftName: '', giftImage: '' }));
  const rad = await katalograd(G1);
  assert.equal(rad.gift_name, 'Rose', 'namnet skrevs över av ett tomt fält');
  assert.notEqual(rad.gift_image, '', 'bilden skrevs över av ett tomt fält');
});

prov('katalogkällan vinner över händelsekällan', async () => {
  await K.noteraFranEvent(pool, gava(G1, { giftName: 'Ofullständigt' }));
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Rose')]) });
  const rad = await katalograd(G1);
  assert.equal(rad.gift_name, 'Rose', 'TikToks egen lista är mer korrekt än ett enstaka event');
  assert.equal(rad.kalla, 'katalog');
});

// ---- REGELN ÄR SKILD FRÅN KATALOGEN ------------------------------------------------------------

prov('EN GÅVA I KATALOGEN RÄKNAS INTE — det krävs en verifierad regel', async () => {
  // Kärnpåståendet. Katalogen beskriver; regeln avgör. Glider de ihop kan ett katalogtillägg ändra
  // vad ett mål räknar, utan att någon bestämt det.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [],
    'ett id i katalogen blev matchbart utan att någon verifierat det');
});

prov('en kandidat är inte heller matchbar', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  const q = await pool.query('SELECT kallnyckel FROM gavoregel_kalla WHERE gift_id=$1', [G1]);
  assert.equal(q.rowCount, 1);
  assert.match(q.rows[0].kallnyckel, /^[0-9a-f]{64}$/);
  assert.ok(!q.rows[0].kallnyckel.includes('kreator'), 'källan står i klartext');
});

prov('databasen vägrar en källnyckel som inte är en hash', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  await assert.rejects(() => pool.query(
    'INSERT INTO gavoregel_kalla (rule_key,gift_id,kallnyckel) VALUES ($1,$2,$3)',
    [REGEL, G1, 'kreator-b']), /kallnyckel/i, 'klartext accepterades');
});

prov('utan hemlighet noteras ingen källa — fail-closed', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me'), katalogpost(G2, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me'), katalogpost(G2, 'Heart Me')]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [], 'cachar en tom lista');

  await K.verifiera(pool, REGEL, G1);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [G1],
    'den tomma listan lag kvar — en nyss verifierad gava hade inte raknats');
});

prov('mänskligt godkännande slar igenom direkt, utan att vanta pa cachen', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Rose')]) });

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
  await K.noteraKatalog(pool, [katalogpost(G3, 'Rose', { diamond_count: 1 })], { region: REGION , forvantat: kontrolltal([katalogpost(G3, 'Rose', { diamond_count: 1 })]) });
  assert.equal((await katalograd(G3)).diamanter, 1, 'bulkvägen rättade inte det okända värdet');

  // Och ett senare event får inte förstöra det igen.
  await K.noteraFranEvent(pool, gava(G3, { value: 2500 }));
  assert.equal((await katalograd(G3)).diamanter, 1, 'ett event skrev över styckpriset');
});

prov('ett orimligt stort värde spränger inte int4 tyst', async () => {
  // `diamanter` är int4 (max 2 147 483 647); normalizer.js släpper igenom upp till 1e12. Anropet
  // är fire-and-forget med .catch(() => {}), så "integer out of range" hade blivit helt tyst.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Stor', { diamond_count: 1e12 })], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Stor', { diamond_count: 1e12 })]) });
  assert.equal((await katalograd(G1)).diamanter, 2147483647, 'värdet klampades inte uppåt');
});

prov('en halvtom lista tömmer inte poster som redan är ifyllda', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Rose')]) });
  const ut = await K.noteraKatalog(pool,
    [{ id: G1, name: '', diamond_count: 1, image: { url_list: [''] } }], { region: REGION , forvantat: kontrolltal([{ id: G1, name: '', diamond_count: 1, image: { url_list: [''] } }]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  await K.verifiera(pool, REGEL, G1);
  await K.inaktivera(pool, REGEL, G1);
  await K.verifiera(pool, REGEL, G1);
  assert.deepEqual(await K.verifieradeId(pool, REGEL), [G1], 'återaktivering fungerade inte');
});

prov('inaktivera rör inte en kandidat — bara godkända poster kan återkallas', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  const ut = await K.inaktivera(pool, REGEL, G1);
  assert.equal(ut.ok, false);
  assert.equal(ut.skal, 'ingen-verifierad-post');
  assert.equal((await regelrad(REGEL, G1)).status, 'kandidat', 'kandidaten ändrades');
});

prov('ta bort raderar posten OCH dess källräkning', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
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
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me'), katalogpost(G2, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Heart Me'), katalogpost(G2, 'Heart Me')]) });
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-a');
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-b');
  await K.noteraKandidat(pool, REGEL, G1, 'kreator-c');
  await K.noteraKandidat(pool, REGEL, G2, 'kreator-a');

  const lista = await K.kandidater(pool, REGEL, { region: REGION });
  const g1 = lista.find(r => r.gift_id === G1), g2 = lista.find(r => r.gift_id === G2);
  assert.equal(g1.bekraftelser, 3);
  assert.equal(g1.mogen, true, 'tre källor markerades inte som redo för granskning');
  assert.equal(g1.status, 'kandidat', 'listan visade en kandidat som godkänd');
  assert.equal(g2.mogen, false, 'en källa räckte för att se mogen ut');

  // REGIONERNA följer med — plural, för en gåva kan vara observerad i flera. Utan dem går "exakt
  // en verifierad post för den observerade regionen" bara att sluta sig till, och en slutsats är
  // ingen mätning.
  assert.deepEqual(g1.regioner, [REGION],
    'kandidatlistan säger inte vilka regioner posten observerats i');

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

prov('bulkvägen sparar källa, region och tidpunkt — på OBSERVATIONEN', async () => {
  const fore = Date.now();
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Rose')]) });
  const obs = (await K.observationer(pool, G1)).find(o => o.region === REGION);
  assert.ok(obs, 'ingen regional observation skrevs');
  assert.equal(obs.kalla, 'katalog', 'källan sparades inte på observationen');
  assert.ok(new Date(obs.forsta_sedd).getTime() >= fore - 60000, 'tidpunkten sparades inte');
  assert.ok(obs.senast_sedd, 'senast sedd saknas');

  // Kanoniska raden bär VAD gåvan är — aldrig var den sågs.
  const kol = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='gavokatalog'");
  assert.ok(!kol.rows.some(r => r.column_name === 'region'),
    'region ligger kvar på den kanoniska tabellen — då kan en region skriva över en annan');
});

prov('utan giltig region skrivs INGENTING — inget tyst default', async () => {
  for (const region of [undefined, '', 'se', 'SWE', 'S', null, 12, 'Sverige']) {
    const ut = await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region , forvantat: kontrolltal([katalogpost(G1, 'Rose')]) });
    assert.equal(ut.skrivna, 0, JSON.stringify(region) + ' accepterades');
    assert.equal(ut.fel, 'okand-region');
  }
  assert.equal(await katalograd(G1), null, 'ett avvisat anrop hann ändå skriva');
});

prov('ett gåvoevent skapar ingen regional observation alls', async () => {
  await K.noteraFranEvent(pool, gava(G2));
  assert.ok(await katalograd(G2), 'eventet nådde inte den kanoniska tabellen');
  assert.deepEqual(await K.observationer(pool, G2), [],
    'händelsevägen hittade på en region den inte kan känna till');
});

prov('svaret skiljer på antal poster och antal distinkta id', async () => {
  const ut = await K.noteraKatalog(pool,
    [katalogpost(G1, 'Rose'), katalogpost(G1, 'Rose'), katalogpost(G2, 'Heart Me')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Rose'), katalogpost(G1, 'Rose'), katalogpost(G2, 'Heart Me')]) });
  assert.equal(ut.skrivna, 3);
  assert.equal(ut.unikaId, 2, 'dubblerade id räknades som skilda');
  assert.equal(ut.region, REGION);
});

prov('databasen vägrar en region som inte är två versaler', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: REGION , forvantat: kontrolltal([katalogpost(G1, 'Rose')]) });
  await assert.rejects(
    () => pool.query("UPDATE gavoobservation SET region='sverige' WHERE gift_id=$1", [G1]),
    /check|constraint/i, 'CHECK-villkoret på region saknas i databasen');
});

test('vakt: regionen gissas aldrig i modulen', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'gavokatalog.js'), 'utf8');
  // Inget default, ingen reserv, ingen hardkodad region.
  assert.ok(!/region\s*=\s*['"][A-Z]{2}['"]/.test(kall), 'en region hardkodad som reserv');
  assert.ok(!/region\s*\|\|\s*['"]/.test(kall), 'en region med tyst fallback');
  assert.equal(K.giltigRegion('SE'), 'SE');
  for (const v of ['se', 'SWE', '', null, undefined, 'S', 12, ' SE ']) {
    if (v === ' SE ') { assert.equal(K.giltigRegion(v), 'SE', 'blanksteg ska trimmas'); continue; }
    assert.equal(K.giltigRegion(v), null, JSON.stringify(v) + ' accepterades som region');
  }

  // ISO-LISTAN ÄR HELA POÄNGEN, inte formen. `^[A-Z]{2}$` släpper igenom ZZ.
  assert.ok(/ISO_3166_1_ALPHA_2/.test(kall), 'ingen ISO-lista i modulen — bara ett formmönster');
  for (const v of ['ZZ', 'XX', 'QZ', 'AA', 'OO'])
    assert.equal(K.giltigRegion(v), null, v + ' är inte en tilldelad ISO-kod men accepterades');
  for (const v of ['SE', 'US', 'GB', 'JP', 'BR'])
    assert.equal(K.giltigRegion(v), v, v + ' är en riktig ISO-kod men avvisades');
});

// ---- REGIONALA OBSERVATIONER -------------------------------------------------------------------
//
// Granskningen av #290 gav no-go, och den hade rätt: `gavokatalog` hade `gift_id` som ensam nyckel
// och `ON CONFLICT` skrev över `region`. En senare US-seedning raderade alltså SE-observationen —
// och provet nedanför krävde den överskrivningen, alltså bevisade det fel modell.
//
// RÄTT MODELL: `gavokatalog` är KANONISK (vad gåvan ÄR — namn, bild, diamanter). Var och när den
// setts bor i `gavoobservation`, en rad per (gåva, region), med EGEN källa och EGNA
// observationstider. En region kan aldrig radera en annan.

prov('samma gift_id kan observeras i BÅDE SE och US', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: 'SE' , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: 'US' , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });

  const obs = await K.observationer(pool, G1);
  const regioner = obs.map(o => o.region).sort();
  assert.deepEqual(regioner, ['SE', 'US'], 'en region skrev över den andra');

  // Katalogen har fortfarande EN rad — gåvo-id:t är detsamma överallt, det är mätt.
  const rader = await pool.query('SELECT count(*)::int n FROM gavokatalog WHERE gift_id=$1', [G1]);
  assert.equal(rader.rows[0].n, 1, 'kanonisk tabell fick en rad per region');
});

prov('en US-seedning rör ALDRIG SE-observationens tider', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: 'SE' , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  const fore = (await K.observationer(pool, G1)).find(o => o.region === 'SE');

  await new Promise(k => setTimeout(k, 25));
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: 'US' , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });

  const efter = (await K.observationer(pool, G1)).find(o => o.region === 'SE');
  assert.ok(efter, 'SE-observationen raderades av en US-seedning');
  assert.equal(new Date(efter.forsta_sedd).getTime(), new Date(fore.forsta_sedd).getTime(),
    'US flyttade SE:s första observation');
  assert.equal(new Date(efter.senast_sedd).getTime(), new Date(fore.senast_sedd).getTime(),
    'US flyttade SE:s senaste observation');
});

prov('en ny SE-seedning flyttar senast_sedd men ALDRIG forsta_sedd', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: 'SE' , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  const fore = (await K.observationer(pool, G1)).find(o => o.region === 'SE');

  await new Promise(k => setTimeout(k, 25));
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: 'SE' , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  const efter = (await K.observationer(pool, G1)).find(o => o.region === 'SE');

  assert.equal(new Date(efter.forsta_sedd).getTime(), new Date(fore.forsta_sedd).getTime(),
    'första observationen skrevs om');
  assert.ok(new Date(efter.senast_sedd).getTime() > new Date(fore.senast_sedd).getTime(),
    'senaste observationen uppdaterades inte');
});

prov('ett event med OKÄND region rör inga regionala observationstider', async () => {
  // Ett gåvoevent bär ingen region. Det får därför fylla den kanoniska tabellen, men aldrig
  // påverka frågan "när sågs gåvan i SE?" — annars blir observationstiden en lögn.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Heart Me')], { region: 'SE' , forvantat: kontrolltal([katalogpost(G1, 'Heart Me')]) });
  const fore = (await K.observationer(pool, G1)).find(o => o.region === 'SE');

  await new Promise(k => setTimeout(k, 25));
  await K.noteraFranEvent(pool, gava(G1));

  const obs = await K.observationer(pool, G1);
  assert.equal(obs.length, 1, 'händelsevägen skapade en regional observation utan att veta regionen');
  assert.equal(new Date(obs[0].senast_sedd).getTime(), new Date(fore.senast_sedd).getTime(),
    'ett event flyttade en regional observationstid');

  // Kontrollmätning: eventet SKA ha rört den kanoniska raden — annars mäter provet ingenting.
  const kanon = await pool.query('SELECT senast_sedd FROM gavokatalog WHERE gift_id=$1', [G1]);
  assert.ok(new Date(kanon.rows[0].senast_sedd).getTime() > new Date(fore.forsta_sedd).getTime(),
    'eventet nådde inte ens den kanoniska tabellen');
});

prov('ZZ och andra icke-tilldelade koder avvisas', async () => {
  // ^[A-Z]{2}$ är inte ISO 3166-1 alpha-2. ZZ, XX och QM–QZ är användartilldelade eller
  // oanvända — de betyder inte "land", de betyder "ingen sa något".
  for (const kod of ['ZZ', 'XX', 'QZ', 'AA', 'OO', 'ZY']) {
    const ut = await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: kod , forvantat: kontrolltal([katalogpost(G1, 'Rose')]) });
    assert.equal(ut.skrivna, 0, kod + ' accepterades som region');
    assert.equal(ut.fel, 'okand-region');
    assert.equal(K.giltigRegion(kod), null, kod + ' passerade valideringen');
  }
  // KONTROLLMÄTNING: verkliga koder SKA passera.
  for (const kod of ['SE', 'US', 'GB', 'DE', 'JP', 'BR', 'AE'])
    assert.equal(K.giltigRegion(kod), kod, kod + ' avvisades trots att den är en riktig ISO-kod');
  assert.equal(await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')], { region: 'SE' , forvantat: kontrolltal([katalogpost(G1, 'Rose')]) })
    .then(r => r.skrivna), 1, 'en giltig region blockerades');
});

prov('ett avbrott mitt i bulken lämnar INGEN delvis seedning', async () => {
  // Utan transaktion hade ett databasfel vid post 400 av 783 lämnat 399 rader som ser
  // exakt ut som en komplett seedning. Det är den farligaste sortens fel: tyst och trovärdigt.
  const poster = [katalogpost(G1, 'A'), katalogpost(G2, 'B'), katalogpost(G3, 'C')];
  // Kontrolltalen MÅSTE stämma här, annars avvisas anropet innan transaktionen ens börjar och
  // provet mäter inte längre atomiciteten. Precis så föll det i CI: `_provFel` hann aldrig
  // utlösas, och bara `assert.rejects` avslöjade att provet slutat mäta något.
  await assert.rejects(
    () => K.noteraKatalog(pool, poster,
      { region: 'SE', forvantat: { poster: 3, unikaId: 3, utanId: 0, digest: K.digestAvPoster(poster) }, _provFel: n => n === 2 }),
    'bulken svalde felet i stället för att kasta');

  for (const id of [G1, G2, G3])
    assert.deepEqual(await K.observationer(pool, id), [], id + ' överlevde ett avbrutet bulkanrop');

  const st = await K.seedningStatus(pool, 'SE');
  assert.equal(st.klar, false, 'en avbruten seedning markerades som komplett');
});

prov('en bulk markeras klar bara mot DEKLARERADE kontrolltal', async () => {
  // Talen står som literaler, inte som `kontrolltal(listan)`. Skillnaden är hela poängen: det
  // gamla provet räknade fram sin förväntan ur samma lista koden räknade ur, och kunde därför
  // aldrig upptäcka att en trunkerad lista markerades klar.
  const ut = await K.noteraKatalog(pool,
    [katalogpost(G1, 'A'), katalogpost(G1, 'A'), katalogpost(G2, 'B')],
    { region: 'SE', forvantat: { poster: 3, unikaId: 2, utanId: 0, digest: K.digestAvPoster([katalogpost(G1, 'A'), katalogpost(G1, 'A'), katalogpost(G2, 'B')]) } });

  assert.equal(ut.skrivna, 3, 'antalet OBSERVERADE poster stämmer inte');
  assert.equal(ut.unikaId, 2, 'antalet UNIKA id stämmer inte');
  assert.equal(ut.region, 'SE');
  assert.equal(ut.status, 'klar');

  const st = await K.seedningStatus(pool, 'SE');
  assert.equal(st.klar, true, 'en komplett seedning markerades inte som klar');
  assert.equal(st.senaste.antal_poster, 3);
  assert.equal(st.senaste.antal_unika, 2);
  assert.ok(st.senaste.klar_at, 'klar_at sattes inte');
});

prov('en avbruten seedning gör inte en TIDIGARE komplett seedning ogiltig', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'A')], { region: 'SE' , forvantat: kontrolltal([katalogpost(G1, 'A')]) });
  assert.equal((await K.seedningStatus(pool, 'SE')).klar, true);

  await assert.rejects(() => K.noteraKatalog(pool,
    [katalogpost(G2, 'B'), katalogpost(G3, 'C')], { region: 'SE', _provFel: n => n === 2 , forvantat: kontrolltal([katalogpost(G2, 'B'), katalogpost(G3, 'C')]) }));

  assert.equal((await K.seedningStatus(pool, 'SE')).klar, true,
    'ett misslyckat försök raderade beviset på att regionen en gång seedats komplett');
  assert.deepEqual((await K.observationer(pool, G1)).map(o => o.region), ['SE'],
    'den tidigare seedningens rader försvann');
});

prov('regionen kan inte smugglas in via HTTP-kroppen som en funktion', async () => {
  // `_provFel` är MED FLIT en funktion. En JSON-kropp kan inte bära en funktion, så
  // felinjektionen är fysiskt onåbar från rutten — inte bara onåbar av artighet.
  const kropp = JSON.parse(JSON.stringify({ region: 'SE', _provFel: () => true, gifts: [] }));
  assert.equal(kropp._provFel, undefined, 'en funktion överlevde JSON-serialisering');
});


// ---- FÄRDIGMARKERINGEN MÅSTE MÖTA ETT FÖRVÄNTAT KONTROLLTAL ------------------------------------
//
// Granskningen av #290 gav no-go igen, och pekade på något mina egna prov var blinda för:
// `noteraKatalog()` markerade VARJE icke-tom lista som `status='klar'`. En trunkerad lista med
// 1 av 783 poster blev alltså "verkligt färdigseedad".
//
// Transaktionen bevisade bara att alla MOTTAGNA poster skrevs — aldrig att hela den FÖRVÄNTADE
// katalogen togs emot. Och mina prov kunde inte se det, för de definierade en syntetisk
// treposterslista som komplett: koden räknade fram kontrolltalen ur den mottagna listan, och
// provet hämtade sin förväntan ur samma lista. Cirkulärt. CI kan vara helt grönt ändå.
//
// KONTROLLTALEN MÅSTE KOMMA UTIFRÅN — från den uppmätta preflighten — och får aldrig härledas ur
// listan och sedan användas som bevis för att samma lista är komplett.

// Den uppmätta SE-katalogen 2026-08-29: 783 poster, 779 unika id, 0 utan id.
const SE_POSTER = 783, SE_UNIKA = 779, SE_UTAN_ID = 0;

// Bygger en lista som ser ut som den riktiga: 779 unika id, varav fyra förekommer två gånger.
const riktigLista = (antalUnika = SE_UNIKA, dubbletter = 4) => {
  const ut = [];
  for (let i = 0; i < antalUnika; i++) ut.push(katalogpost('prov-' + (10000 + i), 'Gåva ' + i));
  for (let i = 0; i < dubbletter; i++) ut.push(katalogpost('prov-' + (10000 + i), 'Gåva ' + i));
  return ut;
};
// Kontrakt for den uppmatta SE-listan. Talen ar LITERALER — de far aldrig harledas ur listan
// som ska bevisas komplett. Digesten daremot MASTE beskriva just den korrekta listan; det ar
// hela medlemskapsbeviset, och riktigLista() ar deterministisk.
const FULL = { poster: SE_POSTER, unikaId: SE_UNIKA, utanId: SE_UTAN_ID,
               digest: K.digestAvPoster(riktigLista()), matt_at: '2026-08-29' };
const antalRader = async () => ({
  katalog: (await pool.query("SELECT count(*)::int n FROM gavokatalog WHERE gift_id LIKE 'prov-%'")).rows[0].n,
  obs: (await pool.query("SELECT count(*)::int n FROM gavoobservation WHERE gift_id LIKE 'prov-%'")).rows[0].n
});

prov('kontrolltal · 782 av 783 poster markeras ALDRIG klara', async () => {
  const lista = riktigLista();
  lista.pop();                                   // 782 poster — en enda saknas
  const ut = await K.noteraKatalog(pool, lista, { region: 'SE', forvantat: FULL });

  assert.equal(ut.ok, false, 'en trunkerad lista accepterades');
  assert.equal(ut.fel, 'kontrolltal-stammer-inte');
  assert.equal(ut.mottaget.poster, 782);
  assert.equal(ut.forvantat.poster, 783);
  assert.equal((await K.seedningStatus(pool, 'SE')).klar, false,
    'en seedning med en post för lite markerades som verkligt färdigseedad');
});

prov('kontrolltal · 778 unika id i stället för 779 markeras ALDRIG klara', async () => {
  // Rätt ANTAL poster, fel antal UNIKA. Bara postantalet hade sluppit igenom det här.
  const lista = riktigLista(SE_UNIKA - 1, 5);
  assert.equal(lista.length, SE_POSTER, 'riggen byggde fel lista');
  const ut = await K.noteraKatalog(pool, lista, { region: 'SE', forvantat: FULL });

  assert.equal(ut.ok, false, 'fel antal unika id accepterades');
  assert.equal(ut.mottaget.poster, 783, 'postantalet var rätt — det är unikheten som ska fälla');
  assert.equal(ut.mottaget.unikaId, 778);
  assert.equal((await K.seedningStatus(pool, 'SE')).klar, false);
});

prov('kontrolltal · poster UTAN id gör att seedningen inte markeras klar', async () => {
  const lista = riktigLista();
  lista[5] = { name: 'utan id', diamond_count: 1 };      // 783 poster, men en utan id
  const ut = await K.noteraKatalog(pool, lista, { region: 'SE', forvantat: FULL });

  assert.equal(ut.ok, false, 'en post utan id accepterades i en "komplett" seedning');
  assert.equal(ut.mottaget.utanId, 1);
  assert.equal(ut.forvantat.utanId, 0);
  assert.equal((await K.seedningStatus(pool, 'SE')).klar, false);
});

prov('kontrolltal · saknade eller orimliga kontrolltal avvisas', async () => {
  const lista = riktigLista();
  const dåliga = [
    undefined, null, {}, 'ja', 0,
    { poster: 783 },                                   // unikaId saknas
    { poster: 783, unikaId: 779 },                     // utanId saknas
    { poster: 0, unikaId: 0, utanId: 0 },              // en tom seedning är ingen seedning
    { poster: 779, unikaId: 783, utanId: 0 },          // fler unika än poster är omöjligt
    { poster: '783', unikaId: '779', utanId: '0' },    // strängar, inte heltal
    { poster: 783.5, unikaId: 779, utanId: 0 },
    { poster: -1, unikaId: 779, utanId: 0 }
  ];
  for (const forvantat of dåliga) {
    const ut = await K.noteraKatalog(pool, lista, { region: 'SE', forvantat });
    assert.equal(ut.ok, false, JSON.stringify(forvantat) + ' accepterades som kontrolltal');
    assert.equal(ut.fel, 'ogiltiga-kontrolltal', JSON.stringify(forvantat) + ' gav fel felkod');
  }
  assert.deepEqual(await antalRader(), { katalog: 0, obs: 0 }, 'ett avvisat kontrolltal skrev ändå');
});

prov('kontrolltal · en avvisad seedning lämnar INGA nya rader alls', async () => {
  const lista = riktigLista();
  lista.pop();
  await K.noteraKatalog(pool, lista, { region: 'SE', forvantat: FULL });
  assert.deepEqual(await antalRader(), { katalog: 0, obs: 0 },
    'en trunkerad seedning lämnade rader efter sig — de ser ut som en delvis katalog');
  const s = await pool.query("SELECT count(*)::int n FROM gavoseedning WHERE status='klar'");
  assert.equal(s.rows[0].n, 0, 'en avvisad seedning lämnade en färdigmarkering');
});

prov('kontrolltal · exakt 783/779/0 committas och markeras klar', async () => {
  const ut = await K.noteraKatalog(pool, riktigLista(), { region: 'SE', forvantat: FULL });
  assert.equal(ut.ok, true, 'en KORREKT seedning avvisades — kontrollmätningen som gör provet giltigt');
  assert.equal(ut.status, 'klar');
  assert.equal(ut.skrivna, SE_POSTER);
  assert.equal(ut.unikaId, SE_UNIKA);

  const st = await K.seedningStatus(pool, 'SE');
  assert.equal(st.klar, true);
  assert.equal(st.senaste.antal_poster, SE_POSTER);
  assert.equal(st.senaste.antal_unika, SE_UNIKA);
  assert.deepEqual(await antalRader(), { katalog: SE_UNIKA, obs: SE_UNIKA },
    '783 poster ska bli 779 rader — dubbletterna är samma gåva');
});

prov('kontrolltal · en TIDIGARE komplett seedning överlever ett senare avvisat försök', async () => {
  await K.noteraKatalog(pool, riktigLista(), { region: 'SE', forvantat: FULL });
  assert.equal((await K.seedningStatus(pool, 'SE')).klar, true);

  const trunkerad = riktigLista();
  trunkerad.pop();
  await K.noteraKatalog(pool, trunkerad, { region: 'SE', forvantat: FULL });

  const st = await K.seedningStatus(pool, 'SE');
  assert.equal(st.klar, true, 'ett misslyckat försök raderade beviset på en tidigare komplett seedning');
  assert.equal(st.senaste.antal_poster, SE_POSTER, 'färdigmarkeringen skrevs över av ett avvisat försök');
  assert.deepEqual(await antalRader(), { katalog: SE_UNIKA, obs: SE_UNIKA });
});

// ---- REGIONALA VÄRDEN --------------------------------------------------------------------------
//
// Uppmätt 2026-08-29 i den riktiga katalogen: `is_global_gift` är **false för 266 av 783 gåvor**.
// TikTok säger alltså själv att en tredjedel av katalogen inte är global. Namn, bild och diamanter
// är därmed INTE bevisat globala, och får inte bo enbart på den kanoniska raden där sista
// skrivningen vinner mellan regioner.

prov('regionala värden · namn, bild och diamanter lagras PER observation', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose', { diamond_count: 1 })],
    { region: 'SE', forvantat: { poster: 1, unikaId: 1, utanId: 0, digest: K.digestAvPoster([katalogpost(G1, 'Rose', { diamond_count: 1 })]) } });
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rosa', { diamond_count: 5 })],
    { region: 'US', forvantat: { poster: 1, unikaId: 1, utanId: 0, digest: K.digestAvPoster([katalogpost(G1, 'Rosa', { diamond_count: 5 })]) } });

  const obs = await K.observationer(pool, G1);
  const se = obs.find(o => o.region === 'SE'), us = obs.find(o => o.region === 'US');
  assert.equal(se.gift_name, 'Rose', 'US skrev över SE:s namn');
  assert.equal(us.gift_name, 'Rosa');
  assert.equal(Number(se.diamanter), 1, 'US skrev över SE:s pris');
  assert.equal(Number(us.diamanter), 5);
  assert.notEqual(se.gift_image, us.gift_image, 'bilden lagrades inte per region');
});

prov('regionala värden · is_global_gift sparas som den fakta den är', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose', { is_global_gift: false })],
    { region: 'SE', forvantat: { poster: 1, unikaId: 1, utanId: 0, digest: K.digestAvPoster([katalogpost(G1, 'Rose', { is_global_gift: false })]) } });
  const se = (await K.observationer(pool, G1)).find(o => o.region === 'SE');
  assert.equal(se.ar_global, false,
    'TikToks egen uppgift om att gåvan inte är global slängdes bort');

  await K.noteraKatalog(pool, [katalogpost(G2, 'Global', { is_global_gift: true })],
    { region: 'SE', forvantat: { poster: 1, unikaId: 1, utanId: 0, digest: K.digestAvPoster([katalogpost(G2, 'Global', { is_global_gift: true })]) } });
  assert.equal((await K.observationer(pool, G2))[0].ar_global, true);
});


// ---- KONTROLLTALEN KOMMER FRÅN ETT GRANSKAT KONTRAKT, INTE FRÅN ANROPET ------------------------
//
// Förra rundan gjorde kontrolltalen obligatoriska, men de reste i SAMMA payload som gåvolistan.
// Då är de inte oberoende: den som skickar en trunkerad lista kan skicka matchande sänkta tal och
// få den markerad `klar`. Ett kontrolltal som följer med det den ska kontrollera kontrollerar
// ingenting.
//
// Talen bor nu i `server/seedningskontrakt.js` — en fil som går genom kodgranskning och CI. Rutten
// slår upp dem på region och läser dem ALDRIG ur kroppen.

prov('kontrakt · SE-kontraktet är exakt 783/779/0, granskat och daterat', async () => {
  const Kontrakt = require('../seedningskontrakt');
  const se = Kontrakt.for('SE');
  assert.ok(se, 'inget granskat kontrakt för SE');
  assert.equal(se.poster, 783);
  assert.equal(se.unikaId, 779);
  assert.equal(se.utanId, 0);
  assert.ok(se.matt_at, 'kontraktet saknar mätdatum — då går det inte att granska');
  assert.ok(se.kalla, 'kontraktet saknar källa');
});

prov('kontrakt · en region utan granskat kontrakt kan inte seedas', async () => {
  const Kontrakt = require('../seedningskontrakt');
  assert.equal(Kontrakt.for('JP'), null, 'en ogranskad region hade ett kontrakt');
  assert.equal(Kontrakt.for('ZZ'), null);
  assert.equal(Kontrakt.for('se'), null, 'kontraktsuppslaget normaliserade i smyg');
});


// ---- KONTROLLEN SKER INOM DET ATOMISKA FLÖDET --------------------------------------------------
//
// Förkontrollen jämför den MOTTAGNA listan mot kontraktet, före transaktionen — bra, för då
// skrivs ingenting alls vid avvikelse. Men den säger inget om vad som FAKTISKT hamnade i
// databasen. En rad som tyst inte landade hade gett en `klar`-markering på en ofullständig
// seedning, vilket är exakt det färdigmarkeringen finns för att omöjliggöra.
//
// Därför räknas de verkligt skrivna raderna INNE i transaktionen, före `status='klar'`.

prov('atomiskt · en rad som inte landar rullar tillbaka HELA seedningen', async () => {
  const poster = [katalogpost(G1, 'A'), katalogpost(G2, 'B'), katalogpost(G3, 'C')];
  // `_provTappa` hoppar över skrivningen av post 2 utan att kasta — precis som en tyst förlust.
  // Förkontrollen ser fortfarande 3 mottagna poster och släpper igenom.
  const ut = await K.noteraKatalog(pool, poster, {
    region: 'SE', forvantat: { poster: 3, unikaId: 3, utanId: 0, digest: K.digestAvPoster(poster) }, _provTappa: n => n === 2
  });

  assert.equal(ut.ok, false, 'en seedning med en tappad rad markerades som komplett');
  assert.equal(ut.fel, 'skrivna-stammer-inte');
  assert.equal((await K.seedningStatus(pool, 'SE')).klar, false);
  for (const id of [G1, G2, G3])
    assert.deepEqual(await K.observationer(pool, id), [], id + ' överlevde en tillbakarullad seedning');
});

prov('atomiskt · räkningen sker mot databasen, inte mot en lokal räknare', async () => {
  // Kontrollmätning: utan tappade rader ska allt gå igenom och antalen stämma med DATABASEN.
  const poster = [katalogpost(G1, 'A'), katalogpost(G2, 'B'), katalogpost(G3, 'C')];
  const ut = await K.noteraKatalog(pool, poster,
    { region: 'SE', forvantat: { poster: 3, unikaId: 3, utanId: 0, digest: K.digestAvPoster(poster) } });
  assert.equal(ut.ok, true);

  const rader = await pool.query(
    "SELECT count(*)::int n FROM gavoobservation WHERE region='SE' AND gift_id LIKE 'prov-%'");
  const st = await K.seedningStatus(pool, 'SE');
  assert.equal(rader.rows[0].n, st.senaste.antal_unika,
    'färdigmarkeringens antal stämmer inte med antalet rader som faktiskt finns');
});

// ---- KANDIDATLISTAN LÄSER OBSERVATIONEN, INTE DEN KANONISKA RADEN ------------------------------
//
// Den kanoniska tabellen är "senast sett någonstans" och får inte användas som global sanning för
// regionala attribut — `is_global_gift` är falskt för 266 av 783 gåvor.

prov('kandidatlistan visar REGIONENS namn och pris, inte den kanoniska radens', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose', { diamond_count: 1 })],
    { region: 'SE', forvantat: { poster: 1, unikaId: 1, utanId: 0, digest: K.digestAvPoster([katalogpost(G1, 'Rose', { diamond_count: 1 })]) } });
  // En senare US-seedning skriver den KANONISKA raden sist. Kandidatlistan för SE får inte visa
  // US-värdena.
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rosa', { diamond_count: 99 })],
    { region: 'US', forvantat: { poster: 1, unikaId: 1, utanId: 0, digest: K.digestAvPoster([katalogpost(G1, 'Rosa', { diamond_count: 99 })]) } });
  await K.verifiera(pool, REGEL, G1);

  const lista = await K.kandidater(pool, REGEL, { region: 'SE' });
  const rad = lista.find(r => r.gift_id === G1);
  assert.equal(rad.gift_name, 'Rose', 'kandidatlistan visade den kanoniska radens namn — alltså US:s');
  assert.equal(Number(rad.diamanter), 1, 'kandidatlistan visade US:s pris för en SE-granskning');
  assert.deepEqual(rad.regioner, ['SE', 'US']);
});



// ---- RÄKNINGEN MÅSTE VARA BUNDEN TILL EXAKT DENNA SEEDNING ------------------------------------
//
// Granskningens scenario: om databasräkningen bara filtrerade på region skulle ÄLDRE
// observationsrader kunna få en ofullständig NY seedning att nå 779. Raderna finns ju redan.
//
// Därför är frågan bunden till `seedning_id` — ett uuid som skapas i just den här transaktionen.
// En rad som inte rördes av den här seedningen bär ett annat id och kan inte räknas med.

prov('scopad räkning · gamla observationsrader räddar INTE en ofullständig ny seedning', async () => {
  const lista = [katalogpost(G1, 'A'), katalogpost(G2, 'B'), katalogpost(G3, 'C')];
  const kt = { poster: 3, unikaId: 3, utanId: 0, digest: K.digestAvPoster(lista) };

  // Första seedningen är komplett. Nu FINNS tre SE-rader i databasen.
  const forst = await K.noteraKatalog(pool, lista, { region: 'SE', forvantat: kt });
  assert.equal(forst.ok, true);
  const fore = await pool.query("SELECT count(*)::int n FROM gavoobservation WHERE region='SE'");
  assert.equal(fore.rows[0].n, 3, 'riggen la inte in de gamla raderna');

  // Andra seedningen tappar en rad tyst. En oscopad räkning hade sett tre SE-rader — två nya plus
  // den gamla som inte rördes — och markerat seedningen komplett.
  const igen = await K.noteraKatalog(pool, lista,
    { region: 'SE', forvantat: kt, _provTappa: n => n === 2 });

  assert.equal(igen.ok, false, 'gamla rader fick en ofullständig seedning att se komplett ut');
  assert.equal(igen.fel, 'skrivna-stammer-inte');
  assert.equal(igen.faktisktSkrivna, 2, 'räkningen var inte bunden till den här seedningen');

  // Den FÖRSTA seedningen står kvar — den var komplett och ska inte straffas.
  const st = await K.seedningStatus(pool, 'SE');
  assert.equal(st.klar, true, 'ett misslyckat andra försök ogiltigförklarade den första');
  assert.equal(st.senaste.id, forst.seedningId, 'färdigmarkeringen pekar på fel seedning');
});

prov('scopad räkning · en annan REGIONS rader räknas aldrig med', async () => {
  const lista = [katalogpost(G1, 'A'), katalogpost(G2, 'B'), katalogpost(G3, 'C')];
  await K.noteraKatalog(pool, lista, { region: 'US', forvantat: { poster: 3, unikaId: 3, utanId: 0, digest: K.digestAvPoster(lista) } });

  // Tre US-rader finns. En SE-seedning som tappar en rad får inte låna dem.
  const ut = await K.noteraKatalog(pool, lista,
    { region: 'SE', forvantat: { poster: 3, unikaId: 3, utanId: 0, digest: K.digestAvPoster(lista) }, _provTappa: n => n === 3 });
  assert.equal(ut.ok, false, 'US-rader räknades in i en SE-seedning');
  assert.equal(ut.faktisktSkrivna, 2);
  assert.equal((await K.seedningStatus(pool, 'SE')).klar, false);
  assert.equal((await K.seedningStatus(pool, 'US')).klar, true, 'US-seedningen skadades');
});

// ---- KANDIDATVÄGEN ÄR FAIL-CLOSED --------------------------------------------------------------
//
// Attributen skiljer sig mellan regioner. En kandidatlista utan giltig region får därför inte
// falla tillbaka på den kanoniska raden — "senast sett någonstans" är en annan regions värden.

prov('kandidatvägen · saknad eller ogiltig region ger TOMT, aldrig kanoniska värden', async () => {
  await K.noteraKatalog(pool, [katalogpost(G1, 'Rose')],
    { region: 'SE', forvantat: { poster: 1, unikaId: 1, utanId: 0, digest: K.digestAvPoster([katalogpost(G1, 'Rose')]) } });
  await K.verifiera(pool, REGEL, G1);

  // KONTROLLMÄTNING FÖRST: med giltig region SKA listan innehålla något.
  assert.equal((await K.kandidater(pool, REGEL, { region: 'SE' })).length, 1,
    'kandidatlistan är tom även med giltig region — då bevisar tomheten nedan ingenting');

  for (const region of [undefined, null, '', 'se', 'ZZ', 'SWE', 'S', 12, {}]) {
    const lista = await K.kandidater(pool, REGEL, { region });
    assert.deepEqual(lista, [], JSON.stringify(region) + ' gav en lista i stället för att fallera stängt');
  }
  assert.deepEqual(await K.kandidater(pool, REGEL), [], 'utan region alls gavs en lista');
});

test('vakt: kandidatfrågan läser aldrig attribut ur den kanoniska tabellen', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'gavokatalog.js'), 'utf8');
  const fraga = kall.slice(kall.indexOf('async function kandidater'));
  const kropp = fraga.slice(0, fraga.indexOf('\n}'));

  // gavokatalog får inte alls förekomma i kandidatfrågan: attributen bor på observationen.
  assert.ok(!/FROM gavokatalog|JOIN gavokatalog/.test(kropp),
    'kandidatfrågan rör den kanoniska tabellen — då kan den visa en annan regions namn och pris');
  assert.ok(/JOIN gavoobservation/.test(kropp), 'kandidatfrågan läser inte observationen');
  assert.ok(/o\.gift_name/.test(kropp) && /o\.diamanter/.test(kropp),
    'attributen hämtas inte ur observationen');
});



// ---- MEDLEMSKAP, INTE BARA ANTAL ---------------------------------------------------------------
//
// Kontrolltalen bevisar KARDINALITET. En lista kan ha 783 poster, 779 unika id och 0 utan id — och
// ändå sakna ett id ur den observerade katalogen och bära ett annat i stället. Den uppfyller
// 783/779/0 och markeras `klar`, trots att den inte är samma regionala snapshot som kontraktet
// beskriver.
//
// Extra relevant eftersom kontraktet är daterat 2026-08-29 medan seedningen hämtar ett FÄRSKT
// TikTok-svar. Antalen kan stämma medan innehållet har glidit.
//
// Därför ett icke-reversibelt kontrollvärde: SHA-256 över en deterministiskt sorterad MULTIMÄNGD
// av alla normaliserade id. Multimängd — inte mängd — eftersom fyra id förekommer två gånger, och
// en ändrad dubblettfördelning ska fällas. Digesten avslöjar inga råa giftId och behöver aldrig
// loggas eller returneras.

const idLista = (n, prefix = 'prov-2') => {
  const ut = [];
  for (let i = 0; i < n; i++) ut.push(katalogpost(prefix + (1000 + i), 'G' + i));
  return ut;
};

prov('digest · ett utbytt id fälls trots att 783/779/0 stämmer', async () => {
  const original = idLista(5);
  const kt = { poster: 5, unikaId: 5, utanId: 0, digest: K.digestAvPoster(original) };

  // Samma antal poster, samma antal unika, samma antal utan id — men EN annan gåva.
  const bytt = idLista(5);
  bytt[3] = katalogpost('prov-2999', 'Inkräktare');

  const ut = await K.noteraKatalog(pool, bytt, { region: 'SE', forvantat: kt });
  assert.equal(ut.ok, false, 'ett utbytt id passerade — kontrolltalen bevisar bara antal');
  assert.equal(ut.fel, 'digest-stammer-inte');

  // KONTROLLMÄTNING: originalet SKA passera, annars mäter provet bara att koden är trasig.
  assert.equal((await K.noteraKatalog(pool, original, { region: 'SE', forvantat: kt })).ok, true,
    'den korrekta listan avvisades också');
});

prov('digest · samma id-mängd i ANNAN ORDNING accepteras', async () => {
  const original = idLista(5);
  const kt = { poster: 5, unikaId: 5, utanId: 0, digest: K.digestAvPoster(original) };

  const omkastad = original.slice().reverse();
  assert.notDeepEqual(omkastad.map(p => p.id), original.map(p => p.id), 'riggen kastade inte om något');

  const ut = await K.noteraKatalog(pool, omkastad, { region: 'SE', forvantat: kt });
  assert.equal(ut.ok, true, 'ordningen på TikToks svar fick fälla en korrekt lista');
  assert.equal(ut.status, 'klar');
});

prov('digest · ändrad DUBBLETTFÖRDELNING med samma totalsiffror fälls', async () => {
  // Det är därför det är en MULTIMÄNGD och inte en mängd: 6 poster, 5 unika i båda fallen — men
  // dubbletten sitter på olika id. En vanlig mängd hade sett dem som identiska.
  const a = idLista(5); a.push(katalogpost('prov-21000', 'G0'));   // dubblett på det FÖRSTA id:t
  const b = idLista(5); b.push(katalogpost('prov-21004', 'G4'));   // dubblett på det SISTA id:t

  const kt = { poster: 6, unikaId: 5, utanId: 0, digest: K.digestAvPoster(a) };
  assert.equal(a.length, b.length);
  assert.equal(new Set(a.map(p => p.id)).size, new Set(b.map(p => p.id)).size);

  const ut = await K.noteraKatalog(pool, b, { region: 'SE', forvantat: kt });
  assert.equal(ut.ok, false, 'en annan dubblettfördelning passerade — digesten är en mängd, inte en multimängd');
  assert.equal(ut.fel, 'digest-stammer-inte');

  assert.equal((await K.noteraKatalog(pool, a, { region: 'SE', forvantat: kt })).ok, true,
    'kontrollmätningen: rätt fördelning ska passera');
});

prov('digest · en avvikelse lämnar INGA rader och ingen färdigmarkering', async () => {
  const original = idLista(5);
  const kt = { poster: 5, unikaId: 5, utanId: 0, digest: K.digestAvPoster(original) };
  const bytt = idLista(5); bytt[0] = katalogpost('prov-2999', 'Inkräktare');

  await K.noteraKatalog(pool, bytt, { region: 'SE', forvantat: kt });

  const rader = await pool.query("SELECT count(*)::int n FROM gavoobservation WHERE gift_id LIKE 'prov-2%'");
  assert.equal(rader.rows[0].n, 0, 'en digestavvikelse lämnade observationsrader');
  const kat = await pool.query("SELECT count(*)::int n FROM gavokatalog WHERE gift_id LIKE 'prov-2%'");
  assert.equal(kat.rows[0].n, 0, 'en digestavvikelse lämnade katalograder');
  assert.equal((await K.seedningStatus(pool, 'SE')).klar, false, 'en digestavvikelse markerades klar');
});

prov('digest · ett kontrakt UTAN digest kan inte seeda — fail-closed', async () => {
  const original = idLista(5);
  const ut = await K.noteraKatalog(pool, original,
    { region: 'SE', forvantat: { poster: 5, unikaId: 5, utanId: 0 } });
  assert.equal(ut.ok, false, 'ett kontrakt utan medlemskapsbevis fick seeda');
  assert.equal(ut.fel, 'ogiltiga-kontrolltal');
  assert.deepEqual(await K.observationer(pool, 'prov-21000'), []);
});

prov('digest · seedningen sparar kontraktets digest för efterhandsgranskning', async () => {
  const original = idLista(5);
  const d = K.digestAvPoster(original);
  const ut = await K.noteraKatalog(pool, original,
    { region: 'SE', forvantat: { poster: 5, unikaId: 5, utanId: 0, digest: d, matt_at: '2026-08-29' } });
  assert.equal(ut.ok, true);

  const q = await pool.query('SELECT kontrakt_digest, kontrakt_matt_at FROM gavoseedning WHERE id=$1',
    [ut.seedningId]);
  assert.equal(q.rows[0].kontrakt_digest, d, 'digesten sparades inte — då går färdigmarkeringen inte att granska');
  assert.ok(q.rows[0].kontrakt_matt_at, 'kontraktets mätdatum sparades inte');
});

test('vakt: digesten är en multimängd över normaliserade id, och läcker aldrig', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'gavokatalog.js'), 'utf8');

  // Samma normalisering som skrivvägen: text(...) med samma längdgräns.
  const a = [{ id: 'b' }, { id: 'a' }, { id: 'b' }];
  const b = [{ id: 'b' }, { id: 'b' }, { id: 'a' }];
  const c = [{ id: 'a' }, { id: 'a' }, { id: 'b' }];
  assert.equal(K.digestAvPoster(a), K.digestAvPoster(b), 'ordningen ska inte spela roll');
  assert.notEqual(K.digestAvPoster(a), K.digestAvPoster(c), 'dubblettfördelningen MÅSTE spela roll');
  assert.match(K.digestAvPoster(a), /^[0-9a-f]{64}$/);

  // Digesten får aldrig loggas eller skickas ut som råa id.
  assert.ok(!/console\.|logger\./.test(kall), 'modulen loggar');
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
