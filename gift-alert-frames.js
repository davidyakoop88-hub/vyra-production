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
    templateTopGift: 'vyra-profile-face',
    templateTopStreak: 'streak-profile-face',
    templateFollowerAlert: 'follow-avatar',
    templateFanLevel: 'fan-profile',
    templateGifterLevel: 'gifter-orbit',
    templateLastGifter: 'follow-avatar',
    templateLastLiker: 'follow-avatar',
    templateLastSharer: 'follow-avatar',
    templateLastSubscriber: 'follow-avatar',
  };

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
      const anchor = ANCHORS[w.type];
      // window.VYRA_FRAME_FILES is set by toplike-studio.js — read lazily here (not at this file's own
      // top-level scope) since dynamically injected scripts don't have a guaranteed load order.
      const files = window.VYRA_FRAME_FILES || {};
      const file = files[w.profileFrame] || `${w.profileFrame}.png`;
      // [^"]* after the anchor class (not just [^>]*) because other wrappers in the chain (e.g.
      // profileFrameWh in media.js) append extra classes to the same div, like
      // class="vyra-profile-face profile-frame frame-none" — matching only an exact single-class
      // attribute would silently fail to find the div at all.
      // Non-greedy so it tolerates sibling markup inside the anchor div (e.g. gifter-orbit's three
      // decoy <i> rings before the actual photo <img>) without matching too far.
      const re = new RegExp(`(<div class="${anchor}[^"]*"[^>]*>[\\s\\S]*?)(<img[^>]*src="[^"]*"[^>]*>)`);
      html = html.replace(re, (match, prefix, img) =>
        `${prefix}<span class="pro-avatar-frame">${img}<img class="pro-frame-art" src="assets/images/profile-frames/${file}" alt=""></span>`
      );
    }
    return html;
  };

  // ---- Props/bind: mount the avatar-frame picker + a minimal entrance-animation group ----
  const gafBind = bind;
  bind = function () {
    gafBind();
    if (view !== 'editor') return;
    const w = state.widgets.find(x => x.id === selected);
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
      picker.querySelector('select').value = w.profileFrame || 'none';
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
