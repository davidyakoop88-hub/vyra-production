'use strict';
// Nivåminnet: senast sedda fanklubbs- och gifternivå per tittare och arbetsyta.
//
// VARFÖR SERVERN OCH INTE WEBBLÄSAREN. fan-level-session.js höll kartan i RAM, så den dog med
// sidan och en höjning kunde bara upptäckas om samma tittare syntes två gånger i samma sändning.
// Att flytta kartan till localStorage löser det inte: session-state.js gör den flik som inte äger
// låset skrivskyddad, och under en sändning kör överlägget i OBS ofta bredvid en öppen Studio. En
// ledger som skrivs vid varje event kan inte ligga i den fliken. Ingesten ser varje event oavsett.
//
// Uppmätt hos TikControl 2026-08-07: deras level-up-widget har minLevel 1, maxLevel 50 och inga
// intjäningsregler — de visar TikToks nivå precis som vi. Det enda de gör annorlunda är att de
// minns mellan sändningar. Det är den skillnaden den här filen stänger.

const MIN_NIVA = 1, MAX_NIVA = 50;

// Ett giltigt nivåvärde är ett heltal i 1-50. Allt annat — 0, negativt, NaN, strängar, 999 —
// betyder "ingen nivå rapporterad". Den som inte gått med i fanklubben har ingen `fansClub` i
// payloaden alls, och den nollan får aldrig se ut som en sänkning från 12.
// Inget `Number(v)` här: cleanEvent i event-bus.js har redan gjort fältet till ett tal
// (`Math.round(Number(...))`). Kommer en sträng hit har något gått förbi kontraktet, och då ska
// den behandlas som "ingen nivå" i stället för att tyst coercas — annars döljer vi glappet.
function giltig(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_NIVA && v <= MAX_NIVA ? v : 0;
}

// Den rena beslutsregeln. `forra` är det lagrade värdet (null om tittaren aldrig setts).
function avgorHojning(forra, ny) {
  const till = giltig(ny);
  if (!till) return null;                       // ingen nivå rapporterad i det här eventet
  const fran = giltig(forra);
  if (!fran) return null;                       // första gången: lär bara in
  return till > fran ? { from: fran, to: till } : null;
}

// Ett enda uttalande, av två skäl. Läsningen av det gamla värdet och skrivningen av det nya får
// inte kunna glida isär under två gåvor i samma sekund, och en datamodifierande CTE ser samma
// ögonblicksbild som SELECT:en — så `forra` är garanterat läget FÖRE upserten.
//
// Lagret är MONOTONT (GREATEST): högsta sedda nivå vinner. En tillfällig nolla eller en nivå som
// gått ner när ett medlemskap löpt ut ska inte kunna skapa en falsk höjning nästa gång.
const SQL = `
WITH forra AS (
  SELECT fan_level, gifter_level
    FROM viewer_levels
   WHERE workspace_id = $1 AND viewer_id = $2
), skrivning AS (
  INSERT INTO viewer_levels (workspace_id, viewer_id, fan_level, gifter_level, seen_at)
  VALUES ($1, $2, NULLIF($3, 0), NULLIF($4, 0), now())
  ON CONFLICT (workspace_id, viewer_id) DO UPDATE SET
    fan_level    = GREATEST(COALESCE(viewer_levels.fan_level, 0),
                            COALESCE(EXCLUDED.fan_level, 0)),
    gifter_level = GREATEST(COALESCE(viewer_levels.gifter_level, 0),
                            COALESCE(EXCLUDED.gifter_level, 0)),
    seen_at      = now()
  RETURNING 1
)
SELECT (SELECT fan_level    FROM forra) AS forra_fan,
       (SELECT gifter_level FROM forra) AS forra_gifter`;

const TOMT = { fanLevelUp: null, gifterLevelUp: null };

function createViewerLevels({ query, log = (...args) => console.error(...args),
                              now = Date.now } = {}) {
  return {
    // Returnerar alltid ett objekt och kastar aldrig: det här ligger i livevägen, och en gåva ska
    // nå widgetarna även om nivåminnet strular. Ett tyst level-up är en saknad alert; ett kastat
    // fel hade tappat hela eventet.
    async applyEvent(workspaceId, event = {}) {
      // Bryggan skickar fanClubLevel, klienten teamLevel — samma tal, två namn, precis som
      // cleanEvent redan accepterar båda.
      const fan = giltig(event.fanClubLevel != null ? event.fanClubLevel : event.teamLevel);
      const gifter = giltig(event.gifterLevel);
      if (!fan && !gifter) return TOMT;         // varje chattrad hade annars kostat en skrivning

      const viewerId = String(event.userId || event.username || '').trim().slice(0, 160);
      if (!viewerId || !workspaceId) return TOMT;

      try {
        const { rows } = await query(SQL, [workspaceId, viewerId, fan, gifter]);
        const rad = (rows && rows[0]) || {};
        return {
          fanLevelUp: avgorHojning(rad.forra_fan, fan),
          gifterLevelUp: avgorHojning(rad.forra_gifter, gifter)
        };
      } catch (error) {
        // Inga id:n i loggen — varken arbetsyta, tittare eller nivå. http_request-raden bredvid
        // bär redan requestId och sökväg för den som behöver placera felet. Samma regel som
        // goal-ingest.js följer för sina frame-fel.
        log(JSON.stringify({ level: 'error', event: 'viewer_level_apply_failed',
          message: error.message, at: new Date(now()).toISOString() }));
        return TOMT;
      }
    }
  };
}

module.exports = { createViewerLevels, avgorHojning, MIN_NIVA, MAX_NIVA };
