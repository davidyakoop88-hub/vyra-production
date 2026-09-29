// fan-level-50-session.js — matar Fan Level 50-tavlan med live-data.
//
// MODELLEN ar densamma som fan-level-session.js: TikTok rapporterar avsandarens fanklubbsniva pa
// varje event. Servern stamplar en riktig level-up med {from,to} (viewer-levels.js). Nar to === 50
// har fanet natt milstolpen och laggs i tavlans roster. Aven en tittare som REDAN ar niva 50 nar den
// forst syns tas med (nivaAv === 50), sa tavlan fylls direkt av de niva-50-fans som ar aktiva — inte
// bara de som rakar hoja sig till 50 mitt i sandningen.
//
// INGENTING SPARAS. Rostern lever i minnet i fan-level-50.js och dor med sidan. Den handtaggade
// listan (fanl50Manual) ar det enda som sparas, och den ags av widgeten, inte av den har filen.
(function (root) {
  'use strict';
  const MILSTOLPE = 50;

  function nivaAv(e) {
    for (const v of [e.teamLevel, e.fanClubLevel]) {
      const n = Number(v);
      if (Number.isFinite(n) && Number.isInteger(n) && n >= 1 && n <= 50) return n;
    }
    return 0;
  }

  function hantera(e) {
    if (!e) return;
    const namn = String(e.username || e.name || e.userId || '').trim();
    if (!namn) return;
    // Server-stampeln ar sanningen: en riktig hojning TILL 50.
    const stampel = e.fanLevelUp;
    const nadde50 = (stampel && Number(stampel.to) === MILSTOLPE) || nivaAv(e) === MILSTOLPE;
    if (!nadde50) return;
    if (root.VyraFanLevel50 && typeof root.VyraFanLevel50.addAuto === 'function') {
      root.VyraFanLevel50.addAuto({ name: namn, avatar: String(e.profileImage || e.avatar || ''), team: '' });
    }
  }

  const tidigareRoute = root.routeLiveBattleEvent;
  root.routeLiveBattleEvent = function (event = {}) {
    if (typeof tidigareRoute === 'function') tidigareRoute(event);
    hantera(event);
  };

  root.VyraFanLevel50Session = { nivaAv, hantera };
})(window);
