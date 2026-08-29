'use strict';
// GÅVOKATALOGEN OCH DEN GLOBALA GÅVOREGELN.
//
// Problemet den löser: fram till 2026-08-28 kunde VYRA bara lära sig en gåva i taget, genom att
// någon faktiskt skickade den. 783 gåvor en och en är ingen produkt.
//
// TVÅ SAKER SOM ÄR LÄTTA ATT BLANDA IHOP, och som med flit ligger i två tabeller:
//
//   gavokatalog   gift_id -> namn och bild.  ETIKETTERING. Avgör aldrig vad som räknas.
//   gavoregel     rule_key -> verifierat gift_id.  IDENTITET. Avgör precis vad som räknas.
//
// Katalogen får vara stor, slarvig och full av dubbletter — den beskriver bara. Regeln är liten,
// handplockad och verifierad. Att slå ihop dem hade betytt att ett katalogtillägg kan ändra vad ett
// mål räknar, och det får aldrig kunna hända av misstag.
//
// NAMNET MATCHAR ALDRIG. 49 av TikToks 783 gåvonamn är dubbletter i deras EGEN katalog, och
// normalizer.js defaultar giftName till 'Gift' när namnet saknas. Ett vaktprov faller om gift_name
// någonsin används för att välja ett id.

const crypto = require('node:crypto');
const Nyckel = require('./krypteringsnyckel');

// Hur många DISTINKTA källor som krävs innan en kandidat blir verifierad. Tre = den som lärde in
// den först, plus minst två oberoende kreatörer. Ett rum som skickar samma gåva hundra gånger
// bekräftar ingenting.
const KRAV_BEKRAFTELSER = 3;

const text = (v, max) => String(v === null || v === undefined ? '' : v).slice(0, max);
// Klampar at BADA hall. Nedat ar sjalvklart; uppat ar inte det: `diamanter` ar en int4 (max
// 2 147 483 647) medan normalizer.js slapper igenom varden upp till 1e12. Utan ovre klamp kastar
// INSERT:en "integer out of range" — och eftersom anropet ar fire-and-forget med .catch(() => {})
// hade felet blivit helt tyst.
// REGIONEN GISSAS ALDRIG. ISO 3166-1 alpha-2, versaler. Allt annat avvisas — ett fält som tyst
// faller tillbaka på ett default hade gjort provenienesen värdelös precis när den behövs.
const REGION_FORM = /^[A-Z]{2}$/;
const lasRegion = v => (typeof v === 'string' && REGION_FORM.test(v.trim()) ? v.trim() : null);

const INT4_MAX = 2147483647;
const heltal = v => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), INT4_MAX);
};

// Källan hashas av samma skäl som heart_me_bidrag.avsandarnyckel: vi behöver veta ATT två olika
// kreatörer sett gåvan, aldrig VILKA. Samma domänseparerade härledning som Heart Me-nyckeln.
const ETIKETT = 'vyra:gavoregel-kalla:v1';
function kallnyckel(ra) {
  const hemlig = Nyckel.las(process.env.APP_ENCRYPTION_KEY);
  const id = String(ra || '').trim().toLowerCase();
  if (!hemlig || !id) return '';
  const under = crypto.createHmac('sha256', hemlig).update(ETIKETT).digest();
  return crypto.createHmac('sha256', under).update(id).digest('hex');
}

// ---- KATALOGEN ---------------------------------------------------------------------------------

// En gåva sedd i ett event. Anropas fire-and-forget från ingest-kedjan.
//
// TRE SKYDD, och alla tre finns för att indatan här är TENANTSTYRD. `gavokatalog` är
// DELAD ÖVER ALLA WORKSPACES — den har ingen workspace-kolumn — medan varje annan skrivning på ingest-vägen
// är scopad till ett workspace. Vem som helst med editor-roll i sitt EGET workspace kan posta ett
// gåvoevent med valfritt `giftId`, `giftName` och `giftImage`; `validateTikTokIngestPayload` tittar
// bara på `type` och `username`, och `cleanEvent` längdkapar bara.
//
//   1. TYPKONTROLL. Varje annan konsument på samma väg kontrollerar `type === 'gift'`. Utan den
//      skrev ett chattmeddelande med ett påhittat `giftId` en katalograd.
//
//   2. KATALOGKÄLLAN SKYDDAS. En rad med `kalla = 'katalog'` kommer från TikToks EGEN lista och är
//      auktoritativ. Ett event får aldrig skriva om dess namn eller bild — annars kan en hyresgäst
//      döpa om en verklig gåvas id till 'Heart Me' i en rad som ser auktoritativ ut, och `kalla`
//      står kvar och ljuger om var värdet kom ifrån. Kommentaren nedanför påstod den här
//      invarianten redan; koden höll den bara i den riktning som ALDRIG inträffar i drift
//      (seedning EFTER event). I drift seedas katalogen en gång och sedan strömmar miljontals
//      event — alltså exakt den riktning som saknade skydd.
//
//   3. `region` SKRIVS INTE HÄRIFRÅN, varken vid insättning eller konflikt. Ett gåvoevent bär
//      ingen region över huvud taget. En rad som seedats från SE ska inte tappa sin proveniens för
//      att någon skickade gåvan i ett annat rum, och en ny rad från ett event är ärligt talat av
//      okänd region — tomt betyder just det.
//
//   4. `diamanter` SKRIVS INTE HÄRIFRÅN. Kolumnen bär TikToks STYCKPRIS, men ett event bär
//      `value = coinsEach * repeatCount` (normalizer.js:68) — hela kombots summa. Att skriva in
//      det hade lagt två oförenliga storheter i samma kolumn, och eftersom ON CONFLICT inte rör
//      fältet hade det FÖRSTA kombot låst värdet för alltid, globalt för alla workspaces. Noll
//      betyder "okänt" och rättas av bulkvägen; ett trovärdigt fel gör det inte.
//
// `senast_sedd` uppdateras alltid, men namn och bild skrivs bara om vi FAKTISKT fick något — annars
// hade ett event utan namn kunnat tömma en post som bulkanropet fyllt korrekt.
async function noteraFranEvent(pool, event) {
  if (!event || event.type !== 'gift') return { noterad: false, skal: 'inte-gava' };
  const giftId = text(event.giftId, 160);
  if (!giftId) return { noterad: false, skal: 'saknar-id' };
  await pool.query(
    `INSERT INTO gavokatalog (gift_id, gift_name, gift_image, diamanter, kalla)
     VALUES ($1,$2,$3,0,'handelse')
     ON CONFLICT (gift_id) DO UPDATE
       SET gift_name = CASE WHEN gavokatalog.kalla = 'katalog' THEN gavokatalog.gift_name
                            WHEN EXCLUDED.gift_name <> '' THEN EXCLUDED.gift_name
                            ELSE gavokatalog.gift_name END,
           gift_image = CASE WHEN gavokatalog.kalla = 'katalog' THEN gavokatalog.gift_image
                             WHEN EXCLUDED.gift_image <> '' THEN EXCLUDED.gift_image
                             ELSE gavokatalog.gift_image END,
           senast_sedd = now()`,
    [giftId, text(event.giftName, 160), text(event.giftImage || event.giftPictureUrl, 1200)]);
  return { noterad: true };
}

// Bulkinläggning från TikToks gåvolista. Posterna kommer utifrån, så varje fält saneras här —
// inget av det får gå vidare orört.
//
// Katalogkällan vinner över händelsekällan för namn och bild — i BÅDA riktningarna: bulkvägen
// skriver över en händelsesatt rad, och `noteraFranEvent` vägrar skriva över en katalogsatt.
// TikToks egen lista är mer korrekt än ett enstaka event, som kan sakna fält.
//
// Men den vinner inte med ett TOMT värde. Om listan saknar namn eller bild för en post behålls det
// som redan står — samma regel som händelsevägen. Annars kunde en halvtom lista tömma poster som
// var korrekt ifyllda.
async function noteraKatalog(pool, poster, { region } = {}) {
  // REGIONEN ÄR OBLIGATORISK. En seedning utan proveniens är inte en seedning — den är en global
  // sanning vi inte har täckning för. Hellre ett avslag än en rad som ljuger om var den kom ifrån.
  const reg = lasRegion(region);
  if (!reg) return { skrivna: 0, hoppade: 0, fel: 'okand-region' };
  if (!Array.isArray(poster) || !poster.length) return { skrivna: 0, hoppade: 0, region: reg };
  let skrivna = 0, hoppade = 0;

  for (const p of poster) {
    const giftId = text(p && (p.id ?? p.gift_id), 160);
    if (!giftId) { hoppade += 1; continue; }
    const bild = text((p.image && Array.isArray(p.image.url_list) && p.image.url_list[0]) || p.icon_url || '', 1200);
    await pool.query(
      `INSERT INTO gavokatalog (gift_id, gift_name, gift_image, diamanter, kalla, region)
       VALUES ($1,$2,$3,$4,'katalog',$5)
       ON CONFLICT (gift_id) DO UPDATE
         SET gift_name = CASE WHEN EXCLUDED.gift_name <> '' THEN EXCLUDED.gift_name
                              ELSE gavokatalog.gift_name END,
             gift_image = CASE WHEN EXCLUDED.gift_image <> '' THEN EXCLUDED.gift_image
                               ELSE gavokatalog.gift_image END,
             diamanter = EXCLUDED.diamanter, kalla = 'katalog',
             region = EXCLUDED.region, senast_sedd = now()`,
      [giftId, text(p.name ?? p.name_en, 160), bild, heltal(p.diamond_count), reg]);
    skrivna += 1;
  }
  // `skrivna` raknar POSTER, `unikaId` raknar RADER. TikToks lista innehaller samma id flera
  // ganger — uppmatt 2026-08-29: 783 poster, 779 distinkta id. Att rapportera bara den ena hade
  // latit som om fyra poster forsvann.
  const unika = new Set();
  for (const p of poster) { const id = text(p && (p.id ?? p.gift_id), 160); if (id) unika.add(id); }
  return { skrivna, hoppade, region: reg, unikaId: unika.size };
}

// ---- REGELN ------------------------------------------------------------------------------------

// Alla VERIFIERADE id:n för en regel. Det här är enda uppslaget mål får använda.
//
// Returnerar en lista, inte ett värde: samma gåva kan bära olika id i olika regioner, och regeln
// ska kunna växa utan att koden ändras.
//
// CACHAD, och det är inte en optimering utan en rättelse. Uppslaget ligger på gåvovägen, som är
// husets hetaste: varje Rose i varje rum passerar här. Utan cache blev en tidigare enda fråga per
// gåva till TVÅ, eftersom reservuppslaget körs när globalt inte matchar — alltså för varje gåva som
// INTE är Heart Me, vilket är de allra flesta.
//
// PRISET ÄR INAKTUALITET, och det är medvetet: efter en verifiering kan det dröja upp till
// CACHE_MS innan den slår igenom i alla processer. Registret ändras kanske en gång i månaden, en
// gåva som räknas några sekunder för sent är ofarlig, och alternativet — att fråga databasen för
// varje Rose — är det inte. Skrivvägarna tömmer dessutom cachen direkt i sin egen process.
const CACHE_MS = 30 * 1000;
const cache = new Map();          // rule_key -> { ids, tid }

function tomCache(ruleKey) {
  if (ruleKey) cache.delete(ruleKey); else cache.clear();
}

async function verifieradeId(pool, ruleKey, { nu = Date.now } = {}) {
  const traff = cache.get(ruleKey);
  if (traff && nu() - traff.tid < CACHE_MS) return traff.ids;

  // status='verifierad' ar det ENDA som far matcha. 'kandidat' har ingen manniska godkant, och
  // 'inaktiverad' ar en post en administrator aterkallat — historiken star kvar, men den slutar
  // trigga i samma andetag.
  const q = await pool.query(
    `SELECT gift_id FROM gavoregel WHERE rule_key = $1 AND status = 'verifierad'`, [ruleKey]);
  const ids = q.rows.map(r => r.gift_id);
  cache.set(ruleKey, { ids, tid: nu() });
  return ids;
}

// VILANDE I DRIFT — LÄS DET HÄR INNAN DU TROR ATT MEKANISMEN KÖR.
//
// Funktionen anropas INTE från någon produktionskod, bara från proven. `gavoregel_kalla` är därför
// tom i drift, `bekraftelser` står kvar på 0, och status 'kandidat' uppstår aldrig — enda skrivaren
// är den manuella `verifiera()`. Schemakommentarerna beskriver alltså en väg produktionen inte kör.
//
// Det är ett medvetet stopp: så länge ingen automatik kan befordra ett id kan inget mål börja
// räkna en ny gåva utan att en människa sagt ja. Att koppla in den är ett produktbeslut.
// Se docs/gavokatalog-matresultat.md, avsnittet "Vilande med flit".
//
// Noterar att en källa sett ett id för en regel, och befordrar när tillräckligt många DISTINKTA
// källor gjort det.
//
// Befordran sker i samma transaktion som räkningen, så två samtidiga källor inte kan råka befordra
// på ett halvt underlag.
async function noteraKandidat(pool, ruleKey, giftId, raKalla) {
  const nyckel = kallnyckel(raKalla);
  if (!ruleKey || !giftId || !nyckel) return { noterad: false, skal: 'ofullstandig' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kandidaten måste finnas i katalogen först — främmande nyckeln kräver det, och en regel som
    // pekar på ett id vi aldrig sett vore inte verifierbar.
    const finns = await client.query('SELECT 1 FROM gavokatalog WHERE gift_id = $1', [giftId]);
    if (!finns.rowCount) { await client.query('ROLLBACK'); return { noterad: false, skal: 'okand-gava' }; }

    await client.query(
      `INSERT INTO gavoregel (rule_key, gift_id) VALUES ($1,$2)
       ON CONFLICT (rule_key, gift_id) DO NOTHING`, [ruleKey, giftId]);

    // ATOMISK ENGÅNGSINSÄTTNING per källa — samma mönster som Heart Me-liggaren. Ingen läsning följd
    // av skrivning, så samma rum kan inte räknas två gånger.
    const ny = await client.query(
      `INSERT INTO gavoregel_kalla (rule_key, gift_id, kallnyckel) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING RETURNING kallnyckel`, [ruleKey, giftId, nyckel]);

    if (ny.rowCount) {
      await client.query(
        `UPDATE gavoregel SET bekraftelser = bekraftelser + 1 WHERE rule_key=$1 AND gift_id=$2`,
        [ruleKey, giftId]);
    }

    // INGEN AUTOMATISK BEFORDRAN. Funktionen skrev tidigare status='verifierad' så snart
    // KRAV_BEKRAFTELSER var uppnått — alltså kunde tre rum tillsammans göra en gåva till FACIT och
    // därmed börja trigga Gift Campaign, Gift Fireworks och Goals hos alla kunder, utan att en
    // människa sett den. Det är precis det utfallet registret finns för att omöjliggöra.
    //
    // Tröskeln lever kvar, men bara som en MARKERING: `mogen` säger att kandidaten är värd en
    // människas blick. Enda vägen till 'verifierad' är `verifiera()`, som bara en
    // plattformsadministratör når.
    const rad = await client.query(
      'SELECT status, bekraftelser FROM gavoregel WHERE rule_key=$1 AND gift_id=$2', [ruleKey, giftId]);

    await client.query('COMMIT');
    const b = rad.rows[0] ? Number(rad.rows[0].bekraftelser) : 0;
    return {
      noterad: true,
      nyKalla: ny.rowCount > 0,
      bekraftelser: b,
      mogen: b >= KRAV_BEKRAFTELSER,        // redo för mänsklig granskning — INTE aktiverad
      status: rad.rows[0] ? rad.rows[0].status : 'kandidat'
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Manuell befordran för en identitet som redan bevisats på annat sätt — till exempel den som
// verifierades i drift 2026-08-28 mot både ett riktigt gåvoevent och TikToks egen katalog.
// Kräver att gåvan finns i katalogen; ett id vi aldrig sett kan inte pekas ut som verifierat.
async function verifiera(pool, ruleKey, giftId) {
  if (!ruleKey || !giftId) return { ok: false, skal: 'ofullstandig' };
  const finns = await pool.query('SELECT 1 FROM gavokatalog WHERE gift_id=$1', [giftId]);
  if (!finns.rowCount) return { ok: false, skal: 'okand-gava' };
  await pool.query(
    `INSERT INTO gavoregel (rule_key, gift_id, status, verifierad_at)
     VALUES ($1,$2,'verifierad', now())
     ON CONFLICT (rule_key, gift_id) DO UPDATE
       SET status = 'verifierad', verifierad_at = COALESCE(gavoregel.verifierad_at, now())`,
    [ruleKey, giftId]);
  tomCache(ruleKey);
  return { ok: true };
}

// Återkallar en godkänd post. Statusen 'inaktiverad' i stället för DELETE: historiken om vad som
// en gång godkändes, av vem och när, är själva poängen med en mänsklig grind. En återkallad post
// slutar matcha omedelbart — `verifieradeId` filtrerar på 'verifierad'.
async function inaktivera(pool, ruleKey, giftId) {
  if (!ruleKey || !giftId) return { ok: false, skal: 'ofullstandig' };
  const q = await pool.query(
    `UPDATE gavoregel SET status = 'inaktiverad'
      WHERE rule_key=$1 AND gift_id=$2 AND status = 'verifierad' RETURNING gift_id`,
    [ruleKey, giftId]);
  if (!q.rowCount) return { ok: false, skal: 'ingen-verifierad-post' };
  tomCache(ruleKey);
  return { ok: true };
}

// Raderar en post helt — inklusive dess källräkning. För en felaktigt inlagd rad som inte ska
// finnas i historiken alls. Kaskaden på gavoregel_kalla tar källorna.
async function taBort(pool, ruleKey, giftId) {
  if (!ruleKey || !giftId) return { ok: false, skal: 'ofullstandig' };
  const q = await pool.query(
    'DELETE FROM gavoregel WHERE rule_key=$1 AND gift_id=$2 RETURNING gift_id', [ruleKey, giftId]);
  if (!q.rowCount) return { ok: false, skal: 'saknas' };
  tomCache(ruleKey);
  return { ok: true };
}

// Kandidatlistan för mänsklig granskning. Det ENDA stället där id:n lämnar servern, och bara till
// en plattformsadministratör — utan den kan ingen människa se vad som väntar på godkännande.
async function kandidater(pool, ruleKey) {
  const q = await pool.query(
    // REGIONEN FOLJER MED. Utan den gar "exakt en verifierad post for den observerade regionen"
    // bara att sluta sig till, och en slutsats ar inte en matning.
    `SELECT r.gift_id, r.bekraftelser, r.status, k.gift_name, k.gift_image, k.diamanter, k.region
       FROM gavoregel r JOIN gavokatalog k ON k.gift_id = r.gift_id
      WHERE r.rule_key = $1 ORDER BY r.bekraftelser DESC, r.gift_id`, [ruleKey]);
  return q.rows.map(r => ({ ...r, mogen: Number(r.bekraftelser) >= KRAV_BEKRAFTELSER }));
}

module.exports = {
  noteraFranEvent, noteraKatalog, verifieradeId, noteraKandidat, verifiera,
  inaktivera, taBort, kandidater,
  kallnyckel, tomCache, lasRegion, KRAV_BEKRAFTELSER, ETIKETT, CACHE_MS
};
