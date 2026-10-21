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
// som byts när VyraLang byggs"). Den här filen laddas än så länge bara på de publika sidorna.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.VyraLang) return;

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
  function oversatt(sv) {
    if (aktuellt !== 'en' || typeof sv !== 'string') return sv;
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

  function rorText(nod) {
    const p = nod.parentElement;
    if (!p) return;
    if (p.closest('script, style, noscript, title, [data-sprak-orort]')) return;
    const nu = nod.nodeValue;
    let o = original.get(nod);
    if (!o || (nu !== o.sv && nu !== o.en)) { o = { sv: nu, en: null }; original.set(nod, o); }
    o.en = oversatt(o.sv);
    const mal = aktuellt === 'en' ? o.en : o.sv;
    if (nu !== mal) { skriver = true; nod.nodeValue = mal; skriver = false; }
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
    if (nu !== mal) { skriver = true; el.setAttribute(namn, mal); skriver = false; }
  }

  function rorElement(el) {
    if (el.closest && el.closest('script, style, noscript, [data-sprak-orort]')) return;
    for (const a of ATTR) if (el.hasAttribute(a)) rorAttr(el, a);
    if (el.tagName === 'META' && el.hasAttribute('content') && /^(description|og:|twitter:)/.test(el.getAttribute('name') || el.getAttribute('property') || '')) rorAttr(el, 'content');
  }

  function rorTrad(rot) {
    if (!rot) return;
    if (rot.nodeType === 3) { rorText(rot); return; }
    if (rot.nodeType !== 1 && rot.nodeType !== 9) return;
    const start = rot.nodeType === 9 ? rot.documentElement : rot;
    rorElement(start);
    const tw = document.createTreeWalker(start, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) rorText(n); else rorElement(n); }
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

  // Text som skripten skriver efter laddningen.
  const obs = new MutationObserver(lista => {
    if (skriver) return;
    for (const m of lista) {
      if (m.type === 'characterData') rorText(m.target);
      else if (m.type === 'attributes') { if (ATTR.includes(m.attributeName)) rorAttr(m.target, m.attributeName); }
      else m.addedNodes.forEach(rorTrad);
    }
  });

  function valj(sprak) {
    if (!SPRAK.includes(sprak) || sprak === aktuellt) return;
    aktuellt = sprak;
    try { localStorage.setItem(NYCKEL, sprak); } catch (_) {}
    tillampa();
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
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
  }

  window.VyraLang = { current: () => aktuellt, set: valj, t: oversatt, tillampa };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
