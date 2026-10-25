// DOLD TILLS FORSTA RIKTIGA HANDELSEN - regeln for overlay-utgangen (Davids beslut 2026-10-21).
//
// Ingen widget syns i sandningen (studio.html?overlay=1, overlay.html?access=..., scen- och
// widgetlankar) forran den i den PAGAENDE sandningen tagit emot sin forsta riktiga handelse av ratt
// slag: en topplista nar forsta personen finns, ett mal vid forsta bidraget, Top Gift vid forsta
// gavan, Last-X vid forsta handelsen av sin typ. Bakgrunden: ett gammalt sparat namn (fran ett test
// eller ett aldre exempelfalt) kunde synas i OBS innan nagonting hant.
//
// STUDION ROR VI INTE. I editorn syns allt som forut (exempel/demo), annars gar det inte att
// placera och designa. Undantagen ar streamerns eget innehall utan handelser: Egen text, Egen
// bild och Egen video visas som idag.
//
// DOLD BETYDER SAMMA SAK SOM `hidden`. Den har filen bestammer bara VILKA widgetar som vantar;
// sjalva doljandet gor overlay-dolda.js med exakt samma mekanism som for en dold widget (ladan
// stannar i DOM:en for riktade livepatchar men malas inte). Fore forsta svepet haller en regel i
// overlay-access.css alla lador osynliga, sa att forsta bildrutan aldrig visar ett gammalt namn.
//
// VAD SOM RAKNAS. Bara handelser som passerar live-client.js ingest() och dess eventgrind
// (`vyra-live-event`), plus samma handelse fran en annan flik i samma webblasare (media.js speglar
// `vyra-live-event` via localStorage). INTE: simulatorns `__simulerad`, direkta `__test`-anrop,
// serverns testevent (id `test-...`, POST /api/test/event) eller ▶ Testa widget - de visar
// exempelnamn, och exempelnamn far aldrig synas i sandningen.
//
// NY SANDNING NOLLSTALLER. live-session-client.js skickar `vyra-live-session` med `live:start`
// EN gang per sandning (dedupen ligger pa eventId och overlever omladdning). Da toms listan och
// alla widgetar ar dolda igen. Vid sidladdning jamfors den lagrade sessionen med den aktiva; ar
// de olika ar listan forra sandningens och kastas.
//
// VAR AKTIVERINGEN LIGGER. localStorage, nyckel `vyra-aktiverade-widgetar`, en post per lank
// (envagshash av ?access=, aldrig sjalva nyckeln) med sessions-id och widget-id:n. Samma lagring
// och samma skal som dedupelistan i live-session-client.js: OBS forstor och aterskapar
// webblasarkallan vid scenbyte/omstart, sa sessionStorage tappar allt. Overlayn far heller ingen
// historik vid laddning (SSE spelar bara upp efter Last-Event-ID inom samma sida), sa listan ar
// det enda som kan minnas att en widget redan visat riktig data i den har sandningen. Forsvinner
// lagringen helt forsvinner ocksa dedupelistan, live:start behandlas pa nytt och topplistornas
// raknare toms - da ar "dold igen" exakt ratt.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.VyraAktivering) return;

  const params = new URLSearchParams(location.search);
  const OVERLAY = params.has('overlay');
  // Provriggarnas utvag (tests/helpers/webblasare.js): aldre browserprov mater widgetarnas
  // utseende i overlay utan handelser. Reglen sjalv provas i overlay-aktivering.browser.test.js.
  const AV = !OVERLAY || window.__vyraVisaUtanAktivering === true;

  // Boxgame-klockan visar streamerns egen rond, ingen handelse - den star i OBS fran forsta bildrutan.
  const UNDANTAG = new Set(['templateCustomText', 'templateCustomImage', 'templateCustomVideo', 'templateBoxgameClock']);
  const NYCKEL = 'vyra-aktiverade-widgetar';
  // Utan sandningsidentitet (lokalt lage, flaggan av) finns ingen live:start som nollstaller.
  // Da galler aktiveringen hogst en arbetsdag.
  const UTAN_SESSION_MS = 12 * 3600 * 1000;
  const TAK_LANKAR = 24;

  // ---- lagring -----------------------------------------------------------------------------------
  const minne = Object.create(null);
  const lagring = (() => {
    try {
      const l = window.localStorage;
      l.setItem('__vyra-aktiveringsprov', '1'); l.removeItem('__vyra-aktiveringsprov');
      return l;
    } catch (_) {
      return { getItem: k => (k in minne ? minne[k] : null), setItem: (k, v) => { minne[k] = String(v) } };
    }
  })();

  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  const OMFANG = 'l' + hash(String(params.get('access') || 'lokal'));

  function lasAllt() {
    try { const o = JSON.parse(lagring.getItem(NYCKEL) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
    catch (_) { return {}; }
  }
  function skrivAllt(o) {
    const nycklar = Object.keys(o);
    if (nycklar.length > TAK_LANKAR) {
      nycklar.sort((a, b) => (o[a].at || 0) - (o[b].at || 0)).slice(0, nycklar.length - TAK_LANKAR).forEach(k => delete o[k]);
    }
    try { lagring.setItem(NYCKEL, JSON.stringify(o)); } catch (_) {}
  }

  // live-session-client.js kan ladda EFTER den har filen. Da lases dess egen nyckel direkt — samma
  // lagring den sjalv valjer forst — i stallet for att tro att ingen sandning pagar och kasta listan.
  function aktivSession() {
    try {
      const rt = window.VyraLiveSession?.runtime?.();
      if (rt) return rt.aktivSession() || null;
    } catch (_) {}
    try { return window.localStorage.getItem('vyra-live-session-aktiv') || window.sessionStorage.getItem('vyra-live-session-aktiv') || null; }
    catch (_) { return null; }
  }

  let post = null; // { session, startedAt, ids: [], at }
  function ny(session, startedAt) { return { session: session || null, startedAt: startedAt || null, ids: [], at: Date.now() }; }
  function spara() { const o = lasAllt(); post.at = Date.now(); o[OMFANG] = post; skrivAllt(o); }
  function ladda() {
    const o = lasAllt(), p = o[OMFANG], nu = aktivSession();
    const giltig = p && Array.isArray(p.ids) && (p.session || null) === nu
      && (nu || (Date.now() - (p.at || 0)) < UTAN_SESSION_MS);
    post = giltig ? { session: p.session || null, startedAt: p.startedAt || null, ids: p.ids.map(String), at: p.at || Date.now() } : ny(nu, null);
    if (!giltig) spara();
  }
  ladda();

  // ---- vilka handelser ar vilka ------------------------------------------------------------------
  function slag(e) {
    const t = String((e && (e.type || e.event)) || '').toLowerCase().replace(/[\s_-]/g, '');
    if (t === 'gift' || t === 'giftcombo') return 'gift';
    if (t === 'like' || t === 'likes') return 'like';
    if (t === 'follow') return 'follow';
    if (t === 'share') return 'share';
    if (t === 'member' || t === 'subscribe' || t === 'subscription') return 'member';
    if (t === 'chat' || t === 'comment' || t === 'chatcommand' || t === 'command') return 'chat';
    if (t === 'join' || t === 'roomuser') return 'join';
    if (t === 'guardian') return 'guardian';
    if (t === 'superfan') return 'superfan';
    if (t === 'fanlevelup') return 'fanlevel';
    if (t === 'subscriberemote' || t === 'fanclubsticker' || t === 'fansticker') return 'emote';
    if (t === 'envelope') return 'envelope';
    if (t.includes('glove')) return 'glove';
    if (t.includes('battle')) return 'battle';
    if (t === 'viewer') return 'viewer';
    return t;
  }
  const PERSON = new Set(['gift', 'like', 'follow', 'share', 'member', 'chat', 'join', 'guardian', 'superfan', 'fanlevel', 'emote']);
  const METRIK = { likes: 'like', like: 'like', coins: 'gift', diamonds: 'gift', gifts: 'gift', gift: 'gift',
    follows: 'follow', followers: 'follow', follow: 'follow', shares: 'share', share: 'share',
    comments: 'chat', chat: 'chat', subscribers: 'member', members: 'member', subs: 'member' };
  const LASTX = { gifter: ['gift'], liker: ['like'], sharer: ['share'], subscriber: ['member'], follower: ['follow'] };

  function harPerson(e) { return !!String(e.username || e.uniqueId || e.name || e.userId || '').trim(); }
  function harVarde(e, k) {
    if (k !== 'like' && k !== 'gift') return true;
    const n = Number(e.count ?? e.likes ?? e.value ?? e.coins ?? e.diamondCount ?? 1);
    return !Number.isFinite(n) || n > 0;
  }

  // Vilka slag som aktiverar widgeten. null = vilken personhandelse som helst (alerts och effekter,
  // som anda bara syns nar de triggas - grinden hindrar bara att gammal data star kvar i vila).
  function slagFor(w) {
    switch (w.type) {
      case 'templateTopLike': return w.rankingCycle ? ['like', 'gift'] : [METRIK[String(w.liveMetric || 'likes').toLowerCase()] || 'like'];
      case 'templateTopCoins': return [METRIK[String(w.liveMetric || 'diamonds').toLowerCase()] || 'gift'];
      case 'templateTopPoints': return 'points';
      case 'templateTopGift': case 'templateTopStreak': case 'templatePgStreak': case 'templatePgPodium':
      case 'templateGiftCampaign': case 'templateGiftJar': case 'templateGiftFireworks':
      case 'templateGiftBubbles': case 'templateHeartFireworks': case 'templateGifterLevel':
      case 'templateHeartGoal':
        return ['gift'];
      case 'templateLikeFountain': return ['like'];
      // Hjärtan & moln (hjartmoln.js) väntar på det slag som startar effekten. Läget "alltid" är
      // ett undantag (arUndantag nedan): då loopar effekten och har ingen händelse att vänta på.
      case 'templateHeartCloud':
        return ({ gavor: ['gift'], 'likes-gavor': ['like', 'gift'], foljare: ['follow'] })[w.hmLage] || ['like'];
      case 'templateFollowerAlert': return ['follow'];
      case 'templateGuardianEmblem': return ['guardian'];
      case 'templateBattleMvp': return ['battle'];
      case 'templateGloveSnipe': return ['glove', 'battle'];
      case 'templateTreasureChest': return ['envelope'];
      case 'templateSongRequests': return ['chat'];
      case 'templateFanLevel50': return 'fl50';
      case 'templateSocialGoal': {
        const k = METRIK[String(w.goalKind || '').toLowerCase()];
        return k ? [k] : ['gift', 'like', 'follow', 'share', 'member'];
      }
      case 'templatePgGoal': return [METRIK[String(w.pg?.x?.metric || 'coins').toLowerCase()] || 'gift'];
      case 'templateLastX': {
        const raw = String(w.lastXType || 'all').toLowerCase();
        if (raw === 'all') return ['gift', 'like', 'share', 'member', 'follow'];
        const ut = [];
        raw.split(',').forEach(x => (LASTX[x.trim()] || []).forEach(k => ut.push(k)));
        return ut.length ? ut : ['gift'];
      }
      default: return null;
    }
  }

  function arFl50(e) {
    const s = e.fanLevelUp;
    if (s && Number(s.to) === 50) return true;
    try { return window.VyraFanLevel50Session?.nivaAv?.(e) === 50; } catch (_) { return false; }
  }

  function aktiverarSlag(w, e, k) {
    const s = slagFor(w);
    if (s === 'points') {
      try { return (window.VyraPoints?.getTop?.(1) || []).length > 0; } catch (_) { return false; }
    }
    if (s === 'fl50') return arFl50(e);
    if (s === null) return PERSON.has(k) && harPerson(e);
    if (!s.includes(k)) return false;
    if (PERSON.has(k) && !harPerson(e)) return false;
    return harVarde(e, k);
  }

  // ---- regeln -------------------------------------------------------------------------------------
  function arUndantag(w) { return !w || UNDANTAG.has(w.type) || (w.type === 'templateHeartCloud' && w.hmLage === 'alltid'); }
  function aktiverad(w) { return !!w && post.ids.indexOf(String(w.id)) !== -1; }
  function vantar(w) { return !AV && !!w && w.id != null && !arUndantag(w) && !aktiverad(w); }

  function widgetar() {
    try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets : []; }
    catch (_) { return []; }
  }

  function visaNu() {
    // Fargskt data i raderna fore forsta bildrutan: topplistornas ticker gar bara varje sekund.
    try { window.dispatchEvent(new CustomEvent('vyra-live-repaint')); } catch (_) {}
    try { window.VyraDoldaWidgetar?.svep?.(); } catch (_) {}
  }

  function aktivera(ids) {
    let andrat = false;
    for (const id of ids) {
      const s = String(id);
      if (post.ids.indexOf(s) === -1) { post.ids.push(s); andrat = true; }
    }
    if (!andrat) return false;
    spara();
    visaNu();
    // Samma handelse kan behova en runda till: Points-reskontran och vissa familjer skriver
    // forst nar hela ingest() ar klar.
    Promise.resolve().then(visaNu);
    return true;
  }

  function arTest(e) {
    return !e || typeof e !== 'object' || e.__simulerad || e.__test || e.__testspel
      || /^test-/.test(String(e.id || ''));
  }

  // Ett event aldre an sandningens start hor till forra sandningen (t.ex. en uppspelad buffert).
  function forGammal(e) {
    const start = Date.parse(post.startedAt || '') || 0;
    const at = Number(e.at) || Date.parse(e.timestamp || '') || 0;
    return !!(start && at && at < start - 2000);
  }

  function ta(e) {
    if (AV || arTest(e) || forGammal(e)) return;
    const k = slag(e);
    if (!k) return;
    const traff = [];
    for (const w of widgetar()) {
      if (!w || w.id == null || arUndantag(w) || aktiverad(w)) continue;
      try { if (aktiverarSlag(w, e, k)) traff.push(w.id); } catch (_) {}
    }
    if (traff.length) aktivera(traff);
    // Top Points: reskontran (action-runtime.js) skrivs av Actions som kor efter den har lyssnaren.
    if (widgetar().some(w => w && w.type === 'templateTopPoints' && !aktiverad(w))) {
      setTimeout(() => {
        const sena = widgetar().filter(w => w && w.type === 'templateTopPoints' && !aktiverad(w) && aktiverarSlag(w, e, k)).map(w => w.id);
        if (sena.length) aktivera(sena);
      }, 0);
    }
  }

  function nollstall(sessionId, startedAt) {
    post = ny(sessionId || null, startedAt || null);
    spara();
    try { window.VyraDoldaWidgetar?.svep?.(); } catch (_) {}
  }

  if (!AV) {
    window.addEventListener('vyra-live-event', ev => ta(ev && ev.detail));
    // Samma handelse fran en annan flik i samma webblasare (media.js speglar den till
    // routeLiveBattleEvent via localStorage).
    window.addEventListener('storage', ev => {
      if (ev.key !== 'vyra-live-event' || !ev.newValue) return;
      try { ta(JSON.parse(ev.newValue)); } catch (_) {}
    });
    window.addEventListener('vyra-live-session', ev => {
      const d = ev && ev.detail;
      if (!d || d.event !== 'live:start') return;
      if (post.session === d.sessionId && post.session) return;
      nollstall(d.sessionId, d.at);
    });
  }

  // EFTER EN OMLADDNING ritas widgetarna fore livevardena ar tillbaka (live-leaderboard.js lagger
  // tillbaka sandningens Top Gift och topplistor forst i sin repaint). En aktiverad widget ska inte
  // sta tom eller dold tills nasta handelse - darfor en repaint efter en render som har aktiverade
  // widgetar, hogst en per bildruta.
  if (!AV && typeof render === 'function') {
    const forraRender = render;
    let koad = false;
    render = function () {
      const r = forraRender.apply(this, arguments);
      if (!koad && post.ids.length && widgetar().some(aktiverad)) {
        koad = true;
        setTimeout(() => { koad = false; visaNu(); }, 0);
      }
      return r;
    };
  }

  // STUDIONS PANEL: en kort rad i sektion 2 (Innehåll) som sager nar widgeten borjar synas i OBS.
  const NAR = { gift: 'första gåvan kommer', like: 'första liken kommer', follow: 'första följaren kommer',
    share: 'första delningen kommer', member: 'första prenumeranten kommer', chat: 'första chattmeddelandet kommer',
    guardian: 'första Guardian kommer', battle: 'första battlen börjar', glove: 'första battlen börjar',
    envelope: 'första skattkistan kommer' };
  function narText(w) {
    if (!w || arUndantag(w)) return null;
    const s = slagFor(w);
    let nar;
    if (s === 'points') nar = 'första personen får poäng';
    else if (s === 'fl50') nar = 'första tittaren når nivå 50';
    else if (s === null) nar = 'första händelsen kommer';
    else {
      const unika = [...new Set(s.map(k => NAR[k] || 'första händelsen kommer'))];
      nar = unika.length === 1 ? unika[0] : 'första händelsen av sitt slag kommer';
    }
    return 'Syns i sändningen först när ' + nar + '.';
  }
  if (!OVERLAY && window.VyraPanelram && typeof window.VyraPanelram.tillagg === 'function') {
    try {
      window.VyraPanelram.tillagg(2, w => {
        const t = narText(w);
        if (!t) return null;
        const p = document.createElement('p');
        p.className = 'pr-aktivering';
        p.dataset.aktiveringRad = '1';
        p.style.cssText = 'margin:0 0 8px;font-size:12px;opacity:.75';
        p.textContent = t;
        return p;
      });
    } catch (_) {}
  }

  // TESTHANDELSER RAKNAS INTE I SANDNINGEN: live-client.js ingest() skickar dem inte som
  // `vyra-live-event` i overlay-utgangen, sa varken den har regeln eller nagon raknare ser dem.

  window.VyraAktivering = {
    aktiv: !AV,
    vantar,
    aktiverad,
    slagFor,
    narText,
    // For prov och felsokning.
    lage: () => ({ omfang: OMFANG, session: post.session, ids: post.ids.slice() }),
  };
})();
