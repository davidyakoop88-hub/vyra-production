// vyra-hig.js — HIG-lagret för studions ram (designgranskning 2026-11-12).
//
// Syskon till vyra-hig.css. Rättar de fynd som inte går att lösa med enbart CSS, utan att röra
// studio.js (minifierad handkod, se CLAUDE.md) eller någon widget. Allt här:
//   · gör ingenting i overlay-utgången (?overlay=1) — OBS ska aldrig få något av det här
//   · rör aldrig .canvas, .widget eller katalogens förhandsvisningar
//   · är idempotent: varje steg kan köras om efter varje omritning utan att dubblera något
//
// Stegen, med fyndnumret från granskningen:
//   aktuellSida()     20  aria-current="page" på aktiv menypunkt + 19 fönstertitel per sida
//   dekorativaIkoner()20  SVG-ikoner bredvid text göms för skärmläsare (aria-hidden)
//   etiketter()        3  formulärfält utan etikett får ett tillgängligt namn
//   profilbilder()     8  trasiga profilbilder ersätts med initialen
//   ordval()           9  "Senaste events" → "Senaste händelser" (rubrik i studio.js)
//   tekniskStatus()   16  LIVE-kontrolls tekniska mätvärden fälls ihop under "Teknisk status"
//   spotifyLage()     14  Spotify: "Aktiv"-etiketten döljs där kryssrutan "På" redan säger samma sak
(function () {
  'use strict';
  if (new URLSearchParams(location.search).has('overlay')) return;

  const UNDANTAG = '.canvas, .widget, .owg-thumb, .owg-configure-preview';
  const iWidget = el => !!(el.closest && el.closest(UNDANTAG));

  // ---- 20 + 19: aktiv sida -----------------------------------------------------------------
  // Den aktiva menypunkten markerades bara visuellt (klassen .active). Skärmläsare fick inte veta
  // vilken sida som var vald, och fönstertiteln var "VYRA" på alla sidor.
  function sidnamn() {
    if (new URLSearchParams(location.search).get('open') === 'layout' && document.querySelector('#view > .editor-shell')) return 'Layout';
    const aktiv = document.querySelector('aside nav .active, aside .aside-bottom .active');
    if (!aktiv) return '';
    const etikett = aktiv.querySelector('span');
    return ((etikett ? etikett.firstChild && etikett.firstChild.textContent : aktiv.textContent) || '').trim();
  }
  function aktuellSida() {
    document.querySelectorAll('aside nav :is(button, a), aside .aside-bottom button').forEach(knapp => {
      const ar = knapp.classList.contains('active');
      if (ar && knapp.getAttribute('aria-current') !== 'page') knapp.setAttribute('aria-current', 'page');
      else if (!ar && knapp.hasAttribute('aria-current')) knapp.removeAttribute('aria-current');
    });
    // Rolltexten under användarnamnet kapas med ellips i vyra-hig.css; hela texten i title.
    const roll = document.getElementById('accountPlan');
    if (roll && roll.title !== roll.textContent.trim()) roll.title = roll.textContent.trim();
    const namn = sidnamn();
    const titel = namn ? namn + ' · VYRA' : 'VYRA';
    if (document.title !== titel) document.title = titel;
  }

  // ---- 20: dekorativa ikoner ---------------------------------------------------------------
  // En SVG bredvid en synlig text säger inget nytt. Utan aria-hidden läses den som "bild" i
  // menyn och i knapparna. Ikoner UTAN text bredvid lämnas: de kan vara knappens enda namn.
  function dekorativaIkoner(rot) {
    (rot || document).querySelectorAll('aside svg:not([aria-hidden]), main > header svg:not([aria-hidden]), #view :is(button, a) svg:not([aria-hidden])').forEach(svg => {
      if (iWidget(svg)) return;
      const knapp = svg.closest('button, a') || svg.parentElement;
      const text = knapp ? (knapp.textContent || '').trim() : '';
      if (text || (knapp && (knapp.getAttribute('aria-label') || knapp.title))) {
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
      }
    });
  }

  // ---- 3: formulärfält utan etikett --------------------------------------------------------
  // 18 fält på 9 sidor hade bara platshållartext, som försvinner när man skriver och som inte
  // alla skärmläsare läser. Fältet får ett aria-label: platshållaren, annars den synliga text
  // som står närmast före fältet i samma rad.
  function narmasteText(falt) {
    let nod = falt.previousSibling;
    while (nod) {
      const t = (nod.textContent || '').trim();
      if (t && !(nod.matches && nod.matches('input, select, textarea, button'))) return t;
      nod = nod.previousSibling;
    }
    const forelder = falt.parentElement;
    if (!forelder) return '';
    const egen = [...forelder.childNodes].filter(n => n.nodeType === 3 || (n.matches && n.matches('span, b, small, strong, em')))
      .map(n => (n.textContent || '').trim()).filter(Boolean).join(' ');
    return egen;
  }
  function etiketter(rot) {
    (rot || document.getElementById('view') || document).querySelectorAll('input:not([type=hidden]):not([type=button]):not([type=submit]), select, textarea').forEach(falt => {
      if (iWidget(falt)) return;
      if (falt.getAttribute('aria-label') || falt.getAttribute('aria-labelledby')) return;
      if (falt.labels && falt.labels.length) return;
      // Sista reserven för en rullista utan text omkring sig (LIVE-kontrolls filter, Action &
      // Events gåvoval): dess första alternativ, ORDAGRANT — "Alla event", "Välj gåva…".
      // Inget prefix: vyra-sprak.js översätter aria-label bara när hela texten finns i ordlistan.
      const forsta = falt.tagName === 'SELECT' && falt.options[0] ? falt.options[0].textContent.trim() : '';
      const namn = (falt.getAttribute('placeholder') || '').trim() || narmasteText(falt) || forsta;
      if (namn) falt.setAttribute('aria-label', namn.replace(/\s+/g, ' ').slice(0, 80));
    });
  }

  // ---- 8: trasiga profilbilder -------------------------------------------------------------
  // TikToks avatarlänkar går ut. Fem bilder på Översikt och fyra på Statistik laddades inte och
  // lämnade en tom ruta. Nu ersätts bilden av namnets första tecken i samma ruta.
  function initial(img) {
    const kort = img.closest('article, li, tr, .toppgivare-kort, [class*="supporter"], [class*="givare"]');
    const namn = kort && kort.querySelector('b, strong, .name, [class*="namn"]');
    const t = ((namn && namn.textContent) || img.alt || '').replace(/[^\p{L}\p{N}]/gu, '');
    return t ? t[0].toUpperCase() : '?';
  }
  addEventListener('error', e => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || iWidget(img) || !img.closest('#view')) return;
    if (img.dataset.vyraBildSaknas) return;
    img.dataset.vyraBildSaknas = '1';
    // Bilden ligger KVAR i DOM:en, dold: andra moduler och prov (command-center-alltime.browser)
    // räknar <img> och läser src. Initialen läggs bredvid.
    const ersattning = document.createElement('span');
    ersattning.className = 'vyra-bild-saknas';
    ersattning.setAttribute('aria-hidden', 'true');
    ersattning.textContent = initial(img);
    img.hidden = true;
    img.after(ersattning);
  }, true);

  // ---- 9: ordval i studio.js-mallar --------------------------------------------------------
  // Rubrikerna kommer ur studio.js, som inte får ändras direkt. Bara exakt hela rubriktexten
  // byts, så att ingen användartext kan träffas.
  const ORD = { 'Senaste events': 'Senaste händelser' };
  function ordval(rot) {
    (rot || document.getElementById('view') || document).querySelectorAll('h2, h3').forEach(h => {
      if (iWidget(h)) return;
      const ny = ORD[(h.textContent || '').trim()];
      if (ny) h.textContent = ny;
    });
  }

  // ---- 16: LIVE-kontrolls tekniska mätvärden -----------------------------------------------
  // Kö 0/2000, köbelastning och fördröjning i ms stod överst bland det en streamer behöver.
  // De behövs vid felsökning, så de ligger kvar — hopfällda under "Teknisk status". Läget
  // (öppen/stängd) överlever omritningarna som live-control.js gör vid varje händelse.
  let tekniskOppen = false;
  try { tekniskOppen = sessionStorage.getItem('vyra-lc-teknisk') === '1'; } catch (_) { /* privat läge */ }
  function tekniskStatus() {
    const sektion = document.querySelector('#view .lc-page section.lc-performance');
    if (!sektion || sektion.parentElement.matches('details.lc-teknisk')) return;
    const ruta = document.createElement('details');
    ruta.className = 'lc-teknisk';
    ruta.open = tekniskOppen;
    const rubrik = document.createElement('summary');
    rubrik.innerHTML = '<b>Teknisk status</b><small>För felsökning: kö, fördröjning och skydd mot överbelastning.</small>';
    ruta.append(rubrik);
    sektion.replaceWith(ruta);
    ruta.append(sektion);
    ruta.addEventListener('toggle', () => {
      tekniskOppen = ruta.open;
      try { sessionStorage.setItem('vyra-lc-teknisk', ruta.open ? '1' : '0'); } catch (_) { /* privat läge */ }
    });
  }

  // ---- 14: Spotify, samma läge två gånger --------------------------------------------------
  // Varje musikåtgärd visade en grön "Aktiv"-etikett OCH en ikryssad "På"-ruta. När etiketten
  // bara säger på/av upprepar den rutan och döljs. Säger den något annat ("Anslut Spotify först",
  // "Styrs av Låtönskningar-widgeten") är den information och står kvar — liksom på kort utan ruta.
  const BARA_LAGE = /^(Aktiv|Av|Active|Off)$/;
  function spotifyLage() {
    document.querySelectorAll('#view [data-spk-status]').forEach(etikett => {
      const kort = etikett.closest('article');
      const harRuta = !!(kort && kort.querySelector('input[type=checkbox]'));
      const dold = harRuta && BARA_LAGE.test((etikett.textContent || '').trim());
      if (etikett.hidden !== dold) etikett.hidden = dold;
    });
  }

  // ---- Körning -----------------------------------------------------------------------------
  // En observatör för hela ramen, sammanslagen till högst en körning per bildruta. Observatören
  // själv ändrar bara attribut och byter enstaka noder, så den triggar inte sig själv i en loop
  // (attributfilter: bara class, för aria-current).
  let schemalagd = false;
  function kor() {
    schemalagd = false;
    aktuellSida();
    dekorativaIkoner();
    etiketter();
    ordval();
    tekniskStatus();
    spotifyLage();
  }
  function schemalagg() {
    if (schemalagd) return;
    schemalagd = true;
    (window.requestAnimationFrame || setTimeout)(kor);
  }
  function start() {
    kor();
    const mal = document.body;
    if (!mal || typeof MutationObserver !== 'function') return;
    new MutationObserver(lista => {
      for (const m of lista) {
        // Widgetarnas egna fasklasser och partiklar byter många gånger i sekunden; de berör inte
        // ramen och får inte väcka lagret.
        if (m.target && m.target.nodeType === 1 && (iWidget(m.target) || m.target.matches(UNDANTAG))) continue;
        schemalagg();
        return;
      }
    }).observe(mal, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.VyraHig = { kor, sidnamn };
})();
