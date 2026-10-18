// DOLD BETYDER DOLD - I SANDNINGEN OCH I LAYOUTEN, OAVSETT RENDERARE.
//
// Invarianten (CLAUDE.md): en dold widget finns kvar i lagret men renderas aldrig i overlay-output.
// Basbeteendet star i media.js: styledWh (rad 110) lagger `display:none` och liveVisibilityWh
// (rad 1138) lagger `widget-hidden` + `display:none!important` - i BADE editorn och overlayn.
//
// VARFOR DET INTE RACKTE. wh() ar en kedja av monkeypatchar, och varje familj som laddas EFTER
// media.js:1138 och returnerar egen HTML gar forbi liveVisibilityWh helt. Uppmatt 2026-10-18 i Edge,
// alla 173 katalognycklar med hidden:true: 65 syntes i overlay och 81 i editorn (Guardian Emblem,
// Like Fountain-portalen, Goal Pro, Podium, Streak Flip, Top Coins/Points v2, Gift Campaign,
// Gift Jar, Custom, Latonskningar, Skattkista, Gift Fireworks/Bubbles, Heart Fireworks), och
// Last X och Guardian Emblem tandes i sandningen nar deras alert triggades.
//
// ETT SISTA wh-OMSLAG GAR INTE ATT GARANTERA. Skriptsvansen i media.js laddar familjerna i flera
// parallella kedjor, sa "sist" finns inte. Darfor fragas DOM:en i stallet, efter att vilken
// renderare som helst har skrivit: en MutationObserver ser varje nytt widgetelement innan
// webblasaren hinner mala det (observatorer kor i mikrotask-kontrollen, fore nasta bildruta), och
// en attributobservator pa varje dold lada atertar doljandet om en trigger skriver om style/class.
//
// Inline `display:none !important` vinner over temaklassernas `display:flex!important` (se
// vyra-tom-widget.js steg 3). Elementet stannar i DOM:en - riktade livepatchar slar upp [data-id].
// Markeringen ar egen (data-vyra-dold) sa att den tas bort igen om widgeten visas utan ny render,
// t.ex. nar en familj ateranvander samma nod.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__vyraDoldaVakt) return;
  window.__vyraDoldaVakt = true;

  const MARK = 'vyraDold';
  const EGEN_KLASS = 'vyraDoldKlass';

  function widgetar() {
    try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets : []; }
    catch (_) { return []; }
  }

  // Bara widgetens yttre lada: den bar klassen `widget` eller ligger direkt pa duken. Inre element
  // med data-id (rader, knappar) ror vi inte.
  function lador(id) {
    const ut = [];
    const sokt = String(id).replace(/["\\]/g, '\\$&');
    document.querySelectorAll('[data-id="' + sokt + '"]').forEach(el => {
      const p = el.parentElement;
      if (el.classList.contains('widget') || (p && p.classList.contains('canvas'))) ut.push(el);
    });
    return ut;
  }

  function dolj(el) {
    const s = el.style;
    if (s.getPropertyValue('display') !== 'none' || s.getPropertyPriority('display') !== 'important') s.setProperty('display', 'none', 'important');
    if (s.getPropertyValue('visibility') !== 'hidden' || s.getPropertyPriority('visibility') !== 'important') s.setProperty('visibility', 'hidden', 'important');
    if (!el.classList.contains('widget-hidden')) { el.classList.add('widget-hidden'); el.dataset[EGEN_KLASS] = '1'; }
    el.dataset[MARK] = '1';
  }

  function visa(el) {
    if (!el.dataset[MARK]) return;
    delete el.dataset[MARK];
    el.style.removeProperty('display');
    el.style.removeProperty('visibility');
    if (el.dataset[EGEN_KLASS]) { el.classList.remove('widget-hidden'); delete el.dataset[EGEN_KLASS]; }
  }

  let attrVakt = null;
  const vaktade = new WeakSet();

  function svep() {
    const lista = widgetar();
    const dolda = new Set();
    for (const w of lista) {
      if (!w || w.id == null || !w.hidden) continue;
      dolda.add(String(w.id));
      for (const el of lador(w.id)) {
        dolj(el);
        if (attrVakt && !vaktade.has(el)) { attrVakt.observe(el, { attributes: true, attributeFilter: ['style', 'class'] }); vaktade.add(el); }
      }
    }
    // Visad igen (eller borttagen ur lagret): ta bort var egen markering, inget annat.
    document.querySelectorAll('[data-vyra-dold="1"]').forEach(el => { if (!dolda.has(el.dataset.id)) visa(el); });
  }

  function harWidgetnod(poster) {
    for (const p of poster) {
      for (const n of p.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.hasAttribute('data-id') || n.querySelector('[data-id]')) return true;
      }
    }
    return false;
  }

  if (typeof MutationObserver === 'function') {
    // En attributandring pa en dold lada (en trigger som satter style.display eller byter klass)
    // aterstalls direkt. dolj() skriver bara nar nagot faktiskt avviker, sa ingen slinga uppstar.
    attrVakt = new MutationObserver(poster => {
      const lista = widgetar();
      for (const p of poster) {
        const el = p.target;
        const w = lista.find(x => x && String(x.id) === el.dataset.id);
        if (w && w.hidden) dolj(el); else if (el.dataset[MARK]) visa(el);
      }
    });
    // Billig grind: utan dolda widgetar och utan kvarvarande markeringar gor observatorn ingenting.
    const nodVakt = new MutationObserver(poster => {
      if (!harWidgetnod(poster)) return;
      if (!widgetar().some(w => w && w.hidden) && !document.querySelector('[data-vyra-dold="1"]')) return;
      svep();
    });
    const starta = () => nodVakt.observe(document.body || document.documentElement, { childList: true, subtree: true });
    if (document.body) starta(); else document.addEventListener('DOMContentLoaded', starta, { once: true });
  }

  // render() byter ut DOM:en men ogat i lagerlistan kan andra w.hidden utan att nagon nod
  // tillkommer (t.ex. om en familj ateranvander sin nod). Darfor svepet aven efter varje render.
  if (typeof render === 'function') {
    const forraRender = render;
    render = function () {
      const r = forraRender.apply(this, arguments);
      try { svep(); } catch (_) {}
      return r;
    };
  }

  window.VyraDoldaWidgetar = { svep };
  try { svep(); } catch (_) {}
})();
