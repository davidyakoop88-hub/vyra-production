// fan-hjarta.js — Fan Level Up: hjärtmodellerna (sex designer, godkända av David 2026-11-05).
//
// VAD FILEN ÄR. En liten motor som sex fristående Fan Level Up-modeller delar: Ascend, Heart Reveal,
// Hjärtats gåva, Golden Stage, Heart Lift och Luminous. Varje modell bor i en egen syskonfil
// (fan-hjarta-<id>.js + .css) och registrerar sig här med markup, tidslinje och hjärtats flygning.
// Prototyperna (Codex-mappen 2026-11-01, "vyra-fan-level-designs-claude") var fristående sidor med
// lager av överskrivningar och globala id:n; här är varje modell skopad under .fhm-<id> och kan
// stå i flera exemplar på samma duk.
//
// LIVSCYKELN ÄR FAN LEVEL UP:S EGEN. Ingenting nytt för kön, triggern eller uttoningen:
//   * fanLevelHtml (media.js) ersätts BARA för de sex modellerna — media.js omslag kring wh
//     (dold widget, lager, markering) gäller som för de åtta äldre modellerna,
//   * fanSpelaPa (media.js) gör allt den alltid gjort (fan-active, visningstid, fan-exit, nivåvideo)
//     och motorn startar tidslinjen efteråt på samma låda. Triggern, fan-level-session.js kö och
//     ▶ Testa widget (vyra-alert-panel.js) går alla genom fanSpelaPa.
//
// HJÄRTAT ÄR ETT ELEMENT I TAGET (David: "inga dubbla hjärtan"). Modellen har ett introhjärta
// (.fhm-hjarta) och ett märke vid nivåsiffran (.fhm-markhjarta). Vid flygningens start räknas
// sträckan från introhjärtats NUVARANDE läge, vinkel och storlek till märkets ruta, och SAMMA
// element flyger dit med den fart det redan hade (ingen klon, ingen teleportering). I landningen
// byts det mot märket i exakt samma ruta — båda har bildens egna proportioner (640×409), så det
// som syns är ett hjärta som lägger sig, inte två som byter plats. Heart Reveal flyger inte: där
// löses introhjärtat upp när profilen kommer fram, och märket kommer senare med nivån.
//
// RITNINGEN ÖVERLEVER render(). render() bygger om duken vid varje ändring (en gåva till Top Gift
// räcker). En pågående visning sparas per widget-id (aktiva) och den nya lådan fortsätter på samma
// ställe i tidslinjen, med egen uttoning — annars hade en gåva mitt i ett firande släckt det.
//
// INGET LJUD. Modellerna har inga ljud, och motorn skapar inga ljudelement.
(function (root) {
  'use strict';
  const doc = root.document;
  if (!doc || root.VyraFanHjarta) return;

  const HJARTA = 'assets/fanhjarta/guldhjarta.webp?v=20261105-1';
  const MARG = 60;                 // partikelduken sträcker sig så här långt utanför scenen (scen-px)
  const FALLBACK = 'assets/images/test-profile.svg';
  const MODELLER = Object.create(null);
  const ordning = [];
  const aktiva = new Map();        // widget-id -> { t0, data, visaMs, utMs }
  const korning = new WeakMap();   // låda -> { timers, raf, flykt, ... }
  const levande = new Set();       // lådor med en körning (för städningen när de lämnar DOM)

  const nu = () => (root.performance && performance.now ? performance.now() : Date.now());
  const reducerad = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const S = () => root.VyraSafe;
  const esc = v => (S() ? S().text(v) : String(v == null ? '' : v).replace(/[&<>"'`]/g, c => '&#' + c.charCodeAt(0) + ';'));
  const tal = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

  // ---- Registret --------------------------------------------------------------------------------
  // def: { namn, html(d), langd (ms till vila), visning (s, förvald visningstid), bredd (px),
  //        scen: {b, h}, flygning: {start, langd} | null, partiklar: [{t, n, kraft, x, y, farger}] }
  function registrera(id, def) {
    if (!/^[a-z]+$/.test(id)) throw new Error('fan-hjarta: ogiltigt modell-id ' + id);
    if (!def || typeof def.html !== 'function' || !def.namn) throw new Error('fan-hjarta: ' + id + ' saknar namn eller html');
    if (!(def.langd > 0) || !(def.visning >= 2 && def.visning <= 15)) throw new Error('fan-hjarta: ' + id + ' har ogiltig längd/visningstid');
    const scen = Object.assign({ b: 430, h: 610 }, def.scen || {});
    MODELLER[id] = Object.freeze(Object.assign({}, def, { id, scen, partiklar: def.partiklar || [], flygning: def.flygning || null }));
    if (!ordning.includes(id)) ordning.push(id);
    try { if (typeof render === 'function' && typeof state !== 'undefined') render(); } catch (_) { /* ritas vid nästa render */ }
  }
  const ar = w => !!(w && w.type === 'templateFanLevel' && MODELLER[w.fanLayout]);

  // ---- Data -------------------------------------------------------------------------------------
  function niva(v, d) { return Math.max(1, Math.min(50, Math.round(tal(v, d)) || d)); }
  function namnAv(v) { const n = String(v == null || v === '' ? 'HeartRiser' : v).trim(); return n.startsWith('@') ? n : '@' + n; }
  function bildAv(v) {
    const reserv = typeof root.vyraReservbild === 'function' ? root.vyraReservbild(v) : v;
    return S() ? S().src(reserv, FALLBACK) : FALLBACK;
  }
  function dataAv(w, e) {
    e = e || {};
    const till = niva(e.level, niva(w.fanLevel, 12));
    const fran = Math.max(0, Math.min(till - 1, Math.round(tal(e.fromLevel, till - 1))));
    return { namn: namnAv(e.name || w.fanName), niva: till, fran, bild: bildAv(e.profileImage || w.profileImage) };
  }
  // Det modellen får: allt redan escapat för HTML.
  function mallData(w, data) {
    return {
      namn: esc(data.namn), niva: data.niva, fran: data.fran, bild: esc(data.bild), hjarta: HJARTA,
      rubrik: esc(w.fanHeadline && w.fanHeadline !== 'FAN LEVEL UP' ? w.fanHeadline : ''),
      meddelande: esc(w.fanMessage && w.fanMessage !== 'TROGEN SUPPORTER' ? w.fanMessage : ''),
    };
  }
  // En ny tittare in i en redan ritad låda: bara textnoder och bild-src, ingen ny markup.
  function fyll(box, data) {
    box.querySelectorAll('[data-fhm="namn"]').forEach(n => { n.textContent = data.namn; });
    box.querySelectorAll('[data-fhm="niva"]').forEach(n => { n.textContent = String(data.niva); });
    box.querySelectorAll('[data-fhm="fran"]').forEach(n => { n.textContent = String(data.fran); });
    box.querySelectorAll('img[data-fhm="bild"]').forEach(n => { if (n.getAttribute('src') !== data.bild) n.setAttribute('src', data.bild); });
    langtNamn(box, data.namn);
  }
  // Långa namn krymper i stället för att klippas (samma golv som fan-level-50.js: halva storleken).
  function langtNamn(box, namn) {
    const n = Array.from(String(namn || '')).length, def = MODELLER[box.dataset.fhmModell];
    const ryms = (def && def.namnRyms) || 14;
    box.style.setProperty('--fhm-namn-k', String(n <= ryms ? 1 : Math.max(0.5, Math.round(ryms * 100 / n) / 100)));
  }

  // ---- Ritningen --------------------------------------------------------------------------------
  function html(w) {
    const def = MODELLER[w.fanLayout];
    const pagar = aktiva.get(w.id);
    const data = pagar ? pagar.data : dataAv(w);
    const bredd = Math.max(120, Math.min(1200, tal(w.width, def.bredd || 300)));
    const k = bredd / def.scen.b, hojd = Math.round(def.scen.h * k);
    const zoom = Math.max(0.2, Math.min(4, tal(w.widgetScale, 1)));
    const vald = typeof selected !== 'undefined' && selected === w.id;
    const n = Array.from(data.namn).length, ryms = def.namnRyms || 14;
    const namnK = n <= ryms ? 1 : Math.max(0.5, Math.round(ryms * 100 / n) / 100);
    const klasser = ['widget', 'fan-level-up', 'fhm', 'fhm-' + def.id, 'fan-layout-' + def.id];
    if (vald) klasser.push('selected');
    if (pagar) klasser.push('fan-active', 'fhm-ater');
    const stil = `left:${tal(w.x, 0)}px;top:${tal(w.y, 0)}px;width:${bredd}px;height:${hojd}px;zoom:${zoom};`
      + `--fhm-k:${k.toFixed(4)};--fhm-namn-k:${namnK}`;
    return `<div class="${klasser.join(' ')}" data-id="${esc(w.id)}" data-fhm-modell="${def.id}" style="${stil}">`
      + `<div class="fhm-scen" style="width:${def.scen.b}px;height:${def.scen.h}px">`
      + def.html(mallData(w, data))
      + '<canvas class="fhm-partiklar" aria-hidden="true"></canvas></div>'
      + '<video class="level-up-video" muted playsinline></video>'
      + (vald ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  }

  // ---- Uppspelningen ----------------------------------------------------------------------------
  function tomDuk(k) { const c = k.ctx; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, k.canvas.width, k.canvas.height); c.restore(); }
  function stoppa(box) {
    const k = korning.get(box);
    if (!k) return;
    k.timers.forEach(t => clearTimeout(t));
    if (k.raf) cancelAnimationFrame(k.raf);
    if (k.flykt) { try { k.flykt.cancel(); } catch (_) {} }
    if (k.ctx) tomDuk(k);
    korning.delete(box);
    levande.delete(box);
  }
  function vila(box) {
    stoppa(box);
    box.classList.remove('fhm-spelar', 'fhm-landat', 'fhm-flyger', 'fhm-ater');
  }

  // Startar (eller fortsätter) tidslinjen `forflutet` ms in.
  function starta(box, forflutet) {
    const def = MODELLER[box.dataset.fhmModell];
    if (!def) return;
    stoppa(box);
    const scen = box.querySelector('.fhm-scen');
    const k = { timers: [], raf: 0, flykt: null, partiklar: [], fart: { x: 0, y: 0 }, forra: null, skurar: new Set(), t0: nu() - forflutet };
    korning.set(box, k);
    levande.add(box);
    box.classList.remove('fhm-spelar', 'fhm-landat', 'fhm-flyger');
    if (reducerad()) { box.classList.add('fhm-landat'); return; }
    void box.offsetWidth;                          // ny start även om klassen nyss satt
    box.classList.add('fhm-spelar');
    if (forflutet > 0 && scen.getAnimations) {
      scen.getAnimations({ subtree: true }).forEach(a => { try { a.currentTime = forflutet; } catch (_) {} });
    }
    const f = def.flygning;
    if (f) {
      if (forflutet >= f.start + f.langd) box.classList.add('fhm-landat');
      else if (forflutet >= f.start) {
        // Flygningen räknas från introts pose VID flygningens start, inte från posen "nu": introt kan
        // fortsätta efter att flygningen tagit över (Heart Lift), och en omritning hoppade då ~4 px.
        const h = box.querySelector('.fhm-hjarta');
        if (h && h.getAnimations) h.getAnimations().forEach(a => { try { a.currentTime = f.start; } catch (_) {} });
        flyg(box, k, forflutet - f.start);
      }
      else k.timers.push(setTimeout(() => flyg(box, k, 0), f.start - forflutet));
    } else if (def.landning != null) {
      if (forflutet >= def.landning) box.classList.add('fhm-landat');
      else k.timers.push(setTimeout(() => box.classList.add('fhm-landat'), def.landning - forflutet));
    }
    if (def.partiklar.length || f) {
      k.canvas = scen.querySelector('.fhm-partiklar');
      k.raf = requestAnimationFrame(t => ruta(box, k, def, t));
    }
  }

  // En bildruta: hjärtats fart före flygningen och partiklarna. Loopen lever bara medan något rör sig.
  function ruta(box, k, def, nuMs) {
    if (korning.get(box) !== k || !box.isConnected) return;
    const t = nuMs - k.t0, f = def.flygning;
    if (f && !k.flykt && t >= f.start - 260 && t < f.start) mataFart(box, k, nuMs);
    for (const s of def.partiklar) {
      if (k.skurar.has(s) || t < s.t) continue;
      k.skurar.add(s);
      if (t - s.t < 1200) skur(k, s);
    }
    ritaPartiklar(k, Math.min(0.04, Math.max(0.001, ((nuMs - (k.forraRuta || nuMs)) / 1000) || 0.016)), t);
    k.forraRuta = nuMs;
    const sistaSkur = def.partiklar.reduce((m, s) => Math.max(m, s.t), 0);
    const kvar = k.partiklar.length || t < sistaSkur || (f && !k.flykt && t < f.start);
    if (kvar) k.raf = requestAnimationFrame(x => ruta(box, k, def, x));
    else { k.raf = 0; if (k.ctx) tomDuk(k); }
  }

  // Farten mäts i scenens egna px, så flygningen fortsätter i samma riktning som introt rörde sig.
  function skala(scen) { const r = scen.getBoundingClientRect(); return r.width && scen.offsetWidth ? r.width / scen.offsetWidth : 0; }
  function mataFart(box, k, nuMs) {
    const h = box.querySelector('.fhm-hjarta'), scen = box.querySelector('.fhm-scen');
    if (!h || !scen) return;
    const r = h.getBoundingClientRect(), s = skala(scen) || 1;
    const p = { x: (r.left + r.width / 2) / s, y: (r.top + r.height / 2) / s, t: nuMs };
    if (k.forra) {
      const dt = (p.t - k.forra.t) / 1000;
      if (dt > 0 && dt < 0.1) k.fart = { x: (p.x - k.forra.x) / dt, y: (p.y - k.forra.y) / dt };
    }
    k.forra = p;
  }

  function iScen(el, scen) {
    let x = 0, y = 0, n = el;
    while (n && n !== scen) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return n === scen ? { x, y } : null;
  }
  // Offset-kedjan ger hela pixlar — i en centrerad flexrad blev landningen upp till 0,5 px fel
  // (Golden Stage, uppmätt 2026-11-05). Står inget mellan märket och scenen under en transform just
  // nu är skärmrutan exakt och används; annars offset-kedjan (viloläget, se ovan).
  function malpunkt(m, scen, sr, s) {
    for (let n = m.parentElement; n && n !== scen; n = n.parentElement) {
      const cs = root.getComputedStyle(n);
      if ((cs.transform && cs.transform !== 'none') || cs.translate !== 'none' || cs.scale !== 'none' || cs.rotate !== 'none') return iScen(m, scen);
    }
    const mt = root.getComputedStyle(m).transform;
    if (mt && mt !== 'none') return iScen(m, scen);
    const r = m.getBoundingClientRect();
    return { x: (r.left - sr.left) / s, y: (r.top - sr.top) / s };
  }
  function flyg(box, k, forskjutning) {
    if (korning.get(box) !== k) return;
    const def = MODELLER[box.dataset.fhmModell], scen = box.querySelector('.fhm-scen');
    const h = box.querySelector('.fhm-hjarta'), m = box.querySelector('.fhm-markhjarta');
    const land = () => { box.classList.add('fhm-landat'); k.flykt = null; };
    const s = skala(scen);
    if (!h || !m || !s || typeof h.animate !== 'function') { land(); return; }
    // MÅLET ÄR MÄRKETS VILOLÄGE, inte dess ruta på skärmen just nu: nivåraden har ofta sin egen
    // entré igång när hjärtat lyfter (Ascend: skalad 2× och genomskinlig vid 2,05 s), och en flykt
    // mot den rutan landade dubbelt så stor och 60 px fel (uppmätt 2026-11-05). Layoutens läge
    // (offset-kedjan upp till scenen) bryr sig inte om transformer — det är där märket står i vila.
    // STARTEN ÄR HJÄRTATS VERKLIGA LÄGE, med vinkel och storlek, så att flygningen börjar exakt där
    // introt slutade. Båda räknas i scenens egna px; introhjärtat får inte ha transformerade förfäder
    // mellan sig och scenen.
    const a = h.getBoundingClientRect(), sr = scen.getBoundingClientRect(), mal = malpunkt(m, scen, sr, s);
    if (!a.width || !mal || !m.offsetWidth || !h.offsetWidth) { land(); return; }
    const t = root.getComputedStyle(h).transform;
    const mx = t && t !== 'none' ? new DOMMatrix(t) : new DOMMatrix();
    const vinkel = Math.atan2(mx.b, mx.a), fran = Math.hypot(mx.a, mx.b) || 1;
    const till = m.offsetWidth / h.offsetWidth;
    const dx = mal.x + m.offsetWidth / 2 - (a.left + a.width / 2 - sr.left) / s;
    const dy = mal.y + m.offsetHeight / 2 - (a.top + a.height / 2 - sr.top) / s;
    const sek = def.flygning.langd / 1000, tak = def.flygning.fartTak || 140;
    // Farten sparas med visningen: en omritning mitt i flygningen räknar om banan med SAMMA fart, så
    // att kurvan inte ändras 1–4 px i första bildrutan efter render() (Hjärtats gåva, 2026-11-05).
    const pagar = aktiva.get(box.dataset.id);
    const fart = forskjutning && pagar && pagar.fart ? pagar.fart : forskjutning ? { x: 0, y: 0 } : k.fart;
    if (!forskjutning && pagar) pagar.fart = { x: k.fart.x, y: k.fart.y };
    let vx = Math.max(-tak, Math.min(tak, fart.x)), vy = Math.max(-tak, Math.min(tak, fart.y));
    // Farten bärs in som en puckel (störst vid en tredjedel, 4/27 av fart × tid). Är den stor mot
    // sträckan som återstår skjuter hjärtat förbi märket och vänder (Luminous: 13 px förbi). Puckeln
    // får därför vara högst en tredjedel av sträckan.
    const puckel = Math.hypot(vx, vy) * sek * 4 / 27, kvar = Math.hypot(dx, dy) / 3;
    if (puckel > kvar && puckel > 0) { const f = kvar / puckel; vx *= f; vy *= f; }
    const bild = [];
    for (let i = 0; i <= 60; i++) {
      const u = i / 60, e = u * u * u * (u * (u * 6 - 15) + 10), puckel = u * (1 - u) * (1 - u);
      const x = mx.e + dx * e + vx * sek * puckel, y = mx.f + dy * e + vy * sek * puckel;
      bild.push({ offset: u, opacity: 1, transform: `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${(vinkel * (1 - e)).toFixed(4)}rad) scale(${(fran + (till - fran) * e).toFixed(4)})` });
    }
    h.getAnimations().forEach(x => x.cancel());
    box.classList.add('fhm-flyger');
    k.flykt = h.animate(bild, { duration: def.flygning.langd, easing: 'linear', fill: 'forwards' });
    // Starttiden sätts direkt. En ny animation väntar annars på nästa bildruta innan den börjar, och
    // hjärtat stod still i två bildrutor när flygningen tog över (uppmätt 2026-11-05).
    const tid = doc.timeline && doc.timeline.currentTime;
    if (tid != null) k.flykt.startTime = tid - (forskjutning || 0);
    else if (forskjutning) k.flykt.currentTime = forskjutning;
    k.flykt.onfinish = () => { if (korning.get(box) === k) { box.classList.remove('fhm-flyger'); land(); } };
  }

  // ---- Partiklar (canvas i scenens koordinater) ---------------------------------------------------
  function skur(k, s) {
    if (!k.ctx) {
      const c = k.canvas, scen = c && c.parentElement;
      if (!c || !c.getContext) return;
      const q = Math.min(2, Math.max(1, (root.devicePixelRatio || 1) * (skala(scen) || 1)));
      c.width = Math.round((scen.offsetWidth + 2 * MARG) * q); c.height = Math.round((scen.offsetHeight + 2 * MARG) * q);
      k.ctx = c.getContext('2d'); if (!k.ctx) return;
      k.ctx.setTransform(q, 0, 0, q, MARG * q, MARG * q); k.q = q;
    }
    const farger = s.farger || ['#ffda91'];
    for (let i = 0; i < s.n; i++) {
      const v = i * 2.39996, f = 60 + (i % 9) * s.kraft;
      k.partiklar.push({ x: s.x, y: s.y, vx: Math.cos(v) * f, vy: Math.sin(v) * (60 + (i % 7) * s.kraft) - (s.lyft == null ? 45 : s.lyft),
        liv: 1, stl: 1.3 + (i % 4) * 0.6, snurr: i * 0.7, farg: farger[i % farger.length], tyngd: s.tyngd == null ? 55 : s.tyngd, avtag: s.avtag || 0.32 });
    }
  }
  function ritaPartiklar(k, dt, t) {
    if (!k.ctx || !k.partiklar.length) return;
    const c = k.ctx, w = k.canvas.width / k.q, h = k.canvas.height / k.q;
    c.clearRect(-MARG, -MARG, w, h);
    for (const p of k.partiklar) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.tyngd * dt; p.vx *= 0.994; p.liv -= dt * p.avtag;
      c.save(); c.globalAlpha = Math.max(0, p.liv) * 0.8; c.translate(p.x, p.y); c.rotate(p.snurr + t / 1000);
      c.fillStyle = p.farg; c.fillRect(-p.stl / 2, -p.stl, p.stl, p.stl * 2.3); c.restore();
    }
    k.partiklar = k.partiklar.filter(p => p.liv > 0 && p.y < h - MARG + 40);
  }

  // ---- Kopplingen till Fan Level Up --------------------------------------------------------------
  function spela(box, w, event) {
    const def = MODELLER[box.dataset.fhmModell];
    if (!def || !w) return;
    const data = dataAv(w, event);
    fyll(box, data);
    const visaMs = Math.max(0, tal(w.fanDuration, def.visning)) * 1000, utMs = Math.max(0, tal(w.fanExitDuration, 0.5)) * 1000;
    // ▶ Testa widget spelar på en klon med egen klocka och ska inte lämna något efter sig i aktiva.
    // `state` är studio.js toppnivå-let: nåbar som namn, aldrig som window.state.
    let lista = [];
    try { lista = typeof state !== 'undefined' && state && Array.isArray(state.widgets) ? state.widgets : []; } catch (_) {}
    const klon = !box.isConnected || !lista.some(x => x === w);
    if (!klon) aktiva.set(w.id, { t0: nu(), data, visaMs, utMs });
    starta(box, 0);
    const k = korning.get(box);
    if (k) k.timers.push(setTimeout(() => { if (aktiva.get(w.id) && aktiva.get(w.id).data === data) aktiva.delete(w.id); vila(box); }, visaMs + utMs + 60));
  }

  // En omritad låda mitt i en visning: fortsätt där den var, och tona ut på samma tid som förut.
  function aterupptag(box) {
    const id = box.dataset.id, p = aktiva.get(id);
    box.classList.remove('fhm-ater');
    if (!p) { box.classList.remove('fan-active'); return; }
    const forflutet = nu() - p.t0;
    if (forflutet >= p.visaMs + p.utMs) { aktiva.delete(id); box.classList.remove('fan-active'); return; }
    starta(box, forflutet);
    const k = korning.get(box);
    if (!k) return;
    box.style.setProperty('--fan-exit-duration', p.utMs + 'ms');
    if (forflutet >= p.visaMs) box.classList.add('fan-exit');
    else k.timers.push(setTimeout(() => box.classList.add('fan-exit'), p.visaMs - forflutet));
    k.timers.push(setTimeout(() => {
      if (aktiva.get(id) === p) aktiva.delete(id);
      box.classList.remove('fan-active', 'fan-exit', 'playing-level-video');
      vila(box);
    }, p.visaMs + p.utMs - forflutet));
  }

  // Lådor som lämnar DOM städas (timers, rAF, flykt); nya lådor som ritats om mitt i en visning tas upp.
  function bevaka() {
    if (!root.MutationObserver || !doc.body) return;
    new MutationObserver(lista => {
      for (const m of lista) {
        m.removedNodes.forEach(n => { if (n.nodeType === 1) levande.forEach(b => { if (b === n || n.contains(b)) if (!b.isConnected) stoppa(b); }); });
        m.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          const lador = n.classList && n.classList.contains('fhm-ater') ? [n] : (n.querySelectorAll ? n.querySelectorAll('.fhm-ater') : []);
          lador.forEach(aterupptag);
        });
      }
    }).observe(doc.body, { childList: true, subtree: true });
  }

  function installera() {
    if (typeof root.fanLevelHtml === 'function' && !root.fanLevelHtml.__fhm) {
      const forra = root.fanLevelHtml;
      const ny = function (w) { return ar(w) ? html(w) : forra.apply(this, arguments); };
      ny.__fhm = true;
      root.fanLevelHtml = ny;
    }
    if (typeof root.fanSpelaPa === 'function' && !root.fanSpelaPa.__fhm) {
      const forra = root.fanSpelaPa;
      const ny = function (box, w) {
        const r = forra.apply(this, arguments);
        if (box && box.classList && box.classList.contains('fhm')) spela(box, w, arguments[2]);
        return r;
      };
      ny.__fhm = true;
      root.fanSpelaPa = ny;
    }
  }

  installera();
  if (doc.body) bevaka(); else doc.addEventListener('DOMContentLoaded', bevaka, { once: true });

  root.VyraFanHjarta = Object.freeze({
    registrera, html, spela, starta, stoppa, vila, dataAv, ar,
    modeller: () => ordning.slice(),
    modell: id => MODELLER[id] || null,
    aktiva: () => new Map(aktiva),
    HJARTA,
  });
})(window);
