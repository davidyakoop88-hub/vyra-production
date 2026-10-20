(function () {
  'use strict';
  // Ett sidbyte borjar overst pa den nya sidan (granskning 2026-10-17 F09).
  //
  // ORSAKEN: Studion ar en sida, och det ar DOKUMENTET som scrollar. go() i studio.js byter bara
  // innehallet i #view, och extra-vyerna (Guide, Action & Event, Agencies ...) ritar sitt eget
  // innehall pa samma satt. Ingen av dem ror scrollen, sa nasta sida arvde den forras scrollY:
  // efter en FAQ langt ned i Guide oppnades Overlay mitt i katalogen. Fokus lag kvar pa body.
  //
  // LOSNINGEN lyssnar pa klick i sidomenyn — bade [data-view] och [data-extra] — i stallet for att
  // linda go() eller render(). render() ropas sent och oombett av manga moduler, och ett sadant
  // anrop ar inget sidbyte: det far inte hoppa till toppen. Efter klicket (nar knappens egen
  // handler har ritat) scrollas dokumentet till toppen och fokus flyttas till sidans rubrik,
  // #title, sa tangentbord och skarmlasare borjar dar ogat borjar.
  //
  // Overlay-laget (?overlay=1) har ingen sidomeny och ska inte rora nagonting.
  if (new URLSearchParams(location.search).has('overlay')) return;

  function tillSidansTopp() {
    window.scrollTo(0, 0);
    const rubrik = document.getElementById('title');
    if (!rubrik) return;
    if (!rubrik.hasAttribute('tabindex')) rubrik.setAttribute('tabindex', '-1');
    try { rubrik.focus({ preventScroll: true }); } catch (_) { rubrik.focus(); }
  }

  document.addEventListener('click', e => {
    const knapp = e.target && e.target.closest && e.target.closest('aside [data-view], aside [data-extra]');
    if (!knapp) return;
    setTimeout(tillSidansTopp, 0);
  });

  window.VyraSidbyte = { tillSidansTopp };
})();
