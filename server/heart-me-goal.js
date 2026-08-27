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
//
// MODULEN LOGGAR INGENTING. Den ser varje gåva som passerar, och en loggrad som bär eventet eller
// nyckeln vore en läcka. "Logga bara vid fel" är dessutom precis när payloaden är som mest
// intressant att skriva ut. Ett vaktprov faller om ett `console.` dyker upp här.

const crypto = require('node:crypto');
const Regelnycklar = require('./regelnycklar');
const Gavoidentitet = require('./gavoidentitet');

// ---- AVSÄNDARNYCKELN --------------------------------------------------------------------------
//
// Produktbeslut 2026-08-27: det ska INTE gå att läsa ett tittarnamn ur liggaren. Tidigare lagrades
// den normaliserade identiteten i klartext — alltså användarnamnet i gemener, inget annat.
// Felsökning sker i stället med resultatkoder och räknare.
//
// Nyckeln är HMAC-SHA256 över (workspace, session, normaliserad identitet):
//
//   · WORKSPACE i indata gör att två kunder aldrig delar nyckelrymd.
//   · SESSION i indata är hela poängen med bytet. Samma person får en HELT ANNAN nyckel i nästa
//     sändning, så raderna inte går att länka ihop över tid. Att `session_id` också står i
//     primärnyckeln räcker INTE: det gör raderna åtskilda, men inte olänkbara — med klartext hade
//     man sett att `anna` återkom i sändning efter sändning.
//   · IDENTITETEN normaliseras FÖRST ('@Anna' → 'anna'), annars hade två stavningar av samma
//     person gett två nycklar och räknats som två personer.
const ETIKETT = 'vyra:heart-me-bidrag:v1';
const SEP = String.fromCharCode(31);   // unit separator — kan inte förekomma i något av fälten
const NYCKELLANGD = 32;                // samma krav som token-vault.js ställer på hemligheten

let cachadRa = null, cachadNyckel = null;

// DOMÄNSEPARATION. Nyckeln är INTE APP_ENCRYPTION_KEY rakt av: token-vault.js använder samma
// hemlighet som AES-nyckel, och att återanvända exakt samma bytes till en HMAC är
// nyckelåteranvändning över två primitiver. Här härleds en undernyckel med en etikett som bär både
// syfte och version, så nyckelrymden är skild från varje annan användning och kan versioneras.
//
// INGEN RESERVNYCKEL. Saknas hemligheten, eller har den fel form, returneras null och anroparen
// räknar ingenting. En hårdkodad reserv hade gjort hashen offentligt beräkningsbar — alltså ingen
// pseudonymisering alls, bara en dyrare klartext.
//
// APP_ENCRYPTION_KEY är medvetet vald framför en ny egen variabel: den är redan obligatorisk i
// production-config.js och redan i drift. En ny variabel hade, tillsammans med fail-closed, betytt
// att målet tyst slutar räkna den dagen någon glömmer sätta den vid en deploy.
function harledNyckel() {
  const ra = process.env.APP_ENCRYPTION_KEY || '';
  if (!ra) return null;
  if (ra === cachadRa) return cachadNyckel;
  const bytes = Buffer.from(ra, 'base64url');
  if (bytes.length !== NYCKELLANGD) return null;
  cachadRa = ra;
  cachadNyckel = crypto.createHmac('sha256', bytes).update(ETIKETT).digest();
  return cachadNyckel;
}

// Husets normaliseringsregel, identisk med identitet() i stream-stats.js så att målet och
// gifter_totals är överens om vem som är samma person. Resultatet lämnar ALDRIG modulen — det går
// rakt in i HMAC:en.
function normaliseraIdentitet(event) {
  const ra = (event && (event.username || event.uniqueId || event.userId)) || '';
  const id = String(ra).replace(/^@/, '').trim().toLowerCase();
  if (id.length < 1 || id.length > 80) return '';
  // Separatorn får inte kunna smugglas in i identiteten. Utan den här raden kan två olika
  // (workspace, session, namn) fogas ihop till samma sträng att hasha — en klassisk
  // sammanfogningstvetydighet. Kontrolltecken har ändå inget i ett användarnamn att göra.
  for (let i = 0; i < id.length; i++) if (id.charCodeAt(i) < 32) return '';
  return id;
}

// 64 hex-tecken. Databasen har ett CHECK-villkor på exakt den formen, så ett klartextnamn kan
// fysiskt inte lagras i kolumnen ens om en framtida bugg skickar dit ett.
function avsandarnyckel(workspaceId, sessionId, identitet) {
  const nyckel = harledNyckel();
  if (!nyckel || !identitet || !workspaceId || !sessionId) return '';
  return crypto.createHmac('sha256', nyckel)
    .update(String(workspaceId) + SEP + String(sessionId) + SEP + identitet)
    .digest('hex');
}

const arGava = event => !!event && String(event.type || '').toLowerCase() === 'gift';

// Enda vägen in. Anropas fire-and-forget från ingest-kedjan för varje event.
//
// Ordningen är medveten och följer designens fem steg:
//   1. giltigt, deduplicerat slutframe-event   (duplicate + typ + giftId + identitet + hemlighet)
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
  const identitet = normaliseraIdentitet(event);
  if (!giftId || !identitet) return { okade: 0, rader: [] };

  // FAIL-CLOSED PÅ HEMLIGHETEN, och medvetet FÖRE varje databasanrop. Utan nyckel finns ingen
  // pseudonymisering, och då ska ingenting räknas och ingenting skrivas — men liveflödet ska heller
  // inte märka något: vi returnerar tyst, kastar inte, och loggar inte.
  if (!harledNyckel()) return { okade: 0, rader: [] };

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

    // Nyckeln kan först beräknas HÄR: den binder sessionen, och sessionen är känd först nu.
    const nyckel = avsandarnyckel(workspaceId, sessionId, identitet);
    if (!nyckel) { await client.query('ROLLBACK'); return { okade: 0, rader: [] }; }

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
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING widget_id`,
        [sessionId, rad.widget_id, nyckel]);

      // 5. Öka ENDAST när insättningen skapade en ny rad.
      if (!bidrag.rowCount) continue;
      // RETURNING * ger den commitade raden — baseline, progress, target, epoch, revision. Det är
      // exakt vad goal-sse.js bygger sin ram av, så ramen blir värdet EFTER höjningen utan att ett
      // andra ramformat uppstår. Raden bär INGEN avsändarnyckel, så inget om tittaren når SSE.
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

module.exports = {
  applyHeartMeEvent, applyOchPublicera,
  normaliseraIdentitet, avsandarnyckel, harledNyckel,
  ETIKETT, METRIK: 'unique_gift_senders'
};
