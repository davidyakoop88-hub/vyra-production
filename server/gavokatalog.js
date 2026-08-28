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
const heltal = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };

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
// `senast_sedd` uppdateras alltid, men namn och bild skrivs bara om vi FAKTISKT fick något — annars
// hade ett event utan namn kunnat tömma en post som bulkanropet fyllt korrekt.
async function noteraFranEvent(pool, event) {
  const giftId = text(event && event.giftId, 160);
  if (!giftId) return { noterad: false };
  await pool.query(
    `INSERT INTO gavokatalog (gift_id, gift_name, gift_image, diamanter, kalla)
     VALUES ($1,$2,$3,$4,'handelse')
     ON CONFLICT (gift_id) DO UPDATE
       SET gift_name = CASE WHEN EXCLUDED.gift_name <> '' THEN EXCLUDED.gift_name ELSE gavokatalog.gift_name END,
           gift_image = CASE WHEN EXCLUDED.gift_image <> '' THEN EXCLUDED.gift_image ELSE gavokatalog.gift_image END,
           senast_sedd = now()`,
    [giftId, text(event.giftName, 160), text(event.giftImage || event.giftPictureUrl, 1200),
     heltal(event.value)]);
  return { noterad: true };
}

// Bulkinläggning från TikToks gåvolista. Posterna kommer utifrån, så varje fält saneras här —
// inget av det får gå vidare orört.
//
// Katalogkällan vinner över händelsekällan för namn och bild: TikToks egen lista är mer korrekt än
// ett enstaka event, som kan sakna fält.
async function noteraKatalog(pool, poster) {
  if (!Array.isArray(poster) || !poster.length) return { skrivna: 0, hoppade: 0 };
  let skrivna = 0, hoppade = 0;

  for (const p of poster) {
    const giftId = text(p && (p.id ?? p.gift_id), 160);
    if (!giftId) { hoppade += 1; continue; }
    const bild = text((p.image && Array.isArray(p.image.url_list) && p.image.url_list[0]) || p.icon_url || '', 1200);
    await pool.query(
      `INSERT INTO gavokatalog (gift_id, gift_name, gift_image, diamanter, kalla)
       VALUES ($1,$2,$3,$4,'katalog')
       ON CONFLICT (gift_id) DO UPDATE
         SET gift_name = EXCLUDED.gift_name, gift_image = EXCLUDED.gift_image,
             diamanter = EXCLUDED.diamanter, kalla = 'katalog', senast_sedd = now()`,
      [giftId, text(p.name ?? p.name_en, 160), bild, heltal(p.diamond_count)]);
    skrivna += 1;
  }
  return { skrivna, hoppade };
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

  const q = await pool.query(
    `SELECT gift_id FROM gavoregel WHERE rule_key = $1 AND status = 'verifierad'`, [ruleKey]);
  const ids = q.rows.map(r => r.gift_id);
  cache.set(ruleKey, { ids, tid: nu() });
  return ids;
}

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

    const q = await client.query(
      `UPDATE gavoregel
          SET status = 'verifierad', verifierad_at = COALESCE(verifierad_at, now())
        WHERE rule_key=$1 AND gift_id=$2 AND status <> 'verifierad' AND bekraftelser >= $3
        RETURNING bekraftelser`,
      [ruleKey, giftId, KRAV_BEKRAFTELSER]);

    await client.query('COMMIT');
    if (q.rowCount) tomCache(ruleKey);      // befordran ska synas direkt i den har processen
    return { noterad: true, nyKalla: ny.rowCount > 0, befordrad: q.rowCount > 0 };
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

module.exports = {
  noteraFranEvent, noteraKatalog, verifieradeId, noteraKandidat, verifiera,
  kallnyckel, tomCache, KRAV_BEKRAFTELSER, ETIKETT, CACHE_MS
};
