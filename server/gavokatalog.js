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
// ISO 3166-1 alpha-2, de FAKTISKT TILLDELADE koderna. 249 stycken.
//
// `^[A-Z]{2}$` är inte den här listan: det mönstret släpper igenom ZZ, XX, QM–QZ och AA — koder
// som är användartilldelade eller oanvända. De betyder inte "land", de betyder "ingen sa något",
// och en observation märkt ZZ är en observation utan proveniens som ser ut att ha en.
const ISO_3166_1_ALPHA_2 = new Set([
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
  'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ',
  'EC','EE','EG','EH','ER','ES','ET',
  'FI','FJ','FK','FM','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
  'HK','HM','HN','HR','HT','HU',
  'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
  'JE','JM','JO','JP',
  'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
  'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ',
  'OM',
  'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY',
  'QA',
  'RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
  'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','UM','US','UY','UZ',
  'VA','VC','VE','VG','VI','VN','VU',
  'WF','WS',
  'YE','YT',
  'ZA','ZM','ZW'
]);

// REGIONEN GISSAS ALDRIG, och normaliseras inte heller. Versaler krävs — `se` avvisas i stället
// för att tyst bli `SE`, för en anropare som skickar fel form har troligen fel källa också.
const giltigRegion = v => {
  const k = typeof v === 'string' ? v.trim() : '';
  return /^[A-Z]{2}$/.test(k) && ISO_3166_1_ALPHA_2.has(k) ? k : null;
};

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
//   3. INGEN REGIONAL OBSERVATION SKRIVS HÄRIFRÅN. Ett gåvoevent bär ingen region över huvud
//      taget, så händelsevägen rör bara den kanoniska tabellen. Skrev den i `gavoobservation`
//      hade `forsta_sedd` där betytt "först sedd någonstans" i stället för "först sedd i DEN HÄR
//      regionen" — vilket var precis felet granskningen fällde #290 på.
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

// KONTROLLTALEN. Vad anroparen SÄGER att listan innehåller, uppmätt i preflighten.
//
// De får ALDRIG härledas ur listan som ska bevisas komplett — då bevisar de ingenting. `783` måste
// komma från mätningen av TikToks svar, inte från `poster.length`. Hela poängen är att de två kan
// skilja sig, och att en skillnad ska stoppa seedningen.
const heltalExakt = v => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
function lasKontrolltal(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
  const poster = heltalExakt(f.poster), unikaId = heltalExakt(f.unikaId), utanId = heltalExakt(f.utanId);
  if (poster === null || unikaId === null || utanId === null) return null;
  if (poster < 1 || unikaId < 1) return null;              // en tom seedning är ingen seedning
  if (unikaId > poster) return null;                       // fler unika än poster är omöjligt
  if (utanId > poster) return null;
  return { poster, unikaId, utanId };
}

// Bulkinläggning från TikToks gåvolista, för EN observerad region.
//
// TVÅ SPÄRRAR, och de svarar på olika frågor:
//
//   TRANSAKTIONEN svarar på "skrevs allt som togs emot?" — ett databasfel vid post 400 av 783
//   lämnar inga rader alls i stället för 399 som ser kompletta ut.
//
//   KONTROLLTALEN svarar på "togs allt emot?" — och det kan transaktionen inte veta. En trunkerad
//   lista med 1 av 783 poster skrivs helt och hållet korrekt. Utan kontrolltal markerades den
//   `klar`, alltså "verkligt färdigseedad". Det var felet granskningen fällde #290 på.
//
// En avvikelse rullar tillbaka HELA transaktionen: ingen katalograd, ingen observation, ingen
// färdigmarkering. En avvisad seedning ska inte gå att förväxla med en delvis genomförd.
async function noteraKatalog(pool, poster, { region, forvantat, _provFel = null, _provTappa = null } = {}) {
  const reg = giltigRegion(region);
  if (!reg) return { ok: false, skrivna: 0, unikaId: 0, fel: 'okand-region' };

  const kt = lasKontrolltal(forvantat);
  if (!kt) return { ok: false, skrivna: 0, unikaId: 0, region: reg, fel: 'ogiltiga-kontrolltal' };

  if (!Array.isArray(poster) || !poster.length)
    return { ok: false, skrivna: 0, unikaId: 0, region: reg, fel: 'tom-lista' };

  // MOTTAGET räknas ur listan — det är rätt håll. FÖRVÄNTAT kommer utifrån.
  const unika = new Set();
  let utanId = 0;
  for (const p of poster) {
    const id = text(p && (p.id ?? p.gift_id), 160);
    if (id) unika.add(id); else utanId += 1;
  }
  const mottaget = { poster: poster.length, unikaId: unika.size, utanId };

  if (mottaget.poster !== kt.poster || mottaget.unikaId !== kt.unikaId || mottaget.utanId !== kt.utanId)
    return { ok: false, skrivna: 0, unikaId: mottaget.unikaId, region: reg,
             fel: 'kontrolltal-stammer-inte', mottaget, forvantat: kt };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seed = await client.query(
      `INSERT INTO gavoseedning (region, status, forv_poster, forv_unika, forv_utan_id)
       VALUES ($1,'pagaende',$2,$3,$4) RETURNING id`, [reg, kt.poster, kt.unikaId, kt.utanId]);
    const seedningId = seed.rows[0].id;

    let skrivna = 0, hoppade = 0, n = 0;
    for (const p of poster) {
      n += 1;
      // TESTSÖM, MED FLIT EN FUNKTION: en JSON-kropp kan inte bära en funktion, så felinjektionen
      // är fysiskt onåbar från HTTP-rutten — inte bara onåbar av artighet.
      if (typeof _provFel === 'function' && _provFel(n)) throw new Error('provframkallat fel vid post ' + n);

      const giftId = text(p && (p.id ?? p.gift_id), 160);
      if (!giftId) { hoppade += 1; continue; }
      // TESTSÖM, också en funktion: hoppar över skrivningen UTAN att kasta — en tyst förlust.
      // Förkontrollen ser fortfarande rätt antal MOTTAGNA poster och släpper igenom, så bara
      // räkningen mot databasen nedan kan fånga det.
      if (typeof _provTappa === 'function' && _provTappa(n)) { skrivna += 1; continue; }
      const namn = text(p.name, 160);
      const bild = text((p.image && Array.isArray(p.image.url_list) && p.image.url_list[0]) || p.icon_url || '', 1200);
      const dm = heltal(p.diamond_count);
      const global = typeof p.is_global_gift === 'boolean' ? p.is_global_gift : null;

      await client.query(
        `INSERT INTO gavokatalog (gift_id, gift_name, gift_image, diamanter, kalla)
         VALUES ($1,$2,$3,$4,'katalog')
         ON CONFLICT (gift_id) DO UPDATE
           SET gift_name = CASE WHEN EXCLUDED.gift_name <> '' THEN EXCLUDED.gift_name
                                ELSE gavokatalog.gift_name END,
               gift_image = CASE WHEN EXCLUDED.gift_image <> '' THEN EXCLUDED.gift_image
                                 ELSE gavokatalog.gift_image END,
               diamanter = EXCLUDED.diamanter, kalla = 'katalog', senast_sedd = now()`,
        [giftId, namn, bild, dm]);

      // Observationen bär regionens EGNA värden. Ingen annan region kan röra dem.
      await client.query(
        `INSERT INTO gavoobservation
           (gift_id, region, kalla, seedning_id, gift_name, gift_image, diamanter, ar_global)
         VALUES ($1,$2,'katalog',$3,$4,$5,$6,$7)
         ON CONFLICT (gift_id, region) DO UPDATE
           SET kalla = 'katalog', seedning_id = EXCLUDED.seedning_id,
               gift_name = EXCLUDED.gift_name, gift_image = EXCLUDED.gift_image,
               diamanter = EXCLUDED.diamanter, ar_global = EXCLUDED.ar_global,
               senast_sedd = now()`,
        [giftId, reg, seedningId, namn, bild, dm, global]);
      skrivna += 1;
    }

    // RÄKNINGEN SKER MOT DATABASEN, INNE I TRANSAKTIONEN, FÖRE FÄRDIGMARKERINGEN.
    //
    // Förkontrollen ovan jämförde den MOTTAGNA listan mot kontraktet — den säger inget om vad som
    // faktiskt hamnade i databasen. En rad som tyst inte landade hade gett en `klar`-markering på
    // en ofullständig seedning, vilket är precis det färdigmarkeringen finns för att omöjliggöra.
    //
    // En lokal räknare duger inte: den räknar vad koden TROR att den skrev. Frågan nedan räknar
    // vad som står där, och gör det innan COMMIT — så en avvikelse rullar tillbaka allt.
    const faktiskt = await client.query(
      `SELECT count(*)::int n FROM gavoobservation WHERE region=$1 AND seedning_id=$2`,
      [reg, seedningId]);
    if (faktiskt.rows[0].n !== mottaget.unikaId) {
      await client.query('ROLLBACK');
      return { ok: false, skrivna: 0, unikaId: mottaget.unikaId, region: reg,
               fel: 'skrivna-stammer-inte',
               mottaget, forvantat: kt, faktisktSkrivna: faktiskt.rows[0].n };
    }

    await client.query(
      `UPDATE gavoseedning SET status='klar', antal_poster=$2, antal_unika=$3, klar_at=now()
        WHERE id=$1`, [seedningId, skrivna, mottaget.unikaId]);
    await client.query('COMMIT');

    return { ok: true, skrivna, hoppade, unikaId: mottaget.unikaId, region: reg,
             seedningId, status: 'klar', mottaget, forvantat: kt };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Var och när en gåva observerats, med regionens EGNA värden. PK är (gift_id, region), så SE och
// US är två rader och ingen kan skriva över den andra.
async function observationer(pool, giftId) {
  if (!giftId) return [];
  const q = await pool.query(
    `SELECT region, kalla, gift_name, gift_image, diamanter, ar_global, forsta_sedd, senast_sedd
       FROM gavoobservation WHERE gift_id = $1 ORDER BY region`, [giftId]);
  return q.rows;
}

// Är regionen VERKLIGEN färdigseedad? En räkning av rader kan inte svara — en trunkerad lista
// skriver sina rader korrekt. Bara en seedning vars mottagna tal mötte de förväntade når 'klar'.
async function seedningStatus(pool, region) {
  const reg = giltigRegion(region);
  if (!reg) return { klar: false, senaste: null, fel: 'okand-region' };
  const q = await pool.query(
    `SELECT id, antal_poster, antal_unika, forv_poster, forv_unika, forv_utan_id, startad_at, klar_at
       FROM gavoseedning WHERE region=$1 AND status='klar' ORDER BY klar_at DESC LIMIT 1`, [reg]);
  return { klar: q.rowCount > 0, region: reg, senaste: q.rows[0] || null };
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
async function kandidater(pool, ruleKey, { region } = {}) {
  // REGIONEN ÄR OBLIGATORISK. Attributen skiljer sig mellan regioner — `is_global_gift` är falskt
  // för 266 av 783 gåvor — så en kandidatlista utan region skulle behöva läsa den kanoniska raden,
  // alltså "senast sett någonstans". En människa som granskar SE ska se SE:s namn och pris.
  const reg = giltigRegion(region);
  if (!reg) return [];
  const q = await pool.query(
    // REGIONEN FOLJER MED. Utan den gar "exakt en verifierad post for den observerade regionen"
    // bara att sluta sig till, och en slutsats ar inte en matning.
    // Attributen kommer ur OBSERVATIONEN för den efterfrågade regionen — aldrig ur den kanoniska
    // raden, som bara är "senast sett någonstans" och därför kan bära en annan regions värden.
    `SELECT r.gift_id, r.bekraftelser, r.status,
            o.gift_name, o.gift_image, o.diamanter, o.ar_global, o.forsta_sedd, o.senast_sedd,
            COALESCE(ARRAY(SELECT o2.region FROM gavoobservation o2
                            WHERE o2.gift_id = r.gift_id ORDER BY o2.region), '{}') AS regioner
       FROM gavoregel r
       JOIN gavoobservation o ON o.gift_id = r.gift_id AND o.region = $2
      WHERE r.rule_key = $1 ORDER BY r.bekraftelser DESC, r.gift_id`, [ruleKey, reg]);
  return q.rows.map(r => ({ ...r, mogen: Number(r.bekraftelser) >= KRAV_BEKRAFTELSER }));
}

module.exports = {
  noteraFranEvent, noteraKatalog, verifieradeId, noteraKandidat, verifiera,
  inaktivera, taBort, kandidater,
  observationer, seedningStatus,
  kallnyckel, tomCache, giltigRegion, KRAV_BEKRAFTELSER, ETIKETT, CACHE_MS
};
