// LAGER BETYDER LAGER - I STUDION OCH I SANDNINGEN, OAVSETT RENDERARE.
//
// Basbeteendet star i media.js: styledWh (rad 110) skriver `z-index:${w.layer||1}` i widgetens
// yttre lada, men bara genom att ersatta exakt `style="left:..px;top:..px"`. Familjer som ritar egen
// HTML gick forbi det och fick `z-index:auto`, sa Lager i panelen gjorde ingenting och tva
// overlappande widgetar lag i DOM-ordning. Uppmatt 2026-10-19 i Edge, alla 173 katalognycklar, tva
// widgetar pa samma plats med lager 2/1 och sedan 1/2: 151 nycklar i bade studion och overlayn hade
// `z-index:auto` (playground-familjerna, Heart Me, alla alertfamiljer, Last X, Gift Campaign, Top
// Like, Top Gift, Battle MVP, fyrverkerier, bubblor, fontaner, burken, Glove Snipe, egen text/bild/
// video m.fl.).
//
// ETT SISTA wh-OMSLAG GAR INTE ATT GARANTERA (samma skal som overlay-dolda.js): skriptsvansen i
// media.js laddar familjerna i parallella kedjor, sa "sist" finns inte. Darfor fragas DOM:en efter
// varje render, och en MutationObserver ser varje ny widgetnod innan webblasaren hinner mala den.
//
// REGELN ar densamma som styledWh: `z-index = w.layer || 1` pa den yttre ladan. En renderare som
// sjalv skriver z-index i sin HTML (styledWh, Fan Level 50, Top Coins/Points v2, Top Streak) far
// behalla sitt varde - vakten fyller bara i det som saknas. Ett varde vakten sjalv satt markeras
// (data-vyra-lager) och foljer w.layer aven om familjen ateranvander noden utan ny render, och det
// skrivs tillbaka om en trigger skriver om ladans style-attribut.
//
// Dolda widgetar rors inte pa nagot annat satt: overlay-dolda.js ager display/visibility, den har
// filen bara z-index. Testspelets klon (data-id = id + '__prov') finns inte i state och rors inte;
// den arver ladans inline-stil, alltsa ocksa z-index.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__vyraLagerVakt) return;
  window.__vyraLagerVakt = true;

  const MARK = 'vyraLager';

  function widgetar() {
    try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets : []; }
    catch (_) { return []; }
  }

  // Samma urval som overlay-dolda.js: bara widgetens yttre lada (klassen `widget` eller direkt pa
  // duken). Inre element med data-id (rader, knappar) ror vi inte.
  function lador(id) {
    const ut = [];
    const sokt = String(id).replace(/["\\]/g, '\\$&');
    document.querySelectorAll('[data-id="' + sokt + '"]').forEach(el => {
      const p = el.parentElement;
      if (el.classList.contains('widget') || (p && p.classList.contains('canvas'))) ut.push(el);
    });
    return ut;
  }

  const lagerFor = w => String(w.layer || 1);

  let attrVakt = null;
  const vaktade = new WeakSet();

  function satt(el, w) {
    const s = el.style;
    const nu = s.getPropertyValue('z-index');
    // Renderaren skrev ett eget varde: lat det sta.
    if (nu && !el.dataset[MARK]) return;
    const ska = lagerFor(w);
    if (nu !== ska) s.setProperty('z-index', ska);
    if (el.dataset[MARK] !== ska) el.dataset[MARK] = ska;
    if (attrVakt && !vaktade.has(el)) { attrVakt.observe(el, { attributes: true, attributeFilter: ['style'] }); vaktade.add(el); }
  }

  function svep() {
    for (const w of widgetar()) {
      if (!w || w.id == null) continue;
      for (const el of lador(w.id)) satt(el, w);
    }
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
    // En trigger som skriver om ladans style-attribut tappar z-index; skriv tillbaka det. satt()
    // skriver bara nar nagot faktiskt avviker, sa ingen slinga uppstar.
    attrVakt = new MutationObserver(poster => {
      const lista = widgetar();
      for (const p of poster) {
        const el = p.target;
        if (!el.dataset[MARK]) continue;
        const w = lista.find(x => x && String(x.id) === el.dataset.id);
        if (w) satt(el, w);
      }
    });
    const nodVakt = new MutationObserver(poster => { if (harWidgetnod(poster)) svep(); });
    const starta = () => nodVakt.observe(document.body || document.documentElement, { childList: true, subtree: true });
    if (document.body) starta(); else document.addEventListener('DOMContentLoaded', starta, { once: true });
  }

  // Lager andras i panelen eller lagerlistan och foljs av render(). Svepet kor synkront efter varje
  // render, sa z-index ar ratt innan nagon hinner mata eller mala.
  if (typeof render === 'function') {
    const forraRender = render;
    render = function () {
      const r = forraRender.apply(this, arguments);
      try { svep(); } catch (_) {}
      return r;
    };
  }

  window.VyraLager = { svep };
  try { svep(); } catch (_) {}
})();
