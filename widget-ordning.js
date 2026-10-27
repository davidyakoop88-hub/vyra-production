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
  //
  // LISTAN I STAPELORDNING (samma dag: "tänkte om man kunde bygga de bättre"). Lagerlistan byggdes i
  // den ordning widgetarna skapades, så ▲ flyttade en widget fram utan att raden rörde sig — listan
  // sa ingenting om vad som låg över vad. Nu sorteras raderna som i OBS och Photoshop: översta lagret
  // överst. Raderna går att DRA till en ny plats (placera()), och Ctrl+↑/↓ flyttar den valda widgeten
  // ett steg (Ctrl+Skift+↑/↓ längst fram/bak). Ctrl+] finns inte på ett svenskt tangentbord utan AltGr.

  const lagerAv = w => Number(w && w.layer) || 1;

  // Ren funktion: returnerar { andrad, plats, antal } och skriver om layer på widgetarna i listan.
  // steg: 1 = fram, -1 = bak, 'topp' = längst fram, 'botten' = längst bak.
  function ordna(widgets, id, steg) {
    const stapel = stapelAv(widgets);
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

  // Stapeln nerifrån och upp: lägre lager först, vid lika lager DOM-ordningen.
  function stapelAv(widgets) {
    return (widgets || []).map((w, i) => ({ w, i })).filter(x => x.w && x.w.id != null)
      .sort((a, b) => (lagerAv(a.w) - lagerAv(b.w)) || (a.i - b.i)).map(x => x.w);
  }

  // Ren funktion för dra-och-släpp: lägger `id` direkt över (ovanfor = true) eller under widgeten
  // `malId` i stapeln och numrerar om alla till 1..n. Samma retur som ordna().
  function placera(widgets, id, malId, ovanfor) {
    const stapel = stapelAv(widgets);
    const fran = stapel.findIndex(w => w.id === id);
    if (fran < 0 || id === malId || !stapel.some(w => w.id === malId)) return { andrad: false, flyttad: false, plats: fran + 1, antal: stapel.length };
    const [w] = stapel.splice(fran, 1);
    const mal = stapel.findIndex(x => x.id === malId);
    const till = ovanfor ? mal + 1 : mal;
    stapel.splice(till, 0, w);
    let andrad = false;
    stapel.forEach((x, i) => { if (x.layer !== i + 1) { x.layer = i + 1; andrad = true } });
    return { andrad: andrad || till !== fran, flyttad: till !== fran, plats: till + 1, antal: stapel.length };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.VyraWidgetOrdning = Object.freeze({ ordna, placera });
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

  const namnPa = w => typeof liveLayerName === 'function' ? liveLayerName(w) : 'Widgeten';
  const lageText = r => r.plats === r.antal ? 'längst fram' : r.plats === 1 ? 'längst bak' : `lager ${r.plats} av ${r.antal}`;

  function flytta(id, steg) {
    const widgetar = allaWidgetar();
    const w = widgetar.find(x => x && x.id === id);
    if (!w) return;
    const r = ordna(widgetar, id, steg);
    const namn = namnPa(w);
    if (!r.flyttad) {
      // Omnumreringen kan ändå ha gjort ett lika-lager uttryckligt: spara och rita om då.
      if (r.andrad && typeof save === 'function') save();
      if (r.andrad && typeof render === 'function') render();
      if (typeof toast === 'function') toast(steg === 1 || steg === 'topp' ? `${namn} ligger redan längst fram` : `${namn} ligger redan längst bak`);
      return;
    }
    if (typeof save === 'function') save();
    if (typeof render === 'function') render();
    if (typeof toast === 'function') toast(`${namn} ligger nu ${lageText(r)}`);
  }

  function slapp(id, malId, ovanfor) {
    const widgetar = allaWidgetar();
    const w = widgetar.find(x => x && x.id === id);
    if (!w) return;
    const r = placera(widgetar, id, malId, ovanfor);
    if (!r.andrad) return;
    if (typeof save === 'function') save();
    if (typeof render === 'function') render();
    if (r.flyttad && typeof toast === 'function') toast(`${namnPa(w)} ligger nu ${lageText(r)}`);
  }

  // Raderna i stapelordning, översta lagret först. När listan har rader har den inget annat barn
  // (tomtexten finns bara utan widgetar), så append() räcker för att lägga dem i ordning.
  function sorteraLista(lista) {
    const rader = [...lista.querySelectorAll(':scope>article[data-layer-id]')];
    if (rader.length < 2) return;
    const plats = new Map(stapelAv(allaWidgetar()).map((w, i) => [String(w.id), i]));
    const sorterade = rader.slice().sort((a, b) => (plats.get(b.dataset.layerId) ?? -1) - (plats.get(a.dataset.layerId) ?? -1));
    if (sorterade.some((r, i) => r !== rader[i])) lista.append(...sorterade);
  }

  function rensaMarkering(lista) {
    lista.querySelectorAll('.drop-ovan,.drop-under,.drar').forEach(r => r.classList.remove('drop-ovan', 'drop-under', 'drar'));
  }

  // Dra en rad och släpp den på en annan: ovanför raden = framför den i stapeln, nedanför = bakom.
  // Listan byggs om vid varje render(), så handtagen sätts som egenskaper och aldrig dubbelt.
  function draOchSlapp(lista) {
    let dragen = null;
    const ovanfor = (rad, e) => { const r = rad.getBoundingClientRect(); return e.clientY < r.top + r.height / 2 };
    lista.querySelectorAll(':scope>article[data-layer-id]').forEach(rad => {
      rad.draggable = true;
      rad.ondragstart = e => {
        dragen = rad.dataset.layerId;
        rad.classList.add('drar');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragen) } catch (_) {}
      };
      rad.ondragover = e => {
        if (!dragen || rad.dataset.layerId === dragen) return;
        e.preventDefault();
        const ovan = ovanfor(rad, e);
        rad.classList.toggle('drop-ovan', ovan);
        rad.classList.toggle('drop-under', !ovan);
      };
      rad.ondragleave = () => rad.classList.remove('drop-ovan', 'drop-under');
      rad.ondrop = e => {
        if (!dragen || rad.dataset.layerId === dragen) return;
        e.preventDefault();
        const id = dragen;
        dragen = null;
        rensaMarkering(lista);
        slapp(id, rad.dataset.layerId, ovanfor(rad, e));
      };
      rad.ondragend = () => { dragen = null; rensaMarkering(lista) };
    });
  }

  // Ctrl+↑/↓ på den valda widgeten. Alt utesluts: AltGr är Ctrl+Alt i Windows.
  function kortkommandon() {
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (iOverlay() || (typeof view !== 'undefined' && view !== 'editor')) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const id = typeof selected !== 'undefined' ? selected : null;
      if (id == null || !allaWidgetar().some(w => w && w.id === id)) return;
      e.preventDefault();
      flytta(id, e.key === 'ArrowUp' ? (e.shiftKey ? 'topp' : 1) : (e.shiftKey ? 'botten' : -1));
    });
  }

  function ordningsKnappar() {
    document.querySelectorAll('.live-layer-list article[data-layer-id]').forEach(rad => {
      let par = rad.querySelector(':scope>.layer-ordning');
      if (!par) {
        par = document.createElement('div');
        par.className = 'layer-ordning';
        par.append(knapp('layer-fram', IKON_FRAM, 'Flytta fram (Skift: längst fram, Ctrl+↑)'),
          knapp('layer-bak', IKON_BAK, 'Flytta bak (Skift: längst bak, Ctrl+↓)'));
        // Före låset, så raden blir namn | ▲▼ | lås | öga | ta bort.
        rad.insertBefore(par, rad.querySelector(':scope>.layer-lock') || rad.querySelector(':scope>.layer-eye') || null);
      }
      const id = rad.dataset.layerId;
      par.querySelector('.layer-fram').onclick = e => { e.stopPropagation(); flytta(id, e.shiftKey ? 'topp' : 1) };
      par.querySelector('.layer-bak').onclick = e => { e.stopPropagation(); flytta(id, e.shiftKey ? 'botten' : -1) };
    });
    const lista = document.querySelector('.live-layer-list');
    if (lista) { sorteraLista(lista); draOchSlapp(lista) }
  }

  function install() {
    if (typeof bind !== 'function') return false;
    const tidigareBind = bind;
    bind = function () {
      tidigareBind();
      if (iOverlay() || (typeof view !== 'undefined' && view !== 'editor')) return;
      ordningsKnappar();
    };
    kortkommandon();
    return true;
  }

  if (!install()) addEventListener('load', () => { if (install() && typeof render === 'function') render() }, { once: true });
})();
