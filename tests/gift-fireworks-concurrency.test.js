'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'gift-fireworks-session.js'), 'utf8');
/* ETT I TAGET SOM STANDARD (användarens beslut 2026-10-18). Kön frågar renderaren hur många filer
   widgeten har (lanesFor, standard 1) och när nästa får starta (releaseFor = toppen). Riggen nedan
   ersätter renderaren med fasta tal: en enkel tändning når toppen efter 3090 ms (festivalens sol +
   fyra hjärtan) och spelar i 7000; finalen (combo 100) når toppen efter 16000 och spelar i 20000. */
function boot({ lanes = 1, renderer = true } = {}) {
  let now = 0, id = 0, capacity = true;
  const timers = new Map(), callbacks = [], played = [], events = new Map();
  const root = { console: { warn() {} },
    Date: { now: () => now },
    setTimeout(fn, ms) { callbacks.push(fn); timers.set(++id, { fn, at: now + ms }); return id },
    clearTimeout(id) { timers.delete(id) },
    addEventListener(name, fn) { events.set(name, fn) },
    VyraFireworks: renderer
      ? { durationFor: e => e.combo === 100 ? 20000 : 7000, releaseFor: e => e.combo === 100 ? 16000 : 3090,
          lanesFor: () => lanes, capacityFor: () => capacity }
      : { durationFor: e => e.combo === 100 ? 9200 : 5000, capacityFor: () => capacity },
    triggerGiftFireworks(e) { if (e.filtered) return false; played.push(e); return true }
  };
  root.window = root;
  vm.runInNewContext(source, root);
  return { root, played, callbacks, timers, capacity(v) { capacity = v },
    gift(e) { root.routeLiveBattleEvent({ type: 'gift', ...e }) },
    reset() { events.get('vyra-session-ended')() },
    tick(ms) {
      const target = now + ms;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = target;
    }
  };
}
test('one firework at a time by default; the next begins at the previous peak plus 100 ms', () => {
  const h = boot();
  for (let i = 0; i < 4; i++) h.gift({ id: i, profileImage: `https://example.com/${i}.png` });
  assert.deepEqual(h.played.map(e => e.id), [0]);
  assert.equal(h.root.VyraGiftFireworks.koLangd(), 3);
  h.tick(3189); assert.equal(h.played.length, 1);
  h.tick(1); assert.deepEqual(h.played.map(e => e.id), [0, 1]);
  h.tick(3190); h.tick(3190); assert.deepEqual(h.played.map(e => e.id), [0, 1, 2, 3]);
  assert.equal(h.played[3].profileImage, 'https://example.com/3.png');
});
test('an explicit choice of three lanes still starts three senders together', () => {
  const h = boot({ lanes: 3 });
  for (let i = 0; i < 6; i++) h.gift({ id: i });
  assert.deepEqual(h.played.map(e => e.id), [0, 1, 2]);
  assert.equal(h.root.VyraGiftFireworks.koLangd(), 3);
  h.tick(3190); assert.deepEqual(h.played.map(e => e.id), [0, 1, 2, 3, 4, 5]);
});
test('with three lanes a long finale retains its lane while shorter shows release theirs', () => {
  const h = boot({ lanes: 3 });
  h.gift({ id: 'show', combo: 100 });
  for (let i = 0; i < 4; i++) h.gift({ id: i });
  h.tick(3190); assert.equal(h.played.length, 5);
  assert.equal(h.root.VyraGiftFireworks.aktiva(), 3);
  h.tick(16100 - 3190 - 1); assert.equal(h.root.VyraGiftFireworks.aktiva(), 1, 'the two short shows released at their peak');
  h.tick(1); assert.equal(h.root.VyraGiftFireworks.aktiva(), 0);
});
test('an older renderer without lanesFor/releaseFor still plays one at a time for the whole show', () => {
  const h = boot({ renderer: false });
  for (let i = 0; i < 3; i++) h.gift({ id: i });
  assert.equal(h.played.length, 1);
  h.tick(5199); assert.equal(h.played.length, 1);
  h.tick(1); assert.equal(h.played.length, 2);
});
test('renderer capacity retains a gift until an external Action lane becomes free', () => {
  const h = boot(); h.capacity(false); h.gift({ id: 'pending' });
  assert.equal(h.played.length, 0); assert.equal(h.root.VyraGiftFireworks.koLangd(), 1);
  h.tick(300); assert.equal(h.played.length, 0);
  h.capacity(true); h.tick(100); assert.equal(h.played[0].id, 'pending');
});
test('filtered events consume no slot or delay', () => {
  const h = boot();
  for (let i = 0; i < 5; i++) h.gift({ filtered: true });
  h.gift({ id: 'valid' });
  assert.equal(h.played[0].id, 'valid'); assert.equal(h.root.VyraGiftFireworks.aktiva(), 1);
});
test('session reset invalidates completion callbacks even if an old callback was already delivered', () => {
  const h = boot();
  for (let i = 0; i < 5; i++) h.gift({ id: `old-${i}` });
  const oldCallbacks = [...h.callbacks]; h.reset();
  for (let i = 0; i < 2; i++) h.gift({ id: `new-${i}` });
  for (const fn of oldCallbacks) fn();
  assert.equal(h.root.VyraGiftFireworks.aktiva(), 1);
  assert.equal(h.root.VyraGiftFireworks.koLangd(), 1);
  assert.equal(h.played.length, 2);
  h.tick(3190);
  assert.equal(h.played.at(-1).id, 'new-1');
  assert.equal(h.played.some(e => e.id === 'old-1'), false);
});
test('session reset also invalidates pending capacity retries', () => {
  const h = boot(); h.capacity(false); h.gift({ id: 'old' });
  const oldCallback = h.callbacks[0]; h.reset(); h.capacity(true); oldCallback();
  assert.equal(h.played.length, 0); assert.equal(h.timers.size, 0);
});
test('the local queue is bounded at 200 waiting gifts', () => {
  const h = boot();
  for (let i = 0; i < 205; i++) h.gift({ id: i });
  assert.equal(h.root.VyraGiftFireworks.aktiva(), 1);
  assert.equal(h.root.VyraGiftFireworks.koLangd(), 200);
  assert.equal(h.root.VyraGiftFireworks.kastade(), 4);
});
