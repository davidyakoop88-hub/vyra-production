/* katalog-ordning.js — vad katalogen visar och i vilken ordning (David 2026-11-03).
 *
 * 1. UTGÅNGNA KORT. Designerna nedan tas bort ur katalogen ("de två ta bort", "alla de ska bort").
 *    Bara KORTEN försvinner: renderare, nyckelresolvare och fält finns kvar, så en widget som redan
 *    ligger i någons layout ritas och fungerar som förut, och VyraWidgets.create(nyckel) fungerar.
 *    Sektionsrubriker med antal ("· 8 DESIGNER") räknas om, och en sektion utan kort döljs.
 * 2. ORDNING OCH FLIKAR ("sortera de rätt Top Like, Top Gifter, Top Streak, och lägg de i grupper så
 *    man behöver inte bläddra neråt mycket"). Sektionerna sorteras i grupper med CSS `order` — ingen
 *    sektion flyttas i DOM:en, så skripten som bygger dem (och placerar dem i förhållande till
 *    varandra) aldrig slåss med den här filen. Flikraden ligger UTANFÖR .widget-catalog: katalogens
 *    knappar är alltid kort med katalognyckel, och kartan räknar dem.
 *    "Alla" är förvalet; valet sparas per webbläsare.
 *
 * Katalogsektionerna byggs av ett tjugotal skript, flera av dem sent och om igen vid varje bind.
 * Därför körs ordna() efter bind OCH av en observatör på katalogen. ordna() är idempotent: andra
 * varvet hittar inget att ändra och rör inte DOM:en, så observatören somnar.
 */
(function () {
  'use strict';
  if (window.VyraKatalogOrdning) return;

  const UTGANGNA = new Set([
    // Ranking · Celestial och Royal Rose (Top Like, Top Coins, Top Points)
    'catalog:toplike:celestial', 'catalog:ranking:templateTopCoins:celestial', 'catalog:ranking:templateTopPoints:celestial',
    'catalog:toplike:royal-rose', 'catalog:ranking:templateTopCoins:royal-rose', 'catalog:ranking:templateTopPoints:royal-rose',
    // Top Streak Flip · alla fem
    'catalog:pgstreak:royal-wings', 'catalog:pgstreak:frost-wings', 'catalog:pgstreak:emerald-wings',
    'catalog:pgstreak:neon-wings', 'catalog:pgstreak:rose-wings',
    // Fireworks & Bubbles — Supernova och Gift Bubbles är kvar
    'catalog:giftfireworks:festival', 'catalog:giftfireworks:royal', 'catalog:giftfireworks:ice',
    'catalog:giftfireworks:rose', 'catalog:giftfireworks:comet', 'catalog:heartfireworks',
    // Guardian Emblem · de fyra praktstegen — modellerna Blå kristall och Grön aura är kvar
    'catalog:guardianemblem:1', 'catalog:guardianemblem:2', 'catalog:guardianemblem:3', 'catalog:guardianemblem:4',
    // Like Fountain · Portal · alla nio — klassiska Like Fountain är kvar
    'catalog:likefountain:portal:portal', 'catalog:likefountain:portal:rainbow', 'catalog:likefountain:portal:neon',
    'catalog:likefountain:portal:fire', 'catalog:likefountain:portal:ice', 'catalog:likefountain:portal:gold',
    'catalog:likefountain:portal:aurora', 'catalog:likefountain:portal:pastel', 'catalog:likefountain:portal:mono',
    // Battle MVP · sex ramar
    'catalog:battlemvp:frame:royal-ribbon', 'catalog:battlemvp:frame:laurel-star', 'catalog:battlemvp:frame:dark-wings',
    'catalog:battlemvp:frame:dragon-fire', 'catalog:battlemvp:frame:nautical-helm', 'catalog:battlemvp:frame:shadow-star',
    // Battle MVP · sex firanden — Guldkrona och Lion Clash är kvar
    'catalog:battlemvp:celebration:coronation', 'catalog:battlemvp:celebration:wings', 'catalog:battlemvp:celebration:portal',
    'catalog:battlemvp:celebration:rosegold', 'catalog:battlemvp:celebration:pearl', 'catalog:battlemvp:celebration:moon',
    // Gift Campaign · Ljus och rörelse · alla sex (David 2026-11-07) — Fokus, Classic och Gåvoflöde är kvar
    'catalog:giftcampaign:gold:landscape', 'catalog:giftcampaign:gold:portrait', 'catalog:giftcampaign:platinum:landscape',
    'catalog:giftcampaign:platinum:portrait', 'catalog:giftcampaign:emerald:landscape', 'catalog:giftcampaign:emerald:portrait',
    // VIDEO FX · Koi Pearl Lagoon och Masquerade Ball (David 2026-11-07) — Pink Princess, Royal Ruby och Cloud Fox är kvar
    'catalog:glovesnipe:koiPearl:pack:2', 'catalog:glovesnipe:masquerade:pack:2'
  ]);

  // Grupperna i flikordning. En sektion hamnar i den FÖRSTA gruppen vars mönster matchar rubriken,
  // så "FOLLOWER, LIKE & DIAMOND GOALS" blir Mål och inte Alerts. Det som inte matchar blir Övrigt.
  const GRUPPER = [
    { id: 'toplike', namn: 'Top Like', re: /RANKING|TOP LIKE|TOP COINS|TOP POINTS/ },
    { id: 'topgifter', namn: 'Top Gifter', re: /TOP GIFT/ },
    { id: 'topstreak', namn: 'Top Streak', re: /STREAK/ },
    { id: 'mal', namn: 'Mål', re: /GOAL|GIFT JAR|GIFT CAMPAIGN|MÅL/ },
    { id: 'alerts', namn: 'Alerts', re: /ALERT|LEVEL|GUARDIAN|FOLLOWER/ },
    { id: 'battle', namn: 'Battle', re: /BATTLE|BOXGAME|VIDEO FX/ },
    { id: 'effekter', namn: 'Effekter', re: /FIREWORKS|BUBBLES|HJÄRTAN|FOUNTAIN|MOLN/ },
    { id: 'ovrigt', namn: 'Övrigt', re: null }
  ];
  const NYCKEL = 'vyra-katalog-flik';
  let flik = 'alla';
  try { const s = localStorage.getItem(NYCKEL); if (s === 'alla' || GRUPPER.some(g => g.id === s)) flik = s; } catch (_) {}

  // Ett barn i katalogen är oftast en sektion, men Video FX ligger som en sektion i ett eget
  // block (<div data-video-packs>). Blocket sorteras som en enhet efter sin första rubrik.
  const rubrik = s => (s.querySelector(':scope > h4, section > h4')?.textContent || '').toUpperCase();
  const gruppFor = s => {
    const r = rubrik(s);
    return GRUPPER.find(g => g.re && g.re.test(r)) || GRUPPER[GRUPPER.length - 1];
  };

  function rensa(cat) {
    let andrat = false;
    cat.querySelectorAll('[data-catalog-key]').forEach(b => {
      if (!UTGANGNA.has(b.dataset.catalogKey)) return;
      const sek = b.closest('section');
      const grupp = b.closest('.rk6-grupp');
      b.remove(); andrat = true;
      if (grupp && !grupp.querySelector('[data-catalog-key]')) grupp.remove();
      if (sek) sek.dataset.katRensad = '1';
    });
    cat.querySelectorAll('section[data-kat-rensad]').forEach(sek => {
      const n = sek.querySelectorAll('[data-catalog-key]').length;
      const h = sek.querySelector(':scope > h4');
      // Antalet i rubriken ska stämma med korten som är kvar ("· 8 DESIGNER" → "· 2 DESIGNER").
      if (h) {
        const ny = h.textContent.replace(/\d+(?=\s+(?:RÖRLIGA\s+)?(?:DESIGNER|KOREOGRAFIER|MODELLER|PRAKTSTEG|TEMAN|PAKET)\b)/i, String(n));
        if (ny !== h.textContent) { h.textContent = ny; andrat = true; }
      }
      const tom = n === 0;
      if (sek.classList.contains('kat-tom') !== tom) { sek.classList.toggle('kat-tom', tom); andrat = true; }
      // En sektion kan ha flera rubriker (Gift Campaign: "Ljus och rörelse" och efter den "En gåva i
      // fokus"). En rubrik vars alla kort gått ut göms, så den inte står tom ovanför nästa rubrik.
      const barn = [...sek.children];
      barn.forEach((el, i) => {
        if (el.tagName !== 'H4') return;
        let kort = false;
        for (let j = i + 1; j < barn.length && barn[j].tagName !== 'H4'; j++) {
          if (barn[j].matches('[data-catalog-key]') || barn[j].querySelector('[data-catalog-key]')) { kort = true; break; }
        }
        const dold = !kort && !tom;
        if (el.classList.contains('kat-tom-rubrik') !== dold) { el.classList.toggle('kat-tom-rubrik', dold); andrat = true; }
      });
    });
    return andrat;
  }

  // Medan man söker gäller sökningen hela katalogen — en vald flik får inte gömma en träff.
  const sokfalt = cat => cat.closest('.overlay-widget-gallery, .elements-panel')?.querySelector('.widget-search');
  function sortera(cat) {
    const soker = !!(sokfalt(cat)?.value || '').trim();
    [...cat.children].forEach((sek, i) => {
      if (sek.tagName !== 'SECTION' && !sek.querySelector('section')) return;
      const g = gruppFor(sek), gi = GRUPPER.indexOf(g);
      const ordning = String(gi * 1000 + i);
      if (sek.style.order !== ordning) sek.style.order = ordning;
      if (sek.dataset.katGrupp !== g.id) sek.dataset.katGrupp = g.id;
      const utanfor = !soker && flik !== 'alla' && flik !== g.id;
      if (sek.classList.contains('kat-utanfor') !== utanfor) sek.classList.toggle('kat-utanfor', utanfor);
    });
  }

  function flikrad(cat) {
    // Platsen DIREKT före katalogen tillhör sökningens nollträffsruta (media.js vyraFiltreraKatalog letar
    // efter den som catalog.previousElementSibling). Flikraden ligger därför före den, aldrig mellan.
    let rad = cat.parentElement?.querySelector(':scope > .kat-flikar');
    if (!rad) {
      rad = document.createElement('div');
      rad.className = 'kat-flikar';
      rad.setAttribute('role', 'tablist');
      rad.setAttribute('aria-label', 'Widgetgrupper');
      rad.innerHTML = [{ id: 'alla', namn: 'Alla' }, ...GRUPPER].map(g =>
        `<button type="button" role="tab" data-kat-flik="${g.id}">${g.namn}</button>`).join('');
      rad.addEventListener('click', e => {
        const b = e.target.closest('[data-kat-flik]'); if (!b) return;
        flik = b.dataset.katFlik;
        try { localStorage.setItem(NYCKEL, flik); } catch (_) {}
        document.querySelectorAll('.widget-catalog').forEach(c => ordna(c));
        cat.parentElement?.scrollTo?.({ top: 0 });
      });
      const nolltraff = cat.previousElementSibling?.matches('.katalog-nolltraff') ? cat.previousElementSibling : null;
      (nolltraff || cat).before(rad);
    }
    // En flik utan sektioner (t.ex. utloggad) visas inte.
    const finns = new Set([...cat.querySelectorAll(':scope > [data-kat-grupp]:not(.kat-tom)')].filter(s => s.querySelector('[data-catalog-key]')).map(s => s.dataset.katGrupp));
    rad.querySelectorAll('[data-kat-flik]').forEach(b => {
      const id = b.dataset.katFlik, pa = id === flik, dold = id !== 'alla' && !finns.has(id);
      if (b.getAttribute('aria-selected') !== String(pa)) b.setAttribute('aria-selected', String(pa));
      if (b.hidden !== dold) b.hidden = dold;
    });
  }

  function ordna(cat) {
    rensa(cat);
    sortera(cat);
    flikrad(cat);
  }

  function bevaka(cat) {
    ordna(cat);
    if (cat.__katObs) return;
    let raf = 0;
    cat.__katObs = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; ordna(cat); });
    });
    cat.__katObs.observe(cat, { childList: true, subtree: true });
    const sok = sokfalt(cat);
    if (sok && !sok.__katSok) { sok.__katSok = true; sok.addEventListener('input', () => ordna(cat)); }
  }

  function efterBind() {
    if (typeof view !== 'undefined' && view !== 'editor' && view !== 'overlay') return;
    document.querySelectorAll('.widget-catalog').forEach(bevaka);
  }

  if (typeof bind === 'function') {
    const tidigare = bind;
    bind = function () { tidigare.apply(this, arguments); efterBind(); };
  }
  efterBind();

  window.VyraKatalogOrdning = { UTGANGNA, GRUPPER, gruppFor, ordna, flik: () => flik };
})();
