// LIKE FOUNTAIN · PORTAL — hjärtan som stiger ur en portal NÄR TITTARNA TAPPAR.
//
// Davids mål 2026-09-26: "När folk börjar tappa på skärmen så stiger hjärtan upp — den ska inte
// spela upp som video", och "den ska funka som Top Like". Designen togs fram i Figma (VYRA · Like
// Fountain, "6 · Mål-looken (sparad)"): glashjärtan i V-form ur en glödande portal, en ljusstråle
// och en glitterström i mitten, och en milstolpe där hjärtana samlas till ett stort hjärta som
// poppar.
//
// KÄLLAN ÄR SAMMA SOM TOP LIKES. Likes kommer redan hela vägen TikTok -> bryggan -> servern ->
// live-client.js, som skickar `vyra-live-event` för varje paket (live-client.js ingest()). Top Like
// lyssnar på den (live-leaderboard.js:380), och det gör den här också. Den gamla fontänen gjorde
// det inte: den rörde sig bara om streamern själv byggt en Action + Event för likes.
//
// ETT PAKET, INTE ETT TAPP. TikTok skickar "Sara tappade 12 gånger" som ETT event med `count`
// (tiktok-bridge/normalizer.js likeFields). Ett paket ger därför en skur: fler hjärtan ju fler
// tappar, med ett tak, och en kö som släpper högst ~12 i sekunden så att en våg blir en ström.
//
// HISTORIKEN FÅR INTE SPRUTA. live-leaderboard.js hämtar /api/events vid sidladdning och skickar
// dem genom samma ingest(), alltså genom samma `vyra-live-event`. Ett event äldre än FARSKT_MS
// (serverns `at`) är historik och ignoreras här — annars sprutade varje omladdning hela kvällens
// likes på en gång.
//
// INGA HJÄRTAN PÅ VARANDRA. Hjärtana landar på PLATSER som räknats ut i förväg utan överlapp (V:et,
// nerifrån och upp), och en plats är upptagen tills hjärtat tonat bort. Är alla platser tagna
// väntar hjärtat i kön.
//
// STUDION OCH OBS: samma sida i två lägen. I studion visas en fast förhandsbild när ingen tappar,
// så streamern ser vad widgeten är. I overlay-utgången är den genomskinlig tills någon tappar.
// Förhandsbilden är inline-SVG och byggs av samma platser och samma frö varje gång — pixelvakten
// (tests/visual) fotograferar den via VyraLikePortal.stilla(), se REGI i tests/helpers/katalognycklar.js.
(function (root) {
  'use strict';

  var BAS_B = 432, BAS_H = 768;                 // designens rum; ritas skalat till widgetens box
  var SPETS = 690, TOPP = 40, CX = 216;          // V:et
  var PLATSER = 88, MARG = 6;
  var FARSKT_MS = 15000;
  var FLYG = 1.0, STANNA = 3.2, TONA = 1.3;      // sekunder: ut i V:et, sväva, tona bort uppåt
  var HJARTA_CX = 216, HJARTA_CY = 250, HJARTA_S = 10.5;

  var PALETTER = {
    portal: ['#ff4fa3', '#a45cff', '#ff3cd0', '#ffb347', '#4d8dff', '#ff5a7a', '#c86bff'],
    rainbow: ['#ff2f7d', '#ff9d21', '#ffe52b', '#3cff8d', '#35d7ff', '#8957ff'],
    neon: ['#ff38ca', '#8c45ff', '#22e5ff', '#ffffff'],
    fire: ['#ff2d2d', '#ff6b18', '#ffc928', '#fff1a8'],
    ice: ['#24cfff', '#82eeff', '#d9fbff', '#789cff'],
    gold: ['#ff9d16', '#ffc928', '#fff0a3', '#ffffff'],
    aurora: ['#4fd8c4', '#7fe7ff', '#a78bff', '#ffffff'],
    pastel: ['#ffb3d1', '#c9b3ff', '#b3e0ff', '#b3ffd9'],
    mono: ['#ffffff', '#d8d8e0', '#a0a0ac', '#e8e8f0']
  };
  var PALETTNAMN = { portal: 'Portal · rosa & lila', rainbow: 'Rainbow', neon: 'Neon', fire: 'Fire', ice: 'Ice',
    gold: 'Gold', aurora: 'Aurora', pastel: 'Pastel', mono: 'Mono', custom: 'Egna färger' };
  var RINGAR = ['#b36bff', '#ffb347', '#ff4fa3', '#4d8dff', '#ff7ae0'];

  // ---- REN RÄKNING (provas utan DOM, tests/like-fountain-portal.test.js) ----------------------
  function slump(frö) {
    var s = frö % 2147483647; if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  // Platserna i V:et: raka kanter från spetsen, tre av fyra längs armarna så att formen syns, och
  // ingen plats närmare en annan än summan av radierna plus MARG. Sorterade nerifrån och upp.
  function platser(frö) {
    var rnd = slump(frö || 47), ut = [];
    for (var i = 0; i < PLATSER; i++) {
      var storlek = (i % 9 === 0 ? 0.62 : 0.25 + rnd() * 0.35) * 48, r = storlek / 2, ok = false, x = 0, y = 0;
      for (var k = 0; k < 900 && !ok; k++) {
        var t = i < 58 ? 0.06 + rnd() * 0.94 : 0.6 + rnd() * 0.4;
        y = SPETS - (SPETS - TOPP) * t;
        var halv = 10 + 205 * t, inne = rnd() < 0.75 ? 0.62 + rnd() * 0.38 : rnd() * 0.6;
        x = CX + ((i + k) % 2 ? 1 : -1) * halv * inne;
        if (x - r < 4 || x + r > BAS_B - 4 || y - r < 4) continue;
        ok = ut.every(function (p) { return Math.hypot(p.x - x, p.y - y) > p.r + r + MARG; });
      }
      if (ok) ut.push({ x: x, y: y, r: r, s: storlek, farg: i });
    }
    return ut.sort(function (a, b) { return b.y - a.y; });
  }

  // Det stora hjärtat: 46 på konturen, resten inuti. Ett mål per plats i formationen.
  function hjartform(antal, frö) {
    var rnd = slump(frö || 71), mal = [], kontur = Math.min(46, antal);
    var kurva = function (t) {
      return { x: HJARTA_CX + HJARTA_S * 16 * Math.pow(Math.sin(t), 3),
        y: HJARTA_CY - HJARTA_S * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) };
    };
    var inne = function (x, y) {
      var X = (x - HJARTA_CX) / (HJARTA_S * 16) * 1.15, Y = -(y - HJARTA_CY) / (HJARTA_S * 16) * 1.15 + 0.1;
      return Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y <= 0;
    };
    for (var i = 0; i < kontur; i++) { var p = kurva(i / kontur * Math.PI * 2); mal.push({ x: p.x, y: p.y, r: 10 }); }
    for (var k = 0; k < 4000 && mal.length < antal; k++) {
      var x = HJARTA_CX + (rnd() * 2 - 1) * HJARTA_S * 15, y = HJARTA_CY + (rnd() * 2 - 1) * HJARTA_S * 15;
      if (inne(x, y) && mal.every(function (q) { return Math.hypot(q.x - x, q.y - y) > q.r + 10 + 3; })) mal.push({ x: x, y: y, r: 10 });
    }
    return { mal: mal, kurva: kurva };
  }

  // Ett paket likes -> hur många hjärtan. Taket gör att en tittare som spammar 15 ger en skur,
  // inte en klump som tar alla platser.
  function hjartanFor(antalTappar, tak) {
    var n = Math.max(1, Math.floor(Number(antalTappar) || 1));
    var max = Math.max(1, Math.min(15, Number(tak) || 6));
    return Math.min(max, Math.ceil(Math.sqrt(n) * 1.6));
  }

  // Är det här ett like-paket som ska ge hjärtan just nu? Historik och andra eventtyper nej.
  function arFarskLike(e, nu) {
    if (!e) return false;
    var typ = String(e.type || e.event || '').toLowerCase();
    if (typ !== 'like' && typ !== 'likes') return false;
    var at = Number(e.at || e.timestamp && Date.parse(e.timestamp));
    if (Number.isFinite(at) && at > 0 && (nu || Date.now()) - at > FARSKT_MS) return false;
    return true;
  }

  var ARIT = { platser: platser, hjartform: hjartform, hjartanFor: hjartanFor, arFarskLike: arFarskLike,
    PALETTER: PALETTER, PLATSER: PLATSER, FARSKT_MS: FARSKT_MS, BAS_B: BAS_B, BAS_H: BAS_H };
  if (typeof module === 'object' && module.exports) { module.exports = ARIT; return; }

  // ---- WEBBLÄSAREN -------------------------------------------------------------------------------
  var PLATS = platser(47), FORM = hjartform(72, 71);
  var arPortal = function (w) { return !!w && w.type === 'templateLikeFountain' && w.fountainDesign === 'portal'; };
  var iOverlay = function () { try { return document.documentElement.classList.contains('overlay-output') || /[?&]overlay=/.test(location.search); } catch (e) { return false; } };
  var farger = function (w) {
    if (w.fountainPalette === 'custom') return (w.fountainCustomPalette && w.fountainCustomPalette.length ? w.fountainCustomPalette : [w.fountainColor || '#ff3c88', w.fountainColor2 || '#b94cff', '#ff86bd']);
    return PALETTER[w.fountainPalette] || PALETTER.portal;
  };
  var hexRgb = function (h) { h = String(h || '#ffffff').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]; };
  var blanda = function (h, m, t) { var a = hexRgb(h), b = hexRgb(m); return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }).join(',') + ')'; };
  var saker = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };

  // ---- FÖRHANDSBILDEN (SVG, deterministisk) -----------------------------------------------------
  var HJARTSTIG = 'M12 21.5S1.5 15.2 1.5 7.6C1.5 4 4.1 1.3 7.4 1.3c2 0 3.6 1 4.6 2.6 1-1.6 2.6-2.6 4.6-2.6 3.3 0 5.9 2.7 5.9 6.3 0 7.6-10.5 13.9-10.5 13.9z';
  function stillSvg(w) {
    var id = String(w.id).replace(/[^a-zA-Z0-9]/g, ''), f = farger(w), defs = '', kropp = '';
    f.forEach(function (c, i) {
      defs += '<linearGradient id="lfpg' + id + i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + blanda(c, '#ffffff', 0.7) + '"/><stop offset=".45" stop-color="' + saker(c) + '"/><stop offset="1" stop-color="' + blanda(c, '#000000', 0.45) + '"/></linearGradient>';
    });
    defs += '<radialGradient id="lfph' + id + '"><stop offset="0" stop-color="#ff4fd8" stop-opacity=".7"/><stop offset="1" stop-color="#7a1cff" stop-opacity="0"/></radialGradient>'
      + '<linearGradient id="lfps' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7ae0" stop-opacity="0"/><stop offset=".8" stop-color="#ffd6f5" stop-opacity=".8"/><stop offset="1" stop-color="#fff"/></linearGradient>'
      + '<filter id="lfpf' + id + '" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    kropp += '<ellipse cx="216" cy="718" rx="95" ry="24" fill="url(#lfph' + id + ')"/>'
      + '<ellipse cx="216" cy="722" rx="65" ry="11" fill="none" stroke="#ff7ae0" stroke-width="2" filter="url(#lfpf' + id + ')"/>';
    for (var s = 0; s < 7; s++) { var h = 180 + s * 45; kropp += '<rect x="' + (216 + (s - 3) * 3.2 - 1.2).toFixed(1) + '" y="' + (722 - h) + '" width="2.4" height="' + h + '" rx="1.2" fill="url(#lfps' + id + ')" opacity=".55"/>'; }
    var rnd = slump(97);
    for (var g = 0; g < 90; g++) { var u = Math.pow(rnd(), 1.3), gy = 700 - 640 * u, gx = 216 + (rnd() + rnd() + rnd() - 1.5) / 1.5 * (6 + 140 * u); kropp += '<circle cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="' + (0.7 + rnd() * 1.4).toFixed(2) + '" fill="' + ['#ffb3ea', '#ff4fd8', '#c9a0ff', '#ffffff', '#ffb347'][g % 5] + '" opacity="' + (0.4 + (1 - u) * 0.5).toFixed(2) + '"/>'; }
    PLATS.slice(0, 64).forEach(function (p, i) {
      var k = p.s / 24, c = i % f.length;
      kropp += '<g transform="translate(' + (p.x - p.s / 2).toFixed(1) + ' ' + (p.y - p.s * 0.48).toFixed(1) + ') scale(' + k.toFixed(3) + ')" filter="url(#lfpf' + id + ')">'
        + '<path d="' + HJARTSTIG + '" fill="url(#lfpg' + id + c + ')" stroke="rgba(255,255,255,.55)" stroke-width=".5"/>'
        + '<ellipse cx="7.5" cy="6" rx="2.6" ry="1.5" transform="rotate(-28 7.5 6)" fill="#fff" opacity=".75"/></g>';
    });
    return '<svg class="lfp-still" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" viewBox="0 0 ' + BAS_B + ' ' + BAS_H + '" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><defs>' + defs + '</defs>' + kropp + '</svg>';
  }

  // ---- LIVE-TILLSTÅND, per widget ---------------------------------------------------------------
  // Utanför DOM:en med flit: render() byter ut widgetens noder hela tiden, och en fontän mitt i en
  // skur ska inte börja om för att någon flyttade en annan widget.
  var TILL = {};
  function till(id) {
    return TILL[id] || (TILL[id] = { hj: [], bubblor: [], glitter: [], ko: 0, koBubblor: [], tempo: 0, sedan: 0,
      likesSedanPop: 0, form: null, senast: {}, aktiv: false });
  }
  var BILDER = {};
  function bild(src) {
    if (!src) return null;
    if (BILDER[src]) return BILDER[src];
    var im = new Image(); im.decoding = 'async'; im.referrerPolicy = 'no-referrer'; im.src = src; BILDER[src] = im;
    var nycklar = Object.keys(BILDER); if (nycklar.length > 60) delete BILDER[nycklar[0]];
    return im;
  }
  var sakerSrc = function (s) { try { return root.VyraSafe && root.VyraSafe.src ? root.VyraSafe.src(s) : (/^(https?:|data:image\/|assets\/)/.test(String(s)) ? String(s) : ''); } catch (e) { return ''; } };

  function widgetar() { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets.filter(arPortal) : []; } catch (e) { return []; } }

  function tappa(w, antal, e) {
    var t = till(w.id), nu = performance.now() / 1000;
    t.ko += hjartanFor(antal, w.fountainPerLike);
    t.tempo = Math.min(1, t.tempo + 0.12 * Math.min(Number(antal) || 1, 5));
    t.sedan = nu; t.aktiv = true;
    t.likesSedanPop += Math.max(1, Number(antal) || 1);
    for (var i = 0; i < 6 + Math.min(12, antal || 1); i++) t.glitter.push(nyGlitter(216 + (Math.random() - 0.5) * 10, 712, (Math.random() - 0.5) * 40, -(120 + Math.random() * 260), 1));
    var namn = e && (e.username || e.uniqueId || e.name), pic = e && sakerSrc(e.profileImage || e.profileUrl || e.avatar);
    if (w.fountainAvatarHearts !== false && pic && namn && !(t.senast[namn] > nu - 2.5)) { t.senast[namn] = nu; t.koBubblor.push(pic); if (t.koBubblor.length > 6) t.koBubblor.shift(); }
    var varje = Number(w.fountainPopEvery);
    if (!Number.isFinite(varje)) varje = 1000;
    if (varje > 0 && t.likesSedanPop >= varje && !t.form) { t.likesSedanPop = 0; t.form = { start: nu, hj: [] }; }
    starta();
  }
  function nyGlitter(x, y, vx, vy, liv) { return { x: x, y: y, vx: vx, vy: vy, liv: liv, c: ['#ffb3ea', '#ff4fd8', '#c9a0ff', '#ffffff', '#ffb347', '#7fb2ff'][Math.floor(Math.random() * 6)], sz: 0.8 + Math.random() * 1.8 }; }

  function ledigPlats(t, minR) {
    var tagna = {};
    t.hj.forEach(function (h) { tagna[h.p] = 1; }); t.bubblor.forEach(function (b) { tagna[b.p] = 1; });
    var fria = [];
    for (var i = 0; i < PLATS.length; i++) if (!tagna[i] && PLATS[i].r >= (minR || 0)) fria.push(i);
    if (!fria.length) return -1;
    // nedre halvan först när fontänen är tom, så V:et fylls underifrån
    var vikt = fria.slice(0, Math.max(1, Math.ceil(fria.length * 0.6)));
    return vikt[Math.floor(Math.random() * vikt.length)];
  }

  // ---- RITNINGEN (canvas, sprites med inbakad glöd) --------------------------------------------
  var SPRITES = {};
  function sprite(c) {
    if (SPRITES[c]) return SPRITES[c];
    var s = 96, cv = document.createElement('canvas'); cv.width = cv.height = s; var x = cv.getContext('2d');
    x.translate(s / 2, s / 2); x.scale(2.2, 2.2); x.translate(-12, -11.5);
    var p = new Path2D(HJARTSTIG), g = x.createLinearGradient(0, 1, 0, 21.5);
    g.addColorStop(0, blanda(c, '#ffffff', 0.7)); g.addColorStop(0.45, c); g.addColorStop(1, blanda(c, '#000000', 0.45));
    x.shadowColor = c; x.shadowBlur = 9; x.fillStyle = g; x.fill(p); x.shadowBlur = 0;
    x.lineWidth = 0.45; x.strokeStyle = 'rgba(255,255,255,.55)'; x.stroke(p);
    x.globalAlpha = 0.75; x.fillStyle = '#fff'; x.beginPath(); x.ellipse(7.5, 6, 2.6, 1.5, -0.5, 0, 6.28); x.fill();
    return (SPRITES[c] = cv);
  }
  var ease = function (t) { return t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3); };
  var io = function (t) { return t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  function steg(w, t, nu, dt) {
    var f = farger(w);
    // kön: högst ~12 hjärtan i sekunden, och bara till lediga platser
    t.utslapp = (t.utslapp || 0) + dt;
    while (t.ko > 0 && t.utslapp > 0.085 && !t.form) {
      var p = ledigPlats(t); if (p < 0) break;
      t.ko--; t.utslapp = 0; t.hj.push({ p: p, start: nu, farg: f[(PLATS[p].farg) % f.length], wob: Math.random() * 6.28 });
    }
    if (t.ko > 40) t.ko = 40;
    if (t.koBubblor.length && !t.form) { var pb = ledigPlats(t, 11); if (pb >= 0) t.bubblor.push({ p: pb, start: nu, src: t.koBubblor.shift(), ring: RINGAR[Math.floor(Math.random() * RINGAR.length)] }); }
    var liv = FLYG + STANNA + TONA;
    t.hj = t.hj.filter(function (h) { return nu - h.start < liv; });
    t.bubblor = t.bubblor.filter(function (b) { return nu - b.start < liv + 0.8; });
    t.tempo = Math.max(0, t.tempo - dt * 0.3);
    t.glitter.forEach(function (g) { g.x += g.vx * dt; g.y += g.vy * dt; g.vy += 40 * dt; g.liv -= dt * 0.7; });
    t.glitter = t.glitter.filter(function (g) { return g.liv > 0; });
    if (t.tempo > 0.05 && Math.random() < t.tempo * 0.9) t.glitter.push(nyGlitter(216 + (Math.random() - 0.5) * 8, 712, (Math.random() - 0.5) * 30, -(160 + Math.random() * 280), 1));
    // milstolpen: hjärtan flyger ur portalen in i det stora hjärtat, det poppar, allt tonar ut
    if (t.form) {
      var ft = nu - t.form.start;
      while (t.form.hj.length < FORM.mal.length && t.form.hj.length < ft * 70) { var i = t.form.hj.length; t.form.hj.push({ i: i, start: t.form.start + i / 70, farg: f[i % f.length] }); }
      if (!t.form.pop && ft > FORM.mal.length / 70 + 1.2) {
        t.form.pop = nu;
        for (var k = 0; k < 140; k++) { var q = FORM.kurva(Math.random() * 6.28); t.glitter.push(nyGlitter(q.x, q.y, (q.x - HJARTA_CX) * (1 + Math.random() * 1.5), (q.y - HJARTA_CY) * (1 + Math.random() * 1.5) - 30, 1.4)); }
      }
      if (t.form.pop && nu - t.form.pop > 2.2) t.form = null;
    }
    t.aktiv = !!(t.hj.length || t.bubblor.length || t.glitter.length || t.ko > 0 || t.form || t.tempo > 0.02);
  }

  function rita(w, t, cv, nu) {
    var box = cv.parentElement; if (!box) return;
    var W = box.offsetWidth || 1, H = box.offsetHeight || 1, dpr = Math.min(2, root.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
    box.classList.toggle('lfp-live', t.aktiv);
    var still = box.querySelector('.lfp-still'); if (still) still.style.opacity = t.aktiv ? '0' : '';
    if (!t.aktiv) return;
    // designens rum -> boxen: bredden styr, nederkanten ligger kvar i botten (portalen)
    var k = W / BAS_B; x.setTransform(k * dpr, 0, 0, k * dpr, 0, (H - BAS_H * k) * dpr);
    var styrka = Math.max(t.tempo, t.form ? 0.25 : 0);
    var hal = x.createRadialGradient(216, 718, 0, 216, 718, 90); hal.addColorStop(0, 'rgba(255,79,216,' + (0.25 + styrka * 0.5) + ')'); hal.addColorStop(1, 'rgba(122,28,255,0)');
    x.fillStyle = hal; x.beginPath(); x.ellipse(216, 718, 95, 24, 0, 0, 6.28); x.fill();
    x.globalAlpha = 0.5 + styrka * 0.5; x.shadowColor = '#ff4fd8'; x.shadowBlur = 12; x.strokeStyle = '#ff7ae0'; x.lineWidth = 2; x.beginPath(); x.ellipse(216, 722, 65, 11, 0, 0, 6.28); x.stroke(); x.shadowBlur = 0;
    for (var s = 0; s < 7; s++) {
      var h = (120 + s * 55) * t.tempo; if (h < 2) continue;
      var g = x.createLinearGradient(0, 722 - h, 0, 722); g.addColorStop(0, 'rgba(255,122,224,0)'); g.addColorStop(0.8, 'rgba(255,190,240,.75)'); g.addColorStop(1, '#fff');
      x.globalAlpha = 0.55; x.fillStyle = g; x.fillRect(216 + (s - 3) * 3.2 - 1.2, 722 - h, 2.4, h);
    }
    t.glitter.forEach(function (g) { x.globalAlpha = Math.max(0, Math.min(1, g.liv)); x.fillStyle = g.c; x.beginPath(); x.arc(g.x, g.y, g.sz, 0, 6.28); x.fill(); });
    var liv = FLYG + STANNA;
    t.hj.forEach(function (h) {
      var P = PLATS[h.p], a = nu - h.start, u = ease(a / FLYG);
      var px = CX + (P.x - CX) * u + Math.sin(nu * 1.6 + h.wob) * 2 * u, py = SPETS + (P.y - SPETS) * u + Math.cos(nu * 1.3 + h.wob) * 2 * u;
      var alfa = Math.min(1, u * 1.6), sz = P.s * (0.4 + 0.6 * u);
      if (a > liv) { var b = (a - liv) / TONA; py -= b * 60; alfa *= Math.max(0, 1 - b); }
      if (t.form) alfa *= Math.max(0, 1 - (nu - t.form.start) / 0.6);
      if (alfa <= 0.01) return;
      x.globalAlpha = alfa; x.drawImage(sprite(h.farg), px - sz, py - sz, sz * 2, sz * 2);
    });
    t.bubblor.forEach(function (b) {
      var P = PLATS[b.p], a = nu - b.start, u = ease(a / FLYG), r = 15;
      var px = CX + (P.x - CX) * u, py = SPETS + (P.y - SPETS) * u, alfa = Math.min(1, u * 1.6);
      if (a > liv + 0.8) return; if (a > liv) { var bb = (a - liv) / (TONA + 0.8); py -= bb * 60; alfa *= Math.max(0, 1 - bb); }
      if (t.form) alfa *= Math.max(0, 1 - (nu - t.form.start) / 0.6);
      x.globalAlpha = alfa; x.save(); x.shadowColor = b.ring; x.shadowBlur = 12; x.strokeStyle = b.ring; x.lineWidth = 2.5; x.beginPath(); x.arc(px, py, r, 0, 6.28); x.stroke(); x.shadowBlur = 0;
      x.beginPath(); x.arc(px, py, r - 2, 0, 6.28); x.clip(); var im = bild(b.src);
      if (im && im.complete && im.naturalWidth) x.drawImage(im, px - r + 2, py - r + 2, (r - 2) * 2, (r - 2) * 2); else { x.fillStyle = '#d9c6e8'; x.fill(); }
      x.restore();
    });
    if (t.form) {
      var ft = nu - t.form.start, pop = t.form.pop ? nu - t.form.pop : -1;
      var sk = pop >= 0 && pop < 0.45 ? 1 + 0.14 * Math.sin(pop / 0.45 * Math.PI) : 1, ut = pop > 1.2 ? Math.max(0, 1 - (pop - 1.2)) : 1;
      if (pop >= 0) { var kk = Math.sin(Math.min(1, pop / 0.8) * Math.PI), gl = x.createRadialGradient(HJARTA_CX, HJARTA_CY, 0, HJARTA_CX, HJARTA_CY, 230); gl.addColorStop(0, 'rgba(255,79,216,' + (0.5 * kk * ut) + ')'); gl.addColorStop(1, 'rgba(7,3,15,0)'); x.globalAlpha = 1; x.fillStyle = gl; x.fillRect(0, 0, BAS_B, BAS_H); }
      t.form.hj.forEach(function (h) {
        var m = FORM.mal[h.i], u = io((nu - h.start) / 1.1); if (u <= 0) return;
        var px = CX + (m.x - CX) * u, py = SPETS + (m.y - SPETS) * u; px = HJARTA_CX + (px - HJARTA_CX) * sk; py = HJARTA_CY + (py - HJARTA_CY) * sk;
        var sz = m.r * (0.5 + 0.5 * u) * 1.2; x.globalAlpha = Math.min(1, u * 1.5) * ut; x.drawImage(sprite(h.farg), px - sz, py - sz, sz * 2, sz * 2);
      });
      void ft;
    }
    x.globalAlpha = 1;
  }

  // ---- KLOCKAN: går bara när något lever --------------------------------------------------------
  var gar = false, forra = 0, fryst = false;
  function starta() { if (gar || fryst) return; gar = true; forra = performance.now() / 1000; requestAnimationFrame(tick); }
  function tick() {
    if (fryst) { gar = false; return; }
    var nu = performance.now() / 1000, dt = Math.min(0.05, nu - forra), nagot = false; forra = nu;
    widgetar().forEach(function (w) {
      var t = till(w.id); steg(w, t, nu, dt);
      var cv = document.querySelector('.widget[data-id="' + cssId(w.id) + '"] canvas.lfp-duk');
      if (cv && !(w.hidden && iOverlay())) rita(w, t, cv, nu);
      if (t.aktiv) nagot = true;
    });
    if (nagot) requestAnimationFrame(tick); else gar = false;
  }
  var cssId = function (s) { return String(s).replace(/["\\]/g, '\\$&'); };

  // ---- KOPPLINGEN: samma ström som Top Like ----------------------------------------------------
  // DEN KLASSISKA FONTÄNEN OCKSÅ. Davids regel 2026-09-26: "Top Like, Like Fountain och Like Goal
  // går på likes". Top Like (live-leaderboard.js) och Like Goal (server/goal-runtime.js) gjorde
  // det redan; den klassiska fontänen rörde sig bara via en Action. Nu får den samma like-paket,
  // genom sin egen trigger (media.js triggerLikeFountainPop), märkt __auto.
  var klassiska = function () { try { return state.widgets.filter(function (w) { return w.type === 'templateLikeFountain' && !arPortal(w); }); } catch (x) { return []; } };
  root.addEventListener('vyra-live-event', function (ev) {
    var e = ev && ev.detail; if (!arFarskLike(e)) return;
    var antal = Number(e.count || e.likeCount || e.value || 1) || 1;
    widgetar().forEach(function (w) { if (!(w.hidden && iOverlay())) tappa(w, antal, e); });
    if (klassiska().length && typeof root.triggerLikeFountainPop === 'function') {
      root.triggerLikeFountainPop(Object.assign({}, e, { count: antal, __auto: true }));
    }
  });

  // ---- RENDERING, PANEL OCH KATALOG (monkeypatch, studio.js rörs aldrig) ------------------------
  if (typeof wh === 'function') {
    var forraWh = wh;
    wh = function (w) {
      if (!arPortal(w)) return forraWh(w);
      var W = w.width || 360, H = Math.round(W * BAS_H / BAS_B);
      return '<div class="widget like-fountain-portal' + (fryst ? ' lfp-still-vald' : '') + (typeof selected !== 'undefined' && selected === w.id ? ' selected' : '') + '" data-id="' + saker(w.id) + '" style="left:' + (w.x || 0) + 'px;top:' + (w.y || 0) + 'px;width:' + W + 'px;height:' + H + 'px;zoom:' + (w.widgetScale || 1) + '">'
        + stillSvg(w) + '<canvas class="lfp-duk" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>'
        + (typeof selected !== 'undefined' && selected === w.id ? '<span class="resize-handle">↘</span>' : '') + '</div>';
    };
  }

  // Testknappen, Actions och pixelriggens ALERTS går via triggerLikeFountainPop. Portalen tar
  // BARA __test-event därifrån (ett tryck i panelen ska synas). Fontänen svarar på LIKES och
  // inget annat (Davids beslut 2026-09-26) - de kommer redan via `vyra-live-event` ovan, och en
  // Action (på likes eller något annat) sprutar därför inga hjärtan i portalen.
  if (typeof root.triggerLikeFountainPop === 'function') {
    var forraPop = root.triggerLikeFountainPop;
    var nyPop = function (event) {
      var e = event || {};
      // En Action som startats av ett like-paket (live-client.js sätter `likecount`) hade gett
      // dubbla effekter: fontänerna tar redan likes direkt ovan.
      if (!e.__test && !e.__auto && e.likecount != null) return false;
      if (e.__test) widgetar().forEach(function (w) { if (!e.__id || e.__id === w.id) tappa(w, Number(e.count) || 15, e); });
      return forraPop.apply(this, arguments);
    };
    root.triggerLikeFountainPop = nyPop;
    try { triggerLikeFountainPop = nyPop; } catch (x) {}
  }

  if (typeof props === 'function') {
    var forraProps = props;
    props = function () {
      var w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
      if (!arPortal(w)) return forraProps();
      var pal = w.fountainPalette || 'portal', per = w.fountainPerLike || 6, varje = Number.isFinite(Number(w.fountainPopEvery)) ? Number(w.fountainPopEvery) : 1000;
      var sektion = function (rubrik, html) { return typeof pgSection === 'function' ? pgSection(rubrik, html, true) : '<div class="property-group"><h4>' + rubrik + '</h4>' + html + '</div>'; };
      var innehall = '<label>Färgpalett<select id="lfpPalett">' + Object.keys(PALETTNAMN).map(function (k) { return '<option value="' + k + '"' + (k === pal ? ' selected' : '') + '>' + PALETTNAMN[k] + '</option>'; }).join('') + '</select></label>'
        + '<label class="range-label">Hjärtan per like-paket (max) <b>' + per + '</b><input id="lfpPer" type="range" min="1" max="15" value="' + per + '"></label>'
        + '<label class="switch-row">Tittarens profilbild stiger med<input id="lfpBubblor" type="checkbox"' + (w.fountainAvatarHearts === false ? '' : ' checked') + '><i></i></label>'
        + '<label>Stort hjärta poppar var … like (0 = av)<input id="lfpPop" type="number" min="0" step="50" value="' + varje + '"></label>'
        + '<div class="switch-row"><button id="lfpTest" type="button">♥ Testa (15 likes)</button><button id="lfpTestPop" type="button">✦ Testa stora hjärtat</button></div>';
      return '<h3>LIKE FOUNTAIN · PORTAL</h3><div class="template-badge">LIVE · STIGER NÄR TITTARNA TAPPAR</div><div hidden><input id="pt" value="' + saker(w.title || '') + '"><input id="pv" value=""></div>'
        + sektion('INNEHÅLL', innehall)
        + '<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="' + (w.x || 0) + '"></label><label>Y<input id="propY" type="number" value="' + (w.y || 0) + '"></label><label>Bredd<input id="propWidth" type="number" value="' + (w.width || 360) + '"></label><label>Lager<input id="propLayer" type="number" value="' + (w.layer || 1) + '"></label></div></div><button class="delete" id="del">Ta bort</button>';
    };
  }

  if (typeof bind === 'function') {
    var forraBind = bind;
    bind = function () {
      forraBind.apply(this, arguments);
      try { bindPanel(); bindKatalog(); } catch (e) {}
      if (widgetar().some(function (w) { return till(w.id).aktiv; })) starta();
    };
  }
  function bindPanel() {
    if (typeof view === 'undefined' || view !== 'editor') return;
    var w = typeof liveWidget === 'function' ? liveWidget(selected) : null; if (!arPortal(w)) return;
    var q = function (s) { return document.querySelector('.properties ' + s) || document.querySelector(s); };
    var spara = function () { if (typeof save === 'function') save(); if (typeof render === 'function') render(); if (typeof bind === 'function') bind(); };
    var el;
    if ((el = q('#lfpPalett'))) el.onchange = function (e) { w.fountainPalette = e.target.value; spara(); };
    if ((el = q('#lfpPer'))) el.oninput = function (e) { w.fountainPerLike = Number(e.target.value) || 6; var b = e.target.parentElement.querySelector('b'); if (b) b.textContent = w.fountainPerLike; if (typeof save === 'function') save(); };
    if ((el = q('#lfpBubblor'))) el.onchange = function (e) { w.fountainAvatarHearts = e.target.checked; if (typeof save === 'function') save(); };
    if ((el = q('#lfpPop'))) el.onchange = function (e) { var v = Math.max(0, Math.round(Number(e.target.value) || 0)); w.fountainPopEvery = v; if (typeof save === 'function') save(); };
    if ((el = q('#lfpTest'))) el.onclick = function () { tappa(w, 15, { username: 'Testtittare', profileImage: 'assets/images/test-profile.svg' }); };
    if ((el = q('#lfpTestPop'))) el.onclick = function () { var t = till(w.id); t.likesSedanPop = 0; t.form = { start: performance.now() / 1000, hj: [] }; t.aktiv = true; starta(); };
  }
  function bindKatalog() {
    if (typeof view === 'undefined' || (view !== 'editor' && view !== 'overlay')) return;
    var sektion = document.querySelector('.widget-catalog [data-like-fountain]');
    if (!sektion || sektion.querySelector('[data-catalog-key="catalog:likefountain:portal"]')) return;
    var knapp = document.createElement('button');
    knapp.type = 'button'; knapp.dataset.catalogKey = 'catalog:likefountain:portal';
    knapp.innerHTML = '<i>♥</i><span><b>Like Fountain · Portal</b><small>Stiger när tittarna tappar · live</small></span>';
    knapp.onclick = function () {
      var w = root.VyraWidgets.create('catalog:likefountain:portal');
      state.widgets.push(w); selected = w.id; if (typeof save === 'function') save(); if (typeof render === 'function') render();
      if (typeof toast === 'function') toast('Like Fountain · Portal skapad');
    };
    sektion.appendChild(knapp);
  }

  // Stil: förhandsbilden syns i studion, aldrig i sändningen, och inte medan fontänen lever.
  if (!document.getElementById('lfp-stil')) {
    var st = document.createElement('style'); st.id = 'lfp-stil';
    st.textContent = '.like-fountain-portal{position:absolute;overflow:visible;background:transparent}'
      + '.like-fountain-portal .lfp-still,.like-fountain-portal .lfp-duk{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}'
      + '.like-fountain-portal.lfp-live .lfp-still{opacity:0}'
      + '.overlay-output .like-fountain-portal:not(.lfp-still-vald) .lfp-still{display:none}';
    document.head.appendChild(st);
  }

  // PIXELVAKTENS REGI: stoppa klockan, töm dukarna och visa förhandsbilden även i overlay-läget.
  // Bilden är då helt bestämd av koden (samma platser, samma frö).
  root.VyraLikePortal = {
    stilla: function () {
      fryst = true; Object.keys(TILL).forEach(function (k) { delete TILL[k]; });
      var n = 0;
      document.querySelectorAll('.like-fountain-portal').forEach(function (b) {
        b.classList.remove('lfp-live'); b.classList.add('lfp-still-vald');
        var sv = b.querySelector('.lfp-still'); if (sv) sv.style.opacity = '';
        var cv = b.querySelector('canvas.lfp-duk'); if (cv) { var cx2 = cv.getContext('2d'); cx2.setTransform(1, 0, 0, 1, 0, 0); cx2.clearRect(0, 0, cv.width, cv.height); }
        n++;
      });
      return n;
    },
    tappa: function (id, antal, e) { var w = widgetar().filter(function (x) { return x.id === id; })[0]; if (w) tappa(w, antal, e); return !!w; },
    tillstand: function (id) { var t = TILL[id]; return t ? { hjartan: t.hj.length, bubblor: t.bubblor.length, ko: t.ko, form: !!t.form, aktiv: t.aktiv, platser: t.hj.map(function (h) { return h.p; }).concat(t.bubblor.map(function (b) { return b.p; })) } : null; },
    platser: function () { return PLATS.map(function (p) { return { x: p.x, y: p.y, r: p.r }; }); },
    ARIT: ARIT
  };
  if (typeof render === 'function' && typeof view !== 'undefined') { try { render(); bind(); } catch (e) {} }
})(typeof window !== 'undefined' ? window : globalThis);
