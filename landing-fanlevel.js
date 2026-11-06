// landing-fanlevel.js — videorna i "Nytt i VYRA: Fan Level Up" på framsidan.
//
// Sex tysta videor i loop är billiga var för sig men inte tillsammans på en mobil: de laddas och
// spelar bara medan de syns (IntersectionObserver), och pausas när de lämnar bilden. Vid reducerad
// rörelse spelar ingen av dem — stillbilden (slutbilden) står kvar. Utan IntersectionObserver
// spelar de som vanliga autoplay-videor.
(function () {
  'use strict';
  const videor = Array.from(document.querySelectorAll('.fanniva video[data-src]'));
  if (!videor.length) return;
  const reducerad = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducerad) return;
  const ladda = v => { if (!v.getAttribute('src')) { v.setAttribute('src', v.dataset.src); v.load(); } };
  const spela = v => { ladda(v); const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  if (!('IntersectionObserver' in window)) { videor.forEach(spela); return; }
  const io = new IntersectionObserver(poster => {
    poster.forEach(p => { if (p.isIntersecting) spela(p.target); else if (!p.target.paused) p.target.pause(); });
  }, { rootMargin: '120px 0px', threshold: 0.25 });
  videor.forEach(v => io.observe(v));
})();
