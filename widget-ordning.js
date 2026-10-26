(function () {
  'use strict';
  // FLYTTA FRAM / FLYTTA BAK (2026-10-26, Davids önskan: "top likes ska visas över" molnet).
  // Lager fanns redan som siffra (w.layer, vyra-lager.js skriver z-index = w.layer || 1 på den yttre
  // lådan), men bara i vissa paneler och man fick själv gissa vilket tal som räckte. Varje rad i
  // lagerlistan får nu ▲ (fram ett steg) och ▼ (bak ett steg); Skift+klick = längst fram/längst bak.
  //
  // STAPELORDNINGEN är den webbläsaren målar: lägre lager under högre, och vid samma lager ligger den
  // som kommer senare i DOM:en (= senare i state.widgets) överst. ordna() sorterar efter det, flyttar
  // widgeten i stapeln och numrerar om alla till 1..n. Den inbördes ordningen för de andra ändras
  // aldrig, bara deras tal - så ett lika-lager som tidigare avgjordes av DOM-ordningen blir uttryckligt.
  //
  // FÄLTET ÄR DET VANLIGA w.layer: det sparas av save(), följer molnsynken och ångra/gör om, och
  // Lager-fältet i panelen visar det nya talet efter render(). Overlayn (OBS) får inga knappar.

  const lagerAv = w => Number(w && w.layer) || 1;

  // Ren funktion: returnerar { andrad, plats, antal } och skriver om layer på widgetarna i listan.
  // steg: 1 = fram, -1 = bak, 'topp' = längst fram, 'botten' = längst bak.
  function ordna(widgets, id, steg) {
    const stapel = (widgets || []).map((w, i) => ({ w, i })).filter(x => x.w && x.w.id != null)
      .sort((a, b) => (lagerAv(a.w) - lagerAv(b.w)) || (a.i - b.i)).map(x => x.w);
    const fran = stapel.findIndex(w => w.id === id);
    if (fran < 0) return { andrad: false, plats: 0, antal: stapel.length };
    const sist = stapel.length - 1;
    const till = steg === 'topp' ? sist : steg === 'botten' ? 0 : Math.max(0, Math.min(sist, fran + steg));
    const [w] = stapel.splice(fran, 1);
    stapel.splice(till, 0, w);
    let andrad = false;
    stapel.forEach((x, i) => { if (x.layer !== i + 1) { x.layer = i + 1; andrad = true } });
    return { andrad: andrad || till !== fran, flyttad: till !== fran, plats: till + 1, antal: stapel.length };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.VyraWidgetOrdning = Object.freeze({ ordna });
  if (window.__vyraWidgetOrdning) return;
  window.__vyraWidgetOrdning = true;

  const iOverlay = () => (typeof VYRA_OVERLAY !== 'undefined' ? !!VYRA_OVERLAY
    : new URLSearchParams(location.search).has('overlay'));
  const allaWidgetar = () => (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets : [];

  const IKON_FRAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  const IKON_BAK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function knapp(klass, ikon, titel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = klass;
    b.innerHTML = ikon;
    b.title = titel;
    b.setAttribute('aria-label', titel);
    return b;
  }

  function flytta(id, steg) {
    const widgetar = allaWidgetar();
    const w = widgetar.find(x => x && x.id === id);
    if (!w) return;
    const r = ordna(widgetar, id, steg);
    const namn = typeof liveLayerName === 'function' ? liveLayerName(w) : 'Widgeten';
    if (!r.flyttad) {
      // Omnumreringen kan ändå ha gjort ett lika-lager uttryckligt: spara och rita om då.
      if (r.andrad && typeof save === 'function') save();
      if (r.andrad && typeof render === 'function') render();
      if (typeof toast === 'function') toast(steg === 1 || steg === 'topp' ? `${namn} ligger redan längst fram` : `${namn} ligger redan längst bak`);
      return;
    }
    if (typeof save === 'function') save();
    if (typeof render === 'function') render();
    const lage = r.plats === r.antal ? 'längst fram' : r.plats === 1 ? 'längst bak' : `lager ${r.plats} av ${r.antal}`;
    if (typeof toast === 'function') toast(`${namn} ligger nu ${lage}`);
  }

  function ordningsKnappar() {
    document.querySelectorAll('.live-layer-list article[data-layer-id]').forEach(rad => {
      let par = rad.querySelector(':scope>.layer-ordning');
      if (!par) {
        par = document.createElement('div');
        par.className = 'layer-ordning';
        par.append(knapp('layer-fram', IKON_FRAM, 'Flytta fram (Skift: längst fram)'),
          knapp('layer-bak', IKON_BAK, 'Flytta bak (Skift: längst bak)'));
        // Före låset, så raden blir namn | ▲▼ | lås | öga | ta bort.
        rad.insertBefore(par, rad.querySelector(':scope>.layer-lock') || rad.querySelector(':scope>.layer-eye') || null);
      }
      const id = rad.dataset.layerId;
      par.querySelector('.layer-fram').onclick = e => { e.stopPropagation(); flytta(id, e.shiftKey ? 'topp' : 1) };
      par.querySelector('.layer-bak').onclick = e => { e.stopPropagation(); flytta(id, e.shiftKey ? 'botten' : -1) };
    });
  }

  function install() {
    if (typeof bind !== 'function') return false;
    const tidigareBind = bind;
    bind = function () {
      tidigareBind();
      if (iOverlay() || (typeof view !== 'undefined' && view !== 'editor')) return;
      ordningsKnappar();
    };
    return true;
  }

  if (!install()) addEventListener('load', () => { if (install() && typeof render === 'function') render() }, { once: true });
})();
