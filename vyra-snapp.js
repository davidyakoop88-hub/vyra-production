(function () {
  'use strict';
  // Snapp + rutnat i editorn (Etapp 5, sista delen av minimum-trion).
  //
  // SNAPPEN LIGGER BARA I DRAGMATTEN. Fas B skrev upp risken: lag den i render() eller save()
  // skulle ocksa PROGRAMMATISKA positioner snappas, och angra-provet satter x/y direkt och havdar
  // exakta varden. Enda vagen ut ur den kollisionen hade varit att bryta undo/redo. Draget
  // (studio.js) anropar justera() med ett raatt lage och far ett snappat tillbaka; ingen annan
  // kodvag ror positioner.
  //
  // TOLERANSEN MATS I PEKARPIXLAR. 8 px vid 100 % blir 16 dukpixlar vid 50 % zoom — nar man ser
  // mer ska snappen vara mer overseende. Samma invariant som PR #161: allt som oversatter en
  // pekarrorelse delar med getEditorCanvasScale().
  //
  // EN ANNAN WIDGETS KANT SLAR RUTNATET. Rutnatet ar en hjalplinje; en annan widget ar riktigt
  // innehall, och det ar mot innehallet man vill rikta in sig. Darfor provas widgetmalen forst
  // och rutnatet bara nar inget widgetmal traffade.
  //
  // MALEN MATS UR DOM:EN, inte ur w.width/w.height. Uppmatt i PR #161: templateTopLike renderas
  // 222px bred trots att dess width-nyckel sager 300. Kantsnapp mot en pastadd bredd hade lagt
  // widgeten dar kanten inte ar.

  const RUTNAT = 8;          // dukpixlar mellan linjerna
  const TOLERANS = 8;        // pekarpixlar
  const NYCKEL = 'vyra-editor-snap-enabled';

  function lasPa() {
    try { return localStorage.getItem(NYCKEL) !== 'false' } catch (_) { return true }
  }
  function sparaPa(v) { try { localStorage.setItem(NYCKEL, String(v)) } catch (_) {} }

  let pa = lasPa();

  const kanvas = () => document.querySelector('.canvas');
  const tolerans = skala => TOLERANS / (skala > 0 ? skala : 1);

  // Alla lagen den dragna widgetens VANSTERKANT kan vilja hamna pa, givet en annan widget.
  // Samma fyra forhallanden i bada led: kant mot kant, och kant i linje med kant.
  function malFor(startAndra, storlekAndra, storlekDragen) {
    return [
      startAndra,                                   // vansterkanter i linje
      startAndra + storlekAndra,                    // var vanster mot deras hoger
      startAndra - storlekDragen,                   // var hoger mot deras vanster
      startAndra + storlekAndra - storlekDragen,    // hogerkanter i linje
    ];
  }

  function narmaste(varde, mal, tol) {
    let bast = null, avstand = tol;
    for (const m of mal) {
      const d = Math.abs(varde - m);
      if (d <= avstand) { avstand = d; bast = m }
    }
    return bast;
  }

  // Anropas fran dragmatten i studio.js. el ar den dragna noden, left/top ett raatt dukläge.
  function justera(el, left, top, e, skala) {
    if (!pa || (e && e.shiftKey) || !el) return { left, top };
    const tol = tolerans(skala);
    const id = el.dataset.id;
    const bredd = el.offsetWidth, hojd = el.offsetHeight;
    const malX = [], malY = [];
    document.querySelectorAll('.canvas .widget[data-id]').forEach(annan => {
      if (!annan.dataset.id || annan.dataset.id === id) return;
      const l = parseInt(annan.style.left, 10), t = parseInt(annan.style.top, 10);
      if (Number.isFinite(l)) malX.push(...malFor(l, annan.offsetWidth, bredd));
      if (Number.isFinite(t)) malY.push(...malFor(t, annan.offsetHeight, hojd));
    });
    // Widgetmalen forst; rutnatet bara nar inget av dem traffade.
    const x = narmaste(left, malX, tol);
    const y = narmaste(top, malY, tol);
    const rutX = Math.round(left / RUTNAT) * RUTNAT;
    const rutY = Math.round(top / RUTNAT) * RUTNAT;
    return {
      left: x !== null ? x : (Math.abs(left - rutX) <= tol ? rutX : left),
      top: y !== null ? y : (Math.abs(top - rutY) <= tol ? rutY : top),
    };
  }

  // ---- rutnatslagret ---------------------------------------------------------------------------
  // Bara under dragningen. Ett standigt synligt rutnat bryter mot det ramlosa formspraket som ar
  // en av produktens signaturer — feedbacken behovs nar man drar, inte resten av tiden.
  function lager() {
    const c = kanvas();
    if (!c) return null;
    let g = c.querySelector('[data-snapp-rutnat]');
    if (!g) {
      g = document.createElement('div');
      g.className = 'snapp-rutnat';
      g.setAttribute('data-snapp-rutnat', '');
      g.setAttribute('aria-hidden', 'true');
      c.prepend(g);
    }
    return g;
  }
  function visaRutnat(synligt) {
    const g = lager();
    if (!g) return;
    const ska = synligt && pa;
    if (g.classList.contains('visar') !== ska) g.classList.toggle('visar', ska);
  }

  // ---- vaxeln ---------------------------------------------------------------------------------
  // Sitter pa platsen #162 reserverade. Den var hidden dar med flit: en knapp utan verkan ar
  // samma UI-logn som Etapp 4 stangde, och nu finns verkan.
  function monteraVaxel() {
    const plats = document.querySelector('[data-snapp-plats]');
    if (!plats || plats.querySelector('[data-snapp-vaxel]')) return false;
    plats.hidden = false;
    const knapp = document.createElement('button');
    knapp.type = 'button';
    knapp.className = 'snapp-vaxel';
    knapp.setAttribute('data-snapp-vaxel', '');
    // SVG, inte magnetemojin. Uppmatt pa skarm i 3x: emojin blir en rod klump vid 26px hojd och
    // laser sig inte som en magnet — samma sorts fel som bara syns pa bild. Stroke-ikonen foljer
    // vyraCatalogIcon (media.js:722) och ARVER textfargen, sa av-laget blir dampat av sig sjalvt.
    knapp.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M6 20V10a6 6 0 0 1 12 0v10"/><path d="M10 20V10a2 2 0 0 1 4 0v10"/>' +
      '<path d="M6 16h4M14 16h4"/></svg>';
    knapp.onclick = () => { pa = !pa; sparaPa(pa); malaVaxel(); if (!pa) visaRutnat(false) };
    plats.append(knapp);
    malaVaxel();
    return true;
  }
  function malaVaxel() {
    const knapp = document.querySelector('[data-snapp-vaxel]');
    if (!knapp) return;
    knapp.setAttribute('aria-pressed', String(pa));
    knapp.classList.toggle('av', !pa);
    const titel = pa ? 'Snapp pa · Shift stanger av tillfalligt' : 'Snapp av';
    if (knapp.title !== titel) knapp.title = titel;
  }

  // ---- montering och dragets livscykel ---------------------------------------------------------
  // Capture-lyssnare pa dokumentet i stallet for en hake i varje widget: widgetnoderna byts ut vid
  // varje render, och en lyssnare per nod hade behovt bindas om varje gang (samma skal som
  // capture-monstret i studio.js).
  let armerad = false;
  document.addEventListener('pointerdown', e => {
    armerad = !!(e.target.closest && e.target.closest('.canvas .widget[data-id]'));
  }, true);
  document.addEventListener('pointermove', () => { if (armerad) visaRutnat(true) }, true);
  const slut = () => { armerad = false; visaRutnat(false) };
  document.addEventListener('pointerup', slut, true);
  document.addEventListener('pointercancel', slut, true);

  function svep() {
    if (typeof view === 'undefined' || view !== 'editor') return;
    monteraVaxel();
    lager();
  }
  const vyRot = document.getElementById('view');
  if (vyRot) new MutationObserver(svep).observe(vyRot, { childList: true, subtree: true });

  window.VyraSnapp = { RUTNAT, justera, tolerans, pa: () => pa };
})();
