/* katalog-scen.js — galleriet i Overlay-vyn (David 2026-11-11: "visa mina widget utan folk blir
 * uttråkad och skrolla ner").
 *
 * Uppmätt före: 164 kort under 31 rubriker gav en katalog på 15 400 px — 17 skärmar vid 900 px — och
 * bilden var 140 px av kortets 329; resten var tre knapprader, upprepade på varje kort.
 *
 * GALLERIET VISAR EN FAMILJ I TAGET:
 *   • familjelistan till vänster (katalogens sektioner, i flikarnas grupper),
 *   • scenen: det valda kortets widget i stort format, med knapparna EN gång,
 *   • remsan: familjens kort på en rad — bild och namn.
 *
 * INGENTING NYTT RITAS OCH INGENTING FLYTTAS.
 *   • Korten ligger kvar i .widget-catalog med sina katalognycklar. Remsan är samma sektion, lagd på
 *     en rad med CSS; övriga familjer göms med en klass. Skripten som bygger sektionerna märker inget.
 *   • Scenen ritas av owgRenderCardThumb (overlay-preview.js) — samma väg som miniatyrerna, med
 *     skuggrot, frusna effekter och omramning. Scenens värd bär katalognyckeln bara under anropet.
 *   • Scenens knappar skickar klicket vidare till kortets egna (.owg-configure, .owg-preview,
 *     .owg-copylink, .owg-star) och "Lägg till" klickar kortet. Ingen lägg-till-logik finns här.
 *
 * ▶ TESTA WIDGET spelar designen på scenen med exempeldata, genom testmotorn (vyra-testspel.js).
 * Knappen visas bara för familjer som har en testadapter.
 *
 * KLICK PÅ ETT KORT. En riktig användargest (isTrusted) VÄLJER kortet till scenen. Ett klick från kod
 * — kort.click() från scenens knapp, från sökningen eller från ett prov — gör som förut och lägger
 * widgeten i layouten. Så förblir varje befintlig väg som klickar ett kort oförändrad.
 *
 * LISTA finns kvar: växeln Galleri/Lista ovanför katalogen ger den gamla vyn, och medan man söker
 * visas alltid listan, så att träffar i flera familjer syns samtidigt. Valet sparas per webbläsare.
 */
(function () {
  'use strict';
  if (window.VyraKatalogScen) return;

  const NYCKEL = 'vyra-katalog-vy';
  let vy = 'galleri';
  try { if (localStorage.getItem(NYCKEL) === 'lista') vy = 'lista'; } catch (_) {}

  const HJALP_GALLERI = 'Välj en familj till vänster och en design i raden. Den visas stort här, och du lägger till den med knappen under.';
  let valdFamilj = null;            // rubriktexten för vald familj
  const valtKort = new Map();       // rubriktext → katalognyckel
  let ritadNyckel = null;           // nyckeln som står på scenen just nu
  let testar = false;               // ett test spelas på scenen

  const galleri = () => document.querySelector('.overlay-widget-gallery');
  const katalog = g => g && g.querySelector(':scope > .widget-catalog');
  const soker = g => !!(g.querySelector('.widget-search')?.value || '').trim();

  // "FOLLOWER, LIKE & DIAMOND GOALS · 18 RÖRLIGA DESIGNER" → "Follower, Like & Diamond Goals".
  const SVANS = /^(\d+\s.*|VARJE .* SEPARAT|DESIGNVAL|LIVE|MILSTOLPE|SAMMA DESIGN.*|LJUS OCH RÖRELSE|EN GÅVA I FOKUS)$/i;
  const VERSALER = new Set(['MVP', 'FX', 'TTS', 'OBS']);
  function familjenamn(rubrik) {
    const delar = String(rubrik || '').split(' · ').map(s => s.trim()).filter(Boolean);
    while (delar.length > 1 && SVANS.test(delar[delar.length - 1])) delar.pop();
    let namn = delar.join(' · ').replace(/^VYRA\s+/i, '');
    if (namn === namn.toUpperCase()) {
      namn = namn.toLowerCase().replace(/(^|[\s\-·&,])([a-zåäö])/g, (m, f, b) => f + b.toUpperCase())
        .replace(/[A-Za-zÅÄÖåäö]+/g, o => VERSALER.has(o.toUpperCase()) ? o.toUpperCase() : o);
    }
    return namn || 'Widgets';
  }

  const rubrikFor = el => {
    const h = [...el.querySelectorAll('h4')].find(x => !x.classList.contains('kat-tom-rubrik'));
    return (h?.textContent || '').trim();
  };
  const kortI = el => [...el.querySelectorAll('button[data-catalog-key]')].filter(b => !b.closest('.owg-thumb') && !b.hidden);

  // Familjerna = katalogens toppbarn som har kort och inte är bortvalda av flikarna.
  function familjer(cat) {
    return [...cat.children]
      .filter(el => !el.classList.contains('kat-utanfor') && !el.classList.contains('kat-tom') && !el.hidden)
      .map(el => ({ el, rubrik: rubrikFor(el), kort: kortI(el), grupp: el.dataset.katGrupp || '', ordning: Number(el.style.order) || 0 }))
      .filter(f => f.rubrik && f.kort.length)
      .sort((a, b) => a.ordning - b.ordning);
  }

  function skapa(tagg, klass, text) {
    const el = document.createElement(tagg);
    if (klass) el.className = klass;
    if (text != null) el.textContent = text;
    return el;
  }

  // Skalet byggs om efter varje render() — vyn skrivs om från grunden. Platsen är FÖRE flikraden:
  // platsen direkt före katalogen tillhör sökningens nollträffsruta och flikraden (katalog-ordning.js).
  function skal(g, cat) {
    let vaxel = g.querySelector(':scope > .kat-vy');
    if (!vaxel) {
      vaxel = skapa('div', 'kat-vy');
      vaxel.setAttribute('role', 'group');
      vaxel.setAttribute('aria-label', 'Visning');
      vaxel.innerHTML = '<button type="button" data-kat-vy="galleri">Galleri</button><button type="button" data-kat-vy="lista">Lista</button>';
      vaxel.addEventListener('click', e => {
        const b = e.target.closest('[data-kat-vy]'); if (!b) return;
        vy = b.dataset.katVy === 'lista' ? 'lista' : 'galleri';
        try { localStorage.setItem(NYCKEL, vy); } catch (_) {}
        uppdatera();
      });
      const fam = skapa('nav', 'kat-familjer');
      fam.setAttribute('aria-label', 'Widgetfamiljer');
      const scen = skapa('div', 'kat-scen');
      scen.innerHTML =
        '<div class="kat-scen-yta" tabindex="0" aria-label="Scen. Bläddra med vänster- och högerpil.">' +
          '<div class="kat-scen-bakgrund" aria-hidden="true"><i></i></div>' +
          '<div class="kat-scen-vard"></div>' +
          '<div class="kat-scen-prov"><div class="kat-scen-prov-inre"></div></div>' +
          '<span class="kat-scen-raknare"></span>' +
          '<button type="button" class="kat-scen-pil kat-scen-bak" aria-label="Föregående design">‹</button>' +
          '<button type="button" class="kat-scen-pil kat-scen-fram" aria-label="Nästa design">›</button>' +
        '</div>' +
        '<div class="kat-scen-info">' +
          '<div class="kat-scen-namn"><b></b><small></small></div>' +
          '<div class="kat-scen-knappar">' +
            '<button type="button" class="btn btn-secondary kat-scen-testa" data-kat-gor="testa" aria-pressed="false">▶ Testa widget</button>' +
            '<button type="button" class="btn btn-primary" data-kat-gor="lagg">+ Lägg till i Layout</button>' +
            '<button type="button" class="btn btn-secondary" data-kat-gor="anpassa">⚙ Anpassa</button>' +
            '<button type="button" class="btn btn-secondary" data-kat-gor="visa">▶ Förhandsvisa</button>' +
            '<button type="button" class="btn btn-secondary" data-kat-gor="lank" title="Lägg till widgeten och kopiera dess egen länk">🔗 Kopiera länk</button>' +
            '<button type="button" class="btn btn-secondary" data-kat-gor="stjarna" aria-label="Favorit" title="Favorit">☆</button>' +
          '</div>' +
        '</div>';
      scen.addEventListener('click', e => {
        if (e.target.closest('.kat-scen-bak')) return stega(-1);
        if (e.target.closest('.kat-scen-fram')) return stega(1);
        const b = e.target.closest('[data-kat-gor]'); if (b) gor(b.dataset.katGor);
      });
      const flikar = g.querySelector(':scope > .kat-flikar');
      const nolltraff = cat.previousElementSibling?.matches('.katalog-nolltraff') ? cat.previousElementSibling : null;
      (flikar || nolltraff || cat).before(vaxel, fam, scen);
    }
    if (!cat.dataset.katScenLyssnar) {
      cat.dataset.katScenLyssnar = '1';
      // Fångstfasen: kortets egen onclick lägger widgeten i layouten, och den ska inte hinna köra
      // när en riktig gest bara väljer kortet. Kodklick (isTrusted=false) släpps igenom orörda.
      cat.addEventListener('click', e => {
        if (!e.isTrusted || !aktivt(g)) return;
        const kort = e.target.closest?.('button[data-catalog-key]');
        if (!kort || !cat.contains(kort) || kort.closest('.owg-thumb')) return;
        if (e.target.closest('.owg-star, .owg-actions, .owg-add')) return;
        e.preventDefault(); e.stopPropagation();
        valj(kort);
      }, true);
    }
    if (!g.dataset.katScenTangent) {
      g.dataset.katScenTangent = '1';
      g.addEventListener('keydown', e => {
        if (!aktivt(g) || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        if (!e.target.closest?.('.kat-scen, .widget-catalog') || e.target.closest('input, textarea, select')) return;
        e.preventDefault();
        stega(e.key === 'ArrowLeft' ? -1 : 1, true);
      });
    }
    return { vaxel, fam: g.querySelector(':scope > .kat-familjer'), scen: g.querySelector(':scope > .kat-scen') };
  }

  const aktivt = g => vy === 'galleri' && !soker(g);

  function valdFam(cat) {
    const alla = familjer(cat);
    return alla.find(f => f.rubrik === valdFamilj) || alla[0] || null;
  }
  function valtI(f) {
    const nyckel = valtKort.get(f.rubrik);
    return f.kort.find(k => k.dataset.catalogKey === nyckel) || f.kort[0];
  }

  function valj(kort) {
    const g = galleri(), cat = katalog(g); if (!cat) return;
    const f = familjer(cat).find(x => x.kort.includes(kort)); if (!f) return;
    valdFamilj = f.rubrik;
    valtKort.set(f.rubrik, kort.dataset.catalogKey);
    uppdatera();
  }

  function stega(steg, fokusera) {
    const g = galleri(), cat = katalog(g); if (!cat) return;
    const f = valdFam(cat); if (!f) return;
    const i = f.kort.indexOf(valtI(f)), n = f.kort.length;
    const nasta = f.kort[(i + steg + n) % n];
    valj(nasta);
    if (fokusera) nasta.focus({ preventScroll: true });
  }

  // Scenens knappar äger ingen logik: de trycker på kortets egna.
  function gor(vad) {
    const g = galleri(), cat = katalog(g); if (!cat) return;
    const f = valdFam(cat); if (!f) return;
    const kort = valtI(f);
    if (vad === 'testa') return testa(g.querySelector(':scope > .kat-scen'), kort);
    if (vad === 'lagg') return kort.click();
    const mal = { anpassa: '.owg-configure', visa: '.owg-preview', lank: '.owg-copylink', stjarna: '.owg-star' }[vad];
    kort.querySelector(mal)?.click();
    if (vad === 'stjarna') visaInfo(g.querySelector(':scope > .kat-scen'), f, kort);
  }

  // ▶ TESTA WIDGET. Motorn (vyra-testspel.js, garanti 7) spelar designen med exempeldata i scenens
  // provyta: samma klon, vakter och tidslinje som ▶ Testa widget i Layout. Testet når aldrig
  // sändningen, servern eller layouten. Här finns bara knappen och skalningen av klonen.
  const motor = () => (window.VyraTestspel && typeof window.VyraTestspel.spelaIKatalog === 'function') ? window.VyraTestspel : null;
  function provWidget(kort) {
    try { return typeof window.overlayPreviewWidget === 'function' ? window.overlayPreviewWidget(kort) : null; } catch (_) { return null; }
  }
  function kanTestas(kort) {
    const m = motor(); if (!m) return false;
    const w = provWidget(kort);
    try { return !!w && m.kanIKatalog(w); } catch (_) { return false; }
  }
  function visaTestlage(scen, pa) {
    klass(scen, 'kat-scen-testar', pa);
    const b = scen.querySelector('[data-kat-gor="testa"]');
    const text = pa ? '■ Stoppa test' : '▶ Testa widget';
    if (b.textContent !== text) b.textContent = text;
    b.setAttribute('aria-pressed', String(pa));
  }
  function stoppaTest() {
    const m = motor();
    if (m && testar) { try { m.stoppa(); } catch (_) {} }
  }
  function testa(scen, kort) {
    const m = motor(); if (!m) return;
    if (testar) return stoppaTest();
    const w = provWidget(kort); if (!w) return;
    const yta = scen.querySelector('.kat-scen-prov'), inre = scen.querySelector('.kat-scen-prov-inre');
    inre.replaceChildren(); inre.style.transform = '';
    testar = true;
    visaTestlage(scen, true);
    const igang = m.spelaIKatalog(w, inre, { vidStopp: () => {
      testar = false;
      inre.replaceChildren();
      const s = galleri()?.querySelector(':scope > .kat-scen');
      if (s) visaTestlage(s, false);
    } });
    if (!igang) { testar = false; visaTestlage(scen, false); return; }
    // Klonen har widgetens egen storlek (duken är 432 px bred). Den skalas så att den ryms, och
    // högst 1,5× uppåt så att en liten alert inte försvinner på scenen.
    const nod = inre.firstElementChild;
    // Några familjer (goal-motion m.fl.) sätter position:absolute!important på roten. Inline-important
    // vinner över stilmallen, så klonen står i provytans mitt — samma grepp som miniatyrerna använder.
    if (nod) ['position:relative', 'left:0', 'top:0'].forEach(r => { const [k, v] = r.split(':'); nod.style.setProperty(k, v, 'important'); });
    const b = (nod && nod.offsetWidth) || 300, h = (nod && nod.offsetHeight) || 150;
    const skala = Math.min((yta.clientWidth - 24) / b, (yta.clientHeight - 24) / h, 1.5);
    inre.style.transform = 'translate(-50%,-50%) scale(' + (skala > 0 ? skala : 1) + ')';
  }

  function ritaScen(scen, kort) {
    const vard = scen.querySelector('.kat-scen-vard');
    const nyckel = kort.dataset.catalogKey;
    if (ritadNyckel === nyckel && vard.firstElementChild) return;
    stoppaTest();
    ritadNyckel = nyckel;
    vard.replaceChildren();
    if (typeof window.owgRenderCardThumb !== 'function') return;
    const prov = skapa('div', 'kat-scen-kort');
    // Kortets egna data-fält följer med: några familjer läser fler fält än katalognyckeln.
    Object.keys(kort.dataset).forEach(k => { if (!/^(owg|kat|mk)/.test(k)) prov.dataset[k] = kort.dataset[k]; });
    vard.append(prov);
    try { window.owgRenderCardThumb(prov); } catch (e) { console.error('[katalog-scen]', nyckel, e); }
    // Nyckeln bärs bara under anropet. Katalogkartan och proven räknar [data-catalog-key] som KORT,
    // och scenen är inget kort.
    delete prov.dataset.catalogKey;
    if (!prov.querySelector('.owg-thumb')) {
      const ikon = kort.querySelector('.owg-thumb') ? null : kort.querySelector('i');
      if (ikon) prov.append(ikon.cloneNode(true));
    }
  }

  function visaInfo(scen, f, kort) {
    const b = kort.querySelector(':scope > span:not(.btn) b, :scope > b');
    const s = kort.querySelector(':scope > span:not(.btn) small');
    scen.querySelector('.kat-scen-namn b').textContent = (b?.textContent || '').trim() || familjenamn(f.rubrik);
    scen.querySelector('.kat-scen-namn small').textContent = [familjenamn(f.rubrik), (s?.textContent || '').trim()].filter(Boolean).join(' · ');
    scen.querySelector('.kat-scen-raknare').textContent = 'Design ' + (f.kort.indexOf(kort) + 1) + ' av ' + f.kort.length;
    const flera = f.kort.length > 1;
    scen.querySelectorAll('.kat-scen-pil').forEach(p => { p.hidden = !flera; });
    const nyckel = kort.dataset.catalogKey, testknapp = scen.querySelector('[data-kat-gor="testa"]');
    if (testknapp.dataset.katNyckel !== nyckel) { testknapp.dataset.katNyckel = nyckel; testknapp.hidden = !kanTestas(kort); }
    const finns = { anpassa: '.owg-configure', visa: '.owg-preview', lank: '.owg-copylink', stjarna: '.owg-star' };
    Object.keys(finns).forEach(k => { scen.querySelector('[data-kat-gor="' + k + '"]').hidden = !kort.querySelector(finns[k]); });
    const stjarna = kort.querySelector('.owg-star'), knapp = scen.querySelector('[data-kat-gor="stjarna"]');
    const pa = !!stjarna && stjarna.classList.contains('owg-star-active');
    knapp.textContent = pa ? '★' : '☆';
    knapp.setAttribute('aria-pressed', String(pa));
  }

  function ritaFamiljer(fam, alla, vald) {
    const grupper = (window.VyraKatalogOrdning?.GRUPPER || []);
    const signatur = alla.map(f => f.grupp + '|' + f.rubrik + '|' + f.kort.length).join('\n');
    if (fam.dataset.signatur !== signatur) {
      fam.dataset.signatur = signatur;
      fam.replaceChildren();
      let forra = null;
      alla.forEach(f => {
        if (f.grupp !== forra) {
          forra = f.grupp;
          const namn = grupper.find(x => x.id === f.grupp)?.namn;
          if (namn) fam.append(skapa('h5', '', namn));
        }
        const b = skapa('button', '', familjenamn(f.rubrik));
        b.type = 'button';
        b.dataset.katFamilj = f.rubrik;
        b.append(skapa('i', '', String(f.kort.length)));
        b.addEventListener('click', () => { valdFamilj = f.rubrik; uppdatera(); });
        fam.append(b);
      });
    }
    fam.querySelectorAll('[data-kat-familj]').forEach(b => {
      const pa = !!vald && b.dataset.katFamilj === vald.rubrik;
      if (b.getAttribute('aria-current') !== String(pa)) b.setAttribute('aria-current', String(pa));
    });
  }

  function klass(el, namn, pa) { if (el.classList.contains(namn) !== pa) el.classList.toggle(namn, pa); }

  function uppdatera() {
    const g = galleri(), cat = katalog(g);
    if (!cat) return;
    const delar = skal(g, cat);
    delar.vaxel.querySelectorAll('[data-kat-vy]').forEach(b => {
      const pa = b.dataset.katVy === vy;
      if (b.getAttribute('aria-pressed') !== String(pa)) b.setAttribute('aria-pressed', String(pa));
    });
    const alla = familjer(cat);
    const pa = aktivt(g) && alla.length > 0;
    klass(g, 'kat-scen-pa', pa);
    // Hjälptexten ovanför katalogen beskriver listan ("Klicka på en widget för att lägga till…").
    // I galleriet väljer ett klick kortet, så texten byts medan galleriet är på och sätts tillbaka sedan.
    const hjalp = g.querySelector(':scope > p');
    if (hjalp) {
      if (hjalp.dataset.katLista == null) hjalp.dataset.katLista = hjalp.textContent;
      const text = pa ? HJALP_GALLERI : hjalp.dataset.katLista;
      if (hjalp.textContent !== text) hjalp.textContent = text;
    }
    const vald = pa ? (alla.find(f => f.rubrik === valdFamilj) || alla[0]) : null;
    [...cat.children].forEach(el => {
      klass(el, 'kat-scen-vald', !!vald && el === vald.el);
      klass(el, 'kat-scen-dold', pa && (!vald || el !== vald.el));
    });
    const aktivtKort = vald ? valtI(vald) : null;
    cat.querySelectorAll('.kat-scen-aktiv').forEach(k => { if (k !== aktivtKort) k.classList.remove('kat-scen-aktiv'); });
    if (!pa) { stoppaTest(); ritadNyckel = null; delar.scen.querySelector('.kat-scen-vard').replaceChildren(); return; }
    valdFamilj = vald.rubrik;
    ritaFamiljer(delar.fam, alla, vald);
    if (!aktivtKort.classList.contains('kat-scen-aktiv')) {
      aktivtKort.classList.add('kat-scen-aktiv');
      aktivtKort.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    }
    ritaScen(delar.scen, aktivtKort);
    visaInfo(delar.scen, vald, aktivtKort);
  }

  // Sektionerna byggs av ett tjugotal skript, flera av dem sent. uppdatera() är idempotent, så
  // observatören somnar när inget längre ändras.
  function bevaka() {
    const g = galleri(), cat = katalog(g);
    if (!cat) return;
    uppdatera();
    if (cat.__katScenObs) return;
    let raf = 0;
    cat.__katScenObs = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; uppdatera(); });
    });
    cat.__katScenObs.observe(cat, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    const sok = g.querySelector('.widget-search');
    if (sok && !sok.__katScenSok) { sok.__katScenSok = true; sok.addEventListener('input', () => uppdatera()); }
  }

  function efterBind() {
    if (typeof view !== 'undefined' && view !== 'overlay') return;
    ritadNyckel = null;
    bevaka();
  }

  if (typeof bind === 'function') {
    const tidigare = bind;
    bind = function () { tidigare.apply(this, arguments); efterBind(); };
  }
  efterBind();

  window.VyraKatalogScen = {
    familjenamn, uppdatera,
    vy: v => { if (v === 'galleri' || v === 'lista') { vy = v; try { localStorage.setItem(NYCKEL, vy); } catch (_) {} uppdatera(); } return vy; },
    vald: () => ({ familj: valdFamilj, kort: valtKort.get(valdFamilj) || null })
  };
})();
