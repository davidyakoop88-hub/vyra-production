'use strict';
// HEART ME GOAL — unika personer som skickar gåvan Heart Me under aktuell LIVE.
//
// Se docs/heart-me-goal-design.md. Produktbeslutet: Anna skickar tre Heart Me → +1.
// Anna och Bo skickar en var → +2. Likes och andra gåvor → +0. Ny sändning → Anna räknas igen.
//
// TVÅ OLIKA SKYDD, lätt att blanda ihop:
//   `raw.duplicate` / goal_event_apply   skyddar mot samma EVENT levererat flera gånger
//   heart_me_bidrag-raden                skyddar mot att samma PERSON bidrar flera gånger
//
// IDENTITETEN ÄGS INTE HÄR. Vilken gåva som är Heart Me kommer från lärläget
// (server/gavoidentitet.js), uppslaget på den fasta nyckeln `heart_me` från
// server/regelnycklar.js. Modulen gissar aldrig, och matchar aldrig på giftName.
//
// METRIKEN unique_gift_senders matas ALDRIG av contributionsFor(). Den finns just för att den
// generella "varje gåva räknas"-vägen inte ska röra det här målet — annars hade varje Rose ökat
// Heart Me Goal. Ett vaktprov faller om namnet någonsin dyker upp i den generella motorn.

const Regelnycklar = require('./regelnycklar');
const Gavoidentitet = require('./gavoidentitet');

// Husets NORMALISERADE tittaridentitet. Samma regel som identitet() i stream-stats.js, så målet och
// gifter_totals är överens om vem som är samma person: '@Anna' och 'anna' är en person.
//
// VAD DEN INTE ÄR: den är ingen hash. Nyckeln ÄR användarnamnet, gemener och utan '@' — namnet går
// trivialt att läsa ur den. Att kalla den pseudonym vore att lova mer än den håller.
//
// Vad som däremot gäller: liggaren lagrar bara nyckeln — inget visningsnamn, ingen avatar, inget
// giftId, ingen payload, ingen tidsstämpel. Det är samma nyckel huset redan lagrar i
// gifter_totals.viewer_id, så ingen NY kategori av personuppgift tillkommer, och raden försvinner
// med sändningen. Modulen loggar ingenting alls.
function avsandarnyckel(event) {
  const raw = (event && (event.username || event.uniqueId || event.userId)) || '';
  const id = String(raw).replace(/^@/, '').trim().toLowerCase();
  return id.length >= 1 && id.length <= 80 ? id : '';
}

const arGava = event => !!event && String(event.type || '').toLowerCase() === 'gift';

// Enda vägen in. Anropas fire-and-forget från ingest-kedjan för varje event.
//
// Ordningen är medveten och följer designens fem steg:
//   1. giltigt, deduplicerat slutframe-event   (duplicate + typ + giftId)
//   2. slå upp den inlärda regeln heart_me
//   3. matcha EXAKT giftId
//   4. atomisk engångsinsättning på (session_id, widget_id, avsändarnyckel)
//   5. öka målet ENDAST om insättningen skapade en ny rad
//
// Varje steg är fail-closed: saknas något händer ingenting alls.
async function applyHeartMeEvent(pool, workspaceId, event, { duplicate = false } = {}) {
  // 1. Slutframes är redan filtrerade vid källan (bridge.js:374 och
  //    electron-app/tiktok-service.js:97), så det som återstår här är dubblettskyddet.
  if (!workspaceId || duplicate || !arGava(event)) return { okade: 0, rader: [] };

  const giftId = String(event.giftId || '');
  const nyckel = avsandarnyckel(event);
  if (!giftId || !nyckel) return { okade: 0, rader: [] };

  // 2 + 3. Identiteten kommer från lärläget. Ingen inlärd gåva ⇒ målet räknar ingenting.
  const heartMeId = await Gavoidentitet.slaUppGiftId(pool, workspaceId, Regelnycklar.HEART_ME);
  if (!heartMeId || heartMeId !== giftId) return { okade: 0, rader: [] };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Sessionen avgör nyckelrymden. Ingen aktiv sändning ⇒ inget att räkna mot, och ingen risk
    // att bidrag från två sändningar blandas.
    const sess = await client.query(
      'SELECT session_id FROM stream_session_pointer WHERE workspace_id=$1', [workspaceId]);
    const sessionId = sess.rowCount ? sess.rows[0].session_id : null;
    if (!sessionId) { await client.query('ROLLBACK'); return { okade: 0, rader: [] }; }

    // Alla Heart Me-mål i workspacets overlays. Metriken är etiketten som pekar ut dem.
    const mal = await client.query(
      `SELECT g.overlay_id, g.widget_id
         FROM goal_runtime g
         JOIN overlays o ON o.id = g.overlay_id
        WHERE o.workspace_id = $1 AND g.metric = 'unique_gift_senders'`,
      [workspaceId]);

    const uppdaterade = [];
    for (const rad of mal.rows) {
      // 4. ATOMISK ENGÅNGSINSÄTTNING. Ingen läsning följd av skrivning: två samtidiga gåvor från
      //    samma person kan inte båda skapa raden, så bara en av dem kan öka målet.
      const bidrag = await client.query(
        `INSERT INTO heart_me_bidrag (session_id, widget_id, avsandarnyckel)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING avsandarnyckel`,
        [sessionId, rad.widget_id, nyckel]);

      // 5. Öka ENDAST när insättningen skapade en ny rad.
      if (!bidrag.rowCount) continue;
      // RETURNING * ger den commitade raden — baseline, progress, target, epoch, revision. Det är
      // exakt vad goal-sse.js bygger sin ram av, så ramen blir värdet EFTER höjningen utan att ett
      // andra ramformat uppstår.
      const uppd = await client.query(
        `UPDATE goal_runtime SET progress = progress + 1, revision = revision + 1, updated_at = now()
          WHERE overlay_id=$1 AND widget_id=$2 RETURNING *`,
        [rad.overlay_id, rad.widget_id]);
      if (uppd.rows[0]) uppdaterade.push(uppd.rows[0]);
    }

    await client.query('COMMIT');
    return { okade: uppdaterade.length, rader: uppdaterade };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Räkna först, meddela sedan — samma ordning och samma skäl som goal-ingest.js. Ett event som
// annonserats men inte räknats är osynlig skada: widgeten visar ett tal ingenting backar, och inget
// försöker igen. Räknat men inte annonserat är återställbart — nästa event eller nästa GET bär
// sanningen, för en ram är absolut.
//
// En ram som faller får aldrig fälla räkningen: talet är redan commitat och svaret är redan sant.
async function applyOchPublicera(pool, workspaceId, event, opts = {}) {
  const ut = await applyHeartMeEvent(pool, workspaceId, event, opts);
  const publicera = opts.publicera;
  if (publicera && ut.rader && ut.rader.length) {
    for (const rad of ut.rader) {
      try { await publicera(rad); } catch (_) { /* ramen tappas, talet står kvar */ }
    }
  }
  return ut;
}

module.exports = { applyHeartMeEvent, applyOchPublicera, avsandarnyckel, METRIK: 'unique_gift_senders' };
