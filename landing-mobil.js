// landing-mobil.js — 3D-lutningen på framsidans mobilbild.
//
// Bilden bär TVÅ rörelser som aldrig delar transform (komposör-läxan: två skrivare på samma
// property klobbrar varandra tyst):
//   - .hero-mobil       CSS-animationen vyraSvavHoger (styles.css) — svävet i 3D, JS rör den aldrig
//   - .hero-mobil-scen  perspektivlutningen mot muspekaren — bor HÄR, skrivs bara av denna fil
//
// Perspektivet ligger som CSS-EGENSKAP på scenen (styles.css) — perspective() i transform
// hade bara gällt scenen själv och lämnat barnen platta. Här skrivs bara rotationerna.
// Lutningen följer pekaren över hela heron (inte bara över bilden — då hade den mest stått
// stilla), lerpas i rAF för mjukhet, och nollas när pekaren lämnar. Den som bett om mindre
// rörelse får ingen alls — samma vakt som tubes, hero-3D:n och svävet.
(function () {
  'use strict';

  const scen = document.querySelector('.hero-mobil-scen');
  const hero = document.querySelector('.hero');
  if (!scen || !hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const MAX_Y = 10, MAX_X = 7; // grader — märkbart men inte sjösjukt
  let malY = 0, malX = 0, nuY = 0, nuX = 0, igang = false;

  function rita() {
    nuY += (malY - nuY) * 0.08;
    nuX += (malX - nuX) * 0.08;
    scen.style.transform =
      'rotateY(' + nuY.toFixed(2) + 'deg) rotateX(' + nuX.toFixed(2) + 'deg)';
    if (Math.abs(malY - nuY) + Math.abs(malX - nuX) > 0.02) requestAnimationFrame(rita);
    else igang = false;
  }
  function vakna() { if (!igang) { igang = true; requestAnimationFrame(rita); } }

  hero.addEventListener('pointermove', e => {
    const r = scen.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(1, window.innerWidth / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / Math.max(1, window.innerHeight / 2);
    malY = Math.max(-1, Math.min(1, dx)) * MAX_Y;
    malX = Math.max(-1, Math.min(1, -dy)) * MAX_X;
    vakna();
  });
  hero.addEventListener('pointerleave', () => { malY = 0; malX = 0; vakna(); });
})();
