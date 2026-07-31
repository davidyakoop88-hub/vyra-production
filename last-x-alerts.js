// last-x-alerts.js — Studio-native port of public/widgets/last-x-alerts.html's design system.
// Replaces the old four-separate-templates version (templateLastGifter/Liker/Sharer/Subscriber,
// one fixed "card" look, no design picker) with a single "Last-X Alerts" catalog widget offering
// the same five designs (card/stack/skew/badge/royal) and the same "all four on one shared stage"
// default that the OBS overlay already ships. Old placed widgets of the four retired types keep
// rendering via a small compatibility shim below (mapped onto the new type/design fields) instead
// of vanishing from anyone's layout.
(function () {
  // Same four templates as the OBS widget (labels, themes, message formats) so Studio and OBS
  // speak the same visual language. multiAccent is each type's signature colour when this widget
  // is configured for more than one type — solo defaults all share the same neon pink, which would
  // make a shared stage unreadable.
  const giftLine = e => `${String(e.giftName || e.gift || 'GIFT').toUpperCase().slice(0, 40)} ×${Math.max(1, Math.round(Number(e.count ?? e.repeatCount) || 1))}`;
  const TYPES = {
    gifter: {
      label: 'LAST GIFTER', catalogLabel: 'Last Gifter', events: ['gift'], multiAccent: '#ffd35d',
      themes: { neon: '#ff58d6', gold: '#ffd35d', emerald: '#3ddc84' },
      defaultName: 'Alex', defaultMsg: 'SENT GALAXY ×5',
      message: e => e.__test ? undefined : `SENT ${giftLine(e)}`
    },
    liker: {
      label: 'LAST LIKER', catalogLabel: 'Last Liker', events: ['like', 'likes'], multiAccent: '#ff58d6',
      themes: { neon: '#ff58d6', blue: '#4fc3ff', lime: '#a3e635' },
      defaultName: 'Mia', defaultMsg: 'SENT 1 000 LIKES',
      message: e => e.__test ? undefined : `SENT ${Math.max(1, Math.round(Number(e.count ?? e.value) || 1)).toLocaleString('sv-SE')} LIKES`
    },
    sharer: {
      label: 'LAST SHARER', catalogLabel: 'Last Sharer', events: ['share'], multiAccent: '#2dd4bf',
      themes: { neon: '#ff58d6', teal: '#2dd4bf', orange: '#ff9d16' },
      defaultName: 'Leo', defaultMsg: 'SHARED THE LIVE',
      message: () => 'SHARED THE LIVE'
    },
    subscriber: {
      label: 'LAST SUBSCRIBER', catalogLabel: 'Last Subscriber',
      // Deliberately real "subscribe" events only, NOT "member" room-joins — the old version routed
      // member here too, which fired on every viewer entering the room. Fixed to match the OBS widget.
      events: ['subscribe'], multiAccent: '#4fc3ff',
      themes: { neon: '#ff58d6', ocean: '#4fc3ff', gold: '#ffd35d' },
      defaultName: 'Sara', defaultMsg: 'JOINED THE CLUB',
      message: () => 'JOINED THE CLUB'
    }
  };
  const TYPE_KEYS = Object.keys(TYPES);
  const DESIGNS = { card: 'Card', stack: 'Stack', skew: 'Skew', badge: 'Badge', royal: 'Royal Coronation' };
  const ENTRANCES = ['slide-left', 'slide-right', 'pop', 'fade'];
  const EMBLEM = { card: '✦', stack: '✦', skew: '✦', badge: '◆', royal: '✦' };

  // Old placed widgets used one type PER template (templateLastGifter etc.) — map those onto the
  // new single-type field so nothing already on a layout disappears when this file updates.
  const LEGACY_TYPE = { templateLastGifter: 'gifter', templateLastLiker: 'liker', templateLastSharer: 'sharer', templateLastSubscriber: 'subscriber' };

  function lastXTypeOf(w) {
    if (w.type === 'templateLastX') return String(w.lastXType || 'all').toLowerCase();
    return LEGACY_TYPE[w.type] || null;
  }
  function activeKeysFor(w) {
    const raw = lastXTypeOf(w);
    if (raw === 'all') return TYPE_KEYS;
    const picked = String(raw || '').split(',').map(s => s.trim()).filter(k => TYPES[k]);
    return picked.length ? picked : ['gifter'];
  }
  function isLastX(w) { return w.type === 'templateLastX' || !!LEGACY_TYPE[w.type]; }

  // Toggling checkboxes builds this comma list back up (falling back to the clean 'all' string
  // when every box ends up checked, so a fresh widget still reads as "all" rather than a
  // four-item list) — activeKeysFor() above already parses both forms identically either way.
  function setActiveKeys(w, keys) {
    if (!keys.length) return; // never allow "nothing selected" — the caller re-checks the box instead
    w.lastXType = keys.length === TYPE_KEYS.length ? 'all' : keys.join(',');
  }

  function accentFor(w, typeKey) {
    if (w.inheritBrandKit && state.brandKit?.highlight) return state.brandKit.highlight;
    if (w.followColor) return w.followColor;
    const active = activeKeysFor(w), multi = active.length > 1;
    if (multi) return TYPES[typeKey].multiAccent;
    const themeKeys = Object.keys(TYPES[typeKey].themes);
    const theme = themeKeys.includes(w.followTheme) ? w.followTheme : themeKeys[0];
    return TYPES[typeKey].themes[theme];
  }
  // Highlight (--last-x) comes from accentFor() above; text/secondary-text/font are static per
  // render (not per incoming event) so they only need setting once here, not in applyLX().
  function brandKitStyleFor(w) {
    if (!w.inheritBrandKit || !state.brandKit) return '';
    const kit = state.brandKit;
    return (kit.text ? `;--last-x-text:${kit.text}` : '')
      + (kit.secondaryText ? `;--last-x-sub:${kit.secondaryText}` : '')
      + (kit.fontFamily ? `;--last-x-font:${kit.fontFamily}` : '');
  }
  function labelFor(w, typeKey) {
    const active = activeKeysFor(w), multi = active.length > 1;
    return (multi ? TYPES[typeKey].label : (w.followLabel || TYPES[typeKey].label)).slice(0, 40);
  }
  function designOf(w) { return DESIGNS[w.lastXDesign] ? w.lastXDesign : 'card'; }
  function entranceOf(w) { return ENTRANCES.includes(w.lastXEntrance) ? w.lastXEntrance : 'slide-left'; }
  function holdMsOf(w) { return Math.max(4, Math.min(6, w.followDuration || 5)) * 1000; }

  // card/stack/skew/badge hug their own content (last-x-alerts.css's width:fit-content) so the
  // resize handle sits exactly at the plate's edge — but that means dragging it changes w.width
  // with nothing visible to show for it. These are each design's natural size in last-x-alerts.css
  // (its min-width floor) at zoom 1; dragging now maps the resulting width onto a zoom factor
  // instead, so the WHOLE plate (avatar, text, emblem, everything together) scales down or up,
  // and the fit-content shell keeps hugging the now-different rendered size either way. Royal is
  // excluded — its plate already scales with width directly (width:100% + aspect-ratio in CSS),
  // so it doesn't need a second, competing scale mechanism.
  const DESIGN_BASE_WIDTH = { card: 340, stack: 240, skew: 380, badge: 250 };
  function zoomFor(w) {
    const design = designOf(w), base = DESIGN_BASE_WIDTH[design];
    const widgetScale = w.widgetScale || 1;
    if (!base) return widgetScale; // royal: width already IS the scale mechanism
    const dragScale = Math.max(0.4, Math.min(2.5, (w.width || base) / base));
    return dragScale * widgetScale;
  }

  // ---- render: shows the widget's PRIMARY type at rest (its own accent/label/test copy) — the
  // phase machine below swaps content in place for whichever type is actually showing. ----
  const lastXWh = wh;
  wh = function (w) {
    if (!isLastX(w)) return lastXWh(w);
    const active = activeKeysFor(w), typeKey = active[0], cfg = TYPES[typeKey];
    const design = designOf(w), entrance = entranceOf(w);
    const accent = accentFor(w, typeKey);
    const name = w.followName || cfg.defaultName;
    const message = w.followMessage || cfg.defaultMsg;
    const label = labelFor(w, typeKey);
    const hasImage = w.profileImage ? ` data-has-image="1"` : '';
    return `<div class="widget last-x-widget design-${design} entrance-${entrance}${selected === w.id ? ' selected' : ''}" data-id="${w.id}"
        style="left:${w.x}px;top:${w.y}px;width:${w.width || 500}px;--last-x:${accent}${brandKitStyleFor(w)};zoom:${zoomFor(w)}">
      <div class="last-x-tilt">
        <div class="last-x-glass"><div class="last-x-sheen"></div><div class="last-x-gleam"></div></div>
        <div class="last-x-avatar"${hasImage}><span class="last-x-initial">${(name[0] || '✦').toUpperCase()}</span><img src="${w.profileImage || ''}" alt=""></div>
        <div class="last-x-copy">
          <div class="last-x-label">${label}</div>
          <div class="last-x-name">${name}</div>
          <div class="last-x-message">${message}</div>
        </div>
        <div class="last-x-emblem">${EMBLEM[design]}</div>
      </div>
      ${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}
    </div>`;
  };

  // ---- sidebar property panel ----
  const lastXProps = props;
  props = function () {
    const w = state.widgets.find(x => x.id === selected);
    if (!w || !isLastX(w)) return lastXProps();
    // Old widgets (templateLastGifter etc.) get read-only info instead of the full new panel until
    // the user actually re-adds a fresh "Last-X Alerts" widget from the catalog — editing an old
    // template's fields in place would silently half-migrate it.
    if (w.type !== 'templateLastX') {
      const legacy = LEGACY_TYPE[w.type], cfg = TYPES[legacy];
      return `<h3>${cfg.catalogLabel.toUpperCase()} (ÄLDRE VERSION)</h3>
        <div class="template-badge">PREMIUM · AUTO HIDE</div>
        <p style="padding:0 2px;font-size:12px;color:#b9a6dd;line-height:1.5">Den här widgeten använder den gamla designen. Ta bort den och lägg till <b>Last-X Alerts</b> från katalogen för att få de fem nya designerna (Card, Stack, Skew, Badge, Royal Coronation).</p>
        <div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || 500}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div>
        <button class="delete" id="del">Ta bort</button>`;
    }
    const active = activeKeysFor(w), typeKey = active[0], multi = active.length > 1;
    const themeKeys = Object.keys(TYPES[typeKey].themes);
    return `<h3>LAST-X ALERTS</h3><div class="template-badge">PREMIUM · AUTO HIDE</div>
      <div class="property-group"><h4>VILKA SKA VISAS</h4>
        <p class="last-x-type-hint">Kryssa av dem du inte vill ha med — widgeten cyklar bara mellan de kvarvarande, i en delad scen om fler än en är kvar.</p>
        <div class="last-x-type-checks">
          ${TYPE_KEYS.map(k => `<label class="last-x-type-check"><input type="checkbox" id="lastXType_${k}" data-key="${k}"${active.includes(k) ? ' checked' : ''}><span>${TYPES[k].catalogLabel}</span></label>`).join('')}
        </div>
      </div>
      <div class="property-group"><h4>DESIGN & RÖRELSE</h4>
        <label>Design<select id="lastXDesign">${Object.entries(DESIGNS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>Rörelse<select id="lastXEntrance">
          <option value="slide-left">Slider in från vänster</option>
          <option value="slide-right">Slider in från höger</option>
          <option value="pop">Poppar in</option>
          <option value="fade">Mjuk fade</option>
        </select></label>
      </div>
      <div class="property-group" id="lastXThemeGroup" style="display:${multi || w.inheritBrandKit ? 'none' : ''}">
        <h4>TEMA</h4>
        <label>Färgtema<select id="followTheme">${themeKeys.map(t => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>
      </div>
      <div class="property-group"><h4>ACCENTFÄRG</h4>
        <label class="last-x-type-check"><input type="checkbox" id="inheritBrandKit"${w.inheritBrandKit ? ' checked' : ''}><span>Ärv globalt färgschema (🎨 Färgschema-knappen ovan)</span></label>
        <label>Egen accent (åsidosätter tema)<input id="followColor" type="color" value="${w.followColor || TYPES[typeKey].themes[themeKeys[0]]}" ${w.inheritBrandKit ? 'disabled' : ''}></label>
      </div>
      <div class="property-group"><h4>INNEHÅLL (förhandsvisning)</h4>
        <label>Rubrik<input id="followLabel" value="${w.followLabel || TYPES[typeKey].label}" ${multi ? 'disabled' : ''}></label>
        <label>Testnamn<input id="followName" value="${w.followName || TYPES[typeKey].defaultName}"></label>
        <label>Testhändelse<input id="followMessage" value="${w.followMessage || TYPES[typeKey].defaultMsg}" ${multi ? 'disabled' : ''}></label>
        <label>Profilbild (URL)<input id="followProfile" value="${w.profileImage || ''}"></label>
      </div>
      <div class="property-group follow-trigger-editor"><h4>TRIGGER</h4>
        <label class="range-label">Visningstid <b>${Math.max(4, Math.min(6, w.followDuration || 5))} sek</b><input id="followDuration" type="range" min="4" max="6" value="${Math.max(4, Math.min(6, w.followDuration || 5))}"></label>
        <button id="testLastX" type="button">▶ Testa alert</button>
        ${multi ? '<button id="testLastXAll" type="button">▶ Testa alla fyra i rad</button>' : ''}
      </div>
      <div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || 500}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div>
      <button class="delete" id="del">Ta bort</button>`;
  };

  // ---- per-widget phase machine: enter -> hold -> exit over per-type latest-event slots, exactly
  // like the OBS widget, but state lives on the widget's own DOM node (box._lx) since several
  // Last-X widgets can be on the same canvas at once, each running independently. ----
  function stateFor(box) {
    if (!box._lx) box._lx = { phase: 'idle', showingType: null, slots: Object.create(null), order: [], holdTimer: null, phaseTimer: null };
    return box._lx;
  }
  function applyLX(w, box, typeKey, data, swap) {
    box.style.setProperty('--last-x', accentFor(w, typeKey));
    const label = box.querySelector('.last-x-label'), name = box.querySelector('.last-x-name');
    const message = box.querySelector('.last-x-message'), initial = box.querySelector('.last-x-initial');
    const avatar = box.querySelector('.last-x-avatar'), img = box.querySelector('.last-x-avatar img');
    if (label) label.textContent = labelFor(w, typeKey);
    if (name) name.textContent = data.username;
    if (message) message.textContent = data.message;
    if (initial) initial.textContent = (data.username[0] || '✦').toUpperCase();
    if (avatar) {
      if (data.avatar) { img.src = data.avatar; avatar.dataset.hasImage = '1' } else delete avatar.dataset.hasImage;
    }
    const copy = box.querySelector('.last-x-copy');
    if (swap && copy) { copy.classList.remove('lx-swap'); void copy.offsetWidth; copy.classList.add('lx-swap') }
  }
  function enterLX(box) {
    const s = stateFor(box);
    s.phase = 'enter';
    box.classList.remove('last-x-leaving');
    void box.offsetWidth;
    box.classList.add('last-x-active');
    s.phaseTimer = setTimeout(() => { s.phase = 'hold'; startHoldLX(box) }, 400);
  }
  function startHoldLX(box) {
    const s = stateFor(box);
    clearTimeout(s.holdTimer);
    s.holdTimer = setTimeout(() => exitLX(box), holdMsOf(state.widgets.find(x => x.id === box.dataset.id)));
  }
  function exitLX(box) {
    const s = stateFor(box);
    s.phase = 'exit';
    clearTimeout(s.holdTimer);
    box.classList.add('last-x-leaving');
    s.phaseTimer = setTimeout(() => {
      box.classList.remove('last-x-active', 'last-x-leaving');
      s.phase = 'idle'; s.showingType = null;
      advanceLX(box);
    }, 360);
  }
  function advanceLX(box) {
    const s = stateFor(box), w = state.widgets.find(x => x.id === box.dataset.id);
    if (!w || !s.order.length) return;
    if (s.phase === 'idle') {
      const typeKey = s.order.shift(), data = s.slots[typeKey]; s.slots[typeKey] = null;
      s.showingType = typeKey;
      applyLX(w, box, typeKey, data, false);
      enterLX(box);
    } else if (s.phase === 'enter' || s.phase === 'hold') {
      const i = s.order.indexOf(s.showingType);
      if (i === -1) return;
      s.order.splice(i, 1);
      const data = s.slots[s.showingType]; s.slots[s.showingType] = null;
      applyLX(w, box, s.showingType, data, true);
      if (s.phase === 'hold') startHoldLX(box);
    }
  }
  function queueLX(w, box, typeKey, data) {
    const s = stateFor(box);
    s.slots[typeKey] = data;
    if (!s.order.includes(typeKey)) s.order.push(typeKey);
    advanceLX(box);
  }
  function normalizeEvent(typeKey, event) {
    return {
      username: String(event.username || event.name || event.userId || 'Anonym').slice(0, 60),
      avatar: String(event.profileImage || event.avatar || '').slice(0, 1200),
      message: TYPES[typeKey].message(event) || (event.__test ? (event.followMessage || TYPES[typeKey].defaultMsg) : TYPES[typeKey].defaultMsg)
    };
  }
  function showLastXOn(w, typeKey, event = {}) {
    const box = document.querySelector(`[data-id="${w.id}"]`);
    if (!box) return;
    queueLX(w, box, typeKey, normalizeEvent(typeKey, event));
  }
  // Broadcasts a real (or test) event to every Last-X widget configured for that type — mirrors
  // the OBS widget's per-type latest-event routing, just fanned out across however many Last-X
  // widgets are on this layout.
  function showLastX(typeKey, event = {}) {
    state.widgets.filter(w => isLastX(w) && activeKeysFor(w).includes(typeKey)).forEach(w => {
      if (w.type !== 'templateLastX') { legacyShowLastX(w, typeKey, event); return }
      showLastXOn(w, typeKey, event);
    });
  }
  // Old templates rendered directly (no per-type phase machine) — keep their original simpler
  // show/hide behaviour untouched so already-placed legacy widgets don't change behaviour.
  function legacyShowLastX(w, typeKey, event) {
    const box = document.querySelector(`[data-id="${w.id}"]`);
    if (!box) return;
    const cfg = TYPES[typeKey];
    w.followName = event.username || event.nickname || event.user || w.followName || cfg.defaultName;
    w.followMessage = event.__test ? (w.followMessage || cfg.defaultMsg) : (cfg.message(event) || cfg.defaultMsg);
    if (event.profileImage || event.avatar) w.profileImage = event.profileImage || event.avatar;
    save();
    const name = box.querySelector('.last-x-name'), message = box.querySelector('.last-x-message'), image = box.querySelector('.last-x-avatar img');
    if (name) name.textContent = w.followName;
    if (message) message.textContent = w.followMessage;
    if (image && w.profileImage) image.src = w.profileImage;
    box.classList.remove('last-x-active', 'last-x-leaving');
    void box.offsetWidth;
    box.classList.add('last-x-active');
    clearTimeout(box._lastXTimer); clearTimeout(box._lastXLeaveTimer);
    const duration = Math.max(4, Math.min(6, w.followDuration || 5)) * 1000;
    box._lastXLeaveTimer = setTimeout(() => box.classList.add('last-x-leaving'), duration - 420);
    box._lastXTimer = setTimeout(() => box.classList.remove('last-x-active', 'last-x-leaving'), duration);
  }
  window.triggerLastXAlert = showLastX;

  // ---- wiring ----
  const lastXBind = bind;
  bind = function () {
    lastXBind();
    if (view !== 'editor' && view !== 'overlay') return;
    const w = state.widgets.find(x => x.id === selected);

    if (w && isLastX(w) && w.type === 'templateLastX') {
      const set = (id, key, opts = {}) => {
        const el = document.querySelector(id); if (!el) return;
        el.onchange = e => { w[key] = opts.num ? +e.target.value : e.target.value; save(); render() };
      };
      set('#lastXDesign', 'lastXDesign');
      set('#lastXEntrance', 'lastXEntrance');
      set('#followTheme', 'followTheme');
      set('#followColor', 'followColor');
      const inheritBox = document.querySelector('#inheritBrandKit');
      if (inheritBox) inheritBox.onchange = e => { w.inheritBrandKit = e.target.checked; save(); render() };
      set('#followLabel', 'followLabel');
      set('#followName', 'followName');
      set('#followMessage', 'followMessage');
      set('#followProfile', 'profileImage');
      set('#followDuration', 'followDuration', { num: true });

      // Each checkbox toggles its own type in/out of the active set. Unchecking the very last
      // one is rejected (re-checked right back) instead of leaving the widget with nothing to
      // ever show — same guard as setActiveKeys()'s empty-array no-op.
      TYPE_KEYS.forEach(k => {
        const box = document.querySelector(`#lastXType_${k}`);
        if (!box) return;
        box.onchange = () => {
          const checked = TYPE_KEYS.filter(key => document.querySelector(`#lastXType_${key}`)?.checked);
          if (!checked.length) { box.checked = true; toast('Minst en typ måste vara ikryssad'); return }
          setActiveKeys(w, checked);
          save(); render();
        };
      });

      const designSel = document.querySelector('#lastXDesign'); if (designSel) designSel.value = designOf(w);
      const entranceSel = document.querySelector('#lastXEntrance'); if (entranceSel) entranceSel.value = entranceOf(w);
      const themeSel = document.querySelector('#followTheme');
      if (themeSel) { const active = activeKeysFor(w); themeSel.value = w.followTheme || Object.keys(TYPES[active[0]].themes)[0] }

      const test = document.querySelector('#testLastX');
      if (test) test.onclick = () => { const active = activeKeysFor(w); showLastX(active[0], { __test: true, username: w.followName, followMessage: w.followMessage }) };
      const testAll = document.querySelector('#testLastXAll');
      if (testAll) testAll.onclick = () => { TYPE_KEYS.forEach(k => showLastX(k, { __test: true, username: TYPES[k].defaultName })) };
    }

    const catalog = document.querySelector('.widget-catalog');
    if (catalog && !catalog.querySelector('[data-last-x]')) {
      const section = document.createElement('section');
      section.dataset.lastX = '1'; section.className = 'last-x-template-section';
      section.innerHTML = '<h4>LAST-X ALERTS</h4><button data-last-x-add><i>✦</i><span><b>Last-X Alerts</b><small>Gifter · Liker · Sharer · Subscriber — 5 designer</small></span></button>';
      catalog.prepend(section);
      section.querySelector('[data-last-x-add]').onclick = () => {
        const id = 'templateLastX' + Date.now();
        state.widgets.push({
          id, type: 'templateLastX', x: 100, y: 80, width: 500,
          title: 'Last-X Alerts', lastXType: 'all', lastXDesign: 'card', lastXEntrance: 'slide-left',
          followDuration: 5
        });
        selected = id; save(); render(); toast('Last-X Alerts skapad');
      };
    }
  };

  if (typeof routeLiveBattleEvent === 'function') {
    const lastXRoute = routeLiveBattleEvent;
    routeLiveBattleEvent = function (event = {}) {
      lastXRoute(event);
      const t = String(event.type || event.event || '').toLowerCase();
      if (t.includes('gift')) showLastX('gifter', event);
      if (t.includes('like')) showLastX('liker', event);
      if (t.includes('share')) showLastX('sharer', event);
      if (t.includes('subscribe')) showLastX('subscriber', event); // "member" intentionally excluded
    };
  }
  if (new URLSearchParams(location.search).has('overlay') && typeof render === 'function') render();
})();
