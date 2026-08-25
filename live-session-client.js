'use strict';
// KLIENTENS LIVESESSION-HANTERING — beslutslogiken, och ingenting annat.
//
// Servern ager sandningens identitet (#268) och bryggan ger den ett korningsid och en ordning
// (#269). Utkorgsworkern (Del A) far raderna ut pa bussen. Har ar mottagaren: varje OBS-kalla och
// Studio-canvasen ska byta sandning UTAN omladdning, och ska gora det EN gang aven nar samma
// besked kommer flera ganger.
//
// TVA SAKER, INTE EN (Davids punkt 1):
//   DEDUPEN ligger pa `eventId`. `live:start:<id>` och `live:end:<id>` ar TVA logiska handelser
//   for samma sandning. Hade dedupen legat pa sessionId ensamt hade endet avfardats som "redan
//   sett" — sandningen hade aldrig kunnat ta slut.
//   AKTIV SESSION ar ett eget falt: vilken sandning som pagar just nu, eller null.
//
// SNAPSHOTET GAR GENOM SAMMA DEDUPE. Bootstrapsvarets `session` bar inget eventId; det behandlas
// som den syntetiska handelsen `live:start:<sessionId>`. Darmed kan snapshotet och ramen aldrig
// behandla samma sandning tva ganger, oavsett vilken som kommer forst.
//
// NEDGRADERINGSREGELN (Davids punkt 3). `session: null` betyder auktoritativt "ingen LIVE" — men
// bara vid den INITIALA bootstrappen. Samma GET kors om vid varje ateranslutning, och ett svar
// som var sant nar fragan stalldes kan vara gammalt nar det landar. En senare null ignoreras
// darfor: avslutet ags av `live:end`-ramen, och ett aldre null-snapshot far aldrig skriva over en
// nyare start.
//
// ALLT AR INJICERAT — lagring, signal och konfig-omhamtning — sa hela kontraktet gar att prova
// utan webblasare, utan server och utan klocka som far ta tid.
(function (root) {
  const NYCKEL_AKTIV = 'vyra-live-session-aktiv';
  const NYCKEL_HANTERADE = 'vyra-live-session-hanterade';
  // Taket pa listan av behandlade eventId. En sandningscykel ar TVA eventId (start + end), sa 16
  // rymmer atta hela cykler. Listan finns for att overleva en sidladdning i samma flik, inte for
  // att vara ett arkiv: aldsta faller forst.
  const TAK = 16;
  const HANDELSER = { 'live:start': 'startedAt', 'live:end': 'endedAt' };
  // Samma uuid-krav som servern stallr nar den bygger ramen (event-bus.js cleanInternalEvent). Ett
  // sessionId som inte ens har uuid-form kan inte ha kommit darifran, och far darfor aldrig na
  // dedupen: en pahittad identitet hade annars kunnat nolla en pagaende sandning.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function skapaLiveSession({ lagring, signalera, konfigOmhamtning, logg } = {}) {
    // Varje beroring av lagringen ar inpackad. sessionStorage kastar i privat lage och i vissa
    // OBS-inbaddningar, och en overlay som slutar byta sandning for att en lagring nekade ar en
    // varre regression an att dedupen bara galler for sidans livstid.
    const las = (nyckel) => { try { return lagring && lagring.getItem(nyckel) } catch (e) { return null } };
    const skriv = (nyckel, varde) => { try { lagring && lagring.setItem(nyckel, varde) } catch (e) {} };
    const beratta = (m) => { try { (logg || function () {})(m) } catch (e) {} };

    let aktiv = las(NYCKEL_AKTIV) || null;
    let hanterade = [];
    try {
      const ratt = JSON.parse(las(NYCKEL_HANTERADE) || '[]');
      if (Array.isArray(ratt)) hanterade = ratt.filter(x => typeof x === 'string').slice(-TAK);
    } catch (e) { hanterade = [] }

    // LIVE-EVENTGENERATIONEN. Stegas varje gang en livesession-ram FAKTISKT behandlas. En ram som
    // dedupas bort bar ingen ny information och stegar darfor inte — annars hade en replay gjort
    // ett fullt giltigt snapshot obrukbart.
    //
    // Generationen ar hela racelosningen: den domer pa ALDER, inte pa innehall. Ett snapshot som
    // var fart nar det landade appliceras oavsett om det bar en session eller null; ett som hann
    // bli gammalt kastas oavsett innehall. Den gamla regeln domde pa innehall ("null ar
    // nedgraderande, ignorera alltid") och lamnade darfor en verklig lucka: missas `live:end`
    // under ett SSE-avbrott kommer ramen aldrig igen, och klienten hade statt kvar i en sandning
    // som tagit slut. Snapshotet MASTE kunna avsluta.
    let generation = 0;

    function minns(eventId) {
      hanterade.push(eventId);
      if (hanterade.length > TAK) hanterade = hanterade.slice(hanterade.length - TAK);
      skriv(NYCKEL_HANTERADE, JSON.stringify(hanterade));
    }

    function satt(nyAktiv) {
      aktiv = nyAktiv || null;
      skriv(NYCKEL_AKTIV, aktiv || '');
    }

    // Signalen som resten av klienten lyssnar pa. `vyra-live-session`, INTE `vyra-session-ended`:
    // det namnet betyder redan utloggning/kontobyte (session-state.js), och att aterbruka det
    // hade rivit SSE-strommen vid varje ny sandning.
    function signal(event, sessionId, tid) {
      try { (signalera || function () {})('vyra-live-session', { event, sessionId, at: tid || null }) }
      catch (e) { beratta('livesession-lyssnare kastade: ' + (e && e.message)) }
    }

    // En ny sandning ska mota en tom bild. Konfigurationen hamtas om fran den enda kallan —
    // serverns nollstallning ar redan committad nar startbeskedet gick ut, sa omhamtningen ger
    // resetens varden. `vyra-live-repaint` ligger i omhamtningens egen kedja (overlay-access.js).
    function hamtaOm() {
      try { (konfigOmhamtning || function () {})() }
      catch (e) { beratta('konfig-omhamtningen kastade: ' + (e && e.message)) }
    }

    // Fail-closed. En ram som inte ar exakt ratt form behandlas ALDRIG: eventId maste vara
    // `<handelse>:<sessionId>`, samma regel som servern bygger den med (event-bus.js:148). En
    // halvgiltig ram som slapps igenom hade kunnat nolla en pagaende sandning.
    function giltig(ram) {
      if (!ram || typeof ram !== 'object') return null;
      if (String(ram.type) !== 'livesession') return null;
      const handelse = String(ram.event || '');
      if (!Object.prototype.hasOwnProperty.call(HANDELSER, handelse)) return null;
      const sessionId = String(ram.sessionId || '');
      if (!UUID_RE.test(sessionId)) return null;
      const eventId = String(ram.eventId || '');
      if (eventId !== handelse + ':' + sessionId) return null;
      return { handelse, sessionId, eventId, tid: ram[HANDELSER[handelse]] || null };
    }

    function behandla(ram) {
      const g = giltig(ram);
      if (!g) return { atgard: 'ignorerad' };
      // TRANSPORT-ID:T RAKNAS INTE. Samma logiska handelse kommer med olika `id:`-rad efter en
      // ateranslutning (ny stromposition) och utan id alls fran snapshotet. Dedupen ser bara
      // eventId — det ar det enda som ar samma i alla tre fallen.
      if (hanterade.indexOf(g.eventId) !== -1) return { atgard: 'redan-behandlad', sessionId: g.sessionId };
      // NY INFORMATION => ny generation. Ett snapshot som var i luften nar det har hande ar nu
      // gammalt, och far inte langre skriva over det den har ramen sade.
      generation += 1;
      minns(g.eventId);
      if (g.handelse === 'live:start') {
        satt(g.sessionId);
        signal('live:start', g.sessionId, g.tid);
        hamtaOm();
        return { atgard: 'behandlad', sessionId: g.sessionId };
      }
      // ETT END NOLLAR BARA SIN EGEN SESSION. En sen `live:end(gammal)` efter `live:start(ny)`
      // ar en no-op — annars hade en fordrojd ram fran den forra sandningen slackt den nya.
      if (g.sessionId !== aktiv) return { atgard: 'behandlad', sessionId: g.sessionId, backade: false };
      satt(null);
      signal('live:end', g.sessionId, g.tid);
      return { atgard: 'behandlad', sessionId: g.sessionId, backade: true };
    }

    // Tas FORE forfragan gar ivag. Biljetten ar generationen vid den tidpunkten, och den avgor
    // sedan om svaret hann bli gammalt medan det var i luften.
    function borjaHamtning() { return generation; }

    // Bootstrapsvaret i sin helhet, inte bara faltet: skillnaden mellan ett SAKNAT `session` och
    // ett `null` ar hela flaggkontraktet, och den skillnaden finns bara i objektet.
    //
    // `biljett` ar varde fran borjaHamtning(). Utelamnas den tas generationen har och nu — alltsa
    // "ingenting kan ha hunnit emellan"; det ar bara for prov och bakatkompatibla anropare.
    function bootstrap(svar, biljett) {
      if (!svar || typeof svar !== 'object'
        || !Object.prototype.hasOwnProperty.call(svar, 'session')) {
        // Flaggan ar av. Ingen skrivning, ingen signal, ingen omhamtning — dormant betyder att
        // klienten inte gor NAGOT, inte att den gor ingenting synligt.
        return { atgard: 'dormant' };
      }
      // ALDERSKONTROLLEN, fore allt annat och oberoende av innehallet. Hann en ram behandlas
      // medan svaret var i luften ar svaret gammalt — bade ett null och ett start(gammal).
      const forvantad = biljett === undefined || biljett === null ? generation : biljett;
      if (forvantad !== generation) return { atgard: 'ignorerad-gammal', sessionId: aktiv };

      const s = svar.session;
      if (s && typeof s === 'object' && UUID_RE.test(String(s.sessionId || ''))) {
        return behandla({ type: 'livesession', event: 'live:start',
          eventId: 'live:start:' + s.sessionId, sessionId: s.sessionId, startedAt: s.startedAt });
      }
      // `null` = auktoritativt ingen LIVE, och snapshotet ar fart. Det AVSLUTAR darfor en aktiv
      // session: det ar den enda vagen tillbaka nar `live:end` missats under ett stromavbrott.
      if (!aktiv) return { atgard: 'behandlad', sessionId: null };
      const gammal = aktiv;
      generation += 1;
      satt(null);
      signal('live:end', gammal, null);
      return { atgard: 'behandlad', sessionId: null, backade: true };
    }

    return {
      borjaHamtning,
      bootstrap,
      behandla,
      aktivSession: () => aktiv || null,
      // For prov och felsokning.
      lage: () => ({ aktiv, hanterade: hanterade.slice(), generation }),
    };
  }

  // ---- BROWSERSINGELN ---------------------------------------------------------------------------
  // EN instans per browserkalla. Bade overlay-access.js (bootstrapsvaret) och live-client.js
  // (SSE-ramarna) matar samma hanterare — annars hade snapshotet och ramen haft var sin dedupe,
  // och sandningen behandlats tva ganger.
  //
  // Konfig-omhamtningen registreras UTIFRAN: den agaren ar overlay-access.js, som ar det enda
  // stallet som vet hur en OBS-lank hamtar om sin konfiguration. I Studio-laget finns ingen — och
  // da ska bytet av sandning inte hamta nagonting alls.
  let singel = null;
  let omhamtare = null;
  function lagringen() {
    try { return root.sessionStorage } catch (e) { return null }
  }
  function runtime() {
    if (singel) return singel;
    singel = skapaLiveSession({
      lagring: lagringen(),
      signalera: (namn, detalj) => {
        try { root.dispatchEvent(new CustomEvent(namn, { detail: detalj })) } catch (e) {}
      },
      konfigOmhamtning: () => { if (omhamtare) omhamtare() },
      logg: (m) => { try { console.warn('[vyra]', m) } catch (e) {} },
    });
    return singel;
  }

  if (typeof module === 'object' && module.exports) module.exports = { skapaLiveSession };
  else root.VyraLiveSession = { skapaLiveSession, runtime,
    registreraKonfigOmhamtning: (fn) => { omhamtare = fn } };
})(typeof window !== 'undefined' ? window : globalThis);
