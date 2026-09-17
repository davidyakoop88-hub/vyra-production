// Canvas-lager for Like Fountain: poppen, sparet, medaljongen, avskedet.
//
// VARFOR DET HAR FINNS. Fontanen ritades med DOM och CSS-animationer. Det gav en
// stromm av hjartan, men inget OGONBLICK: partikeln tonade in, drev uppat och tonade
// ut. Referensmaterialet David skickade (2026-09-17) visade fem saker vi saknade --
// ljusspar efter banan, profilbilden som egen medaljong, konturhjartan blandat med
// fyllda, en kalla partiklarna fods ur, och en tydlig traff nar liken kommer.
//
// FORLAGAN AR battle-mvp-particles.js. Samma uppbyggnad, samma still()-kontrakt mot
// den visuella regressionen, samma regel om reducerad rorelse. Las den filen forst.
//
// DEN HAR FILEN ROR INTE likeFountainHtml. Den raden ar 4 569 tecken och bygger hela
// DOM-fontanen; en andring dar riskerar CSS-animationerna som redan fungerar. I
// stallet lagger vi en duk OVANPA .lf-stream och laser widgetens installningar ur
// `state` via rotens data-id. DOM-fontanen ar kvar och ar reserven.
(function (root) {
  'use strict';

  var REDUCED = false;
  try { REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var PALETTER = {
    rainbow: ['#ff2f7d', '#ff9d21', '#ffe52b', '#3cff8d', '#35d7ff', '#8957ff'],
    neon: ['#ff38ca', '#8c45ff', '#22e5ff', '#ffffff'],
    fire: ['#ff2d2d', '#ff6b18', '#ffc928', '#fff1a8'],
    ice: ['#24cfff', '#82eeff', '#d9fbff', '#789cff'],
    gold: ['#ff9d16', '#ffc928', '#fff0a3', '#ffffff'],
    aurora: ['#4fd8c4', '#7fe7ff', '#a78bff', '#ffffff'],
    pastel: ['#ffb3d1', '#c9b3ff', '#b3e0ff', '#b3ffd9'],
    mono: ['#ffffff', '#d8d8e0', '#a0a0ac', '#e8e8f0']
  };

  var POPP = 0.42;          // sekunder som hjartat star still och slar till
  var TAK_PARTIKLAR = 260;  // samma tak som DOM-fontanen halls vid

  function tal(v, d, lo, hi) {
    var n = parseFloat(v);
    if (!isFinite(n)) return d;
    return Math.max(lo, Math.min(hi, n));
  }

  function slump(a, b) { return a + Math.random() * (b - a); }

  // Overskjutning: snabb ramp upp, en puckel over 1, sedan vila pa 1.
  function poppskala(t) {
    if (t >= 1) return 1;
    var ramp = 1 - Math.pow(1 - Math.min(1, t / 0.34), 3);
    return ramp * (1 + 0.30 * Math.sin(Math.PI * t));
  }

  function hjartform(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.30);
    c.bezierCurveTo(x, y - s * 0.06, x - s * 0.52, y - s * 0.02, x - s * 0.52, y + s * 0.32);
    c.bezierCurveTo(x - s * 0.52, y + s * 0.64, x - s * 0.16, y + s * 0.82, x, y + s);
    c.bezierCurveTo(x + s * 0.16, y + s * 0.82, x + s * 0.52, y + s * 0.64, x + s * 0.52, y + s * 0.32);
    c.bezierCurveTo(x + s * 0.52, y - s * 0.02, x, y - s * 0.06, x, y + s * 0.30);
    c.closePath();
  }

  function ritaKrona(c, kx, ky, kb) {
    c.fillStyle = '#ffe52b';
    c.beginPath();
    c.moveTo(kx - kb / 2, ky); c.lineTo(kx - kb / 2 + kb * 0.16, ky - kb * 0.46);
    c.lineTo(kx - kb * 0.1, ky - kb * 0.12); c.lineTo(kx, ky - kb * 0.55);
    c.lineTo(kx + kb * 0.1, ky - kb * 0.12); c.lineTo(kx + kb / 2 - kb * 0.16, ky - kb * 0.46);
    c.lineTo(kx + kb / 2, ky); c.closePath(); c.fill();
  }

  // Bildcache. En profilbild hamtas en gang per adress och delas av alla partiklar.
  // Misslyckas hamtningen ritas initialen i stallet -- aldrig ett tomt hal.
  var bilder = Object.create(null);
  function bildFor(url) {
    if (!url) return null;
    var post = bilder[url];
    if (post) return post.klar ? post.bild : null;
    var bild = new Image();
    post = bilder[url] = { bild: bild, klar: false };
    bild.onload = function () { post.klar = true; };
    bild.onerror = function () { bilder[url] = { bild: null, klar: false, trasig: true }; };
    bild.src = url;
    return null;
  }

  function Motor(box) {
    this.box = box;
    this.scen = box.querySelector('.lf-stream') || box;
    this.duk = null;
    this.ctx = null;
    this.partiklar = [];
    this.stoft = [];
    this.konfetti = [];
    this.historik = [];
    this.raknare = Object.create(null);   // namn -> antal likes den har sandningen
    this.topp = null;
    this.w = 0; this.h = 0;
  }

  // Dukens matt far bara skrivas nar de FAKTISKT andras: `canvas.width = X`
  // omallokerar backing storen aven nar vardet ar oforandrat.
  Motor.prototype.matt = function () {
    var r = this.scen.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    this.w = r.width; this.h = r.height;
    if (!this.duk) {
      this.duk = document.createElement('canvas');
      this.duk.className = 'lf-duk';
      this.duk.setAttribute('aria-hidden', 'true');
      this.ctx = this.duk.getContext('2d');
      this.scen.append(this.duk);
    }
    if (this.duk.width === W && this.duk.height === H) return true;
    this.duk.width = W; this.duk.height = H;
    return true;
  };

  Motor.prototype.installning = function () {
    var id = this.box.dataset.id;
    var w = null;
    try {
      var lista = (root.state && root.state.widgets) || [];
      for (var i = 0; i < lista.length; i++) if (lista[i].id === id) { w = lista[i]; break; }
    } catch (e) {}
    w = w || {};
    var namn = String(w.fountainPalette || 'rainbow');
    return {
      palett: PALETTER[namn] || PALETTER.rainbow,
      storlek: tal(w.fountainSize, 100, 40, 200) / 100,
      hojd: tal(w.fountainHeight, 60, 0, 100) / 100,
      bredd: tal(w.fountainWidth != null ? w.fountainWidth * 100 : 58, 58, 0, 100) / 100
    };
  };

  Motor.prototype.fas = function (nu) {
    while (this.historik.length && nu - this.historik[0] > 3000) this.historik.shift();
    var takt = this.historik.length / 3;
    return takt >= 12 ? 'storm' : takt >= 3 ? 'tat' : 'lugn';
  };

  // En like har kommit. Foder en partikel, och firandepartiklar om takten ar hog.
  Motor.prototype.pop = function (handelse) {
    if (REDUCED) return;
    if (!this.matt()) return;
    var s = this.installning();
    var nu = (root.performance && performance.now()) || Date.now();
    this.historik.push(nu);
    var fas = this.fas(nu);

    var namn = String(handelse.namn || handelse.username || '').trim() || '@';
    this.raknare[namn] = (this.raknare[namn] || 0) + 1;
    if (!this.topp || this.raknare[namn] > (this.raknare[this.topp] || 0)) this.topp = namn;

    var streck = Math.min(this.raknare[namn] - 1, 12);
    var vaxt = (1 + streck * 0.085) * s.storlek;
    var kon = 0.12 + s.bredd * 0.78;
    var vinkel = (Math.random() - 0.5) * kon * 2.4;
    var fart = (58 + s.hojd * 172) + Math.random() * 62;
    var farg = s.palett[(Math.random() * s.palett.length) | 0];

    this.partiklar.push({
      sort: Math.random() < 0.18 ? 'medaljong' : 'hjarta',
      kontur: Math.random() < 0.30,
      namn: namn,
      bild: handelse.bild || handelse.profileImage || '',
      farg: farg,
      x: this.w * 0.5 + (Math.random() - 0.5) * this.w * 0.045,
      y: this.h * 0.94,
      vx: Math.sin(vinkel) * fart * 1.15,
      vy: -Math.cos(vinkel) * fart,
      storlek: slump(19, 32) * vaxt,
      streck: streck,
      liv: 0,
      langd: (2.6 + s.hojd * 2.4) + Math.random() * 1.2,
      spar: [],
      brast: false
    });
    if (this.partiklar.length > TAK_PARTIKLAR) this.partiklar.splice(0, this.partiklar.length - TAK_PARTIKLAR);

    if (fas !== 'lugn') {
      var antal = fas === 'storm' ? 4 : 2;
      for (var i = 0; i < antal; i++) {
        var stjarna = Math.random() < 0.45;
        this.konfetti.push({
          stjarna: stjarna,
          x: this.w * 0.5 + (Math.random() - 0.5) * this.w * (0.26 + s.bredd * 0.62),
          y: this.h * 0.92,
          vx: (Math.random() - 0.5) * 136,
          vy: -(130 + Math.random() * 190),
          snurr: (Math.random() - 0.5) * 9,
          vinkel: Math.random() * 6.283,
          b: stjarna ? slump(2.2, 5.4) : slump(3.2, 7.2),
          h: stjarna ? 0 : slump(6, 13),
          liv: 0, langd: slump(2.3, 3.8),
          farg: s.palett[(Math.random() * s.palett.length) | 0]
        });
      }
    }
  };

  Motor.prototype.brist = function (x, y, farg, S) {
    this.stoft.push({ ring: true, x: x, y: y, r: S * 0.30, maxr: S * 1.55, liv: 0, langd: 0.52, farg: farg });
    var n = 5 + ((Math.random() * 4) | 0);
    for (var i = 0; i < n; i++) {
      var v = Math.random() * 6.283, f = slump(26, 90);
      this.stoft.push({
        x: x, y: y, vx: Math.cos(v) * f, vy: Math.sin(v) * f - 16,
        r: slump(0.9, 2.8), liv: 0, langd: slump(0.55, 1.05), farg: farg
      });
    }
  };

  Motor.prototype.steg = function (dt) {
    var i, p;
    for (i = this.partiklar.length - 1; i >= 0; i--) {
      p = this.partiklar[i];
      p.liv += dt;
      if (p.liv >= POPP) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 16 * dt;
        p.vx *= (1 - 0.10 * dt);
      }
      if (p.liv > p.langd || p.y < -70) this.partiklar.splice(i, 1);
    }
    for (i = this.stoft.length - 1; i >= 0; i--) {
      var d = this.stoft[i]; d.liv += dt;
      if (!d.ring) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 52 * dt; d.vx *= (1 - 1.4 * dt); }
      if (d.liv > d.langd) this.stoft.splice(i, 1);
    }
    for (i = this.konfetti.length - 1; i >= 0; i--) {
      var k = this.konfetti[i]; k.liv += dt;
      k.x += k.vx * dt; k.y += k.vy * dt;
      k.vy += 190 * dt; k.vx *= (1 - 0.5 * dt); k.vinkel += k.snurr * dt;
      if (k.liv > k.langd || k.y > this.h + 40) this.konfetti.splice(i, 1);
    }
  };

  Motor.prototype.rita = function () {
    var c = this.ctx, dpr = Math.min(2, root.devicePixelRatio || 1);
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);

    var self = this;

    // Ljuspunkten dar partiklarna fods. Ingen vag bakom -- ett sken over hela scenen
    // blir en gra fyrkant i OBS nar duken ar transparent.
    var kx = this.w / 2, ky = this.h * 0.94;
    c.save();
    c.globalCompositeOperation = 'lighter';
    var pkt = c.createRadialGradient(kx, ky, 0, kx, ky, this.w * 0.035);
    pkt.addColorStop(0, 'rgba(255,255,255,0.85)');
    pkt.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = pkt;
    c.beginPath(); c.arc(kx, ky, this.w * 0.035, 0, 6.283); c.fill();
    c.restore();

    // stoft och ringar
    c.save(); c.globalCompositeOperation = 'lighter';
    this.stoft.forEach(function (d) {
      var f = d.liv / d.langd;
      if (d.ring) {
        c.globalAlpha = Math.max(0, Math.pow(1 - f, 1.8)) * 0.75;
        c.strokeStyle = d.farg; c.lineWidth = Math.max(0.7, 2.2 * (1 - f));
        c.beginPath(); c.arc(d.x, d.y, d.r + (d.maxr - d.r) * (f * (2 - f)), 0, 6.283); c.stroke();
      } else {
        c.globalAlpha = Math.max(0, 1 - f);
        c.fillStyle = d.farg;
        c.beginPath(); c.arc(d.x, d.y, d.r * (1 - f * 0.5), 0, 6.283); c.fill();
      }
    });
    this.konfetti.forEach(function (k) {
      var f = k.liv / k.langd;
      c.globalAlpha = Math.max(0, (1 - f) * (f < 0.08 ? f / 0.08 : 1));
      c.fillStyle = k.farg;
      c.save(); c.translate(k.x, k.y); c.rotate(k.vinkel);
      if (k.stjarna) {
        c.beginPath();
        c.moveTo(0, -k.b * 2.6); c.lineTo(k.b * 0.5, -k.b * 0.5); c.lineTo(k.b * 2.6, 0);
        c.lineTo(k.b * 0.5, k.b * 0.5); c.lineTo(0, k.b * 2.6); c.lineTo(-k.b * 0.5, k.b * 0.5);
        c.lineTo(-k.b * 2.6, 0); c.lineTo(-k.b * 0.5, -k.b * 0.5); c.closePath(); c.fill();
      } else {
        var br = k.b * Math.abs(Math.cos(k.vinkel * 1.7));
        c.fillRect(-br / 2, -k.h / 2, Math.max(1, br), k.h);
      }
      c.restore();
    });
    c.restore();
    c.globalAlpha = 1;

    // EN krona, inte en per hjarta: ledaren kan ha flera partiklar i bild samtidigt.
    var kronbarare = null;
    if (this.topp && (this.raknare[this.topp] || 0) >= 3) {
      for (var q = 0; q < this.partiklar.length; q++) {
        var kandidat = this.partiklar[q];
        if (kandidat.namn === this.topp && (!kronbarare || kandidat.liv < kronbarare.liv)) kronbarare = kandidat;
      }
    }

    this.partiklar.forEach(function (p) {
      var f = p.liv / p.langd;
      var inn = f < 0.10 ? f / 0.10 : 1;
      var ut = f > 0.52 ? Math.max(0, (1 - f) / 0.48) : 1;
      ut = ut * ut * (3 - 2 * ut);
      var a = inn * ut;
      if (a <= 0) return;

      var pt = Math.min(1, p.liv / POPP);
      var S = p.storlek * poppskala(pt) * (0.62 + 0.38 * ut);
      var x = p.x, y = p.y;

      if (!p.brast && ut < 0.6) { p.brast = true; self.brist(x, y + S * 0.45, p.farg, S); }

      c.save();
      c.globalAlpha = a;

      // SPARET FOLJER BANAN. Ett spar som pekar mot kallan knyter fast hjartat i
      // marken med ett snore sa fort det kommer ut at sidan -- uppmatt och forkastat.
      if (p.spar.length > 1) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        c.strokeStyle = p.farg;
        for (var t = 1; t < p.spar.length; t++) {
          var g = t / p.spar.length;
          c.globalAlpha = a * 0.5 * g * g;
          c.lineWidth = Math.max(0.6, S * 0.075 * g);
          c.beginPath();
          c.moveTo(p.spar[t - 1].x, p.spar[t - 1].y);
          c.lineTo(p.spar[t].x, p.spar[t].y);
          c.stroke();
        }
        c.restore();
        c.globalAlpha = a;
      }
      p.spar.push({ x: x, y: y + S * 0.45 });
      if (p.spar.length > 11) p.spar.shift();

      // POPPEN: chockvag och blixt medan partikeln star still.
      if (pt < 1) {
        c.save(); c.globalCompositeOperation = 'lighter';
        var rr = p.storlek * (0.55 + 2.5 * pt);
        c.globalAlpha = a * Math.pow(1 - pt, 1.7) * 0.8;
        c.strokeStyle = p.farg; c.lineWidth = Math.max(1, 3.2 * (1 - pt));
        c.beginPath(); c.arc(x, y + p.storlek * 0.45, rr, 0, 6.283); c.stroke();
        var bl = c.createRadialGradient(x, y + p.storlek * 0.45, 0, x, y + p.storlek * 0.45, p.storlek * 1.5);
        bl.addColorStop(0, '#ffffff'); bl.addColorStop(1, 'rgba(255,255,255,0)');
        c.globalAlpha = a * Math.pow(1 - pt, 3) * 0.55;
        c.fillStyle = bl;
        c.beginPath(); c.arc(x, y + p.storlek * 0.45, p.storlek * 1.5, 0, 6.283); c.fill();
        c.restore();
        c.globalAlpha = a;
      }

      if (p.streck > 0) { c.shadowColor = p.farg; c.shadowBlur = 6 + p.streck * 2.6; }

      var R, cy;
      if (p.sort === 'medaljong') {
        R = S * 0.33; cy = y + S * 0.45;
        self.ritaAnsikte(c, p, x, cy, R, a);
        c.shadowColor = p.farg; c.shadowBlur = 10;
        c.strokeStyle = p.farg; c.lineWidth = Math.max(1.6, R * 0.13);
        c.beginPath(); c.arc(x, cy, R, 0, 6.283); c.stroke();
        c.shadowBlur = 0;
        if (p === kronbarare) ritaKrona(c, x, cy - R * 1.05, S * 0.42);
        c.restore();
        return;
      }

      if (p.kontur) {
        c.strokeStyle = p.farg; c.lineWidth = Math.max(1.4, S * 0.085);
        c.shadowColor = p.farg; c.shadowBlur = 9;
        hjartform(c, x, y, S); c.stroke();
        c.shadowBlur = 0; c.restore();
        return;
      }

      var gr = c.createLinearGradient(x, y - S * 0.1, x, y + S);
      gr.addColorStop(0, p.farg); gr.addColorStop(1, '#ffffff');
      c.fillStyle = gr;
      hjartform(c, x, y, S); c.fill();
      c.shadowBlur = 0;

      R = S * (0.29 + 0.17 * (1 - pt)); cy = y + S * 0.40;
      self.ritaAnsikte(c, p, x, cy, R, a);
      c.strokeStyle = '#ffffff';
      c.globalAlpha = a * (0.45 + Math.min(p.streck, 10) * 0.05);
      c.lineWidth = 1 + Math.min(p.streck, 10) * 0.22;
      c.beginPath(); c.arc(x, cy, R, 0, 6.283); c.stroke();
      c.globalAlpha = a;
      if (p === kronbarare) ritaKrona(c, x, y - S * 0.16, S * 0.42);
      c.restore();
    });
    c.globalAlpha = 1;
  };

  Motor.prototype.ritaAnsikte = function (c, p, x, cy, R, a) {
    var bild = bildFor(p.bild);
    c.save();
    c.beginPath(); c.arc(x, cy, R, 0, 6.283); c.closePath(); c.clip();
    if (bild) {
      c.drawImage(bild, x - R, cy - R, R * 2, R * 2);
    } else {
      c.fillStyle = '#17121f'; c.fillRect(x - R, cy - R, R * 2, R * 2);
      c.fillStyle = p.farg; c.globalAlpha = a * 0.55;
      c.fillRect(x - R, cy - R * 0.1, R * 2, R * 1.15);
      c.globalAlpha = a; c.fillStyle = '#f2ecff';
      c.font = '700 ' + Math.round(R * 1.05) + 'px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(p.namn.replace(/^@/, '').charAt(0).toUpperCase() || '?', x, cy + 1);
    }
    c.restore();
  };

  Motor.prototype.stopp = function () {
    if (this.duk && this.duk.parentNode) this.duk.parentNode.removeChild(this.duk);
    this.duk = null; this.ctx = null;
    this.partiklar.length = 0; this.stoft.length = 0; this.konfetti.length = 0;
  };

  // ------------------------------------------------------------------ slingan
  var motorer = new WeakMap();
  var levande = [];
  var frusen = false;
  var raf = 0, senast = 0;

  function motorFor(box) {
    var m = motorer.get(box);
    if (!m) { m = new Motor(box); motorer.set(box, m); }
    return m;
  }

  function tick(nu) {
    raf = 0;
    if (!senast) senast = nu;
    var dt = (nu - senast) / 1000;
    senast = nu;
    if (dt > 0.1) dt = 0.1;
    var kvar = [];
    for (var i = 0; i < levande.length; i++) {
      var m = levande[i];
      if (!m.box.isConnected) { m.stopp(); continue; }
      if (!m.matt()) { kvar.push(m); continue; }
      m.steg(dt);
      m.rita();
      if (m.partiklar.length || m.stoft.length || m.konfetti.length) kvar.push(m);
      else m.rita();
    }
    levande = kvar;
    if (levande.length) raf = requestAnimationFrame(tick);
    else senast = 0;
  }

  function vacka(m) {
    if (levande.indexOf(m) === -1) levande.push(m);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // Forvarmning: duken skapas och dimensioneras vid render, inte nar forsta liken
  // kommer. Att allokera tva backing stores i samma bildruta som en alert tands
  // kostade 83 ms i Battle MVP -- samma fella gors inte om har.
  function forvarm(box) {
    if (frusen || REDUCED) return;
    motorFor(box).matt();
  }

  function scan() {
    if (frusen || REDUCED) return;
    document.querySelectorAll('.widget.like-fountain').forEach(forvarm);
  }

  function pop(handelse) {
    if (frusen || REDUCED) return;
    var id = handelse && handelse.__id;
    document.querySelectorAll('.widget.like-fountain').forEach(function (box) {
      if (id && box.dataset.id !== id) return;
      var m = motorFor(box);
      m.pop(handelse || {});
      vacka(m);
    });
  }

  // Sandningen borjar om: raknarna och kronan hor till EN sandning.
  // `vyra-live-session` bar bade live:start och live:end -- bara start ska stada.
  addEventListener('vyra-live-session', function (event) {
    if (!event || !event.detail || event.detail.event !== 'live:start') return;
    document.querySelectorAll('.widget.like-fountain').forEach(function (box) {
      var m = motorer.get(box);
      if (!m) return;
      m.raknare = Object.create(null);
      m.topp = null;
      m.historik.length = 0;
    });
  });

  addEventListener('resize', function () { levande.forEach(function (m) { m.matt(); }); });

  // MutationObserver i stallet for en hake i bind(): laddningsordningen ar barande
  // logik i det har projektet, och en observer bryr sig inte om nar vi kom in.
  // Samma losning som battle-mvp-particles.js. Den samlas ihop i en rAF sa en
  // render med hundra mutationer ger EN scan, inte hundra.
  var planerad = 0;
  function planeraScan() {
    if (planerad) return;
    planerad = requestAnimationFrame(function () { planerad = 0; scan(); });
  }
  try {
    new MutationObserver(planeraScan).observe(document.documentElement, {
      childList: true, subtree: true
    });
  } catch (e) {}

  root.VyraLikeFountainFx = {
    pop: pop,
    scan: scan,
    paletter: PALETTER,
    poppskala: poppskala,
    // Frysning for den visuella regressionen, samma kontrakt som
    // VyraAnimalGiftJars.still() och VyraMvpParticles.still(). Partiklarna ar
    // dekoration -- prefers-reduced-motion doljer dem redan -- sa det arliga
    // stillestandet ar det utan dem: stoppa motorerna, ta bort dukarna, och lat
    // DOM:en ga tillbaka till exakt det som fanns fore den har modulen.
    still: function () {
      frusen = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; senast = 0; }
      while (levande.length) levande.pop().stopp();
      document.querySelectorAll('.widget.like-fountain canvas.lf-duk').forEach(function (d) { d.remove(); });
      return true;
    },
    aktiva: function () { return levande.length; },
    antal: function () {
      var n = 0;
      levande.forEach(function (m) { n += m.partiklar.length; });
      return n;
    }
  };
})(window);
