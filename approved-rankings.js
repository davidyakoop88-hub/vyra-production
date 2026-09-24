(function () {
  'use strict';

  // Ranking-sixpack (2026-09-24): LIKE_SKINS ar en VITLISTA, inte bara en katalogkalla - wh()
  // langre ner tvingar varje skin som inte star har tillbaka till 'clean-bar' (samma "skinn som
  // glommer de nya vitlistorna"-monster som redan finns dokumenterat i toplike-studio.js).
  // Bade denna lista OCH toplike-design.js:s VYRA_TOPLIKE_STYLES maste innehalla samma sex ID:n,
  // annars renderas Celestial/Royal Rose/etc alltid som Clean Bar i overlay - matt i riktig
  // Chromium, katalogkorten saknades helt tills detta lades till.
  const LIKE_SKINS = new Set(['clean-bar', 'soft-stack', 'mini-podium', 'side-rank', 'voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose']);
  const LIKE_LABELS = Object.freeze({
    'clean-bar': 'VYRA Clean Bar',
    'soft-stack': 'VYRA Soft Stack',
    'mini-podium': 'VYRA Mini Podium',
    'side-rank': 'VYRA Side Rank',
    voltage: 'VYRA Voltage',
    'basic-v2': 'VYRA Basic v2',
    'prism-vertical': 'VYRA Prism (vertikal)',
    'prism-horizontal': 'VYRA Prism (horisontal)',
    celestial: 'VYRA Celestial',
    'royal-rose': 'VYRA Royal Rose'
  });
  // De sex ranking-sixpack-designerna listas INTE i Top Like-sektionen: de är en design för alla tre
  // rankingtyperna och har sin egen grupperade katalog i ranking-sixpack.js. De står kvar i
  // LIKE_SKINS ovan — vitlistan avgör vad som får renderas, inte vad som listas här.
  const SIXPACK = new Set(['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose']);
  const KATALOG_LABELS = Object.entries(LIKE_LABELS).filter(([id]) => !SIXPACK.has(id));
  let installed = false;

  // FABRIKENS DEMONAMN. widget-factory.js ('@StreamQueen') och createCleanStreak ('MAYA') bakar in
  // en person i widgetobjektet sa att editorn har nagot att designa mot. I overlay ar det en
  // pahittad person tittarna aldrig fick. Samma lista som DEMO_NAMES i live-zero-state.js - som
  // dock saknar 'maya' och vars selektorer (.streak-copy) inte traffar Clean Flip alls.
  const DEMO_NAMN = new Set(['streamqueen', 'maya']);
  const arDemoNamn = namn => DEMO_NAMN.has(String(namn || '').trim().toLowerCase().replace(/^@/, ''));

  // ... MEN 'Maya' AR OCKSA ETT VANLIGT RIKTIGT NAMN, och den har regeln kors vid VARJE render i
  // overlay - inte bara fore forsta gavan, som live-zero-state.js:s DOM-nollning. En tittare som
  // heter Maya hade fatt sitt namn blankat och sin streak nollad om och om igen mitt i sandningen.
  //
  // Skiljelinjen ar darfor inte namnet utan OM LIVEDATA HAR RORT WIDGETEN: gift-event-images.js
  // satter `giftName` pa varje rekord (raden `widget.giftName = giftName || widget.giftName`),
  // och varken widget-factory.js:s 'topstreak' eller createCleanStreak lamnar det faltet. Finns
  // giftName kommer namnet fran en riktig gava och renderas som det ar.
  const arDemo = w => !w.giftName && (arDemoNamn(w.dataName) || !w.dataName);

  // OVERLAY-LAGET LASES UR URL:EN, en gang och pa ett stalle. media.js:s VYRA_OVERLAY ar samma
  // svar, men som en global fran en annan fil; vyra-tom-widget.js och live-leaderboard.js laser
  // URL:en av samma skal ("oberoende av laddningsordningen").
  const iOverlay = () => new URLSearchParams(location.search).has('overlay');

  function cleanStreakHtml(w) {
    const profile = VyraSafe.url(w.profileImage, 'assets/images/test-profile.svg');
    const gift = VyraSafe.url(w.giftImage, 'assets/gifts/events/0001_Rose.png');
    // TVA LAGEN UTAN TITTARE, TVA OLIKA BILDER - MED FLIT (samma som Top Gift):
    //   - DEMOVARDEN, dvs fabrikens '@StreamQueen'/18 eller createCleanStreaks 'MAYA'/18, ar det
    //     man designar mot i editorn. I overlay renderas de som tomt namn och '×0 STREAK' - ingen
    //     pahittad person (live-zero-state.js:s regel, som inte nar Clean Flips markup). Det ar
    //     ocksa den bild referensvakten fotograferar: fabrikens widget, synligt nollad.
    //   - TOMD widget (falten borttagna av "Tom widget" eller live:start) doljs helt i overlay -
    //     Davids beslut 2026-09-09 - av doljOmTom() nedan via vyra-tom-widget.js, och samma modul
    //     visar den igen vid forsta gavan (avsloja). Livedatan ar en riktad DOM-patch, inte en
    //     render(); darfor ligger avslojandet dar och inte har.
    // Ett riktigt namn i state (skrivet av gift-event-images.js vid ett rekord) renderas, sa en
    // omritning mitt i sandningen inte nollar det som just visats.
    //
    // Talet ligger i ett eget <b> inne i <em>: patchen skriver BARA talet, sa '×' och 'STREAK'
    // star kvar efter forsta gavan (SHAPES.templateTopStreak i gift-event-images.js).
    //
    // OPACITET, LAGER OCH DOLJ: wh-overriden i install() anropar aldrig kedjan under sig, sa
    // media.js:s styledWh (opacity/z-index/hidden) och liveVisibilityWh (widget-hidden + display:
    // none!important) nadde aldrig Clean Flip - "Dolj widget" och lagerordningen gjorde ingenting
    // for Top Streak. Samma varden skrivs darfor har, i samma form som media.js:973.
    const overlay = iOverlay();
    const demo = overlay && arDemo(w);
    const name = demo ? '' : VyraSafe.text(w.dataName, 'MAYA');
    const value = demo ? '0' : VyraSafe.text(w.dataValue, overlay ? '0' : '18');
    const width = Math.max(150, Number(w.width) || 220);
    const dold = w.hidden ? 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;' : '';
    return `<div class="widget vyra-streak approved-streak${w.hidden?' widget-hidden':''}${selected===w.id?' selected':''}" data-id="${w.id}" style="${dold}left:${w.x||0}px;top:${w.y||0}px;width:${width}px;opacity:${(w.opacity??100)/100};z-index:${w.layer||1};--streak:${w.accent||'#ffc94d'};--flip-duration:${Math.max(4,Number(w.streakFlipSeconds)||8)}s;zoom:${w.widgetScale||1}"><div class="streak-flip"><div class="streak-gift-face"><img src="${gift}" alt=""></div><div class="streak-profile-face"><img src="${profile}" alt=""></div></div><div class="approved-streak-copy"><strong>${name}</strong><em>×<b>${value}</b> STREAK</em></div>${selected===w.id?'<span class="resize-handle">↘</span>':''}</div>`;
  }

  function approvedStreakProps(w) {
    return `<h3>VYRA TOP STREAK</h3><div class="template-badge">CLEAN FLIP · VAR 8:E SEKUND</div><div hidden><input id="pt" value="${VyraSafe.text(w.title,'Top Streak')}"><input id="pv" value=""></div><div class="property-group"><h4>INNEHÅLL</h4><label>Namn<input id="approvedStreakName" value="${VyraSafe.text(w.dataName,'MAYA')}"></label><label>Streak<input id="approvedStreakValue" type="number" min="1" value="${Number(w.dataValue)||18}"></label><label>Profilbild<input id="approvedStreakProfile" value="${VyraSafe.url(w.profileImage,'assets/images/test-profile.svg')}"></label><label>Gåvobild<input id="approvedStreakGift" value="${VyraSafe.url(w.giftImage,'assets/gifts/events/0001_Rose.png')}"></label></div><div class="property-group"><h4>DESIGN</h4><label>Accent<input id="approvedStreakAccent" type="color" value="${w.accent||'#ffc94d'}"></label><label class="range-label">Flippar var <b>${Math.max(4,Number(w.streakFlipSeconds)||8)} sek</b><input id="approvedStreakSeconds" type="range" min="4" max="20" value="${Math.max(4,Number(w.streakFlipSeconds)||8)}"></label><small>Flippen fortsätter under hela LIVE-sändningen.</small></div><div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x||0}"></label><label>Y<input id="propY" type="number" value="${w.y||0}"></label><label>Bredd<input id="propWidth" type="number" min="150" max="500" value="${w.width||220}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer||1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  }

  function createCleanStreak() {
    const w = VyraWidgets.create('catalog:topstreak');
    Object.assign(w, {
      streakTheme: 'approved-clean', streakFrame: null, width: 220,
      dataName: 'MAYA', dataValue: 18, showBackground: false,
      streakFlipSeconds: 8, accent: '#ffc94d'
    });
    state.widgets = state.widgets.filter(item => VyraWidgets.isStandalone(item) || item.type !== 'templateTopStreak');
    state.widgets.push(w); selected = w.id; save(); render(); toast('Top Streak · Clean Flip skapad');
  }

  function createApprovedLike(theme) {
    const w = VyraWidgets.create('catalog:toplike:' + theme);
    window.applyVyraTopLikeStyle?.(w, theme);
    state.widgets = state.widgets.filter(item => VyraWidgets.isStandalone(item) || item.type !== 'templateTopLike');
    state.widgets.push(w); selected = w.id; save(); render(); toast(LIKE_LABELS[theme] + ' skapad');
  }

  function ensureApprovedLikes(catalog) {
    let section = catalog.querySelector('[data-toplike-template]');
    if (!section) {
      section = document.createElement('section');
      section.dataset.toplikeTemplate = '1';
      section.className = 'toplike-template-section';
      catalog.prepend(section);
    }
    const current = [...section.querySelectorAll('[data-top-like-theme]')].map(button => button.dataset.topLikeTheme);
    if (section.dataset.approvedToplike === '1' && current.length === KATALOG_LABELS.length && current.every(id => LIKE_SKINS.has(id) && !SIXPACK.has(id))) return;
    section.dataset.approvedToplike = '1';
    section.innerHTML = '<h4>TOP LIKE · VYRA ORIGINAL</h4>' + KATALOG_LABELS.map(([id, label]) => `<button type="button" data-top-like-theme="${id}" data-catalog-key="catalog:toplike:${id}"><i>V</i><span><b>${label}</b><small>Profilbild · namn — likes</small></span></button>`).join('');
    section.querySelectorAll('[data-top-like-theme]').forEach(button => {
      button.onclick = () => createApprovedLike(button.dataset.topLikeTheme);
    });
  }

  function cleanCatalog() {
    const catalog = document.querySelector('.widget-catalog');
    if (!catalog) return;

    catalog.querySelectorAll('.streak-template-section:not([data-approved-streak])').forEach(el => el.remove());
    ensureApprovedLikes(catalog);
    if (catalog.querySelector('[data-approved-streak]')) return;
    const section = document.createElement('section');
    section.dataset.approvedStreak = '1';
    section.className = 'streak-template-section approved-streak-catalog';
    section.innerHTML = '<h4>VYRA TOP STREAK · CLEAN FLIP</h4><button type="button" data-approved-streak-create data-catalog-key="catalog:topstreak"><i>V</i><span><b>Clean Flip</b><small>Gåva ↔ profil · transparent · var 8:e sekund</small></span></button>';
    catalog.prepend(section);
    section.querySelector('button').onclick = createCleanStreak;

  }

  function bindControls(w) {
    const set = (selector, key, convert) => {
      const input = document.querySelector(selector);
      if (!input) return;
      input.onchange = e => { w[key] = convert ? convert(e.target.value) : e.target.value; save(); render(); };
    };
    set('#approvedStreakName', 'dataName');
    set('#approvedStreakValue', 'dataValue', Number);
    set('#approvedStreakProfile', 'profileImage');
    set('#approvedStreakGift', 'giftImage');
    set('#approvedStreakAccent', 'accent');
    set('#approvedStreakSeconds', 'streakFlipSeconds', Number);
  }

  // TOMD WIDGET SYNS INTE I SANDNINGEN (Davids beslut 2026-09-09, vyra-tom-widget.js). Den regeln
  // sitter som en wh-wrapper LAGRE i kedjan, och overriden nedan anropar aldrig kedjan for Top
  // Streak - uppmatt i CI (tom-widget.browser.test.js): en tomd Clean Flip syntes i overlay.
  // Samma avgorande (arTom) och samma doljning, sa avslojandet vid forsta gavan galler aven har.
  // Fabrikens demovarden ar INTE tomma (dataValue 18): de renderas synligt nollade av
  // cleanStreakHtml, och det ar den bilden referensvakten fotograferar.
  function doljOmTom(w, html) {
    const TW = typeof window !== 'undefined' && window.VyraTomWidget;
    return iOverlay() && TW && TW.arTom(w) ? TW.dolj(html) : html;
  }

  function install() {
    if (installed) return;
    installed = true;

    const previousWh = wh;
    wh = function (w) {
      if (w && w.type === 'templateTopStreak') return doljOmTom(w, cleanStreakHtml(w));
      if (w && w.type === 'templateTopLike') {
        const safeSkin = LIKE_SKINS.has(w.skin) ? w.skin : 'clean-bar';
        let html = previousWh({...w, skin: safeSkin, showBackground: w.showBackground === true});
        if (w.showBackground !== true && !html.includes('ranking-bg-off')) {
          html = html.replace('class="widget vyra-toplike', 'class="widget vyra-toplike ranking-bg-off');
        }
        return html;
      }
      return previousWh(w);
    };

    const previousProps = props;
    props = function () {
      const w = liveWidget(selected);
      return w && w.type === 'templateTopStreak' ? approvedStreakProps(w) : previousProps();
    };

    const previousBind = bind;
    bind = function () {
      previousBind();
      if (view === 'editor' || view === 'overlay') cleanCatalog();
      if (view !== 'editor') return;
      const w = liveWidget(selected);
      if (w && w.type === 'templateTopLike') document.querySelector('#likeTheme')?.closest('label')?.remove();
      if (w && w.type === 'templateTopStreak') {
        bindControls(w);
        // DODA KONTROLLER TAS BORT, OCH BADA SKJUTS IN I EN SENARE BINDARE - inte i props().
        //
        // `#streakTheme` ar media.js:139:s stilmeny med de SJU avvecklade designerna (inferno, neon,
        // ice, royal, sakura-rail, cyber-grid, storm). Uppmatt 2026-09-21 i riktig Chrome: menyn
        // fanns i Clean Flips panel med alla sju kvar, och dess onchange skriver streakTheme och
        // accent - pa en widget som alltid ritas som Clean Flip. Att valja en design som inte finns
        // kvar ar precis det #487 skulle stada bort.
        //
        // `.gaf-frame-group` ar gift-alert-frames.js ramvaljare: cleanStreakHtml laser aldrig
        // profileFrame, sa den ritade ingenting (uppmatt 2026-09-20).
        //
        // Mats i bind-fasen. Ett prov som bara laser props() ser ingen av dem - bada injiceras
        // efter att panelen renderats, och just sa missade tests/streak-style-menu.js menyn.
        document.querySelector('.properties #streakTheme')?.closest('label')?.remove();
        document.querySelector('.properties .gaf-frame-group')?.remove();
      }
    };

    cleanCatalog();
    if (typeof render === 'function') render();
  }

  const observer = new MutationObserver(mutations => {
    if (!mutations.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.streak-template-section') || n.querySelector?.('.streak-template-section'))))) return;
    queueMicrotask(cleanCatalog);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'complete') install();
  else addEventListener('load', install, { once: true });

  window.VyraApprovedRankings = Object.freeze({ cleanCatalog, cleanStreakHtml, createLike: createApprovedLike, likeSkins: [...LIKE_SKINS] });
})();
