// Canvas particle engine for the Battle MVP celebrations.
//
// The six celebrations already animate their artwork in CSS. What they lacked
// was a celebration with depth: twenty <i> elements all sit in one plane behind
// the copy, so the effect reads as wallpaper rather than as something happening
// in the room. This module adds two canvases per stage -- one behind the art,
// one in front of it -- and drives them from the same duration the CSS uses.
//
// Three rules the engine exists to enforce:
//   1. Emission follows the phases. Flat emission is what made every celebration
//      read the same; the curve is what gives them a build towards the landing.
//   2. Depth needs two layers. A share of the particles is drawn in front of the
//      artwork, larger and faster, so the frame sits inside the celebration.
//   3. The portrait is never covered. The front layer gets a hole punched over
//      the face every frame, so particles fade out against it instead of being
//      clipped -- the face is the whole point of the alert.
//
// The twenty <i> elements stay in the markup as the fallback. Where a 2D context
// is unavailable (jsdom, canvas disabled) they keep animating exactly as before;
// where the canvas starts, `.mvc-fx-on` hides them and the engine takes over.
(function (root) {
  'use strict';

  var REDUCED = false;
  try { REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // --- palettes -------------------------------------------------------------
  var TINTS = {
    gold:   ['255,215,0', '255,242,196', '255,182,66'],
    violet: ['172,112,255', '214,176,255', '132,72,222'],
    white:  ['255,255,255', '232,238,255', '202,212,242']
  };

  // One profile per celebration. `shape` decides how it is drawn, the rest is
  // physics. Colours default to the design's own accent when not listed.
  var PROFILES = {
    coronation: { shape: 'rect',  cols: ['255,215,0', '255,244,200', '255,180,64', '255,255,255'],
                  spawn: 'top',   speed: [40, 120], size: [2.6, 5.4], life: [1.6, 3.0], grav: 150 },
    wings:      { shape: 'petal', cols: ['255,255,255', '255,240,208', '226,214,255'],
                  spawn: 'top',   speed: [22, 62],  size: [3.0, 6.2], life: [2.4, 4.4], grav: 26 },
    rosegold:   { shape: 'petal', cols: ['255,205,196', '244,166,180', '255,228,214', '210,130,150'],
                  spawn: 'top',   speed: [22, 58],  size: [3.0, 6.0], life: [2.6, 4.6], grav: 20 },
    pearl:      { shape: 'dot',   cols: ['255,255,255', '238,214,226', '206,178,198'],
                  spawn: 'bottom', speed: [30, 84], size: [1.8, 4.0], life: [1.8, 3.4], grav: -48 },
    portal:     { shape: 'line',  cols: ['140,230,255', '186,150,255', '255,255,255'],
                  spawn: 'centre', speed: [120, 420], size: [1.2, 2.8], life: [0.7, 1.5], grav: 0 },
    moon:       { shape: 'star',  cols: ['255,255,255', '226,214,255', '255,246,210'],
                  spawn: 'still', speed: [0, 0],    size: [1.6, 3.6], life: [0.9, 2.0], grav: 0 }
  };
  var FALLBACK = PROFILES.coronation;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }

  // How hard the celebration blows, as a fraction of the way through the alert.
  function rateAt(f) {
    if (f < 0.18) return 0.15;
    if (f < 0.45) return 0.25 + 0.65 * ((f - 0.18) / 0.27);
    if (f < 0.54) return 1.60;
    if (f < 0.90) return 1.00 - 0.30 * ((f - 0.54) / 0.36);
    return 1.50;
  }

  // --- one running celebration ---------------------------------------------
  function Engine(box) {
    this.box = box;
    this.stage = box.querySelector('.mvc-stage');
    this.parts = [];
    this.started = 0;
    this.fired = false;
    this.ok = false;
    if (!this.stage) return;

    this.back = document.createElement('canvas');
    this.front = document.createElement('canvas');
    this.back.className = 'mvc-fx mvc-fx-back';
    this.front.className = 'mvc-fx mvc-fx-front';
    this.back.setAttribute('aria-hidden', 'true');
    this.front.setAttribute('aria-hidden', 'true');

    var bc = this.back.getContext && this.back.getContext('2d');
    var fc = this.front.getContext && this.front.getContext('2d');
    if (!bc || !fc) return;                 // jsdom and friends: keep the CSS fallback
    this.bctx = bc; this.fctx = fc;

    this.stage.appendChild(this.back);
    this.stage.appendChild(this.front);
    this.stage.classList.add('mvc-fx-on');
    this.ok = true;
  }

  Engine.prototype.readSettings = function () {
    var cs = getComputedStyle(this.box);
    this.duration = Math.max(2, num(cs.getPropertyValue('--mvc-duration'), 10)) * 1000;
    this.intensity = num(cs.getPropertyValue('--mvc-fx-intensity'), 100) / 100;
    this.speedMul = num(cs.getPropertyValue('--mvc-fx-speed'), 100) / 100;
    this.sizeMul = num(cs.getPropertyValue('--mvc-fx-size'), 100) / 100;
    this.depth = num(cs.getPropertyValue('--mvc-fx-depth'), 34) / 100;
    this.holePct = num(cs.getPropertyValue('--mvc-fx-hole'), 118) / 100;
    this.tint = (cs.getPropertyValue('--mvc-fx-tint') || 'auto').trim() || 'auto';
    this.accent = (cs.getPropertyValue('--mvc-accent') || '').trim();

    // The portrait cut-out, in stage percentages, is already on the element.
    this.photo = {
      left: num(cs.getPropertyValue('--mvc-photo-left'), 29),
      top: num(cs.getPropertyValue('--mvc-photo-top'), 24),
      width: num(cs.getPropertyValue('--mvc-photo-width'), 42),
      height: num(cs.getPropertyValue('--mvc-photo-height'), 42)
    };

    var key = '';
    var m = /(?:^|\s)mvc-([a-z0-9-]+)(?:\s|$)/.exec(this.box.className || '');
    if (m) key = m[1];
    this.profile = PROFILES[key] || FALLBACK;
  };

  // Assigning canvas.width reallocates the backing store even when the number is
  // unchanged, so this has to be a real no-op once the size already matches --
  // otherwise moving creation earlier buys nothing and the activation frame pays
  // for two fresh bitmaps anyway.
  Engine.prototype.resize = function () {
    var r = this.stage.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    this.w = r.width; this.h = r.height;
    if (this.back.width === W && this.back.height === H) return true;
    this.back.width = this.front.width = W;
    this.back.height = this.front.height = H;
    this.bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  };

  Engine.prototype.colour = function () {
    if (this.tint !== 'auto' && TINTS[this.tint]) return pick(TINTS[this.tint]);
    return pick(this.profile.cols);
  };

  Engine.prototype.emit = function () {
    if (this.parts.length > (REDUCED ? 90 : 420)) return;
    var p = this.profile, w = this.w, h = this.h;
    var front = Math.random() < this.depth;
    var near = front ? rnd(1.25, 1.75) : 1;
    var spd = rnd(p.speed[0], p.speed[1]) * this.speedMul * near;
    var ang, x, y;

    if (p.spawn === 'top')         { x = rnd(0, w);            y = -h * 0.04; ang = Math.PI / 2 + rnd(-0.3, 0.3); }
    else if (p.spawn === 'bottom') { x = rnd(0, w);            y = h * 1.03;  ang = -Math.PI / 2 + rnd(-0.3, 0.3); }
    else if (p.spawn === 'centre') { x = w * 0.5; y = h * 0.42; ang = rnd(0, Math.PI * 2); }
    else                           { x = rnd(w * .06, w * .94); y = rnd(h * .08, h * .92); ang = 0; }

    this.parts.push({
      x: x, y: y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      g: p.grav, drag: p.spawn === 'still' ? 4 : 0.5,
      r: rnd(p.size[0], p.size[1]) * this.sizeMul * near,
      col: this.colour(), shape: p.shape,
      life: 0, max: rnd(p.life[0], p.life[1]),
      rot: rnd(0, 6.2832), vr: rnd(-4, 4), tw: rnd(0, 6.2832),
      front: front
    });
  };

  Engine.prototype.burst = function (n) {
    var i, w = this.w, h = this.h;
    for (i = 0; i < (REDUCED ? n / 4 : n); i++) {
      var a = rnd(0, 6.2832), spd = rnd(60, 420) * this.speedMul;
      this.parts.push({
        x: w * 0.5, y: h * (this.photo.top + this.photo.height / 2) / 100,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        g: 180, drag: 1.4, r: rnd(1.2, 3.2) * this.sizeMul,
        col: this.colour(), shape: this.profile.shape === 'line' ? 'line' : 'dot',
        life: 0, max: rnd(0.5, 1.2), rot: rnd(0, 6.2832), vr: rnd(-5, 5),
        tw: rnd(0, 6.2832), front: Math.random() < this.depth
      });
    }
  };

  Engine.prototype.step = function (dt, f) {
    var i, P, bx = this.bctx, fx = this.fctx;
    bx.clearRect(0, 0, this.w, this.h);
    fx.clearRect(0, 0, this.w, this.h);
    bx.globalCompositeOperation = 'lighter';
    fx.globalCompositeOperation = 'lighter';

    for (i = this.parts.length - 1; i >= 0; i--) {
      P = this.parts[i];
      P.life += dt;
      if (P.life >= P.max) { this.parts.splice(i, 1); continue; }
      var t = P.life / P.max;
      P.vy += P.g * dt;
      P.vx -= P.vx * P.drag * dt;
      P.vy -= P.vy * P.drag * dt * 0.35;

      if (P.shape === 'rect')  { P.vx += Math.sin(P.rot * 2) * 42 * dt; P.vy -= Math.abs(Math.cos(P.rot)) * 30 * dt; }
      if (P.shape === 'petal') { P.vx += Math.sin(P.tw + P.life * 1.2) * 24 * dt; }

      P.x += P.vx * dt; P.y += P.vy * dt; P.rot += P.vr * dt;

      var a = (1 - t) * (0.7 + 0.3 * Math.sin(P.tw + P.life * 12));
      var rad = P.r * (1 - t * 0.25);
      var c = 'rgba(' + P.col + ',';
      var cx = P.front ? fx : bx;

      if (P.shape === 'rect') {
        cx.save(); cx.translate(P.x, P.y); cx.rotate(P.rot);
        cx.globalAlpha = a; cx.fillStyle = 'rgb(' + P.col + ')';
        cx.fillRect(-rad * 0.8, -rad * 0.45, rad * 1.6, rad * 0.9);
        cx.globalAlpha = 1; cx.restore();
      } else if (P.shape === 'petal') {
        cx.save(); cx.translate(P.x, P.y); cx.rotate(P.rot);
        cx.fillStyle = c + (a * 0.9) + ')';
        cx.beginPath(); cx.ellipse(0, 0, rad * 1.6, rad * 0.8, 0, 0, 6.2832); cx.fill();
        cx.restore();
      } else if (P.shape === 'line') {
        var sp = Math.sqrt(P.vx * P.vx + P.vy * P.vy) || 1, ln = Math.min(64, sp * 0.08);
        var g = cx.createLinearGradient(P.x, P.y, P.x - P.vx / sp * ln, P.y - P.vy / sp * ln);
        g.addColorStop(0, c + a + ')'); g.addColorStop(1, c + '0)');
        cx.strokeStyle = g; cx.lineWidth = rad; cx.lineCap = 'round';
        cx.beginPath(); cx.moveTo(P.x, P.y); cx.lineTo(P.x - P.vx / sp * ln, P.y - P.vy / sp * ln); cx.stroke();
      } else if (P.shape === 'star') {
        cx.save(); cx.translate(P.x, P.y); cx.rotate(P.rot * 0.25);
        cx.strokeStyle = c + a + ')'; cx.lineWidth = Math.max(0.7, rad * 0.32); cx.lineCap = 'round';
        cx.beginPath();
        cx.moveTo(-rad * 2.2, 0); cx.lineTo(rad * 2.2, 0);
        cx.moveTo(0, -rad * 2.2); cx.lineTo(0, rad * 2.2);
        cx.stroke(); cx.restore();
      } else {
        var rr = rad * 4, gr = cx.createRadialGradient(P.x, P.y, 0, P.x, P.y, rr);
        gr.addColorStop(0, c + a + ')'); gr.addColorStop(1, c + '0)');
        cx.fillStyle = gr; cx.beginPath(); cx.arc(P.x, P.y, rr, 0, 6.2832); cx.fill();
      }
    }

    // Nothing in the front layer may sit on the face. A soft hole rather than a
    // hard clip, so particles fade out against the portrait.
    var ph = this.photo;
    var hx = this.w * (ph.left + ph.width / 2) / 100;
    var hy = this.h * (ph.top + ph.height / 2) / 100;
    var hr = this.w * (ph.width / 100) * 0.5 * this.holePct;
    if (hr > 0) {
      var hg = fx.createRadialGradient(hx, hy, hr * 0.2, hx, hy, hr);
      hg.addColorStop(0, 'rgba(0,0,0,1)');
      hg.addColorStop(0.74, 'rgba(0,0,0,1)');
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      fx.globalCompositeOperation = 'destination-out';
      fx.fillStyle = hg;
      fx.beginPath(); fx.arc(hx, hy, hr, 0, 6.2832); fx.fill();
    }

    bx.globalCompositeOperation = 'source-over';
    fx.globalCompositeOperation = 'source-over';
  };

  Engine.prototype.stop = function () {
    this.parts.length = 0;
    if (this.ok) {
      this.bctx.clearRect(0, 0, this.w || 0, this.h || 0);
      this.fctx.clearRect(0, 0, this.w || 0, this.h || 0);
    }
    this.started = 0; this.fired = false;
  };

  // --- the shared loop ------------------------------------------------------
  var engines = new WeakMap();
  var live = [];
  var frozen = false;
  var raf = 0, last = 0;

  function engineFor(box) {
    var e = engines.get(box);
    if (!e) { e = new Engine(box); engines.set(box, e); }
    return e.ok ? e : null;
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    for (var i = live.length - 1; i >= 0; i--) {
      var e = live[i];
      if (!e.box.isConnected || !e.box.classList.contains('mvp-active')) {
        e.stop(); live.splice(i, 1); continue;
      }
      if (!e.resize()) continue;
      var t = now - e.started, f = t / e.duration;
      if (f > 1.08) { e.stop(); live.splice(i, 1); continue; }

      if (!REDUCED) {
        var rate = rateAt(f) * e.intensity;
        var whole = Math.floor(rate);
        for (var n = 0; n < whole; n++) e.emit();
        if (Math.random() < rate - whole) e.emit();
      }
      if (!e.fired && f >= 0.5 && !REDUCED) { e.fired = true; e.burst(150); }
      e.step(dt, f);
    }

    if (!live.length) { cancelAnimationFrame(raf); raf = 0; last = 0; }
  }

  function start(box) {
    var e = engineFor(box);
    if (!e || live.indexOf(e) >= 0) return;
    e.readSettings();
    if (!e.resize()) return;
    e.stop();
    e.started = performance.now();
    live.push(e);
    if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
  }

  // Build and size the two canvases as soon as the widget exists, not on the frame
  // the alert fires. Allocating two backing stores on the activation frame cost a
  // single 83 ms hitch in the measurement -- right at the entrance, where it shows.
  function prewarm(box) {
    var e = engineFor(box);
    if (e) e.resize();
  }

  function scan() {
    if (frozen) return;
    document.querySelectorAll('.mvp-celebration').forEach(prewarm);
    document.querySelectorAll('.mvp-celebration.mvp-active').forEach(start);
  }

  // `mvp-active` is put on the box by triggerBattleMvp and taken off again when
  // the alert is over, so the class is the signal -- not a load-order hook.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(scan).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class']
    });
  }

  // Between broadcasts everything resets. Only live:start -- live:end must never
  // clear anything, and vyra-session-ended is a logout, not a broadcast.
  addEventListener('vyra-live-session', function (event) {
    if (!event || !event.detail || event.detail.event !== 'live:start') return;
    while (live.length) live.pop().stop();
    if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; }
  });

  addEventListener('resize', function () { live.forEach(function (e) { e.resize(); }); });

  root.VyraMvpParticles = {
    start: start, scan: scan, profiles: PROFILES, rateAt: rateAt,
    // Observability, mirroring VyraSupernova.active(): a rig that cannot see the
    // particles cannot prove they were ever drawn, and an empty canvas renders at
    // a flawless 60 FPS.
    // Freeze for the visual suite, mirroring VyraAnimalGiftJars.still(). The particles
    // are decoration -- prefers-reduced-motion already hides them -- so the honest still
    // state is the one without them: stop every engine, drop the canvases, and let the
    // DOM return to exactly what it was before this module existed.
    still: function () {
      frozen = true;
      while (live.length) live.pop().stop();
      if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; }
      document.querySelectorAll('.mvc-stage').forEach(function (stage) {
        stage.querySelectorAll('canvas.mvc-fx').forEach(function (cv) { cv.remove(); });
        stage.classList.remove('mvc-fx-on');
      });
      return true;
    },
    active: function () { return live.length; },
    count: function () { var n = 0; live.forEach(function (e) { n += e.parts.length; }); return n; }
  };
  scan();
})(window);
