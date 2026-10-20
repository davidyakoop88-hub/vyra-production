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
  const giftLine = e => `${String(e.giftName || e.gift || 'GÅVA').toUpperCase().slice(0, 40)} ×${Math.max(1, Math.round(Number(e.count ?? e.repeatCount) || 1))}`;
  const TESTAVATAR = 'assets/images/test-profile.svg'; // samma reservavatar som resten av studion
  const TYPES = {
    gifter: {
      label: 'SENASTE GÅVOGIVARE', catalogLabel: 'Senaste gåvogivare', typNamn: 'Gåva', events: ['gift'], multiAccent: '#ffd35d',
      themes: { neon: '#ff58d6', gold: '#ffd35d', emerald: '#3ddc84' },
      defaultName: 'Alex', defaultMsg: 'SKICKADE GALAXY ×5',
      message: e => e.__test ? undefined : `SKICKADE ${giftLine(e)}`
    },
    liker: {
      label: 'SENASTE LIKER', catalogLabel: 'Senaste liker', typNamn: 'Like', events: ['like', 'likes'], multiAccent: '#ff58d6',
      themes: { neon: '#ff58d6', blue: '#4fc3ff', lime: '#a3e635' },
      defaultName: 'Mia', defaultMsg: 'SKICKADE 1 000 LIKES',
      message: e => e.__test ? undefined : `SKICKADE ${Math.max(1, Math.round(Number(e.count ?? e.likes) || 1)).toLocaleString('sv-SE')} LIKES`
    },
    sharer: {
      label: 'SENASTE DELARE', catalogLabel: 'Senaste delare', typNamn: 'Delning', events: ['share'], multiAccent: '#2dd4bf',
      themes: { neon: '#ff58d6', teal: '#2dd4bf', orange: '#ff9d16' },
      defaultName: 'Leo', defaultMsg: 'DELADE SÄNDNINGEN',
      message: () => 'DELADE SÄNDNINGEN'
    },
    subscriber: {
      label: 'SENASTE PRENUMERANT', catalogLabel: 'Senaste prenumerant', typNamn: 'Prenumeration',
      // Deliberately real "subscribe" events only, NOT "member" room-joins — the old version routed
      // member here too, which fired on every viewer entering the room. Fixed to match the OBS widget.
      events: ['subscribe'], multiAccent: '#4fc3ff',
      themes: { neon: '#ff58d6', ocean: '#4fc3ff', gold: '#ffd35d' },
      defaultName: 'Sara', defaultMsg: 'GICK MED I KLUBBEN',
      message: () => 'GICK MED I KLUBBEN'
    },
    follower: {
      label: 'SENASTE FÖLJARE', catalogLabel: 'Senaste följare', typNamn: 'Följare', events: ['follow'], multiAccent: '#a3e635',
      themes: { neon: '#ff58d6', lime: '#a3e635', blue: '#4fc3ff' },
      defaultName: 'Zoe', defaultMsg: 'BÖRJADE FÖLJA',
      message: () => 'BÖRJADE FÖLJA'
    }
  };
  const TYPE_KEYS = Object.keys(TYPES);
  const DESIGNS = {
    card: 'Card', stack: 'Stack', skew: 'Skew', badge: 'Badge', royal: 'Royal Coronation',
    crownBanner: 'Crown Banner', royalAmethyst: 'Royal Amethyst', iceKing: 'Ice King',
    neonCyber: 'Neon Cyber', dragonFlame: 'Dragon Flame', angelGold: 'Angel Gold'
  };
  // Vad designen inte visar (last-x-alerts.css: royal döljer namn och meddelande, banderollerna
  // meddelandet). Panelen säger det i stället för att erbjuda fält som inte syns.
  const BANNERDESIGNER = ['crownBanner', 'royalAmethyst', 'iceKing', 'neonCyber', 'dragonFlame', 'angelGold'];
  const DOLT = Object.assign({ royal: 'Den här designen visar inte namnet eller meddelandet – bara rubriken och profilbilden.' },
    Object.fromEntries(BANNERDESIGNER.map(d => [d, 'Den här designen visar inte meddelandet – bara rubriken, namnet och profilbilden.'])));
  const BANNER_ASSETS = {
    crownBanner: 'crown-banner.png', royalAmethyst: 'royal-amethyst.png', iceKing: 'ice-king.png',
    neonCyber: 'neon-cyber.png', dragonFlame: 'dragon-flame.png', angelGold: 'angel-gold.png'
  };
  const ENTRANCES = ['slide-left', 'slide-right', 'pop', 'roll', 'fade'];
  const ENTRANCE_LABEL = {
    'slide-left': 'Glid in från vänster', 'slide-right': 'Glid in från höger',
    pop: 'Zooma in', roll: 'Rulla in', fade: 'Tona in'
  };
  // Outron är intron baklänges — .last-x-leaving går tillbaka till entréns egen vilotransform.
  // Därför finns ingen outroINSTÄLLNING: varje val här bär sin egen utgång i CSS:en.
  const ENTRANCE_OUTRO = {
    'slide-left': 'glider ut åt vänster', 'slide-right': 'glider ut åt höger',
    pop: 'krymper ihop', roll: 'rullar ut', fade: 'tonar bort'
  };
  // Visningstiden. Den gamla skalan var ett reglage klampat till 4–6 s, med klampen upprepad på
  // fyra ställen (här, panelen, legacy-vägen och OBS-widgetens HOLD_MS) — fyra ställen som kunde
  // säga olika saker. Nu finns tiderna på ETT ställe och alla fyra läser dem härifrån.
  const DURATIONS = [5, 10, 15];
  const EMBLEM = { card: '✦', stack: '✦', skew: '✦', badge: '◆', royal: '✦',
    crownBanner: '', royalAmethyst: '', iceKing: '', neonCyber: '', dragonFlame: '', angelGold: '' };

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
  // RUBRIK OCH MEDDELANDE PER TYP (högerpanelen, PR 5). w.lastXLabel och w.lastXMessage är objekt
  // nycklade på typ ({gifter:'…', liker:'…'}). Rubriken faller tillbaka på exakt det som gällde
  // förut — followLabel när bara en typ är vald, typens egen rubrik annars — så en sparad widget
  // ser likadan ut tills någon skriver en egen rubrik för typen.
  const perTyp = (falt, typeKey) => {
    const o = falt && typeof falt === 'object' ? falt : null;
    const v = o && typeof o[typeKey] === 'string' ? o[typeKey].trim() : '';
    return v;
  };
  function labelFor(w, typeKey) {
    const egen = perTyp(w.lastXLabel, typeKey);
    if (egen) return egen.slice(0, 40);
    const active = activeKeysFor(w), multi = active.length > 1;
    return (multi ? TYPES[typeKey].label : (w.followLabel || TYPES[typeKey].label)).slice(0, 40);
  }
  // Ett eget meddelande per typ ersätter typens standardtext i sändningen. {namn}, {gåva} och
  // {antal} byts mot händelsens värden, så "TACK FÖR {antal} {gåva}!" fungerar för gåvor.
  function egetMeddelande(w, typeKey, e) {
    const mall = perTyp(w.lastXMessage, typeKey);
    if (!mall) return '';
    const antal = Math.max(1, Math.round(Number(e.count ?? e.repeatCount ?? e.likes) || 1));
    return mall
      .replace(/\{namn\}/gi, String(e.username || e.name || ''))
      .replace(/\{gåva\}|\{gava\}/gi, String(e.giftName || e.gift || ''))
      .replace(/\{antal\}/gi, antal.toLocaleString('sv-SE'))
      .slice(0, 80);
  }
  function designOf(w) { return DESIGNS[w.lastXDesign] ? w.lastXDesign : 'card'; }
  function entranceOf(w) { return ENTRANCES.includes(w.lastXEntrance) ? w.lastXEntrance : 'slide-left'; }
  // Okända tider (inklusive de gamla 4:orna och 6:orna som redan ligger sparade i folks layouter)
  // faller till 5 s i stället för att klampas — 6 hade annars blivit 6, ett värde panelen inte
  // längre kan visa, och reglaget hade sett tomt ut.
  function durationOf(w) { return DURATIONS.includes(w.followDuration) ? w.followDuration : 5; }
  function holdMsOf(w) { return durationOf(w) * 1000; }

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
    const remembered = w.lastXLatest && w.lastXLatest[typeKey];
    const name = remembered?.username || w.followName || cfg.defaultName;
    // Vilobilden (editorn): det senaste riktiga meddelandet, annars exempelmeddelandet (Testhändelse),
    // annars typens egna meddelande med exempelnamnet, annars standardtexten.
    const message = remembered?.message || w.followMessage
      || egetMeddelande(w, typeKey, { username: name, giftName: 'Rose', count: 1 }) || cfg.defaultMsg;
    const label = labelFor(w, typeKey);
    // EN TESTAVATAR FÖR ALLA (David 2026-10-11): utan foto visades initialen; nu samma reservbild
    // som alla andra familjer.
    const profileImage = remembered?.avatar || w.profileImage || TESTAVATAR;
    const hasImage = profileImage ? ` data-has-image="1"` : '';
    const sticky = w.lastXPersistent !== false && remembered ? ' last-x-sticky' : '';
    const banner = BANNER_ASSETS[design] ? `<img class="last-x-frame-art" src="assets/images/last-x/${BANNER_ASSETS[design]}" alt="">` : '';
    return `<div class="widget last-x-widget design-${design} entrance-${entrance}${sticky}${selected === w.id ? ' selected' : ''}" data-id="${w.id}"
        style="left:${w.x}px;top:${w.y}px;width:${w.width || 500}px;--last-x:${accent}${brandKitStyleFor(w)};zoom:${zoomFor(w)}">
      <div class="last-x-tilt">
        ${banner}
        <div class="last-x-glass"><div class="last-x-sheen"></div><div class="last-x-gleam"></div></div>
        <div class="last-x-avatar"${hasImage}><span class="last-x-initial">${VyraSafe.text((name[0] || '✦').toUpperCase())}</span><img src="${VyraSafe.url(profileImage)}" alt=""></div>
        <div class="last-x-copy">
          <div class="last-x-label">${VyraSafe.text(label)}</div>
          <div class="last-x-name">${VyraSafe.text(name)}</div>
          <div class="last-x-message">${VyraSafe.text(message)}</div>
        </div>
        <div class="last-x-emblem">${EMBLEM[design]}</div>
      </div>
      ${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}
    </div>`;
  };

  // ---- sidebar property panel ----
  const lastXProps = props;
  props = function () {
    const w = liveWidget(selected);
    if (!w || !isLastX(w)) return lastXProps();
    // Old widgets (templateLastGifter etc.) get read-only info instead of the full new panel until
    // the user actually re-adds a fresh "Last-X Alerts" widget from the catalog — editing an old
    // template's fields in place would silently half-migrate it.
    if (w.type !== 'templateLastX') {
      const legacy = LEGACY_TYPE[w.type], cfg = TYPES[legacy];
      return `<h3>${cfg.catalogLabel.toUpperCase()} (ÄLDRE VERSION)</h3>
        <div class="template-badge">PREMIUM</div>
        <p style="padding:0 2px;font-size:12px;color:#b9a6dd;line-height:1.5">Den här widgeten använder den gamla designen. Ta bort den och lägg till <b>Last-X Alerts</b> från katalogen för att få de fem nya designerna (Card, Stack, Skew, Badge, Royal Coronation).</p>
        <div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || 500}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div>
        <button class="delete" id="del">Ta bort</button>`;
    }
    const active = activeKeysFor(w), typeKey = active[0], multi = active.length > 1;
    const themeKeys = Object.keys(TYPES[typeKey].themes);
    return `<h3>LAST-X ALERTS</h3><div class="template-badge">PREMIUM</div>
      <div class="property-group"><h4>VILKA SKA VISAS</h4>
        <p class="last-x-type-hint">Kryssa av dem du inte vill ha med — widgeten cyklar bara mellan de kvarvarande, i en delad scen om fler än en är kvar.</p>
        <div class="last-x-type-checks">
          ${TYPE_KEYS.map(k => `<label class="last-x-type-check"><input type="checkbox" id="lastXType_${k}" data-key="${k}"${active.includes(k) ? ' checked' : ''}><span>${TYPES[k].catalogLabel}</span></label>`).join('')}
        </div>
      </div>
      <div class="property-group"><h4>DESIGN</h4>
        <label>Design<select id="lastXDesign">${Object.entries(DESIGNS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      </div>
      <div class="property-group"><h4>ANIMATION</h4>
        <label>Inträdeseffekt<select id="lastXEntrance">
          ${ENTRANCES.map(e => `<option value="${e}">${ENTRANCE_LABEL[e]}</option>`).join('')}
        </select></label>
        <p class="last-x-type-hint">Outron speglar intron: när tiden tar slut ${ENTRANCE_OUTRO[entranceOf(w)]} rutan igen. Därför finns inget eget outro-val.</p>
      </div>
      <div class="property-group" id="lastXThemeGroup" style="display:${multi || w.inheritBrandKit ? 'none' : ''}">
        <h4>TEMA</h4>
        <label>Färgtema<select id="followTheme">${themeKeys.map(t => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>
      </div>
      <div class="property-group"><h4>ACCENTFÄRG</h4>
        <label class="last-x-type-check"><input type="checkbox" id="inheritBrandKit"${w.inheritBrandKit ? ' checked' : ''}><span>Ärv globalt färgschema (🎨 Färgschema-knappen ovan)</span></label>
        <label>Accentfärg (åsidosätter tema)<input id="followColor" type="color" value="${w.followColor || accentFor(Object.assign({}, w, { inheritBrandKit: false }), typeKey)}" ${w.inheritBrandKit ? 'disabled' : ''}></label>
      </div>
      <div class="property-group"><h4>INNEHÅLL (förhandsvisning)</h4>
        <label>Rubrik<input id="followLabel" value="${w.followLabel || TYPES[typeKey].label}" ${multi ? 'disabled' : ''}></label>
        <label>Testnamn<input id="followName" value="${VyraSafe.text(w.followName, TYPES[typeKey].defaultName)}"></label>
        <label>Testhändelse<input id="followMessage" value="${VyraSafe.text(w.followMessage, TYPES[typeKey].defaultMsg)}"></label>
        <label>Profilbild (URL)<input id="followProfile" value="${VyraSafe.url(w.profileImage)}"></label>
      </div>
      <div class="property-group last-x-per-typ"><h4>RUBRIK OCH MEDDELANDE PER TYP</h4>
        ${active.map(k => `<label>Rubrik (${TYPES[k].typNamn.toLowerCase()})<input id="lastXLabel_${k}" data-key="${k}" maxlength="40" value="${VyraSafe.text(labelFor(w, k))}"></label>
        <label>Meddelande (${TYPES[k].typNamn.toLowerCase()})<input id="lastXMessage_${k}" data-key="${k}" maxlength="80" placeholder="${VyraSafe.text(TYPES[k].defaultMsg)}" value="${VyraSafe.text(perTyp(w.lastXMessage, k))}"></label>`).join('')}
        <p class="last-x-type-hint" id="lastXMeddelandeTips">Tomt meddelande ger standardtexten. {namn}, {gåva} och {antal} byts mot händelsens värden.</p>
        ${DOLT[designOf(w)] ? `<p class="last-x-type-hint" id="lastXDoltInfo">${DOLT[designOf(w)]}</p>` : ''}
      </div>
      <div class="property-group follow-trigger-editor"><h4>VISNINGSTID</h4>
        <label>Rutan ligger kvar<select id="followDuration">
          ${DURATIONS.map(d => `<option value="${d}">${d} sekunder</option>`).join('')}
        </select></label>
        <p class="last-x-type-hint">Räknat från att intron är klar. Kommer en ny händelse av samma typ under tiden byts namnet på plats och tiden börjar om.</p>
        <label class="last-x-type-check"><input type="checkbox" id="lastXPersistent"${w.lastXPersistent !== false ? ' checked' : ''}><span>Behåll senaste personen synlig tills nästa händelse</span></label>
        <button id="testLastX" type="button">▶ Testa alert</button>
        ${multi ? '<button id="testLastXAll" type="button">▶ Testa alla valda i rad</button>' : ''}
      </div>
      <div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || 500}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div>
      <button class="delete" id="del">Ta bort</button>`;
  };

  // ---- per-widget phase machine: enter -> hold -> exit over per-type latest-event slots, exactly
  // like the OBS widget, but state lives on the widget's own DOM node (box._lx) since several
  // Last-X widgets can be on the same canvas at once, each running independently. ----
  //
  // ▶ TESTA WIDGET SPELAR PÅ EN KLON (vyra-lastx-panel.js). Samma fasmaskin, men med {prov:true}:
  //   * widgeten är klonen k (den finns aldrig i state.widgets), inte liveWidget(box.dataset.id),
  //   * timrarna är testmotorns (ctl.setTimeout/clearTimeout), så ■ Stoppa rensar dem och varje
  //     återanrop körs under motorns vakter,
  //   * applyLX skriver INTE w.lastXLatest och kör INTE save() — testet ändrar ingenting i layouten.
  // Livevägen (showLastX → showLastXOn) går exakt som förut: utan opts är allt som det var.
  function stateFor(box, opts) {
    if (!box._lx) {
      const prov = !!(opts && opts.prov === true);
      box._lx = { phase: 'idle', showingType: null, slots: Object.create(null), order: [], holdTimer: null, phaseTimer: null,
        prov, w: prov ? opts.w : null,
        // Uppslaget sker vid anropet, inte nu: en stubbad window.setTimeout (proven) ska gälla.
        satt: prov && opts.setTimeout ? opts.setTimeout : (fn, ms) => setTimeout(fn, ms),
        rensa: prov && opts.clearTimeout ? opts.clearTimeout : id => clearTimeout(id) };
    }
    return box._lx;
  }
  const widgetFor = box => (box._lx && box._lx.prov ? box._lx.w : liveWidget(box.dataset.id));
  function applyLX(w, box, typeKey, data, swap) {
    const s = stateFor(box);
    box.style.setProperty('--last-x', accentFor(w, typeKey));
    const label = box.querySelector('.last-x-label'), name = box.querySelector('.last-x-name');
    const message = box.querySelector('.last-x-message'), initial = box.querySelector('.last-x-initial');
    const avatar = box.querySelector('.last-x-avatar'), img = box.querySelector('.last-x-avatar img');
    if (label) label.textContent = labelFor(w, typeKey);
    if (name) name.textContent = data.username;
    if (message) message.textContent = data.message;
    if (initial) initial.textContent = (data.username[0] || '✦').toUpperCase();
    if (avatar) {
      // EN TESTAVATAR FOR ALLA (David 2026-10-11): utan foto visas test-profile.svg, aldrig initialen.
      img.src = VyraSafe.src(data.avatar || TESTAVATAR); avatar.dataset.hasImage = '1';
    }
    box.classList.toggle('last-x-sticky', w.lastXPersistent !== false);
    if (!s.prov) {
      w.lastXLatest = Object.assign({}, w.lastXLatest || {}, { [typeKey]: data });
      clearTimeout(w._lastXPersistTimer);
      w._lastXPersistTimer = setTimeout(() => { delete w._lastXPersistTimer; save() }, 700);
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
    s.phaseTimer = s.satt(() => { s.phase = 'hold'; startHoldLX(box) }, 400);
  }
  function startHoldLX(box) {
    const s = stateFor(box), w = widgetFor(box);
    s.rensa(s.holdTimer);
    s.holdTimer = s.satt(() => exitLX(box), holdMsOf(w || {}));
  }
  function exitLX(box) {
    const s = stateFor(box);
    s.phase = 'exit';
    s.rensa(s.holdTimer);
    box.classList.add('last-x-leaving');
    s.phaseTimer = s.satt(() => {
      box.classList.remove('last-x-active', 'last-x-leaving');
      s.phase = 'idle'; s.showingType = null;
      advanceLX(box);
    }, 360);
  }
  function advanceLX(box) {
    const s = stateFor(box), w = widgetFor(box);
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
  // w: widgeten händelsen visas i (för typens egna meddelande). prov: testet, där exempelmeddelandet
  // (Testhändelse) går före typens standardtext.
  function normalizeEvent(typeKey, event, w, prov) {
    const egen = w ? egetMeddelande(w, typeKey, event) : '';
    return {
      username: String(event.username || event.name || event.userId || 'Anonym').slice(0, 60),
      avatar: String(event.profileImage || event.avatar || '').slice(0, 1200),
      message: egen || (prov && w && w.followMessage) || TYPES[typeKey].message(event)
        || (event.__test ? (event.followMessage || TYPES[typeKey].defaultMsg) : TYPES[typeKey].defaultMsg)
    };
  }
  function showLastXOn(w, typeKey, event = {}) {
    const box = document.querySelector(`[data-id="${w.id}"]`);
    if (!box) return;
    queueLX(w, box, typeKey, normalizeEvent(typeKey, event, w));
  }
  // PER-NOD-VÄGEN FÖR ▶ TESTA WIDGET. Spelar en händelse på klonens nod med klonens inställningar.
  // Filtrerar aldrig state.widgets, skriver inte på widgeten och sparar ingenting. Returnerar
  // faserna i ms: entrén (400, enterLX), visningstiden och utgången (0 när widgeten behåller den
  // senaste personen synlig — då ligger kortet kvar, precis som i sändningen).
  function lastXSpelaPa(nod, k, typeKey, event, opts) {
    if (!opts || opts.prov !== true) throw new Error('lastXSpelaPa är testets väg och kräver {prov:true}');
    if (!nod || !k || !TYPES[typeKey]) return null;
    if (nod._lx && !nod._lx.prov) throw new Error('lastXSpelaPa: noden tillhör sändningen');
    stateFor(nod, { prov: true, w: k, setTimeout: opts.setTimeout, clearTimeout: opts.clearTimeout });
    const e = Object.assign({}, event || {});
    if (!e.username) e.username = k.followName || TYPES[typeKey].defaultName;
    // Klonen ritades med den senaste personen synlig (last-x-sticky). Utan den syns entrén, och
    // stilen räknas om innan fasmaskinen tänder kortet så att övergången faktiskt spelar.
    nod.classList.remove('last-x-sticky', 'last-x-active', 'last-x-leaving');
    void nod.offsetWidth;
    queueLX(k, nod, typeKey, normalizeEvent(typeKey, e, k, true));
    return { entre: 400, visning: holdMsOf(k), utgang: k.lastXPersistent !== false ? 0 : 360 };
  }
  function lastXStoppaPa(nod) {
    const s = nod && nod._lx;
    if (!s || !s.prov) return;
    s.rensa(s.holdTimer); s.rensa(s.phaseTimer);
    s.order.length = 0; s.slots = Object.create(null); s.phase = 'idle'; s.showingType = null;
    nod.classList.remove('last-x-active', 'last-x-leaving');
  }
  window.lastXSpelaPa = lastXSpelaPa;
  window.lastXStoppaPa = lastXStoppaPa;
  // Panelens per-typ-fält (vyra-lastx-panel.js) frågar här vilka typer widgeten visar.
  window.VyraLastX = Object.freeze({
    typer: TYPE_KEYS.slice(),
    aktiva: w => activeKeysFor(w).slice(),
    typNamn: k => (TYPES[k] ? TYPES[k].typNamn : ''),
  });
  // Broadcasts a real (or test) event to every Last-X widget configured for that type — mirrors
  // the OBS widget's per-type latest-event routing, just fanned out across however many Last-X
  // widgets are on this layout.
  function showLastX(typeKey, event = {}) {
    // En dold widget tands aldrig i sandningen (overlay-dolda.js), samma regel som Gift Fireworks.
    state.widgets.filter(w => isLastX(w) && !w.hidden && activeKeysFor(w).includes(typeKey)).forEach(w => {
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
    if (image) image.src = VyraSafe.src(w.profileImage || TESTAVATAR);
    box.classList.remove('last-x-active', 'last-x-leaving');
    void box.offsetWidth;
    box.classList.add('last-x-active');
    clearTimeout(box._lastXTimer); clearTimeout(box._lastXLeaveTimer);
    const duration = holdMsOf(w);
    box._lastXLeaveTimer = setTimeout(() => box.classList.add('last-x-leaving'), duration - 420);
    box._lastXTimer = setTimeout(() => box.classList.remove('last-x-active', 'last-x-leaving'), duration);
  }
  window.triggerLastXAlert = showLastX;

  // ---- wiring ----
  const lastXBind = bind;
  bind = function () {
    lastXBind();
    if (view !== 'editor' && view !== 'overlay') return;
    const w = liveWidget(selected);

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
      // Rubrik och meddelande per typ. Ett fält som töms — eller en rubrik som står kvar på typens
      // egen — tas bort ur objektet, så att standardtexten fortsätter att gälla.
      const omrita = () => { save(); if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel(); else render() };
      TYPE_KEYS.forEach(k => {
        const rubrik = document.querySelector(`#lastXLabel_${k}`);
        if (rubrik) rubrik.onchange = e => {
          const v = String(e.target.value || '').trim().slice(0, 40);
          const o = Object.assign({}, w.lastXLabel || {});
          delete o[k];
          if (v && v !== labelFor(Object.assign({}, w, { lastXLabel: o }), k)) o[k] = v;
          if (Object.keys(o).length) w.lastXLabel = o; else delete w.lastXLabel;
          omrita();
        };
        const medd = document.querySelector(`#lastXMessage_${k}`);
        if (medd) medd.onchange = e => {
          const v = String(e.target.value || '').trim().slice(0, 80);
          const o = Object.assign({}, w.lastXMessage || {});
          if (v) o[k] = v; else delete o[k];
          if (Object.keys(o).length) w.lastXMessage = o; else delete w.lastXMessage;
          omrita();
        };
      });
      const persistentBox = document.querySelector('#lastXPersistent');
      if (persistentBox) persistentBox.onchange = e => { w.lastXPersistent = e.target.checked; save(); render() };

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
      const durationSel = document.querySelector('#followDuration'); if (durationSel) durationSel.value = durationOf(w);
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
      const lastXCards = [
        ['card', 'Card'], ['stack', 'Stack'], ['skew', 'Skew'], ['badge', 'Badge'], ['royal', 'Royal Coronation'],
        ['crownBanner', 'Crown Banner'], ['royalAmethyst', 'Royal Amethyst'], ['iceKing', 'Ice King'],
        ['neonCyber', 'Neon Cyber'], ['dragonFlame', 'Dragon Flame'], ['angelGold', 'Angel Gold']
      ];
      section.innerHTML = '<h4>LAST-X ALERTS · VARJE DESIGN SEPARAT</h4>' + lastXCards.map(([d, label]) =>
        `<button data-last-x-add="${d}"><i>✦</i><span><b>Last-X · ${label}</b><small>Gåvogivare · Liker · Delare · Prenumerant · Följare</small></span></button>`
      ).join('');
      catalog.prepend(section);
      // Nyckeln pa knappen ar det som gor designen matbar, forhandsvisningsbar och aterskapbar.
      // Widgeten byggs ur fabriken i stallet for handknackt har; ett test jamfor falt for falt mot
      // den gamla formen sa befintliga anvandare far exakt samma sak.
      section.querySelectorAll('[data-last-x-add]').forEach(b => {
        const design = b.dataset.lastXAdd, label = lastXCards.find(c => c[0] === design)[1];
        const catalogKey = 'catalog:lastx:' + design;
        b.dataset.catalogKey = catalogKey;
        b.onclick = () => {
          const created = VyraWidgets.create(catalogKey);
          state.widgets.push(created);
          selected = created.id; save(); render(); toast('Last-X · ' + label + ' skapad');
        };
      });
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
      if (t === 'follow' || t === 'follower' || t === 'new_follower') showLastX('follower', event);
    };
  }
  // NY SANDNING => de vantande korten kastas. `slots` bar den forra sandningens senaste gavor och
  // foljare per typ, och `order` deras tur att visas — visades de efter bytet skulle den nya
  // sandningen inledas med namn fran den gamla. Ett kort som redan star pa skarmen far spela klart:
  // dess fasmaskin ager sin egen utgang, och att rycka bort det mitt i vore en synlig glitch.
  addEventListener('vyra-live-session', event => {
    if (!event || !event.detail || event.detail.event !== 'live:start') return;
    document.querySelectorAll('[data-id]').forEach(box => {
      const s = box._lx;
      if (!s) return;
      s.order.length = 0;
      s.slots = Object.create(null);
    });
  });

  if (new URLSearchParams(location.search).has('overlay') && typeof render === 'function') render();
})();
