'use strict';
// Top Gift never flips to the profile picture on a live stream. Measured against the production
// overlay in Chrome on 2026-08-03, driving the animation deterministically through the Web
// Animations API (document.timeline is frozen in a hidden tab, so wall-clock sampling there proves
// nothing — an earlier reading that claimed the node was replaced on every tick was that artifact):
//
//   .vyra-topgift.play .vyra-flip -> vyraFlipSmooth 4.2s ... forwards      (bound correctly)
//   @keyframes vyraFlipSmooth: 0%,42% rotateY(0) | 52% rotateY(90deg) | 65%,100% rotateY(180deg)
//   currentTime 1764ms (42%) -> matrix(1,0,0,1,0,0)          still face-on
//   currentTime 1900ms (45%) -> matrix3d(0.96,0,-0.21,...)   rotating
//   currentTime 2730ms (65%) -> matrix3d(-1,0,0,...)         profile side reached
//
// So the flip itself is intact. What breaks it is the restart. Every gift event makes
// gift-event-images.js call render(), which rebuilds #view and throws the widget away; media.js's
// autoStartAllFlips observer re-adds `play` to the fresh node and updateTopGift below removes and
// re-adds it as well. Both start vyraFlipSmooth over at 0%. Rotation does not begin until 42% of
// 4.2s = 1.76s and the profile face is not reached until 65% = 2.73s, so any gift arriving inside
// ~2.7s of the previous one resets the widget before it has rotated at all. Under gift spam it is
// pinned to the gift face forever. Measured on the same page: only `gift` triggers this — likes,
// chat, follows, joins and shares caused 0 renders and left the animation untouched.
//
// These tests pin the restart behaviour: a gift arriving mid-flip updates the data but must not
// rewind the animation, a rebuild must resume where it was, and a gift after the flip must start a
// genuinely new one.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FLIP_MS = 4200;

// The thresholds below are only meaningful if they match the shipped CSS, so read them from it.
const CSS = fs.readFileSync(path.join(ROOT, 'studio.css'), 'utf8');
const KEYFRAMES = (() => {
  const raw = /@keyframes vyraFlipSmooth\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(CSS);
  assert.ok(raw, 'vyraFlipSmooth saknas i studio.css');
  return [...raw[1].matchAll(/([\d%,\s]+)\{transform:rotateY\(([-\d.]+)(?:deg)?\)/g)]
    .flatMap(m => m[1].split(',').map(p => ({ pct: parseFloat(p), deg: parseFloat(m[2]) })))
    .filter(k => Number.isFinite(k.pct))
    .sort((a, b) => a.pct - b.pct);
})();
const HOLD_PCT = Math.max(...KEYFRAMES.filter(k => k.deg === 0).map(k => k.pct));   // 42
const FLIPPED_PCT = Math.min(...KEYFRAMES.filter(k => k.deg === 180).map(k => k.pct)); // 65
const ROTATION_STARTS_MS = FLIP_MS * HOLD_PCT / 100;      // 1764
const PROFILE_SHOWN_MS = FLIP_MS * FLIPPED_PCT / 100;     // 2730

test('the keyframes this suite reasons about are the ones that ship', () => {
  assert.equal(HOLD_PCT, 42);
  assert.equal(FLIPPED_PCT, 65);
  assert.match(CSS, /\.vyra-topgift\.play \.vyra-flip\{animation:vyraFlipSmooth 4\.2s/);
});

const { el, matches, makeDocument } = require('./helpers/flip-dom');

// updateTopGift delegates its timing to window.VyraFlip in media.js — see tests/flip-continuity.js
// for that helper on its own. Here it is loaded into the same sandbox so the two files are exercised
// together, which is the only place the hand-off between them is checked.
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const VYRA_FLIP_SRC = MEDIA.slice(MEDIA.indexOf('const VyraFlip='),
  MEDIA.indexOf('\n', MEDIA.indexOf('function autoStartAllFlips')));

// A fresh widget straight from state, exactly as media.js's render() produces it: no `play` class —
// media.js's autoStartAllFlips observer adds that a couple of frames later.
function buildTopGift(w) {
  const box = el('div', { classes: ['widget', 'vyra-topgift', 'theme-neon'], dataset: { id: w.id } });
  const flip = el('div', { classes: ['vyra-flip'] });
  const giftFace = el('div', { classes: ['vyra-gift-face'] });
  const gimg = el('img'); gimg.setAttribute('src', w.giftImage || 'assets/gifts/part1/gifts/0001_Rose.png');
  giftFace.append(gimg);
  const profileFace = el('div', { classes: ['vyra-profile-face'] });
  const pimg = el('img'); pimg.setAttribute('src', w.profileImage || 'assets/images/test-profile.svg');
  profileFace.append(pimg);
  flip.append(giftFace, profileFace);
  box.append(flip, el('strong', { textContent: w.dataName || '@StreamQueen' }),
    el('em', { textContent: '◉ ' + (w.dataValue || '44 999') }));
  return box;
}

// What the cascade puts on a standard-theme Top Gift once `play` is set.
function computedStyleFor(node, body) {
  const box = body.querySelector('.vyra-topgift');
  const off = { animationName: 'none', animationDuration: '0s', animationIterationCount: '1' };
  if (!box || !box.classList.contains('play')) return off;
  const anim = (animationName, animationDuration) =>
    ({ animationName, animationDuration, animationIterationCount: '1' });
  if (node === box) return anim('vyraAppear', '3.6s');
  if (matches(node, '.vyra-flip')) return anim('vyraFlipSmooth', '4.2s');
  if (matches(node, '.vyra-profile-face')) return anim('profileGlow', '4.2s');
  if (matches(node, '.vyra-gift-face')) return anim('giftPulse', '2.1s');
  return off;
}

function harness() {
  const { body, doc } = makeDocument();
  const listeners = {}, timers = [], saves = [], observers = [];
  let now = 1000;
  const state = { widgets: [{ id: 'g1', type: 'templateTopGift' }] };

  const sandbox = {
    document: doc,
    getComputedStyle: node => computedStyleFor(node, body),
    location: { search: '?overlay=1' },
    URLSearchParams, JSON, Object, Array, String, Number, Math, Set, Map, Boolean, Error, Promise,
    console: { log() {}, warn() {}, error() {} },
    Date: class extends Date {
      constructor(...a) { super(...(a.length ? a : [now])) }
      static now() { return now }
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => Promise.reject(new Error('offline')),
    MutationObserver: class {
      constructor(cb) { this.cb = cb; observers.push(this) }
      observe() { this.on = true } disconnect() { this.on = false }
    },
    addEventListener: (n, fn) => (listeners[n] = listeners[n] || []).push(fn),
    dispatchEvent(e) { (listeners[e.type] || []).slice().forEach(fn => fn(e)); return true },
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i?.detail } },
    setInterval: fn => { timers.push({ fn, every: true }); return timers.length },
    setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length },
    clearInterval() {}, clearTimeout() {},
    state,
    save: () => { saves.push(now) },
    requestAnimationFrame: fn => fn()
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;

  body.append(buildTopGift(state.widgets[0]));

  const api = {
    sandbox, state, saves,
    get node() { return body.querySelector('.vyra-topgift') },
    get flip() { return api.node.querySelector('.vyra-flip') },
    // Elapsed the animation is currently running at, as a browser would see it: the negative
    // animation-delay is how far in it starts.
    get progressMs() {
      const d = String(api.flip.style.animationDelay || '0ms');
      return -parseFloat(d) || 0;
    },
    run() {
      vm.runInNewContext(VYRA_FLIP_SRC, sandbox, { filename: 'media.js#VyraFlip' });
      vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'live-leaderboard.js'), 'utf8'),
        sandbox, { filename: 'live-leaderboard.js' });
    },
    gift(coins) {
      sandbox.dispatchEvent(new sandbox.CustomEvent('vyra-live-event', {
        detail: {
          type: 'gift', username: 'testgifter', name: 'TestGifter',
          profileImage: 'data:image/svg+xml,PROFILE', giftImage: 'data:image/svg+xml,GIFT',
          giftName: 'TESTROS', coins
        }
      }));
    },
    // gift-event-images.js's render(): #view is rewritten, so the widget is a brand new element.
    // media.js's autoStartAllFlips then arms it — the real function, run here.
    render() {
      body.children.length = 0;
      body.append(buildTopGift(api.state.widgets[0]));
      sandbox.autoStartAllFlips(sandbox.document);
    },
    tick() { timers.filter(t => t.every).forEach(t => t.fn()) },
    advance(ms) { now += ms }
  };
  return api;
}

// ---- 1. the data side ------------------------------------------------------------------------
test('a gift event sets name, value, profile image and gift image', () => {
  const h = harness(); h.run();
  h.gift(250);
  const n = h.node;
  assert.equal(n.querySelector('strong').textContent, 'TestGifter');
  assert.equal(n.querySelector('em').textContent, '◉ 250');
  assert.equal(n.querySelector('.vyra-profile-face img').src, 'data:image/svg+xml,PROFILE');
  assert.equal(n.querySelector('.vyra-gift-face img').src, 'data:image/svg+xml,GIFT');
  assert.ok(n.classList.contains('play'), 'flippen startade inte alls');
});

// ---- 2. the widget keeps its animation for the whole 4.2 s -----------------------------------
test('the one-second tick and save() leave the running flip alone', () => {
  const h = harness(); h.run();
  h.gift(250);
  const node = h.node;
  h.advance(1000); h.tick();
  h.advance(1000); h.tick();
  assert.equal(h.node, node, 'noden byttes ut av sekundticken');
  assert.ok(h.node.classList.contains('play'), 'play försvann under flippen');
  assert.equal(h.progressMs, 0, 'sekundticken skrev om animationens förlopp');
});

test('a gift arriving mid-flip does not rewind the animation', () => {
  // The actual production failure. Rotation does not start until 1.76s, so a gift at 1.0s that
  // restarts the animation means the widget never rotates at all while gifts keep coming.
  const h = harness(); h.run();
  h.gift(250);
  h.advance(1000);
  h.gift(300);
  assert.ok(h.progressMs >= 1000,
    `flippen startades om (förlopp ${h.progressMs} ms efter en gåva vid 1000 ms)`);
});

test('gift spam still lets the widget rotate and reach the profile side', () => {
  // Roses a second apart — the case a single manual test can never reproduce. Each gift used to
  // rewind the animation to 0, so the widget never passed the 42% hold and never rotated at all.
  const h = harness(); h.run();
  const seen = [];
  h.gift(1); seen.push(h.progressMs);
  for (let i = 0; i < 3; i += 1) { h.advance(1000); h.gift(1); seen.push(h.progressMs); }
  const reached = Math.max(...seen);
  assert.ok(reached > ROTATION_STARTS_MS,
    `förloppet nådde bara ${reached} ms, rotationen börjar först vid ${ROTATION_STARTS_MS} ms`);
  assert.ok(reached >= PROFILE_SHOWN_MS,
    `profilbildssidan nås vid ${PROFILE_SHOWN_MS} ms men förloppet nådde bara ${reached} ms`);
  // And once that flip is done, the next gift is allowed to start a fresh one.
  h.advance(FLIP_MS); h.gift(1);
  assert.equal(h.progressMs, 0, 'en gåva efter avslutad flipp startade ingen ny animation');
});

// ---- 3. a rebuild resumes instead of restarting -----------------------------------------------
test('a rebuild mid-flip resumes the animation where it was', () => {
  const h = harness(); h.run();
  h.gift(250);
  h.advance(2500);
  h.render();
  assert.ok(h.node.classList.contains('play'), 'play saknas efter ombyggnad');
  assert.ok(Math.abs(h.progressMs - 2500) < 200,
    `förloppet bevarades inte vid ombyggnad (${h.progressMs} ms, väntade ~2500 ms)`);
  assert.ok(h.progressMs > ROTATION_STARTS_MS, 'den ombyggda noden står kvar före rotationen');
});

test('a rebuild after the flip has finished does not revive it', () => {
  const h = harness(); h.run();
  h.gift(250);
  h.advance(FLIP_MS + 500);
  h.render();
  assert.equal(h.progressMs, 0, 'en avslutad flipp fick ett negativt delay och spelades om');
});

// ---- 4. a later gift starts a genuinely new flip ----------------------------------------------
test('a gift after the flip restarts it from the beginning with the new value', () => {
  const h = harness(); h.run();
  h.gift(250);
  h.advance(FLIP_MS + 100);
  h.gift(300);
  assert.equal(h.node.querySelector('em').textContent, '◉ 300');
  assert.ok(h.node.classList.contains('play'), 'andra gåvan startade ingen animation');
  assert.equal(h.progressMs, 0, 'en ny flipp ska börja på noll, inte återupptas');
});

// ---- 5. repeat gifts keep the tally and the display moving ------------------------------------
test('several gifts from the same user keep updating name, value and totals', () => {
  const h = harness(); h.run();
  h.gift(100);
  h.advance(1000); h.gift(50);            // mid-flip: must still update
  h.advance(FLIP_MS); h.gift(25);         // after the flip
  assert.equal(h.node.querySelector('em').textContent, '◉ 25', 'displayen frös under flippen');
  const top = h.sandbox.window.VyraLeaderboard.getTop('coins', 5);
  assert.equal(top[0].coins, 175, 'summan slutade ackumulera');
});

// ---- 6. ordinary rendering and saving keep working --------------------------------------------
test('the layout is still saved when a gift lands', () => {
  const h = harness(); h.run();
  h.gift(250);
  assert.ok(h.saves.length >= 1, 'gåvan sparade inte längre layouten');
});

test('a widget with no flip in flight is untouched by the tick', () => {
  const h = harness(); h.run();
  h.tick();
  assert.ok(!h.node.classList.contains('play'), 'ticken startade en flipp utan gåva');
  assert.equal(h.progressMs, 0);
});
