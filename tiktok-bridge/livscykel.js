'use strict';
// SÄNDNINGSIDENTITETENS LIVSCYKEL — bryggans halva av serverns sessionsmodell (PR #268/#269).
// Design: tiktok-bridge/SANDNINGSIDENTITET-DESIGN.md (godkänd med Davids korrigeringar).
//
// Modulen äger tre saker:
//   1. KÖRNINGSIDENTITETEN: ett bridgeRunId per bryggprocess, registrerat via POST /api/live-runs
//      som KÖÖBJEKT #0 — start/end kan strukturellt aldrig skickas före en accepterad registrering.
//   2. LIVSCYKELKÖN: en FIFO av logiska statusbesked (start/end) där seq ökas ENDAST per nytt
//      besked; en retry återanvänder exakt samma seq och body, och serverns seq-vakt gör replay
//      till en idempotent no-op.
//   3. GRINDEN: en explicit tillståndsmaskin (disabled/registering/waiting-start/draining/open/
//      ending/stale) som håller vanliga moln-events bakom ett accepterat start — accepterat svar
//      betyder att serverns nollställning är COMMITTAD (samma transaktion, bevisat i #268).
//
// ÄRLIG LEVERANSGARANTI: vanliga events är at-most-once, precis som före den här modulen. Det som
// skärps är ORDNINGEN runt start/end och att varje förlust RÄKNAS (gate-drop/event-fel) i stället
// för att försvinna tyst. Startbufferten är begränsad (VYRA_GRIND_BUFFERT, default 500 — motiverad
// mot uppmätt eventtakt i designdokumentet §3); overflow är uttrycklig dataförlust: drop-oldest,
// en strukturerad error-rad per grindstängningsperiod, plus räknare.
//
// FATALA SVAR ÄR FAIL-STOP, inte retry (exitkoderna är kontrakt mot connection-manager.js):
//   86  AVLOST_EXIT   — 409 på registreringen eller stale:true på start/end: en NYARE process
//                       äger kontot. Tystna och dö; managern blockerar kontot för sin livstid.
//   65  KONTRAKT_EXIT — servern avvisar kontraktet med 400: bryggan själv är defekt; en retry
//                       ger identiskt svar för evigt. Endast en ny deploy läker det.
//   78  KONFIG_EXIT   — 401 efter bounded policy (5 försök à 60 s): fel ingest-nyckel kräver
//                       konfigurationsändring, och en ändrad Railway-konfiguration skapar en NY
//                       serviceprocess — det är den avsedda återställningsvägen.
// 503/nätfel/5xx är ALDRIG fatala: bounded backoff 1s→60s på samma besked, för evigt.
const N = require('./normalizer');

const AVLOST_EXIT = 86;
const KONTRAKT_EXIT = 65;
const KONFIG_EXIT = 78;

const BACKOFF_BAS_MS = 1_000;
const BACKOFF_TAK_MS = 60_000;
const AUTH_FORSOK_TAK = 5;
const EVENT_TIMEOUT_MS = 10_000;

function skapaLivscykel({
  pa,
  tiktokUsername,
  cloud,
  workspace,
  token,
  fetchFn = (...a) => fetch(...a),
  vanta = ms => new Promise(r => setTimeout(r, ms)),
  randomUUID = () => require('node:crypto').randomUUID(),
  logg = console,
  avsluta = kod => process.exit(kod),
  buffertTak = Number(process.env.VYRA_GRIND_BUFFERT) || 500,
  raknad = () => {},
  eventTimeoutMs = EVENT_TIMEOUT_MS,
} = {}) {
  const eventUrl = `${cloud}/api/events/tiktok/${workspace}`;
  const huvuden = { 'content-type': 'application/json', 'authorization': `Bearer ${token}` };

  // Själva eventposten — exakt dagens form (bridge.js hade den inline): url, huvuden, N.cloudEvent.
  const skickaEvent = (key, type, fields, signal) =>
    fetchFn(eventUrl, {
      method: 'POST', headers: huvuden,
      body: JSON.stringify(N.cloudEvent(key, type, fields)),
      ...(signal ? { signal } : {}),
    }).then(r => { if (!r.ok) throw new Error(`Cloud HTTP ${r.status}`); });

  if (!pa) {
    // FLAGGA AV: noll nytt. moln() är byte för byte dagens rad (bridge.js:255) inklusive
    // felraden; ingen uuid, ingen kö, ingen timer, ingen fatal-policy. Provet 'flagga av'
    // jämför url/huvuden/body mot N.cloudEvent och kräver att ingenting annat händer.
    return {
      lage: () => 'disabled',
      bridgeRunId: null,
      startad() {},
      slut() {},
      moln: (key, type, fields) => skickaEvent(key, type, fields)
        .catch(err => logg.error('[bridge] Cloud-event misslyckades:', err.message)),
      stilla: async () => {},
      statistik: () => ({ droppade: 0 }),
    };
  }

  const bridgeRunId = randomUUID();
  let tillstand = 'registering';
  let seqNast = 1;
  let terminal = false;
  let pumpar = false;
  let inFlight = 0;
  let droppade = 0;
  let overflowLoggad = false;      // en error-rad per grindstängningsperiod
  let authForsok = 0;
  let sistaAccepterade = null;     // {typ, roomId} — för coalescing över accepterade besked
  const ko = [{ typ: 'reg', body: { tiktokUsername, bridgeRunId } }];
  const buffert = [];

  function fatal(kod, rad) {
    if (terminal) return;
    terminal = true;
    tillstand = 'stale';
    logg.error(rad);
    avsluta(kod);
  }

  function droppaEvent(varfor) {
    droppade++;
    raknad('gate-drop');
    if (varfor === 'overflow' && !overflowLoggad) {
      overflowLoggad = true;
      logg.error(`[livscykel][error] grindbuffert full (tak ${buffertTak}) — äldsta event släpps tills grinden öppnar; uttrycklig dataförlust, räknas som gate-drop`);
    }
  }

  // Svansen av logiska besked i kön (reg räknas inte) — coalescing tittar här.
  const koSvans = () => { for (let i = ko.length - 1; i >= 0; i--) if (ko[i].typ !== 'reg') return ko[i]; return null; };

  function backoff(post) {
    post.forsok = (post.forsok || 0) + 1;
    return Math.min(BACKOFF_TAK_MS, BACKOFF_BAS_MS * (2 ** Math.min(post.forsok - 1, 6)));
  }

  // Ett besked mot en av de tre rutterna. 'ok' = skifta kön, 'igen' = samma besked ligger kvar
  // (retryn har redan väntat), 'stopp' = fatal har avslutat. Loggarna bär ALDRIG token, huvuden
  // eller hela bodies — bara beskedstyp, seq och utfall.
  async function skicka(post) {
    const url = cloud + (post.typ === 'reg' ? '/api/live-runs'
      : post.typ === 'start' ? '/api/live-sessions' : '/api/live-sessions/end');
    let res;
    try {
      res = await fetchFn(url, { method: 'POST', headers: huvuden, body: JSON.stringify(post.body) });
    } catch (err) {
      logg.log(`[livscykel] ${post.typ} nådde inte servern (${err.message}) — nytt försök`);
      await vanta(backoff(post));
      return 'igen';
    }
    if (res.status === 401) {
      authForsok++;
      if (authForsok >= AUTH_FORSOK_TAK) {
        fatal(KONFIG_EXIT, `[livscykel][error] ingest-nyckeln avvisad (401) ${authForsok} gånger — stannar med kod ${KONFIG_EXIT}; konfigurationsändring + omdeploy är återställningsvägen`);
        return 'stopp';
      }
      logg.log(`[livscykel] 401 (försök ${authForsok}/${AUTH_FORSOK_TAK}) — nytt försök om ${BACKOFF_TAK_MS / 1000}s`);
      await vanta(BACKOFF_TAK_MS);
      return 'igen';
    }
    if (res.status === 400) {
      fatal(KONTRAKT_EXIT, `[livscykel][error] servern avvisade ${post.typ}-kontraktet (400) — bryggan är defekt, avslutar med kod ${KONTRAKT_EXIT}`);
      return 'stopp';
    }
    if (res.status === 409) {
      fatal(AVLOST_EXIT, `[livscykel][error] körningen är avlöst (409) — en nyare process äger kontot, tystnar med kod ${AVLOST_EXIT}`);
      return 'stopp';
    }
    if (!res.ok) {
      logg.log(`[livscykel] ${post.typ} fick HTTP ${res.status} — nytt försök`);
      await vanta(backoff(post));
      return 'igen';
    }
    const data = await res.json().catch(() => ({}));
    if (data && data.stale) {
      fatal(AVLOST_EXIT, `[livscykel][error] ${post.typ} är stale (${String(data.skal || 'okänt skäl')}) — en nyare körning äger kontot, tystnar med kod ${AVLOST_EXIT}`);
      return 'stopp';
    }
    post.forsok = 0;
    logg.log(`[livscykel] ${post.typ}${post.body.seq ? ` seq=${post.body.seq}` : ''} ${data && data.idempotent ? 'idempotent' : 'accepterad'}`);
    return 'ok';
  }

  async function draneraBuffert(lista) {
    while (lista.length && !terminal) {
      const e = lista.shift();
      inFlight++;
      try { await skickaEvent(e.key, e.type, e.fields, AbortSignal.timeout(eventTimeoutMs)); }
      catch (err) { raknad('event-fel'); logg.error('[bridge] Cloud-event misslyckades:', err.message); }
      finally { inFlight--; }
    }
  }

  async function pump() {
    if (pumpar || terminal) return;
    pumpar = true;
    try {
      while (ko.length && !terminal) {
        const post = ko[0];
        if (post.typ === 'end') {
          // §4: endet har redan sitt seq (reserverat vid STREAM_END) men sänds först när den
          // gamla LIVE:ns buffert är dränerad OCH redan startade molnposter är avgjorda.
          // Timeouten på varje eventpost gör väntan ändlig — ingen nödlucka behövs.
          await draneraBuffert(post.rest);
          while (inFlight > 0 && !terminal) await new Promise(r => setImmediate(r));
          if (terminal) return;
        }
        const utfall = await skicka(post);
        if (utfall === 'igen') continue;
        if (utfall === 'stopp') return;
        ko.shift();
        if (post.typ === 'reg') {
          if (tillstand === 'registering') tillstand = 'waiting-start';
        } else if (post.typ === 'start') {
          sistaAccepterade = { typ: 'start', roomId: post.body.roomId };
          tillstand = 'draining';
          await draneraBuffert(buffert);
          // Atomiskt: kön konstaterades tom och läget byts i samma synkrona avsnitt — inget
          // event kan smyga emellan i en enkeltrådad process.
          if (!terminal && tillstand === 'draining' && buffert.length === 0) {
            tillstand = 'open';
            overflowLoggad = false;
          }
        } else {
          sistaAccepterade = { typ: 'end', roomId: post.body.roomId };
          if (tillstand === 'ending') tillstand = 'waiting-start';
        }
      }
    } finally {
      pumpar = false;
      // Besked som köats medan pumpen höll på att avsluta sig får inte bli liggande.
      if (ko.length && !terminal) pump();
    }
  }

  return {
    lage: () => tillstand,
    bridgeRunId,

    // Varje lyckad anslutning — även en återanslutning till samma LIVE — ger ett nytt logiskt
    // startbesked; servern avgör reconnect kontra ny session. Coalescing gäller bara köns svans:
    // ett IDENTISKT start som ännu inte accepterats blir en retry i stället för en växande kö.
    startad(roomId) {
      if (terminal) return;
      const rum = String(roomId);
      const svans = koSvans();
      if (svans && svans.typ === 'start' && svans.body.roomId === rum) return;
      ko.push({ typ: 'start', body: { tiktokUsername, roomId: rum, bridgeRunId, seq: seqNast++ } });
      if (tillstand === 'open' || tillstand === 'ending') tillstand = 'waiting-start';
      pump();
    },

    // ENDAST STREAM_END får anropa detta (källkodsvakten i livscykel.test.js håller det sant).
    // Grinden stängs OMEDELBART; den gamla LIVE:ns buffrade events flyttas in i endets `rest`
    // så nästa LIVE:s events aldrig kan dräneras före sitt eget start.
    slut(roomId) {
      if (terminal) return;
      const rum = String(roomId);
      const svans = koSvans();
      if (svans && svans.typ === 'end' && svans.body.roomId === rum) return;          // dubblett i kön
      if (!svans && (!sistaAccepterade || sistaAccepterade.typ === 'end')) return;    // inget att avsluta
      ko.push({ typ: 'end', body: { tiktokUsername, roomId: rum, bridgeRunId, seq: seqNast++ }, rest: buffert.splice(0) });
      tillstand = 'ending';
      pump();
    },

    // Molnvägen för vanliga events. open → direkt (med timeout och räknad förlust); ending →
    // eftersläntrare droppas och räknas; övriga lägen → begränsad FIFO-buffert.
    moln(key, type, fields) {
      if (terminal) { droppaEvent('stale'); return Promise.resolve(); }
      if (tillstand === 'open') {
        inFlight++;
        return skickaEvent(key, type, fields, AbortSignal.timeout(eventTimeoutMs))
          .catch(err => { raknad('event-fel'); logg.error('[bridge] Cloud-event misslyckades:', err.message); })
          .finally(() => { inFlight--; });
      }
      if (tillstand === 'ending') { droppaEvent('ending'); return Promise.resolve(); }
      buffert.push({ key, type, fields });
      if (buffert.length > buffertTak) { buffert.shift(); droppaEvent('overflow'); }
      return Promise.resolve();
    },

    // Provsöm: löser när kön, bufferten och alla in-flight-poster är avgjorda (eller terminal).
    async stilla() {
      for (let i = 0; i < 20_000; i++) {
        if (terminal) return;
        if (!ko.length && !buffert.length && inFlight === 0 && !pumpar) return;
        await new Promise(r => setImmediate(r));
      }
      throw new Error('stilla(): kön blev aldrig stilla');
    },

    statistik: () => ({ droppade }),
  };
}

module.exports = { skapaLivscykel, AVLOST_EXIT, KONTRAKT_EXIT, KONFIG_EXIT };
