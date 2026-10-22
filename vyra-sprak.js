// vyra-sprak.js — VYRA på svenska och engelska (Davids beslut 2026-10-21: "hela vyra ska ha båda
// språken, engelska och svenska, och fungera på båda sätt").
//
// SVENSKA ÄR KÄLLAN. Sidorna och skripten är skrivna på svenska och förblir det; ingen fil behöver
// skrivas om. När engelska är valt översätts det som syns med en ordlista (vyra-sprak-en.js):
// textnoder och attributen placeholder, aria-label, title, alt och meta-content. En MutationObserver
// översätter också text som skripten skriver senare (felmeddelanden, knappar som byter text), så
// landing-login.js m.fl. behöver inte känna till språket.
//
// VALET: sparas i localStorage ('vyra-sprak') och delas av alla sidor på samma ursprung, studion
// inräknad. ?lang=en / ?lang=sv i adressen väljer och sparar. Utan val är det svenska — med flit inte
// webbläsarens språk: en engelsk webbläsare som aldrig valt får samma sida som förut, och inget
// av de prov som läser den svenska texten beror på maskinens språkinställning.
//
// VyraLang.current() är den krok guardian-emblem-fas.js redan väntar på (sprak(w), "den enda raden
// som byts när VyraLang byggs").
//
// STEG 2 (2026-10-22): studion. studio.html laddar filen, men BARA studiolägets chrome översätts:
//   * OVERLAYLÄGET (?overlay, OBS-utgången) får ingen VyraLang alls — sändningens språk är ett öppet
//     produktbeslut (steg 3), och Guardian Emblems sprak(w) ska där bete sig exakt som förut.
//   * WIDGETINNEHÅLLET rörs inte: sidan anger med data-sprak-utom på <html> vilka delar som är
//     sändningstext (duken, widgetarna, katalogens förhandsvisningar, egenskapspanelen). De delarna
//     och allt med data-sprak-orort hoppas över, och vandringen går aldrig ens in i dem.
//   * Svenska kostar ingenting: observern kopplas bara in medan engelska är valt.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.VyraLang) return;
  try { if (new URLSearchParams(location.search).has('overlay')) return; } catch (_) {}

  const NYCKEL = 'vyra-sprak';
  const SPRAK = ['sv', 'en'];
  const ATTR = ['placeholder', 'aria-label', 'title', 'alt'];

  function lasVal() {
    try {
      const q = new URLSearchParams(location.search).get('lang');
      if (q && SPRAK.includes(q)) { try { localStorage.setItem(NYCKEL, q); } catch (_) {} return q; }
    } catch (_) {}
    try { const v = localStorage.getItem(NYCKEL); if (SPRAK.includes(v)) return v; } catch (_) {}
    return 'sv';
  }

  let aktuellt = lasVal();
  const ordlista = () => (window.VyraSprakEn && window.VyraSprakEn.text) || {};
  const monster = () => (window.VyraSprakEn && window.VyraSprakEn.monster) || [];

  // Översätt en svensk sträng. Blanktecken runt texten behålls; okänd text lämnas som den är.
  //
  // MINNET. Studion ritar om samma vy om och om igen (render() river #view), så samma strängar
  // kommer tillbaka hela tiden — och de flesta är INTE i ordlistan (namn, siffror, widgettext), vilket
  // annars betyder att varje mönster prövas på varje textnod vid varje omritning. Svaret sparas per
  // sträng; minnet töms om det växer förbi MINNE_MAX (ett slags enkel tak, inte LRU).
  const MINNE_MAX = 5000;
  let minne = new Map();
  function oversatt(sv) {
    if (aktuellt !== 'en' || typeof sv !== 'string') return sv;
    const sparat = minne.get(sv);
    if (sparat !== undefined) return sparat;
    const ut = oversattNy(sv);
    if (minne.size >= MINNE_MAX) minne = new Map();
    minne.set(sv, ut);
    return ut;
  }
  function oversattNy(sv) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(sv);
    const kärna = m[2].replace(/\s+/g, ' ');
    if (!kärna) return sv;
    const exakt = ordlista()[kärna];
    if (exakt != null) return m[1] + exakt + m[3];
    for (const [re, ut] of monster()) {
      if (re.test(kärna)) return m[1] + kärna.replace(re, ut) + m[3];
    }
    return sv;
  }

  // Originalet sparas per nod/attribut, så att svenska kan återställas utan omladdning. Har ett
  // skript skrivit ny text sedan dess (texten är varken originalet eller översättningen) gäller den
  // nya texten som original.
  const original = new WeakMap();
  let skriver = false;

  // Det som aldrig översätts: kod och sidans egna undantag. Fält användaren skriver i (textarea,
  // contenteditable) får sina attribut översatta — placeholdern är chrome — men aldrig sin text.
  const ALLTID_UTOM = 'script, style, noscript, title, [data-sprak-orort]';
  const SKRIVFALT = 'textarea, [contenteditable]';
  const egetUtom = (document.documentElement.getAttribute('data-sprak-utom') || '').trim();
  const UTOM = egetUtom ? ALLTID_UTOM + ', ' + egetUtom : ALLTID_UTOM;
  const UTOM_TEXT = UTOM + ', ' + SKRIVFALT;
  const utanfor = el => !!(el && el.closest && el.closest(UTOM));

  // `kand` = anroparen vet redan att noden ligger utanför undantagen (vandringen nedan har
  // hoppat över dem), så closest() behöver inte köras igen för varje textnod.
  function rorText(nod, kand) {
    const p = nod.parentElement;
    if (!p) return;
    if (!kand && p.closest(UTOM_TEXT)) return;
    const nu = nod.nodeValue;
    let o = original.get(nod);
    if (!o || (nu !== o.sv && nu !== o.en)) { o = { sv: nu, en: null }; original.set(nod, o); }
    o.en = oversatt(o.sv);
    let mal = aktuellt === 'en' ? o.en : o.sv;
    // TEXT SOM HÄRLETTS UR EN ÖVERSATT TEXT. Studion skriver #title ur navetikettens textContent —
    // på engelska alltså "Settings", som då ÄR originalet för noden och inte kan återställas. Där
    // sidan märkt det med data-sprak-tillbaka slås den engelska texten upp baklänges i ordlistan.
    if (aktuellt === 'sv' && mal === nu && p.closest('[data-sprak-tillbaka]')) {
      const sv = omvand()[nu.trim()];
      if (sv) mal = nu.replace(nu.trim(), sv);
    }
    if (nu !== mal) {
      if (aktuellt === 'en' && (uppgivnaSig.size && uppgivnaSig.has(signatur(p, o.sv)) || slinga(p, o.sv))) return;
      skriver = true; nod.nodeValue = mal; skriver = false;
    }
  }

  // ÅTERKOPPLINGSSKYDD. Många skript skriver "bara vid ändring": `if (el.textContent !== text)
  // el.textContent = text`. Översätts texten ser skriptet en ändring, skriver svenskan igen, vi
  // översätter igen — en mikrouppgiftsslinga som låser sidan (uppmätt 2026-10-22 på Bakgrund-knappen
  // i stage-background.js: 9 866 varv innan sidan ens hann bli klar). Skriver vi om samma element
  // fler än SLINGA_MAX gånger inom en sekund ger vi upp det elementet: det får stå kvar på svenska,
  // och resten av sidan fortsätter. Skripten kan undvika det genom att jämföra mot VyraLang.t(text).
  // Gränsen är högt satt med flit: studions laddning skriver #title 108 gånger på någon sekund helt
  // legitimt (uppmätt, svenska), medan en slinga når tusentals varv på samma tid.
  //
  // SIGNATUREN. Ritar sidan om sig byggs elementet nytt, och ett nytt element hade fått gå sina 500
  // varv igen vid varje omritning (uppmätt på formatstatusen i layout-format.js). När ett element
  // väl gett sig minns vi därför dess form — tagg, klass och svensk text — och rör aldrig ett element
  // med samma form igen under sidans livstid. Bara bevisade slingor hamnar här, så "⚙ Anpassa" på
  // katalogens tvåhundra kort påverkas inte av det.
  const SLINGA_MAX = 500;
  const varv = new WeakMap();
  const uppgivna = new WeakSet();
  const uppgivnaSig = new Set();
  const signatur = (el, sv) => el.tagName + '.' + (typeof el.className === 'string' ? el.className : '') + '|' + sv;
  function slinga(el, sv) {
    if (uppgivna.has(el)) return true;
    const nu = Date.now();
    let v = varv.get(el);
    if (!v || nu - v.t > 1000) { v = { t: nu, n: 0 }; varv.set(el, v); }
    if (++v.n <= SLINGA_MAX) return false;
    uppgivna.add(el);
    uppgivnaSig.add(signatur(el, sv));
    try { console.warn('[vyra-sprak] återkoppling — elementet lämnas på svenska:', sv, el); } catch (_) {}
    return true;
  }

  let omvandCache = null, omvandKalla = null;
  function omvand() {
    const lista = ordlista();
    if (omvandCache && omvandKalla === lista) return omvandCache;
    omvandCache = {};
    omvandKalla = lista;
    for (const [sv, en] of Object.entries(lista)) if (sv !== en && !(en in omvandCache)) omvandCache[en] = sv;
    return omvandCache;
  }

  function rorAttr(el, namn) {
    const nu = el.getAttribute(namn);
    if (nu == null) return;
    let karta = original.get(el);
    if (!karta) { karta = {}; original.set(el, karta); }
    let o = karta[namn];
    if (!o || (nu !== o.sv && nu !== o.en)) { o = { sv: nu, en: null }; karta[namn] = o; }
    o.en = oversatt(o.sv);
    const mal = aktuellt === 'en' ? o.en : o.sv;
    if (nu !== mal) {
      const nyckel = '@' + namn + ':' + o.sv;
      if (aktuellt === 'en' && (uppgivnaSig.size && uppgivnaSig.has(signatur(el, nyckel)) || slinga(el, nyckel))) return;
      skriver = true; el.setAttribute(namn, mal); skriver = false;
    }
  }

  function rorElement(el, kand) {
    if (!kand && utanfor(el)) return;
    for (const a of ATTR) if (el.hasAttribute(a)) rorAttr(el, a);
    if (el.tagName === 'META' && el.hasAttribute('content') && /^(description|og:|twitter:)/.test(el.getAttribute('name') || el.getAttribute('property') || '')) rorAttr(el, 'content');
  }

  function rorTrad(rot) {
    if (!rot) return;
    if (rot.nodeType === 3) { rorText(rot); return; }
    if (rot.nodeType !== 1 && rot.nodeType !== 9) return;
    const start = rot.nodeType === 9 ? rot.documentElement : rot;
    if (!start || !start.isConnected || utanfor(start)) return;
    rorElement(start, true);
    // Undantagna delträd avvisas i sin helhet (FILTER_REJECT): en duk med hundra widgetnoder
    // kostar en matches() i stället för hundra closest().
    if (start.closest(SKRIVFALT)) return;
    const tw = document.createTreeWalker(start, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: n => {
        if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
        if (n.matches(UTOM)) return NodeFilter.FILTER_REJECT;
        if (n.matches(SKRIVFALT)) { rorElement(n, true); return NodeFilter.FILTER_REJECT; }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) rorText(n, true); else rorElement(n, true); }
  }

  function tillampa() {
    document.documentElement.lang = aktuellt;
    rorTrad(document);
    if (document.title) {
      let o = original.get(document);
      if (!o || (document.title !== o.sv && document.title !== o.en)) { o = { sv: document.title, en: null }; original.set(document, o); }
      o.en = oversatt(o.sv);
      document.title = aktuellt === 'en' ? o.en : o.sv;
    }
    document.querySelectorAll('[data-sprakval] button[data-sprak]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sprak === aktuellt)));
  }

  // Text som skripten skriver efter laddningen. Observern levererar i en mikrouppgift, alltså
  // samlat efter en hel render() — ett innerHTML på #view blir EN post med de nya noderna.
  // Våra egna skrivningar ger nya poster; de är redan rätt, så de kastas med takeRecords() i stället
  // för att gå ett varv till (ingen återkoppling, inget dubbelarbete).
  const obs = new MutationObserver(lista => {
    if (skriver || aktuellt !== 'en') return;
    for (const m of lista) {
      if (m.type === 'characterData') rorText(m.target);
      else if (m.type === 'attributes') { if (ATTR.includes(m.attributeName)) rorAttr(m.target, m.attributeName); }
      else m.addedNodes.forEach(n => rorTrad(n));
    }
    obs.takeRecords();
  });
  let observerar = false;
  function koppla() {
    if (aktuellt === 'en' && !observerar) {
      obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
      observerar = true;
    } else if (aktuellt !== 'en' && observerar) {
      obs.disconnect();
      observerar = false;
    }
  }

  function valj(sprak) {
    if (!SPRAK.includes(sprak) || sprak === aktuellt) return;
    aktuellt = sprak;
    try { localStorage.setItem(NYCKEL, sprak); } catch (_) {}
    tillampa();
    if (observerar) obs.takeRecords();
    koppla();
    try { window.dispatchEvent(new CustomEvent('vyra-sprak', { detail: { sprak } })); } catch (_) {}
  }

  // SV | EN-väljaren ritas där sidan har en plats för den ([data-sprakval]).
  function ritaVal() {
    document.querySelectorAll('[data-sprakval]').forEach(plats => {
      if (plats.querySelector('button[data-sprak]')) return;
      plats.setAttribute('role', 'group');
      plats.setAttribute('aria-label', 'Språk');
      plats.innerHTML = '<button type="button" data-sprak="sv" lang="sv">SV</button><button type="button" data-sprak="en" lang="en">EN</button>';
      plats.addEventListener('click', e => { const b = e.target.closest('button[data-sprak]'); if (b) valj(b.dataset.sprak); });
    });
    if (!document.getElementById('vyra-sprak-stil')) {
      const s = document.createElement('style');
      s.id = 'vyra-sprak-stil';
      s.textContent = '[data-sprakval]{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);font:600 12px/1 system-ui,sans-serif}'
        + '[data-sprakval] button{all:unset;cursor:pointer;padding:6px 10px;border-radius:999px;color:rgba(255,255,255,.7);letter-spacing:.04em}'
        + '[data-sprakval] button:hover{color:#fff}'
        + '[data-sprakval] button[aria-pressed="true"]{background:linear-gradient(120deg,#b13cff,#7c4dff);color:#fff}'
        + '[data-sprakval] button:focus-visible{outline:2px solid #c9a7ff;outline-offset:2px}'
        + '.sprakval-hornet{position:absolute;top:16px;right:16px;z-index:50}';
      document.head.append(s);
    }
  }

  function start() {
    ritaVal();
    tillampa();
    koppla();
  }

  window.VyraLang = { current: () => aktuellt, set: valj, t: oversatt, tillampa };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
