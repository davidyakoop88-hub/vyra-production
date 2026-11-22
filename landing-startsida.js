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

  provaRutan();

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

  // 3. PROVA EN EFFEKT DIREKT (idé 1, 2026-11-22). Besökaren trycker på en gåva och ser Gift
  //    Campaign spela. Inget konto, inga anrop till servern: bara de tre inspelningarna som redan
  //    ligger på sidan. Alla tre är 16 s från samma riktiga gåvohändelser i OBS — sekund 0–8 har
  //    Lion i fokus, sekund 8–16 Gorilla (Gorilla går 0 → 1, "+1"). Därför spelar en gåva bara SITT
  //    avsnitt och stannar sedan. Ingen autostart: inget spelar förrän besökaren trycker, så
  //    prefers-reduced-motion respekteras (ett tryck är ett eget val).
  function provaRutan() {
    const rot = document.getElementById('prova');
    const video = rot && rot.querySelector('[data-prova-video]');
    if (!video) return;
    const film = video.parentElement;
    const namnEl = rot.querySelector('[data-prova-namn]');
    const statusEl = rot.querySelector('[data-prova-status]');
    const MAPP = 'assets/giftcampaign/hemsida/', VER = '?v=20261110-1';
    const DESIGN = { fokus: 'Fokus', classic: 'Classic', flode: 'Gåvoflöde' };
    const AVSNITT = { lion: [0, 8], gorilla: [8, 16] };
    const GAVA = { lion: 'Lion', gorilla: 'Gorilla' };
    let design = 'fokus', gava = null, slut = 0;

    function markera(sel, attr, varde) {
      rot.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === varde)));
    }
    function stoppa() { if (!video.paused) video.pause(); film.classList.remove('spelar'); }
    function spela() {
      if (!gava) return;
      const [start, stopp] = AVSNITT[gava];
      slut = stopp - 0.35;
      const kor = () => {
        try { video.currentTime = start + 0.05; } catch (e) { /* metadata saknas ännu */ }
        const p = video.play();
        if (p && p.catch) p.catch(() => film.classList.remove('spelar'));
        film.classList.add('spelar');
      };
      // preload="none" laddar ingenting förrän någon trycker. Då hämtas klippet (≈200 kB) och spolas
      // till gåvans avsnitt när längden är känd.
      if (video.readyState >= 1) kor();
      else { video.addEventListener('loadedmetadata', kor, { once: true }); video.preload = 'auto'; video.load(); }
      statusEl.textContent = GAVA[gava] + ' spelar sin egen video';
    }
    function bytDesign(ny) {
      design = ny;
      stoppa();
      video.src = MAPP + ny + '.mp4' + VER;
      video.poster = MAPP + ny + '.webp' + VER;
      video.setAttribute('aria-label', 'Gift Campaign i designen ' + DESIGN[ny]);
      namnEl.textContent = DESIGN[ny];
      markera('[data-prova-design]', 'data-prova-design', ny);
      if (gava) spela(); else statusEl.textContent = 'Väntar på en gåva';
    }
    video.addEventListener('timeupdate', () => {
      if (slut && video.currentTime >= slut) { video.pause(); slut = 0; film.classList.remove('spelar'); }
    });
    video.addEventListener('ended', () => film.classList.remove('spelar'));
    rot.querySelectorAll('[data-prova-gava]').forEach(b => b.addEventListener('click', () => {
      gava = b.getAttribute('data-prova-gava');
      markera('[data-prova-gava]', 'data-prova-gava', gava);
      if (!video.getAttribute('src')) video.src = MAPP + design + '.mp4' + VER;
      spela();
    }));
    rot.querySelectorAll('[data-prova-design]').forEach(b => b.addEventListener('click', () => {
      const ny = b.getAttribute('data-prova-design');
      if (ny !== design || !video.getAttribute('src')) bytDesign(ny);
    }));
    // Rutan rullas ur bild: stoppa, så att inget spelar dolt.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(p => { if (!p[0].isIntersecting) stoppa(); }, { threshold: 0 }).observe(rot);
    }
  }
})();
