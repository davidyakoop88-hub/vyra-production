// landing-startsida.js — startsidan 2026-11-22 (Webbdesignern).
//
// Två saker:
//   1. Kontolagret: inloggningskortet bor i ett lager i stället för i hjälten. landing-login.js
//      byter flik och lägger markören; den här filen öppnar och stänger lagret (Esc, klick
//      utanför, ×), låser sidans scroll och lämnar tillbaka fokus till knappen man kom ifrån.
//   2. Hjältens två klipp (Gift Campaign och Fan Level Up) spelar bara när de syns. Vid minskad
//      rörelse står stillbilden kvar.
(function () {
  'use strict';

  const lager = document.querySelector('[data-konto-lager]');
  if (lager) {
    let tillbaka = null;
    const ruta = lager.querySelector('[role="dialog"]');
    function oppna() {
      if (lager.hidden || !document.documentElement.classList.contains('konto-oppet')) {
        tillbaka = document.activeElement;
        lager.hidden = false;
        document.documentElement.classList.add('konto-oppet');
      }
    }
    function stang() {
      lager.hidden = true;
      document.documentElement.classList.remove('konto-oppet');
      if (location.hash === '#logga-in' || location.hash === '#skapa-konto') {
        history.replaceState(null, '', location.pathname + location.search);
      }
      if (tillbaka && tillbaka.focus) tillbaka.focus({ preventScroll: true });
    }
    window.vyraKontoLager = { oppna, stang };
    if (!lager.hidden) oppna();   // öppnades redan via #logga-in innan den här filen laddats
    lager.querySelectorAll('[data-konto-stang]').forEach(el => el.addEventListener('click', stang));
    document.addEventListener('keydown', e => {
      if (lager.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); stang(); return; }
      if (e.key !== 'Tab' || !ruta) return;
      // håll fokus inne i rutan
      const fokuserbara = [...ruta.querySelectorAll('button,input,a[href],[tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.disabled && el.offsetParent !== null);
      if (!fokuserbara.length) return;
      const forsta = fokuserbara[0], sista = fokuserbara[fokuserbara.length - 1];
      if (e.shiftKey && document.activeElement === forsta) { e.preventDefault(); sista.focus(); }
      else if (!e.shiftKey && document.activeElement === sista) { e.preventDefault(); forsta.focus(); }
    });
  }

  const klipp = Array.from(document.querySelectorAll('video[data-hero-klipp]'));
  if (!klipp.length) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  function ladda(v) { if (!v.src && v.dataset.src) v.src = v.dataset.src; }
  function spela(v) { ladda(v); const p = v.play(); if (p && p.catch) p.catch(() => {}); }
  if (!('IntersectionObserver' in window)) { klipp.forEach(spela); return; }
  const io = new IntersectionObserver(poster => {
    poster.forEach(p => {
      if (p.isIntersecting && getComputedStyle(p.target).display !== 'none') spela(p.target);
      else if (!p.target.paused) p.target.pause();
    });
  }, { threshold: 0.25 });
  klipp.forEach(v => io.observe(v));
})();
