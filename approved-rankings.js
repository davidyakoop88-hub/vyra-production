(function () {
  'use strict';

  const LIKE_SKINS = new Set(['clean-bar', 'soft-stack', 'mini-podium', 'side-rank']);
  const LIKE_LABELS = Object.freeze({
    'clean-bar': 'VYRA Clean Bar',
    'soft-stack': 'VYRA Soft Stack',
    'mini-podium': 'VYRA Mini Podium',
    'side-rank': 'VYRA Side Rank'
  });
  let installed = false;

  function cleanStreakHtml(w) {
    const profile = VyraSafe.url(w.profileImage, 'assets/images/test-profile.svg');
    const gift = VyraSafe.url(w.giftImage, 'assets/gifts/events/0001_Rose.png');
    const name = VyraSafe.text(w.dataName, 'MAYA');
    const value = VyraSafe.text(w.dataValue, '18');
    const width = Math.max(150, Number(w.width) || 220);
    return `<div class="widget vyra-streak approved-streak${selected===w.id?' selected':''}" data-id="${w.id}" style="left:${w.x||0}px;top:${w.y||0}px;width:${width}px;--streak:${w.accent||'#ffc94d'};--flip-duration:${Math.max(4,Number(w.streakFlipSeconds)||8)}s;zoom:${w.widgetScale||1}"><div class="streak-flip"><div class="streak-gift-face"><img src="${gift}" alt=""></div><div class="streak-profile-face"><img src="${profile}" alt=""></div></div><div class="approved-streak-copy"><strong>${name}</strong><em>×${value} STREAK</em></div>${selected===w.id?'<span class="resize-handle">↘</span>':''}</div>`;
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
    if (section.dataset.approvedToplike === '1' && current.length === LIKE_SKINS.size && current.every(id => LIKE_SKINS.has(id))) return;
    section.dataset.approvedToplike = '1';
    section.innerHTML = '<h4>TOP LIKE · VYRA ORIGINAL</h4>' + Object.entries(LIKE_LABELS).map(([id, label]) => `<button type="button" data-top-like-theme="${id}" data-catalog-key="catalog:toplike:${id}"><i>V</i><span><b>${label}</b><small>Profilbild · namn — likes</small></span></button>`).join('');
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

  function install() {
    if (installed) return;
    installed = true;

    const previousWh = wh;
    wh = function (w) {
      if (w && w.type === 'templateTopStreak') return cleanStreakHtml(w);
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
      if (w && w.type === 'templateTopStreak') bindControls(w);
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

  window.VyraApprovedRankings = Object.freeze({ cleanCatalog, cleanStreakHtml, likeSkins: [...LIKE_SKINS] });
})();
