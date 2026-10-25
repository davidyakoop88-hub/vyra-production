/* KOMPAKT LÄGE ÄR ETT VAL, INTE EN STORLEK (granskningen 2026-10-25).
 *
 * Fem familjer bytte förr utseende av sig själva när widgeten gjordes liten: topplistorna och
 * ledarkorten (ranking-sixpack.js), Gifter/Fan Level Up (level-lasbar.js), Battle MVP med ram,
 * Fan Level 50 och Top Streak Flip (container queries i sina CSS-filer). Kronor, profilramar, ringar,
 * glöd och dekorationer försvann och layouten skrevs om — 39 av 176 katalogmodeller i granskningen,
 * plus de tre container-familjerna som granskningen inte nådde. Nu skalar en förminskning hela
 * kompositionen likformigt (zoom via widgetScale), och kompaktläget finns kvar som ett uttryckligt val:
 * `w.kompaktLage === true`, en kryssruta i panelen.
 *
 * Den här filen äger valet: kryssrutan och rotklassen `vyra-kompaktlage` för de tre CSS-familjerna.
 * Topplistorna och level-larmen läser fältet själva och sätter sina egna klasser (rk6-kompakt,
 * rk-kompakt, lv-kompakt), så deras CSS är orörd. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof window.render !== 'function' || window.VyraKompaktLage) return;

  // Familjer vars CSS-kompaktläge nu hänger på rotklassen (tidigare @container).
  const ROTKLASS = new Set(['templateBattleMvp', 'templateFanLevel50', 'templatePgStreak']);
  const harKompaktlage = w => {
    if (!w) return false;
    if (ROTKLASS.has(w.type)) return true;
    if (w.type === 'templateTopLike' || w.type === 'templateTopCoins' || w.type === 'templateTopPoints') return true;
    if (w.type === 'templateGifterLevel' || w.type === 'templateFanLevel') return true;
    if (w.type === 'templateTopGift') return w.theme === 'royal';   // neon är kompakt redan i sin design
    return false;
  };

  // ROTKLASSEN SÄTTS EFTER RENDER, INTE I wh. fan-level-50.js och battle-mvp-celebrations.js lindar wh
  // och svarar för sina typer utan att anropa tidigare led — laddas de efter den här filen når en
  // wh-omslutning härifrån aldrig deras markup (uppmätt: valet gav ingen klass på Fan Level 50).
  // Klassen läggs därför på de färdiga lådorna, synkront efter render() och i en observer för
  // livepatchar som byter en enskild låda.
  function markera() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets) || typeof document === 'undefined') return;
    for (const w of state.widgets) {
      if (!w || !ROTKLASS.has(w.type)) continue;
      document.querySelectorAll(`[data-id="${String(w.id).replace(/["\\]/g, '\\$&')}"]`).forEach(rot => {
        if (!rot.classList.contains('widget')) return;
        if (rot.classList.contains('vyra-kompaktlage') !== (w.kompaktLage === true)) rot.classList.toggle('vyra-kompaktlage', w.kompaktLage === true);
      });
    }
  }
  if (typeof render === 'function') {
    const tidigareRender = render;
    render = function () { const ut = tidigareRender.apply(this, arguments); try { markera(); } catch (_) {} return ut; };
  }
  try { new MutationObserver(() => { try { markera(); } catch (_) {} }).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}

  if (typeof bind === 'function') {
    const tidigareBind = bind;
    bind = function () {
      const ut = tidigareBind.apply(this, arguments);
      try {
        if (typeof view !== 'undefined' && view !== 'editor') return ut;
        const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
        const panel = document.querySelector('.properties');
        if (!w || !panel || !harKompaktlage(w) || panel.querySelector('.vyra-kompaktgrupp')) return ut;
        const grupp = document.createElement('div');
        grupp.className = 'property-group vyra-kompaktgrupp';
        grupp.innerHTML = '<h4>KOMPAKT LÄGE</h4><label><input type="checkbox" id="vyraKompaktLage"' + (w.kompaktLage === true ? ' checked' : '') + '> Kompakt läge</label>'
          + '<small>Ett förenklat utseende för mycket små storlekar: dekorationerna döljs och namn och bild görs större. '
          + 'Av: designen ser likadan ut i alla storlekar och skalas som en helhet.</small>';
        const position = [...panel.querySelectorAll('.property-group')].find(g => /^POSITION/i.test((g.querySelector('h4') || {}).textContent || ''));
        if (position) position.before(grupp); else panel.append(grupp);
        grupp.querySelector('#vyraKompaktLage').onchange = e => {
          w.kompaktLage = e.target.checked;
          if (typeof save === 'function') save();
          if (typeof render === 'function') render();
        };
      } catch (err) { console.warn('[VYRA] kompakt läge', err); }
      return ut;
    };
  }

  window.VyraKompaktLage = Object.freeze({ harKompaktlage, ROTKLASS });
  try { if (typeof render === 'function') render(); } catch (_) {}
})();
