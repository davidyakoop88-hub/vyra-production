// SPOTIFY UTAN WIDGET (David 2026-10-22: "Spotify ska funka utan att lägga den som widget på layout").
//
// Spotify-sidan i studion visade tre "Musikåtgärder" — !song, !skip och Gåva → låt — som bara var
// text. Det enda som faktiskt pratade med Spotify var Låtönskningar-widgeten (latonskningar.js), och
// den gör ingenting förrän den ligger i lagret. Den här filen gör åtgärderna verkliga:
//
//   !play <låt>                → VyraSpotify.queue(låt). (!önska, !sr och !låt fungerar också.) Väntetid 60 s per tittare, högst 10 låtar
//                                som väntar, samma låt två gånger inom tio minuter avvisas.
//   !skip                      → VyraSpotify.next(), bara för moderatorer och streamern själv.
//   !song                      → chattbotens svar ("Chatbot: !song") hämtar låten som spelas NÄR
//                                svaret skickas: "Nu spelas: Titel – Artist". Ett eget svar med
//                                {låt} i texten får låten insatt där. Ett eget svar utan {låt} rörs
//                                inte.
//   Önskningar                 → listan på Spotify-sidan visar varje !önska: vem, vilken låt, när
//                                och läget (Söker / I kön / Spelas nu / Spelad / Avvisad / Misslyckades).
//                                David 2026-10-22: "om någon önskar sig låt man ska kunna se den i
//                                vyralive.app också listan".
//   Gåva → låt                 → vald gåva (namn eller giftId, som Action & Events gavanTraffar)
//                                startar vald låt med VyraSpotify.play().
//
// VEM KÖR
//   * Bara studion. Spotify-token finns bara i studions localStorage — OBS/overlayn har ingen, så
//     ingenting här körs i ?overlay.
//   * Bara automationsföraren (VyraAutomationMaster.farKora()), så två öppna studioflikar inte lägger
//     samma låt i kön två gånger.
//   * Aldrig på __test/__simulerad/test-händelser: en simulerad chattrad får inte byta låt i
//     streamerns riktiga Spotify. Testa-knapparna på Spotify-sidan är uttryckliga klick och spelar
//     på riktigt — det är deras hela poäng.
//   * Ligger en synlig Låtönskningar-widget i lagret äger den !önska och !skip (dess inställningar
//     gäller, och dess källa kan vara YouTube). Då gör den här filen ingenting med de kommandona.
//
// INSTÄLLNINGARNA bor i 'vyra-extras' (VyraExtras.data.spotify), skrivna med samma
// VyraSessionState.writeActive som extras.js sparar chattboten med — en ny nyckel hade krävt fyra
// listor i fyra domäner.
//
// TYST VID FEL: svarar inte Spotify loggas det i konsolen och sändningen går vidare. Ingen modal.
//
// studio.js rörs aldrig. Filen laddas från studio.html direkt efter extras.js.
(function (root) {
  'use strict';

  var doc = root.document;
  var HISTORIK_MS = 30000;          // äldre chattrader är historik som spelas upp vid sidladdning
  var COOLDOWN_MS = 60000;          // per tittare
  var MAX_VANTAR = 10;              // låtar vi lagt i kön som Spotify inte nått än
  var VANTAR_MAX_MS = 60 * 60000;   // en önskning som legat en timme räknas inte längre som väntande
  var DUBBLETT_MS = 10 * 60000;
  var GAVA_COOLDOWN_MS = 15000;     // en gåvokombo ska inte starta om låten för varje tryck
  var SVARSTID_MS = 4000;           // !song väntar högst så här länge på Spotify
  // !play är kommandot som visas (David 2026-10-25: "!önska / byt till !Play"). De gamla formerna
  // finns kvar så att tittare med gamla vanor och sparade widgetar inte tystnar.
  var ALIAS = ['!play', '!önska', '!onska', '!sr', '!songrequest', '!låt', '!lat'];
  var STANDARDSVAR = ['Visar låten som spelas på Spotify', 'Visar laten som spelas pa Spotify'];
  var LAT_TOKEN = /\{(?:låt|lat|song)\}/gi;
  var TOKEN_KEY = 'vyra-spotify-token-v1';

  var SENAST = {};      // tittare -> tidpunkt för senaste önskning
  var SEDDA = {};       // event-id -> 1
  var SEDDA_ANTAL = 0;
  var VANTAR = [];      // { fraga, uri, at }
  var GAVA_SENAST = {}; // rad-id -> tidpunkt
  var PAGAR = {};       // action-id -> 1 medan !song-svaret hämtar låten
  var LISTA = [];       // önskningarna som syns på Spotify-sidan, senaste först
  var LISTA_MAX = 30;
  var LISTA_KEY = 'vyra-spotify-onskningar';   // sessionStorage: listan överlever en omladdning av fliken
  var LISTA_NR = 0;
  var STAM_MS = 15000;  // så ofta Spotify tillfrågas om vad som spelas, bara medan sidan är öppen

  // ---- MILJÖN -----------------------------------------------------------------------------------
  function iOverlay() {
    try {
      if (root.VYRA_OVERLAY_SCENE) return true;
      if (doc && doc.documentElement && doc.documentElement.classList.contains('overlay-output')) return true;
      return /[?&]overlay(=|&|$)/.test(String(root.location && root.location.search || ''));
    } catch (e) { return false; }
  }
  function arForare() {
    var m = root.VyraAutomationMaster;
    if (!m || typeof m.farKora !== 'function') return true;   // samma fail-open som resten av kedjan
    try { return !!m.farKora(); } catch (e) { return true; }
  }
  function spotify() { var s = root.VyraSpotify; return s && typeof s.queue === 'function' ? s : null; }
  function harToken() { try { return !!root.localStorage.getItem(TOKEN_KEY); } catch (e) { return false; } }
  function nu() {
    try { var n = Number(root.VyraLive && root.VyraLive.serverNu && root.VyraLive.serverNu()); if (n > 0) return n; } catch (e) {}
    return Date.now();
  }
  function arTest(e) { return !!(e && (e.__test || e.__simulerad || /^test-/.test(String(e.id || '')))); }
  function lagret() { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets : []; } catch (e) { return []; } }
  // Samma regel som latonskningar.js forsta(): den första SYNLIGA widgeten tar kommandona.
  function widgetAgerKommandona() { return lagret().some(function (w) { return w && w.type === 'templateSongRequests' && !w.hidden; }); }
  function saker(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sakerUrl(u) { u = String(u || ''); return /^(https?:\/\/|assets\/|\/api\/|data:image\/)/i.test(u) ? saker(u) : ''; }
  function toast(t) { try { if (typeof root.toast === 'function') root.toast(t); } catch (e) {} }
  function logga(vad, err) { try { console.warn('[VYRA Spotify] ' + vad, err && err.message || err || ''); } catch (e) {} }

  // ---- INSTÄLLNINGAR ------------------------------------------------------------------------------
  function extras() {
    try { if (root.VyraExtras && root.VyraExtras.data) return root.VyraExtras.data; } catch (e) {}
    try { return JSON.parse(root.localStorage.getItem('vyra-extras') || '{}') || {}; } catch (e) { return {}; }
  }
  function installningar(raw) {
    var s = raw === undefined ? extras().spotify : raw;
    s = s && typeof s === 'object' ? s : {};
    return {
      onska: s.onska !== false,
      skip: s.skip !== false,
      gavor: Array.isArray(s.gavor) ? s.gavor.filter(function (g) { return g && typeof g === 'object'; }) : []
    };
  }
  function spara(s) {
    var d = extras();
    d.spotify = { onska: s.onska !== false, skip: s.skip !== false, gavor: (s.gavor || []).slice(0, 20) };
    var ss = root.VyraSessionState;
    // Bara sessionsägaren skriver de skyddade nycklarna (tests/session-write-monopoly.test.js).
    if (!ss || typeof ss.writeActive !== 'function') { toast('Inställningen kunde inte sparas just nu'); return Promise.resolve({ ok: false }); }
    return Promise.resolve(ss.writeActive('vyra-extras', JSON.stringify(d))).then(function (r) {
      if (r && r.ok === false) toast('Inställningen kunde inte sparas just nu');
      return r;
    }, function (err) { logga('sparningen misslyckades', err); toast('Inställningen kunde inte sparas just nu'); });
  }

  // ---- CHATTEN ------------------------------------------------------------------------------------
  function tolka(text) {
    var t = String(text || '');
    try { t = t.normalize('NFC'); } catch (e) {}
    t = t.trim();
    var l = t.toLowerCase();
    for (var i = 0; i < ALIAS.length; i++) {
      if (l.indexOf(ALIAS[i] + ' ') === 0) return { fraga: t.slice(ALIAS[i].length).trim().slice(0, 120) };
    }
    if (/^!(skip|hoppa)\b/i.test(t)) return { skip: true };
    return null;
  }
  function streamern() {
    try { var t = root.VyraLive && root.VyraLive.tillstand && root.VyraLive.tillstand(); return String(t && t.konto || '').replace(/^@/, '').toLowerCase(); } catch (e) { return ''; }
  }
  // Samma fält som latonskningar.js läser (isModerator, arVard), plus streamerns eget konto.
  function farHoppa(e) {
    if (e.isModerator || e.arVard) return true;
    var vem = String(e.username || e.uniqueId || '').replace(/^@/, '').toLowerCase(), jag = streamern();
    return !!jag && vem === jag;
  }
  function markeraSedd(id) {
    if (SEDDA[id]) return false;
    SEDDA[id] = 1;
    if (++SEDDA_ANTAL > 2000) { SEDDA = {}; SEDDA_ANTAL = 0; SEDDA[id] = 1; }
    return true;
  }
  function gammal(e) { var at = Number(e.at) || Number(e.timestamp) || 0; return !!at && nu() - at > HISTORIK_MS; }

  function ta(e) {
    if (!e || typeof e !== 'object' || iOverlay() || arTest(e)) return false;
    var typ = String(e.type || e.event || '').toLowerCase().replace(/[\s_-]/g, '');
    if (typ === 'gift' || typ === 'giftcombo') return gava(e);
    if (typ !== 'chat' && typ !== 'chatcommand' && typ !== 'comment' && typ !== 'command') return false;
    var text = e.comment || e.name || e.message || e.command || '';
    var r = tolka(text); if (!r) return false;
    if (widgetAgerKommandona()) return false;
    var s = installningar();
    if (r.skip ? !s.skip : !s.onska) return false;
    if (!spotify() || !harToken()) return false;
    if (!arForare()) return false;
    var id = String(e.id || e.eventKey || ((e.username || '') + ':' + text + ':' + (e.at || '')));
    if (!markeraSedd('c:' + id)) return false;
    if (gammal(e)) return false;
    if (r.skip) {
      if (!farHoppa(e)) return false;
      Promise.resolve().then(function () { return spotify().next(); }).catch(function (err) { logga('!skip svarade inte', err); });
      return true;
    }
    return onska(r.fraga, String(e.username || e.uniqueId || e.name || 'tittare'));
  }

  function rensaVantande() {
    var t = Date.now();
    VANTAR = VANTAR.filter(function (x) { return t - x.at < VANTAR_MAX_MS; });
  }
  // Spotify säger inte när en köad låt spelats. Är taket nått frågar vi vad som spelas: allt vi lagt
  // i kön fram till och med den låten har Spotify redan nått.
  function stamMotSpotify() {
    return Promise.resolve().then(function () { return spotify().current(); }).then(function (c) {
      var uri = c && c.item && c.item.uri;
      stamLista(uri);
      if (!uri) return;
      for (var i = VANTAR.length - 1; i >= 0; i--) if (VANTAR[i].uri === uri) { VANTAR.splice(0, i + 1); return; }
    }).catch(function () {});
  }
  function onska(fraga, av) {
    if (!fraga || fraga.length < 2) return false;
    var vem = av.toLowerCase(), t = Date.now();
    if (SENAST[vem] && t - SENAST[vem] < COOLDOWN_MS) { avvisa(fraga, av, 'Väntetid 60 s'); return false; }
    rensaVantande();
    var lc = fraga.toLowerCase();
    if (VANTAR.some(function (x) { return x.fraga.toLowerCase() === lc && t - x.at < DUBBLETT_MS; })) { avvisa(fraga, av, 'Redan önskad'); return false; }
    SENAST[vem] = t;
    var post = { fraga: fraga, uri: '', at: t, av: av };
    var rad = notera({ fraga: fraga, av: av, status: 'soker' });
    var fortsatt = VANTAR.length >= MAX_VANTAR ? stamMotSpotify() : Promise.resolve();
    // Platsen hålls direkt, så att två önskningar samma sekund inte båda ryms under taket.
    VANTAR.push(post);
    fortsatt.then(function () {
      if (VANTAR.indexOf(post) >= MAX_VANTAR) { VANTAR.splice(VANTAR.indexOf(post), 1); uppdatera(rad, { status: 'avvisad', orsak: 'Kön är full (' + MAX_VANTAR + ')' }); return; }
      return Promise.resolve(spotify().queue(fraga)).then(function (lat) {
        post.uri = lat && lat.uri || '';
        uppdatera(rad, { status: 'ko', uri: post.uri, titel: lat && lat.titel || '', artist: lat && lat.artist || '', bild: lat && lat.bild || '' });
      });
    }).catch(function (err) {
      var i = VANTAR.indexOf(post); if (i >= 0) VANTAR.splice(i, 1);
      uppdatera(rad, { status: 'fel', orsak: err && err.message || 'Spotify svarade inte' });
      logga('önskningen kunde inte läggas i kön', err);
    });
    return true;
  }

  // ---- ÖNSKELISTAN ---------------------------------------------------------------------------------
  function lasLista() {
    try { var l = JSON.parse(root.sessionStorage.getItem(LISTA_KEY) || '[]'); if (Array.isArray(l)) LISTA = l.filter(function (o) { return o && o.fraga; }).slice(0, LISTA_MAX); } catch (e) {}
    // En önskning som var mitt i sökningen när fliken laddades om får aldrig något svar.
    LISTA.forEach(function (o) { if (o.status === 'soker') { o.status = 'fel'; o.orsak = 'Avbröts av omladdning'; } });
  }
  function sparaLista() { try { root.sessionStorage.setItem(LISTA_KEY, JSON.stringify(LISTA)); } catch (e) {} }
  function listanAndrades() {
    sparaLista();
    ritaLista();
    try { root.dispatchEvent(new CustomEvent('vyra:spotify-onskningar', { detail: { antal: LISTA.length } })); } catch (e) {}
  }
  function notera(o) {
    var rad = { nr: ++LISTA_NR + '-' + Date.now().toString(36), fraga: o.fraga, av: o.av, at: Date.now(), status: o.status,
      orsak: o.orsak || '', uri: '', titel: '', artist: '', bild: '' };
    LISTA.unshift(rad);
    if (LISTA.length > LISTA_MAX) LISTA.length = LISTA_MAX;
    listanAndrades();
    return rad;
  }
  function uppdatera(rad, falt) { Object.keys(falt).forEach(function (k) { rad[k] = falt[k]; }); listanAndrades(); }
  // En tittare som spammar !önska under väntetiden ska inte fylla listan med samma avvisning.
  function avvisa(fraga, av, orsak) {
    var t = Date.now(), lc = fraga.toLowerCase();
    var finns = LISTA.some(function (o) { return o.status === 'avvisad' && o.av === av && String(o.fraga).toLowerCase() === lc && t - o.at < COOLDOWN_MS; });
    if (!finns) notera({ fraga: fraga, av: av, status: 'avvisad', orsak: orsak });
  }
  // Spotify säger bara vad som spelas JUST NU. Den önskan som spelas markeras; de som lades i kön
  // före den har Spotify redan passerat.
  function stamLista(uri) {
    var andrat = false, hittad = -1;
    if (uri) for (var i = 0; i < LISTA.length; i++) if ((LISTA[i].status === 'ko' || LISTA[i].status === 'spelas') && LISTA[i].uri === uri) { hittad = i; break; }
    LISTA.forEach(function (o, i) {
      var nytt = o.status;
      if (i === hittad) nytt = 'spelas';
      else if (o.status === 'spelas') nytt = 'spelad';
      else if (hittad >= 0 && i > hittad && o.status === 'ko') nytt = 'spelad';
      if (nytt !== o.status) { o.status = nytt; andrat = true; }
    });
    if (andrat) listanAndrades();
  }
  function vantarPaSpotify() { return LISTA.some(function (o) { return o.status === 'ko' || o.status === 'spelas'; }); }
  // LÅTÖNSKNINGAR-WIDGETEN äger !önska när den ligger synlig i lagret (widgetAgerKommandona). Med
  // källan Spotify syntes dess önskningar ändå aldrig här, och ett fel från Spotify stannade i
  // widgeten, som bara ritar de som lyckats: listan var tom och ingenting spelades, utan att något
  // sa varför (David 2026-10-23). Widgeten noterar därför sina Spotify-önskningar här — samma lista,
  // samma lägen och samma felorsak som när den här filen själv tar kommandot.
  function extern(fraga, av) {
    var rad = notera({ fraga: String(fraga || ''), av: String(av || 'tittare'), status: 'soker' });
    return {
      klar: function (lat) { uppdatera(rad, { status: 'ko', uri: lat && lat.uri || '', titel: lat && lat.titel || '', artist: lat && lat.artist || '', bild: lat && lat.bild || '' }); },
      fel: function (orsak) { uppdatera(rad, { status: 'fel', orsak: String(orsak || 'Spotify svarade inte') }); }
    };
  }

  // ---- GÅVA → LÅT ---------------------------------------------------------------------------------
  function gavoIdn(namn) {
    try { var K = root.VyraGavokatalog; if (K && typeof K.idn === 'function') return K.idn(namn) || new Set(); } catch (e) {}
    return new Set();
  }
  // Samma ordning som action-event-advanced.js gavanTraffar: namnet först, sedan id:t — det raden
  // sparade, eller det katalogen säger att det sparade namnet har (TikTok skickar namnet på
  // streamerns språk, id:t är detsamma på alla språk).
  function gavanTraffar(rad, e) {
    var g = rad && rad.gava || {};
    var namn = String(g.name || '').trim().toLowerCase();
    var faktiskt = String(e.giftName || e.gift || e.giftname || '').trim().toLowerCase();
    if (namn && faktiskt && namn === faktiskt) return true;
    var id = String(e.giftId || '');
    if (!id) return false;
    if (g.giftId && String(g.giftId) === id) return true;
    return !!namn && gavoIdn(g.name).has(id);
  }
  function aktivaGavorader(s) {
    return (s || installningar()).gavor.filter(function (r) { return r.on !== false && r.gava && r.gava.name && String(r.lat || '').trim(); });
  }
  function gava(e) {
    var rader = aktivaGavorader();
    if (!rader.length || !spotify() || !harToken() || !arForare()) return false;
    var id = String(e.id || e.eventKey || '');
    if (id && !markeraSedd('g:' + id)) return false;
    if (gammal(e)) return false;
    var rad = rader.filter(function (r) { return gavanTraffar(r, e); })[0];
    if (!rad) return false;
    var t = Date.now(), nyckel = String(rad.id || rad.gava.name);
    if (GAVA_SENAST[nyckel] && t - GAVA_SENAST[nyckel] < GAVA_COOLDOWN_MS) return false;
    GAVA_SENAST[nyckel] = t;
    Promise.resolve().then(function () { return spotify().play(String(rad.lat).trim()); })
      .catch(function (err) { logga('gåvans låt kunde inte spelas', err); });
    return true;
  }

  // ---- !song: CHATTBOTENS SVAR MED RIKTIG LÅT -----------------------------------------------------
  function latText() {
    var s = root.VyraSpotify;
    if (!s || typeof s.current !== 'function' || !harToken()) return Promise.resolve(null);
    var klar = false;
    return new Promise(function (ok) {
      var tid = setTimeout(function () { klar = true; ok(null); }, SVARSTID_MS);
      Promise.resolve().then(function () { return s.current(); }).then(function (c) {
        if (klar) return; clearTimeout(tid);
        var item = c && c.item;
        if (!item || c.is_playing === false) return ok(null);
        var vem = (item.artists || []).map(function (a) { return a && a.name; }).filter(Boolean).join(', ')
          || (item.show && item.show.name) || '';
        ok({ titel: String(item.name || ''), artist: vem });
      }, function () { if (!klar) { clearTimeout(tid); ok(null); } });
    });
  }
  function kort(l) { return l && l.titel ? l.titel + (l.artist ? ' – ' + l.artist : '') : ''; }
  function mening(l) { return l && l.titel ? 'Nu spelas: ' + kort(l) : 'Ingen låt spelas just nu'; }
  function arStandardsvar(t) { return STANDARDSVAR.indexOf(String(t || '').trim()) >= 0; }
  function harLatToken(t) { LAT_TOKEN.lastIndex = 0; var r = LAT_TOKEN.test(String(t || '')); LAT_TOKEN.lastIndex = 0; return r; }
  function behoverLat(a) {
    var c = a && a.config || {};
    return [c.chatText, c.ttsText].some(function (t) { return arStandardsvar(t) || harLatToken(t); });
  }
  function fyll(text, l) {
    if (text == null || text === '') return text;
    if (arStandardsvar(text)) return mening(l);
    return String(text).replace(LAT_TOKEN, l && l.titel ? kort(l) : 'ingen låt just nu');
  }

  // runAction läser om actionen ur lagret på dess id, så en kopia med samma id hade fått tillbaka den
  // statiska texten. Kopian får därför ett eget id ('~lat'): väntetiden räknas på det, konsekvent för
  // varje körning, och overlayn spelar kopian precis som vilken action som helst.
  function lindaIn() {
    var AE = root.VyraActionEvent;
    if (!AE || typeof AE.runAction !== 'function' || AE.runAction.__spotifyLat) return !!(AE && AE.runAction && AE.runAction.__spotifyLat);
    var forra = AE.runAction;
    var ny = function (action, payload) {
      if (iOverlay() || !action) return forra.apply(this, arguments);
      var lagrad = action;
      try { var st = typeof AE.read === 'function' ? AE.read() : null; lagrad = (st && st.actions || []).filter(function (a) { return a.id === action.id; })[0] || action; } catch (e) {}
      if (!behoverLat(lagrad)) return forra.apply(this, arguments);
      var kopia = {}; Object.keys(lagrad).forEach(function (k) { kopia[k] = lagrad[k]; });
      kopia.id = String(lagrad.id) + '~lat';
      kopia.config = {}; Object.keys(lagrad.config || {}).forEach(function (k) { kopia.config[k] = lagrad.config[k]; });
      var fore = typeof AE.kanKora === 'function' ? AE.kanKora(kopia, payload || {}) : { ok: true };
      if (!fore || !fore.ok) return forra.call(this, kopia, payload);   // samma toast som alltid
      if (PAGAR[kopia.id]) return false;
      PAGAR[kopia.id] = 1;
      var self = this, runId = 'run-lat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      latText().then(function (l) {
        kopia.config.chatText = fyll(kopia.config.chatText, l);
        kopia.config.ttsText = fyll(kopia.config.ttsText, l);
        try { forra.call(self, kopia, payload); } catch (err) { logga('!song-svaret kunde inte skickas', err); }
      }).then(function () { delete PAGAR[kopia.id]; }, function () { delete PAGAR[kopia.id]; });
      return runId;
    };
    ny.__spotifyLat = true;
    AE.runAction = ny;
    return true;
  }

  // ---- SPOTIFY-SIDAN ------------------------------------------------------------------------------
  var anslutning = { kand: false, ansluten: false };
  function lasAnslutning() {
    var s = root.VyraSpotify;
    if (!s || typeof s.status !== 'function') { anslutning = { kand: true, ansluten: false }; return Promise.resolve(anslutning); }
    return Promise.resolve().then(function () { return s.status(); }).then(function (r) {
      anslutning = { kand: true, ansluten: !!(r && r.connected) }; return anslutning;
    }, function () { anslutning = { kand: true, ansluten: false }; return anslutning; });
  }
  function chatbotSong() {
    var c = extras().commands;
    return (Array.isArray(c) ? c : []).filter(function (x) { return x && String(x.cmd || '').trim().toLowerCase() === '!song'; })[0] || null;
  }
  // Varje ruta säger vad som gäller JUST NU, inte vad funktionen skulle kunna göra.
  function lagen(s) {
    var ans = anslutning.ansluten, widget = widgetAgerKommandona();
    var ejAnsluten = anslutning.kand ? 'Anslut Spotify först' : 'Kontrollerar…';
    var song = chatbotSong();
    var rader = aktivaGavorader(s);
    return {
      onska: !ans ? [false, ejAnsluten] : widget ? [true, 'Styrs av Låtönskningar-widgeten'] : s.onska ? [true, 'Aktiv'] : [false, 'Av'],
      skip: !ans ? [false, ejAnsluten] : widget ? [true, 'Styrs av Låtönskningar-widgeten'] : s.skip ? [true, 'Aktiv'] : [false, 'Av'],
      song: !ans ? [false, ejAnsluten] : !song ? [false, 'Lägg till !song i Chatbot'] : song.on === false ? [false, 'Pausad i Chatbot']
        : (arStandardsvar(song.reply) || harLatToken(song.reply)) ? [true, 'Aktiv'] : [false, 'Eget svar utan {låt}'],
      gava: !ans ? [false, ejAnsluten] : rader.length ? [true, 'Aktiv · ' + rader.length + (rader.length === 1 ? ' gåva' : ' gåvor')] : [false, 'Välj gåva och låt']
    };
  }
  function status(l) { return '<em class="spk-status' + (l[0] ? ' spk-aktiv' : '') + '" data-spk-status>' + saker(l[1]) + '</em>'; }
  function brytare(id, pa, text) {
    return '<label class="spk-brytare"><input type="checkbox" id="' + id + '"' + (pa ? ' checked' : '') + '> ' + saker(text) + '</label>';
  }

  function katalog() {
    var lista = [];
    try { var K = root.VyraGavokatalog; if (K && typeof K.lista === 'function') lista = K.lista() || []; } catch (e) {}
    if (!lista.length) lista = (root.VYRA_GIFTS || []).filter(function (g) { return g && g.name; }).map(function (g) { return { name: g.name, image: g.file, coins: 0 }; });
    var sedda = {};
    return lista.filter(function (g) {
      var n = String(g && g.name || '').toLowerCase();
      if (!n || sedda[n]) return false;
      sedda[n] = 1; return true;
    }).sort(function (a, b) {
      var ca = Number(a.coins) || 0, cb = Number(b.coins) || 0;
      if (!ca !== !cb) return ca ? -1 : 1;
      return ca - cb || String(a.name).localeCompare(String(b.name), 'sv');
    });
  }
  function mynt(c) { return Number(c) > 0 ? Math.round(Number(c)) + ' coins' : ''; }
  function gavaKnapp(g) {
    if (!g || !g.name) return '<span class="spk-gava-tom">Välj gåva</span>';
    return (sakerUrl(g.image) ? '<img alt="" data-fallback-applied="1" src="' + sakerUrl(g.image) + '">' : '<i class="spk-gava-ikon">🎁</i>')
      + '<span><b>' + saker(g.name) + '</b>' + (mynt(g.coins) ? '<small>' + mynt(g.coins) + '</small>' : '') + '</span>';
  }
  function radHtml(r, i) {
    return '<div class="spk-rad" data-spk-rad="' + i + '">'
      + '<button type="button" class="spk-gava" data-spk-valj="' + i + '" aria-haspopup="listbox" aria-label="Välj gåva">' + gavaKnapp(r.gava) + '</button>'
      + '<span class="spk-pil">→</span>'
      + '<input class="spk-lat" data-spk-lat="' + i + '" maxlength="200" placeholder="Låt att spela, t.ex. Blinding Lights eller spotify:track:…" value="' + saker(r.lat || '') + '">'
      + brytare('spkPa' + i, r.on !== false, 'På')
      + '<button type="button" data-spk-testa="' + i + '">Testa</button>'
      + '<button type="button" class="spk-ta-bort" data-spk-bort="' + i + '" aria-label="Ta bort raden">✕</button>'
      + '</div>';
  }
  function sidHtml(u) {
    var s = installningar(u), l = lagen(s);
    var rader = s.gavor.length ? s.gavor : [{ id: 'g1', gava: null, lat: '', on: true }];
    return '<article><code>!play &lt;låt&gt;</code><small>Tittaren lägger en låt i din Spotify-kö (även !önska och !sr). 60 s väntetid per tittare, högst 10 låtar i kön.</small>' + status(l.onska) + brytare('spkOnska', s.onska, 'På') + '</article>'
      + '<article><code>!song</code><small>Chattboten svarar med låten som spelas: "Nu spelas: Titel – Artist". Skriv {låt} i ett eget svar.</small>' + status(l.song) + '<button type="button" data-spk-testa-song>Testa</button></article>'
      + '<article><code>!skip</code><small>Moderatorer och du själv kan byta låt</small>' + status(l.skip) + brytare('spkSkip', s.skip, 'På') + '</article>'
      + '<article class="spk-gavokort"><b>Gåva → låt</b><small>Spela vald låt vid gåva</small>' + status(l.gava)
      + '<div class="spk-rader">' + rader.map(radHtml).join('') + '</div>'
      + '<button type="button" class="spk-ny" data-spk-ny>＋ Lägg till gåva</button></article>'
      + '<article class="spk-onskekort"><b>Önskningar</b><small>Låtar tittarna önskat med !play, senaste överst.</small>' + status(listLage())
      + '<div data-spk-onskningar>' + listaHtml() + '</div>'
      + '<button type="button" data-spk-tom-lista' + (LISTA.length ? '' : ' hidden') + '>Töm listan</button></article>';
  }
  var STATUSTEXT = { soker: 'Söker…', ko: 'I kön', spelas: 'Spelas nu', spelad: 'Spelad', fel: 'Misslyckades', avvisad: 'Avvisad' };
  function klockslag(at) { var d = new Date(Number(at) || 0); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function onskanHtml(o) {
    var namn = o.titel ? o.titel + (o.artist ? ' – ' + o.artist : '') : o.fraga;
    var under = ['@' + String(o.av || 'tittare').replace(/^@/, ''), klockslag(o.at)];
    if (o.titel && String(o.fraga).toLowerCase() !== String(o.titel).toLowerCase()) under.push('"' + o.fraga + '"');
    if (o.orsak) under.push(o.orsak);
    var bild = sakerUrl(o.bild) ? '<img alt="" data-fallback-applied="1" src="' + sakerUrl(o.bild) + '">' : '<i class="spk-not">♫</i>';
    var aktiv = o.status === 'ko' || o.status === 'spelas';
    return '<li class="spk-onskan" data-spk-lage="' + saker(o.status) + '">' + bild
      + '<span><b>' + saker(namn) + '</b><small>' + saker(under.join(' · ')) + '</small></span>'
      + '<em class="spk-status' + (aktiv ? ' spk-aktiv' : '') + '">' + saker(STATUSTEXT[o.status] || o.status) + '</em></li>';
  }
  function listaHtml() {
    if (widgetAgerKommandona()) return '<p class="spk-tom">Låtönskningar-widgeten tar emot !play just nu. Önskningarna syns i widgeten.</p>';
    return LISTA.length ? '<ol class="spk-lista">' + LISTA.map(onskanHtml).join('') + '</ol>'
      : '<p class="spk-tom">Inga önskningar än. När en tittare skriver !play &lt;låt&gt; i chatten syns den här.</p>';
  }
  function listLage() {
    var i = LISTA.filter(function (o) { return o.status === 'ko' || o.status === 'spelas' || o.status === 'soker'; }).length;
    return LISTA.length ? [i > 0, LISTA.length + (LISTA.length === 1 ? ' önskning' : ' önskningar')] : [false, 'Tom'];
  }
  // Bara listan ritas om, inte hela sidan: annars tappar ett låtfält som redigeras sin text.
  function ritaLista() {
    var plats = doc && doc.querySelector('.spotify-card [data-spk-onskningar]');
    if (!plats) return;
    plats.innerHTML = listaHtml();
    var knapp = doc.querySelector('.spotify-card [data-spk-tom-lista]');
    if (knapp) knapp.hidden = !LISTA.length;
    var kort = doc.querySelector('.spotify-card .spk-onskekort [data-spk-status]');
    if (kort) kort.outerHTML = status(listLage());
  }

  var utkast = null;   // raderna medan sidan är öppen (en tom rad sparas inte förrän den fyllts i)
  function sida() {
    var regler = doc && doc.querySelector('.spotify-card .music-rules');
    if (!regler || iOverlay()) return false;
    if (!utkast) { var s = installningar(); utkast = { onska: s.onska, skip: s.skip, gavor: s.gavor.map(function (r) { return JSON.parse(JSON.stringify(r)); }) }; }
    if (!utkast.gavor.length) utkast.gavor.push({ id: 'g' + Date.now().toString(36), gava: null, lat: '', on: true });
    regler.dataset.spotifyKommandon = '1';
    regler.innerHTML = sidHtml(utkast);
    bindSida(regler);
    return true;
  }
  function sparaUtkast() {
    var rena = utkast.gavor.filter(function (r) { return r.gava && r.gava.name || String(r.lat || '').trim(); });
    return spara({ onska: utkast.onska, skip: utkast.skip, gavor: rena });
  }
  function omrita() { var r = doc.querySelector('.spotify-card .music-rules'); if (r) { r.innerHTML = sidHtml(utkast); bindSida(r); } }
  function bindSida(regler) {
    var q = function (s) { return regler.querySelector(s); };
    var el;
    if ((el = q('#spkOnska'))) el.onchange = function (e) { utkast.onska = !!e.target.checked; sparaUtkast(); omrita(); };
    if ((el = q('#spkSkip'))) el.onchange = function (e) { utkast.skip = !!e.target.checked; sparaUtkast(); omrita(); };
    utkast.gavor.forEach(function (r, i) {
      var pa = q('#spkPa' + i); if (pa) pa.onchange = function (e) { r.on = !!e.target.checked; sparaUtkast(); omrita(); };
      var lat = q('[data-spk-lat="' + i + '"]'); if (lat) lat.onchange = function (e) { r.lat = String(e.target.value || '').trim().slice(0, 200); sparaUtkast(); omrita(); };
      var valj = q('[data-spk-valj="' + i + '"]'); if (valj) valj.onclick = function () { oppnaValjare(valj, r); };
      var bort = q('[data-spk-bort="' + i + '"]'); if (bort) bort.onclick = function () { utkast.gavor.splice(i, 1); sparaUtkast(); omrita(); };
      var testa = q('[data-spk-testa="' + i + '"]'); if (testa) testa.onclick = function () {
        var latv = String(r.lat || '').trim();
        if (!latv) return toast('Skriv en låt först');
        if (!root.VyraSpotify || typeof root.VyraSpotify.play !== 'function') return toast('Spotify är inte anslutet');
        Promise.resolve().then(function () { return root.VyraSpotify.play(latv); })
          .then(function () { toast('Spotify spelar låten'); }, function (err) { toast(err && err.message || 'Spotify kunde inte spela låten'); });
      };
    });
    if ((el = q('[data-spk-ny]'))) el.onclick = function () { utkast.gavor.push({ id: 'g' + Date.now().toString(36), gava: null, lat: '', on: true }); omrita(); };
    if ((el = q('[data-spk-tom-lista]'))) el.onclick = function () { LISTA = []; listanAndrades(); };
    if ((el = q('[data-spk-testa-song]'))) el.onclick = function () { latText().then(function (l) { toast(mening(l)); }); };
  }
  function oppnaValjare(knapp, rad) {
    var gammal = doc.querySelector('.spk-valjare'); if (gammal) gammal.remove();
    var alla = katalog();
    var ruta = doc.createElement('div');
    ruta.className = 'spk-valjare';
    ruta.innerHTML = '<input type="search" placeholder="Sök bland ' + alla.length + ' gåvor …" aria-label="Sök gåva"><div role="listbox" aria-label="Gåvor"></div>';
    var lista = ruta.querySelector('[role="listbox"]'), sok = ruta.querySelector('input');
    var visa = function () {
      var f = String(sok.value || '').trim().toLowerCase();
      var urval = alla.filter(function (g) { return !f || String(g.name).toLowerCase().indexOf(f) >= 0; }).slice(0, 120);
      lista.innerHTML = urval.map(function (g, i) {
        return '<button type="button" role="option" data-spk-gava="' + i + '">' + gavaKnapp(g) + '</button>';
      }).join('') || '<small>Ingen gåva matchar</small>';
      Array.prototype.forEach.call(lista.querySelectorAll('[data-spk-gava]'), function (b) {
        b.onclick = function () {
          var g = urval[Number(b.dataset.spkGava)];
          rad.gava = { name: String(g.name), giftId: String(g.giftId || g.id || ''), image: String(g.image || ''), coins: Number(g.coins) || 0 };
          ruta.remove(); sparaUtkast(); omrita();
        };
      });
    };
    sok.oninput = visa;
    visa();
    knapp.parentElement.appendChild(ruta);
    try { sok.focus(); } catch (e) {}
    var stang = function (ev) { if (!ruta.contains(ev.target) && ev.target !== knapp && !knapp.contains(ev.target)) { ruta.remove(); doc.removeEventListener('mousedown', stang, true); } };
    doc.addEventListener('mousedown', stang, true);
  }

  function vaktaSidan() {
    if (!doc || iOverlay()) return;
    var kolla = function () {
      var regler = doc.querySelector('.spotify-card .music-rules');
      if (!regler) { utkast = null; return; }
      if (regler.dataset.spotifyKommandon) return;
      utkast = null;
      sida();
      lasAnslutning().then(function () { if (doc.querySelector('.spotify-card .music-rules[data-spotify-kommandon]')) omrita(); });
    };
    // Spotify-sidan ritas av extras.js (showExtra) med innerHTML på #view. Observatören ser varje
    // omritning, och kolla() är en querySelector — billig även när editorn ritar om ofta.
    try { new MutationObserver(kolla).observe(doc.querySelector('#view') || doc.documentElement, { childList: true, subtree: true }); } catch (e) {}
    root.addEventListener('vyra:spotify-changed', function () { lasAnslutning().then(function () { if (doc.querySelector('.spotify-card .music-rules[data-spotify-kommandon]')) omrita(); }); });
    kolla();
    // Medan Spotify-sidan är öppen och något ligger i kön frågas Spotify var 15:e sekund vad som
    // spelas, så att "I kön" blir "Spelas nu" och sedan "Spelad". Stängd sida = inga anrop.
    setInterval(function () {
      if (!doc.querySelector('.spotify-card [data-spk-onskningar]') || !vantarPaSpotify() || !spotify() || !harToken()) return;
      if (typeof spotify().current !== 'function') return;
      Promise.resolve().then(function () { return spotify().current(); })
        .then(function (c) { stamLista(c && c.is_playing !== false && c.item && c.item.uri); }, function () {});
    }, STAM_MS);
    if (!doc.getElementById('spk-stil')) {
      var st = doc.createElement('style'); st.id = 'spk-stil';
      st.textContent = [
        '.spotify-card .music-rules .spk-status{font-style:normal;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--surface-2,#ffffff12);color:var(--text-secondary,#b9aec6)}',
        '.spotify-card .music-rules .spk-status.spk-aktiv{background:#1db95426;color:#1ed760}',
        '.spotify-card .music-rules button,.spk-valjare [role=option]{font:inherit;font-size:12px;color:var(--text-primary,#f4eefa);background:var(--surface-2,#ffffff12);border:1px solid var(--border-subtle,#ffffff22);border-radius:8px;padding:6px 10px;cursor:pointer}',
        '.spotify-card .music-rules button:hover,.spk-valjare [role=option]:hover{border-color:#1db954}',
        '.spotify-card .spk-lat,.spk-valjare input{font:inherit;font-size:12px;color:var(--text-primary,#f4eefa);background:var(--surface-2,#ffffff12);border:1px solid var(--border-subtle,#ffffff22);border-radius:8px;padding:7px 10px}',
        '.spotify-card .spk-brytare{display:flex;align-items:center;gap:6px;font-size:12px}',
        '.spotify-card .spk-gavokort{grid-column:1/-1}',
        '.spotify-card .spk-rader{display:flex;flex-direction:column;gap:8px;width:100%;max-width:100%}',
        '.spotify-card .spk-rad{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:100%}',
        '.spotify-card .spk-gava{display:flex;align-items:center;gap:8px;min-width:150px;max-width:100%;text-align:left}',
        '.spotify-card .spk-gava img,.spk-valjare img{width:28px;height:28px;object-fit:contain;flex:none}',
        '.spotify-card .spk-gava span,.spk-valjare [role=option] span{display:flex;flex-direction:column;min-width:0}',
        '.spotify-card .spk-gava small,.spk-valjare small{font-size:11px;opacity:.75}',
        '.spotify-card .spk-lat{flex:1 1 200px;min-width:0;max-width:100%}',
        '.spk-valjare{position:absolute;z-index:50;left:0;top:100%;margin-top:4px;width:min(320px,90vw);max-height:320px;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:10px;background:var(--surface-1,#150b1a);border:1px solid var(--border-subtle,#ffffff22);box-shadow:0 12px 30px #000a}',
        '.spk-valjare [role=listbox]{overflow:auto;display:flex;flex-direction:column;gap:2px}',
        '.spk-valjare [role=option]{display:flex;align-items:center;gap:8px;text-align:left;padding:4px 6px;flex:none}',
        '.spotify-card .spk-onskekort{grid-column:1/-1}',
        '.spotify-card .spk-onskekort [data-spk-onskningar]{align-self:stretch;width:100%}',
        '.spotify-card .spk-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;width:100%;max-height:360px;overflow:auto}',
        '.spotify-card .spk-onskan{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;background:var(--surface-2,#ffffff0d);min-width:0}',
        '.spotify-card .spk-onskan img,.spotify-card .spk-not{width:36px;height:36px;border-radius:6px;object-fit:cover;flex:none;display:grid;place-items:center;font-style:normal;background:#1db95426;color:#1ed760}',
        '.spotify-card .spk-onskan span{display:flex;flex-direction:column;min-width:0;flex:1}',
        '.spotify-card .spk-onskan b,.spotify-card .spk-onskan small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.spotify-card .spk-onskan small{font-size:11px;opacity:.75}',
        '.spotify-card .spk-onskan[data-spk-lage=spelad],.spotify-card .spk-onskan[data-spk-lage=avvisad],.spotify-card .spk-onskan[data-spk-lage=fel]{opacity:.6}',
        '.spotify-card .spk-onskan[data-spk-lage=spelas]{outline:1px solid #1db954}',
        '.spotify-card .spk-tom{font-size:12px;opacity:.75;margin:0}'
      ].join('');
      (doc.head || doc.documentElement).appendChild(st);
    }
  }

  // ---- START --------------------------------------------------------------------------------------
  if (iOverlay()) { root.VyraSpotifyKommandon = { aktiv: false }; return; }
  lasLista();
  root.addEventListener('vyra-live-event', function (ev) { try { ta(ev && ev.detail); } catch (err) { logga('kommandot föll', err); } });
  // action-event.js laddas från media.js-svansen, efter den här filen. Lindningen görs när den finns.
  if (!lindaIn()) {
    var forsok = 0, t = setInterval(function () { if (lindaIn() || ++forsok > 120) clearInterval(t); }, 500);
  }
  if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', vaktaSidan); else vaktaSidan();

  root.VyraSpotifyKommandon = {
    aktiv: true, ta: ta, tolka: tolka, latText: latText, fyll: fyll, behoverLat: behoverLat, lindaIn: lindaIn,
    installningar: installningar, gavanTraffar: gavanTraffar, sida: sida, extern: extern,
    onskningar: function () { return LISTA.map(function (o) { return { fraga: o.fraga, av: o.av, status: o.status, titel: o.titel, artist: o.artist, orsak: o.orsak }; }); },
    stamLista: stamLista,
    vantar: function () { return VANTAR.map(function (x) { return { fraga: x.fraga, av: x.av, uri: x.uri }; }); },
    rensa: function () { SENAST = {}; SEDDA = {}; SEDDA_ANTAL = 0; VANTAR = []; GAVA_SENAST = {}; PAGAR = {}; LISTA = []; sparaLista(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
