'use strict';
// Personal fireworks: every showcased rocket carries its own gift, sender and explosion.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.afterEach(async () => { await new Promise(setImmediate); closeAll(); });

const widget = (id = 'fw1', extra = {}) => ({
  id, type: 'templateGiftFireworks', x: 10, y: 10, width: 360,
  fwTheme: 'royal', fwMin: 1, fwSpeed: .6, fwDuration: 5,
  fwGiftSize: 110, fwExplosion: 100, fwDensity: 70, fwSound: false, ...extra
});
function boot(widgets = [widget()]) {
  const h = createDom({ state: { widgets, projectName: 'personal-rockets' } });
  h.load('overlay-sanitize.js');
  h.load('gift-fireworks.js');
  const run = source => {
    const script = h.document.createElement('script');
    script.textContent = source;
    h.document.body.append(script);
  };
  run(`state.widgets=${JSON.stringify(widgets)};selected=${JSON.stringify(widgets[0].id)};view='editor';
    document.querySelector('#view').innerHTML='<div class="canvas">'+state.widgets.map(wh).join('')+'</div>';`);
  const read = expression => { run(`window.__result=${expression}`); return h.window.__result; };
  return { ...h, run, read, fx: id => h.document.querySelector(`[data-id="${id || 'fw1'}"] .gift-fireworks-fx`) };
}
const event = extra => ({ username: 'Alice', giftName: 'Rose', coins: 100,
  giftImage: 'https://example.com/rose.png', profileImage: 'https://example.com/alice.png', ...extra });
const latest = fx => fx.querySelector('.fw-event:last-child');
const rockets = fx => [...fx.querySelectorAll('.fw-personal-rocket')];

test('all four themes support the 1 / 10 / 100 showcase tiers with bounded rocket counts', () => {
  const h = boot(['royal', 'ice', 'rose', 'comet'].map(theme => widget(theme, { fwTheme: theme })));
  for (const [combo, expected] of [[1, 1], [9, 1], [10, 3], [99, 3], [100, 7], [10000, 7]]) {
    h.window.dispatchEvent(new h.window.Event('vyra-session-ended'));
    h.window.triggerGiftFireworks(event({ combo }));
    for (const theme of ['royal', 'ice', 'rose', 'comet']) {
      assert.equal(rockets(h.fx(theme)).length, expected, `${theme}, combo ${combo}`);
      assert.equal(h.fx(theme).dataset.fwTheme, theme);
    }
  }
});

test('every showcased rocket owns the event images, an explosion and its arrival time', () => {
  const h = boot();
  h.window.triggerGiftFireworks(event({ combo: 100 }));
  const arrivals = [];
  for (const rocket of rockets(h.fx())) {
    assert.equal(rocket.querySelector('.fw-rocket-gift').getAttribute('src'), 'https://example.com/rose.png');
    assert.equal(rocket.querySelector('.fw-rocket-avatar').getAttribute('src'), 'https://example.com/alice.png');
    assert.ok(rocket.querySelector('.fw-burst'), 'explosion must follow its own rocket');
    assert.ok(rocket.querySelector('.fw-rocket-fallback'));
    const arrival = parseFloat(rocket.style.getPropertyValue('--arrival'));
    assert.ok(Number.isFinite(arrival) && arrival > 0, 'missing positive arrival time');
    arrivals.push(arrival);
  }
  assert.ok(new Set(arrivals).size > 1, 'a show must have successive arrivals');
});

test('the overlay has no sender name, gift name or duplicate central presentation', () => {
  const h = boot([widget('fw1', { fwTextOn: true, fwText: '{user} skickade {gift}' })]);
  h.window.triggerGiftFireworks(event({ combo: 10 }));
  assert.doesNotMatch(h.fx().textContent, /Alice|Rose|GIFT FIREWORKS|GÅVOR|skickade/);
  assert.equal(h.fx().querySelector('.fw-central-gift,.fw-sender-caption,.fw-text,.fw-combo-badge'), null);
});

test('a new sender replaces all old images and missing profiles cannot retain the previous sender', () => {
  const h = boot();
  h.window.triggerGiftFireworks(event({ combo: 100 }));
  h.window.triggerGiftFireworks(event({ combo: 10, profileImage: undefined, profileUrl: 'https://example.com/bob.png', giftImage: 'https://example.com/star.png' }));
  assert.equal(rockets(latest(h.fx())).length, 3);
  for (const rocket of rockets(latest(h.fx()))) {
    assert.equal(rocket.querySelector('.fw-rocket-avatar').getAttribute('src'), 'https://example.com/bob.png');
    assert.equal(rocket.querySelector('.fw-rocket-gift').getAttribute('src'), 'https://example.com/star.png');
  }
  h.window.triggerGiftFireworks({ combo: 1, username: 'Charlie', coins: 1 });
  assert.equal(rockets(latest(h.fx())).length, 1);
  assert.doesNotMatch(latest(h.fx()).innerHTML, /alice\.png|bob\.png|star\.png|Charlie/);
});

test('avatar load errors reveal a non-text icon fallback', () => {
  const h = boot();
  h.window.triggerGiftFireworks(event({ combo: 10 }));
  for (const rocket of rockets(h.fx())) {
    const avatar = rocket.querySelector('.fw-rocket-avatar');
    avatar.dispatchEvent(new h.window.Event('error'));
    const fallback = rocket.querySelector('.fw-rocket-fallback');
    assert.ok(avatar.hidden || avatar.style.display === 'none', 'broken image must disappear');
    assert.equal(fallback.hidden, false);
    assert.doesNotMatch(fallback.textContent, /[a-z0-9]/i, 'fallback must not show usernames or initials');
  }
});

test('unsafe event image URLs never become executable image sources', () => {
  const h = boot();
  h.window.triggerGiftFireworks(event({ combo: 10, profileImage: 'javascript:alert(1)', giftImage: 'data:text/html,<script>alert(1)</script>' }));
  for (const img of h.fx().querySelectorAll('img')) {
    assert.doesNotMatch(img.getAttribute('src') || '', /^\s*(?:javascript:|data:text\/html)/i);
  }
});

test('hidden widgets and individual value / anonymous filters remain respected', () => {
  const h = boot([widget('visible'), widget('hidden', { hidden: true }),
    widget('expensive', { fwMin: 1000 }), widget('private', { fwExcludeAnon: true })]);
  h.window.triggerGiftFireworks(event({ isAnonymous: true, combo: 100 }));
  assert.ok(h.fx('visible').classList.contains('play'));
  for (const id of ['hidden', 'expensive', 'private']) {
    assert.equal(h.fx(id)?.classList.contains('play') || false, false, `${id} bypassed its filter`);
  }
});

test('live rocket images and quantities do not write layout state or replace the scene node', () => {
  const h = boot();
  const before = h.read('JSON.stringify(state.widgets)');
  const stored = h.window.localStorage.getItem('vyra-state');
  const scene = h.fx();
  h.window.triggerGiftFireworks(event({ combo: 100 }));
  assert.strictEqual(h.fx(), scene);
  assert.equal(h.read('JSON.stringify(state.widgets)'), before);
  assert.equal(h.window.localStorage.getItem('vyra-state'), stored);
});

test('expired senders preserve surviving layers and queued Actions take the free lane', () => {
  const h = boot();
  let now = 100000, seq = 0;
  const callbacks = new Map();
  h.window.Date.now = () => now;
  h.window.setTimeout = fn => { callbacks.set(++seq, fn); return seq; };
  h.window.clearTimeout = id => callbacks.delete(id);
  h.window.triggerGiftFireworks(event({ id: 'long', combo: 100 }));
  const long = latest(h.fx());
  h.window.triggerGiftFireworks(event({ id: 'short-a', combo: 1 }));
  h.window.triggerGiftFireworks(event({ id: 'short-b', combo: 1 }));
  h.window.triggerGiftFireworks(event({ id: 'waiting', combo: 1, profileImage: 'https://example.com/waiting.png' }));
  assert.equal(h.fx().querySelectorAll('.fw-event').length, 3);
  assert.equal(h.window.VyraFireworks.pending(), 1);
  const deadline = h.window.VyraFireworks.aktivId(h.fx());
  now += 5000;
  callbacks.get(deadline)();
  assert.equal(long.isConnected, true, 'short shows must not erase a surviving finale');
  assert.equal(h.window.VyraFireworks.pending(), 0, 'free lanes should start queued Actions immediately');
  assert.equal(latest(h.fx()).querySelector('.fw-rocket-avatar').getAttribute('src'), 'https://example.com/waiting.png');
});
