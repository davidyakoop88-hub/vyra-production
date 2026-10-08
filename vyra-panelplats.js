(function () {
  'use strict';
  // PANELEN STÅR KVAR DÄR MAN ÄR (2026-09-25, Davids rapport): "varje gång man trycker på nått längst
  // ner så går meny upp, man måste scrolla ner igen".
  //
  // ORSAKEN. Nästan varje val i egenskapspanelen sparar och kallar render(), och render() bygger om
  // hela #view — även .properties, som då börjar på scrollTop 0. Reglagen har redan ett eget skydd
  // (media.js vyraRenderKeepingPanel), men knappar, rullistor och kryssrutor har det inte. Uppmätt
  // med en Top Gift och panelen nerskrollad: alla 31 ramval, kollektionsflikarna, animationslistan,
  // kryssrutan och "Ladda senaste" kastade panelen från ~2000 px till 0.
  //
  // LÖSNINGEN SITTER PÅ ETT STÄLLE: runt render(). Ingen av de hundratals panelknapparna behöver
  // ändras, och en knapp som läggs till i morgon får samma beteende. studio.js rörs inte.
  //
  // DET SOM SKA STÅ STILLA ÄR KONTROLLEN MAN TRYCKTE PÅ, inte ett scrolltal. Panelen kan byta höjd
  // vid omritningen (ett val kan visa eller dölja fält ovanför), och då pekar samma scrollTop på en
  // annan plats — samma lärdom som vyra-panelordning.js. Kontrollen hittas igen i den nya panelen och
  // scrollen justeras tills den ligger på samma höjd i fönstret. Hittas den inte, används scrolltalet.
  //
  // BYTER MAN WIDGET börjar panelen från toppen som förut: skyddet gäller bara när samma widget
  // fortfarande är vald.

  const iOverlay = () => new URLSearchParams(location.search).has('overlay');
  const panelen = () => document.querySelector('.editor-shell .properties');
  const valdNu = () => (typeof selected !== 'undefined' ? selected : null);

  // Hur länge en interaktion räknas som orsaken till en omritning. Omritningen efter ett klick sker
  // direkt eller inom några hundra ms (sparning, bildladdning); efter det är det bara scrolltalet
  // som bevaras.
  const ANKARFONSTER_MS = 1500;
  const KONTROLLER = 'button, select, input, textarea, [role="button"], [data-frame], [data-design]';

  let senaste = null; // { nyckel, y, t }

  // Ett sätt att hitta "samma" kontroll i den nybyggda panelen. id först; annars data-attributen,
  // namnet och texten; och ordningen bland kontroller med samma nyckel, så att tre knappar som alla
  // heter "Välj" ändå skiljs åt.
  function signatur(el) {
    if (el.id) return '#' + el.id;
    const data = [...el.attributes].filter(a => a.name.startsWith('data-'))
      .map(a => `${a.name}=${a.value}`).sort().join('&');
    const text = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '')
      .trim().replace(/\s+/g, ' ').slice(0, 60);
    return [el.tagName, el.type || '', el.getAttribute('name') || '', data, text].join('|');
  }
  function nyckelFor(el, panel) {
    const sig = signatur(el);
    if (sig[0] === '#') return { sig, nr: 0 };
    const lika = [...panel.querySelectorAll(KONTROLLER)].filter(x => signatur(x) === sig);
    return { sig, nr: Math.max(0, lika.indexOf(el)) };
  }
  function hitta(nyckel, panel) {
    if (nyckel.sig[0] === '#') {
      const el = document.getElementById(nyckel.sig.slice(1));
      return el && panel.contains(el) ? el : null;
    }
    const lika = [...panel.querySelectorAll(KONTROLLER)].filter(x => signatur(x) === nyckel.sig);
    return lika[nyckel.nr] || null;
  }

  // Fångstfas: registreras innan panelens egna hanterare kör save()/render() och river noden.
  function minns(e) {
    if (iOverlay()) return;
    const panel = panelen();
    const el = e.target && e.target.closest ? e.target.closest(KONTROLLER) : null;
    if (!panel || !el || !panel.contains(el)) return;
    senaste = { nyckel: nyckelFor(el, panel), y: el.getBoundingClientRect().top, t: Date.now() };
  }
  ['pointerdown', 'click', 'change', 'input'].forEach(typ => document.addEventListener(typ, minns, true));

  // INRE SCROLLRUTOR. Ramgalleriet (och liknande listor) har en egen scrollruta inne i panelen.
  // Uppmätt: ramen man klickade på låg på y=385 före och y=987 efter — utanför fönstret, fast
  // panelen själv stod kvar på sin max-scroll. Det var galleriets egen scroll som börjat om på 0.
  // Därför sparas scrollen i varje inre ruta som har scrollat, nycklad på klass och ordning.
  function rutnyckel(el, panel) {
    const k = el.tagName + '.' + [...el.classList].sort().join('.');
    const lika = [...panel.querySelectorAll(el.tagName)].filter(x => x.tagName + '.' + [...x.classList].sort().join('.') === k);
    return { k, nr: lika.indexOf(el) };
  }
  function inreScroll(panel) {
    const ut = [];
    panel.querySelectorAll('*').forEach(el => {
      if (el.scrollTop > 0 || el.scrollLeft > 0) ut.push({ nyckel: rutnyckel(el, panel), top: el.scrollTop, left: el.scrollLeft });
    });
    return ut;
  }
  function aterstallInre(panel, lista) {
    for (const r of lista) {
      const lika = [...panel.querySelectorAll(r.nyckel.k.split('.')[0])]
        .filter(x => x.tagName + '.' + [...x.classList].sort().join('.') === r.nyckel.k);
      const el = lika[r.nyckel.nr];
      if (el) { el.scrollTop = r.top; el.scrollLeft = r.left; }
    }
  }

  function stallTillbaka(fore) {
    const panel = panelen();
    if (!panel || panel === fore.panel) return; // ingen ny panel byggdes: inget har hoppat
    if (String(valdNu()) !== fore.vald) return; // annan widget: börja från toppen som förut
    aterstallInre(panel, fore.inre);
    panel.scrollTop = fore.scrollTop;
    const ankare = fore.ankare;
    if (!ankare) return;
    const el = hitta(ankare.nyckel, panel);
    if (!el) return;
    const diff = el.getBoundingClientRect().top - ankare.y;
    if (Math.abs(diff) >= 1) panel.scrollTop += diff;
  }

  // VILKEN WIDGET PANELEN VISAR. Den valda widgeten går inte att läsa i render() — klicket på en
  // annan widget sätter `selected` FÖRE render(), så "före" och "efter" hade alltid varit lika och
  // panelen hade stått kvar nerskrollad på en helt ny widget. Panelen märks därför när den byggs
  // (bind körs i alla vägar som bygger vyn, även go('editor')), och märket jämförs.
  const MARKE = 'panelplatsFor';
  function markera() {
    const panel = panelen();
    if (panel) panel.dataset[MARKE] = String(valdNu());
  }

  function install() {
    if (typeof render !== 'function' || typeof bind !== 'function') return false;
    const tidigareBind = bind;
    bind = function () {
      const ut = tidigareBind.apply(this, arguments);
      markera();
      return ut;
    };
    const tidigareRender = render;
    render = function () {
      const panel = iOverlay() ? null : panelen();
      if (!panel) return tidigareRender.apply(this, arguments);
      const fore = {
        panel, vald: panel.dataset[MARKE], scrollTop: panel.scrollTop, inre: inreScroll(panel),
        ankare: senaste && Date.now() - senaste.t < ANKARFONSTER_MS ? senaste : null
      };
      const ut = tidigareRender.apply(this, arguments);
      stallTillbaka(fore);
      // Panelordningen sorterar grupperna även i en mikrotask (vyra-panelordning.js). Rätta en gång
      // till efter den, så att en sen flytt inte knuffar kontrollen ur bild.
      Promise.resolve().then(() => stallTillbaka(Object.assign({}, fore, { panel: null })));
      return ut;
    };
    return true;
  }

  if (!install()) addEventListener('load', install, { once: true });

  window.VyraPanelplats = Object.freeze({ signatur });
})();
