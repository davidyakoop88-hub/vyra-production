(function () {
  // Extends the Top Like avatar-frame library (toplike-studio.js) and a lightweight entrance-animation
  // control to the "Gift & Alert" widget family — Top Gift, Top Streak, Follower Spotlight, Fan Level Up,
  // Gifter Level Up. These widgets already render a real profile photo but had zero illustrated chrome;
  // this reuses the exact same assets/pro-avatar-frame markup Top Like uses instead of duplicating it.
  //
  // Deliberately does NOT touch toplike-studio.js's RANKING_TYPES-gated props()/bind() group — that one
  // is fused with skin/crown/medal/tab logic that must stay Top-Like-only. This file's animation group
  // is a separate, minimal one (entrance + duration only), reusing the same ws-anim-* CSS classes.

  const GIFT_ALERT_TYPES = ['templateTopGift', 'templateTopStreak', 'templateFollowerAlert', 'templateFanLevel', 'templateGifterLevel', 'templateLastGifter', 'templateLastLiker', 'templateLastSharer', 'templateLastSubscriber'];

  // Each widget's profile-photo container class. gifterLevelHtml has a second, smaller photo
  // (.gifter-bottom-profile, only shown in the "number" layout) that is intentionally left unframed
  // to avoid double-framing a single widget.
  const ANCHORS = {
    templateFollowerAlert: 'follow-avatar',
    templateFanLevel: 'fan-profile',
    templateGifterLevel: 'gifter-orbit',
    templateLastGifter: 'last-x-avatar',
    templateLastLiker: 'last-x-avatar',
    templateLastSharer: 'last-x-avatar',
    templateLastSubscriber: 'last-x-avatar',
  };

  // Top Gift och Top Streak flippar mellan profil och gåva. Ramen ankrades förr INUTI profilsidan
  // (.vyra-profile-face) — sidan har backface-visibility:hidden och roterar bort, så ramen försvann
  // varje gång gåvan visades. Nu läggs ramen runt HELA flippen: omslaget bär flippens klass och
  // inline-stil och tar därmed exakt flippens plats och mått i varje tema (fast px, grid-cell,
  // absolut i procent — samtliga 17 storleksregler i studio.css gäller omslaget oförändrade), medan
  // den riktiga flippen fyller omslaget med inset:0 och fortsätter rotera inuti. Ramkonsten ligger
  // sist i omslaget, utanför rotationen, och står stilla medan profil och gåva byter plats.
  const FLIPPAR = { templateTopGift: 'vyra-flip', templateTopStreak: 'streak-flip' };

  function ramaInFlippen(html, klass, g, file) {
    const start = html.search(new RegExp(`<div class="${klass}[ "]`));
    if (start < 0) return html;
    const tagSlut = html.indexOf('>', start);
    const tagg = html.slice(start, tagSlut + 1);
    const klasser = /class="([^"]*)"/.exec(tagg)[1];
    const inline = (/style="([^"]*)"/.exec(tagg) || [, ''])[1];
    // Flippens slut är den </div> som balanserar öppningstaggen — sidorna är egna div:ar inuti.
    const re = /<div\b|<\/div>/g;
    re.lastIndex = tagSlut + 1;
    let djup = 0, slut = -1, m;
    while ((m = re.exec(html))) {
      if (m[0] !== '</div>') { djup++; continue }
      if (djup === 0) { slut = m.index; break }
      djup--;
    }
    if (slut < 0) return html;
    const inre = html.slice(tagSlut + 1, slut);
    // Inline-!important på den inre flippen slår temats egna !important (position:relative,
    // width:var(--gift-size)) — det är det enda som vinner över en stilmall med !important.
    return html.slice(0, start)
      + `<span class="${klasser} gaf-flip-frame" style="${inline};--frame-fit:${g.fit};--frame-dx:${g.dx};--frame-dy:${g.dy}">`
      + `<div class="${klasser}" style="position:absolute!important;inset:0!important;width:auto!important;height:auto!important;margin:0!important;display:block!important">${inre}</div>`
      + `<img class="pro-frame-art" src="assets/images/profile-frames/${file}" alt="">`
      + '</span>'
      + html.slice(slut + '</div>'.length);
  }

  // ---- Render: composite the chosen avatar frame onto the profile photo + apply entrance animation ----
  const gafWh = wh;
  wh = function (w) {
    let html = gafWh(w);
    if (!GIFT_ALERT_TYPES.includes(w.type)) return html;

    const anim = w.entranceAnimation && w.entranceAnimation !== 'none' ? ` ws-anim-${w.entranceAnimation}` : '';
    if (anim) {
      html = html.replace('class="widget ', `class="widget${anim} `);
      html = html.replace('style="', `style="--ws-anim-duration:${w.entranceDuration || 600}ms;`);
    }

    if (w.profileFrame && w.profileFrame !== 'none') {
      // window.VYRA_FRAME_FILES is set by toplike-studio.js — read lazily here (not at this file's own
      // top-level scope) since dynamically injected scripts don't have a guaranteed load order.
      const files = window.VYRA_FRAME_FILES || {};
      const file = files[w.profileFrame] || `${w.profileFrame}.png`;
      // Geometry of the frame's transparent opening (measured per asset in toplike-studio.js):
      // --frame-fit is its diameter as a fraction of the frame's width, --frame-dx/dy its centre
      // offset. CSS scales the ART up by 1/fit and shifts it so the opening lands exactly on the
      // photo — the photo itself keeps 100 % of its box, with or without a frame (kravet 2026-09-08).
      // Read through window at render time — load order between injected files isn't guaranteed.
      const g = window.vyraFrameGeom ? window.vyraFrameGeom(w.profileFrame) : { fit: 0.62, dx: 0, dy: 0 };

      if (FLIPPAR[w.type]) return ramaInFlippen(html, FLIPPAR[w.type], g, file);

      const anchor = ANCHORS[w.type];
      // [^"]* after the anchor class (not just [^>]*) because other wrappers in the chain (e.g.
      // profileFrameWh in media.js) append extra classes to the same div, like
      // class="vyra-profile-face profile-frame frame-none" — matching only an exact single-class
      // attribute would silently fail to find the div at all.
      // Non-greedy so it tolerates sibling markup inside the anchor div (e.g. gifter-orbit's three
      // decoy <i> rings before the actual photo <img>) without matching too far.
      const re = new RegExp(`(<div class="${anchor}[^"]*"[^>]*>[\\s\\S]*?)(<img[^>]*src="[^"]*"[^>]*>)`);
      html = html.replace(re, (match, prefix, img) =>
        `${prefix}<span class="pro-avatar-frame" style="--frame-fit:${g.fit};--frame-dx:${g.dx};--frame-dy:${g.dy}">${img}<img class="pro-frame-art" src="assets/images/profile-frames/${file}" alt=""></span>`
      );
    }
    return html;
  };

  // ---- Props/bind: mount the avatar-frame picker + a minimal entrance-animation group ----
  const gafBind = bind;
  bind = function () {
    gafBind();
    if (view !== 'editor') return;
    const w = liveWidget(selected);
    if (!w || !GIFT_ALERT_TYPES.includes(w.type)) return;
    const panel = document.querySelector('.properties');
    if (!panel) return;

    const del = panel.querySelector('#del') || panel.querySelector('.delete');

    // Avatar frame picker — reuses toplike-studio.js's shared builder, same swatch/gender-tab markup
    // and events as Top Like's own picker.
    if (typeof window.vyraBuildFramePicker === 'function' && !panel.querySelector('.gaf-frame-group')) {
      const frameGroup = document.createElement('div');
      frameGroup.className = 'property-group gaf-frame-group';
      frameGroup.innerHTML = '<h4>AVATAR-RAM</h4><div class="pro-frame-picker"></div>';
      if (del) del.before(frameGroup); else panel.append(frameGroup);

      const picker = frameGroup.querySelector('.pro-frame-picker');
      picker.innerHTML = window.vyraBuildFramePicker(w);
      picker.querySelectorAll('[data-ws-gender]').forEach(btn => btn.onclick = () => { w.frameGenderTab = btn.dataset.wsGender; render(); });
      picker.querySelectorAll('[data-ws-frame]').forEach(btn => btn.onclick = () => {
        w.profileFrame = btn.dataset.wsFrame; save(); render();
        toast(btn.dataset.wsFrame === 'none' ? 'Profilram borttagen' : `${btn.querySelector('b').textContent} vald`);
      });
    }

    // Entrance animation group. No dedicated test button here — every one of these widget types
    // already ships its own "Testa..." button (Top Gift/Streak flip a card, Fan/Gifter Level Up
    // play their level-up, Follower/Last-X alerts pulse their spotlight); this hooks into that
    // same button instead of bolting on a second, redundant one.
    if (!panel.querySelector('.gaf-anim-group')) {
      const animGroup = document.createElement('div');
      animGroup.className = 'property-group gaf-anim-group';
      animGroup.innerHTML = `<h4>ANIMATION</h4><label>Inträdeseffekt<select id="gafEntrance"><option value="none">Ingen</option><option value="fade">Tona in</option><option value="slideUp">Glid upp</option><option value="pop">Poppa in</option><option value="signal">Signal Lock · glid in + scanline</option><option value="gilded">Gilded Invite · tona in + skala</option></select></label><label class="range-label">Varaktighet <b>${w.entranceDuration || 600} ms</b><input id="gafEntranceDuration" type="range" min="150" max="1500" step="50" value="${w.entranceDuration || 600}"></label>`;
      if (del) del.before(animGroup); else panel.append(animGroup);

      const entrance = animGroup.querySelector('#gafEntrance');
      entrance.value = w.entranceAnimation || 'none';
      entrance.onchange = e => { w.entranceAnimation = e.target.value; save(); render(); };
      animGroup.querySelector('#gafEntranceDuration').onchange = e => { w.entranceDuration = +e.target.value; save(); render(); };
    }

    const testBtn = [...panel.querySelectorAll('button')].find(b => b !== del && b.textContent.includes('Testa'));
    if (testBtn) {
      const original = testBtn.onclick;
      testBtn.onclick = e => {
        if (typeof original === 'function') original(e);
        if (!w.entranceAnimation || w.entranceAnimation === 'none') return;
        const el = document.querySelector(`[data-id="${w.id}"]`);
        if (!el) return;
        const cls = 'ws-anim-' + w.entranceAnimation;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
      };
    }
  };

  // Overlay pages auto-render on a setTimeout(0) right after page load (see media.js), which can race
  // ahead of this dynamically-loaded script — same guard used by toplike-studio.js/widget-background.js.
  if (new URLSearchParams(location.search).has('overlay') && typeof render === 'function') render();
})();
