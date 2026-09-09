(function () {
  'use strict';
  // RUBRIK, NAMN OCH VÄRDE DRAS PÅ DUKEN (2026-09-09).
  //
  // DAVIDS ORD om Top Likes sex nummerfält: "det jag tycker om man göra bättre". Och efter demon:
  // "jag tycker om känslan jag vill den ska funka på top liks och top strake också".
  //
  // LÄGET FÖRE. Top Like kunde flytta sina tre textdelar, men bara genom att skriva sex tal i en
  // grupp på 285 px, utan att se resultatet förrän efteråt. Top Gift och Top Streak kunde inte
  // flytta något alls, trots att de har samma tre delar.
  //
  // SAMMA FÄLT SOM NUMMERRUTORNA. Draget skriver till `titleOffsetX/Y`, `nameOffsetX/Y` och
  // `valueOffsetX/Y` — precis de fält Top Likes panel redan använder. Därför fungerar ångra, därför
  // fortsätter nummerrutorna visa rätt värde, och därför behövde ingen renderare skrivas om.

  // Var de tre delarna sitter, per familj. Uppmätt i webbläsaren 2026-09-09 — markupen skiljer sig
  // helt mellan familjerna, vilket är samma skäl som widget-background.js anger för att inte
  // försöka hitta dem generiskt.
  //
  // Top Like är en LISTA: dess `name` och `value` matchar fem element, ett per rad, och offseten
  // gäller alla fem samtidigt. Det är precis vad nummerrutorna gör i dag.
  const DELAR = {
    templateTopGift: {
      title: '.vyra-gift-title',
      name: '.topgift-copy > strong',
      value: '.topgift-copy > em',
    },
    templateTopStreak: {
      title: '.streak-copy > small',
      name: '.streak-copy > strong',
      value: '.streak-score',
    },
    templateTopLike: {
      title: ':scope > h3',
      name: '.toplike-row > span',
      value: '.toplike-row > em',
    },
  };

  const ROLLER = ['title', 'name', 'value'];
  const SNAPP = 8;          // px till mittlinjen; samma storleksordning som widgetsnappen

  const falt = (roll, axel) => roll + 'Offset' + axel;

  function delarFor(w) {
    return (w && DELAR[w.type]) || null;
  }

  // Märker elementen så att både draget och proven kan hitta dem, och lägger på offseten.
  //
  // Top Like renderar redan transform i sin egen HTML. Att sätta samma värde inline är ofarligt —
  // det är samma tal ur samma fält — och gör att de tre familjerna beter sig likadant utan att
  // någon renderare behöver röras.
  function markOchApplicera(rot, w) {
    const karta = delarFor(w);
    if (!karta) return;
    for (const roll of ROLLER) {
      const x = Number(w[falt(roll, 'X')]) || 0;
      const y = Number(w[falt(roll, 'Y')]) || 0;
      for (const el of rot.querySelectorAll(karta[roll])) {
        el.dataset.textdel = roll;
        if (x || y) el.style.setProperty('transform', `translate(${x}px,${y}px)`, 'important');
        else if (el.style.transform) el.style.removeProperty('transform');
      }
    }
  }

  function appliceraAlla() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return;
    for (const w of state.widgets) {
      if (!delarFor(w)) continue;
      const rot = document.querySelector(`[data-id="${w.id}"]`);
      if (rot) markOchApplicera(rot, w);
    }
  }

  // ---- draget --------------------------------------------------------------------------------
  let drag = null;

  function widgetFor(el) {
    const rot = el.closest('[data-id]');
    if (!rot || typeof state === 'undefined') return null;
    return state.widgets.find(w => String(w.id) === rot.dataset.id) || null;
  }

  document.addEventListener('pointerdown', function (e) {
    if (typeof view !== 'undefined' && view !== 'editor') return;
    const del = e.target.closest && e.target.closest('[data-textdel]');
    if (!del) return;
    const w = widgetFor(del);
    if (!w || !delarFor(w)) return;

    // FÖRST NÄR WIDGETEN ÄR VALD. Ett klick på en ovald widget ska välja den, som förut — annars
    // skulle man flytta en textdel i en widget man inte ens tittade på.
    if (typeof selected === 'undefined' || String(selected) !== String(w.id)) return;

    // STOPPAR WIDGETENS EGEN DRAGNING. Duken lyssnar på samma pointerdown för att flytta hela
    // widgeten; utan det här skulle båda röra sig samtidigt och texten aldrig hamna rätt.
    e.preventDefault();
    e.stopPropagation();

    const roll = del.dataset.textdel;
    drag = {
      roll, w, del,
      startX: e.clientX, startY: e.clientY,
      x0: Number(w[falt(roll, 'X')]) || 0,
      y0: Number(w[falt(roll, 'Y')]) || 0,
      rorde: false,
    };
    try { del.setPointerCapture(e.pointerId) } catch (_) {}
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    let x = drag.x0 + (e.clientX - drag.startX);
    let y = drag.y0 + (e.clientY - drag.startY);

    // Skift stänger av snappen, samma tangent som när man drar en widget.
    if (!e.shiftKey) {
      if (Math.abs(x) < SNAPP) x = 0;
      if (Math.abs(y) < SNAPP) y = 0;
    }

    drag.w[falt(drag.roll, 'X')] = Math.round(x);
    drag.w[falt(drag.roll, 'Y')] = Math.round(y);
    drag.rorde = true;

    const rot = drag.del.closest('[data-id]');
    if (rot) markOchApplicera(rot, drag.w);
  }, true);

  function slapp() {
    if (!drag) return;
    const rorde = drag.rorde;
    drag = null;
    // Sparar först vid släppet, inte under dragningen: en skrivning per drag i stället för en per
    // pixel, och samma mönster som resten av panelen följer.
    if (rorde && typeof save === 'function') save();
  }
  document.addEventListener('pointerup', slapp, true);
  document.addEventListener('pointercancel', slapp, true);

  // ---- inhakning -----------------------------------------------------------------------------
  if (typeof bind === 'function') {
    const foregaende = bind;
    bind = function () { const ut = foregaende.apply(this, arguments); appliceraAlla(); return ut };
  }

  // Skyddsnät för overlay-sidan, som kan rendera innan den här filen hunnit koppla in sig — samma
  // kapplöpning som widget-background.js dokumenterar.
  new MutationObserver(appliceraAlla).observe(document.documentElement, { childList: true, subtree: true });
  appliceraAlla();

  window.VyraDraText = { DELAR, markOchApplicera, appliceraAlla };
})();
