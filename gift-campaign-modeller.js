// GIFT CAMPAIGN · FOKUS, CLASSIC OCH GÅVOFLÖDE (2026-11-06).
//
// Davids sparade modeller från Codex-överlämningen (2026-11-01, vyra-gift-campaign-claude):
//   fokus   — "Fokus med gåvoval": en aktiv gåva stort med räknare, alla gåvor i en rad under.
//             Stående: tre platser, den aktiva i mitten, nästa kommer uppåt.
//   classic — samma upplägg i Classic-stil: mindre gåva, vit räknare, bred stapel i rosa→turkos.
//   flode   — "Gåvoflöde": gåvorna glider förbi var för sig med egen räknare. Liggande ut till
//             vänster och in från höger, stående ut upptill och in nedtill.
// Prototyperna Prism, Guldindex, Neon Link och Orbit Mål är förslag och ligger INTE här.
//
// Widgettypen är densamma som övriga Gift Campaigns (templateGiftCampaign, media.js campaignItems,
// räknaren i gift-event-images.js). Modellen väljs med campaignTheme = fokus | classic | flode;
// Aura-temana (gold, platinum, emerald) ritas som förut av gift-campaign-aura.js.
//
// EN GÅVA I TAGET HAR VIDEOYTAN. Den aktiva gåvan spelar SIN EGEN TikTok-animation
// (gift-campaign-video.js, strikt på giftId) från första rutan, en gång, och visar sedan bilden.
// Gåvor utan animation visar bilden. Alla andra platser visar bilden — inga dolda videor.
//
// TIMING: en plats står i PLATS_S = 9,3 s (Davids utgångspunkt). En video som är längre förlänger
// platsen till videons längd, så att den aldrig klipps: platsens tid = max(9,3 s, videons längd).
// I Gåvoflödet betyder det att flödet går långsammare medan en lång gåva passerar mitten.
//
// RÄKNAREN FÖLJER SIN EGEN GÅVA. gift-event-images.js är fortfarande den enda som skriver
// giftCurrent<i>; den här filen läser värdet varje bildruta och ritar det på gåvans egen plats.
// En gåva som tas emot får en kort reaktion (+antal). I Fokus och Classic flyttas fokus till den
// mottagna gåvan, så tittaren ser sin gåva; i Gåvoflödet fortsätter flödet.
(function (root) {
  'use strict';
  if (root.VyraKampanjModeller) return;

  var MODELLER = { fokus: 'Fokus', classic: 'Classic', flode: 'Gåvoflöde' };
  // Designens egna mått (bredd × höjd i px) — prototypernas widgetstorlek.
  var DESIGN = {
    'fokus:landscape': [270, 180], 'fokus:portrait': [172, 263],
    'classic:landscape': [290, 170], 'classic:portrait': [172, 263],
    'flode:landscape': [420, 150], 'flode:portrait': [140, 440]
  };
  var PLATS_S = 9.3;
  // Gåvoflödets geometri ur prototyperna: post 72 × 114 (liggande) och 88 × 114 (stående), avstånd
  // 80 respektive 120 px mellan gåvorna.
  var FLODE = {
    landscape: { fonster: 420, post: 72, avstand: 80, tvar: 12 },
    portrait: { fonster: 440, post: 114, avstand: 120, tvar: 26 }
  };

  function modell(w) { return w && w.type === 'templateGiftCampaign' && MODELLER[w.campaignTheme] ? w.campaignTheme : ''; }
  function orient(w) { return w && w.campaignOrientation === 'portrait' ? 'portrait' : 'landscape'; }
  function tal(v, f) { v = Number(v); return Number.isFinite(v) ? v : f; }
  function T(v) { var s = String(v == null ? '' : v); return root.VyraSafe ? root.VyraSafe.text(s) : s.replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function U(v) { return root.VyraSafe ? root.VyraSafe.url(String(v || '')) : String(v || ''); }

  function poster(w) {
    var items = typeof root.VyraCampaignItems === 'function' ? root.VyraCampaignItems(w) : [];
    return items.map(function (g) {
      return { namn: g.name, bild: g.image, nu: Math.max(0, Math.round(tal(g.current, 0))), mal: Math.max(1, Math.round(tal(g.target, 1))) };
    });
  }
  function malText(p) { return 'av ' + p.mal + ' · ' + Math.max(0, p.mal - p.nu) + ' kvar'; }
  function procent(p) { return Math.min(100, p.nu / p.mal * 100); }
  // En trasig gåvobild ska inte bli en annan gåva (Rose) eller profil-silhuetten (runtime-controls.js
  // byter trasiga bilder om data-fallback-applied saknas) — den blir osynlig.
  function bild(p) { return '<img src="' + U(p.bild) + '" alt="' + T(p.namn) + '" data-fallback-applied="1" onerror="this.style.visibility=\'hidden\'">'; }
  function info(p) {
    return '<div class="gcm-info"><div class="gcm-namn">' + T(p.namn) + '</div><div class="gcm-num">' + p.nu + '</div><div class="gcm-mal">' + malText(p) +
      '</div><div class="gcm-bar"><i style="width:' + procent(p) + '%"></i></div></div>';
  }

  // Var en rad i den stående listan står: d = avstånd från den aktiva (0 = mitten, 1 = nästa under,
  // n-1 = förra ovanför). Övriga ligger dolda under.
  function radStil(i, aktiv, n) {
    var d = ((i - aktiv) % n + n) % n;
    var y = d === 0 ? 0 : d === 1 ? 86 : d === n - 1 ? -86 : 220;
    var o = d === 0 ? 1 : (d === 1 || d === n - 1) ? 0.72 : 0;
    return 'transform:translateY(' + y + 'px) scale(' + (d === 0 ? 1 : 0.88) + ');opacity:' + o;
  }
  // Gåvoflödet: fas = vilken gåva som står i mitten (kontinuerlig). Gåva i står i mitten när fas = i.
  function flodeAvstand(o, n) { var g = FLODE[o]; return Math.max(g.avstand, (g.fonster + g.post) / Math.max(1, n)); }
  function flodeStil(i, fas, n, o) {
    var g = FLODE[o], mitt = g.fonster / 2 - g.post / 2;
    var d = n > 1 ? ((i - fas) % n + n) % n : 0;
    if (d >= n / 2) d -= n;
    var pos = Math.round((mitt + d * flodeAvstand(o, n)) * 10) / 10;
    return o === 'portrait' ? 'transform:translate(' + g.tvar + 'px,' + pos + 'px)' : 'transform:translate(' + pos + 'px,' + g.tvar + 'px)';
  }

  // Tillståndet per widget överlever omritningar (render bygger om noden): vilken gåva som är aktiv,
  // när den blev det och Gåvoflödets fas.
  var tillstand = new Map();
  function tillstandFor(w) {
    var st = tillstand.get(w.id);
    if (!st) { st = { aktiv: 0, start: klocka(), fas: 0 }; tillstand.set(w.id, st); }
    return st;
  }
  function klocka() { return (root.performance && root.performance.now ? root.performance.now() : Date.now()) / 1000; }

  function html(w) {
    var m = modell(w), o = orient(w), mat = DESIGN[m + ':' + o], dw = mat[0], dh = mat[1];
    var ps = poster(w), n = ps.length, st = tillstand.get(w.id) || { aktiv: 0, fas: 0 };
    var a = n ? Math.min(Math.max(0, st.aktiv), n - 1) : 0;
    var bredd = Math.max(60, tal(w.width, dw)), skala = bredd / dw, inre = '';
    if (!n) inre = '';
    else if (m === 'flode') {
      inre = '<div class="gcm-flode">' + ps.map(function (p, i) {
        return '<div class="gcm-post' + (i === a ? ' gcm-aktiv' : '') + '" data-i="' + i + '" style="' + flodeStil(i, st.fas || 0, n, o) + '"><div class="gcm-art">' + bild(p) +
          '</div><span class="gcm-mini">' + p.nu + '<small> / ' + p.mal + '</small></span><span class="gcm-minibar"><i style="width:' + procent(p) + '%"></i></span><span class="gcm-plus"></span></div>';
      }).join('') + '</div>';
    } else if (o === 'portrait') {
      inre = '<div class="gcm-lista">' + ps.map(function (p, i) {
        return '<div class="gcm-rad' + (i === a ? ' gcm-aktiv' : '') + '" data-i="' + i + '" style="' + radStil(i, a, n) + '"><div class="gcm-art">' + bild(p) + '</div>' + info(p) + '<span class="gcm-plus"></span></div>';
      }).join('') + '</div>';
    } else {
      inre = '<div class="gcm-hero" data-i="' + a + '"><div class="gcm-art">' + bild(ps[a]) + '</div>' + info(ps[a]) + '<span class="gcm-plus"></span></div>' +
        '<div class="gcm-ko">' + ps.map(function (p, i) { return '<span data-i="' + i + '"' + (i === a ? ' class="gcm-aktiv"' : '') + '>' + bild(p) + '</span>'; }).join('') + '</div>';
    }
    var vald = typeof selected !== 'undefined' && selected === w.id;
    return '<div class="widget vyra-gcm' + (vald ? ' selected' : '') + '" data-id="' + T(w.id) + '" data-gcm="' + m + '" data-orient="' + o + '" style="left:' + tal(w.x, 0) + 'px;top:' + tal(w.y, 0) +
      'px;width:' + bredd + 'px;height:' + Math.round(dh * skala) + 'px;zoom:' + Math.max(0.1, tal(w.widgetScale, 1)) + '"><div class="gcm-yta" style="width:' + dw + 'px;height:' + dh + 'px;zoom:' + skala + '">' + inre + '</div>' +
      (vald ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  }

  // ---- körning: en per synlig widgetnod ----------------------------------------------------------
  var V = function () { return root.VyraKampanjVideo; };
  var reducerad = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function Korning(nod, w) {
    this.nod = nod; this.w = w; this.m = modell(w); this.o = orient(w);
    this.hero = this.m !== 'flode' && this.o === 'landscape';
    this.n = poster(w).length;
    this.st = tillstandFor(w);
    if (this.st.aktiv >= this.n) this.st.aktiv = 0;
    this.sett = this.rakna();
    this.platser = {};
    this.synlig = false;
    this.traffTid = {};
    var mig = this;
    var K = V();
    this.slapp = K ? K.pa(function () { mig.visaVideo(true); }) : null;
  }
  Korning.prototype.rakna = function () { return poster(this.w).map(function (p) { return p.nu; }); };
  Korning.prototype.art = function (i) {
    if (this.hero) return this.nod.querySelector('.gcm-hero .gcm-art');
    return this.nod.querySelector((this.m === 'flode' ? '.gcm-post' : '.gcm-rad') + '[data-i="' + i + '"] .gcm-art');
  };
  Korning.prototype.plats = function (i) {
    var nyckel = this.hero ? 'hero' : String(i), p = this.platser[nyckel], ruta = this.art(i), K = V();
    if (!ruta || !K) return null;
    if (!p || p.ruta !== ruta) { if (p) p.stoppa(); p = this.platser[nyckel] = new K.Spelplats(ruta); }
    return p;
  };
  Korning.prototype.stoppaAlla = function () { var p = this.platser; Object.keys(p).forEach(function (k) { p[k].stoppa(); }); };
  // Platsens tid: 9,3 s, eller hela videon om den är längre.
  Korning.prototype.platsTid = function () {
    var p = this.platser[this.hero ? 'hero' : String(this.st.aktiv)];
    return Math.max(PLATS_S, p && p.langd || 0);
  };
  // Startar den aktiva gåvans video (från första rutan) och stoppar alla andra platser. `bara` =
  // anropet kommer från katalogen (en ny länk lärdes in): starta bara om ingenting spelar.
  Korning.prototype.visaVideo = function (bara) {
    if (!this.synlig || !this.n) return;
    var K = V(), a = this.st.aktiv, mig = this;
    if (!K) return;
    Object.keys(this.platser).forEach(function (k) { if (k !== (mig.hero ? 'hero' : String(a))) mig.platser[k].stoppa(); });
    var p = this.plats(a), id = K.platsId(this.w, a);
    if (!p) return;
    if (bara && p.id === id && (p.spelare || !K.video(id))) return;
    p.visa(id);
    if (this.n > 1) K.forladda(K.video(K.platsId(this.w, (a + 1) % this.n)));
  };
  Korning.prototype.ritaAktiv = function (forra) {
    var a = this.st.aktiv, n = this.n, nod = this.nod;
    if (this.hero) {
      var p = poster(this.w)[a], hero = nod.querySelector('.gcm-hero');
      if (!p || !hero) return;
      hero.dataset.i = String(a);
      var img = hero.querySelector('.gcm-art>img');
      if (img) { img.style.visibility = ''; img.src = U(p.bild); img.alt = String(p.namn || ''); }
      var inf = hero.querySelector('.gcm-info');
      if (inf) inf.outerHTML = info(p);
      if (forra !== a) { hero.classList.remove('gcm-in', 'gcm-tar-emot'); void hero.offsetWidth; hero.classList.add('gcm-in'); }
      nod.querySelectorAll('.gcm-ko span').forEach(function (s, i) { s.classList.toggle('gcm-aktiv', i === a); });
    } else if (this.m !== 'flode') {
      nod.querySelectorAll('.gcm-rad').forEach(function (r, i) { r.setAttribute('style', radStil(i, a, n)); r.classList.toggle('gcm-aktiv', i === a); });
    } else {
      nod.querySelectorAll('.gcm-post').forEach(function (r, i) { r.classList.toggle('gcm-aktiv', i === a); });
    }
  };
  Korning.prototype.aktivera = function (i) {
    if (!this.n) return;
    var forra = this.st.aktiv;
    this.st.aktiv = ((i % this.n) + this.n) % this.n;
    this.st.start = klocka();
    this.ritaAktiv(forra);
    this.visaVideo(false);
  };
  Korning.prototype.skrivRaknare = function (i, p) {
    var nod = this.nod;
    if (this.hero) {
      if (i !== this.st.aktiv) return;
      var h = nod.querySelector('.gcm-hero');
      if (!h) return;
      var num = h.querySelector('.gcm-num'), mal = h.querySelector('.gcm-mal'), bar = h.querySelector('.gcm-bar i');
      if (num) num.textContent = p.nu; if (mal) mal.textContent = malText(p); if (bar) bar.style.width = procent(p) + '%';
    } else if (this.m !== 'flode') {
      var r = nod.querySelector('.gcm-rad[data-i="' + i + '"]');
      if (!r) return;
      r.querySelector('.gcm-num').textContent = p.nu; r.querySelector('.gcm-mal').textContent = malText(p); r.querySelector('.gcm-bar i').style.width = procent(p) + '%';
    } else {
      var q = nod.querySelector('.gcm-post[data-i="' + i + '"]');
      if (!q) return;
      q.querySelector('.gcm-mini').innerHTML = p.nu + '<small> / ' + p.mal + '</small>';
      q.querySelector('.gcm-minibar i').style.width = procent(p) + '%';
    }
  };
  Korning.prototype.traff = function (i, antal) {
    var nod = this.nod;
    if (this.hero || this.m !== 'flode') {
      // En annan gåva tar fokus — men först när den aktiva gåvans video spelat klart. Annars
      // kapades klippet mitt i (handoffen: ett klipp får aldrig kapas tyst). Räknaren skrivs ändå direkt.
      if (i !== this.st.aktiv) { if (this.spelarKlipp()) this.vantande = i; else this.aktivera(i); }
      else {
        // Samma gåva igen: spelar videon redan låter vi den spela vidare (en kombo ger tiotals
        // händelser i sekunden). Har den spelat klart börjar den om, och platsen räknas från nu.
        var p = this.platser[this.hero ? 'hero' : String(i)];
        if (p && p.spelare && p.spelare.video && p.spelare.video.ended) { p.franBorjan(); this.st.start = klocka(); }
      }
    }
    var mal = this.hero ? nod.querySelector('.gcm-hero') : nod.querySelector((this.m === 'flode' ? '.gcm-post' : '.gcm-rad') + '[data-i="' + i + '"]');
    if (!mal) return;
    var plus = mal.querySelector('.gcm-plus');
    if (plus && antal > 0) plus.textContent = '+' + antal;
    mal.classList.remove('gcm-tar-emot'); void mal.offsetWidth; mal.classList.add('gcm-tar-emot');
  };
  // Spelar den aktiva platsen en video som inte är slut (eller laddar en)?
  Korning.prototype.spelarKlipp = function () {
    var p = this.platser[this.hero ? 'hero' : String(this.st.aktiv)];
    if (!p || !p.canvas) return false;
    var v = p.spelare && p.spelare.video;
    return !v || !v.ended;
  };
  Korning.prototype.arSynlig = function () {
    var n = this.nod;
    return !this.w.hidden && n.isConnected && !(root.document && root.document.hidden) &&
      !n.closest('.widget-hidden,[hidden],.widget-catalog,.catalog-card') && n.getClientRects().length > 0;
  };
  Korning.prototype.steg = function (nu, dt) {
    if (!this.nod.isConnected) return false;
    var synlig = this.arSynlig();
    if (synlig !== this.synlig) {
      this.synlig = synlig;
      if (synlig) { this.st.start = nu; this.visaVideo(false); } else this.stoppaAlla();
    }
    // Räknarna: läs vad räknaren skrivit och rita det på gåvans egen plats.
    var ps = poster(this.w), i;
    if (ps.length !== this.n) return false;   // antal gåvor ändrat: noden ritas om, körningen byggs om
    for (i = 0; i < ps.length; i += 1) {
      if (ps[i].nu === this.sett[i]) continue;
      var okning = ps[i].nu - this.sett[i];
      this.sett[i] = ps[i].nu;
      this.skrivRaknare(i, ps[i]);
      if (ps[i].nu > 0 && synlig) this.traff(i, okning > 0 ? okning : 0);
    }
    if (!synlig || this.n < 2) {
      // En gåva: ingen rotation. Videon spelar en gång per plats-tid från första rutan.
      if (synlig && this.n === 1 && nu - this.st.start >= this.platsTid()) {
        this.st.start = nu; var p1 = this.platser[this.hero ? 'hero' : '0']; if (p1 && p1.spelare) p1.franBorjan(); else this.visaVideo(false);
      }
      return true;
    }
    if (this.m === 'flode') {
      var bas = Math.round(this.st.fas);
      this.st.fas += dt / this.platsTid();
      // Videon startar en bildruta eller två efter att platsen blivit aktiv; utan spärren passerade
      // gåvan mitten innan klippets sista 0,1 s (uppmätt 2026-11-06: Gorilla 10,38 av 10,43 s).
      // Flödet står still vid platsens gräns tills klippet är slut.
      // Bara ett klipp som faktiskt spelar håller flödet — en hämtning som hänger får aldrig stoppa det.
      var pf = this.platser[String(this.st.aktiv)], vf = pf && pf.spelare && pf.spelare.video;
      if (vf && !vf.ended && !vf.paused && this.st.fas > bas + 0.499) this.st.fas = bas + 0.499;
      var fas = this.st.fas, n = this.n, o = this.o, visad = reducerad ? Math.round(fas) : fas;
      var aktiv = ((Math.round(fas) % n) + n) % n;
      this.nod.querySelectorAll('.gcm-post').forEach(function (r, k) { r.setAttribute('style', flodeStil(k, visad, n, o)); });
      if (aktiv !== this.st.aktiv) this.aktivera(aktiv);
      if (this.st.fas > n * 1000) this.st.fas -= n * 1000;
    } else if (this.vantande != null && !this.spelarKlipp()) {
      var v = this.vantande; this.vantande = null; this.aktivera(v);
    } else if (nu - this.st.start >= this.platsTid() && (!this.spelarKlipp() || nu - this.st.start >= this.platsTid() + 20)) {
      // (+20 s: en hämtning som aldrig blir klar får inte låsa rotationen.)
      var nasta = this.vantande != null ? this.vantande : this.st.aktiv + 1;
      this.vantande = null; this.aktivera(nasta);
    }
    return true;
  };
  Korning.prototype.avsluta = function () { this.stoppaAlla(); if (this.slapp) this.slapp(); };

  // ---- livscykel: samma mönster som gift-campaign-aura-session.js ----------------------------------
  var korningar = new Map();   // nod -> Korning
  var raf = 0, forra = 0;
  function widgets() { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets : []; } catch (e) { return []; } }
  function sync() {
    if (!root.document) return;
    var lista = widgets();
    korningar.forEach(function (k, nod) {
      if (!nod.isConnected || lista.indexOf(k.w) < 0 || modell(k.w) !== k.m || orient(k.w) !== k.o) { k.avsluta(); korningar.delete(nod); }
    });
    root.document.querySelectorAll('.vyra-gcm').forEach(function (nod) {
      if (korningar.has(nod) || nod.dataset.gcmVila || nod.closest('.widget-catalog,.catalog-card')) return;
      var w = lista.find(function (x) { return x && x.id === nod.dataset.id && modell(x); });
      if (!w) return;
      korningar.set(nod, new Korning(nod, w));
    });
    if (korningar.size && !raf) { forra = klocka(); raf = root.requestAnimationFrame(tick); }
  }
  function tick() {
    raf = 0;
    var nu = klocka(), dt = Math.min(0.1, Math.max(0, nu - forra));
    forra = nu;
    korningar.forEach(function (k, nod) { var kvar = false; try { kvar = k.steg(nu, dt); } catch (e) { console.error('[VyraKampanjModeller]', e); } if (!kvar) { k.avsluta(); korningar.delete(nod); } });
    if (korningar.size) raf = root.requestAnimationFrame(tick);
    else sync();
  }

  // ---- inkoppling i studio.js-kedjan -----------------------------------------------------------------
  if (typeof wh === 'function') {
    var forraWh = wh;
    wh = function (w) { return modell(w) ? html(w) : forraWh.apply(this, arguments); };
  }
  // Katalogen: gift-campaign-aura.js fyller sektionen [data-campaign-template] med sina tre teman.
  // Modellerna läggs till sist i samma sektion, en knapp per modell och orientering.
  function katalog() {
    if (typeof view === 'undefined' || (view !== 'editor' && view !== 'overlay')) return;
    var sektion = root.document.querySelector('[data-campaign-template]');
    if (!sektion || sektion.querySelector('[data-gcm-katalog]')) return;
    var rubrik = root.document.createElement('h4');
    rubrik.textContent = 'GIFT CAMPAIGN · EN GÅVA I FOKUS';
    rubrik.dataset.gcmKatalog = '1';
    sektion.appendChild(rubrik);
    Object.keys(MODELLER).forEach(function (m) {
      ['landscape', 'portrait'].forEach(function (o) {
        var knapp = root.document.createElement('button'), nyckelKat = 'catalog:giftcampaign:' + m + ':' + o;
        knapp.dataset.campaignTheme = m; knapp.dataset.campaignOrient = o; knapp.dataset.catalogKey = nyckelKat;
        knapp.innerHTML = '<i>✧</i><span><b>' + T(MODELLER[m]) + '</b><small>' + (o === 'portrait' ? 'Stående' : 'Liggande') + '</small></span>';
        knapp.onclick = function () {
          var w = root.VyraWidgets.create(nyckelKat);
          state.widgets.push(w); selected = w.id;
          if (typeof save === 'function') save();
          render();
        };
        sektion.appendChild(knapp);
      });
    });
  }
  // Panelens Design-väljare: Aura skriver om den till sina tre teman — modellerna läggs till efter.
  if (typeof props === 'function') {
    var forraProps = props;
    props = function () {
      var html = forraProps.apply(this, arguments), w = typeof liveWidget === 'function' && typeof selected !== 'undefined' ? liveWidget(selected) : null;
      if (!w || w.type !== 'templateGiftCampaign' || typeof html !== 'string') return html;
      var m = modell(w);
      return html.replace(/(<select id="campaignTheme">[\s\S]*?)(<\/select>)/, function (_, a, b) {
        if (m) a = a.replace(/ selected(?=[ >])/g, '');
        return a + Object.keys(MODELLER).map(function (k) { return '<option value="' + k + '"' + (m === k ? ' selected' : '') + '>' + T(MODELLER[k]) + '</option>'; }).join('') + b;
      });
    };
  }
  if (typeof bind === 'function') {
    var forraBind = bind;
    bind = function () {
      var r = forraBind.apply(this, arguments);
      try { katalog(); } catch (e) { console.error('[VyraKampanjModeller]', e); }
      // Aura sätter väljarens värde till sitt eget tema i bind; modellens värde gäller.
      var w = typeof liveWidget === 'function' && typeof selected !== 'undefined' ? liveWidget(selected) : null, val = root.document.querySelector('#campaignTheme');
      if (w && modell(w) && val) val.value = w.campaignTheme;
      sync();
      return r;
    };
  }
  if (typeof MutationObserver === 'function' && root.document) {
    new MutationObserver(function (poster) {
      if (poster.some(function (r) { return Array.prototype.some.call(r.addedNodes, function (x) { return x.nodeType === 1; }) || Array.prototype.some.call(r.removedNodes, function (x) { return x.nodeType === 1; }); })) sync();
    }).observe(root.document.documentElement, { childList: true, subtree: true });
  }
  if (root.document) root.document.addEventListener('visibilitychange', sync);

  root.VyraKampanjModeller = {
    MODELLER: MODELLER, DESIGN: DESIGN, PLATS_S: PLATS_S, modell: modell, html: html, sync: sync,
    tillstand: function (id) { return tillstand.get(id) || null; },
    // Stillbild för pixelvakten (tests/helpers/katalognycklar.js): körningen stoppas, ingen video, och
    // noden ritas om i utgångsläget (första gåvan aktiv, flödet i fas 0). Bilden är bestämd av kod.
    vila: function (nod) {
      if (!nod) return false;
      nod.dataset.gcmVila = '1';
      var k = korningar.get(nod);
      if (k) { k.avsluta(); korningar.delete(nod); tillstand.delete(k.w.id); }
      var w = widgets().find(function (x) { return x && x.id === nod.dataset.id; });
      if (!w || !modell(w)) return false;
      var tmp = root.document.createElement('div');
      tmp.innerHTML = html(w);
      var ny = tmp.firstChild, yta = nod.querySelector('.gcm-yta');
      if (yta && ny) yta.replaceWith(ny.querySelector('.gcm-yta'));
      return true;
    },
    inspektera: function (id) {
      var ut = null;
      korningar.forEach(function (k) {
        if (k.w.id !== id) return;
        ut = { modell: k.m, orient: k.o, aktiv: k.st.aktiv, fas: k.st.fas, platsTid: k.platsTid(), synlig: k.synlig, gavor: k.n,
          platser: Object.keys(k.platser).map(function (x) { return Object.assign({ plats: x }, k.platser[x].status()); }) };
      });
      return ut;
    },
    antal: function () { return korningar.size; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
