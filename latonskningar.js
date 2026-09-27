// LÅTÖNSKNINGAR — tittarna skriver "!önska <låt>" i TikTok-chatten och låten spelas automatiskt.
//
// Davids beslut 2026-09-27: BÅDA källorna, valda i panelen (YouTube eller Spotify). Alla i chatten
// får önska. Låtarna spelas automatiskt, utan godkännande.
//
// KEDJAN
//   TikTok-chatten → bryggan skickar rader som börjar med "!" som `chatcommand` (molnet räknar dem
//   i en egen takthink, server/index.js) → `vyra-live-event` → den här filen.
//
// VAR LÅTEN SPELAS
//   YouTube  i OBS-overlayn (studio.html?overlay=1). Sökningen går via servern (server/musik.js),
//            eftersom YouTube-nyckeln aldrig får nå en webbläsare. Spelaren är synlig i widgeten
//            och ljudet fångas av OBS. Studion spelar INTE upp — då hade låten hörts två gånger.
//   Spotify  på streamerns egen Spotify, via studions Spotify-anslutning (spotify-client.js
//            queue()). Låten läggs sist i Spotify-kön och Spotify spelar kön i ordning. Bara EN
//            flik lägger i kön: varje önskning har ett id som flikarna delar via localStorage.
//
// SKYDD: en önskning per tittare och cooldown, max längd på kön, max längd på låten (YouTube),
// samma låt två gånger i kön avvisas, och historik (gamla event vid sidladdning) spelas inte.
// Moderatorer och streamern kan skriva !skip.
//
// studio.js rörs aldrig: wh/props/bind lindas härifrån. Filen laddas via skript-svansen i media.js.
(function (root) {
  'use strict';

  var TYP = 'templateSongRequests';
  // status: YouTube 'sokar' → 'redo' → 'spelar' → 'spelad'. Spotify 'sokar' → 'skickad' (ligger i
  // Spotifys egen kö; när den spelas vet bara Spotify). Båda kan bli 'fel'.
  var KO = [];              // { id, fraga, av, bild, status, fel, lat, kalla, at }
  var SENAST = {};          // tittare (lowercase) -> tidpunkt för senaste önskning
  var SEDDA = {};           // event-id -> 1, så samma chattrad aldrig blir två önskningar
  var HISTORIK_MS = 30000;  // äldre chattrader än så är historik som spelas upp vid sidladdning

  var STANDARDNAMN = ['Låtönskningar', 'Låtönskningar · YouTube', 'Låtönskningar · Spotify'];
  var arLat = function (w) { return !!w && w.type === TYP; };
  var widgetar = function () { try { return state.widgets.filter(arLat); } catch (e) { return []; } };
  var forsta = function () { return widgetar().filter(function (w) { return !w.hidden; })[0] || null; };
  var iOverlay = function () { try { return document.body.classList.contains('overlay-output') || new URLSearchParams(location.search).has('overlay'); } catch (e) { return false; } };
  var saker = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var sakerUrl = function (u) { u = String(u || ''); return /^(https?:\/\/|assets\/)/i.test(u) ? saker(u) : ''; };
  var nu = function () { return Date.now(); };
  var kalla = function (w) { return (w && w.latKalla) === 'spotify' ? 'spotify' : 'youtube'; };
  var tal = function (v, min, max, forval) { var n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : forval; };
  var installning = function (w) {
    return {
      kommando: String((w && w.latKommando) || '!önska').trim().toLowerCase() || '!önska',
      maxKo: tal(w && w.latMaxKo, 1, 50, 10),
      cooldownMs: tal(w && w.latCooldown, 0, 3600, 60) * 1000,
      maxSek: tal(w && w.latMaxMinuter, 1, 30, 8) * 60,
      visa: tal(w && w.latVisa, 0, 10, 3),
      volym: tal(w && w.latVolym, 0, 100, 70)
    };
  };
  function tid(sek) { sek = Math.max(0, Math.round(sek || 0)); return Math.floor(sek / 60) + ':' + (sek % 60 < 10 ? '0' : '') + (sek % 60); }

  // ---- CHATTEN --------------------------------------------------------------------------------
  // Kommandot plus några vanliga former, så att "!onska" och "!sr" också fungerar.
  function tolka(text, w) {
    var t = String(text || '').trim(), k = installning(w).kommando;
    var former = [k, '!önska', '!onska', '!sr', '!songrequest', '!låt', '!lat'];
    for (var i = 0; i < former.length; i++) {
      var f = former[i];
      if (t.toLowerCase().indexOf(f + ' ') === 0) return { fraga: t.slice(f.length).trim().slice(0, 120) };
    }
    if (/^!(skip|hoppa)\b/i.test(t)) return { skip: true };
    return null;
  }
  function ta(e) {
    if (!e) return false;
    var typ = String(e.type || '').toLowerCase();
    if (typ !== 'chat' && typ !== 'chatcommand' && typ !== 'comment') return false;
    var w = forsta(); if (!w) return false;
    var text = e.comment || e.name || e.message || '';
    var r = tolka(text, w); if (!r) return false;
    var id = String(e.id || e.eventKey || (e.username + ':' + text + ':' + (e.at || ''))), t = nu();
    if (SEDDA[id]) return false;
    SEDDA[id] = 1;
    var at = Number(e.at) || Number(e.timestamp) || t;
    if (at && t - at > HISTORIK_MS) return false;
    if (r.skip) {
      if (e.isModerator || e.__test || e.arVard) hoppaOver();
      return true;
    }
    return lagg({ id: id, fraga: r.fraga, av: String(e.username || e.name || 'tittare'), bild: String(e.profileImage || e.profileUrl || ''), __test: !!e.__test }, w);
  }
  function lagg(o, w) {
    var s = installning(w), vem = o.av.toLowerCase(), t = nu();
    if (!o.fraga || o.fraga.length < 2) return false;
    var aktiva = KO.filter(function (x) { return x.status === 'sokar' || x.status === 'redo' || x.status === 'spelar'; });
    if (!o.__test && SENAST[vem] && t - SENAST[vem] < s.cooldownMs) return false;
    if (aktiva.length >= s.maxKo) return false;
    // Samma låt två gånger: bland de aktiva, och för Spotify bland de skickade senaste tio minuterna.
    if (KO.some(function (x) { return x.fraga.toLowerCase() === o.fraga.toLowerCase() && (aktiva.indexOf(x) >= 0 || (x.status === 'skickad' && t - x.at < 600000)); })) return false;
    SENAST[vem] = t;
    var post = { id: o.id, fraga: o.fraga, av: o.av, bild: o.bild, status: 'sokar', fel: '', lat: null, kalla: kalla(w), at: t };
    KO.push(post);
    if (KO.length > 60) KO.splice(0, KO.length - 60);
    if (post.kalla === 'spotify') spotifyKo(post); else youtubeSok(post, w);
    rita();
    return true;
  }

  // ---- YOUTUBE --------------------------------------------------------------------------------
  function sokUrl(q) {
    var access = ''; try { access = new URLSearchParams(location.search).get('access') || ''; } catch (e) {}
    if (access) return '/api/overlay-access/' + encodeURIComponent(access) + '/musik/youtube?q=' + encodeURIComponent(q);
    var ws = ''; try { ws = root.VyraAuth && root.VyraAuth.lastDetail && root.VyraAuth.lastDetail().workspaces[0].id; } catch (e) {}
    return ws ? '/api/workspaces/' + encodeURIComponent(ws) + '/musik/youtube?q=' + encodeURIComponent(q) : '';
  }
  function youtubeSok(post, w) {
    var url = sokUrl(post.fraga);
    if (!url && !root.VyraLatSok) { post.status = 'fel'; post.fel = 'YouTube kräver molnkontot'; rita(); return; }
    var sok = root.VyraLatSok || function (u) { return fetch(u, { credentials: 'include' }).then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.ok) throw new Error(d.error || 'Sökningen misslyckades'); return d.lat; }); }); };
    Promise.resolve(sok(url, post.fraga)).then(function (lat) {
      if (!lat || !lat.videoId) { post.status = 'fel'; post.fel = 'Hittades inte'; return; }
      if (lat.sekunder && lat.sekunder > installning(w).maxSek) { post.status = 'fel'; post.fel = 'För lång (' + tid(lat.sekunder) + ')'; return; }
      post.lat = lat; post.status = 'redo';
    }).catch(function (err) { post.status = 'fel'; post.fel = String(err && err.message || 'Sökningen misslyckades').slice(0, 80); })
      .then(function () { rita(); spelaNasta(); });
  }

  // Spelaren bor UTANFÖR widgetens DOM: render() bygger om widgeten hela tiden, och en iframe som
  // byggs om startar om låten. Den läggs i stället över widgetens videoplats, varje tick.
  var spelare = null, spelarRuta = null, ytLaddar = false, ytKlar = false, ytKo = [];
  function medYt(fn) {
    if (ytKlar) return fn();
    ytKo.push(fn);
    if (ytLaddar) return;
    ytLaddar = true;
    var forra = root.onYouTubeIframeAPIReady;
    root.onYouTubeIframeAPIReady = function () { ytKlar = true; if (typeof forra === 'function') { try { forra(); } catch (e) {} } ytKo.splice(0).forEach(function (f) { try { f(); } catch (e) {} }); };
    var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    document.head.appendChild(s);
  }
  function spelandeYt() { return KO.filter(function (x) { return x.kalla === 'youtube' && x.status === 'spelar'; })[0] || null; }
  function spelaNasta() {
    if (!iOverlay()) return;                         // studion spelar aldrig upp YouTube
    var w = forsta(); if (!w || kalla(w) !== 'youtube') return;
    if (spelandeYt()) return;
    var nasta = KO.filter(function (x) { return x.kalla === 'youtube' && x.status === 'redo'; })[0];
    if (!nasta) { if (spelarRuta) spelarRuta.style.visibility = 'hidden'; return; }
    nasta.status = 'spelar'; nasta.startad = nu(); rita();
    var spelaVideo = root.VyraLatSpela || function (videoId, volym) {
      medYt(function () {
        if (!spelarRuta) {
          spelarRuta = document.createElement('div'); spelarRuta.className = 'lat-spelare';
          var inre = document.createElement('div'); inre.id = 'latSpelare'; spelarRuta.appendChild(inre);
          document.body.appendChild(spelarRuta);
          spelare = new root.YT.Player('latSpelare', {
            width: '100%', height: '100%', videoId: videoId,
            playerVars: { autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3 },
            events: {
              onReady: function (ev) { ev.target.setVolume(volym); ev.target.playVideo(); },
              onStateChange: function (ev) { if (ev.data === 0) klar(); },
              onError: function () { klar('Kunde inte spelas'); }
            }
          });
        } else { spelare.setVolume(volym); spelare.loadVideoById(videoId); }
        spelarRuta.style.visibility = 'visible';
      });
    };
    spelaVideo(nasta.lat.videoId, installning(w).volym);
  }
  function klar(fel) {
    var p = spelandeYt(); if (!p) return;
    p.status = fel ? 'fel' : 'spelad'; if (fel) p.fel = fel;
    rita(); spelaNasta();
  }
  function hoppaOver() {
    var p = spelandeYt();
    if (p) { try { if (spelare && spelare.stopVideo) spelare.stopVideo(); } catch (e) {} klar(); return; }
    // Spotify bara när widgeten faktiskt spelar via Spotify — annars hade en YouTube-streamers
    // !skip bytt låt i hens privata Spotify.
    if (root.VyraSpotify && !iOverlay() && kalla(forsta()) === 'spotify') { try { root.VyraSpotify.next(); } catch (e) {} }
  }
  root.VyraLatKlar = klar;   // provet (och riggar utan YouTube) kan signalera att en låt tagit slut

  // ---- SPOTIFY --------------------------------------------------------------------------------
  // Bara studion har Spotify-anslutningen, och bara EN flik får lägga låten i kön. navigator.locks
  // gör anspråket atomiskt över flikar; localStorage minns vilka önskningar som redan lagts.
  function spotifyKo(post) {
    if (iOverlay() || !root.VyraSpotify || typeof root.VyraSpotify.queue !== 'function') {
      post.status = 'skickad'; post.fel = ''; post.lat = null; rita(); return;
    }
    var nyckel = 'vyra-lat-spotify-' + post.id;
    var gor = function () {
      try { if (localStorage.getItem(nyckel)) { post.status = 'skickad'; rita(); return Promise.resolve(); } localStorage.setItem(nyckel, String(nu())); } catch (e) {}
      return Promise.resolve(root.VyraSpotify.queue(post.fraga)).then(function (lat) { post.lat = lat; post.status = 'skickad'; })
        .catch(function (err) { post.status = 'fel'; post.fel = String(err && err.message || 'Spotify svarade inte').slice(0, 80); })
        .then(rita);
    };
    try { if (navigator.locks && navigator.locks.request) { navigator.locks.request(nyckel, gor); return; } } catch (e) {}
    gor();
  }

  // ---- RITNING -------------------------------------------------------------------------------
  function html(w) {
    var s = installning(w), k = kalla(w), vald = typeof selected !== 'undefined' && selected === w.id;
    var spelar = k === 'youtube' ? spelandeYt() : null;
    var vantar = k === 'spotify'
      ? KO.filter(function (x) { return x.kalla === 'spotify' && (x.status === 'skickad' || x.status === 'sokar'); }).reverse()
      : KO.filter(function (x) { return x.kalla === 'youtube' && (x.status === 'redo' || x.status === 'sokar'); });
    // Davids val 2026-09-27: kön kan döljas helt, så att widgeten bara visar det som spelas.
    var visa = w.latVisaKo === false ? [] : vantar.slice(0, s.visa);
    var forhand = !KO.length && !iOverlay();
    if (forhand) {
      spelar = k === 'youtube' ? { lat: { titel: 'Önskad låt', kanal: 'Artist', sekunder: 213 }, av: 'Tittare' } : null;
      visa = w.latVisaKo === false ? [] : [{ fraga: 'Nästa låt', av: 'Tittare2', status: 'redo' }, { fraga: 'En till låt', av: 'Tittare3', status: 'redo' }].slice(0, s.visa);
    }
    var rubrik = saker(w.latRubrik || 'LÅTÖNSKNINGAR');
    var tips = 'Skriv <b>' + saker(s.kommando) + ' &lt;låt&gt;</b> i chatten';
    var nuRad = spelar
      ? '<div class="lat-nu"><div class="lat-video"></div><div class="lat-nu-text"><small>NU SPELAS</small><b>' + saker(spelar.lat && spelar.lat.titel || spelar.fraga) + '</b><span>önskad av ' + saker(spelar.av) + '</span></div></div>'
      : (k === 'spotify'
        ? '<div class="lat-nu lat-nu-spotify"><i class="lat-spotify">♫</i><div class="lat-nu-text"><small>SPELAS PÅ SPOTIFY</small><span>' + (visa.length ? 'Senast önskade' : 'Önskningarna läggs i kön') + '</span></div></div>'
        : '');
    var lista = visa.map(function (x, i) {
      var titel = x.lat && (x.lat.titel || '') || x.fraga;
      return '<li><em>' + (i + 1) + '</em><b>' + saker(titel) + '</b><span>' + saker(x.av) + '</span>' + (x.status === 'sokar' ? '<i class="lat-sokar">söker…</i>' : '') + '</li>';
    }).join('');
    return '<div class="widget latonskningar lat-' + k + (spelar ? ' lat-spelar' : '') + (forhand ? ' lat-forhandsvisning' : '') + (vald ? ' selected' : '') + '" data-id="' + saker(w.id) + '"'
      + ' style="left:' + (w.x || 0) + 'px;top:' + (w.y || 0) + 'px;width:' + (w.width || 340) + 'px;--lat:' + saker(w.latFarg || '#ff3b7a') + ';zoom:' + (w.widgetScale || 1) + ';z-index:' + (w.layer || 1) + '">'
      + '<div class="lat-kort"><header><i>🎵</i><b>' + rubrik + '</b><small>' + (k === 'spotify' ? 'Spotify' : 'YouTube') + '</small></header>'
      + nuRad
      + (lista ? '<ol>' + lista + '</ol>' : '')
      + '<footer>' + tips + '</footer></div>'
      + (vald ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  }
  var ritaKoad = false;
  function rita() {
    if (ritaKoad) return; ritaKoad = true;
    (root.requestAnimationFrame || setTimeout)(function () {
      ritaKoad = false;
      widgetar().forEach(function (w) {
        var el = document.querySelector('.widget.latonskningar[data-id="' + w.id + '"]'); if (!el) return;
        var d = document.createElement('div'); d.innerHTML = html(w);
        var f = d.firstElementChild; if (!f) return;
        if (el.innerHTML !== f.innerHTML) el.innerHTML = f.innerHTML;
        if (el.className !== f.className) el.className = f.className;
      });
      placera();
    });
  }
  // Spelaren följer widgetens videoplats (även när duken skalas i OBS).
  function placera() {
    if (!spelarRuta) return;
    var plats = document.querySelector('.widget.latonskningar .lat-video');
    if (!plats || !spelandeYt()) { spelarRuta.style.visibility = 'hidden'; return; }
    var r = plats.getBoundingClientRect();
    spelarRuta.style.cssText = 'position:fixed;z-index:2147483000;pointer-events:none;border-radius:10px;overflow:hidden;visibility:visible;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
  }
  setInterval(placera, 500);

  root.addEventListener('vyra-live-event', function (ev) { ta(ev && ev.detail); });
  try {
    // "Hoppa över" i panelen når en overlay som är öppen i samma webbläsare.
    var kanal = new BroadcastChannel('vyra-latonskningar');
    kanal.onmessage = function (m) { if (m && m.data === 'hoppa') hoppaOver(); if (m && m.data === 'tom') tom(); };
  } catch (e) { kanal = null; }
  function tom() { KO.forEach(function (x) { if (x.status !== 'spelar') x.status = 'spelad'; }); rita(); }

  // ---- RENDERING, PANEL OCH KATALOG (monkeypatch) ---------------------------------------------
  if (typeof wh === 'function') {
    var forraWh = wh;
    wh = function (w) { return arLat(w) ? html(w) : forraWh(w); };
  }
  if (typeof props === 'function') {
    var forraProps = props;
    props = function () {
      var w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
      if (!arLat(w)) return forraProps();
      var s = installning(w), k = kalla(w);
      var sek = function (rubrik, h) { return typeof pgSection === 'function' ? pgSection(rubrik, h, true) : '<div class="property-group"><h4>' + rubrik + '</h4>' + h + '</div>'; };
      var spotifyInfo = k === 'spotify'
        ? '<small id="latSpotifyStatus">Låtarna läggs i din Spotify-kö från studion. Studion måste vara öppen, Spotify anslutet (Extras → Spotify) och Premium krävs.</small>'
        : '<small>Låten spelas i OBS-overlayn och syns i widgeten. Sökningen kräver att YouTube är kopplat på servern.</small>';
      return '<h3>LÅTÖNSKNINGAR</h3><div class="template-badge">LIVE · TITTARNA ÖNSKAR I CHATTEN</div>'
        + '<div hidden><input id="pt" value="' + saker(w.title || '') + '"><input id="pv" value=""></div>'
        + sek('KÄLLA', '<label>Spela via<select id="latKalla"><option value="youtube"' + (k === 'youtube' ? ' selected' : '') + '>YouTube</option><option value="spotify"' + (k === 'spotify' ? ' selected' : '') + '>Spotify</option></select></label>' + spotifyInfo)
        + sek('CHATTEN', '<label>Kommando<input id="latKommando" maxlength="20" value="' + saker(s.kommando) + '"></label>'
          + '<label>Väntetid per tittare (sekunder)<input id="latCooldown" type="number" min="0" max="3600" value="' + (s.cooldownMs / 1000) + '"></label>'
          + '<label>Max antal låtar i kön<input id="latMaxKo" type="number" min="1" max="50" value="' + s.maxKo + '"></label>'
          + '<label>Max längd per låt (minuter)<input id="latMaxMinuter" type="number" min="1" max="30" value="' + (s.maxSek / 60) + '"></label>'
          + '<small>Moderatorer kan skriva !skip för att hoppa över låten som spelas.</small>')
        + sek('UTSEENDE', '<label>Rubrik<input id="latRubrik" maxlength="24" value="' + saker(w.latRubrik || 'LÅTÖNSKNINGAR') + '"></label>'
          + '<label>Färg<input id="latFarg" type="color" value="' + saker(w.latFarg || '#ff3b7a') + '"></label>'
          + '<label class="switch-row">Visa kön i widgeten<input id="latVisaKo" type="checkbox"' + (w.latVisaKo === false ? '' : ' checked') + '><i></i></label>'
          + '<label class="range-label">Visa låtar i kön <b>' + s.visa + '</b><input id="latVisa" type="range" min="0" max="10" value="' + s.visa + '"></label>'
          + '<label class="range-label">Volym (YouTube) <b>' + s.volym + '</b><input id="latVolym" type="range" min="0" max="100" value="' + s.volym + '"></label>')
        + sek('STYR', '<div class="switch-row"><button id="latTesta" type="button">▶ Testa en önskning</button><button id="latHoppa" type="button">⏭ Hoppa över</button><button id="latTom" type="button">Töm kön</button></div>')
        + sek('POSITION & STORLEK', '<div class="property-grid"><label>X<input id="propX" type="number" value="' + (w.x || 0) + '"></label><label>Y<input id="propY" type="number" value="' + (w.y || 0) + '"></label><label>Bredd<input id="propWidth" type="number" value="' + (w.width || 340) + '"></label><label>Lager<input id="propLayer" type="number" value="' + (w.layer || 1) + '"></label></div>')
        + '<button class="delete" id="del">Ta bort</button>';
    };
  }
  if (typeof bind === 'function') {
    var forraBind = bind;
    bind = function () {
      forraBind.apply(this, arguments);
      try { bindPanel(); bindKatalog(); } catch (e) {}
      placera();
    };
  }
  function bindPanel() {
    if (typeof view === 'undefined' || view !== 'editor') return;
    var w = typeof liveWidget === 'function' ? liveWidget(selected) : null; if (!arLat(w)) return;
    var q = function (s) { return document.querySelector('.properties ' + s) || document.querySelector(s); };
    var spara = function (omrita) { if (typeof save === 'function') save(); if (omrita !== false) { if (typeof render === 'function') render(); if (typeof bind === 'function') bind(); } };
    var el;
    // Namnet i lagerlistan (och i Live-lager) är widgetens titel. Den följer källan så länge den är
    // ett standardnamn — en titel streamern skrivit själv rörs aldrig.
    if ((el = q('#latKalla'))) el.onchange = function (e) {
      w.latKalla = e.target.value === 'spotify' ? 'spotify' : 'youtube';
      if (!w.title || STANDARDNAMN.indexOf(w.title) >= 0) w.title = w.latKalla === 'spotify' ? 'Låtönskningar · Spotify' : 'Låtönskningar · YouTube';
      spara();
    };
    if ((el = q('#latKommando'))) el.onchange = function (e) { var v = String(e.target.value || '').trim().toLowerCase(); w.latKommando = /^!\S{1,19}$/.test(v) ? v : '!önska'; spara(); };
    [['#latCooldown', 'latCooldown'], ['#latMaxKo', 'latMaxKo'], ['#latMaxMinuter', 'latMaxMinuter']].forEach(function (p) {
      var f = q(p[0]); if (f) f.onchange = function (e) { w[p[1]] = Number(e.target.value); spara(false); };
    });
    if ((el = q('#latVisaKo'))) el.onchange = function (e) { w.latVisaKo = e.target.checked; spara(); };
    if ((el = q('#latRubrik'))) el.onchange = function (e) { w.latRubrik = String(e.target.value || '').slice(0, 24); spara(); };
    if ((el = q('#latFarg'))) el.onchange = function (e) { w.latFarg = e.target.value; spara(); };
    [['#latVisa', 'latVisa'], ['#latVolym', 'latVolym']].forEach(function (p) {
      var f = q(p[0]); if (f) f.oninput = function (e) { w[p[1]] = Number(e.target.value); var b = e.target.parentElement.querySelector('b'); if (b) b.textContent = e.target.value; if (typeof save === 'function') save(); rita(); };
    });
    if ((el = q('#latTesta'))) el.onclick = function () { ta({ type: 'chatcommand', id: 'test-' + nu(), username: 'Testtittare', comment: installning(w).kommando + ' Never Gonna Give You Up', at: nu(), __test: true }); };
    if ((el = q('#latHoppa'))) el.onclick = function () { hoppaOver(); if (kanal) kanal.postMessage('hoppa'); };
    if ((el = q('#latTom'))) el.onclick = function () { tom(); if (kanal) kanal.postMessage('tom'); };
  }
  function bindKatalog() {
    if (typeof view === 'undefined' || (view !== 'editor' && view !== 'overlay')) return;
    var katalog = document.querySelector('.widget-catalog');
    if (!katalog || katalog.querySelector('[data-latonskningar]')) return;
    var sektion = document.createElement('section');
    sektion.dataset.latonskningar = '1';
    sektion.innerHTML = '<h4>LÅTÖNSKNINGAR · LIVE</h4>';
    [['catalog:latonskningar:youtube', 'Låtönskningar · YouTube', '!önska i chatten · spelas i OBS'],
      ['catalog:latonskningar:spotify', 'Låtönskningar · Spotify', '!önska i chatten · läggs i din Spotify-kö']].forEach(function (n) {
      var knapp = document.createElement('button');
      knapp.type = 'button'; knapp.dataset.catalogKey = n[0];
      knapp.innerHTML = '<i>🎵</i><span><b>' + n[1] + '</b><small>' + n[2] + '</small></span>';
      knapp.onclick = function () {
        var w = root.VyraWidgets.create(n[0]);
        state.widgets.push(w); selected = w.id; if (typeof save === 'function') save(); if (typeof render === 'function') render();
        if (typeof toast === 'function') toast(n[1] + ' skapad');
      };
      sektion.appendChild(knapp);
    });
    katalog.appendChild(sektion);
  }

  // ---- STIL ----------------------------------------------------------------------------------
  if (!document.getElementById('lat-stil')) {
    var st = document.createElement('style'); st.id = 'lat-stil';
    st.textContent = [
      '.latonskningar{position:absolute;color:#fff;background:transparent}',
      '.latonskningar .lat-kort{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:18px;background:linear-gradient(160deg,#150b1ae8,#0b0712e0);border:1.5px solid color-mix(in srgb,var(--lat),transparent 40%);box-shadow:0 0 22px color-mix(in srgb,var(--lat),transparent 70%),0 10px 24px #0009}',
      '.latonskningar header{display:flex;align-items:center;gap:8px}',
      '.latonskningar header i{font-style:normal;font-size:18px}',
      '.latonskningar header b{font-size:13px;letter-spacing:.18em;font-weight:900;color:var(--lat);flex:1}',
      '.latonskningar header small{font-size:10px;letter-spacing:.08em;opacity:.6;text-transform:uppercase}',
      '.latonskningar .lat-nu{display:flex;gap:10px;align-items:center}',
      '.latonskningar .lat-video{width:128px;height:72px;flex:none;border-radius:10px;background:#000 linear-gradient(135deg,color-mix(in srgb,var(--lat),#000 60%),#000);box-shadow:inset 0 0 0 1px #ffffff22}',
      '.latonskningar .lat-nu-text{display:flex;flex-direction:column;min-width:0}',
      '.latonskningar .lat-nu-text small{font-size:9px;letter-spacing:.2em;font-weight:800;color:var(--lat)}',
      '.latonskningar .lat-nu-text b{font-size:15px;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.latonskningar .lat-nu-text span{font-size:11px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.latonskningar .lat-spotify{font-style:normal;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#1db954;color:#000;font-size:20px;font-weight:900;flex:none}',
      '.latonskningar ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}',
      '.latonskningar li{display:flex;align-items:center;gap:8px;font-size:12px;padding:5px 8px;border-radius:9px;background:#ffffff0d}',
      '.latonskningar li em{font-style:normal;font-weight:900;color:var(--lat);width:14px;text-align:center}',
      '.latonskningar li b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700}',
      '.latonskningar li span{opacity:.6;font-size:11px;white-space:nowrap;max-width:34%;overflow:hidden;text-overflow:ellipsis}',
      '.latonskningar .lat-sokar{font-style:normal;font-size:10px;opacity:.6}',
      '.latonskningar footer{font-size:11px;opacity:.8;text-align:center}',
      '.latonskningar footer b,.latonskningar header b,.latonskningar li b{display:inline}',
      '.latonskningar footer b{color:var(--lat)}',
      '.lat-spelare{position:fixed;left:-9999px;top:0;width:128px;height:72px;visibility:hidden}'
    ].join('');
    document.head.appendChild(st);
  }

  // ---- YOUTUBE-SIDAN I MENYN (Media → YouTube) ----------------------------------------------
  // Samma form som Spotify-sidan (extras.js): status för kopplingen och en genväg till widgeten.
  // Statusen läses från servern (/api/musik/status) — den säger om YOUTUBE_API_KEY fungerar, aldrig
  // nyckeln själv.
  function youtubeSida() {
    var knapp = document.querySelector('[data-extra="youtube"]');
    if (!knapp || !knapp.classList.contains('active')) return;
    var vy = document.querySelector('#view'), titel = document.querySelector('#title');
    if (!vy) return;
    if (titel) titel.textContent = 'YouTube';
    vy.innerHTML = '<div class="page-header section-head"><div><h2>YouTube</h2><p>Låtönskningar via YouTube: tittarna skriver !önska &lt;låt&gt; i chatten och låten spelas i OBS-overlayn.</p></div></div>'
      + '<article class="card spotify-card youtube-card"><div class="spotify-connect"><i class="yt-ikon">▶</i><span><b>YouTube</b><small id="ytStatus">Kontrollerar kopplingen…</small></span><button id="ytLaggTill" type="button">＋ Lägg till Låtönskningar · YouTube</button></div>'
      + '<h3>Så fungerar det</h3><div class="music-rules">'
      + '<article><b>!önska &lt;låt&gt;</b><small>Tittaren önskar en låt i chatten — även !sr fungerar</small></article>'
      + '<article><b>Spelas i OBS</b><small>Låten spelas i overlayn och syns i widgeten, en i taget</small></article>'
      + '<article><b>!skip</b><small>Moderatorer hoppar över låten som spelas</small></article>'
      + '</div><p class="yt-not">Kvoten från Google räcker till ungefär 100 nya låtsökningar per dygn. En låt som redan önskats kostar ingenting.</p></article>';
    var status = vy.querySelector('#ytStatus');
    fetch('/api/musik/status', { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (d) {
      if (!status) return;
      status.textContent = d && d.youtube === 'fungerar' ? 'Kopplad — YouTube-nyckeln fungerar' : (d && d.text) || 'Kunde inte läsa statusen';
      status.dataset.ytStatus = (d && d.youtube) || 'fel';
    }).catch(function () { if (status) { status.textContent = 'Servern svarade inte — YouTube kräver molnkontot'; status.dataset.ytStatus = 'fel'; } });
    var lagg = vy.querySelector('#ytLaggTill');
    if (lagg) lagg.onclick = function () {
      try {
        var w = root.VyraWidgets.create('catalog:latonskningar:youtube');
        state.widgets.push(w); selected = w.id; if (typeof save === 'function') save();
        if (typeof go === 'function') go('editor'); else if (typeof render === 'function') render();
        if (typeof toast === 'function') toast('Låtönskningar · YouTube skapad');
      } catch (e) { if (typeof toast === 'function') toast('Widgeten kunde inte skapas'); }
    };
  }
  // Efter extras.js egen klickhanterare (den skriver titeln och tömmer valet), därav setTimeout.
  document.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('[data-extra="youtube"]')) setTimeout(youtubeSida, 0); }, true);
  if (!document.getElementById('yt-sida-stil')) {
    var ys = document.createElement('style'); ys.id = 'yt-sida-stil';
    ys.textContent = '.youtube-card .yt-ikon{font-style:normal;background:#ff0033!important;color:#fff!important}.youtube-card .yt-not{font-size:12px;opacity:.7;margin:12px 0 0}.youtube-card .music-rules b{display:block;margin-bottom:4px}';
    document.head.appendChild(ys);
  }

  root.VyraLatonskningar = {
    ta: ta, tolka: tolka, ko: function () { return KO.map(function (x) { return { fraga: x.fraga, av: x.av, status: x.status, fel: x.fel, kalla: x.kalla, titel: x.lat && x.lat.titel || '' }; }); },
    hoppaOver: hoppaOver, tom: tom, klar: klar, rensa: function () { KO.length = 0; Object.keys(SENAST).forEach(function (k) { delete SENAST[k]; }); Object.keys(SEDDA).forEach(function (k) { delete SEDDA[k]; }); rita(); }
  };
  if (typeof render === 'function' && typeof view !== 'undefined') { try { render(); bind(); } catch (e) {} }
})(typeof window !== 'undefined' ? window : globalThis);
