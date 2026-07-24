(function () {
  const LAST_X = {
    templateLastGifter: { label: 'LAST GIFTER', defaultName: 'Alex', defaultMsg: 'SENT GALAXY ×5', themes: { neon: '#ff58d6', gold: '#ffd35d', emerald: '#3ddc84' }, catalogLabel: 'Last Gifter' },
    templateLastLiker: { label: 'LAST LIKER', defaultName: 'Mia', defaultMsg: 'SENT 1 000 LIKES', themes: { neon: '#ff58d6', blue: '#4fc3ff', lime: '#a3e635' }, catalogLabel: 'Last Liker' },
    templateLastSharer: { label: 'LAST SHARER', defaultName: 'Leo', defaultMsg: 'SHARED THE LIVE', themes: { neon: '#ff58d6', teal: '#2dd4bf', orange: '#ff9d16' }, catalogLabel: 'Last Sharer' },
    templateLastSubscriber: { label: 'LAST SUBSCRIBER', defaultName: 'Sara', defaultMsg: 'JOINED THE CLUB', themes: { neon: '#ff58d6', ocean: '#4fc3ff', gold: '#ffd35d' }, catalogLabel: 'Last Subscriber' },
  };

  function lastXMessage(type, event = {}) {
    if (type === 'templateLastGifter') return `SENT ${(event.giftName || event.gift || 'A GIFT').toString().toUpperCase()} ×${event.repeatCount || event.count || 1}`;
    if (type === 'templateLastLiker') return `SENT ${event.count || event.value || 1} LIKES`;
    if (type === 'templateLastSharer') return 'SHARED THE LIVE';
    return 'JOINED THE CLUB';
  }

  function showLastX(type, event = {}) {
    state.widgets.filter(w => w.type === type).forEach(w => {
      const cfg = LAST_X[type], box = document.querySelector(`[data-id="${w.id}"]`);
      w.followName = event.username || event.nickname || event.user || w.followName || cfg.defaultName;
      w.followMessage = event.__test ? (w.followMessage || cfg.defaultMsg) : lastXMessage(type, event);
      if (event.profileImage || event.avatar) w.profileImage = event.profileImage || event.avatar;
      save();
      if (!box) return;
      const name = box.querySelector('.last-x-name'), message = box.querySelector('.last-x-message'), image = box.querySelector('.last-x-avatar img');
      if (name) name.textContent = w.followName;
      if (message) message.textContent = w.followMessage;
      if (image && w.profileImage) image.src = w.profileImage;
      box.classList.remove('last-x-active', 'last-x-leaving');
      void box.offsetWidth;
      box.classList.add('last-x-active');
      clearTimeout(box._lastXTimer);
      clearTimeout(box._lastXLeaveTimer);
      const duration = Math.max(4, Math.min(6, w.followDuration || 5)) * 1000;
      box._lastXLeaveTimer = setTimeout(() => box.classList.add('last-x-leaving'), duration - 420);
      box._lastXTimer = setTimeout(() => box.classList.remove('last-x-active', 'last-x-leaving'), duration);
    });
  }
  window.triggerLastXAlert = showLastX;

  const lastXWh = wh;
  wh = function (w) {
    const cfg = LAST_X[w.type];
    if (!cfg) return lastXWh(w);
    const color = w.followColor || Object.values(cfg.themes)[0], entrance = w.lastXEntrance || 'slide-left';
    return `<div class="widget last-x-card last-x-${entrance}${selected === w.id ? ' selected' : ''}" data-id="${w.id}" style="left:${w.x}px;top:${w.y}px;width:${w.width || 500}px;--last-x:${color};--last-x-name-size:${w.lastXNameSize || 24}px;--last-x-action-size:${w.lastXActionSize || 12}px;zoom:${w.widgetScale || 1}"><div class="last-x-avatar"><span></span><img src="${w.profileImage || 'assets/images/test-profile.svg'}"></div><div class="last-x-copy"><small>${w.followLabel || cfg.label}</small><strong class="last-x-name">${w.followName || cfg.defaultName}</strong><em class="last-x-message">${w.followMessage || cfg.defaultMsg}</em></div><div class="last-x-emblem">✦</div>${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}</div>`;
  };

  const lastXProps = props;
  props = function () {
    const w = state.widgets.find(x => x.id === selected), cfg = w && LAST_X[w.type];
    if (!cfg) return lastXProps();
    const themeKeys = Object.keys(cfg.themes);
    return `<h3>${cfg.catalogLabel.toUpperCase()}</h3><div class="template-badge">PREMIUM · AUTO HIDE</div><div hidden><input id="pt" value="${w.title || ''}"><input id="pv" value=""></div><div class="property-group"><h4>INNEHÅLL</h4><label>Rubrik<input id="followLabel" value="${w.followLabel || cfg.label}"></label><label>Testnamn<input id="followName" value="${w.followName || cfg.defaultName}"></label><label>Testhändelse<input id="followMessage" value="${w.followMessage || cfg.defaultMsg}"></label><label>Profilbild<input id="followProfile" value="${w.profileImage || 'assets/images/test-profile.svg'}"></label></div><div class="property-group"><h4>DESIGN & RÖRELSE</h4><label>Tema<select id="followTheme">${themeKeys.map(t => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label><label>Accentfärg<input id="followColor" type="color" value="${w.followColor || cfg.themes[themeKeys[0]]}"></label><label>Rörelse<select id="lastXEntrance"><option value="slide-left">Slider in från vänster</option><option value="slide-right">Slider in från höger</option><option value="pop">Poppar in</option><option value="fade">Mjuk fade</option></select></label><label class="range-label">Namntext <b>${w.lastXNameSize || 24}px</b><input id="lastXNameSize" type="range" min="14" max="40" value="${w.lastXNameSize || 24}"></label><label class="range-label">Händelsetext <b>${w.lastXActionSize || 12}px</b><input id="lastXActionSize" type="range" min="8" max="22" value="${w.lastXActionSize || 12}"></label></div><div class="property-group follow-trigger-editor"><h4>TRIGGER</h4><label class="range-label">Visningstid <b>${Math.max(4, Math.min(6, w.followDuration || 5))} sek</b><input id="followDuration" type="range" min="4" max="6" value="${Math.max(4, Math.min(6, w.followDuration || 5))}"></label><button id="testLastX" type="button">▶ Testa alert</button></div><div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || 500}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  const lastXBind = bind;
  bind = function () {
    lastXBind();
    if (view !== 'editor' && view !== 'overlay') return;
    const w = state.widgets.find(x => x.id === selected), cfg = w && LAST_X[w.type];
    if (cfg) {
      const set = (id, key, num = false) => { const el = document.querySelector(id); if (el) el.onchange = e => { w[key] = num ? +e.target.value : e.target.value; save(); render(); }; };
      set('#followLabel', 'followLabel'); set('#followName', 'followName'); set('#followMessage', 'followMessage'); set('#followProfile', 'profileImage'); set('#followColor', 'followColor'); set('#followDuration', 'followDuration', true); set('#lastXEntrance', 'lastXEntrance'); set('#lastXNameSize', 'lastXNameSize', true); set('#lastXActionSize', 'lastXActionSize', true);
      const theme = document.querySelector('#followTheme'), entrance = document.querySelector('#lastXEntrance');
      if (theme) { theme.value = w.followTheme || Object.keys(cfg.themes)[0]; theme.onchange = e => { w.followTheme = e.target.value; w.followColor = cfg.themes[w.followTheme]; save(); render(); }; }
      if (entrance) entrance.value = w.lastXEntrance || 'slide-left';
      const test = document.querySelector('#testLastX'); if (test) test.onclick = () => showLastX(w.type, { __test: true });
    }

    const catalog = document.querySelector('.widget-catalog');
    if (catalog && !catalog.querySelector('[data-last-x]')) {
      const section = document.createElement('section'); section.dataset.lastX = '1'; section.className = 'follower-alert-template-section';
      section.innerHTML = '<h4>LAST-X ALERTS</h4>' + Object.entries(LAST_X).map(([type, c]) => `<button data-last-x-type="${type}"><i>✦</i><span><b>${c.catalogLabel}</b><small>Profil · händelse · 4–6 sek</small></span></button>`).join('') + '<button class="last-x-add-all" data-last-x-all><i>＋</i><span><b>Lägg till alla fyra</b><small>Gifter · Liker · Sharer · Subscriber</small></span></button>';
      catalog.prepend(section);
      const add = type => { const c = LAST_X[type], id = type + Date.now(); state.widgets.push({ id, type, x: 100, y: 80, width: 500, title: c.catalogLabel, followLabel: c.label, followName: c.defaultName, followMessage: c.defaultMsg, followColor: Object.values(c.themes)[0], followDuration: 5, lastXEntrance: 'slide-left' }); selected = id; };
      section.querySelectorAll('[data-last-x-type]').forEach(b => b.onclick = () => { add(b.dataset.lastXType); save(); render(); toast(LAST_X[b.dataset.lastXType].catalogLabel + ' skapad'); });
      section.querySelector('[data-last-x-all]').onclick = () => { Object.keys(LAST_X).forEach((type, i) => { if (!state.widgets.some(w => w.type === type)) { add(type); const item = state.widgets[state.widgets.length - 1]; item.y = 60 + i * 120; item.lastXEntrance = i % 2 ? 'slide-right' : 'slide-left'; } }); save(); render(); toast('Alla Last-X alerts tillagda'); };
    }
  };

  if (typeof routeLiveBattleEvent === 'function') {
    const lastXRoute = routeLiveBattleEvent;
    routeLiveBattleEvent = function (event = {}) {
      lastXRoute(event);
      const type = String(event.type || event.event || '').toLowerCase();
      if (type.includes('gift')) showLastX('templateLastGifter', event);
      if (type.includes('like')) showLastX('templateLastLiker', event);
      if (type.includes('share')) showLastX('templateLastSharer', event);
      if (type.includes('subscribe') || type.includes('member')) showLastX('templateLastSubscriber', event);
    };
  }
  if (new URLSearchParams(location.search).has('overlay') && typeof render === 'function') render();
})();
