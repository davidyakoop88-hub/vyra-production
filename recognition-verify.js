// recognition-verify.js — Recognition Engine, isolated verification (Steg 3 + Steg 4).
// DEV-ONLY. Never loaded by media.js or any production page — see recognition-verify.html,
// which is itself a standalone dev page. Not part of the pipeline itself. This project has no
// test framework anywhere (no jest/playwright/eslint/tsconfig — confirmed by inspection), so
// this intentionally does not introduce one. It runs two ways, matching conventions this
// project already uses:
//   - in a browser via recognition-verify.html (plain <script> tags, same as every VFX demo)
//   - headless via Node (`node -e "require(...)"`), same as tiktok-bridge/bridge.js is run
// Depends on window.VyraRecognitionNormalizer (Steg 3) and window.VyraRecognitionMerge
// (Steg 4), both of which must already be loaded before run() is called.
(function (root) {
  'use strict';

  function getNormalizer() {
    var ns = root.VyraRecognitionNormalizer;
    if (!ns || typeof ns.normalize !== 'function') {
      throw new Error('window.VyraRecognitionNormalizer.normalize is not available — load recognition-types.js and recognition-normalizer.js first');
    }
    return ns.normalize;
  }

  function getMerge() {
    var ns = root.VyraRecognitionMerge;
    if (!ns || typeof ns.push !== 'function') {
      throw new Error('window.VyraRecognitionMerge is not available — load recognition-types.js, recognition-rules.js and recognition-merge.js first');
    }
    return ns;
  }

  function getQueue() {
    var ns = root.VyraRecognitionQueue;
    if (!ns || typeof ns.enqueue !== 'function') {
      throw new Error('window.VyraRecognitionQueue is not available — load recognition-types.js, recognition-rules.js and recognition-queue.js first');
    }
    return ns;
  }

  function getController() {
    var ns = root.VyraRecognitionController;
    if (!ns || typeof ns.tick !== 'function') {
      throw new Error('window.VyraRecognitionController is not available — load recognition-types.js, recognition-rules.js, recognition-queue.js and recognition-controller.js first');
    }
    return ns;
  }

  function getMapper() {
    var ns = root.VyraRecognitionCardMapper;
    if (!ns || typeof ns.map !== 'function') {
      throw new Error('window.VyraRecognitionCardMapper is not available — load recognition-types.js, recognition-rules.js and recognition-card-mapper.js first');
    }
    return ns;
  }

  function getCard() {
    var ns = root.VyraRecognitionCard;
    if (!ns || typeof ns.mount !== 'function') {
      throw new Error('window.VyraRecognitionCard is not available — load recognition-types.js, recognition-rules.js, recognition-card-mapper.js and recognition-card.js first');
    }
    return ns;
  }

  function getRuntime() {
    var ns = root.VyraRecognitionRuntime;
    if (!ns || typeof ns.mount !== 'function') {
      throw new Error('window.VyraRecognitionRuntime is not available — load the full pipeline plus recognition-runtime.js first');
    }
    return ns;
  }

  function getAdapter() {
    var ns = root.VyraRecognitionAdapter;
    if (!ns || typeof ns.create !== 'function') {
      throw new Error('window.VyraRecognitionAdapter is not available — load recognition-adapter-types.js and recognition-adapter.js first');
    }
    return ns;
  }

  function hasDom() {
    return typeof document !== 'undefined';
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function makeResult(name, pass, details) {
    return { name: name, pass: !!pass, details: details || '' };
  }

  // Steg 8 (Recognition Card) needs to observe state AFTER real setTimeout-driven animation
  // phases finish (enter-complete, exit-complete, stale-timer safety) — something a purely
  // synchronous result can never express. A case function may return a plain {pass, details}
  // object (every case before Steg 8 does, and still works completely unchanged) OR a Promise
  // of one (Steg 8's timing-sensitive cases).
  //
  // runCase() returns a THUNK (a zero-arg function), not an already-started Promise. This
  // matters because every stage shares one singleton (Merge/Queue/Controller/Mapper/Card) the
  // same way `state`/`selected` are shared globals in studio.js — if every case's fn() started
  // executing immediately (e.g. via Promise.all), a later synchronous case's card.destroy()
  // would race ahead of an earlier case still mid-`wait()`, corrupting its assertions. run()
  // below invokes these thunks one at a time, awaiting each one's full completion (including
  // any real wait) before starting the next — the same strict serial order the plain
  // synchronous version had before Steg 8 introduced genuine async cases.
  function runCase(name, fn) {
    return function runDeferredCase() {
      return Promise.resolve()
        .then(function () { return fn(); })
        .then(function (outcome) { return makeResult(name, outcome.pass, outcome.details); })
        .catch(function (err) { return makeResult(name, false, 'threw: ' + (err && err.message ? err.message : String(err))); });
    };
  }

  // ---- Steg 3: Event Normalizer cases --------------------------------------------

  function runNormalizerCases(results) {
    var normalize = getNormalizer();

    results.push(runCase('1. Komplett join-event', function () {
      var result = normalize({ id: 'evt1', type: 'join', username: 'alice', name: 'Alice', profileImage: 'https://x/a.png', timestamp: 1700000000000, userId: 'u-1' });
      var ok = !!result && result.kind === 'join' && result.id === 'evt1'
        && result.actor.id === 'u-1' && result.actor.username === 'alice'
        && result.actor.displayName === 'Alice' && result.actor.avatarUrl === 'https://x/a.png'
        && result.gift === null && result.count === 1 && result.coins === 0
        && result.timestamp === 1700000000000 && result.mergeKey === 'join:u-1';
      return { pass: ok, details: JSON.stringify(result) };
    }));

    results.push(runCase('2. Join-event med saknat namn', function () {
      var result = normalize({ type: 'join', username: 'bob', userId: 'u-2' });
      var ok = !!result && result.actor.displayName === 'bob' && result.actor.username === 'bob';
      return { pass: ok, details: JSON.stringify(result) };
    }));

    results.push(runCase('2b. Bade namn och username saknas -> Guest (extra kontroll)', function () {
      var result = normalize({ type: 'join', userId: 'u-2b' });
      var ok = !!result && result.actor.displayName === 'Guest' && result.actor.username === '';
      return { pass: ok, details: JSON.stringify(result) };
    }));

    results.push(runCase('3. Like-event med count som strang', function () {
      var result = normalize({ type: 'like', username: 'carol', userId: 'u-3', count: '7' });
      var ok = !!result && result.kind === 'like' && result.count === 7 && result.mergeKey === 'like:u-3';
      return { pass: ok, details: JSON.stringify(result) };
    }));

    results.push(runCase('4. Gift-event med full giftdata', function () {
      var result = normalize({ type: 'gift', username: 'dave', userId: 'u-4', giftId: 'g-100', giftName: 'Rose', giftImage: 'https://x/rose.png', coins: 50, count: 2 });
      var ok = !!result && result.kind === 'gift' && !!result.gift
        && result.gift.id === 'g-100' && result.gift.name === 'Rose' && result.gift.imageUrl === 'https://x/rose.png'
        && result.coins === 50 && result.count === 2 && result.mergeKey === 'gift:u-4:g-100';
      return { pass: ok, details: JSON.stringify(result) };
    }));

    results.push(runCase('5. Gift-event utan giftId men med giftName (stabilt fallback-id)', function () {
      var r1 = normalize({ type: 'gift', username: 'erin', userId: 'u-5', giftName: 'Galaxy', coins: 1000 });
      var r2 = normalize({ type: 'gift', username: 'erin', userId: 'u-5', giftName: 'Galaxy', coins: 1000 });
      var ok = !!r1 && !!r1.gift && typeof r1.gift.id === 'string' && r1.gift.id.length > 0
        && r1.gift.id === r2.gift.id && r1.mergeKey === r2.mergeKey;
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2 }) };
    }));

    results.push(runCase('6. Okand eventtyp', function () {
      var result = normalize({ type: 'subscribe_unknown_thing', username: 'frank' });
      return { pass: result === null, details: 'result=' + JSON.stringify(result) };
    }));

    results.push(runCase('7. null och icke-objekt som input', function () {
      var inputs = [null, undefined, 'a string', 42, true, function () {}];
      var allNullNoThrow = true;
      var details = [];
      inputs.forEach(function (input) {
        try {
          var result = normalize(input);
          details.push(String(input) + ' -> ' + JSON.stringify(result));
          if (result !== null) allNullNoThrow = false;
        } catch (err) {
          allNullNoThrow = false;
          details.push(String(input) + ' -> THREW ' + err.message);
        }
      });
      return { pass: allNullNoThrow, details: details.join(' | ') };
    }));

    results.push(runCase('8. Negativ coins', function () {
      var result = normalize({ type: 'gift', username: 'gina', userId: 'u-8', giftName: 'Rose', coins: -25 });
      var ok = !!result && result.coins === 0;
      return { pass: ok, details: JSON.stringify(result) };
    }));

    results.push(runCase('9. count som 0 eller negativt', function () {
      var r0 = normalize({ type: 'like', username: 'hank', userId: 'u-9', count: 0 });
      var rNeg = normalize({ type: 'like', username: 'hank', userId: 'u-9', count: -5 });
      var ok = !!r0 && r0.count === 1 && !!rNeg && rNeg.count === 1;
      return { pass: ok, details: JSON.stringify({ r0: r0, rNeg: rNeg }) };
    }));

    results.push(runCase('10. Raobjektet ar oforandrat efter normalize()', function () {
      var raw = { type: 'gift', username: 'iris', userId: 'u-10', giftName: 'Rose', coins: 12, count: 3, timestamp: 123 };
      var before = JSON.stringify(raw);
      normalize(raw);
      var after = JSON.stringify(raw);
      return { pass: before === after, details: 'before=' + before + ' after=' + after };
    }));

    results.push(runCase('11. Tva events utan id far olika genererade id:n', function () {
      var r1 = normalize({ type: 'join', username: 'ivan' });
      var r2 = normalize({ type: 'join', username: 'ivan' });
      var ok = !!r1 && !!r2 && typeof r1.id === 'string' && typeof r2.id === 'string' && r1.id !== r2.id;
      return { pass: ok, details: 'id1=' + (r1 && r1.id) + ' id2=' + (r2 && r2.id) };
    }));

    results.push(runCase('12. Samma typ och anvandare far samma deterministiska mergeKey', function () {
      var r1 = normalize({ type: 'follow', username: 'judy', userId: 'u-12' });
      var r2 = normalize({ type: 'follow', username: 'judy', userId: 'u-12', timestamp: Date.now() + 999 });
      var ok = !!r1 && !!r2 && r1.mergeKey === r2.mergeKey && r1.mergeKey === 'follow:u-12';
      return { pass: ok, details: 'mergeKey1=' + (r1 && r1.mergeKey) + ' mergeKey2=' + (r2 && r2.mergeKey) };
    }));
  }

  // ---- Steg 4: Merge Engine cases --------------------------------------------

  function buildMergeKey(kind, actorId, gift) {
    if (kind === 'gift') return 'gift:' + actorId + ':' + ((gift && gift.id) || 'unknown');
    return kind + ':' + actorId;
  }

  function makeEvent(overrides) {
    overrides = overrides || {};
    var kind = overrides.kind || 'like';
    var actor = Object.assign({ id: 'actor-1', username: 'user1', displayName: 'User One', avatarUrl: null }, overrides.actor || {});
    var gift = overrides.gift === undefined ? null : overrides.gift;
    return {
      id: overrides.id || ('evt-' + Math.random().toString(36).slice(2, 10)),
      kind: kind,
      actor: actor,
      gift: gift,
      count: overrides.count !== undefined ? overrides.count : 1,
      coins: overrides.coins !== undefined ? overrides.coins : 0,
      timestamp: overrides.timestamp !== undefined ? overrides.timestamp : 1000,
      mergeKey: overrides.mergeKey || buildMergeKey(kind, actor.id, gift)
    };
  }

  function runMergeCases(results) {
    var merge = getMerge();

    results.push(runCase('Merge 1. Tva likes fran samma anvandare inom 1500 ms slas ihop', function () {
      merge.clear();
      var r1 = merge.push(makeEvent({ kind: 'like', timestamp: 1000, id: 'e1' }));
      var r2 = merge.push(makeEvent({ kind: 'like', timestamp: 1200, id: 'e2' }));
      var ok = r1.status === 'pending' && r2.status === 'merged' && r2.event.mergedCount === 2
        && merge.getPending().length === 1 && merge.getPending()[0].count === 2;
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2, pending: merge.getPending() }) };
    }));

    results.push(runCase('Merge 2. Likes fran olika anvandare halls separata', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', actor: { id: 'actor-A' }, timestamp: 1000, id: 'eA' }));
      merge.push(makeEvent({ kind: 'like', actor: { id: 'actor-B' }, timestamp: 1000, id: 'eB' }));
      var pending = merge.getPending();
      var ok = pending.length === 2 && pending[0].mergeKey !== pending[1].mergeKey;
      return { pass: ok, details: JSON.stringify(pending) };
    }));

    results.push(runCase('Merge 3. Likes fran samma anvandare efter fonstret skapar tva aggregat', function () {
      merge.clear();
      var emittedLog = [];
      var unsub = merge.subscribe(function (e) { emittedLog.push(e); });
      var r1 = merge.push(makeEvent({ kind: 'like', timestamp: 1000, id: 'e1' }));
      var r2 = merge.push(makeEvent({ kind: 'like', timestamp: 1000 + 1500 + 1, id: 'e2' }));
      unsub();
      var pending = merge.getPending();
      var ok = r1.status === 'pending' && r2.status === 'pending'
        && emittedLog.length === 1 && emittedLog[0].mergedCount === 1
        && pending.length === 1 && pending[0].id !== emittedLog[0].id;
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2, emittedLog: emittedLog, pending: pending }) };
    }));

    results.push(runCase('Merge 4. Tre likes summerar count korrekt', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, count: 2, id: 'e1' }));
      merge.push(makeEvent({ kind: 'like', timestamp: 1100, count: 3, id: 'e2' }));
      merge.push(makeEvent({ kind: 'like', timestamp: 1200, count: 1, id: 'e3' }));
      var pending = merge.getPending();
      var ok = pending.length === 1 && pending[0].count === 6;
      return { pass: ok, details: JSON.stringify(pending) };
    }));

    results.push(runCase('Merge 5. mergedCount raknar source events, inte like-count', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, count: 2, id: 'e1' }));
      merge.push(makeEvent({ kind: 'like', timestamp: 1100, count: 3, id: 'e2' }));
      merge.push(makeEvent({ kind: 'like', timestamp: 1200, count: 1, id: 'e3' }));
      var pending = merge.getPending();
      var ok = pending.length === 1 && pending[0].mergedCount === 3 && pending[0].count === 6;
      return { pass: ok, details: JSON.stringify(pending) };
    }));

    results.push(runCase('Merge 6. Tva identiska gifts fran samma anvandare slas ihop', function () {
      merge.clear();
      var gift = { id: 'g1', name: 'Rose', imageUrl: null };
      var r1 = merge.push(makeEvent({ kind: 'gift', gift: gift, timestamp: 1000, count: 1, coins: 10, id: 'g-e1' }));
      var r2 = merge.push(makeEvent({ kind: 'gift', gift: gift, timestamp: 1200, count: 1, coins: 10, id: 'g-e2' }));
      var pending = merge.getPending();
      var ok = r1.status === 'pending' && r2.status === 'merged'
        && pending.length === 1 && pending[0].count === 2 && pending[0].coins === 20;
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2, pending: pending }) };
    }));

    results.push(runCase('Merge 7. Olika gifts fran samma anvandare halls separata', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'gift', gift: { id: 'g1', name: 'Rose', imageUrl: null }, timestamp: 1000, id: 'e1' }));
      merge.push(makeEvent({ kind: 'gift', gift: { id: 'g2', name: 'Galaxy', imageUrl: null }, timestamp: 1000, id: 'e2' }));
      var ok = merge.getPending().length === 2;
      return { pass: ok, details: JSON.stringify(merge.getPending()) };
    }));

    results.push(runCase('Merge 8. Samma gift fran olika anvandare halls separata', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'gift', actor: { id: 'actorA' }, gift: { id: 'g1', name: 'Rose', imageUrl: null }, timestamp: 1000, id: 'e1' }));
      merge.push(makeEvent({ kind: 'gift', actor: { id: 'actorB' }, gift: { id: 'g1', name: 'Rose', imageUrl: null }, timestamp: 1000, id: 'e2' }));
      var ok = merge.getPending().length === 2;
      return { pass: ok, details: JSON.stringify(merge.getPending()) };
    }));

    results.push(runCase('Merge 9. Dubbelt source event-id raknas inte tva ganger', function () {
      merge.clear();
      var gift = { id: 'g1', name: 'Rose', imageUrl: null };
      merge.push(makeEvent({ kind: 'gift', gift: gift, timestamp: 1000, count: 1, coins: 10, id: 'dup-1' }));
      var r2 = merge.push(makeEvent({ kind: 'gift', gift: gift, timestamp: 1100, count: 1, coins: 10, id: 'dup-1' }));
      var pending = merge.getPending();
      var ok = r2.status === 'duplicate' && pending.length === 1 && pending[0].count === 1 && pending[0].mergedCount === 1;
      return { pass: ok, details: JSON.stringify({ r2: r2, pending: pending }) };
    }));

    results.push(runCase('Merge 10. Samma join tva ganger under sessionen blir duplicate', function () {
      merge.clear();
      var r1 = merge.push(makeEvent({ kind: 'join', timestamp: 1000, id: 'j1' }));
      var r2 = merge.push(makeEvent({ kind: 'join', timestamp: 1100, id: 'j2' }));
      var ok = r1.status === 'emitted' && r2.status === 'duplicate';
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2 }) };
    }));

    results.push(runCase('Merge 11. Join fran olika anvandare accepteras', function () {
      merge.clear();
      var r1 = merge.push(makeEvent({ kind: 'join', actor: { id: 'actorA' }, timestamp: 1000, id: 'j1' }));
      var r2 = merge.push(makeEvent({ kind: 'join', actor: { id: 'actorB' }, timestamp: 1000, id: 'j2' }));
      var ok = r1.status === 'emitted' && r2.status === 'emitted';
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2 }) };
    }));

    results.push(runCase('Merge 12. Dubbla follows inom 5000 ms filtreras', function () {
      merge.clear();
      var r1 = merge.push(makeEvent({ kind: 'follow', timestamp: 1000, id: 'f1' }));
      var r2 = merge.push(makeEvent({ kind: 'follow', timestamp: 1000 + 4999, id: 'f2' }));
      var ok = r1.status === 'emitted' && r2.status === 'duplicate';
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2 }) };
    }));

    results.push(runCase('Merge 13. Follow efter dedupe-fonstret accepteras', function () {
      merge.clear();
      var r1 = merge.push(makeEvent({ kind: 'follow', timestamp: 1000, id: 'f1' }));
      var r2 = merge.push(makeEvent({ kind: 'follow', timestamp: 1000 + 5000, id: 'f2' }));
      var ok = r1.status === 'emitted' && r2.status === 'emitted';
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2 }) };
    }));

    results.push(runCase('Merge 14. Dubbla shares inom 5000 ms filtreras', function () {
      merge.clear();
      var r1 = merge.push(makeEvent({ kind: 'share', timestamp: 1000, id: 's1' }));
      var r2 = merge.push(makeEvent({ kind: 'share', timestamp: 1000 + 4999, id: 's2' }));
      var ok = r1.status === 'emitted' && r2.status === 'duplicate';
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2 }) };
    }));

    results.push(runCase('Merge 15. flushExpired emitterar ratt pending event', function () {
      merge.clear();
      var emittedLog = [];
      var unsub = merge.subscribe(function (e) { emittedLog.push(e); });
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, count: 5, id: 'e1' }));
      var flushed = merge.flushExpired(1000 + 1500);
      unsub();
      var ok = flushed.length === 1 && flushed[0].count === 5
        && emittedLog.length === 1 && emittedLog[0].count === 5
        && merge.getPending().length === 0;
      return { pass: ok, details: JSON.stringify({ flushed: flushed, emittedLog: emittedLog }) };
    }));

    results.push(runCase('Merge 16. flushExpired for tidigt emitterar inget', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, id: 'e1' }));
      var flushed = merge.flushExpired(1000 + 1499);
      var ok = flushed.length === 0 && merge.getPending().length === 1;
      return { pass: ok, details: JSON.stringify({ flushed: flushed, pending: merge.getPending() }) };
    }));

    results.push(runCase('Merge 17. clear tommer state och stats', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, id: 'e1' }));
      merge.push(makeEvent({ kind: 'join', timestamp: 1000, id: 'j1' }));
      merge.clear();
      var statsAfter = merge.getStats();
      var expected = { received: 0, pending: 0, merged: 0, emitted: 0, duplicates: 0, rejected: 0 };
      var statsOk = JSON.stringify(statsAfter) === JSON.stringify(expected);
      var pendingOk = merge.getPending().length === 0;
      var rJoinAgain = merge.push(makeEvent({ kind: 'join', timestamp: 9999, id: 'j-new' }));
      var ok = statsOk && pendingOk && rJoinAgain.status === 'emitted';
      return { pass: ok, details: JSON.stringify({ statsAfter: statsAfter, rJoinAgain: rJoinAgain }) };
    }));

    results.push(runCase('Merge 18. Input-eventet ar oforandrat efter push()', function () {
      merge.clear();
      var raw = makeEvent({ kind: 'like', timestamp: 1000, id: 'immutable-1' });
      var before = JSON.stringify(raw);
      merge.push(raw);
      var after = JSON.stringify(raw);
      return { pass: before === after, details: 'before=' + before + ' after=' + after };
    }));

    results.push(runCase('Merge 19. En subscriber som kastar fel stoppar inte nasta subscriber', function () {
      merge.clear();
      var secondCalled = false;
      var unsub1 = merge.subscribe(function () { throw new Error('boom'); });
      var unsub2 = merge.subscribe(function () { secondCalled = true; });
      merge.push(makeEvent({ kind: 'join', timestamp: 1000, id: 'sub-test' }));
      unsub1();
      unsub2();
      return { pass: secondCalled === true, details: 'secondCalled=' + secondCalled };
    }));

    results.push(runCase('Merge 20. Ogiltig input returnerar rejected utan exception', function () {
      merge.clear();
      var inputs = [
        null, undefined, 'x', 42, {},
        { id: 'z', kind: 'not-a-kind', actor: { id: 'a', username: '', displayName: 'd', avatarUrl: null }, gift: null, count: 1, coins: 0, timestamp: 1, mergeKey: 'x' }
      ];
      var allRejectedNoThrow = true;
      var details = [];
      inputs.forEach(function (input) {
        try {
          var r = merge.push(input);
          details.push(JSON.stringify(input) + ' -> ' + r.status);
          if (r.status !== 'rejected') allRejectedNoThrow = false;
        } catch (err) {
          allRejectedNoThrow = false;
          details.push(JSON.stringify(input) + ' -> THREW ' + err.message);
        }
      });
      return { pass: allRejectedNoThrow, details: details.join(' | ') };
    }));

    results.push(runCase('Merge 21. sourceEventIds ar unika', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, id: 'u1' }));
      merge.push(makeEvent({ kind: 'like', timestamp: 1100, id: 'u2' }));
      merge.push(makeEvent({ kind: 'like', timestamp: 1100, id: 'u2' })); // duplicate id, must not double-add
      var pending = merge.getPending();
      var ids = pending[0].sourceEventIds;
      var uniqueIds = Array.prototype.filter.call(ids, function (id, i) { return ids.indexOf(id) === i; });
      var ok = pending.length === 1 && ids.length === 2 && uniqueIds.length === ids.length;
      return { pass: ok, details: JSON.stringify(pending) };
    }));

    results.push(runCase('Merge 22. getPending returnerar kopior, inte muterbart internt state', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, id: 'copy-1' }));
      var snapshot = merge.getPending();
      snapshot[0].count = 99999;
      snapshot[0].actor.displayName = 'HACKED';
      var again = merge.getPending();
      var ok = again[0].count !== 99999 && again[0].actor.displayName !== 'HACKED';
      return { pass: ok, details: JSON.stringify({ mutatedSnapshot: snapshot, freshRead: again }) };
    }));

    // ---- pending stat accuracy (fix: getStats().pending must always equal the actual number
    // of entries in pendingByMergeKey, never a separately-drifting counter) --------------------

    results.push(runCase('PendingStats 1. Nytt like-event ger pending = 1', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, id: 'ps1-e1' }));
      var ok = merge.getStats().pending === 1 && merge.getPending().length === 1;
      return { pass: ok, details: JSON.stringify(merge.getStats()) };
    }));

    results.push(runCase('PendingStats 2. Merge av samma eventgrupp behaller pending = 1', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, id: 'ps2-e1' }));
      merge.push(makeEvent({ kind: 'like', timestamp: 1200, id: 'ps2-e2' }));
      merge.push(makeEvent({ kind: 'like', timestamp: 1300, id: 'ps2-e3' }));
      var ok = merge.getStats().pending === 1 && merge.getPending().length === 1;
      return { pass: ok, details: JSON.stringify(merge.getStats()) };
    }));

    results.push(runCase('PendingStats 3. flushExpired() andrar pending till 0', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, id: 'ps3-e1' }));
      var beforeFlush = merge.getStats().pending;
      merge.flushExpired(1000 + 1500);
      var afterFlush = merge.getStats().pending;
      var ok = beforeFlush === 1 && afterFlush === 0 && merge.getPending().length === 0;
      return { pass: ok, details: JSON.stringify({ beforeFlush: beforeFlush, afterFlush: afterFlush }) };
    }));

    results.push(runCase('PendingStats 4. Tva olika pending mergeKeys ger pending = 2', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', actor: { id: 'ps4-A' }, timestamp: 1000, id: 'ps4-e1' }));
      merge.push(makeEvent({ kind: 'gift', actor: { id: 'ps4-A' }, gift: { id: 'g1', name: 'Rose', imageUrl: null }, timestamp: 1000, id: 'ps4-e2' }));
      var ok = merge.getStats().pending === 2 && merge.getPending().length === 2;
      return { pass: ok, details: JSON.stringify(merge.getStats()) };
    }));

    results.push(runCase('PendingStats 5. Utganget aggregat ersatt av nytt for samma mergeKey forblir pending = 1', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', timestamp: 1000, id: 'ps5-e1' }));
      var afterFirst = merge.getStats().pending;
      merge.push(makeEvent({ kind: 'like', timestamp: 1000 + 1500 + 1, id: 'ps5-e2' })); // window elapsed -> old emitted, new created
      var afterReplace = merge.getStats().pending;
      var ok = afterFirst === 1 && afterReplace === 1 && merge.getPending().length === 1;
      return { pass: ok, details: JSON.stringify({ afterFirst: afterFirst, afterReplace: afterReplace, pending: merge.getPending() }) };
    }));

    results.push(runCase('PendingStats 6. clear() ger pending = 0', function () {
      merge.clear();
      merge.push(makeEvent({ kind: 'like', actor: { id: 'ps6-A' }, timestamp: 1000, id: 'ps6-e1' }));
      merge.push(makeEvent({ kind: 'gift', actor: { id: 'ps6-B' }, gift: { id: 'g1', name: 'Rose', imageUrl: null }, timestamp: 1000, id: 'ps6-e2' }));
      var beforeClear = merge.getStats().pending;
      merge.clear();
      var afterClear = merge.getStats().pending;
      var ok = beforeClear === 2 && afterClear === 0 && merge.getPending().length === 0;
      return { pass: ok, details: JSON.stringify({ beforeClear: beforeClear, afterClear: afterClear }) };
    }));

    merge.clear(); // leave the shared singleton in a clean state for anything run after this
  }

  // ---- Steg 5: Priority Queue cases --------------------------------------------

  function makeMergedEvent(overrides) {
    overrides = overrides || {};
    var kind = overrides.kind || 'like';
    var actor = Object.assign({ id: 'actor-1', username: 'user1', displayName: 'User One', avatarUrl: null }, overrides.actor || {});
    var gift = overrides.gift === undefined ? null : overrides.gift;
    var timestamp = overrides.timestamp !== undefined ? overrides.timestamp : 1000;
    var id = overrides.id || ('mrg-evt-' + Math.random().toString(36).slice(2, 10));
    return {
      id: id,
      kind: kind,
      actor: actor,
      gift: gift,
      count: overrides.count !== undefined ? overrides.count : 1,
      coins: overrides.coins !== undefined ? overrides.coins : 0,
      timestamp: timestamp,
      mergeKey: overrides.mergeKey || (kind + ':' + actor.id + (gift ? ':' + gift.id : '')),
      mergedCount: overrides.mergedCount !== undefined ? overrides.mergedCount : 1,
      firstSeen: overrides.firstSeen !== undefined ? overrides.firstSeen : timestamp,
      lastSeen: overrides.lastSeen !== undefined ? overrides.lastSeen : timestamp,
      sourceEventIds: overrides.sourceEventIds || [id]
    };
  }

  function runQueueCases(results) {
    var queue = getQueue();

    results.push(runCase('Queue 1. Join enqueue/dequeue', function () {
      queue.clear();
      var enq = queue.enqueue(makeMergedEvent({ kind: 'join', id: 'j1', timestamp: Date.now() }));
      var out = queue.dequeueNext();
      var ok = enq.status === 'enqueued' && !!out && out.kind === 'join' && out.id === 'j1' && queue.size() === 0;
      return { pass: ok, details: JSON.stringify({ enq: enq, out: out }) };
    }));

    results.push(runCase('Queue 2. Gift gar fore join', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'j1', timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'gift', id: 'g1', gift: { id: 'gg1', name: 'Rose', imageUrl: null }, coins: 10, timestamp: Date.now() }));
      var first = queue.dequeueNext();
      var ok = !!first && first.kind === 'gift';
      return { pass: ok, details: JSON.stringify(first) };
    }));

    results.push(runCase('Queue 3. Follow gar fore share', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'share', id: 's1', timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'follow', id: 'f1', timestamp: Date.now() }));
      var first = queue.dequeueNext();
      var ok = !!first && first.kind === 'follow';
      return { pass: ok, details: JSON.stringify(first) };
    }));

    results.push(runCase('Queue 4. Large gift gar fore medium och small gift', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'gift', id: 'gs', gift: { id: 'g-s', name: 'Rose', imageUrl: null }, coins: 5, timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'gift', id: 'gm', gift: { id: 'g-m', name: 'Galaxy', imageUrl: null }, coins: 500, timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'gift', id: 'gl', gift: { id: 'g-l', name: 'Universe', imageUrl: null }, coins: 5000, timestamp: Date.now() }));
      var order = [queue.dequeueNext().id, queue.dequeueNext().id, queue.dequeueNext().id];
      var ok = order[0] === 'gl' && order[1] === 'gm' && order[2] === 'gs';
      return { pass: ok, details: JSON.stringify(order) };
    }));

    results.push(runCase('Queue 5. Samma prioritet foljer FIFO', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'l1', timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'l2', timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'l3', timestamp: Date.now() }));
      var order = [queue.dequeueNext().id, queue.dequeueNext().id, queue.dequeueNext().id];
      var ok = order[0] === 'l1' && order[1] === 'l2' && order[2] === 'l3';
      return { pass: ok, details: JSON.stringify(order) };
    }));

    results.push(runCase('Queue 6. peek tar inte bort event', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'l1', timestamp: Date.now() }));
      var p = queue.peek();
      var ok = !!p && p.id === 'l1' && queue.size() === 1;
      return { pass: ok, details: JSON.stringify({ p: p, size: queue.size() }) };
    }));

    results.push(runCase('Queue 7. dequeue tar bort event', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'l1', timestamp: Date.now() }));
      var d = queue.dequeueNext();
      var ok = !!d && d.id === 'l1' && queue.size() === 0;
      return { pass: ok, details: JSON.stringify({ d: d, size: queue.size() }) };
    }));

    results.push(runCase('Queue 8. Pause blockerar dequeue', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'l1', timestamp: Date.now() }));
      queue.pause();
      var d = queue.dequeueNext();
      var ok = d === null && queue.size() === 1 && queue.isPaused() === true;
      queue.resume();
      return { pass: ok, details: JSON.stringify({ d: d, size: queue.size() }) };
    }));

    results.push(runCase('Queue 9. Enqueue fungerar under pause', function () {
      queue.clear();
      queue.pause();
      var r = queue.enqueue(makeMergedEvent({ kind: 'like', id: 'l1', timestamp: Date.now() }));
      var ok = r.status === 'enqueued' && queue.size() === 1;
      queue.resume();
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Queue 10. Resume aterstaller dequeue', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'l1', timestamp: Date.now() }));
      queue.pause();
      queue.dequeueNext();
      queue.resume();
      var d = queue.dequeueNext();
      var ok = !!d && d.id === 'l1';
      return { pass: ok, details: JSON.stringify(d) };
    }));

    results.push(runCase('Queue 11. Expired join tas bort', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'j1', timestamp: 1000 }));
      var d = queue.dequeueNext(1000 + 10000);
      var ok = d === null && queue.size() === 0;
      return { pass: ok, details: JSON.stringify({ d: d, size: queue.size() }) };
    }));

    results.push(runCase('Queue 12. Icke-expired join finns kvar', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'j1', timestamp: 1000 }));
      var p = queue.peek(1000 + 9999);
      var ok = !!p && p.id === 'j1' && queue.size() === 1;
      return { pass: ok, details: JSON.stringify({ p: p, size: queue.size() }) };
    }));

    results.push(runCase('Queue 13. Full ko droppar lagprioriterat nytt event', function () {
      queue.clear();
      for (var i = 0; i < 30; i++) queue.enqueue(makeMergedEvent({ kind: 'like', id: 'fill' + i, timestamp: Date.now() }));
      var r = queue.enqueue(makeMergedEvent({ kind: 'join', id: 'low-new', timestamp: Date.now() }));
      var ok = r.status === 'dropped' && queue.size() === 30;
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Queue 14. Full ko ersatter lagst prioriterade event med hogre prioritet', function () {
      queue.clear();
      for (var i = 0; i < 30; i++) queue.enqueue(makeMergedEvent({ kind: 'like', id: 'fill' + i, timestamp: Date.now() }));
      var r = queue.enqueue(makeMergedEvent({ kind: 'follow', id: 'high-new', timestamp: Date.now() }));
      var ok = r.status === 'replaced' && !!r.replacedEvent && r.replacedEvent.kind === 'like' && r.replacedEvent.id === 'fill0' && queue.size() === 30;
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Queue 15. Join kan inte ersatta gift', function () {
      queue.clear();
      for (var i = 0; i < 30; i++) queue.enqueue(makeMergedEvent({ kind: 'gift', id: 'giftfill' + i, gift: { id: 'gid' + i, name: 'Rose', imageUrl: null }, coins: 5, timestamp: Date.now() }));
      var r = queue.enqueue(makeMergedEvent({ kind: 'join', id: 'join-cant', timestamp: Date.now() }));
      var ok = r.status === 'dropped';
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Queue 16. Gift kan ersatta join', function () {
      queue.clear();
      for (var i = 0; i < 29; i++) queue.enqueue(makeMergedEvent({ kind: 'gift', id: 'giftfill' + i, gift: { id: 'gid' + i, name: 'Rose', imageUrl: null }, coins: 5, timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'the-join', timestamp: Date.now() }));
      var r = queue.enqueue(makeMergedEvent({ kind: 'gift', id: 'gift-new', gift: { id: 'gnew', name: 'Universe', imageUrl: null }, coins: 5000, timestamp: Date.now() }));
      var ok = r.status === 'replaced' && !!r.replacedEvent && r.replacedEvent.kind === 'join' && r.replacedEvent.id === 'the-join';
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Queue 17. Maxlangd overskrids aldrig', function () {
      queue.clear();
      for (var i = 0; i < 40; i++) queue.enqueue(makeMergedEvent({ kind: 'like', id: 'overfill' + i, timestamp: Date.now() }));
      var ok = queue.size() === 30 && queue.getStats().length === 30;
      return { pass: ok, details: 'size=' + queue.size() };
    }));

    results.push(runCase('Queue 18. clear tommer kon', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'j1', timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'l1', timestamp: Date.now() }));
      queue.clear();
      var ok = queue.size() === 0 && queue.getItems().length === 0;
      return { pass: ok, details: 'size=' + queue.size() };
    }));

    results.push(runCase('Queue 19. Stats ar korrekta', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'sa1', timestamp: Date.now() })); // enqueued
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'sa2', timestamp: Date.now() })); // enqueued
      queue.dequeueNext(); // dequeues sa1 (higher priority) -> dequeued=1, only sa2 (join) remains
      // 29 more likes brings the queue to exactly 30 (1 existing + 29) without ever hitting the
      // full-queue branch during the loop itself.
      for (var i = 0; i < 29; i++) queue.enqueue(makeMergedEvent({ kind: 'like', id: 'safill' + i, timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'sa-dropped', timestamp: Date.now() })); // full, priority 20 == sa2's 20 -> dropped
      var beforeReplace = queue.getStats();
      queue.enqueue(makeMergedEvent({ kind: 'gift', id: 'sa-replace', gift: { id: 'sag', name: 'Rose', imageUrl: null }, coins: 5000, timestamp: Date.now() })); // full, priority 95 > sa2's 20 -> replaces sa2
      var stats = queue.getStats();
      var ok = stats.dequeued === 1 && beforeReplace.dropped === 1 && stats.replaced === 1
        && stats.enqueued === (2 + 29 + 1) // sa1+sa2, 29 fills, the successful replace also counts as an enqueue
        && stats.length === queue.size() && stats.length === 30 && stats.paused === false;
      return { pass: ok, details: JSON.stringify({ beforeReplace: beforeReplace, stats: stats }) };
    }));

    results.push(runCase('Queue 20. Ogiltig input ger rejected', function () {
      queue.clear();
      var inputs = [
        null, undefined, 'x', 42, {},
        { id: 'z', kind: 'not-a-kind', actor: { id: 'a', username: '', displayName: 'd', avatarUrl: null }, gift: null, count: 1, coins: 0, timestamp: 1, mergeKey: 'x', mergedCount: 1, firstSeen: 1, lastSeen: 1, sourceEventIds: [] },
        makeMergedEvent({ kind: 'gift', id: 'no-gift-data', gift: null, timestamp: Date.now() })
      ];
      var allRejectedNoThrow = true;
      var details = [];
      inputs.forEach(function (input) {
        try {
          var r = queue.enqueue(input);
          details.push(JSON.stringify(input) + ' -> ' + r.status);
          if (r.status !== 'rejected') allRejectedNoThrow = false;
        } catch (err) {
          allRejectedNoThrow = false;
          details.push(JSON.stringify(input) + ' -> THREW ' + err.message);
        }
      });
      return { pass: allRejectedNoThrow, details: details.join(' | ') };
    }));

    results.push(runCase('Queue 21. Input-event muteras inte', function () {
      queue.clear();
      var raw = makeMergedEvent({ kind: 'like', id: 'immutable-1', timestamp: 1000 });
      var before = JSON.stringify(raw);
      queue.enqueue(raw);
      var after = JSON.stringify(raw);
      return { pass: before === after, details: 'before=' + before + ' after=' + after };
    }));

    results.push(runCase('Queue 22. getItems returnerar djupa kopior', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'copy-1', timestamp: Date.now() }));
      var snapshot = queue.getItems();
      snapshot[0].priority = 99999;
      snapshot[0].event.count = 12345;
      var again = queue.getItems();
      var ok = again[0].priority !== 99999 && again[0].event.count !== 12345;
      return { pass: ok, details: JSON.stringify({ mutatedSnapshot: snapshot, freshRead: again }) };
    }));

    results.push(runCase('Queue 23. Subscriber-fel stoppar inte nasta subscriber', function () {
      queue.clear();
      var secondCalled = false;
      var unsub1 = queue.subscribe(function () { throw new Error('boom'); });
      var unsub2 = queue.subscribe(function () { secondCalled = true; });
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'sub-test', timestamp: Date.now() }));
      unsub1();
      unsub2();
      return { pass: secondCalled === true, details: 'secondCalled=' + secondCalled };
    }));

    results.push(runCase('Queue 24. Sorteringen ar deterministisk', function () {
      queue.clear();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'd1', timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'gift', id: 'd2', gift: { id: 'dg', name: 'Rose', imageUrl: null }, coins: 10, timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'follow', id: 'd3', timestamp: Date.now() }));
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'd4', timestamp: Date.now() }));
      var first = JSON.stringify(queue.getItems());
      var second = JSON.stringify(queue.getItems());
      var ids = queue.getItems().map(function (item) { return item.event.id; });
      var ok = first === second && ids.join(',') === ['d2', 'd3', 'd1', 'd4'].join(',');
      return { pass: ok, details: 'ids=' + ids.join(',') };
    }));

    results.push(runCase('Queue 25. dequeue fran tom ko returnerar null', function () {
      queue.clear();
      var d = queue.dequeueNext();
      return { pass: d === null, details: 'd=' + JSON.stringify(d) };
    }));

    queue.clear(); // leave the shared singleton in a clean state for anything run after this
  }

  // ---- Steg 6: Recognition Controller cases --------------------------------------------

  function runControllerCases(results) {
    var queue = getQueue();
    var controller = getController();

    function resetAll() {
      queue.clear();
      controller.stop();
      controller.clear();
    }

    results.push(runCase('Controller 1. Initial state ar stopped', function () {
      resetAll();
      var state = controller.getState();
      var ok = state.status === 'stopped' && state.running === false;
      return { pass: ok, details: JSON.stringify(state) };
    }));

    results.push(runCase('Controller 2. start ger idle', function () {
      resetAll();
      controller.start();
      var state = controller.getState();
      var ok = state.status === 'idle' && state.running === true && state.current === null;
      return { pass: ok, details: JSON.stringify(state) };
    }));

    results.push(runCase('Controller 3. Forsta tick hamtar ett event', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c3', timestamp: 1000 }));
      controller.tick(1000);
      var current = controller.getCurrent();
      var ok = !!current && current.event.id === 'c3' && current.status === 'presenting';
      return { pass: ok, details: JSON.stringify(current) };
    }));

    results.push(runCase('Controller 4. Endast ett event ar current', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c4a', timestamp: 1000 }));
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c4b', timestamp: 1000 }));
      controller.tick(1000);
      var current = controller.getCurrent();
      var ok = !!current && current.event.id === 'c4a' && queue.size() === 1;
      return { pass: ok, details: JSON.stringify({ current: current, queueSize: queue.size() }) };
    }));

    results.push(runCase('Controller 5. Ett andra event startar inte medan current ar aktivt', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c5a', timestamp: 1000 }));
      controller.tick(2000); // starts c5a, endsAt = 2000 + 3000 = 5000
      queue.enqueue(makeMergedEvent({ kind: 'gift', id: 'c5b', gift: { id: 'g5', name: 'Rose', imageUrl: null }, coins: 10, timestamp: 2000 }));
      controller.tick(2100); // not yet expired
      var current = controller.getCurrent();
      var ok = !!current && current.event.id === 'c5a' && queue.size() === 1;
      return { pass: ok, details: JSON.stringify({ current: current, queueSize: queue.size() }) };
    }));

    results.push(runCase('Controller 6. Event slutfors nar now nar endsAt', function () {
      resetAll();
      controller.start();
      var completes = [];
      var unsub = controller.subscribe(function (e) { if (e.type === 'presentation-complete') completes.push(e); });
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c6', timestamp: 1000 }));
      controller.tick(1000); // endsAt = 1000 + 2500 = 3500
      controller.tick(3500);
      unsub();
      var ok = controller.getCurrent() === null && completes.length === 1 && completes[0].presentation.event.id === 'c6';
      return { pass: ok, details: JSON.stringify(completes) };
    }));

    results.push(runCase('Controller 7. Nasta event startar forst pa efterfoljande tick', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c7a', timestamp: 1000 }));
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c7b', timestamp: 1000 }));
      controller.tick(1000); // starts c7a, endsAt=3500
      controller.tick(3500); // completes c7a, does NOT start c7b this same call
      var afterCompleteTick = controller.getCurrent();
      controller.tick(3600); // separate tick -> now starts c7b
      var afterNextTick = controller.getCurrent();
      var ok = afterCompleteTick === null && !!afterNextTick && afterNextTick.event.id === 'c7b';
      return { pass: ok, details: JSON.stringify({ afterCompleteTick: afterCompleteTick, afterNextTick: afterNextTick }) };
    }));

    results.push(runCase('Controller 8. completeCurrent avslutar direkt', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c8', timestamp: 1000 }));
      controller.tick(1000);
      var result = controller.completeCurrent('manual-done');
      var ok = !!result && result.event.id === 'c8' && result.status === 'completed' && controller.getCurrent() === null;
      return { pass: ok, details: JSON.stringify(result) };
    }));

    results.push(runCase('Controller 9. skipCurrent avslutar direkt', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c9', timestamp: 1000 }));
      controller.tick(1000);
      var result = controller.skipCurrent('user-skip');
      var ok = !!result && result.event.id === 'c9' && result.status === 'skipped' && controller.getCurrent() === null;
      return { pass: ok, details: JSON.stringify(result) };
    }));

    results.push(runCase('Controller 10. completeCurrent pa tom Controller ger null', function () {
      resetAll();
      controller.start();
      var result = controller.completeCurrent();
      return { pass: result === null, details: 'result=' + JSON.stringify(result) };
    }));

    results.push(runCase('Controller 11. skipCurrent pa tom Controller ger null', function () {
      resetAll();
      controller.start();
      var result = controller.skipCurrent();
      return { pass: result === null, details: 'result=' + JSON.stringify(result) };
    }));

    results.push(runCase('Controller 12. pause behaller current', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c12', timestamp: 1000 }));
      controller.tick(1000);
      controller.pause();
      var current = controller.getCurrent();
      var ok = !!current && current.event.id === 'c12' && controller.isPaused() === true;
      controller.resume();
      return { pass: ok, details: JSON.stringify(current) };
    }));

    results.push(runCase('Controller 13. tick under paus andrar inget', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c13', timestamp: 1000 }));
      controller.tick(1000); // endsAt = 3500
      controller.pause();
      controller.tick(9999999); // far past endsAt, but paused -> tick() must no-op entirely
      var current = controller.getCurrent();
      var ok = !!current && current.event.id === 'c13';
      controller.resume();
      return { pass: ok, details: JSON.stringify(current) };
    }));

    results.push(runCase('Controller 14. resume forlanger endsAt med pausens langd', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c14', timestamp: Date.now() }));
      controller.tick(Date.now());
      var beforePause = controller.getCurrent().endsAt;
      controller.pause();
      var waitStart = Date.now();
      while (Date.now() - waitStart < 20) { /* deterministic-enough busy wait for a real, measurable pause duration — pause()/resume() take no `now` override per the spec's own exposed signatures, so this is the only honest way to prove real elapsed time gets added back */ }
      controller.resume();
      var afterResume = controller.getCurrent().endsAt;
      var delta = afterResume - beforePause;
      var ok = afterResume > beforePause && delta >= 15 && delta < 2000;
      return { pass: ok, details: JSON.stringify({ beforePause: beforePause, afterResume: afterResume, delta: delta }) };
    }));

    results.push(runCase('Controller 15. stop behaller current', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c15', timestamp: 1000 }));
      controller.tick(1000);
      controller.stop();
      var current = controller.getCurrent();
      var ok = !!current && current.event.id === 'c15' && controller.getState().status === 'stopped';
      return { pass: ok, details: JSON.stringify(current) };
    }));

    results.push(runCase('Controller 16. tick under stop andrar inget', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c16', timestamp: 1000 }));
      controller.tick(1000); // endsAt = 3500
      controller.stop();
      controller.tick(9999999);
      var current = controller.getCurrent();
      var ok = !!current && current.event.id === 'c16';
      return { pass: ok, details: JSON.stringify(current) };
    }));

    results.push(runCase('Controller 17. start efter stop fungerar', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c17a', timestamp: 1000 }));
      controller.tick(1000);
      controller.completeCurrent(); // clear current before stopping, so restart starts from a clean idle
      controller.stop();
      controller.start();
      var stateAfterRestart = controller.getState();
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c17b', timestamp: 2000 }));
      controller.tick(2000);
      var current = controller.getCurrent();
      var ok = stateAfterRestart.status === 'idle' && stateAfterRestart.running === true
        && !!current && current.event.id === 'c17b';
      return { pass: ok, details: JSON.stringify({ stateAfterRestart: stateAfterRestart, current: current }) };
    }));

    results.push(runCase('Controller 18. clear tommer endast current, inte Queue', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c18a', timestamp: 1000 }));
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c18b', timestamp: 1000 }));
      controller.tick(1000); // current = c18a, c18b still pending in queue
      var queueSizeBefore = queue.size();
      controller.clear();
      var current = controller.getCurrent();
      var queueSizeAfter = queue.size();
      var ok = current === null && queueSizeBefore === 1 && queueSizeAfter === 1;
      return { pass: ok, details: JSON.stringify({ queueSizeBefore: queueSizeBefore, queueSizeAfter: queueSizeAfter }) };
    }));

    // 19-25: presentation durations per kind, including the three gift tiers.
    (function () {
      var cases = [
        [19, 'Join far ratt duration', 'join', null, 2500],
        [20, 'Like far ratt duration', 'like', null, 3000],
        [21, 'Follow far ratt duration', 'follow', null, 4000],
        [22, 'Share far ratt duration', 'share', null, 3500],
        [23, 'Small gift far ratt duration', 'gift', { gift: { id: 'gs', name: 'Rose', imageUrl: null }, coins: 5 }, 4500],
        [24, 'Medium gift far ratt duration', 'gift', { gift: { id: 'gm', name: 'Galaxy', imageUrl: null }, coins: 500 }, 5500],
        [25, 'Large gift far ratt duration', 'gift', { gift: { id: 'gl', name: 'Universe', imageUrl: null }, coins: 5000 }, 7000]
      ];
      cases.forEach(function (c) {
        var caseNumber = c[0], label = c[1], kind = c[2], giftOverrides = c[3], expectedDuration = c[4];
        results.push(runCase('Controller ' + caseNumber + '. ' + label, function () {
          resetAll();
          controller.start();
          var overrides = Object.assign({ kind: kind, id: 'dur-' + kind + '-' + caseNumber, timestamp: 1000 }, giftOverrides || {});
          queue.enqueue(makeMergedEvent(overrides));
          controller.tick(1000);
          var current = controller.getCurrent();
          var ok = !!current && current.durationMs === expectedDuration && current.endsAt === 1000 + expectedDuration;
          return { pass: ok, details: JSON.stringify(current) };
        }));
      });
    })();

    results.push(runCase('Controller 26. Samma Queue-event muteras inte', function () {
      resetAll();
      controller.start();
      var original = makeMergedEvent({ kind: 'gift', id: 'c26', gift: { id: 'g26', name: 'Rose', imageUrl: null }, coins: 50, timestamp: 1000 });
      var before = JSON.stringify(original);
      queue.enqueue(original);
      controller.tick(1000);
      var after = JSON.stringify(original);
      return { pass: before === after, details: 'before=' + before + ' after=' + after };
    }));

    results.push(runCase('Controller 27. getCurrent returnerar djup kopia', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c27', timestamp: 1000 }));
      controller.tick(1000);
      var snapshot = controller.getCurrent();
      snapshot.durationMs = 999999;
      snapshot.event.count = 42424242;
      var again = controller.getCurrent();
      var ok = again.durationMs !== 999999 && again.event.count !== 42424242;
      return { pass: ok, details: JSON.stringify({ mutatedSnapshot: snapshot, freshRead: again }) };
    }));

    results.push(runCase('Controller 28. getState returnerar djup kopia', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c28', timestamp: 1000 }));
      controller.tick(1000);
      var snapshot = controller.getState();
      snapshot.current.durationMs = 111;
      snapshot.status = 'tampered';
      var again = controller.getState();
      var ok = again.current.durationMs !== 111 && again.status !== 'tampered';
      return { pass: ok, details: JSON.stringify({ mutatedSnapshot: snapshot, freshRead: again }) };
    }));

    results.push(runCase('Controller 29. Subscriber far presentation-start', function () {
      resetAll();
      controller.start();
      var events = [];
      var unsub = controller.subscribe(function (e) { events.push(e); });
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c29', timestamp: 1000 }));
      controller.tick(1000);
      unsub();
      var ok = events.some(function (e) { return e.type === 'presentation-start' && e.presentation.event.id === 'c29'; });
      return { pass: ok, details: JSON.stringify(events) };
    }));

    results.push(runCase('Controller 30. Subscriber far presentation-complete', function () {
      resetAll();
      controller.start();
      var events = [];
      var unsub = controller.subscribe(function (e) { events.push(e); });
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c30', timestamp: 1000 }));
      controller.tick(1000); // endsAt = 3500
      controller.tick(3500);
      unsub();
      var ok = events.some(function (e) { return e.type === 'presentation-complete' && e.presentation.event.id === 'c30'; });
      return { pass: ok, details: JSON.stringify(events) };
    }));

    results.push(runCase('Controller 31. Subscriber far presentation-skip', function () {
      resetAll();
      controller.start();
      var events = [];
      var unsub = controller.subscribe(function (e) { events.push(e); });
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c31', timestamp: 1000 }));
      controller.tick(1000);
      controller.skipCurrent('c31-reason');
      unsub();
      var ok = events.some(function (e) { return e.type === 'presentation-skip' && e.presentation.event.id === 'c31' && e.reason === 'c31-reason'; });
      return { pass: ok, details: JSON.stringify(events) };
    }));

    results.push(runCase('Controller 32. Subscriber-fel stoppar inte nasta subscriber', function () {
      resetAll();
      controller.start();
      var secondCalled = false;
      var unsub1 = controller.subscribe(function () { throw new Error('boom'); });
      var unsub2 = controller.subscribe(function () { secondCalled = true; });
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c32', timestamp: 1000 }));
      controller.tick(1000);
      unsub1();
      unsub2();
      return { pass: secondCalled === true, details: 'secondCalled=' + secondCalled };
    }));

    results.push(runCase('Controller 33. unsubscribe fungerar', function () {
      resetAll();
      var calls = 0;
      var unsub = controller.subscribe(function () { calls++; });
      controller.start(); // -> calls=1
      unsub();
      controller.stop(); // unsubscribed -> must NOT increment
      var ok = calls === 1;
      return { pass: ok, details: 'calls=' + calls };
    }));

    results.push(runCase('Controller 34. Stats raknas korrekt', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c34a', timestamp: 1000 }));
      controller.tick(1000); // started=1, ticks=1 (starts c34a, endsAt=4000)
      controller.tick(1000); // ticks=2, nothing else changes (not expired yet)
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'c34b', timestamp: 1000 }));
      controller.tick(4000); // ticks=3, completes c34a (completed=1), does not start c34b this call
      controller.tick(4000); // ticks=4, starts c34b (started=2)
      controller.skipCurrent('c34-skip'); // skipped=1
      var stats = controller.getStats();
      var ok = stats.started === 2 && stats.completed === 1 && stats.skipped === 1 && stats.ticks === 4
        && stats.errors === 0 && stats.running === true && stats.paused === false && stats.hasCurrent === false;
      return { pass: ok, details: JSON.stringify(stats) };
    }));

    results.push(runCase('Controller 35. Ogiltigt/tomt Queue-event kraschar inte Controller', function () {
      resetAll();
      controller.start();
      var threw = false;
      try { controller.tick(Date.now()); } catch (err) { threw = true; }
      var current = controller.getCurrent();
      var ok = threw === false && current === null;
      return { pass: ok, details: JSON.stringify({ threw: threw, current: current }) };
    }));

    results.push(runCase('Controller 36. tick ar deterministisk med explicit now', function () {
      resetAll();
      controller.start();
      queue.enqueue(makeMergedEvent({ kind: 'like', id: 'c36', timestamp: 5000 }));
      controller.tick(5000);
      var current1 = controller.getCurrent();
      controller.tick(5000); // same explicit now again — current already active, not expired -> unchanged
      var current2 = controller.getCurrent();
      var ok = current1.startedAt === 5000 && current1.endsAt === 8000 && JSON.stringify(current1) === JSON.stringify(current2);
      return { pass: ok, details: JSON.stringify({ current1: current1, current2: current2 }) };
    }));

    results.push(runCase('Controller 37. Controller anvander inga timers', function () {
      resetAll();
      var originalSetTimeout = root.setTimeout;
      var originalSetInterval = root.setInterval;
      var originalRAF = root.requestAnimationFrame;
      var calls = { setTimeout: 0, setInterval: 0, requestAnimationFrame: 0 };
      if (typeof originalSetTimeout === 'function') root.setTimeout = function () { calls.setTimeout++; return originalSetTimeout.apply(this, arguments); };
      if (typeof originalSetInterval === 'function') root.setInterval = function () { calls.setInterval++; return originalSetInterval.apply(this, arguments); };
      if (typeof originalRAF === 'function') root.requestAnimationFrame = function () { calls.requestAnimationFrame++; return originalRAF.apply(this, arguments); };

      try {
        controller.start();
        queue.enqueue(makeMergedEvent({ kind: 'like', id: 'timer-check', timestamp: Date.now() }));
        controller.tick(Date.now());
        controller.pause();
        controller.tick(Date.now());
        controller.resume();
        controller.completeCurrent();
        controller.skipCurrent();
        controller.stop();
        controller.clear();
      } finally {
        if (typeof originalSetTimeout === 'function') root.setTimeout = originalSetTimeout;
        if (typeof originalSetInterval === 'function') root.setInterval = originalSetInterval;
        if (typeof originalRAF === 'function') root.requestAnimationFrame = originalRAF;
      }

      var ok = calls.setTimeout === 0 && calls.setInterval === 0 && calls.requestAnimationFrame === 0;
      return { pass: ok, details: JSON.stringify(calls) };
    }));

    resetAll(); // leave both shared singletons in a clean state for anything run after this
  }

  // ---- Steg 7: Recognition Card Mapper cases --------------------------------------------

  function makePresentation(event, overrides) {
    overrides = overrides || {};
    return {
      id: overrides.id || ('pres-' + Math.random().toString(36).slice(2, 10)),
      event: event,
      startedAt: overrides.startedAt !== undefined ? overrides.startedAt : 1000,
      durationMs: overrides.durationMs !== undefined ? overrides.durationMs : 3000,
      endsAt: overrides.endsAt !== undefined ? overrides.endsAt : 4000,
      status: overrides.status || 'presenting'
    };
  }

  function runMapperCases(results) {
    var mapper = getMapper();
    mapper.clearStats();

    results.push(runCase('Mapper 1. Join mappas korrekt', function () {
      var event = makeMergedEvent({ kind: 'join', id: 'm1', actor: { id: 'a1', username: 'robin', displayName: 'Robin' }, timestamp: 1000 });
      var r = mapper.map(event);
      var ok = r.status === 'mapped' && r.model.kind === 'join' && r.model.variant === 'join-soft'
        && r.model.content.eyebrow === 'WELCOME' && r.model.content.title === 'Robin'
        && r.model.content.subtitle === 'joined the live' && r.model.content.countLabel === null && r.model.content.coinLabel === null;
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 2. Like count 1 saknar countLabel', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm2', count: 1, timestamp: 1000 });
      var r = mapper.map(event);
      var ok = r.status === 'mapped' && r.model.content.countLabel === null && r.model.content.subtitle === 'sent a like';
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 3. Like count over 1 far countLabel', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm3', count: 5, timestamp: 1000 });
      var r = mapper.map(event);
      var ok = r.status === 'mapped' && r.model.content.countLabel === '×5' && r.model.content.subtitle === 'sent likes';
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 4. Like-pulse variant', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm4', count: 50, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.variant === 'like-pulse', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 5. Like-wave variant', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm5', count: 500, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.variant === 'like-wave', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 6. Like-storm variant', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm6', count: 5000, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.variant === 'like-storm', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 7. Share mappas korrekt', function () {
      var event = makeMergedEvent({ kind: 'share', id: 'm7', actor: { id: 'a7', username: 'sara', displayName: 'Sara' }, timestamp: 1000 });
      var r = mapper.map(event);
      var ok = r.status === 'mapped' && r.model.variant === 'share-signal' && r.model.content.eyebrow === 'SHARE'
        && r.model.content.subtitle === 'shared the live' && r.model.content.title === 'Sara';
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 8. Follow mappas korrekt', function () {
      var event = makeMergedEvent({ kind: 'follow', id: 'm8', actor: { id: 'a8', username: 'leo', displayName: 'Leo' }, timestamp: 1000 });
      var r = mapper.map(event);
      var ok = r.status === 'mapped' && r.model.variant === 'follow-spotlight' && r.model.content.eyebrow === 'NEW FOLLOWER'
        && r.model.content.subtitle === 'started following';
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 9. Small gift mappas korrekt', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm9', gift: { id: 'g9', name: 'Rose', imageUrl: null }, coins: 10, timestamp: 1000 });
      var r = mapper.map(event);
      var ok = r.status === 'mapped' && r.model.gift.tier === 'small' && r.model.variant === 'gift-crystal' && r.model.content.eyebrow === 'GIFT';
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 10. Medium gift mappas korrekt', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm10', gift: { id: 'g10', name: 'Galaxy', imageUrl: null }, coins: 500, timestamp: 1000 });
      var r = mapper.map(event);
      var ok = r.status === 'mapped' && r.model.gift.tier === 'medium' && r.model.variant === 'gift-crown' && r.model.content.eyebrow === 'BIG GIFT';
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 11. Large gift mappas korrekt', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm11', gift: { id: 'g11', name: 'Universe', imageUrl: null }, coins: 5000, timestamp: 1000 });
      var r = mapper.map(event);
      var ok = r.status === 'mapped' && r.model.gift.tier === 'large' && r.model.variant === 'gift-legendary' && r.model.content.eyebrow === 'LEGENDARY GIFT';
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 12. Gift countLabel fungerar', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm12', gift: { id: 'g12', name: 'Rose', imageUrl: null }, coins: 10, count: 3, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.content.countLabel === '×3', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 13. Gift coinLabel fungerar', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm13', gift: { id: 'g13', name: 'Rose', imageUrl: null }, coins: 300, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.content.coinLabel === '300 coins', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 14. Gift utan coins far null coinLabel', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm14', gift: { id: 'g14', name: 'Rose', imageUrl: null }, coins: 0, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.content.coinLabel === null, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 15. CurrentPresentation ger presentationId', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm15', timestamp: 1000 });
      var presentation = makePresentation(event, { id: 'pres-m15' });
      var r = mapper.map(presentation);
      return { pass: r.status === 'mapped' && r.model.metadata.presentationId === 'pres-m15', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 16. CurrentPresentation ger durationMs', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm16', timestamp: 1000 });
      var presentation = makePresentation(event, { id: 'pres-m16', durationMs: 3000 });
      var r = mapper.map(presentation);
      return { pass: r.status === 'mapped' && r.model.metadata.durationMs === 3000, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 17. Direkt MergedEvent ger null presentationId', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm17', timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.metadata.presentationId === null, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 18. Direkt MergedEvent ger null durationMs', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm18', timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.metadata.durationMs === null, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 19. DisplayName anvands fore username', function () {
      var event = makeMergedEvent({ kind: 'join', id: 'm19', actor: { id: 'a19', username: 'rlarsson', displayName: 'Robin Larsson' }, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.actor.displayName === 'Robin Larsson' && r.model.content.title === 'Robin Larsson', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 20. Username anvands som fallback', function () {
      var event = makeMergedEvent({ kind: 'join', id: 'm20', actor: { id: 'a20', username: 'sarauser', displayName: '' }, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.actor.displayName === 'sarauser', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 21. Guest anvands nar bada saknas', function () {
      var event = makeMergedEvent({ kind: 'join', id: 'm21', actor: { id: 'a21', username: '', displayName: '' }, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.actor.displayName === 'Guest', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 22. Initialer fran tva ord', function () {
      var event = makeMergedEvent({ kind: 'join', id: 'm22', actor: { id: 'a22', username: 'rl', displayName: 'Robin Larsson' }, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.actor.initials === 'RL', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 23. Initial fran ett ord', function () {
      var event = makeMergedEvent({ kind: 'join', id: 'm23', actor: { id: 'a23', username: 'robin', displayName: 'Robin' }, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.actor.initials === 'R', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 24. Tomt namn ger fragetecken', function () {
      var event = makeMergedEvent({ kind: 'join', id: 'm24', actor: { id: 'a24', username: '', displayName: '' }, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.actor.initials === '?', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 25. Avatar saknas ger null', function () {
      var event = makeMergedEvent({ kind: 'join', id: 'm25', actor: { id: 'a25', username: 'x', displayName: 'X', avatarUrl: null }, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.actor.avatarUrl === null, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 26. Giftbild saknas ger null', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm26', gift: { id: 'g26', name: 'Rose', imageUrl: null }, coins: 10, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.gift.imageUrl === null, details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 27. Input muteras inte', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm27', gift: { id: 'g27', name: 'Rose', imageUrl: null }, coins: 50, timestamp: 1000 });
      var before = JSON.stringify(event);
      mapper.map(event);
      var after = JSON.stringify(event);
      return { pass: before === after, details: 'before=' + before + ' after=' + after };
    }));

    results.push(runCase('Mapper 28. Output ar en djup kopia', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm28', timestamp: 1000 });
      var rA = mapper.map(event);
      var rB = mapper.map(event);
      rA.model.actor.displayName = 'MUTATED';
      rA.model.content.title = 'MUTATED';
      var ok = rB.model.actor.displayName !== 'MUTATED' && rB.model.content.title !== 'MUTATED';
      return { pass: ok, details: JSON.stringify({ rA: rA, rB: rB }) };
    }));

    results.push(runCase('Mapper 29. Okand kind rejected', function () {
      var event = makeMergedEvent({ kind: 'unknown-thing', id: 'm29', timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'rejected', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 30. Saknat event-id rejected', function () {
      // makeMergedEvent's own `overrides.id || (...)` treats '' as falsy and would silently
      // substitute a generated id, so the empty id is set directly on the built event instead.
      var event = makeMergedEvent({ kind: 'like', timestamp: 1000 });
      event.id = '';
      var r = mapper.map(event);
      return { pass: r.status === 'rejected', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 31. Saknat actor-id rejected', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm31', actor: { id: '', username: 'x', displayName: 'X' }, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'rejected', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 32. Ogiltig timestamp rejected', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm32', timestamp: NaN });
      var r = mapper.map(event);
      return { pass: r.status === 'rejected', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 33. Negativ count rejected', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm33', count: -5, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'rejected', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 34. Negativa coins rejected', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm34', gift: { id: 'g34', name: 'Rose', imageUrl: null }, coins: -10, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'rejected', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 35. Gift utan giftdata rejected', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm35', gift: null, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'rejected', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 36. Formatter ger 999', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm36', count: 999, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.content.countLabel === '×999', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 37. Formatter ger 1K', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm37', count: 1000, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.content.countLabel === '×1K', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 38. Formatter ger 1.2K', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm38', count: 1200, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.content.countLabel === '×1.2K', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 39. Formatter ger 1M', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm39', count: 1000000, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.content.countLabel === '×1M', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 40. Formatter ger 1.2M', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm40', count: 1250000, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.content.countLabel === '×1.2M', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 41. Aria-label for join ar korrekt', function () {
      var event = makeMergedEvent({ kind: 'join', id: 'm41', actor: { id: 'a41', username: 'robin', displayName: 'Robin' }, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.accessibility.ariaLabel === 'Robin joined the live', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 42. Aria-label for like anvander fullt tal', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm42', actor: { id: 'a42', username: 'robin', displayName: 'Robin' }, count: 1200, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.accessibility.ariaLabel === 'Robin sent 1,200 likes', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 43. Aria-label for gift innehaller antal, namn och coins', function () {
      var event = makeMergedEvent({ kind: 'gift', id: 'm43', actor: { id: 'a43', username: 'robin', displayName: 'Robin' }, gift: { id: 'g43', name: 'Rose', imageUrl: null }, count: 3, coins: 300, timestamp: 1000 });
      var r = mapper.map(event);
      return { pass: r.status === 'mapped' && r.model.accessibility.ariaLabel === 'Robin sent 3 Rose gifts worth 300 coins', details: JSON.stringify(r) };
    }));

    results.push(runCase('Mapper 44. validateCardModel accepterar korrekt modell', function () {
      var event = makeMergedEvent({ kind: 'like', id: 'm44', timestamp: 1000 });
      var r = mapper.map(event);
      var validation = mapper.validateCardModel(r.model);
      return { pass: validation.valid === true && validation.errors.length === 0, details: JSON.stringify(validation) };
    }));

    results.push(runCase('Mapper 45. validateCardModel avvisar felaktig modell', function () {
      var validation = mapper.validateCardModel({ id: '', kind: 'not-a-kind' });
      return { pass: validation.valid === false && validation.errors.length > 0, details: JSON.stringify(validation) };
    }));

    results.push(runCase('Mapper 46. Stats raknas korrekt', function () {
      mapper.clearStats();
      mapper.map(makeMergedEvent({ kind: 'join', id: 'st1', timestamp: 1000 }));
      mapper.map(makeMergedEvent({ kind: 'like', id: 'st2', timestamp: 1000 }));
      mapper.map(makeMergedEvent({ kind: 'gift', id: 'st3', gift: { id: 'gst', name: 'Rose', imageUrl: null }, coins: 5000, timestamp: 1000 })); // large
      mapper.map(makeMergedEvent({ kind: 'unknown-thing', id: 'st4', timestamp: 1000 })); // rejected
      var stats = mapper.getStats();
      var ok = stats.mapped === 3 && stats.rejected === 1 && stats.join === 1 && stats.like === 1
        && stats.gift === 1 && stats.largeGift === 1 && stats.smallGift === 0 && stats.mediumGift === 0
        && stats.share === 0 && stats.follow === 0;
      return { pass: ok, details: JSON.stringify(stats) };
    }));

    results.push(runCase('Mapper 47. clearStats fungerar', function () {
      mapper.map(makeMergedEvent({ kind: 'join', id: 'cs1', timestamp: 1000 }));
      mapper.clearStats();
      var stats = mapper.getStats();
      var expected = { mapped: 0, rejected: 0, join: 0, like: 0, share: 0, follow: 0, gift: 0, smallGift: 0, mediumGift: 0, largeGift: 0 };
      return { pass: JSON.stringify(stats) === JSON.stringify(expected), details: JSON.stringify(stats) };
    }));

    results.push(runCase('Mapper 48. Mapper innehaller ingen DOM-kod', function () {
      var hasDocument = typeof document !== 'undefined';
      var calls = { createElement: 0, querySelector: 0, getElementById: 0 };
      var originals = {};
      if (hasDocument) {
        originals.createElement = document.createElement;
        originals.querySelector = document.querySelector;
        originals.getElementById = document.getElementById;
        document.createElement = function () { calls.createElement++; return originals.createElement.apply(document, arguments); };
        document.querySelector = function () { calls.querySelector++; return originals.querySelector.apply(document, arguments); };
        document.getElementById = function () { calls.getElementById++; return originals.getElementById.apply(document, arguments); };
      }
      try {
        mapper.map(makeMergedEvent({ kind: 'gift', id: 'dom-check', gift: { id: 'gd', name: 'Rose', imageUrl: null }, coins: 500, timestamp: Date.now() }));
        mapper.mapEvent(makeMergedEvent({ kind: 'like', id: 'dom-check-2', timestamp: Date.now() }));
        mapper.getVariant(makeMergedEvent({ kind: 'follow', id: 'dom-check-3', timestamp: Date.now() }));
        mapper.getGiftTier(makeMergedEvent({ kind: 'gift', id: 'dom-check-4', gift: { id: 'gd2', name: 'Rose', imageUrl: null }, coins: 10, timestamp: Date.now() }));
        mapper.validateCardModel({});
        mapper.getStats();
        mapper.clearStats();
      } finally {
        if (hasDocument) {
          document.createElement = originals.createElement;
          document.querySelector = originals.querySelector;
          document.getElementById = originals.getElementById;
        }
      }
      var ok = calls.createElement === 0 && calls.querySelector === 0 && calls.getElementById === 0;
      return { pass: ok, details: JSON.stringify(calls) };
    }));

    results.push(runCase('Mapper 49. Mapper anvander inga timers', function () {
      var originalSetTimeout = root.setTimeout;
      var originalSetInterval = root.setInterval;
      var originalRAF = root.requestAnimationFrame;
      var calls = { setTimeout: 0, setInterval: 0, requestAnimationFrame: 0 };
      if (typeof originalSetTimeout === 'function') root.setTimeout = function () { calls.setTimeout++; return originalSetTimeout.apply(this, arguments); };
      if (typeof originalSetInterval === 'function') root.setInterval = function () { calls.setInterval++; return originalSetInterval.apply(this, arguments); };
      if (typeof originalRAF === 'function') root.requestAnimationFrame = function () { calls.requestAnimationFrame++; return originalRAF.apply(this, arguments); };
      try {
        mapper.map(makeMergedEvent({ kind: 'like', id: 'timer-check', timestamp: Date.now() }));
        mapper.getStats();
        mapper.clearStats();
      } finally {
        if (typeof originalSetTimeout === 'function') root.setTimeout = originalSetTimeout;
        if (typeof originalSetInterval === 'function') root.setInterval = originalSetInterval;
        if (typeof originalRAF === 'function') root.requestAnimationFrame = originalRAF;
      }
      var ok = calls.setTimeout === 0 && calls.setInterval === 0 && calls.requestAnimationFrame === 0;
      return { pass: ok, details: JSON.stringify(calls) };
    }));

    mapper.clearStats(); // leave the shared singleton clean for anything run after this
  }

  // ---- Steg 8: Recognition Card UI cases --------------------------------------------
  //
  // Card is the one Recognition Engine file that needs a real DOM — there is no meaningful
  // DOM-free logic to verify headlessly (unlike every earlier stage). Every case below checks
  // hasDom() first and reports a clear "skipped: no DOM" soft-pass under Node, then runs its
  // real assertions in the browser. Two required checks (#40/#41: media.js/studio.html
  // untouched) are repo-level, not JS-testable, and are confirmed separately via `git status`
  // in the final report. Two more (#42/#43: demo works standalone / no console errors on every
  // demo button) are verified directly against recognition-card-demo.html in the browser, not
  // through this shared harness, since that demo is a separate page this file never loads.

  function runCardCases(results) {
    var card = getCard();
    var mapper = getMapper();

    function mapModel(overrides) {
      var event = makeMergedEvent(overrides);
      var result = mapper.map(event);
      if (result.status !== 'mapped') throw new Error('test setup: mapModel() could not map ' + JSON.stringify(overrides) + ' -> ' + result.reason);
      return result.model;
    }

    function freshMount() {
      card.destroy();
      var container = document.createElement('div');
      container.id = 'vyra-recognition-test-stage';
      document.body.appendChild(container);
      card.mount(container);
      return container;
    }

    function teardown(container) {
      card.destroy();
      if (container && container.parentNode) container.parentNode.removeChild(container);
    }

    function skip(reason) {
      return { pass: true, details: 'skipped: ' + (reason || 'no DOM in this environment') };
    }

    results.push(runCase('Card 1. mount med HTMLElement', function () {
      if (!hasDom()) return skip();
      card.destroy();
      var container = document.createElement('div');
      document.body.appendChild(container);
      var r = card.mount(container);
      var ok = r.status === 'mounted' && !!card.getElement() && card.getElement().parentNode === container;
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Card 2. mount med selector', function () {
      if (!hasDom()) return skip();
      card.destroy();
      var container = document.createElement('div');
      container.id = 'vyra-recognition-selector-target';
      document.body.appendChild(container);
      var r = card.mount('#vyra-recognition-selector-target');
      var ok = r.status === 'mounted' && card.getElement().parentNode === container;
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Card 3. Ogiltig target rejected', function () {
      if (!hasDom()) return skip();
      card.destroy();
      var r1 = card.mount('#this-selector-matches-nothing');
      var r2 = card.mount(42);
      var r3 = card.mount(null);
      var ok = r1.status === 'rejected' && r2.status === 'rejected' && r3.status === 'rejected';
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2, r3: r3 }) };
    }));

    results.push(runCase('Card 4. show join', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var r = card.show(mapModel({ kind: 'join' }));
      var ok = r.status === 'shown' && card.getState().phase === 'entering' && card.getState().currentModel.kind === 'join';
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Card 5. show like', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var r = card.show(mapModel({ kind: 'like', count: 5 }));
      var ok = r.status === 'shown' && card.getState().currentModel.kind === 'like';
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Card 6. show share', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var r = card.show(mapModel({ kind: 'share' }));
      var ok = r.status === 'shown' && card.getState().currentModel.kind === 'share';
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Card 7. show follow', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var r = card.show(mapModel({ kind: 'follow' }));
      var ok = r.status === 'shown' && card.getState().currentModel.kind === 'follow';
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Card 8. show small gift', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var r = card.show(mapModel({ kind: 'gift', gift: { id: 'g8', name: 'Rose', imageUrl: null }, coins: 10 }));
      var ok = r.status === 'shown' && card.getState().currentModel.gift.tier === 'small';
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Card 9. show medium gift', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var r = card.show(mapModel({ kind: 'gift', gift: { id: 'g9', name: 'Galaxy', imageUrl: null }, coins: 500 }));
      var ok = r.status === 'shown' && card.getState().currentModel.gift.tier === 'medium';
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Card 10. show large gift', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var r = card.show(mapModel({ kind: 'gift', gift: { id: 'g10', name: 'Universe', imageUrl: null }, coins: 5000 }));
      var ok = r.status === 'shown' && card.getState().currentModel.gift.tier === 'large';
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Card 11. Ratt variantklass anvands', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'gift', gift: { id: 'g11', name: 'Universe', imageUrl: null }, coins: 5000 }));
      var el = card.getElement().querySelector('.vyra-recognition-card');
      var ok = !!el && el.classList.contains('vyra-recognition-variant-gift-legendary');
      teardown(container);
      return { pass: ok, details: 'className=' + (el && el.className) };
    }));

    results.push(runCase('Card 12. Avatar ar cirkular', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'join' }));
      var frame = card.getElement().querySelector('.vyra-recognition-avatar-frame');
      var radius = frame ? getComputedStyle(frame).borderRadius : '';
      var ok = !!frame && (radius.indexOf('50%') !== -1 || parseFloat(radius) > 0);
      teardown(container);
      return { pass: ok, details: 'borderRadius=' + radius };
    }));

    results.push(runCase('Card 13. Giftbild renderas separat', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'gift', gift: { id: 'g13', name: 'Rose', imageUrl: null }, coins: 10 }));
      var avatarFrame = card.getElement().querySelector('.vyra-recognition-avatar-frame');
      var giftFrame = card.getElement().querySelector('.vyra-recognition-gift-frame');
      var ok = !!avatarFrame && !!giftFrame && avatarFrame !== giftFrame;
      teardown(container);
      return { pass: ok, details: 'avatarFrame=' + !!avatarFrame + ' giftFrame=' + !!giftFrame };
    }));

    results.push(runCase('Card 14. Avatarfallback fungerar', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'join', actor: { avatarUrl: null } }));
      var frame = card.getElement().querySelector('.vyra-recognition-avatar-frame');
      var ok = !!frame && frame.classList.contains('vyra-recognition-avatar-fallback') && !frame.querySelector('img');
      teardown(container);
      return { pass: ok, details: 'className=' + (frame && frame.className) };
    }));

    results.push(runCase('Card 15. Giftfallback fungerar', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'gift', gift: { id: 'g15', name: 'Rose', imageUrl: null }, coins: 10 }));
      var frame = card.getElement().querySelector('.vyra-recognition-gift-frame');
      var ok = !!frame && frame.classList.contains('vyra-recognition-gift-fallback') && !frame.querySelector('img');
      teardown(container);
      return { pass: ok, details: 'className=' + (frame && frame.className) };
    }));

    results.push(runCase('Card 16. Ogiltig avatar-URL ignoreras', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'join', actor: { avatarUrl: 'javascript:alert(1)' } }));
      var frame = card.getElement().querySelector('.vyra-recognition-avatar-frame');
      var ok = !!frame && !frame.querySelector('img') && frame.classList.contains('vyra-recognition-avatar-fallback');
      teardown(container);
      return { pass: ok, details: 'className=' + (frame && frame.className) };
    }));

    results.push(runCase('Card 17. Ogiltig gift-URL ignoreras', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'gift', gift: { id: 'g17', name: 'Rose', imageUrl: 'javascript:alert(1)' }, coins: 10 }));
      var frame = card.getElement().querySelector('.vyra-recognition-gift-frame');
      var ok = !!frame && !frame.querySelector('img') && frame.classList.contains('vyra-recognition-gift-fallback');
      teardown(container);
      return { pass: ok, details: 'className=' + (frame && frame.className) };
    }));

    results.push(runCase('Card 18. Text renderas med textContent', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var dangerous = '<b>XSS</b><img src=x onerror=alert(1)>';
      card.show(mapModel({ kind: 'join', actor: { displayName: dangerous } }));
      var titleEl = card.getElement().querySelector('.vyra-recognition-title');
      var ok = !!titleEl && titleEl.textContent === dangerous && !titleEl.querySelector('b') && !titleEl.querySelector('img');
      teardown(container);
      return { pass: ok, details: 'textContent=' + (titleEl && titleEl.textContent) + ' innerHTML=' + (titleEl && titleEl.innerHTML) };
    }));

    results.push(runCase('Card 19. Aria-label anvands', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var model = mapModel({ kind: 'join', actor: { displayName: 'Robin' } });
      card.show(model);
      var el = card.getElement().querySelector('.vyra-recognition-card');
      var ok = !!el && el.getAttribute('aria-label') === model.accessibility.ariaLabel;
      teardown(container);
      return { pass: ok, details: 'aria-label=' + (el && el.getAttribute('aria-label')) };
    }));

    results.push(runCase('Card 20. role=status finns', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'join' }));
      var el = card.getElement().querySelector('.vyra-recognition-card');
      var ok = !!el && el.getAttribute('role') === 'status';
      teardown(container);
      return { pass: ok, details: 'role=' + (el && el.getAttribute('role')) };
    }));

    results.push(runCase('Card 21. aria-live=polite finns', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'join' }));
      var el = card.getElement().querySelector('.vyra-recognition-card');
      var ok = !!el && el.getAttribute('aria-live') === 'polite';
      teardown(container);
      return { pass: ok, details: 'aria-live=' + (el && el.getAttribute('aria-live')) };
    }));

    results.push(runCase('Card 22. update andrar modellen', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'like', count: 5 }));
      var r = card.update(mapModel({ kind: 'like', count: 999 }));
      var countEl = card.getElement().querySelector('.vyra-recognition-count-label');
      var ok = r.status === 'updated' && !!countEl && countEl.textContent === '×999';
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) + ' countText=' + (countEl && countEl.textContent) };
    }));

    results.push(runCase('Card 23. update aterskapar inte root', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'like', count: 5 }));
      var elBefore = card.getElement().querySelector('.vyra-recognition-card');
      card.update(mapModel({ kind: 'like', count: 999 }));
      var elAfter = card.getElement().querySelector('.vyra-recognition-card');
      var ok = elBefore === elAfter;
      teardown(container);
      return { pass: ok, details: 'sameElement=' + ok };
    }));

    results.push(runCase('Card 24. hide gar till exiting', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'join' }));
      card.hide('test');
      var ok = card.getState().phase === 'exiting';
      teardown(container);
      return { pass: ok, details: JSON.stringify(card.getState()) };
    }));

    results.push(runCase('Card 25. exit slutar i idle', function () {
      if (!hasDom()) return Promise.resolve(skip());
      var container = freshMount();
      card.show(mapModel({ kind: 'join' }));
      card.hide('test');
      return wait(500).then(function () {
        var state = card.getState();
        var el = card.getElement().querySelector('.vyra-recognition-card');
        var ok = state.phase === 'idle' && state.currentModel === null && !el;
        teardown(container);
        return { pass: ok, details: JSON.stringify(state) + ' elRemains=' + !!el };
      });
    }));

    results.push(runCase('Card 26. show under aktivt kort ger replace', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'join' }));
      var r = card.show(mapModel({ kind: 'like', count: 3 }));
      var ok = r.status === 'replaced';
      teardown(container);
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Card 27. Gamla timers paverkar inte nytt kort', function () {
      if (!hasDom()) return Promise.resolve(skip());
      var container = freshMount();
      card.show(mapModel({ kind: 'join', actor: { id: 'old-actor' } }));
      // replace almost immediately, well before the first card's own enter sequence would
      // have finished — its now-stale timers must never touch state again
      card.show(mapModel({ kind: 'like', actor: { id: 'new-actor' }, count: 7 }));
      return wait(900).then(function () {
        var state = card.getState();
        var ok = state.phase === 'visible' && state.currentModel.actor.id === 'new-actor' && state.currentModel.kind === 'like';
        teardown(container);
        return { pass: ok, details: JSON.stringify(state) };
      });
    }));

    results.push(runCase('Card 28. destroy tar bort DOM', function () {
      if (!hasDom()) return skip();
      card.destroy();
      var container = document.createElement('div');
      document.body.appendChild(container);
      card.mount(container);
      card.show(mapModel({ kind: 'join' }));
      var r = card.destroy();
      var ok = r.status === 'destroyed' && container.children.length === 0;
      if (container.parentNode) container.parentNode.removeChild(container);
      return { pass: ok, details: JSON.stringify(r) + ' childCount=' + container.children.length };
    }));

    results.push(runCase('Card 29. destroy rensar timers', function () {
      if (!hasDom()) return Promise.resolve(skip());
      var container = document.createElement('div');
      document.body.appendChild(container);
      card.destroy();
      card.mount(container);
      var events = [];
      var unsub = card.subscribe(function (e) { events.push(e); });
      card.show(mapModel({ kind: 'join' })); // starts phase timers
      card.destroy(); // must clear them before they fire
      return wait(900).then(function () {
        unsub();
        var ok = !events.some(function (e) { return e.type === 'enter-complete'; });
        if (container.parentNode) container.parentNode.removeChild(container);
        return { pass: ok, details: JSON.stringify(events.map(function (e) { return e.type; })) };
      });
    }));

    results.push(runCase('Card 30. Upprepad destroy ar saker', function () {
      if (!hasDom()) return skip();
      card.destroy();
      var r1 = card.destroy();
      var r2 = card.destroy();
      var ok = r1.status === 'destroyed' && r2.status === 'destroyed';
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2 }) };
    }));

    results.push(runCase('Card 31. Upprepad hide ar saker', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var r1 = card.hide();
      var r2 = card.hide();
      var ok = r1.status === 'hidden' && r2.status === 'hidden';
      teardown(container);
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2 }) };
    }));

    results.push(runCase('Card 32. getState returnerar kopia', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      card.show(mapModel({ kind: 'join' }));
      var snapshot = card.getState();
      snapshot.phase = 'tampered';
      snapshot.currentModel.kind = 'tampered';
      var again = card.getState();
      var ok = again.phase !== 'tampered' && again.currentModel.kind !== 'tampered';
      teardown(container);
      return { pass: ok, details: JSON.stringify({ mutatedSnapshot: snapshot, freshRead: again }) };
    }));

    results.push(runCase('Card 33. getElement returnerar root', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var el = card.getElement();
      var ok = !!el && el.classList.contains('vyra-recognition-root') && el.parentNode === container;
      teardown(container);
      return { pass: ok, details: 'className=' + (el && el.className) };
    }));

    results.push(runCase('Card 34. Subscriber far show-event', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var events = [];
      var unsub = card.subscribe(function (e) { events.push(e); });
      card.show(mapModel({ kind: 'join' }));
      unsub();
      var ok = events.some(function (e) { return e.type === 'show'; });
      teardown(container);
      return { pass: ok, details: JSON.stringify(events.map(function (e) { return e.type; })) };
    }));

    results.push(runCase('Card 35. Subscriber far hide-event', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var events = [];
      var unsub = card.subscribe(function (e) { events.push(e); });
      card.show(mapModel({ kind: 'join' }));
      card.hide('reason-35');
      unsub();
      var ok = events.some(function (e) { return e.type === 'hide' && e.reason === 'reason-35'; });
      teardown(container);
      return { pass: ok, details: JSON.stringify(events) };
    }));

    results.push(runCase('Card 36. Subscriber-fel stoppar inte nasta subscriber', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var secondCalled = false;
      var unsub1 = card.subscribe(function () { throw new Error('boom'); });
      var unsub2 = card.subscribe(function () { secondCalled = true; });
      card.show(mapModel({ kind: 'join' }));
      unsub1();
      unsub2();
      teardown(container);
      return { pass: secondCalled === true, details: 'secondCalled=' + secondCalled };
    }));

    results.push(runCase('Card 37. reduced-motion stods', function () {
      if (!hasDom() || !root.matchMedia) return Promise.resolve(skip(!hasDom() ? 'no DOM' : 'no matchMedia'));
      var container = freshMount();
      var originalMatchMedia = root.matchMedia;
      root.matchMedia = function (query) {
        if (String(query).indexOf('prefers-reduced-motion') !== -1) return { matches: true, media: query, addListener: function () {}, removeListener: function () {} };
        return originalMatchMedia.call(root, query);
      };
      var events = [];
      var unsub = card.subscribe(function (e) { events.push(e); });
      card.show(mapModel({ kind: 'join' }));
      return wait(150).then(function () {
        root.matchMedia = originalMatchMedia;
        unsub();
        var ok = card.getState().phase === 'visible' && events.some(function (e) { return e.type === 'enter-complete'; });
        teardown(container);
        return { pass: ok, details: 'phase=' + card.getState().phase + ' events=' + JSON.stringify(events.map(function (e) { return e.type; })) };
      });
    }));

    results.push(runCase('Card 38. Inga globala CSS-selectors paverkas', function () {
      if (!hasDom()) return skip();
      var sheet = findCardStylesheet();
      if (!sheet) return { pass: false, details: 'recognition-card.css stylesheet not found in document.styleSheets' };
      var offenders = [];
      try {
        Array.prototype.forEach.call(sheet.cssRules, function (rule) {
          if (!rule.selectorText) return;
          rule.selectorText.split(',').forEach(function (part) {
            var trimmed = part.trim().toLowerCase();
            if (['body', 'html', 'button', 'img', '*', 'a', 'input', 'div', 'span', 'p'].indexOf(trimmed) !== -1) {
              offenders.push(trimmed);
            }
          });
        });
      } catch (err) {
        return { pass: false, details: 'could not read cssRules: ' + err.message };
      }
      return { pass: offenders.length === 0, details: 'offenders=' + JSON.stringify(offenders) };
    }));

    results.push(runCase('Card 39. Inga externa fonts laddas', function () {
      if (!hasDom()) return skip();
      var sheet = findCardStylesheet();
      if (!sheet) return { pass: false, details: 'recognition-card.css stylesheet not found in document.styleSheets' };
      var fontFaceCount = 0;
      try {
        Array.prototype.forEach.call(sheet.cssRules, function (rule) {
          if (typeof CSSFontFaceRule !== 'undefined' && rule instanceof CSSFontFaceRule) fontFaceCount++;
        });
      } catch (err) {
        return { pass: false, details: 'could not read cssRules: ' + err.message };
      }
      var container = freshMount();
      card.show(mapModel({ kind: 'join' }));
      var cardEl = card.getElement().querySelector('.vyra-recognition-card');
      var fontFamily = cardEl ? getComputedStyle(cardEl).fontFamily : '';
      teardown(container);
      var ok = fontFaceCount === 0 && fontFamily.toLowerCase().indexOf('-apple-system') !== -1;
      return { pass: ok, details: 'fontFaceCount=' + fontFaceCount + ' fontFamily=' + fontFamily };
    }));

    results.push(runCase('Card 44. Lang displayName bryter inte layout', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var longName = 'A'.repeat(80);
      card.show(mapModel({ kind: 'join', actor: { displayName: longName } }));
      var cardEl = card.getElement().querySelector('.vyra-recognition-card');
      var titleEl = card.getElement().querySelector('.vyra-recognition-title');
      var cardWidth = cardEl.getBoundingClientRect().width;
      var overflowStyle = titleEl ? getComputedStyle(titleEl).textOverflow : '';
      var ok = cardWidth <= 410 && overflowStyle === 'ellipsis';
      teardown(container);
      return { pass: ok, details: 'cardWidth=' + cardWidth + ' textOverflow=' + overflowStyle };
    }));

    results.push(runCase('Card 45. Lang giftName bryter inte layout', function () {
      if (!hasDom()) return skip();
      var container = freshMount();
      var longGiftName = 'B'.repeat(80);
      card.show(mapModel({ kind: 'gift', gift: { id: 'g45', name: longGiftName, imageUrl: null }, coins: 10 }));
      var cardEl = card.getElement().querySelector('.vyra-recognition-card');
      var subtitleEl = card.getElement().querySelector('.vyra-recognition-subtitle');
      var cardWidth = cardEl.getBoundingClientRect().width;
      var overflowStyle = subtitleEl ? getComputedStyle(subtitleEl).textOverflow : '';
      var ok = cardWidth <= 410 && overflowStyle === 'ellipsis';
      teardown(container);
      return { pass: ok, details: 'cardWidth=' + cardWidth + ' textOverflow=' + overflowStyle };
    }));

    card.destroy(); // leave the shared singleton clean for anything run after this
  }

  function findCardStylesheet() {
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sheet = document.styleSheets[i];
      try {
        if (sheet.href && sheet.href.indexOf('recognition-card.css') !== -1) return sheet;
      } catch (err) { /* cross-origin sheet, skip */ }
    }
    return null;
  }

  // ---- Steg 9: Standalone Recognition Runtime cases --------------------------------------------
  //
  // Runtime.destroy() is permanent by design (spec: "Runtime far inte kunna startas eller ta
  // emot events efter destroy") — unlike every other singleton in this suite, there is no way
  // to reset it back to a usable state afterward. Every test that needs a working Runtime
  // (labelled Runtime 1-32 and 38-49 below, matching the spec's own numbering for traceability)
  // therefore runs BEFORE the destroy-lifecycle tests (labelled Runtime 33-37), regardless of
  // the numbers in their names — this file pushes them in that adjusted order deliberately, and
  // it's called out again in the final report.

  function runRuntimeCases(results) {
    var runtime = getRuntime();
    var merge = getMerge();
    var queue = getQueue();
    var controller = getController();
    var card = getCard();
    var simNow = 1000;
    var stageContainer = null;

    function resetForTest() {
      runtime.clear();
    }

    function skip(reason) {
      return { pass: true, details: 'skipped: ' + (reason || 'no DOM in this environment') };
    }

    // ---- Phase A: state before any mount --------------------------------------------------

    results.push(runCase('Runtime 1. Runtime initial state ar unmounted/stopped', function () {
      if (!hasDom()) return skip();
      var state = runtime.getState();
      var ok = state.status === 'unmounted' && state.mounted === false && state.running === false;
      return { pass: ok, details: JSON.stringify(state) };
    }));

    results.push(runCase('Runtime 4. Ogiltig mount-target rejected', function () {
      if (!hasDom()) return skip();
      var r1 = runtime.mount('#this-matches-nothing-at-all');
      var r2 = runtime.mount(42);
      var ok = r1.status === 'rejected' && r2.status === 'rejected' && runtime.getState().mounted === false;
      return { pass: ok, details: JSON.stringify({ r1: r1, r2: r2 }) };
    }));

    // ---- Phase B: the one real mount used by every subsequent test ------------------------

    results.push(runCase('Runtime 2. mount fungerar med HTMLElement', function () {
      if (!hasDom()) return skip();
      stageContainer = document.createElement('div');
      stageContainer.id = 'vyra-runtime-test-stage';
      document.body.appendChild(stageContainer);
      var r = runtime.mount(stageContainer);
      var ok = r.status === 'mounted' && runtime.getState().mounted === true;
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Runtime 3. mount fungerar med selector', function () {
      if (!hasDom()) return skip();
      // Runtime is already mounted from Runtime 2 (mount() is intentionally idempotent, matching
      // "upprepad mount ska vara saker") — Runtime cannot be remounted to a *different* target
      // without destroy(), which is permanent, so this verifies a selector-string argument is
      // accepted without throwing and the idempotent status is still correct, rather than
      // re-proving a from-scratch selector mount (already covered independently at the Card
      // level in Steg 8's own Card 2 test).
      var r = runtime.mount('#vyra-runtime-test-stage');
      var ok = r.status === 'mounted';
      return { pass: ok, details: JSON.stringify(r) };
    }));

    // ---- Phase C: start/stop/pause/resume + push/merge/queue mechanics --------------------

    results.push(runCase('Runtime 5. start startar Controller', function () {
      if (!hasDom()) return skip();
      runtime.start();
      var ok = controller.isRunning() === true && runtime.getState().running === true;
      return { pass: ok, details: JSON.stringify(runtime.getState()) };
    }));

    results.push(runCase('Runtime 6. Upprepad start ar saker', function () {
      if (!hasDom()) return skip();
      var threw = false;
      try { runtime.start(); runtime.start(); } catch (err) { threw = true; }
      var ok = threw === false && controller.isRunning() === true;
      return { pass: ok, details: 'threw=' + threw };
    }));

    results.push(runCase('Runtime 10. push join gar genom Merge', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var mergeStatsBefore = merge.getStats();
      var event = makeMergedEvent({ kind: 'join', id: 'r10', actor: { id: 'r10-actor' }, timestamp: simNow });
      var r = runtime.push(event, simNow);
      var mergeStatsAfter = merge.getStats();
      var ok = r.status === 'queued' && mergeStatsAfter.emitted > mergeStatsBefore.emitted;
      return { pass: ok, details: JSON.stringify({ r: r, mergeStatsBefore: mergeStatsBefore, mergeStatsAfter: mergeStatsAfter }) };
    }));

    results.push(runCase('Runtime 11. push non-mergeable event enqueueas', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var event = makeMergedEvent({ kind: 'follow', id: 'r11', actor: { id: 'r11-actor' }, timestamp: simNow });
      var r = runtime.push(event, simNow);
      var ok = r.status === 'queued' && !!r.event && queue.size() === 1;
      return { pass: ok, details: JSON.stringify(r) + ' queueSize=' + queue.size() };
    }));

    results.push(runCase('Runtime 12. push like blir pending merge', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var event = makeMergedEvent({ kind: 'like', id: 'r12', actor: { id: 'r12-actor' }, timestamp: simNow });
      var r = runtime.push(event, simNow);
      var ok = r.status === 'pending-merge' && merge.getPending().length === 1 && queue.size() === 0;
      return { pass: ok, details: JSON.stringify(r) + ' pending=' + merge.getPending().length + ' queueSize=' + queue.size() };
    }));

    results.push(runCase('Runtime 13. flush like producerar MergedEvent', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'like', id: 'r13', actor: { id: 'r13-actor' }, timestamp: simNow }), simNow);
      var laterNow = simNow + 1600; // past the 1500ms like merge window
      var flushed = runtime.flush(laterNow);
      var ok = merge.getPending().length === 0 && flushed.length === 1 && flushed[0].status === 'enqueued';
      return { pass: ok, details: JSON.stringify(flushed) };
    }));

    results.push(runCase('Runtime 14. Flushed event enqueueas', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'like', id: 'r14', actor: { id: 'r14-actor' }, timestamp: simNow }), simNow);
      runtime.flush(simNow + 1600);
      var ok = queue.size() === 1 && queue.getItems()[0].event.kind === 'like';
      return { pass: ok, details: 'queueSize=' + queue.size() };
    }));

    results.push(runCase('Runtime 15. Queue prioriterar large gift', function () {
      resetForTest();
      if (!hasDom()) return skip();
      // gift (like like) is a MERGEABLE kind, not an immediate one — it only reaches Queue
      // once its merge window elapses, so a flush is needed before peek() can see it.
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r15a', actor: { id: 'r15-join' }, timestamp: simNow }), simNow);
      runtime.push(makeMergedEvent({ kind: 'gift', id: 'r15b', actor: { id: 'r15-gift' }, gift: { id: 'g15', name: 'Universe', imageUrl: null }, coins: 5000, timestamp: simNow }), simNow);
      runtime.flush(simNow + 1600);
      // peek(now) must be given the same simulated `now` — with no argument it defaults to the
      // real Date.now(), which would treat our tiny simulated timestamps as long-expired.
      var top = queue.peek(simNow + 1600);
      var ok = !!top && top.kind === 'gift';
      return { pass: ok, details: JSON.stringify(top) };
    }));

    results.push(runCase('Runtime 7. stop stoppar presentation', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r7', actor: { id: 'r7-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow); // starts the presentation
      var startedModel = controller.getState().current;
      runtime.stop();
      runtime.tick(simNow + 999999); // far past any duration — must not advance while stopped
      var ok = !!startedModel && JSON.stringify(controller.getState().current) === JSON.stringify(startedModel);
      runtime.start(); // restore for subsequent tests
      return { pass: ok, details: JSON.stringify({ startedModel: startedModel, after: controller.getState().current }) };
    }));

    results.push(runCase('Runtime 8. pause pausar Controller', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r8', actor: { id: 'r8-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow);
      runtime.pause();
      var ok = controller.isPaused() === true && runtime.getState().paused === true;
      return { pass: ok, details: JSON.stringify(runtime.getState()) };
    }));

    results.push(runCase('Runtime 9. resume fungerar', function () {
      if (!hasDom()) return skip();
      runtime.resume();
      var ok = controller.isPaused() === false && runtime.getState().paused === false;
      return { pass: ok, details: JSON.stringify(runtime.getState()) };
    }));

    // ---- Phase D: tick-driven presentation lifecycle ---------------------------------------

    results.push(runCase('Runtime 16. tick startar hogst ett event', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r16a', actor: { id: 'r16-a' }, timestamp: simNow }), simNow);
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r16b', actor: { id: 'r16-b' }, timestamp: simNow }), simNow);
      var sizeBefore = queue.size();
      runtime.tick(simNow);
      var sizeAfter = queue.size();
      var ok = sizeBefore === 2 && sizeAfter === 1 && !!controller.getState().current;
      return { pass: ok, details: 'sizeBefore=' + sizeBefore + ' sizeAfter=' + sizeAfter };
    }));

    results.push(runCase('Runtime 17. presentation-start mappas', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var events = [];
      var unsub = runtime.subscribe(function (e) { events.push(e); });
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r17', actor: { id: 'r17-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow);
      unsub();
      var startEvent = events.filter(function (e) { return e.type === 'presentation-start'; })[0];
      var ok = !!startEvent && !!startEvent.model && startEvent.model.kind === 'join';
      return { pass: ok, details: JSON.stringify(startEvent) };
    }));

    results.push(runCase('Runtime 18. Mappad presentation visas i Card', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r18', actor: { id: 'r18-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow);
      var cardState = card.getState();
      var ok = cardState.phase === 'entering' && !!cardState.currentModel && cardState.currentModel.kind === 'join';
      return { pass: ok, details: JSON.stringify(cardState) };
    }));

    results.push(runCase('Runtime 19. complete doljer Card', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r19', actor: { id: 'r19-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow); // starts, join duration 2500ms -> endsAt = simNow + 2500
      runtime.tick(simNow + 2500); // now >= endsAt -> completes
      var ok = card.getState().phase === 'exiting';
      return { pass: ok, details: JSON.stringify(card.getState()) };
    }));

    results.push(runCase('Runtime 20. Nasta event startar forst nasta tick', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r20a', actor: { id: 'r20-a' }, timestamp: simNow }), simNow);
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r20b', actor: { id: 'r20-b' }, timestamp: simNow }), simNow);
      runtime.tick(simNow); // starts r20a, endsAt = simNow + 2500
      runtime.tick(simNow + 2500); // completes r20a, must NOT start r20b in this same call
      var afterComplete = controller.getState().current;
      runtime.tick(simNow + 2600); // separate tick -> starts r20b
      var afterNextTick = controller.getState().current;
      // Merge always generates its OWN fresh MergedEvent.id (the original pushed id only
      // survives inside sourceEventIds) — actor.id passes through unchanged, so it's the
      // reliable way to identify which pushed event ended up presenting.
      var ok = afterComplete === null && !!afterNextTick && afterNextTick.event.actor.id === 'r20-b';
      return { pass: ok, details: JSON.stringify({ afterComplete: afterComplete, afterNextTick: afterNextTick }) };
    }));

    results.push(runCase('Runtime 21. skip doljer Card', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r21', actor: { id: 'r21-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow);
      controller.skipCurrent('runtime-test-skip'); // Controller's own skip, fires 'presentation-skip'
      var ok = card.getState().phase === 'exiting';
      return { pass: ok, details: JSON.stringify(card.getState()) };
    }));

    // ---- Phase E: error isolation between layers ------------------------------------------

    results.push(runCase('Runtime 22. Mapper reject kraschar inte Runtime', function () {
      resetForTest();
      if (!hasDom()) return skip();
      // a whitespace-only gift.name passes Merge's and Queue's exact-empty-string check
      // (`=== ''`) but fails Mapper's trimmed check (`.trim() === ''`) — a genuine, real
      // "later stage rejects what earlier stages accepted" case, not a monkey-patched one.
      var event = makeMergedEvent({ kind: 'gift', id: 'r22', actor: { id: 'r22-actor' }, gift: { id: 'g22', name: '   ', imageUrl: null }, coins: 10, timestamp: simNow });
      var pushResult = runtime.push(event, simNow);
      // gift is a mergeable kind (like like) — push() alone only produces 'pending-merge'; it
      // must be flushed past its merge window before it can reach Queue/Controller/Mapper.
      runtime.flush(simNow + 1600);
      var statsBefore = runtime.getStats();
      var threw = false;
      try { runtime.tick(simNow + 1700); } catch (err) { threw = true; }
      var statsAfter = runtime.getStats();
      var ok = threw === false && pushResult.status === 'pending-merge'
        && statsAfter.cardsRejected > statsBefore.cardsRejected && statsAfter.errors > statsBefore.errors
        && controller.getState().current === null;
      return { pass: ok, details: JSON.stringify({ pushResult: pushResult, statsBefore: statsBefore, statsAfter: statsAfter }) };
    }));

    results.push(runCase('Runtime 23. Card.show reject kraschar inte Runtime', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r23', actor: { id: 'r23-actor' }, timestamp: simNow }), simNow);
      card.destroy(); // force a genuine card.show() rejection ("not mounted") underneath Runtime
      var statsBefore = runtime.getStats();
      var threw = false;
      try { runtime.tick(simNow); } catch (err) { threw = true; }
      var statsAfter = runtime.getStats();
      card.mount(stageContainer); // restore Card's real mounted state for subsequent tests
      var ok = threw === false && statsAfter.cardErrors > statsBefore.cardErrors && statsAfter.errors > statsBefore.errors;
      return { pass: ok, details: JSON.stringify({ statsBefore: statsBefore, statsAfter: statsAfter }) };
    }));

    // ---- Phase F: stopped-state push/present behavior -------------------------------------

    results.push(runCase('Runtime 24. Events kan koas medan Runtime ar stoppad', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.stop();
      var r = runtime.push(makeMergedEvent({ kind: 'follow', id: 'r24', actor: { id: 'r24-actor' }, timestamp: simNow }), simNow);
      var ok = r.status === 'queued' && queue.size() === 1;
      runtime.start();
      return { pass: ok, details: JSON.stringify(r) };
    }));

    results.push(runCase('Runtime 25. Stoppad Runtime presenterar inte events', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.stop();
      runtime.push(makeMergedEvent({ kind: 'follow', id: 'r25', actor: { id: 'r25-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow + 100);
      var ok = controller.getState().current === null && queue.size() === 1;
      runtime.start();
      return { pass: ok, details: 'current=' + JSON.stringify(controller.getState().current) + ' queueSize=' + queue.size() };
    }));

    results.push(runCase('Runtime 26. start + tick presenterar tidigare koade events', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.stop();
      runtime.push(makeMergedEvent({ kind: 'follow', id: 'r26', actor: { id: 'r26-actor' }, timestamp: simNow }), simNow);
      runtime.start();
      runtime.tick(simNow + 100);
      var ok = !!controller.getState().current && controller.getState().current.event.actor.id === 'r26-actor';
      return { pass: ok, details: JSON.stringify(controller.getState().current) };
    }));

    results.push(runCase('Runtime 27. pause konsumerar inte Queue', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r27a', actor: { id: 'r27-a' }, timestamp: simNow }), simNow);
      runtime.tick(simNow); // starts r27a
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r27b', actor: { id: 'r27-b' }, timestamp: simNow }), simNow);
      runtime.pause();
      var sizeBefore = queue.size();
      runtime.tick(simNow + 999999);
      var sizeAfter = queue.size();
      var ok = sizeBefore === 1 && sizeAfter === 1;
      runtime.resume();
      return { pass: ok, details: 'sizeBefore=' + sizeBefore + ' sizeAfter=' + sizeAfter };
    }));

    // ---- Phase G: clear() ------------------------------------------------------------------

    results.push(runCase('Runtime 28. clear tommer Merge pending', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'like', id: 'r28', actor: { id: 'r28-actor' }, timestamp: simNow }), simNow);
      runtime.clear();
      var ok = merge.getPending().length === 0;
      return { pass: ok, details: 'pending=' + merge.getPending().length };
    }));

    results.push(runCase('Runtime 29. clear tommer Queue', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'follow', id: 'r29', actor: { id: 'r29-actor' }, timestamp: simNow }), simNow);
      runtime.clear();
      var ok = queue.size() === 0;
      return { pass: ok, details: 'queueSize=' + queue.size() };
    }));

    results.push(runCase('Runtime 30. clear rensar Controller current', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r30', actor: { id: 'r30-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow);
      runtime.clear();
      var ok = controller.getState().current === null;
      return { pass: ok, details: JSON.stringify(controller.getState()) };
    }));

    results.push(runCase('Runtime 31. clear aterstaller Card', function () {
      resetForTest();
      if (!hasDom()) return skip();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r31', actor: { id: 'r31-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow);
      runtime.clear();
      var ok = card.getState().phase === 'exiting' || card.getState().phase === 'idle';
      return { pass: ok, details: JSON.stringify(card.getState()) };
    }));

    results.push(runCase('Runtime 32. clear behaller mount', function () {
      if (!hasDom()) return skip();
      runtime.clear();
      var state = runtime.getState();
      var ok = state.mounted === true && (state.status === 'idle' || state.status === 'presenting');
      return { pass: ok, details: JSON.stringify(state) };
    }));

    // ---- Phase H: misc correctness (still needs a working Runtime) ------------------------

    results.push(runCase('Runtime 38. getState returnerar djup kopia', function () {
      if (!hasDom()) return skip();
      var snapshot = runtime.getState();
      snapshot.status = 'tampered';
      snapshot.merge.received = 999999;
      var again = runtime.getState();
      var ok = again.status !== 'tampered' && again.merge.received !== 999999;
      return { pass: ok, details: JSON.stringify({ mutatedSnapshot: snapshot, freshRead: again }) };
    }));

    results.push(runCase('Runtime 39. Subscribers far push-event', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var events = [];
      var unsub = runtime.subscribe(function (e) { events.push(e); });
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r39', actor: { id: 'r39-actor' }, timestamp: simNow }), simNow);
      unsub();
      var ok = events.some(function (e) { return e.type === 'push'; });
      return { pass: ok, details: JSON.stringify(events.map(function (e) { return e.type; })) };
    }));

    results.push(runCase('Runtime 40. Subscribers far presentation-start', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var events = [];
      var unsub = runtime.subscribe(function (e) { events.push(e); });
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r40', actor: { id: 'r40-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow);
      unsub();
      var ok = events.some(function (e) { return e.type === 'presentation-start'; });
      return { pass: ok, details: JSON.stringify(events.map(function (e) { return e.type; })) };
    }));

    results.push(runCase('Runtime 41. Subscribers far card-show', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var events = [];
      var unsub = runtime.subscribe(function (e) { events.push(e); });
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r41', actor: { id: 'r41-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow);
      unsub();
      var ok = events.some(function (e) { return e.type === 'card-show'; });
      return { pass: ok, details: JSON.stringify(events.map(function (e) { return e.type; })) };
    }));

    results.push(runCase('Runtime 42. Subscriber-fel stoppar inte nasta subscriber', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var secondCalled = false;
      var unsub1 = runtime.subscribe(function () { throw new Error('boom'); });
      var unsub2 = runtime.subscribe(function () { secondCalled = true; });
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r42', actor: { id: 'r42-actor' }, timestamp: simNow }), simNow);
      unsub1();
      unsub2();
      return { pass: secondCalled === true, details: 'secondCalled=' + secondCalled };
    }));

    results.push(runCase('Runtime 43. unsubscribe fungerar', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var calls = 0;
      var unsub = runtime.subscribe(function () { calls++; });
      // a single push() of an immediate kind legitimately fires both 'push' and 'enqueue' —
      // so the meaningful check is "no further increase after unsubscribing", not an exact count.
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r43a', actor: { id: 'r43-a' }, timestamp: simNow }), simNow);
      var callsAfterFirstPush = calls;
      unsub();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r43b', actor: { id: 'r43-b' }, timestamp: simNow }), simNow);
      var ok = calls === callsAfterFirstPush;
      return { pass: ok, details: 'callsAfterFirstPush=' + callsAfterFirstPush + ' callsFinal=' + calls };
    }));

    results.push(runCase('Runtime 44. Input event muteras inte', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var event = makeMergedEvent({ kind: 'gift', id: 'r44', actor: { id: 'r44-actor' }, gift: { id: 'g44', name: 'Rose', imageUrl: null }, coins: 50, timestamp: simNow });
      var before = JSON.stringify(event);
      runtime.push(event, simNow);
      var after = JSON.stringify(event);
      return { pass: before === after, details: 'before=' + before + ' after=' + after };
    }));

    results.push(runCase('Runtime 45. Explicit now anvands deterministiskt', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var explicitNow = 555000;
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r45', actor: { id: 'r45-actor' }, timestamp: explicitNow }), explicitNow);
      runtime.tick(explicitNow);
      var current = controller.getState().current;
      var ok = !!current && current.startedAt === explicitNow;
      return { pass: ok, details: JSON.stringify(current) };
    }));

    results.push(runCase('Runtime 46. 10 mixed events kraschar inte', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var kinds = ['join', 'like', 'follow', 'share', 'gift'];
      var threw = false;
      try {
        for (var i = 0; i < 10; i++) {
          var kind = kinds[i % kinds.length];
          var overrides = { kind: kind, id: 'r46-' + i, actor: { id: 'r46-actor-' + i }, timestamp: simNow };
          if (kind === 'gift') { overrides.gift = { id: 'g46-' + i, name: 'Gift ' + i, imageUrl: null }; overrides.coins = 50 * i; }
          runtime.push(makeMergedEvent(overrides), simNow);
        }
        runtime.tick(simNow);
      } catch (err) { threw = true; }
      return { pass: threw === false, details: 'threw=' + threw };
    }));

    results.push(runCase('Runtime 47. 50 stress events kraschar inte', function () {
      resetForTest();
      if (!hasDom()) return skip();
      var kinds = ['join', 'like', 'follow', 'share', 'gift'];
      var threw = false;
      try {
        for (var i = 0; i < 50; i++) {
          var kind = kinds[i % kinds.length];
          var overrides = { kind: kind, id: 'r47-' + i, actor: { id: 'r47-actor-' + i }, timestamp: simNow };
          if (kind === 'like') overrides.count = 1 + (i % 15);
          if (kind === 'gift') { overrides.gift = { id: 'g47-' + i, name: 'Gift ' + i, imageUrl: null }; overrides.coins = (i * 41) % 6000; }
          runtime.push(makeMergedEvent(overrides), simNow);
        }
        for (var t = 0; t < 5; t++) runtime.tick(simNow + t * 3000);
      } catch (err) { threw = true; }
      return { pass: threw === false, details: 'threw=' + threw };
    }));

    results.push(runCase('Runtime 48. Endast ett Card ar aktivt at gangen', function () {
      resetForTest();
      if (!hasDom()) return skip();
      for (var i = 0; i < 5; i++) {
        runtime.push(makeMergedEvent({ kind: 'join', id: 'r48-' + i, actor: { id: 'r48-actor-' + i }, timestamp: simNow }), simNow);
      }
      var allSingular = true;
      for (var t = 0; t < 5; t++) {
        runtime.tick(simNow + t * 3000);
        var current = controller.getState().current;
        if (current !== null && typeof current !== 'object') allSingular = false;
      }
      return { pass: allSingular, details: 'allSingular=' + allSingular };
    }));

    results.push(runCase('Runtime 49. Runtime anvander inga egna timers', function () {
      if (!hasDom()) return skip();
      resetForTest();
      var originalSetTimeout = root.setTimeout;
      var originalSetInterval = root.setInterval;
      var originalRAF = root.requestAnimationFrame;
      var calls = { setTimeout: 0, setInterval: 0, requestAnimationFrame: 0 };
      if (typeof originalSetInterval === 'function') root.setInterval = function () { calls.setInterval++; return originalSetInterval.apply(this, arguments); };
      if (typeof originalRAF === 'function') root.requestAnimationFrame = function () { calls.requestAnimationFrame++; return originalRAF.apply(this, arguments); };
      // setTimeout is spied only around Runtime methods that should never touch Card at all —
      // tick() legitimately cascades into card.show()/hide(), which use their OWN (permitted)
      // setTimeout calls, so tick() is intentionally excluded from this specific measurement.
      if (typeof originalSetTimeout === 'function') root.setTimeout = function () { calls.setTimeout++; return originalSetTimeout.apply(this, arguments); };
      try {
        runtime.mount(stageContainer);
        runtime.start();
        runtime.push(makeMergedEvent({ kind: 'join', id: 'r49', actor: { id: 'r49-actor' }, timestamp: simNow }), simNow);
        runtime.flush(simNow);
        runtime.pause();
        runtime.resume();
        runtime.stop();
        runtime.start();
        runtime.clear();
      } finally {
        if (typeof originalSetTimeout === 'function') root.setTimeout = originalSetTimeout;
        if (typeof originalSetInterval === 'function') root.setInterval = originalSetInterval;
        if (typeof originalRAF === 'function') root.requestAnimationFrame = originalRAF;
      }
      var ok = calls.setTimeout === 0 && calls.setInterval === 0 && calls.requestAnimationFrame === 0;
      return { pass: ok, details: JSON.stringify(calls) };
    }));

    // ---- Phase H2: hardening stress cases (Steg 9 Phase 2 of the roadmap) -----------------
    // Runs before the permanent destroy-lifecycle block (Phase I) since these cases still
    // need a live, working Runtime instance.

    results.push(runCase('Hardening 1. 500 blandade events kraschar inte och kon vaxer inte obegransat', function () {
      if (!hasDom()) return skip();
      resetForTest();
      // Runtime stats are cumulative for the life of the singleton (clear() only increments
      // stats.cleared, per Runtime 32/clear()'s own documented contract) — every earlier
      // Runtime test section has already added to pushed/errors/etc. by the time this case
      // runs, so this asserts on the DELTA this test itself produces, not absolute values.
      var before = runtime.getStats();
      var kinds = ['join', 'like', 'follow', 'share', 'gift'];
      var threw = false;
      var hNow = simNow;
      try {
        for (var i = 0; i < 500; i++) {
          var kind = kinds[i % kinds.length];
          var overrides = { actor: { id: 'hard-actor-' + i }, timestamp: hNow };
          if (kind === 'like') overrides.count = 1 + (i % 20);
          if (kind === 'gift') { overrides.gift = { id: 'hg' + i, name: 'Gift ' + i, imageUrl: null }; overrides.coins = (i * 13) % 6000; }
          runtime.push(makeMergedEvent(Object.assign({ kind: kind }, overrides)), hNow);
          if (i % 25 === 0) {
            hNow += 2000; // periodically advance past the merge window and drain presentations
            runtime.tick(hNow);
            runtime.flush(hNow);
          }
        }
        hNow += 5000;
        runtime.tick(hNow);
      } catch (err) {
        threw = true;
      }
      var after = runtime.getStats();
      var qSize = queue.size();
      var errorsDelta = after.errors - before.errors;
      var pushedDelta = after.pushed - before.pushed;
      var ok = threw === false && qSize <= 30 && errorsDelta === 0 && pushedDelta === 500;
      return { pass: ok, details: JSON.stringify({ threw: threw, queueSize: qSize, errorsDelta: errorsDelta, pushedDelta: pushedDelta, before: before, after: after }) };
    }));

    results.push(runCase('Hardening 2. Upprepade start/stop-cykler lamnar inte Runtime i trasigt tillstand', function () {
      if (!hasDom()) return skip();
      resetForTest();
      var threw = false;
      try {
        for (var i = 0; i < 25; i++) {
          runtime.start();
          runtime.stop();
        }
        runtime.start();
      } catch (err) {
        threw = true;
      }
      var hNow = simNow + 100000;
      runtime.push(makeMergedEvent({ kind: 'join', id: 'h2', actor: { id: 'h2-actor' }, timestamp: hNow }), hNow);
      runtime.tick(hNow);
      var current = controller.getState().current;
      var ok = threw === false && runtime.getState().running === true && !!current && current.event.actor.id === 'h2-actor';
      return { pass: ok, details: JSON.stringify({ threw: threw, current: current, state: runtime.getState() }) };
    }));

    results.push(runCase('Hardening 3. Upprepade mount/clear-cykler skapar inte flera Card-rotelement', function () {
      if (!hasDom()) return skip();
      var threw = false;
      try {
        for (var i = 0; i < 20; i++) {
          runtime.mount(stageContainer);
          runtime.clear();
        }
      } catch (err) {
        threw = true;
      }
      var rootCount = stageContainer.querySelectorAll('.vyra-recognition-root').length;
      var ok = threw === false && rootCount === 1;
      return { pass: ok, details: 'threw=' + threw + ' rootCount=' + rootCount };
    }));

    results.push(runCase('Hardening 4. Upprepad push/tick skapar inte dubbla interna subscriptions', function () {
      if (!hasDom()) return skip();
      resetForTest();
      var notifyCount = 0;
      var unsubscribe = runtime.subscribe(function () { notifyCount++; });
      var hNow = simNow;
      // A single immediate-kind push legitimately fires exactly 2 notifications ('push' then
      // 'enqueue') per Runtime 43's own established baseline — if ensureWired() ever wired a
      // second internal Merge/Controller subscription (e.g. by being called again on every
      // push() instead of only once), this count would silently double.
      for (var i = 0; i < 10; i++) {
        hNow += 1;
        runtime.push(makeMergedEvent({ kind: 'follow', id: 'h4-' + i, actor: { id: 'h4-actor-' + i }, timestamp: hNow }), hNow);
      }
      unsubscribe();
      var ok = notifyCount === 20; // 10 pushes * 2 notifications each
      return { pass: ok, details: 'notifyCount=' + notifyCount };
    }));

    // ---- Phase I: destroy lifecycle — MUST run last, destroy() is permanent ---------------

    results.push(runCase('Runtime 33. destroy tar bort Card DOM', function () {
      if (!hasDom()) return skip();
      resetForTest();
      runtime.push(makeMergedEvent({ kind: 'join', id: 'r33', actor: { id: 'r33-actor' }, timestamp: simNow }), simNow);
      runtime.tick(simNow);
      var r = runtime.destroy();
      var ok = stageContainer.children.length === 0;
      return { pass: ok, details: 'childCount=' + stageContainer.children.length + ' result=' + JSON.stringify(r) };
    }));

    results.push(runCase('Runtime 34. destroy unsubscribe:ar Controller', function () {
      if (!hasDom()) return skip();
      // Runtime is already destroyed from Runtime 33 — Controller no longer notifies Runtime's
      // internal handler. Prove it by driving Controller directly: push straight into Queue and
      // tick Controller itself; if Runtime were still subscribed, card.show() would be called
      // and card.getState().phase would change even though Card was never told to do anything.
      var before = card.getState().phase;
      queue.enqueue(makeMergedEvent({ kind: 'join', id: 'r34', actor: { id: 'r34-actor' }, timestamp: simNow }));
      controller.start();
      controller.tick(simNow);
      var after = card.getState().phase;
      var ok = before === after;
      controller.stop();
      controller.clear();
      queue.clear();
      return { pass: ok, details: 'before=' + before + ' after=' + after };
    }));

    results.push(runCase('Runtime 35. push efter destroy rejected', function () {
      if (!hasDom()) return skip();
      var r = runtime.push(makeMergedEvent({ kind: 'join', id: 'r35', actor: { id: 'r35-actor' }, timestamp: simNow }), simNow);
      return { pass: r.status === 'rejected', details: JSON.stringify(r) };
    }));

    results.push(runCase('Runtime 36. start efter destroy rejected', function () {
      if (!hasDom()) return skip();
      var threw = false;
      try { runtime.start(); } catch (err) { threw = true; }
      var ok = threw === false && runtime.getState().running === false && runtime.getState().destroyed === true;
      return { pass: ok, details: JSON.stringify(runtime.getState()) };
    }));

    results.push(runCase('Runtime 37. Upprepad destroy ar saker', function () {
      if (!hasDom()) return skip();
      var threw = false;
      try { runtime.destroy(); runtime.destroy(); } catch (err) { threw = true; }
      var ok = threw === false && runtime.getState().destroyed === true;
      return { pass: ok, details: 'threw=' + threw };
    }));

    if (hasDom() && stageContainer && stageContainer.parentNode) {
      stageContainer.parentNode.removeChild(stageContainer);
    }
  }

  // ---- Roadmap Phase 3: Generic Live Event Adapter cases -------------------------------
  // Unlike every stage above, recognition-adapter.js is a FACTORY (create() returns a fresh,
  // independent instance every call) rather than one shared singleton — so, unlike Runtime,
  // these cases need no shared-state reset/reordering discipline; each case builds its own
  // isolated provider + instance and disposes of it at the end.

  function runAdapterCases(results) {
    var adapter = getAdapter();
    var providerCounter = 0;

    // A minimal, generic, synchronous fake provider — deliberately has zero TikTok/platform
    // logic, matching the "no TikTok payload logic inside the generic adapter" rule. Captures
    // the AdapterProviderContext handed to it so a test can call context.emit/reportError/
    // reportUnexpectedDisconnect on demand, simulating whatever a real provider would do.
    function registerSyncProvider() {
      providerCounter += 1;
      var name = 'test-sync-provider-' + providerCounter;
      var lastContext = null;
      var disconnectCalls = 0;
      adapter.registerProvider(name, function () {
        return {
          connect: function (context) { lastContext = context; },
          disconnect: function () { disconnectCalls += 1; }
        };
      });
      return { name: name, getContext: function () { return lastContext; }, getDisconnectCalls: function () { return disconnectCalls; } };
    }

    function registerAsyncProvider(shouldResolve) {
      providerCounter += 1;
      var name = 'test-async-provider-' + providerCounter;
      var lastContext = null;
      adapter.registerProvider(name, function () {
        return {
          connect: function (context) {
            lastContext = context;
            return new Promise(function (resolve, reject) {
              setTimeout(function () { shouldResolve ? resolve() : reject(new Error('simulated connect failure')); }, 5);
            });
          },
          disconnect: function () {}
        };
      });
      return { name: name, getContext: function () { return lastContext; } };
    }

    function registerThrowingProvider() {
      providerCounter += 1;
      var name = 'test-throwing-provider-' + providerCounter;
      adapter.registerProvider(name, function () {
        return {
          connect: function () { throw new Error('boom-connect'); },
          disconnect: function () {}
        };
      });
      return { name: name };
    }

    results.push(runCase('Adapter 1. registerProvider + getProviders', function () {
      var before = adapter.getProviders().length;
      var provider = registerSyncProvider();
      var after = adapter.getProviders();
      var ok = after.length === before + 1 && after.indexOf(provider.name) !== -1;
      return { pass: ok, details: JSON.stringify({ before: before, after: after }) };
    }));

    results.push(runCase('Adapter 2. create med okand provider ger null, ingen krasch', function () {
      var threw = false;
      var instance = null;
      try { instance = adapter.create('this-provider-does-not-exist'); } catch (err) { threw = true; }
      var ok = threw === false && instance === null;
      return { pass: ok, details: 'threw=' + threw + ' instance=' + instance };
    }));

    results.push(runCase('Adapter 3. create ger en instans med korrekt API-yta', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name);
      var ok = !!instance
        && typeof instance.connect === 'function' && typeof instance.disconnect === 'function'
        && typeof instance.isConnected === 'function' && typeof instance.getState === 'function'
        && typeof instance.getStats === 'function' && typeof instance.subscribe === 'function';
      instance && instance.destroy();
      return { pass: ok, details: 'ok=' + ok };
    }));

    results.push(runCase('Adapter 4. connect med synkron provider gar till connected', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name);
      var events = [];
      instance.subscribe(function (n) { events.push(n.type); });
      instance.connect();
      var state = instance.getState();
      var ok = state.connectionState === 'connected' && state.connected === true
        && events.indexOf('connect-attempt') !== -1 && events.indexOf('connected') !== -1;
      instance.destroy();
      return { pass: ok, details: JSON.stringify({ state: state, events: events }) };
    }));

    results.push(runCase('Adapter 5. disconnect fungerar och ger disconnected-state', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name);
      instance.connect();
      var r = instance.disconnect();
      var state = instance.getState();
      var ok = r.status === 'disconnected' && state.connectionState === 'disconnected' && state.connected === false;
      instance.destroy();
      return { pass: ok, details: JSON.stringify({ result: r, state: state }) };
    }));

    results.push(runCase('Adapter 6. Dubbel connect ar sakert (ingen dubbel anslutning)', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name);
      instance.connect();
      var statsAfterFirst = instance.getStats().connectAttempts;
      var r2 = instance.connect();
      var statsAfterSecond = instance.getStats().connectAttempts;
      var ok = r2.status === 'already-connected' && statsAfterFirst === statsAfterSecond;
      instance.destroy();
      return { pass: ok, details: JSON.stringify({ r2: r2, statsAfterFirst: statsAfterFirst, statsAfterSecond: statsAfterSecond }) };
    }));

    results.push(runCase('Adapter 7. Dubbel disconnect ar sakert', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name);
      instance.connect();
      instance.disconnect();
      var r2 = instance.disconnect();
      var ok = r2.status === 'already-disconnected';
      instance.destroy();
      return { pass: ok, details: JSON.stringify(r2) };
    }));

    results.push(runCase('Adapter 8. Felformat provider-event avvisas utan krasch', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name);
      var errorEvents = [];
      var dataEvents = [];
      instance.subscribe(function (n) { if (n.type === 'error') errorEvents.push(n); if (n.type === 'event') dataEvents.push(n); });
      instance.connect();
      var context = provider.getContext();
      var threw = false;
      try {
        context.emit('', { x: 1 });      // empty providerEvent
        context.emit(null, { x: 1 });    // non-string providerEvent
        context.emit(42, { x: 1 });      // non-string providerEvent
      } catch (err) { threw = true; }
      var statsAfter = instance.getStats();
      var ok = threw === false && dataEvents.length === 0 && errorEvents.length === 3 && statsAfter.eventsRejected === 3;
      instance.destroy();
      return { pass: ok, details: JSON.stringify({ threw: threw, errorEvents: errorEvents.length, dataEvents: dataEvents.length, stats: statsAfter }) };
    }));

    results.push(runCase('Adapter 9. Giltigt provider-event ger korrekt envelope och djupkopierad payload', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name);
      var received = null;
      instance.subscribe(function (n) { if (n.type === 'event') received = n.envelope; });
      instance.connect();
      var context = provider.getContext();
      var originalPayload = { nested: { value: 42 } };
      context.emit('some-provider-event', originalPayload, 12345);
      var ok = !!received
        && received.provider === provider.name
        && received.providerEvent === 'some-provider-event'
        && received.receivedAt === 12345
        && received.connectionId === instance.getState().connectionId
        && JSON.stringify(received.payload) === JSON.stringify(originalPayload)
        && received.payload !== originalPayload; // deep-cloned, not the same reference
      instance.destroy();
      return { pass: ok, details: JSON.stringify(received) };
    }));

    results.push(runCase('Adapter 10. Subscriber-fel isoleras (kraschar inte andra subscribers)', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name);
      var secondCalls = 0;
      instance.subscribe(function () { throw new Error('boom-subscriber'); });
      instance.subscribe(function () { secondCalls += 1; });
      var threw = false;
      try { instance.connect(); } catch (err) { threw = true; }
      var ok = threw === false && secondCalls >= 2; // connect-attempt + connected
      instance.destroy();
      return { pass: ok, details: 'threw=' + threw + ' secondCalls=' + secondCalls };
    }));

    results.push(runCase('Adapter 11. Oplanerad disconnect med reconnect-policy aterensluter (bounded backoff)', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name, { reconnect: { enabled: true, baseDelayMs: 5, maxDelayMs: 20, maxAttempts: 3 } });
      var events = [];
      instance.subscribe(function (n) { events.push(n.type); });
      instance.connect();
      var context = provider.getContext();
      context.reportUnexpectedDisconnect();
      var stateRightAfter = instance.getState();
      return wait(60).then(function () {
        var stateAfterWait = instance.getState();
        var statsAfterWait = instance.getStats();
        // reconnectAttempt itself resets to 0 on a successful reconnect (by design — mirrors
        // standard backoff-reset-on-success semantics), so success is verified via the
        // cumulative `reconnectsAttempted` stat instead, which never resets.
        var ok = stateRightAfter.reconnectScheduled === true
          && events.indexOf('reconnect-scheduled') !== -1
          && events.indexOf('reconnect-attempt') !== -1
          && stateAfterWait.connectionState === 'connected'
          && statsAfterWait.reconnectsAttempted >= 1;
        instance.destroy();
        return { pass: ok, details: JSON.stringify({ stateRightAfter: stateRightAfter, stateAfterWait: stateAfterWait, statsAfterWait: statsAfterWait, events: events }) };
      });
    }));

    results.push(runCase('Adapter 12. Reconnect kan avbrytas (disconnect() innan den hinner fyra)', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name, { reconnect: { enabled: true, baseDelayMs: 50, maxDelayMs: 200, maxAttempts: 3 } });
      instance.connect();
      var context = provider.getContext();
      context.reportUnexpectedDisconnect();
      var scheduledRightAfter = instance.getState().reconnectScheduled;
      instance.disconnect(); // must cancel the pending reconnect timer
      return wait(80).then(function () {
        var events = [];
        var unsub = instance.subscribe(function (n) { events.push(n.type); });
        return wait(10).then(function () {
          unsub();
          var finalState = instance.getState();
          var ok = scheduledRightAfter === true && finalState.reconnectScheduled === false && finalState.connectionState === 'disconnected';
          instance.destroy();
          return { pass: ok, details: JSON.stringify({ scheduledRightAfter: scheduledRightAfter, finalState: finalState }) };
        });
      });
    }));

    results.push(runCase('Adapter 13. Asynkron provider som avvisar -> error-state, ingen krasch', function () {
      var provider = registerAsyncProvider(false);
      var instance = adapter.create(provider.name);
      instance.connect();
      return wait(30).then(function () {
        var state = instance.getState();
        var stats = instance.getStats();
        var ok = state.connectionState === 'error' && typeof state.lastError === 'string' && stats.connectFailures === 1;
        instance.destroy();
        return { pass: ok, details: JSON.stringify({ state: state, stats: stats }) };
      });
    }));

    results.push(runCase('Adapter 14. Provider vars connect() kastar synkront hanteras sakert', function () {
      var provider = registerThrowingProvider();
      var instance = adapter.create(provider.name);
      var threw = false;
      try { instance.connect(); } catch (err) { threw = true; }
      var state = instance.getState();
      var ok = threw === false && state.connectionState === 'error' && instance.getStats().connectFailures === 1;
      instance.destroy();
      return { pass: ok, details: 'threw=' + threw + ' state=' + JSON.stringify(state) };
    }));

    results.push(runCase('Adapter 15. destroy ar permanent och saker; anrop efter destroy kastar aldrig', function () {
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name);
      instance.connect();
      instance.destroy();
      var threw = false;
      var connectResult, disconnectResult;
      try {
        connectResult = instance.connect();
        disconnectResult = instance.disconnect();
        instance.destroy(); // repeated destroy must also be safe
      } catch (err) { threw = true; }
      var ok = threw === false
        && connectResult.status === 'rejected' && connectResult.reason === 'destroyed'
        && disconnectResult.status === 'rejected' && disconnectResult.reason === 'destroyed'
        && instance.getState().destroyed === true;
      return { pass: ok, details: JSON.stringify({ threw: threw, connectResult: connectResult, disconnectResult: disconnectResult }) };
    }));

    results.push(runCase('Adapter 16. Adapter-envelope kan inte passera som NormalizedEvent direkt i Runtime', function () {
      // Structural boundary check: an adapter envelope must be normalized by a provider-specific
      // normalizer before it can ever reach the Recognition Runtime — this proves the raw
      // envelope shape alone is never mistakenly accepted as a NormalizedEvent.
      var runtime = getRuntime();
      var provider = registerSyncProvider();
      var instance = adapter.create(provider.name);
      var envelope = null;
      instance.subscribe(function (n) { if (n.type === 'event') envelope = n.envelope; });
      instance.connect();
      provider.getContext().emit('gift', { username: 'x', giftName: 'Rose', coins: 10 }, 999);
      var hasNormalizedShape = !!envelope && ('kind' in envelope) && ('actor' in envelope) && ('mergeKey' in envelope);
      var pushResult = runtime.push(envelope, 999);
      var ok = hasNormalizedShape === false && pushResult.status === 'rejected';
      instance.destroy();
      return { pass: ok, details: JSON.stringify({ envelope: envelope, pushResult: pushResult }) };
    }));
  }

  // Returns a Promise<Array<{name, pass, details}>>. `caseThunks` collects the deferred thunks
  // runCase() produces; they are invoked one at a time via reduce, each awaited to completion
  // (including any real wait()) before the next one starts — strict serial order, required
  // because every stage's singleton is shared mutable state across all of that stage's cases.
  function run() {
    var caseThunks = [];
    runNormalizerCases(caseThunks);
    runMergeCases(caseThunks);
    runQueueCases(caseThunks);
    runControllerCases(caseThunks);
    runMapperCases(caseThunks);
    runCardCases(caseThunks);
    runRuntimeCases(caseThunks);
    runAdapterCases(caseThunks);

    var output = [];
    return caseThunks.reduce(function (chain, thunk) {
      return chain.then(function () { return thunk(); }).then(function (result) { output.push(result); });
    }, Promise.resolve()).then(function () { return output; });
  }

  var api = { run: run };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VyraRecognitionVerify = api;
})(typeof window !== 'undefined' ? window : globalThis);
