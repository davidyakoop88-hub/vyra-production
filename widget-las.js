(function () {
  'use strict';
  // LÅS WIDGET (2026-09-25, Davids önskan): en låst widget går inte att flytta, dra i storlek eller
  // rotera på duken — men den går fortfarande att markera, redigera i panelen och låsa upp.
  //
  // ETT STÄLLE STOPPAR ALLT. Sju olika vägar flyttar eller skalar en widget: studio.js:s drag
  // (el.onpointerdown), layout-safe.js och layout-standalone.js som lindar den, widget-handles.js
  // (åtta handtag + rotation), media.js:s och custom-widgets.js:s hörnhandtag, vyra-dra-text.js
  // (rubrik/namn/värde) och gift-fireworks.js:s follower-drag. Alla startar på `pointerdown` på en
  // nod INUTI widgeten (handtagen läggs i widgeten, widget-handles.js appendChild). En enda lyssnare
  // i FÅNGSTFASEN på window körs före samtliga och stoppar händelsen där — ingen av de sju behöver
  // ändras, och en åttonde väg som läggs till senare stoppas också. studio.js rörs inte.
  //
  // KLICKET SLÄPPS IGENOM. `click` är en egen händelse; studio.js:s el.onclick markerar widgeten
  // som förut, så panelen öppnas och låset går att slå av där eller i lagerlistan.
  //
  // BARA I EDITORN. Overlayn (OBS) har ingen dragning och ska aldrig se låset: klassen stämplas inte
  // där, och fältet `locked` påverkar ingenting i rendern.
  //
  // FÄLTET ÄR ETT VANLIGT WIDGETFÄLT (`w.locked`). Det sparas med widgeten av save(), följer med i
  // molnsynken (servern lagrar widgetlistan som den är) och i ångra/gör om. Ingen migrering behövs:
  // saknat fält = olåst, precis som idag.

  const iOverlay = () => (typeof VYRA_OVERLAY !== 'undefined' ? !!VYRA_OVERLAY
    : new URLSearchParams(location.search).has('overlay'));
  const widgetFor = id => (typeof state !== 'undefined' && state && Array.isArray(state.widgets))
    ? state.widgets.find(w => w && w.id === id) || null : null;
  const arLast = w => !!(w && w.locked === true);

  // ---- Stoppet: fångstfas på window, före varje annan pointerdown-lyssnare ----
  function stoppaDrag(e) {
    if (iOverlay()) return;
    const el = e.target && e.target.closest ? e.target.closest('.canvas .widget[data-id]') : null;
    if (!el || !arLast(widgetFor(el.dataset.id))) return;
    // Inte preventDefault: klicket (markering) ska fortfarande komma fram.
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  }
  window.addEventListener('pointerdown', stoppaDrag, true);

  // ---- Rendern: en klass i editorn så handtagen döljs och markören visar låset ----
  function install() {
    if (typeof wh !== 'function' || typeof bind !== 'function') return false;
    const tidigareWh = wh;
    wh = function (w) {
      const html = tidigareWh(w);
      if (!arLast(w) || iOverlay() || typeof html !== 'string') return html;
      return html.replace(/class="widget\b/, 'class="widget widget-last');
    };

    const tidigareBind = bind;
    bind = function () {
      tidigareBind();
      // Overlayn kör också med view === 'editor' och media.js bygger där en (dold) lagerlista.
      // Knappen ska inte ens finnas i OBS-lankens DOM.
      if (iOverlay() || (typeof view !== 'undefined' && view !== 'editor')) return;
      lasKnappar();
    };
    return true;
  }

  // ---- Lagerlistan: en lås-knapp per rad, bredvid Synlig ----
  const IKON_LAST = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const IKON_OPPEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>';

  function lasKnappar() {
    document.querySelectorAll('.live-layer-list article[data-layer-id]').forEach(rad => {
      const w = widgetFor(rad.dataset.layerId);
      if (!w) return;
      let knapp = rad.querySelector(':scope>.layer-lock');
      if (!knapp) {
        knapp = document.createElement('button');
        knapp.type = 'button';
        knapp.className = 'layer-lock';
        const oga = rad.querySelector(':scope>.layer-eye');
        rad.insertBefore(knapp, oga || null);
      }
      const last = arLast(w);
      knapp.innerHTML = last ? IKON_LAST : IKON_OPPEN;
      knapp.classList.toggle('is-last', last);
      knapp.title = last ? 'Låst — klicka för att låsa upp' : 'Lås position och storlek';
      knapp.setAttribute('aria-label', knapp.title);
      knapp.setAttribute('aria-pressed', last ? 'true' : 'false');
      rad.classList.toggle('is-last', last);
      knapp.onclick = e => {
        e.stopPropagation();
        const nu = widgetFor(rad.dataset.layerId);
        if (!nu) return;
        if (arLast(nu)) delete nu.locked; else nu.locked = true;
        if (typeof save === 'function') save();
        if (typeof render === 'function') render();
        const namn = typeof liveLayerName === 'function' ? liveLayerName(nu) : 'Widgeten';
        if (typeof toast === 'function') toast(arLast(nu) ? `${namn} är låst — den flyttar sig inte` : `${namn} är upplåst`);
      };
    });
  }

  if (!install()) addEventListener('load', () => { if (install() && typeof render === 'function') render() }, { once: true });

  window.VyraWidgetLas = Object.freeze({ arLast, stoppaDrag });
})();
