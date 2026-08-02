// Live widgets must start at zero, not at demo data.
//
// Every widget family ships with placeholder content so the editor shows something to design
// against: '@StreamQueen' with 44 999 coins, 'Alex 98.7K' in the Top Like rows, a goal sitting at
// 658/1000, 'TestAlpha' with 1500 MVP points. In the editor that is correct and wanted. In an OBS
// overlay it is wrong twice over — the audience sees numbers that were never earned, and the
// streamer cannot tell "nothing has happened yet" apart from "the connection is broken".
//
// live-leaderboard.js makes this worse for the ranking widgets specifically: its repaint loop
// starts with `if (!top.length) return;`, so before the first real like it leaves the demo rows
// untouched rather than clearing them.
//
// This file zeroes the *rendered* values in overlay mode only (studio.html?overlay=1, i.e. what
// overlay.html loads for OBS). It never touches state.widgets, so nothing is saved, the editor is
// unaffected, and the moment a real event arrives the normal update paths paint over these zeros.
//
// Scope: the ranking rows and the single-value widgets below — the families whose placeholder is
// baked into the markup or into state.widgets. Goals, Gift Campaign and the video-widget text
// layers invent theirs in a render-time fallback instead, and are handled at that level in
// media.js; see the note further down for why DOM patching cannot work for them.
(function () {
  'use strict';
  if (!new URLSearchParams(location.search).has('overlay')) return;

  const ZERO_NAME = '';          // no invented person
  const ZERO_NUM = '0';

  // A value is "demo" if the widget still carries the shipped placeholder. Real data that happens
  // to look similar is not at risk: by the time real data exists the update paths own the DOM.
  const DEMO_NAMES = new Set(['@streamqueen', 'streamqueen', 'testalpha', 'thundergifter',
    'heartriser', 'aurora vale', 'alex', 'mia', 'leo', 'sara', 'zoe', 'emma', 'noah', 'sofia',
    'liam', 'ella']);

  function isDemoName(text) {
    return DEMO_NAMES.has(String(text || '').trim().toLowerCase().replace(/^@/, ''));
  }

  // Writing the same value back still counts as a DOM mutation, which would wake the observer that
  // called us and spin forever — an early version of this file froze the page that way. Never
  // assign unless the text actually differs.
  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }
  function setStyle(el, prop, value) {
    if (el && el.style[prop] !== value) el.style[prop] = value;
  }

  // Keeps the unit/icon a widget renders next to its number ("◉ 44 999", "♥ 98.7K", "×18")
  // so zeroing does not also strip the styling the design depends on.
  function zeroNumberText(text) {
    const raw = String(text || '');
    const prefix = raw.match(/^[^\d]*/)?.[0] ?? '';
    return /\d/.test(raw) ? prefix + ZERO_NUM : raw;
  }

  function zeroRankingRows(root) {
    root.querySelectorAll('.toplike-row').forEach(row => {
      const name = row.querySelector('strong');
      if (!name || !isDemoName(name.textContent)) return;   // real data already painted — leave it
      setText(name, ZERO_NAME);
      const handle = row.querySelector('small');
      setText(handle, '');
      const value = row.querySelector('em');
      if (value) setText(value, zeroNumberText(value.textContent));
    });
  }

  // Per widget container, not per element: an earlier version zeroed every <em> with a digit in
  // the document, which also wiped real values that had already been painted. A widget is only
  // zeroed when its own name element still holds the shipped placeholder.
  const SINGLE_WIDGETS = [
    { box: '.vyra-topgift', name: 'strong', values: ['em'] },
    { box: '.vyra-streak', name: '.streak-copy strong, .sframe-row strong', values: ['.streak-score b', '.sframe-row b'] },
    { box: '.battle-mvp', name: 'h2, .mvpf-row strong', values: ['.mvp-copy strong', '.mvpf-row b'] },
    { box: '.topgift-framed', name: '.tgf-plate strong', values: ['.tgf-plate em'] },
  ];
  // Fan Level Up, Gifter Level Up and the Follower alert are deliberately absent. Earlier entries
  // named .vyra-fanlevel/.vyra-gifterlevel/.vyra-followalert, which exist nowhere in the codebase —
  // the real classes are .fan-level-up/.gifter-level-up/.follower-spotlight. Correcting them would
  // still be wasted work: all three sit at opacity:0;visibility:hidden until an event triggers them,
  // so their 'HeartRiser'/'ThunderGifter'/'Aurora Vale' placeholders are never on screen at rest,
  // and by the time one IS on screen it is showing a real viewer.

  function zeroSingleValueWidgets(root) {
    SINGLE_WIDGETS.forEach(({ box, name, values }) => {
      root.querySelectorAll(box).forEach(widget => {
        const nameEl = widget.querySelector(name);
        if (!nameEl || !isDemoName(nameEl.textContent)) return;  // real data — hands off
        setText(nameEl, ZERO_NAME);
        values.forEach(sel => widget.querySelectorAll(sel).forEach(el => {
          if (/\d/.test(el.textContent || '')) setText(el, zeroNumberText(el.textContent));
        }));
      });
    });
  }

  // Goals, Gift Campaign and the video-widget text layers are NOT handled here. Their placeholders
  // come from a `??`/`||` fallback inside media.js's own renderers, so patching the DOM could not
  // hold: this file disconnects on the first real event, and the next render() — a gift landing in
  // campaign slot 1, say — repaints every other slot back to its demo value mid-stream. media.js
  // suppresses those fallbacks in overlay mode instead (see VYRA_OVERLAY / ph / phv / phn there),
  // which cannot come back. What this file still owns is the demo data that lives in the DOM or in
  // state.widgets rather than in a render-time fallback, and so has no equivalent cure.

  let live = false, writing = false;   // flips on the first real event; after that the widgets own their values

  function zeroAll() {
    if (live || writing) return;
    writing = true;                       // second guard: ignore the mutations we cause ourselves
    try {
      zeroRankingRows(document);
      zeroSingleValueWidgets(document);
    } catch (err) {
      console.warn('[vyra] live-zero-state:', err.message);
    } finally {
      // Let the observer drain the mutations we just made before accepting new work.
      setTimeout(() => { writing = false }, 0);
    }
  }

  // Re-apply on every render: media.js rebuilds widget HTML from scratch on each render() call,
  // which would otherwise paint the demo values straight back in.
  const observer = new MutationObserver(zeroAll);
  observer.observe(document.body, { childList: true, subtree: true });
  zeroAll();
  addEventListener('DOMContentLoaded', zeroAll);

  // First real event: stop zeroing and disconnect, so this file costs nothing for the rest of the
  // stream and can never fight a legitimate update.
  addEventListener('vyra-live-event', () => { live = true; observer.disconnect() }, { once: true });
})();
