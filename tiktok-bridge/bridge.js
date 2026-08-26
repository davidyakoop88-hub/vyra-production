// Connects to a real TikTok LIVE room (via the unofficial tiktok-live-connector library — TikTok has
// no public API for this) and forwards events into VYRA's existing local server (server.ps1) using the
// exact same /api/connect and /api/events endpoints the "Testa gåva" demo button already uses. That
// means every existing consumer of live events — live-client.js's poll loop, Action & Event rules,
// battle-widget routing — works unchanged; this script's only job is to be a real event *source*.
//
// Usage:
//   cd tiktok-bridge
//   npm install
//   node bridge.js <tiktok_username_without_@>
//
// Optional environment variables:
//   VYRA_SERVER_URL            default http://127.0.0.1:4173 — where server.ps1 is listening
//   VYRA_CLOUD_URL              vyra-cloud-api origin — if set (with VYRA_WORKSPACE_ID and
//                                VYRA_INGEST_TOKEN), events are also forwarded to the deployed backend
//   VYRA_WORKSPACE_ID           workspace id for the cloud ingest endpoint
//   VYRA_INGEST_TOKEN           bearer token for the cloud ingest endpoint (TIKTOK_INGEST_TOKEN server-side)
//   DISCORD_ALERT_WEBHOOK_URL   Discord webhook URL — critical alert after 50 failed reconnect attempts
//                                in a row, info alert as soon as a genuine reconnect succeeds again
//   PROXY_LIST                  comma-separated http(s) proxy URLs, e.g.
//                                "http://user:pass@ip:port,http://user:pass@ip2:port2" — rotated
//                                one-per-connection-attempt via proxy-manager.js; unset/empty runs
//                                with no proxy (dev mode)
'use strict';

const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');
const N = require('./normalizer');
const Inspelare = require('./inspelare');
const { createProxyManager } = require('./proxy-manager');
const { skapaLivscykel } = require('./livscykel');
const { sanera, saneraUrl } = require('./sanera');

// The local server only exists in the desktop build (server.ps1 on 127.0.0.1:4173). In the cloud
// there is nothing listening there, so defaulting to it made every event, heartbeat, connect and
// disconnect fire a doomed POST and log an error — one error line per event during a live stream,
// which buries the messages that matter and burns log quota on a memory-capped host.
// LOCAL_ENABLED is false when the bridge is running as part of the cloud fleet (VYRA_CLOUD_URL set)
// and no local server was explicitly configured. Set VYRA_SERVER_URL to opt back in.
const SERVER = process.env.VYRA_SERVER_URL || 'http://127.0.0.1:4173';
const LOCAL_ENABLED = !!process.env.VYRA_SERVER_URL || !process.env.VYRA_CLOUD_URL;
const CLOUD = process.env.VYRA_CLOUD_URL || '';
const WORKSPACE = process.env.VYRA_WORKSPACE_ID || '';
const INGEST_TOKEN = process.env.VYRA_INGEST_TOKEN || '';
const DISCORD_ALERT_WEBHOOK_URL = process.env.DISCORD_ALERT_WEBHOOK_URL || '';
// ---- ra-inspelning (lokalt verktyg, av som default) -------------------------------------------
// Se tiktok-bridge/inspelare.js for varfor den bara ar meningsfull lokalt: molncontainern kor
// read_only med bara tmpfs skrivbar, sa en inspelning dar hade varken kunnat skrivas eller hamtas.
// Vilken biblioteksversion som producerade payloaden ar det forsta man vill veta nar en
// inspelning lases om ett halvar senare: v3-omdopningarna har redan nollat falt en gang.
function bibliotekVersion() {
  try { return require('tiktok-live-connector/package.json').version } catch { return 'okand' }
}
const INSPELNING = process.env.VYRA_INSPELNING === '1';
const INSPELNING_KATALOG = process.env.VYRA_INSPELNING_KATALOG || path.join(__dirname, 'inspelningar');
const INSPELNING_MAX_MB = Number(process.env.VYRA_INSPELNING_MAX_MB) || 50;
const HEARTBEAT_MS = 5_000;
const MAX_RECONNECT_MS = 60_000;
const RECONNECT_BASE_MS = 1_000;
const DISCORD_ALERT_AFTER_ATTEMPTS = 50;

// ---- Pure reconnect/backoff/alert logic — no I/O, no module-level state, fully unit-testable ----

// 1s, 2s, 4s, 8s, 16s, 32s, then capped at 60s forever after — the schedule never grows past the
// cap and there is no attempt limit that stops it, so the bridge never gives up retrying.
function baseReconnectDelayMs(attempt) {
  return Math.min(MAX_RECONNECT_MS, RECONNECT_BASE_MS * (2 ** Math.min(attempt, 6)));
}

// ±20% jitter on top of the base delay, so many bridges reconnecting at once don't all retry
// in lockstep (a "thundering herd" against the TikTok/VYRA servers).
function jitteredDelayMs(base) {
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

// Fires exactly once per outage — caller tracks `alreadySent` and resets it back to false as
// soon as a connection succeeds again, so a later outage alerts again.
function shouldSendCriticalAlert(attempt, alreadySent) {
  return attempt >= DISCORD_ALERT_AFTER_ATTEMPTS && !alreadySent;
}

// Only a genuine *re*connect (after at least one failed attempt) is alert-worthy — the very
// first connect on startup isn't a "recovery" from anything.
function shouldSendSuccessAlert(attemptsBeforeSuccess) {
  return attemptsBeforeSuccess > 0;
}

function criticalReconnectAlertPayload(username, attempt, reason, at = new Date().toISOString()) {
  return {
    content: `🚨 **VYRA TikTok-brygga** — KRITISKT: kunde inte återansluta till @${username} efter ${attempt} försök.`,
    embeds: [{
      title: 'Bridge reconnect: kritiskt larm',
      color: 0xe33e3e,
      fields: [
        { name: 'Nivå', value: 'critical', inline: true },
        { name: 'Användare', value: `@${username}`, inline: true },
        { name: 'Försök', value: String(attempt), inline: true },
        { name: 'Senaste orsak', value: String(reason || 'okänd').slice(0, 500), inline: false }
      ],
      timestamp: at
    }]
  };
}

function reconnectSuccessAlertPayload(username, roomId, attemptsBeforeSuccess, at = new Date().toISOString()) {
  return {
    content: `✅ **VYRA TikTok-brygga**: återansluten till @${username}.`,
    embeds: [{
      title: 'Bridge reconnect: info',
      color: 0x3ba55d,
      fields: [
        { name: 'Nivå', value: 'info', inline: true },
        { name: 'Användare', value: `@${username}`, inline: true },
        { name: 'Rum', value: String(roomId || '—'), inline: true },
        { name: 'Försök innan lyckad anslutning', value: String(attemptsBeforeSuccess), inline: true }
      ],
      timestamp: at
    }]
  };
}

async function postDiscordAlert(payload) {
  if (!DISCORD_ALERT_WEBHOOK_URL) return;
  try {
    const res = await fetch(DISCORD_ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`Discord HTTP ${res.status}`);
  } catch (err) {
    console.error('[bridge] Kunde inte skicka Discord-larm:', err.message);
  }
}

module.exports = {
  baseReconnectDelayMs,
  jitteredDelayMs,
  shouldSendCriticalAlert,
  shouldSendSuccessAlert,
  criticalReconnectAlertPayload,
  reconnectSuccessAlertPayload
};

// ---- Live connection runtime — only runs when executed directly (`node bridge.js <user>`),
// never on require() (e.g. from tests), matching server/index.js's same require.main guard ----
if (require.main === module) {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: node bridge.js <tiktok_username_without_@>');
    process.exit(1);
  }

  // 'live' | 'paused' | 'suspended'. Aterstalls till 'live' vid ny anslutning och vid
  // STREAM_END, sa ett pauslage aldrig kan folja med over en ateranslutning.
  let sandningsLage = 'live';
  const loggaLage = text => console.log(`[bridge][lage] ${text}`);
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let activeConnection = null;
  let stopping = false;
  let criticalAlertSent = false;
  let aktuelltRum = null;
  const recentEventKeys = new Map();
  const proxyManager = createProxyManager();
  let currentProxy = null;

  // No-op unless this process was started via child_process.fork() (as connection-manager.js
  // does) — process.send only exists in that case. Standalone `node bridge.js <user>` CLI usage
  // is completely unaffected.
  function reportToParent(type, extra = {}) {
    if (typeof process.send === 'function') process.send({ type, ...extra });
  }

  async function postJson(path, body) {
    // Not an error worth reporting: in cloud mode there is deliberately no local server.
    if (!LOCAL_ENABLED) return null;
    try {
      const res = await fetch(SERVER + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json().catch(() => ({ ok: true }));
    } catch (err) {
      console.error(`[bridge] Kunde inte nå VYRA-servern på ${SERVER} (${path}):`, err.message);
      return null;
    }
  }

  // FLODESRAKNAREN: hur manga event bryggan faktiskt SKICKAR, per typ.
  //
  // Uppmatt 2026-08-06: battle-payloaden visade atta skilda gavotillfallen under en match medan
  // overlayn flippade Top Gift tva ganger. Gapet gick inte att avgora - LINK_MIC_ARMIES speglar HELA
  // battlen, alltsa aven motstandarens sida, sa atta mot tva kan vara helt korrekt eller sa tappas
  // sex gavor pa vagen. sendEvent loggade inte per event, sa loggen kunde inte saga vilket.
  //
  // Det ar samma blinda flack som lat en hel sandning ga utan ETT enda battle-event utan att loggen
  // kunde saga varfor.
  //
  // EN RAKNARE, INTE EN EVENTLOGG. Bara typnamn och tal. En rad per event hade burit anvandarnamn,
  // gavonamn och kommentarer rakt in i Railways logg; `gift=8 chat=41` bar ingenting.
  const flodeRaknare = new Map();
  const FLODE_INTERVALL_MS = 60_000;
  let flodeSenaste = '';
  const flodeTimer = setInterval(() => {
    if (!flodeRaknare.size) return;
    const rad = [...flodeRaknare.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join(' ');
    if (rad === flodeSenaste) return;   // oforandrat sedan forra minuten: ingen rad
    flodeSenaste = rad;
    console.log(`[bridge][flode] ${rad}`);
  }, FLODE_INTERVALL_MS);
  if (typeof flodeTimer.unref === 'function') flodeTimer.unref();

  // SANDNINGSIDENTITETEN (PR #268/#269). Fail-closed: av utan VYRA_SANDNINGSIDENTITET='1' och
  // full molnkonfiguration — da ar detta en noop vars moln() ar exakt den gamla fetch-raden i
  // sendEvent. Pa: korningsidentitet, livscykel-FIFO och grinden, se livscykel.js. Fatala svar
  // avslutar processen med kontraktets exitkoder (86/65/78) som connection-manager laser.
  const livscykel = skapaLivscykel({
    pa: process.env.VYRA_SANDNINGSIDENTITET === '1' && !!(CLOUD && WORKSPACE && INGEST_TOKEN),
    tiktokUsername: username, cloud: CLOUD, workspace: WORKSPACE, token: INGEST_TOKEN,
    raknad: nyckel => {
      flodeRaknare.set(nyckel, (flodeRaknare.get(nyckel) || 0) + 1);
      if (nyckel === 'gate-drop') reportToParent('gate-drop');
    },
  });

  function eventKey(type, data, fields) {
    const nativeId = N.sourceId(data);
    return nativeId ? `${type}:${nativeId}` : `${type}:${fields.username || ''}:${fields.giftName || ''}:${fields.count || ''}:${Math.floor(Date.now() / 1000)}`;
  }

  // Skapas aven nar den ar avstangd: en avstangd inspelare ror inte disken alls, och da behover
  // ingen anropsplats nedan veta om den finns.
  const inspelare = Inspelare.skapa({
    pa: INSPELNING,
    katalog: INSPELNING_KATALOG,
    anvandare: username,
    maxByte: INSPELNING_MAX_MB * 1024 * 1024,
    typer: process.env.VYRA_INSPELNING_TYPER,
  });
  let inspelningsytaLoggad = false;
  if (inspelare.aktiv) inspelare.metarad({ bibliotek: bibliotekVersion(), anvandarhash: Inspelare.hash(username) });

  function sendEvent(type, fields, data) {
    // Den normaliserade formen loggas vid sidan av den raa, sa ra -> normaliserat gar att diffa
    // offline. Aldrig fore dedupen: en dubblett som inte skickas ska inte heller spelas in som
    // utgaende, annars ljuger filen om vad molnet faktiskt fick.
    const key = eventKey(type, data, fields), now = Date.now();
    for (const [oldKey, at] of recentEventKeys) if (now - at > 120_000) recentEventKeys.delete(oldKey);
    // Dubbletter i egen hink: annars gar det inte att se om gavor tappas i dedupen eller aldrig kom.
    const dubblett = recentEventKeys.has(key);
    const flodeNyckel = dubblett ? `${type} dubblett` : type;
    flodeRaknare.set(flodeNyckel, (flodeRaknare.get(flodeNyckel) || 0) + 1);
    if (recentEventKeys.has(key)) return Promise.resolve({ ok: true, duplicate: true });
    recentEventKeys.set(key, now);
    // Bada raderna for en vidarebefordrad handelse: den raa payloaden OCH det normaliserade
    // resultatet. Det ar den enda vagen att se VAR ett falt tappas — fyra listor maste namna en
    // typ for att den ska na en widget, och en diff mellan de tva raderna pekar ut vilken.
    inspelare.raa(type, data, 'vidarebefordrad');
    inspelare.utgaende(type, fields);
    reportToParent('event', { eventType: type, at: now });
    const local = { type, eventKey: key, source: 'tiktok-bridge', ...fields };
    const jobs = [postJson('/api/events', local)];
    // N.tillMolnet: vitlista, se normalizer.js. Gäller BARA molnpostningen — den lokala raden ovan
    // matar overlayen och får inte filtreras, annars tystnar chattwidgetarna i OBS.
    // Sjalva posten (url ${CLOUD}/api/events/tiktok/${WORKSPACE}, huvuden, N.cloudEvent-bodyn och
    // felraden) bor numera i livscykel.js och ar med flaggan av byte for byte densamma som den
    // gamla inline-raden har — bevisat i test/livscykel.test.js flagga-av-provet.
    if (CLOUD && WORKSPACE && INGEST_TOKEN && N.tillMolnet(type)) jobs.push(livscykel.moln(key, type, fields));
    return Promise.all(jobs);
  }

  function startHeartbeat(roomId) {
    clearInterval(heartbeatTimer);
    // Hjartslaget bar laget. Vid paus fortsatter det ticka — anslutningen star kvar — men med
    // state 'paused', sa granssnittet kan saga sanningen utan att nagot ateransluts.
    const beat = () => postJson('/api/heartbeat', { username, roomId, reconnectAttempt, state: sandningsLage });
    beat(); heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  }

  // LOGGAR VID FORANDRING, inte vid varje handelse.
  //
  // Sond ett hade ett tak pa atta rader per typ. LINK_MIC_ARMIES slog i det efter atta identiska
  // rader, och slutet kan mycket val ha legat i nummer nio. Att bara hoja taket hade dranks loggen:
  // armies fyrar flera ganger i minuten under en match.
  //
  // Skiftet start -> aktiv -> slut ar per definition en FORANDRING i payloadens skalarer. Loggas bara
  // det som andrats fangas varje overgang, och stillastaende brus kostar ingenting.
  const battleSondRaknare = new Map();
  const battleSondSenaste = new Map();
  let battleSondMatch = null;
  const BATTLE_SOND_TAK = 40;
  function loggaBattleSond(namn, data) {
    let probe;
    try { probe = N.battleProbe(data); }
    catch (err) { console.log(`[bridge][battle-sond] ${namn} kunde inte lasas: ${err.message}`); return }
    // TAKET AR PER MATCH, INTE PER BRYGGPROCESS.
    //
    // Uppmatt 2026-08-06: match 1 forbrukade 14 av de 40 raderna. Match 2 fick resten och slog i
    // taket pa rad #40, som fortfarande bar battleSettings.status=1 - alltsa en PAGAENDE battle.
    // Slutet hamnade efter taket och gick forlorat, och just slutet var hela anledningen till sonden.
    //
    // battleId ar det TikTok sjalv byter nar en ny match borjar, och det finns i bade
    // LINK_MIC_BATTLE och LINK_MIC_ARMIES. Bada kartorna maste nollstallas: bara antalsraknaren och
    // forsta raden i nya matchen blir tyst, eftersom den ser likadan ut som en rad i den forra.
    const battleId = probe.skalarer && probe.skalarer.battleId;
    if (battleId && battleId !== battleSondMatch) {
      battleSondMatch = battleId;
      battleSondRaknare.clear();
      battleSondSenaste.clear();
    }
    const signatur = JSON.stringify(probe.skalarer);
    if (battleSondSenaste.get(namn) === signatur) return;   // oforandrat sedan forra loggade raden
    battleSondSenaste.set(namn, signatur);
    // Taket raknar LOGGADE rader, inte handelser — annars branner en pratig strom taket pa
    // oforandrade varden och tystnar innan det intressanta hander.
    const n = (battleSondRaknare.get(namn) || 0) + 1;
    battleSondRaknare.set(namn, n);
    if (n > BATTLE_SOND_TAK) return;
    // Nyckellistan bara pa forsta raden — den ar lang och andras inte.
    const nyttLage = n === 1 ? ` nycklar=${JSON.stringify(probe.nycklar)}` : '';
    console.log(`[bridge][battle-sond] ${namn} #${n} ${signatur}${nyttLage}`);
    if (n === BATTLE_SOND_TAK) console.log(`[bridge][battle-sond] ${namn}: taket natt, tystnar`);
  }

  function scheduleReconnect(reason) {
    if (stopping || reconnectTimer) return;
    clearInterval(heartbeatTimer); heartbeatTimer = null;
    const base = baseReconnectDelayMs(reconnectAttempt);
    const delay = jitteredDelayMs(base);
    reconnectAttempt++;
    postJson('/api/disconnect', { reason, reconnectAttempt, retryInMs: delay });
    reportToParent('reconnecting', { attempt: reconnectAttempt, reason });
    console.log(`[bridge] ${reason}. Nytt försök om ${Math.ceil(delay / 1000)}s (försök ${reconnectAttempt})...`);
    if (shouldSendCriticalAlert(reconnectAttempt, criticalAlertSent)) {
      criticalAlertSent = true;
      postDiscordAlert(criticalReconnectAlertPayload(username, reconnectAttempt, reason));
    }
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  }

  function connect() {
    if (stopping) return;
    // Rotate to a fresh proxy for every connection attempt (including reconnects) — null when
    // PROXY_LIST is empty (dev mode) or every proxy is currently marked failed.
    currentProxy = proxyManager.next();
    const options = currentProxy
      ? { webClientOptions: { agent: { http: new HttpsProxyAgent(currentProxy), https: new HttpsProxyAgent(currentProxy) } } }
      : {};
    const connection = new TikTokLiveConnection(username, options);
    activeConnection = connection;

    connection.on(WebcastEvent.CHAT, data => {
      const comment = data.comment || '';
      // `name` carries the comment for the desktop runtime, which has always read it there.
      // `comment` is the field that survives server/event-bus.js's cleanEvent() — it has no `name`,
      // so on the cloud path the chat text was dropped outright and TTS Chat, chat-triggered
      // Actions and chatbot commands all received an empty string. Both readers do
      // `ev.comment || ev.name`, so sending both keeps desktop and cloud on one shape.
      sendEvent(comment.trim().startsWith('!') ? 'chatcommand' : 'chat', {
        ...N.baseUser(data),
        name: comment,
        comment,
      }, data);
    });

    connection.on(WebcastEvent.GIFT, data => {
      // Cumulative frames: forward only the last one, or the streak is counted as a triangular number.
      if (N.isStreakable(data) && !N.isFinalFrame(data)) return;
      sendEvent('gift', N.giftFields(data), data);
    });

    connection.on(WebcastEvent.FOLLOW, data => sendEvent('follow', N.baseUser(data), data));

    connection.on(WebcastEvent.SHARE, data => sendEvent('share', N.baseUser(data), data));

    connection.on(WebcastEvent.MEMBER, data => sendEvent('member', N.baseUser(data), data));
    connection.on(WebcastEvent.SUB_NOTIFY, data => sendEvent('subscribe', N.baseUser(data), data));
    connection.on(WebcastEvent.ROOM_USER, data => sendEvent('viewer', { count: N.number(data?.viewerCount || data?.userCount, 1e9) }, data));
    connection.on(WebcastEvent.LINK_MIC_BATTLE, data => sendEvent('battle', N.battleFields(data), data));

    // ---- multiplikatorfonstret (Boosting Glove) ------------------------------------------------
    // Klientsidan har redan hela vagen: media.js tander Glove Snipe pa `glove` i typen och laser
    // `multiplier`, och molnets cleanEvent bar faltet. Det enda som saknades var kallan —
    // LINK_MIC_BATTLE bar ingen multiplikator, den ligger i LINK_MIC_BATTLE_TASK.
    //
    // TYPEN AR MED FLIT INTE `battle`. battle-mvp-session.js oppnar och stanger sin session pa
    // allt vars typ innehaller "battle", och ett boost-event mitt i en match hade da stangt
    // sessionen och tant MVP-overlayn i fel ogonblick. `glove` innehaller inte "battle" och gar
    // darfor bara till Glove Snipe.
    //
    // EN GANG PER FONSTER. START kan komma flera ganger for samma fonster; nyckeln ar matchen plus
    // fonstrets starttid, sa ett omsant meddelande inte later overlayn blinka.
    const settaBoostFonster = new Map();
    connection.on(WebcastEvent.LINK_MIC_BATTLE_TASK, data => {
      let f;
      try { f = N.battleTaskFields(data) } catch (err) {
        console.log(`[bridge] battle-task kunde inte lasas: ${err.message}`); return;
      }
      if (!N.arBoostFonster(f)) return;
      const nyckel = `${f.battleId}:${f.fonsterStart}:${f.multiplier}`;
      if (settaBoostFonster.has(nyckel)) return;
      for (const [gammalNyckel, at] of settaBoostFonster) if (Date.now() - at > 600_000) settaBoostFonster.delete(gammalNyckel);
      settaBoostFonster.set(nyckel, Date.now());
      console.log(`[bridge] boost-fonster x${f.multiplier} i match ${f.battleId || 'okand'}, ${f.fonsterSekunder || '?'}s`);
      sendEvent('glove', { multiplier: f.multiplier }, data);
    });

    // ---- battle-sond -------------------------------------------------------------------------
    // En hel sandning gick 2026-08-06 utan att ETT ENDA battle-event nadde klienten, trots att
    // anslutningen satt stabilt (loggen: alla anslutningsfel FORE den enda "Ansluten till @", inget
    // efter) och trots att tittare, gavor och chatt kom fram hela tiden.
    //
    // Loggen kunde inte saga varfor: sendEvent loggar inte per event. Biblioteket har sju
    // link-mic-handelser och bryggan prenumererade pa en. Det gar inte att gissa sig till vilken
    // TikTok faktiskt anvander for en battle - och ett felaktigt gissat forsok kostade redan en
    // deploy i kvall.
    //
    // Sonden LOGGAR BARA. Den vidarebefordrar med flit ingenting: LINK_MIC_ARMIES fyrar upprepat
    // under en pagaende match, och skickades den som `battle` skulle klientens sessionslogik stanga
    // och oppna om sessionen om och om igen - och tanda MVP-overlayn varje varv, mitt i sandningen.
    // Forst nar vi VET vilken handelse som bar slutet kopplas den in pa riktigt.
    for (const probeNamn of ['LINK_MIC_BATTLE', 'LINK_MIC_ARMIES', 'LINK_MIC_BATTLE_PUNISH_FINISH', 'LINK_MIC_BATTLE_TASK']) {
      const handelse = WebcastEvent[probeNamn];
      if (!handelse) { console.log(`[bridge][battle-sond] ${probeNamn} finns inte i biblioteket`); continue }
      connection.on(handelse, data => loggaBattleSond(probeNamn, data));
    }
    // PAUS OCH ATERUPPTAGANDE (Davids fraga 2026-08-21).
    //
    // Biblioteket har INGEN egen pauhandelse — 68 typer och ingen heter nagot med pause.
    // Pausen kommer som CONTROL_MESSAGE med ett action-falt; koderna star i
    // tiktok-live-proto/v3, som biblioteket sjalvt bygger pa:
    //   1 STREAM_PAUSED   2 STREAM_UNPAUSED   3 STREAM_ENDED   4 STREAM_SUSPENDED
    //
    // INGEN ATERANSLUTNING VID PAUS. scheduleReconnect() skulle riva och bygga upp
    // anslutningen igen for nagot som inte ar ett fel — och under tiden ar overlayn dod.
    // Bara laget byts; hjartslaget fortsatter och connected forblir sant.
    connection.on(WebcastEvent.CONTROL_MESSAGE, data => {
      const action = Number(data?.action);
      if (action === 1) { sandningsLage = 'paused'; loggaLage('Sandningen pausad'); }
      else if (action === 2) { sandningsLage = 'live'; loggaLage('Sandningen aterupptagen'); }
      else if (action === 4) { sandningsLage = 'suspended'; loggaLage('Sandningen stoppad av TikTok'); }
      // action 3 (ENDED) ags av STREAM_END nedan — en och samma sak ska inte stangas ner
      // fran tva hall.
    });
    connection.on(WebcastEvent.STREAM_END, () => { sandningsLage = 'live'; if (aktuelltRum) livscykel.slut(aktuelltRum); scheduleReconnect('TikTok LIVE avslutades') });
    /* GUARDIAN — FORBEREDD, INTE AKTIVERAD.
       ===========================================================================================
       VANTAR PA EVENT-VERIFIERING. Se docs/live-verifiering.md punkt 6: vi vet inte vilken
       WebcastEvent-typ som bar Guardian-status, eller vilket falt som skiljer en Guardian fran en
       vanlig medlem. Sannolika kandidater, lasta ur tiktok-live-proto/v3:
         · MEMBER med ett rollfalt (guardianType / userRole / badgeList)
         · USER_NAVIGATION_EVENT med isGuardian
         · en egen typ vi inte prenumererar pa an

       ATT GISSA HAR SKULLE KOSTA MER AN DET SMAKAR. En typ som namnges i molnets fyra listor men
       som ingen kod nagonsin skickar ar en dod kontraktspost — precis den sortens logn tech-debt.md
       varnar for. Listorna (bryggans TILL_MOLNET, TIKTOK_INGEST_TYPES, TIKTOK_ROOM_TYPES och
       event-bussens ALLOWED) rors darfor INTE forran payloaden ar verifierad; tests/event-contract
       .test.js skulle dessutom falla direkt pa en typ som inte gar hela vagen.

       NAR FALTET AR VERIFIERAT: avkommentera, byt ut FALT_TBD, och lagg 'guardian' i alla fyra
       listorna i SAMMA andring. Klientsidan ar redan klar — window.triggerGuardianEmblem finns,
       ar koad i runtime-controls.js, och vantar bara pa ett event.

       PRAKTSTEGET ar ett STUDIOVAL, inte ett faltvarde. Bryggan ska darfor INTE skicka nagot steg:
       streamern valjer sin praktniva i panelen, och ett steg som kom utifran hade tyst skrivit over
       den. Det enda eventet behover bara bara ar VEM som kom in.

       TYPEN SKRIVS UT SOM `TYP` OCH INTE SOM STRANGEN NEDAN, med flit.
       tests/event-contract.test.js skannar RA kallkod efter `sendEvent('<typ>'` och kraver att varje
       traff finns i molnets fyra listor. En utkommenterad rad raknas — provet laser text, inte
       beteende. Att gora vakten kommentarsblind hade gjort den svagare for allas skull; att skriva
       exemplet med en variabel kostar ingenting och lamnar vakten exakt lika strang.

       // const TYP = 'guardian';                      <- lagg samtidigt till i de fyra listorna
       // connection.on(WebcastEvent.FALT_TBD_TYP, data => {
       //   if (!data?.FALT_TBD) return;
       //   sendEvent(TYP, { ...N.baseUser(data) }, data);
       // });

       INSPELAREN SER DEN REDAN. `set VYRA_INSPELNING_TYPER=alla` fore start spelar in varje
       WebcastEvent till fil, aven de bryggan inte prenumererar pa — och en inspelad typ nar
       aldrig molnet. Det ar den vagen fram: spela in en sandning dar en Guardian gar in, och las
       diffen mellan raden `kalla:"vidarebefordrad"` och `_utgaende`. */
    // Field mapping lives in normalizer.js (likeFields) so it can be tested without a socket — the
    // v3 rename that silently zeroed every like is exactly the kind of thing a unit test must pin.
    connection.on(WebcastEvent.LIKE, data => sendEvent('likes', N.likeFields(data), data));

    connection.on(ControlEvent.DISCONNECTED, () => {
      if (activeConnection === connection) activeConnection = null;
      scheduleReconnect('Frånkopplad från TikTok LIVE');
    });

    connection.on(ControlEvent.ERROR, err => {
      // ALDRIG raa felobjekt. `err?.message || err` skrev ut HELA objektet nar message saknades
      // — uppmatt 2026-08-26 med gavokatalogens SignatureMissingTokensError, som bar stackspar
      // och alla falt. sanera() ger typnamn i stallet for innehall.
      console.error('[bridge] Anslutningsfel:', sanera(err));
    });

    // ---- ra-inspelning: EN EGEN PRENUMERATIONSYTA, HELT SKILD FRAN sendEvent ------------------
    //
    // Poangen med inspelaren ar att se de handelser bryggan INTE prenumererar pa — LINK_MIC_ARMIES
    // ar just den vi inte vet formen pa, och en inspelare som bara sag de elva vidarebefordrade
    // typerna hade inte kunnat svara pa fragan den finns for.
    //
    // DEN OVILLKORLIGA REGELN: en typ som spelas in men inte redan vidarebefordras far ALDRIG na
    // molnet. Lyssnarna nedan anropar bara inspelare.raa() — aldrig sendEvent, aldrig
    // reportToParent. Skulle de gora det hade event-bussens ALLOWED avvisat typen, men forst
    // efter en 400-rad per arme-event, flera ganger i minuten under en match.
    //
    // Redan prenumererade typer far INTE en andra lyssnare har: det hade dubblerat raderna i filen
    // och gjort en inspelning omojlig att rakna pa.
    if (inspelare.aktiv) {
      const onskade = inspelare.typer();
      const redanLyssnade = new Set(['CHAT', 'GIFT', 'LIKE', 'FOLLOW', 'SHARE', 'MEMBER',
        'SUB_NOTIFY', 'ROOM_USER', 'STREAM_END', 'LINK_MIC_BATTLE', 'LINK_MIC_BATTLE_TASK']);
      const spelaIn = Object.keys(WebcastEvent)
        .filter(namn => onskade === null || onskade.has(namn))
        .filter(namn => !redanLyssnade.has(namn));
      for (const namn of spelaIn) {
        try { connection.on(WebcastEvent[namn], data => inspelare.raa(namn, data)) }
        catch (err) { console.log(`[bridge][inspelning] kunde inte lyssna pa ${namn}: ${err.message}`) }
      }
      // EN GANG, INTE PER ATERANSLUTNING. connect() kors om vid varje aterforsok med ett nytt
      // connection-objekt (sa inga lyssnare lacker), men raden hor till uppstarten — under en
      // sandning med omkopplingar hade den annars dranks loggen den sjalv finns for att gora
      // lasbar.
      if (!inspelningsytaLoggad) {
        inspelningsytaLoggad = true;
        console.log(`[bridge][inspelning] spelar in ${spelaIn.length} extra typ(er): ${spelaIn.join(', ') || '(inga)'}`);
      }
    }

    connection.connect()
      .then(state => {
        if (activeConnection !== connection || stopping) return connection.disconnect?.();
        const attemptsBeforeSuccess = reconnectAttempt;
        reconnectAttempt = 0;
        criticalAlertSent = false;
        console.log(`[bridge] Ansluten till @${username} (room ${state.roomId}) via ${currentProxy || 'ingen proxy'}. Vidarebefordrar events till ${SERVER}. Proxy-status: ${JSON.stringify(proxyManager.stats())}`);
        reportToParent('connected', { roomId: state.roomId });
        aktuelltRum = String(state.roomId);
        livscykel.startad(aktuelltRum);
        postJson('/api/connect', { username, roomId: state.roomId, source: 'tiktok-bridge' });
        if (shouldSendSuccessAlert(attemptsBeforeSuccess)) {
          postDiscordAlert(reconnectSuccessAlertPayload(username, state.roomId, attemptsBeforeSuccess));
        }
        startHeartbeat(state.roomId);
      })
      .catch(err => {
        if (activeConnection === connection) activeConnection = null;
        // The connection attempt itself failed — through this proxy (if any) — so mark it as
        // broken rather than blaming the next attempt's fresh proxy for the same problem. A
        // normal stream-end/disconnect (handled above) is NOT a proxy failure and never reaches
        // here, so only genuine connect failures affect proxy health.
        if (currentProxy) proxyManager.markFailed(currentProxy);
        // PROXY_LIST dokumenteras som "http://user:pass@ip:port" (proxy-manager.js:6), och den
        // har raden skrev ut adressen ORDAGRANT vid varje misslyckat forsok — inloggningsuppgifter
        // rakt in i Railways logg. Vard och port behalls, uppgifterna slangs.
        console.error(`[bridge] Kunde inte ansluta till @${username}${currentProxy ? ` via ${saneraUrl(currentProxy)}` : ''}:`, sanera(err));
        scheduleReconnect(`@${username} är kanske inte live`);
      });
  }

  async function shutdown(signal) {
    if (stopping) return; stopping = true;
    clearTimeout(reconnectTimer); clearInterval(heartbeatTimer);
    try { await activeConnection?.disconnect?.(); } catch {}
    await postJson('/api/disconnect', { reason: signal || 'shutdown' });
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  connect();
}
