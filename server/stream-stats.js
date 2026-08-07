'use strict';
// Historiken bakom "All time" pa framsidan.
//
// Fram till nu har all statistik raknats i webblasaren (live-leaderboard.js -> localStorage). Det
// betyder att en sandning utan Studio-fliken uppe inte finns i statistiken, att ett datorbyte
// nollstaller den, och att en rensad webblasare raderar den. Uppmatt hos David 2026-08-07: 5 dagar
// och 10 givare lokalt, mot TikControls 472 givare sedan juni. Skillnaden ar inte raknandet — det
// ar att de spelar in pa servern, dar varje event passerar oavsett vad anvandaren har oppet.
//
// INGEN RA EVENTLOGG. Allt en analysvy visar ar summor, och summor vaxer forutsagbart:
//
//   gifter_totals   en rad per givare          vaxer med publiken
//   daily_totals    en rad per dag             365 rader per ar
//   slot_totals     en rad per veckodag+timme  FAST 168 rader, vaxer aldrig
//
// En ra logg hade vuxit med varje tapp i en likestorm. Aggregat ger samma vyer till bunden kostnad.
//
// SAMMA UPPDELNING SOM viewer-levels.js: den rena regeln (`bidragFranEvent`) avgor VAD ett event
// bidrar med och gar att prova uttommande utan databas. Skrivaren (`createStreamStats`) gor bara
// upserts. Felen bor i regeln, sa det ar den som testas hardast.

// Vilka typer som overhuvudtaget bidrar. `chat` ar med flit utelamnad: den ar inget matt och skulle
// dominera skrivningarna under en aktiv sandning. `viewer` och `battle` beskriver RUMMET och har
// ingen avsandare — server/index.js undantar dem redan fran username-kravet i ingesten.
const GAVA = new Set(['gift']);
const LIKE = new Set(['like', 'likes']);
const NARVARO = new Set(['follow', 'share', 'subscribe', 'member']);

// Talen kommer utifran och far aldrig na en summa som NaN eller negativt tal. En felaktig summa
// syns aldrig i granssnittet men ar permanent fel — till skillnad fran ett ogonblicksvarde, som
// nasta korrekta event skriver over.
function heltal(varde) {
  const n = Number(varde);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

// Samma person far inte bli tva rader for att TikTok skickar '@Anna' en gang och 'anna' nasta.
function identitet(data) {
  const raw = data.username || data.uniqueId || data.user || '';
  const id = String(raw).replace(/^@/, '').trim().toLowerCase();
  return id.length >= 1 && id.length <= 80 ? id : '';
}

function bidragFranEvent(event, nu = new Date()) {
  const data = event || {};
  const typ = String(data.type || data.event || '').toLowerCase();
  const arGava = GAVA.has(typ), arLike = LIKE.has(typ), arNarvaro = NARVARO.has(typ);
  if (!arGava && !arLike && !arNarvaro) return null;

  const viewerId = identitet(data);
  if (!viewerId) return null;

  // `coins` bar redan hela combons varde (coinsEach x repeatCount i normalizer.js) — att
  // multiplicera med count igen hade kvadrerat varje combo.
  const gifts = arGava ? heltal(data.count) : 0;
  const diamonds = arGava ? heltal(data.coins) : 0;
  // `points` ar TikToks lopande rumstotal. Den visas rakt av pa ett kort, men att ADDERA den en
  // gang per event multiplicerar summan med antalet event. Bara `count` far ackumuleras.
  const likes = arLike ? heltal(data.count) : 0;

  const namn = String(data.name || data.nickname || data.username || '').slice(0, 120) || null;
  const avatar = String(data.profileImage || data.profileUrl || '').slice(0, 2048) || null;
  const gavonamn = String(data.giftName || '').slice(0, 120);

  // UTC lagras, lokal tid raknas i klienten. Lagrar vi lokal tid last historiken till den tidszon
  // anvandaren rakade ha nar raden skrevs — och veckodagsmonstret, som ar hela poangen med
  // "sand torsdag-fredag 18-24", blir fel for den som flyttar.
  const dag = nu.toISOString().slice(0, 10);

  return {
    viewerId, namn, avatar,
    gifts, diamonds, likes,
    bestaGava: gifts && diamonds && gavonamn ? { namn: gavonamn, diamanter: diamonds } : null,
    dag, timme: nu.getUTCHours(), veckodag: nu.getUTCDay()
  };
}

// ---- Skrivaren ----------------------------------------------------------------------------------
//
// Tre upserts per bidragande event. Anropas ENDAST nar ingesten sagt att eventet inte ar en
// dubblett — dubbelrakning i en summa gar inte att upptacka i efterhand.
const GIFTER_SQL = `
  INSERT INTO gifter_totals
    (workspace_id, tiktok_username, viewer_id, display_name, avatar_url,
     gifts, diamonds, likes, best_gift_name, best_gift_diamonds, first_seen, last_seen)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), now())
  ON CONFLICT (workspace_id, tiktok_username, viewer_id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, gifter_totals.display_name),
    avatar_url   = COALESCE(EXCLUDED.avatar_url,   gifter_totals.avatar_url),
    gifts    = gifter_totals.gifts    + EXCLUDED.gifts,
    diamonds = gifter_totals.diamonds + EXCLUDED.diamonds,
    likes    = gifter_totals.likes    + EXCLUDED.likes,
    best_gift_name     = CASE WHEN EXCLUDED.best_gift_diamonds > gifter_totals.best_gift_diamonds
                              THEN EXCLUDED.best_gift_name ELSE gifter_totals.best_gift_name END,
    best_gift_diamonds = GREATEST(gifter_totals.best_gift_diamonds, EXCLUDED.best_gift_diamonds),
    last_seen = now()
`;
const DAILY_SQL = `
  INSERT INTO daily_totals (workspace_id, tiktok_username, day, gifts, diamonds, likes)
  VALUES ($1,$2,$3,$4,$5,$6)
  ON CONFLICT (workspace_id, tiktok_username, day) DO UPDATE SET
    gifts    = daily_totals.gifts    + EXCLUDED.gifts,
    diamonds = daily_totals.diamonds + EXCLUDED.diamonds,
    likes    = daily_totals.likes    + EXCLUDED.likes
`;
const SLOT_SQL = `
  INSERT INTO slot_totals (workspace_id, tiktok_username, weekday, hour, gifts, diamonds, likes)
  VALUES ($1,$2,$3,$4,$5,$6,$7)
  ON CONFLICT (workspace_id, tiktok_username, weekday, hour) DO UPDATE SET
    gifts    = slot_totals.gifts    + EXCLUDED.gifts,
    diamonds = slot_totals.diamonds + EXCLUDED.diamonds,
    likes    = slot_totals.likes    + EXCLUDED.likes
`;

// Bryggan skickar GIVARENS namn i payloaden, inte streamerns konto — det senare finns bara i
// tiktok_connections. En uppslagning per event vore slosaktigt vid 100 events/sekund, sa svaret
// cachas kort. TTL:n far vara kort: byter nagon konto ska statistiken folja med utan omstart.
const KONTO_TTL_MS = 60_000;

function createStreamStats(pool, options = {}) {
  const log = options.log || (() => {});
  const ttl = options.kontoTtlMs || KONTO_TTL_MS;
  const nuMs = options.now || (() => Date.now());
  const kontoCache = new Map();   // workspaceId -> { konto, at }

  async function kontoFor(workspaceId) {
    const traff = kontoCache.get(workspaceId);
    if (traff && nuMs() - traff.at < ttl) return traff.konto;
    try {
      const q = await pool.query(
        'SELECT tiktok_username FROM tiktok_connections WHERE workspace_id=$1 AND active=true LIMIT 1',
        [workspaceId]);
      const konto = q.rowCount ? String(q.rows[0].tiktok_username || '').toLowerCase().slice(0, 24) : '';
      kontoCache.set(workspaceId, { konto, at: nuMs() });
      return konto;
    } catch (error) {
      log('stream-stats konto lookup failed', error && error.message);
      return traff ? traff.konto : '';
    }
  }

  async function record(workspaceId, event, nu = new Date()) {
    const b = bidragFranEvent(event, nu);
    if (!b) return { skrivet: false, skal: 'inget bidrag' };
    if (!workspaceId) return { skrivet: false, skal: 'okant konto' };
    const konto = await kontoFor(workspaceId);
    if (!konto) return { skrivet: false, skal: 'okant konto' };

    // Statistiken far ALDRIG kunna falla en ingest. Den ar ett sidoresultat: tappas en rad ar det
    // en lucka i historiken, men ett kastat fel hade stoppat eventet fran att na overlayet.
    try {
      await pool.query(GIFTER_SQL, [workspaceId, konto, b.viewerId, b.namn, b.avatar,
        b.gifts, b.diamonds, b.likes,
        b.bestaGava ? b.bestaGava.namn : null, b.bestaGava ? b.bestaGava.diamanter : 0]);
      if (b.gifts || b.diamonds || b.likes) {
        await pool.query(DAILY_SQL, [workspaceId, konto, b.dag, b.gifts, b.diamonds, b.likes]);
        await pool.query(SLOT_SQL, [workspaceId, konto, b.veckodag, b.timme, b.gifts, b.diamonds, b.likes]);
      }
      return { skrivet: true };
    } catch (error) {
      log('stream-stats write failed', error && error.message);
      return { skrivet: false, skal: 'fel', error };
    }
  }

  return { record, kontoFor };
}

module.exports = { bidragFranEvent, createStreamStats, GIFTER_SQL, DAILY_SQL, SLOT_SQL };
