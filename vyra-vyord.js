/* VYORD — SVENSKA ORD OCH ETT TOMT LÄGE UTAN SKELETT I VYERNA SOM studio.js RITAR
 * (kontrollgranskning C, andra omgången, 2026-10-20: C-019 och C-021).
 *
 * studio.js får inte ändras, så de sista engelska orden i dess egna vyer byts här, efter att
 * vyns renderare har byggt sin HTML:
 *   · Händelser: rubriken "Eventhistorik" blir "Händelsehistorik", och de fyra skelettraderna
 *     (.tom-lista) under "Inga händelser ännu" ritas inte alls. De såg ut som en laddning som aldrig
 *     blev klar, även tonade (C-021) - texten ovanför säger redan vad som kommer att stå där.
 *   · Statistik: överrubriken "COMMUNITY" över Toppsupportrar blir "PUBLIK".
 *
 * Renderarna kedjas (samma mönster som stream-time-analytics.js), så ordningen mot andra filer som
 * också kedjar analytics() spelar ingen roll. Ritar ingenting i overlay-läget.
 * Laddas från skript-svansen i media.js.
 */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).has('overlay')) return;

  /* eslint-disable no-global-assign */
  if (typeof events === 'function') {
    const forraEvents = events;
    events = function () {
      return String(forraEvents.apply(this, arguments))
        .replace('<h2>Eventhistorik</h2>', '<h2>Händelsehistorik</h2>')
        .replace(/<div class="tom-lista"[^>]*>(?:<i><\/i>)*<\/div>/, '');
    };
  }
  if (typeof analytics === 'function') {
    const forraAnalytics = analytics;
    analytics = function () {
      return String(forraAnalytics.apply(this, arguments)).replace('<small>COMMUNITY</small>', '<small>PUBLIK</small>');
    };
  }
  /* eslint-enable no-global-assign */

  // Startade studion redan i någon av vyerna ritas den om en gång med de nya orden.
  if (typeof view !== 'undefined' && (view === 'events' || view === 'analytics') && typeof render === 'function') render();
})();
