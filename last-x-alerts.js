(function () {
  // Last-X Alerts: Last Gifter / Last Liker / Last Sharer / Last Subscriber. Config-driven clone of
  // followerAlertHtml (media.js) sharing its exact .follower-spotlight markup/CSS/chrome instead of
  // duplicating four near-identical wh/props/bind chains.
  const LAST_X = {
    templateLastGifter: { label: 'LAST GIFTER', defaultName: 'Alex', defaultMsg: 'SENT GALAXY ×5', themes: { gold: '#ffd35d', emerald: '#3ddc84', violet: '#b06bff' }, catalogLabel: 'Last Gifter' },
    templateLastLiker: { label: 'LAST LIKER', defaultName: 'Mia', defaultMsg: 'HIT 1 000 LIKES', themes: { pink: '#ff4fa3', blue: '#4fc3ff', lime: '#a3e635' }, catalogLabel: 'Last Liker' },
    templateLastSharer: { label: 'LAST SHARER', defaultName: 'Leo', defaultMsg: 'SHARED THE STREAM', themes: { orange: '#ff9d16', teal: '#2dd4bf', indigo: '#818cf8' }, catalogLabel: 'Last Sharer' },
    templateLastSubscriber: { label: 'NEW MEMBER', defaultName: 'Sara', defaultMsg: 'JOINED THE CLUB', themes: { gold: '#ffd35d', ocean: '#4fc3ff', blush: '#ff6f9c' }, catalogLabel: 'Last Subscriber' },
  };

  const lastXWh = wh;
  wh = function (w) {
    const cfg = LAST_X[w.type];
    if (!cfg) return lastXWh(w);
    return `<div class="widget follower-spotlight${selected === w.id ? ' selected' : ''}" data-id="${w.id}" style="left:${w.x}px;top:${w.y}px;width:${w.width || 300}px;--follow:${w.followColor || Object.values(cfg.themes)[0]};zoom:${w.widgetScale || 1}"><div class="follow-light"></div><div class="follow-avatar"><img src="${w.profileImage || 'assets/images/test-profile.svg'}"></div><div class="follow-label"><i></i><span>${w.followLabel || cfg.label}</span><i></i></div><h2>${w.followName || cfg.defaultName}</h2><p>${w.followMessage || cfg.defaultMsg}</p>${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}</div>`;
  };

  const lastXProps = props;
  props = function () {
    const w = state.widgets.find(x => x.id === selected), cfg = w && LAST_X[w.type];
    if (!cfg) return lastXProps();
    const themeKeys = Object.keys(cfg.themes);
    return `<h3>${cfg.catalogLabel.toUpperCase()}</h3><div class="template-badge">SPOTLIGHT</div><div hidden><input id="pt" value="${w.title || ''}"><input id="pv" value=""></div><div class="property-group"><h4>INNEHÅLL</h4><label>Rubrik<input id="followLabel" value="${w.followLabel || cfg.label}"></label><label>Namn<input id="followName" value="${w.followName || cfg.defaultName}"></label><label>Text under<input id="followMessage" value="${w.followMessage || cfg.defaultMsg}"></label><label>Profilbild<input id="followProfile" value="${w.profileImage || 'assets/images/test-profile.svg'}"></label></div><div class="property-group"><h4>DESIGN</h4><label>Tema<select id="followTheme">${themeKeys.map(t => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label><label>Accentfärg<input id="followColor" type="color" value="${w.followColor || cfg.themes[themeKeys[0]]}"></label></div><div class="property-group follow-trigger-editor"><h4>TRIGGER</h4><label class="range-label">Visningstid <b>${w.followDuration || 6} sek</b><input id="followDuration" type="range" min="2" max="15" value="${w.followDuration || 6}"></label><button id="testLastX" type="button">▶ Testa</button></div><div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || 300}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  const lastXBind = bind;
  bind = function () {
    lastXBind();
    if (view !== 'editor' && view !== 'overlay') return;
    const w = state.widgets.find(x => x.id === selected), cfg = w && LAST_X[w.type];
    if (cfg) {
      const set = (id, key, num = false) => { const el = document.querySelector(id); if (el) el.onchange = e => { w[key] = num ? +e.target.value : e.target.value; save(); render(); }; };
      set('#followLabel', 'followLabel'); set('#followName', 'followName'); set('#followMessage', 'followMessage');
      set('#followProfile', 'profileImage'); set('#followColor', 'followColor'); set('#followDuration', 'followDuration', true);
      const theme = document.querySelector('#followTheme');
      if (theme) { theme.value = w.followTheme || Object.keys(cfg.themes)[0]; theme.onchange = e => { w.followTheme = e.target.value; w.followColor = cfg.themes[w.followTheme]; save(); render(); }; }
      const test = document.querySelector('#testLastX');
      if (test) test.onclick = () => { const box = document.querySelector(`[data-id="${w.id}"]`); box?.classList.add('follow-active'); setTimeout(() => box?.classList.remove('follow-active'), (w.followDuration || 6) * 1000); };
    }

    const catalog = document.querySelector('.widget-catalog');
    if (catalog && !catalog.querySelector('[data-last-x]')) {
      const section = document.createElement('section');
      section.dataset.lastX = '1';
      section.className = 'follower-alert-template-section';
      section.innerHTML = '<h4>LAST-X ALERTS</h4>' + Object.entries(LAST_X).map(([type, c]) => `<button data-last-x-type="${type}"><i>✦</i><span><b>${c.catalogLabel}</b><small>Spotlight-alert</small></span></button>`).join('');
      catalog.prepend(section);
      section.querySelectorAll('[data-last-x-type]').forEach(b => b.onclick = () => {
        const type = b.dataset.lastXType, c = LAST_X[type], id = type + Date.now();
        state.widgets.push({ id, type, x: 100, y: 80, width: 300, title: c.catalogLabel, followLabel: c.label, followName: c.defaultName, followMessage: c.defaultMsg, followColor: Object.values(c.themes)[0], followDuration: 6 });
        selected = id; save(); render(); toast(c.catalogLabel + ' skapad');
      });
    }
  };

  if (new URLSearchParams(location.search).has('overlay') && typeof render === 'function') render();
})();
