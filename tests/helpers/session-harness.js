'use strict';
// Two browser tabs, one origin, one storage, one lock manager — in a single node process.
//
// The race this block exists to close is a cross-tab race, so a harness that cannot run two
// independent owners against shared state cannot falsify anything. Everything here is therefore
// built to be shared deliberately: `storage` and `locks` are created once and handed to every owner
// instance, exactly the way two tabs share localStorage and the origin's lock manager.
//
// jsdom is NOT used. Nothing in this block touches the DOM; the goal-UI block is where that starts.

// ---- shared localStorage ------------------------------------------------------------------------
// Values are strings, as in the real thing — a fake that stored objects would hide every
// serialisation bug the plan is trying to catch. `writes` records the exact sequence so a test can
// assert "zero storage writes" rather than only inspecting the end state.
function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  let failAt = null, failCount = 0, failOnce = false;
  const shouldFail = () => failAt !== null && (failOnce ? failCount === failAt : failCount >= failAt);
  const store = {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem(key, value) {
      failCount += 1;
      if (shouldFail()) throw new Error('QuotaExceededError');
      if (typeof value !== 'string') throw new TypeError('localStorage lagrar bara strängar');
      writes.push(['set', key]);
      data.set(key, value);
    },
    removeItem(key) {
      failCount += 1;
      if (shouldFail()) throw new Error('QuotaExceededError');
      writes.push(['remove', key]);
      data.delete(key);
    },
    key: i => [...data.keys()][i],
    get length() { return data.size },
    // ---- test affordances ----
    writes,
    snapshot: () => Object.fromEntries(data),
    resetWrites: () => { writes.length = 0 },
    // Two fault models, because they prove different things.
    //
    // failOnWrite(n): the Nth mutating call and EVERY call after it throws — a storage that has
    // stopped accepting writes, e.g. quota exhausted. Nothing can restore storage in that world, so
    // this is the model for the fail-closed and logout paths, where the claim is about memory.
    //
    // failOnceOnWrite(n): only the Nth call throws — a transient failure. This is the model for the
    // rollback claim, where the whole point is that storage IS put back.
    failOnWrite(n) { failAt = n; failOnce = false; failCount = 0 },
    failOnceOnWrite(n) { failAt = n; failOnce = true; failCount = 0 },
    clearFailure() { failAt = null; failOnce = false; failCount = 0 }
  };
  return store;
}

// ---- shared lock manager ------------------------------------------------------------------------
// The parts of navigator.locks the plan relies on: exclusive mode, FIFO queueing per name, and
// release when the callback settles — including when it rejects.
function createLockManager() {
  const queues = new Map();
  const held = new Map();
  const log = [];
  return {
    log,
    heldBy: name => held.get(name) || null,
    async request(name, options, callback) {
      const fn = typeof options === 'function' ? options : callback;
      const mode = (typeof options === 'object' && options && options.mode) || 'exclusive';
      if (mode !== 'exclusive') throw new Error('harnessen stöder bara exclusive');

      const previous = queues.get(name) || Promise.resolve();
      let release;
      const mine = new Promise(resolve => { release = resolve });
      queues.set(name, previous.then(() => mine));

      await previous;
      held.set(name, fn.owner || true);
      log.push(['acquired', name]);
      try {
        return await fn();
      } finally {
        held.delete(name);
        log.push(['released', name]);
        release();
      }
    }
  };
}

// A deterministic id source. Real code uses crypto.randomUUID(); the plan forbids Date.now() alone,
// and a counter here makes assertions about "different projectionId" readable.
function createIds(prefix) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

// One "tab": its own owner instance, its own tabId and id sequence, the SHARED storage and locks.
function createOwner(factory, { storage, locks, tabId, extras = {} }) {
  return factory({
    storage,
    locks,
    tabId,
    randomId: createIds(tabId),
    now: () => 1_700_000_000_000,
    ...extras
  });
}

// The exact keys the write monopoly protects.
const PROTECTED = ['vyra-state', 'vyra-session-projection', 'vyra-extras',
  'vyra-action-event-v2', 'vyra-favorite-widgets'];

// A layout that is unmistakably one account's.
const layout = (owner, over = {}) => ({
  widgets: [{ id: `${owner}-w1`, type: 'templateSocialGoal', x: 10, y: 20 }],
  flows: [], user: owner, tiktok: '', brandKit: { background: '#000', highlight: '#fff',
    text: '#fff', secondaryText: '#aaa', fontFamily: '' }, ...over });

const extrasFor = owner => ({
  'vyra-extras': JSON.stringify({ commands: [{ cmd: `!${owner}`, reply: owner, on: true }] }),
  'vyra-action-event-v2': JSON.stringify({ actions: [{ id: `${owner}-a` }], events: [] }),
  'vyra-favorite-widgets': JSON.stringify([`${owner}-fav`])
});

module.exports = { createStorage, createLockManager, createIds, createOwner, PROTECTED, layout, extrasFor };
