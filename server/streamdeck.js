'use strict';
// STREAM DECK — MOLNVÄGEN. Parkopplingskoder och enhetstoken bor här, på servern.
//
// VYRA-pluginet (streamdeck-plugin/) postar i första hand till VYRA Desktop på 127.0.0.1:4173.
// Kör inte Desktop — streamern sitter på en annan dator, eller vill slippa appen — faller pluginet
// tillbaka på molnet: POST /api/streamdeck/events med en ENHETSTOKEN. Den token byts fram EN gång,
// mot en kort PARKOPPLINGSKOD som streamern genererar i studion och knappar in i pluginet.
//
// SÄKERHETEN, samma mönster som overlay_access_tokens:
//   * Koden och token lagras BARA som sha256 (S.digest). Databasen kan aldrig läcka en giltig kod.
//   * Koden är kortlivad (15 min) och engångs — den byts mot en token och kan aldrig återanvändas.
//   * Token är långlivad tills den återkallas, och bär workspace i sig — pluginet skickar aldrig
//     något workspace-id, precis som Desktop-vägen aldrig gör det.
//   * Koden använder ett alfabet utan 0/O/1/I så en streamer inte läser fel mellan skärm och plugin.
//
// Allt är injicerat (pool, klocka, slump) så modulen provas utan en riktig databas:
// server/test/streamdeck.test.js.

const S = require('./security');
const crypto = require('crypto');

// Utan de tvetydiga tecknen 0/O/1/I/L/U — de förväxlas mellan en skärm och en fysisk knappsats.
const KOD_ALFABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const KOD_LANGD = 8;
const KOD_TTL_MS = 15 * 60 * 1000;
const ENHET_MAX = 20;

// De kommandon molnvägen får bära. Exakt de streamdeck.js i klienten känner igen — en okänd sträng
// från ett manipulerat plugin ska avvisas här, inte tyst nå bussen.
const KOMMANDON = new Set(['action', 'ljud', 'tts', 'spotify', 'latonsk', 'scen', 'timer', 'widget']);

function genereraKod(slump = crypto.randomBytes) {
  const b = slump(KOD_LANGD);
  let s = '';
  for (let i = 0; i < KOD_LANGD; i++) s += KOD_ALFABET[b[i] % KOD_ALFABET.length];
  return s;
}
// Streamern kan skriva gemener, mellanslag eller bindestreck — normalisera bort allt utom alfabetet.
const normaliseraKod = k => String(k == null ? '' : k).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
const medBindestreck = k => k.slice(0, 4) + '-' + k.slice(4);

function createStreamdeck({ pool, now = Date.now, slump = crypto.randomBytes } = {}) {
  if (!pool) throw new Error('createStreamdeck kräver en pool');

  // Streamern genererar en kod i studion. Bara hashen lagras; klienten får koden en gång att skriva
  // in i pluginet. Gamla oanvända koder för samma workspace städas bort så listan inte växer.
  async function skapaKod(workspaceId, userId) {
    const kod = genereraKod(slump);
    const expires = new Date(now() + KOD_TTL_MS);
    await pool.query(
      "DELETE FROM streamdeck_pairings WHERE workspace_id=$1 AND used_at IS NULL AND (expires_at<=now() OR created_at<now()-interval '1 hour')",
      [workspaceId]
    );
    await pool.query(
      'INSERT INTO streamdeck_pairings(workspace_id,code_hash,created_by,expires_at) VALUES($1,$2,$3,$4)',
      [workspaceId, S.digest(kod), userId, expires]
    );
    return { kod: medBindestreck(kod), expiresAt: expires };
  }

  // Pluginet byter koden mot en enhetstoken. ATOMISKT i en sats: koden markeras använd, enheten
  // skapas och kopplas till kodraden — två plugin som råkar skriva samma kod samtidigt kan aldrig
  // båda lyckas (FOR UPDATE SKIP LOCKED). Token returneras EN gång och lagras bara som hash.
  async function parkoppla(kodRaw, labelRaw) {
    const kod = normaliseraKod(kodRaw);
    if (kod.length !== KOD_LANGD) throw Object.assign(new Error('Koden ska vara åtta tecken'), { status: 400 });
    const token = S.token(32);
    const label = S.safeText(labelRaw || 'Stream Deck', 80) || 'Stream Deck';
    const q = await pool.query(
      `WITH par AS (
         UPDATE streamdeck_pairings SET used_at=now()
         WHERE id=(SELECT id FROM streamdeck_pairings
                   WHERE code_hash=$1 AND used_at IS NULL AND expires_at>now()
                   LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING id, workspace_id
       ), dev AS (
         INSERT INTO streamdeck_devices(workspace_id, token_hash, label)
         SELECT workspace_id, $2, $3 FROM par
         RETURNING id, workspace_id
       ), koppla AS (
         UPDATE streamdeck_pairings SET device_id=(SELECT id FROM dev) WHERE id=(SELECT id FROM par)
       )
       SELECT id AS device_id, workspace_id FROM dev`,
      [S.digest(kod), S.digest(token), label]
    );
    if (!q.rows[0]) throw Object.assign(new Error('Koden är ogiltig eller har gått ut'), { status: 404 });
    return { deviceToken: token, deviceId: q.rows[0].device_id, workspaceId: q.rows[0].workspace_id };
  }

  // Pluginet postar en händelse med sin token. Slår upp enheten, uppdaterar last_seen och svarar med
  // workspace — publiceringen sker i index.js så rate-limit och buss ligger där de andra rutterna gör.
  async function enhetAvToken(tokenRaw) {
    const token = String(tokenRaw == null ? '' : tokenRaw).trim();
    if (token.length < 32) return null;
    const q = await pool.query(
      'UPDATE streamdeck_devices SET last_seen_at=now() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING id, workspace_id, label',
      [S.digest(token)]
    );
    return q.rows[0] || null;
  }

  async function listaEnheter(workspaceId) {
    const q = await pool.query(
      'SELECT id,label,created_at,last_seen_at FROM streamdeck_devices WHERE workspace_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT $2',
      [workspaceId, ENHET_MAX]
    );
    return q.rows;
  }

  async function taBort(deviceId, workspaceId) {
    const q = await pool.query(
      'UPDATE streamdeck_devices SET revoked_at=now() WHERE id=$1 AND workspace_id=$2 AND revoked_at IS NULL RETURNING id',
      [deviceId, workspaceId]
    );
    return q.rowCount > 0;
  }

  return { skapaKod, parkoppla, enhetAvToken, listaEnheter, taBort };
}

module.exports = { createStreamdeck, genereraKod, normaliseraKod, KOMMANDON, KOD_ALFABET, KOD_LANGD };
