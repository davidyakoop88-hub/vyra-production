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
  if (typeof window === 'undefined' || typeof window.wh !== 'function' || window.VyraKompaktLage) return;

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

  const tidigareWh = window.wh;
  window.wh = function (w) {
    const html = tidigareWh.apply(this, arguments);
    if (!w || w.kompaktLage !== true || !ROTKLASS.has(w.type) || typeof html !== 'string') return html;
    // Sist i klasslistan: andra led i wh-kedjan ersätter på exakta början ('class="widget battle-mvp').
    return html.replace(/^(\s*<div\b[^>]*?\bclass="[^"]*)"/, '$1 vyra-kompaktlage"');
  };

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
