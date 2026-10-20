(function () {
  'use strict';
  // Studio pa smal skarm (granskning 2026-10-18 F05).
  //
  // UPPMATT FORE, 390 x 844 i riktig Chrome: <aside> 210 px, lagerlistan 176 px, och .workarea
  // borjade pa X=397 med bredden 0. Duken och egenskaperna fanns, men utanfor bild.
  //
  // LOSNINGEN, under 768 px:
  //   * sidomenyn blir en infallbar lada bakom en hamburgare i huvudet, och stanger sig efter val
  //   * layoutlaget far en flikrad Lager / Duk / Egenskaper — en yta i taget
  //   * duken anpassas till bredden med den befintliga zoomen (VyraZoom), inte med en egen skala
  //   * en vald widget har en knapp som tar en till dess egenskaper
  //
  // VAR TILLSTANDET BOR: pa <html>, inte i #view. layout-safe.js skriver om hela #view vid varje
  // val och varje flytt, sa allt som lades dar hade forsvunnit vid nasta render. Klassen
  // `vy-mobil` och attributet `data-vy-yta` overlever, och CSS:en i vyra-mobil.css gor resten.
  // Flikraden och hamburgaren ligger utanfor #view av samma skal.
  //
  // INGEN render()/bind()-lindning: inget av det har andrar vad som ritas, bara vilken yta som
  // syns. En MutationObserver pa #view (samma monster som vyra-zoom.js och vyra-historik.js)
  // racker for att halla duken anpassad och knappen ratt efter en render.
  //
  // DESKTOP (>= 768 px) ROR DEN INTE: inga element byggs forran smal skarm faktiskt intraffar, och
  // varje regel i CSS:en kraver html.vy-mobil. Overlay-laget (?overlay=1) har ingen studio-chrome
  // och ska inte rora nagonting — darfor returnerar filen direkt, och laddaren i media.js lagger
  // inte heller till stilmallen dar.
  if (new URLSearchParams(location.search).has('overlay')) return;
  if (window.VyraMobil) return;

  const GRANS = '(max-width: 767.98px)';
  const CSS = 'vyra-mobil.css?v=20261020-1';
  const YTOR = [['lager', 'Lager'], ['duk', 'Duk'], ['egenskaper', 'Egenskaper']];
  const rot = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia(GRANS) : { matches: false, addEventListener() {} };

  let cssKlar = false;
  let yta = 'duk';
  let zoomFore = null;     // desktopens zoomniva, aterstalls nar fonstret breddas igen
  let passadFor = '';      // dukbredd x arbetsytebredd som anpassningen senast gjordes for

  // Stilmallen laddas av media.js tillsammans med skriptet (tests/stylesheet-pairs.test.js). Den
  // kan annu vara pa vag nar skriptet kor, och utan den hade hamburgaren och flikraden synts
  // ostylade en stund — darfor byggs inget forran den ar inlast. Saknas lanken (skriptet laddat
  // pa annat satt) laggs den till har.
  function laddaCss() {
    let l = document.querySelector('link[data-vy-mobil]');
    if (!l) {
      l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = CSS;
      l.dataset.vyMobil = '1';
      document.head.append(l);
    }
    let klar = false;
    try { klar = !!(l.sheet && l.sheet.cssRules); } catch (_) { klar = !!l.sheet; }
    if (klar) { cssKlar = true; return; }
    const nar = () => { cssKlar = true; uppdatera(); };
    l.addEventListener('load', nar, { once: true });
    l.addEventListener('error', nar, { once: true });
  }

  const smal = () => mq.matches;
  const iEditorn = () => !!document.querySelector('.editor-shell');
  const valdId = () => { try { return typeof selected !== 'undefined' && selected ? selected : null; } catch (_) { return null; } };

  /* ---- sidomenyn --------------------------------------------------------------------------- */
  function aside() { return document.querySelector('body>aside'); }

  function menyKnapp() {
    let b = document.getElementById('vyMenyKnapp');
    if (b) return b;
    const header = document.querySelector('main>header');
    const a = aside();
    if (!header || !a) return null;
    if (!a.id) a.id = 'vyMeny';
    b = document.createElement('button');
    b.type = 'button';
    b.id = 'vyMenyKnapp';
    b.className = 'vy-menyknapp vy-mobil-bara';
    b.setAttribute('aria-controls', a.id);
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', 'Öppna menyn');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    b.addEventListener('click', () => (menyOppen() ? stangMeny(true) : oppnaMeny()));
    header.prepend(b);

    const skugga = document.createElement('div');
    skugga.className = 'vy-meny-skugga vy-mobil-bara';
    skugga.setAttribute('aria-hidden', 'true');
    skugga.addEventListener('click', () => stangMeny(true));
    document.body.append(skugga);
    return b;
  }

  const menyOppen = () => rot.classList.contains('vy-meny-oppen');

  function oppnaMeny() {
    if (!smal()) return;
    rot.classList.add('vy-meny-oppen');
    const b = document.getElementById('vyMenyKnapp');
    if (b) { b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-label', 'Stäng menyn'); }
    const forsta = aside() && aside().querySelector('nav button, nav a');
    // Efter overgangens forsta bildruta: ett fokus pa ett element med visibility:hidden tappas.
    if (forsta) requestAnimationFrame(() => { try { forsta.focus({ preventScroll: true }); } catch (_) { forsta.focus(); } });
  }

  // tillbakaTillKnappen: Escape, skuggan och hamburgaren lamnar fokus pa hamburgaren. Ett val i
  // menyn gor det inte — vyra-sidbyte.js flyttar da fokus till den nya sidans rubrik.
  function stangMeny(tillbakaTillKnappen) {
    if (!menyOppen()) return;
    rot.classList.remove('vy-meny-oppen');
    const b = document.getElementById('vyMenyKnapp');
    if (b) {
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-label', 'Öppna menyn');
      if (tillbakaTillKnappen) b.focus();
    }
  }

  document.addEventListener('click', e => {
    if (!menyOppen()) return;
    const val = e.target && e.target.closest && e.target.closest('body>aside button, body>aside a');
    if (val) stangMeny(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menyOppen()) { e.preventDefault(); stangMeny(true); }
  });

  /* ---- flikarna i layoutlaget -------------------------------------------------------------- */
  function flikrad() {
    let rad = document.querySelector('.vy-mobilflikar');
    if (rad) return rad;
    const header = document.querySelector('main>header');
    if (!header) return null;
    rad = document.createElement('div');
    rad.className = 'vy-mobilflikar vy-mobil-bara';
    rad.setAttribute('role', 'tablist');
    rad.setAttribute('aria-label', 'Layoutens ytor');
    rad.innerHTML = YTOR.map(([id, namn]) =>
      `<button type="button" role="tab" data-vy-yta="${id}" aria-selected="false">${namn}</button>`).join('');
    rad.addEventListener('click', e => {
      const k = e.target.closest('[data-vy-yta]');
      if (k) valjYta(k.dataset.vyYta);
    });
    // Piltangenter mellan flikarna, som i ett vanligt tablist.
    rad.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = YTOR.findIndex(([id]) => id === yta);
      const nasta = YTOR[(i + (e.key === 'ArrowRight' ? 1 : YTOR.length - 1)) % YTOR.length][0];
      valjYta(nasta);
      const k = rad.querySelector(`[data-vy-yta="${nasta}"]`);
      if (k) k.focus();
      e.preventDefault();
    });
    header.after(rad);
    return rad;
  }

  function tillEgenskaperKnapp() {
    let b = document.querySelector('.vy-till-egenskaper');
    if (b) return b;
    b = document.createElement('button');
    b.type = 'button';
    b.className = 'vy-till-egenskaper vy-mobil-bara';
    b.hidden = true;
    b.addEventListener('click', () => valjYta('egenskaper'));
    document.body.append(b);
    return b;
  }

  function valjYta(ny) {
    if (!YTOR.some(([id]) => id === ny)) return;
    yta = ny;
    uppdatera();
  }

  /* ---- duken ------------------------------------------------------------------------------- */
  // Anpassa till BREDDEN, inte till hojden som VyraZoom.berakna(): pa en telefon rullar man
  // lodratt i arbetsytan, men en duk som ar bredare an skarmen gar inte att overblicka.
  function anpassaDuken(tvinga) {
    const c = document.querySelector('.workarea>.canvas'), w = document.querySelector('.workarea');
    const Z = window.VyraZoom;
    if (!c || !w || !Z || !c.offsetWidth || !w.clientWidth) return;
    const nyckel = c.offsetWidth + 'x' + w.clientWidth;
    if (!tvinga && nyckel === passadFor) return;
    passadFor = nyckel;
    if (zoomFore === null) zoomFore = Z.niva();
    const cs = getComputedStyle(w);
    const bredd = w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    Z.satt(Math.floor(bredd / c.offsetWidth * 100) / 100);
  }

  // Transformen krymper bara det som syns; i flodet tar duken fortfarande sin fulla storlek.
  // Variablerna later CSS:en ge tillbaka mellanskillnaden med negativa marginaler och centrera.
  function dukmatt() {
    const c = document.querySelector('.workarea>.canvas');
    const s = window.VyraZoom ? window.VyraZoom.niva() : 1;
    if (!c || !c.offsetWidth) return;
    const b = c.offsetWidth * s, h = c.offsetHeight * s;
    const satt = (k, v) => { if (rot.style.getPropertyValue(k) !== v) rot.style.setProperty(k, v); };
    satt('--vy-duk-b', b.toFixed(2) + 'px');
    satt('--vy-duk-mr', (b - c.offsetWidth).toFixed(2) + 'px');
    satt('--vy-duk-mb', (h - c.offsetHeight).toFixed(2) + 'px');
  }

  /* ---- ett svep ---------------------------------------------------------------------------- */
  function rensa() {
    rot.classList.remove('vy-mobil');
    rot.removeAttribute('data-vy-yta');
    ['--vy-duk-b', '--vy-duk-mr', '--vy-duk-mb'].forEach(k => rot.style.removeProperty(k));
    stangMeny(false);
    const b = document.querySelector('.vy-till-egenskaper');
    if (b) b.hidden = true;
    passadFor = '';
    if (zoomFore !== null && window.VyraZoom) { const z = zoomFore; zoomFore = null; window.VyraZoom.satt(z); }
  }

  function uppdatera() {
    if (!smal()) { if (rot.classList.contains('vy-mobil')) rensa(); return; }
    if (!cssKlar) return;
    menyKnapp();
    rot.classList.add('vy-mobil');
    if (rot.getAttribute('data-vy-yta') !== yta) rot.setAttribute('data-vy-yta', yta);

    const editor = iEditorn();
    const rad = flikrad();
    if (rad) rad.querySelectorAll('[data-vy-yta]').forEach(k => {
      const pa = String(k.dataset.vyYta === yta);
      if (k.getAttribute('aria-selected') !== pa) k.setAttribute('aria-selected', pa);
      k.tabIndex = k.dataset.vyYta === yta ? 0 : -1;
    });

    const knapp = tillEgenskaperKnapp();
    // Bara pa duken: i lagerlistan hade knappen tackt "+ Lagg till widget" langst ner, och dar ar
    // fliken Egenskaper redan ett tryck bort fran raden man just valde.
    const id = editor && yta === 'duk' ? valdId() : null;
    const w = id && typeof state !== 'undefined' && Array.isArray(state.widgets) ? state.widgets.find(x => x.id === id) : null;
    const text = w ? 'Egenskaper för ' + (w.templateTitle || w.title || w.group || w.type || 'widgeten') + ' →' : '';
    if (knapp.textContent !== text) knapp.textContent = text;
    if (knapp.hidden !== !w) knapp.hidden = !w;

    if (editor && yta === 'duk') { anpassaDuken(false); dukmatt(); }
  }

  let vantar = false;
  function snart() {
    if (vantar) return;
    vantar = true;
    requestAnimationFrame(() => { vantar = false; uppdatera(); });
  }

  laddaCss();
  const vyRot = document.getElementById('view');
  if (vyRot) new MutationObserver(() => { if (smal()) snart(); }).observe(vyRot, { childList: true, subtree: true });
  // Zoomknapparna och formatvaljaren andrar dukens storlek utan att #view ritas om.
  document.addEventListener('click', e => {
    if (smal() && e.target && e.target.closest && e.target.closest('[data-zoom], [data-format]')) setTimeout(snart, 0);
  });
  if (mq.addEventListener) mq.addEventListener('change', uppdatera);
  else if (mq.addListener) mq.addListener(uppdatera);
  window.addEventListener('resize', snart);
  uppdatera();

  window.VyraMobil = { GRANS, yta: () => yta, valjYta, oppnaMeny, stangMeny, smal };
})();
