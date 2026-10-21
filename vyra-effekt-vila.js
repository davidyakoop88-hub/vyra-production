// VYRA · EFFEKTWIDGETAR I VILA PÅ DUKEN (slutgranskning B-029, 2026-10-20)
//
// Gift Fireworks (alla sex), Heart Fireworks och Gift Bubbles ritar ingenting förrän en gåva kommer.
// På duken var widgeten därför en tom streckad ruta när den var vald och helt osynlig annars: inget
// sa vad den var eller var effekten hamnar.
//
// Den här filen lägger en dämpad etikett mitt i widgetens yta PÅ DUKEN I EDITORN — namnet och "Syns i
// sändningen vid en gåva". Den hör inte till widgeten:
//   * overlayn laddar filen men gör ingenting (overlay-output ska vara exakt det som sänds),
//   * bara noder i .canvas får den, inte katalogens miniatyrer eller förhandsvisningar,
//   * testklonen (▶ Testa widget, [data-testspel-klon]) får den inte, och den riktiga noden göms
//     medan testet spelar, så etiketten står aldrig ovanpå effekten.
// Etiketten är aria-hidden och pointer-events:none, så den varken läses upp eller tar klick.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (new URLSearchParams(location.search).has('overlay')) return;

  const TYPER = {
    templateGiftFireworks: 'Gift Fireworks',
    templateHeartFireworks: 'Heart Fireworks',
    templateGiftBubbles: 'Gift Bubbles',
  };
  const STIL = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;'
    + 'pointer-events:none;text-align:center;color:rgba(240,138,255,.72);font:600 12px/1.3 Inter,system-ui,sans-serif;'
    + 'letter-spacing:.02em;z-index:0';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function markera() {
    if (typeof view !== 'undefined' && view !== 'editor') return;
    const lista = (typeof state !== 'undefined' && state && state.widgets) || [];
    document.querySelectorAll('.canvas .widget[data-id]:not([data-testspel-klon])').forEach(nod => {
      const w = lista.find(x => x && String(x.id) === nod.dataset.id);
      if (!w || !TYPER[w.type] || w.hidden || nod.querySelector(':scope > .vyra-effekt-vila')) return;
      const namn = String(w.title || TYPER[w.type]);
      nod.insertAdjacentHTML('afterbegin', `<div class="vyra-effekt-vila" aria-hidden="true" style="${STIL}">`
        + `<span style="font-size:13px">✦ ${esc(namn)}</span><small style="font-size:11px;opacity:.85">Syns i sändningen vid en gåva</small></div>`);
    });
  }

  if (typeof bind === 'function') {
    const tidigare = bind;
    bind = function () {
      const ut = tidigare.apply(this, arguments);
      try { markera(); } catch (e) { console.error('[VyraEffektVila]', e); }
      return ut;
    };
  }
  window.VyraEffektVila = { markera, TYPER };
})();
