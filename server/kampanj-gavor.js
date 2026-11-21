'use strict';
// GÅVOR PER SÄNDNING — serverns räkning av varje gåva, per gåvo-id, under aktuell LIVE.
//
// VARFÖR (David 2026-11-20: "gift champian räknar inte alla gift"). Gift Campaigns räknare bodde i
// varje sida för sig: studion, skrivbordsappen och OBS-källan räknade var sin gång, och den som
// sparade layouten skrev över de andras tal. En OBS-källa som laddades om mitt i en sändning började
// om från det sparade talet. Ingen av sidorna kunde veta vad som var sant.
//
// Nu räknar servern, en gång per händelse, och STÄMPLAR totalen på själva gåvohändelsen
// (`giftSessionCount`, se goal-ingest.js). Talet är absolut: varje sida som får händelsen vet vad
// totalen är, en tappad händelse rättas av nästa, och en dubblett ändrar ingenting. En sida som
// öppnas mitt i sändningen läser totalerna direkt (readCounts).
//
// Servern vet ingenting om widgetar eller fack. Den räknar gåvor per id; vilket fack som visar
// vilken gåva är klientens sak (gift-event-images.js). Därför behövs ingen koppling som kan gå isär.
//
// SAMMA REGLER SOM MÅLEN (goal-runtime.js):
//   * bara typen `gift` — bryggan har redan slagit ihop en combo till sin slutframe, så `count` är
//     combons antal; `streakstart` är bara en förhandsvisning och räknas aldrig
//   * medvärdsgåvor (`tillVarden === false`) räknas inte; saknas fältet räknas gåvan, som förut
//   * en händelse räknas EN gång: (workspace, event.id) tas i session_gift_apply i samma transaktion
//     som ökningen, så en omleverans efter en krasch ger varken dubbelräkning eller ett tappat tal
//   * ingen aktiv sändning ⇒ ingenting räknas, och inget skrivs
//
// MODULEN LOGGAR INGENTING. Den ser varje gåva som passerar.

const CLAIM_SQL = `
  INSERT INTO session_gift_apply (workspace_id, event_id)
  VALUES ($1, $2)
  ON CONFLICT (workspace_id, event_id) DO NOTHING
  RETURNING 1
`;
const COUNT_SQL = `
  INSERT INTO session_gift_counts (workspace_id, session_id, gift_id, antal, updated_at)
  VALUES ($1, $2, $3, $4, now())
  ON CONFLICT (workspace_id, session_id, gift_id) DO UPDATE SET
    antal = session_gift_counts.antal + EXCLUDED.antal, updated_at = now()
  RETURNING antal
`;
const SESSION_SQL = 'SELECT session_id FROM stream_session_pointer WHERE workspace_id=$1';
const READ_ONE_SQL = 'SELECT antal FROM session_gift_counts WHERE workspace_id=$1 AND session_id=$2 AND gift_id=$3';
const READ_ALL_SQL = `
  SELECT c.session_id, c.gift_id, c.antal
    FROM stream_session_pointer p
    JOIN session_gift_counts c ON c.workspace_id = p.workspace_id AND c.session_id = p.session_id
   WHERE p.workspace_id = $1
   ORDER BY c.antal DESC
   LIMIT 500
`;
// Gamla sändningars rader behövs inte: talet gäller bara pågående LIVE.
const SWEEP_OLD_SQL = "DELETE FROM session_gift_counts WHERE updated_at < now() - $1::interval";

const MAX_ANTAL = 10000000;      // samma tak som bryggans repeatCount (normalizer.js)
const TOMT = Object.freeze({ applied: false, antal: null, giftId: '', sessionId: null });

function antalAv(event) {
  const n = Number(event && event.count);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_ANTAL) : 0;
}

// Vad en händelse är värd här: gåvans id och antal, eller null när den inte ska räknas.
function bidrag(event) {
  if (!event || String(event.type || '').toLowerCase() !== 'gift') return null;
  if (event.tillVarden === false) return null;
  const giftId = String(event.giftId || '').trim();
  const antal = antalAv(event);
  if (!giftId || giftId.length > 160 || !antal) return null;
  return { giftId, antal };
}

async function applyEvent(pool, workspaceId, event) {
  const b = bidrag(event);
  const eventId = String((event && event.id) || '');
  if (!workspaceId || !b || !eventId) return TOMT;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sess = await client.query(SESSION_SQL, [workspaceId]);
    const sessionId = sess.rowCount ? sess.rows[0].session_id : null;
    if (!sessionId) { await client.query('ROLLBACK'); return TOMT; }

    const claim = await client.query(CLAIM_SQL, [workspaceId, eventId]);
    if (!claim.rowCount) {
      // Redan räknad. Totalen lämnas ändå ut: den som får händelsen igen ska se samma tal.
      const nu = await client.query(READ_ONE_SQL, [workspaceId, sessionId, b.giftId]);
      await client.query('ROLLBACK');
      return { applied: false, antal: nu.rowCount ? Number(nu.rows[0].antal) : null, giftId: b.giftId, sessionId };
    }
    const rad = await client.query(COUNT_SQL, [workspaceId, sessionId, b.giftId, b.antal]);
    await client.query('COMMIT');
    return { applied: true, antal: Number(rad.rows[0].antal), giftId: b.giftId, sessionId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Totalerna för pågående sändning: { sessionId, counts: { giftId: antal } }. Ingen sändning eller
// inga gåvor ger ett tomt objekt — aldrig förra sändningens tal.
async function readCounts(pool, workspaceId) {
  const ut = { sessionId: null, counts: {} };
  if (!workspaceId) return ut;
  const q = await pool.query(READ_ALL_SQL, [workspaceId]);
  for (const rad of q.rows) { ut.sessionId = rad.session_id; ut.counts[String(rad.gift_id)] = Number(rad.antal); }
  return ut;
}

async function sweepOld(pool, { olderThan = '7 days' } = {}) {
  const q = await pool.query(SWEEP_OLD_SQL, [olderThan]);
  return { deleted: q.rowCount };
}

module.exports = { applyEvent, readCounts, sweepOld, bidrag, CLAIM_SQL, COUNT_SQL, READ_ALL_SQL, SWEEP_OLD_SQL, MAX_ANTAL };
