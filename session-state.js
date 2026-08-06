(function (root) {
  'use strict';
  // The one owner of active session state.
  //
  // Six keys are protected — the layout, the projection marker and the four account-bound EXTRA
  // keys — and this file is the only place they may be written. Everything else asks.
  //
  // Three properties this exists to guarantee, in order of how expensive they are to get wrong:
  //
  //   1. Account isolation. Nothing account-bound is exposed before the current identity has been
  //      verified. A committed marker names the PREVIOUS workspace, never the person opening the
  //      page now, so boot is always neutral.
  //   2. Single writer across tabs. Two marker reads are not a compare-and-swap: a tab can validate,
  //      write, and only then discover that another tab committed in between — and its rollback
  //      would land on the winner's data. An origin-wide exclusive Web Lock is what makes that
  //      impossible; every path that can change the projection runs inside it, with no network I/O.
  //   3. A stable in-memory reference. studio.js takes `activeState()` once at boot and keeps it
  //      forever, so every projection mutates that object in place. Replacing it would leave the
  //      whole UI rendering a detached copy.
  //
  // Two failure modes are deliberately different. A normal projection that fails rolls back to the
  // last committed state — that is the safe resting point. A logout that fails does NOT: it keeps
  // neutralising, because leaving the previous account's data active is the one outcome that is
  // never acceptable. Logout is a security transaction, not an ordinary write.

  const LOCK = 'vyra-session-projection';
  const MARKER_KEY = 'vyra-session-projection';
  const STATE_KEY = 'vyra-state';
  // The four that belong to an account. vyra-overlay-resolution is deliberately absent: it is a
  // property of the machine's screen, not of whoever is logged in.
  const EXTRA_KEYS = ['vyra-extras', 'vyra-action-event-v2', 'vyra-favorite-widgets'];
  // Nycklar vi inte langre anvander, men vars DATA fortfarande maste torkas nar ett konto lamnas.
  // En gammal installation har dem kvar, och de far inte folja med in i nasta konto pa en delad
  // dator. De projiceras inte, synkas inte och sakerhetskopieras inte — de bara torkas.
  //
  // vyra-wishlist: wishlist.js sparade onskemal lokalt och oppnade e-postklienten mot
  // 'TODO@exempel.se'. Inget onskemal nadde nagonsin nagon. Knappen togs over av supportsystemet
  // i PR #106 och filen ar borttagen.
  const RETIRED_KEYS = ['vyra-wishlist'];
  const PROTECTED_KEYS = [STATE_KEY, MARKER_KEY, ...EXTRA_KEYS];

  const BRAND_KIT = { background: '#1c1028', highlight: '#ff58d6', text: '#f7f2ff',
    secondaryText: '#b9a6dd', fontFamily: '' };

  // The neutral state and the onboarding state are NOT the same thing, and conflating them is how a
  // security neutralisation turns into "here are three demo widgets". Neutral is what an
  // unidentified page shows; onboarding is a product decision for a workspace proven to be empty.
  function neutralState() {
    return { widgets: [], flows: [], user: 'Streamer', tiktok: '', brandKit: { ...BRAND_KIT } };
  }
  function onboardingState() {
    return { ...neutralState(), widgets: [
      { id: 'goal', type: 'goal', x: 55, y: 80, title: 'KVÄLLENS MÅL', value: '74 320 / 100K' },
      { id: 'alert', type: 'alert', x: 65, y: 300, title: '@alex skickade Galaxy', value: '×5' },
      { id: 'leader', type: 'leader', x: 50, y: 480, title: 'TOP GIFTERS', value: '1. Alex · 15.5K' }
    ], flows: [
      { trigger: 'Gåva mottagen', action: 'Visa gift alert', on: true },
      { trigger: 'Ny följare', action: 'Spela ljud + TTS', on: true }
    ] };
  }

  const clone = value => JSON.parse(JSON.stringify(value));
  const parse = (raw, fallback = null) => { try { return JSON.parse(raw) } catch { return fallback } };

  // Fixed, redacted. A failure here can be caused by data that must never reach a log line or a
  // toast, so nothing from the state, the workspace or the token is ever interpolated.
  const READONLY_NOTICE = 'Sessionen är skrivskyddad. Ladda om sidan för att försöka igen.';
  const FAILED_NOTICE = 'Sessionen kunde inte sparas säkert. Ladda om sidan.';

  function createSessionState(options) {
    const opts = options || {};
    const storage = opts.storage;
    const locks = opts.locks || null;
    const tabId = opts.tabId || 'tab';
    const now = opts.now || Date.now;
    const dispatch = opts.dispatch || (() => {});
    // Test seams only. The browser singleton at the bottom passes none, and nothing here reads a
    // global for them — a hook cannot be turned on in production.
    const hooks = opts.hooks || {};
    const randomId = opts.randomId || (() => {
      const c = root.crypto;
      if (c && typeof c.randomUUID === 'function') return c.randomUUID();
      if (c && typeof c.getRandomValues === 'function') {
        return [...c.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
      }
      // No secure randomness means no safe ownership claim; the caller ends up read-only.
      return null;
    });

    // The permanent reference. Never reassigned — only ever emptied and refilled.
    const activeStateObject = neutralState();
    let activeExtras = Object.create(null);      // key -> string, in memory only
    let mode = 'boot-neutral';
    let generation = 0;
    let committed = null;                        // {projectionId, tabId, workspaceId, overlayId, mode, version}
    let safeState = clone(activeStateObject);    // last committed state, for in-memory rollback
    let safeExtras = Object.create(null);
    const caches = new Map();                    // key -> reload(value|null)
    const teardowns = [];

    // ---- the permanent reference -------------------------------------------------------------
    function swapActive(next) {
      Object.keys(activeStateObject).forEach(key => { delete activeStateObject[key] });
      Object.assign(activeStateObject, clone(next));
    }
    function swapExtras(next) {
      activeExtras = Object.create(null);
      Object.keys(next || {}).forEach(key => { activeExtras[key] = next[key] });
    }
    // A cache that throws is fatal: a half-updated cache shows one account's data inside another's
    // session, and calling it again cannot be assumed to repair it. Callers roll the projection back.
    function runCaches(values) {
      for (const [key, reload] of caches) reload(values && key in values ? values[key] : null);
    }

    // ---- marker -------------------------------------------------------------------------------
    const readMarker = () => parse(storage.getItem(MARKER_KEY));
    function writeMarker(status, projectionId, owner, version) {
      storage.setItem(MARKER_KEY, JSON.stringify({ status, tabId, projectionId,
        generation, owner, version, at: new Date(now()).toISOString() }));
    }
    // Ownership is the pair (projectionId, tabId). A local integer alone is not unique across tabs.
    // The owner mode travels too, so a local session can never be mistaken for a cloud one.
    function ownedByUs(marker) {
      return !!(marker && committed && marker.status === 'committed'
        && marker.projectionId === committed.projectionId && marker.tabId === tabId
        && marker.owner && marker.owner.mode === committed.mode
        && marker.owner.workspaceId === committed.workspaceId
        && marker.owner.overlayId === committed.overlayId);
    }
    const isWritableMode = () => mode === 'studio-committed' || mode === 'local-committed';
    // Another tab won while we waited. Show ITS committed projection — never our own snapshot, and
    // never the local edit that lost.
    function syncFromWinner() {
      const winner = parse(storage.getItem(STATE_KEY));
      const values = {};
      EXTRA_KEYS.forEach(key => { const v = storage.getItem(key); if (v != null) values[key] = v });
      swapActive(winner && Array.isArray(winner.widgets) ? winner : neutralState());
      swapExtras(values);
      safeState = clone(activeStateObject);
      safeExtras = { ...values };
      committed = null;
      mode = 'studio-readonly';
      try { runCaches(values) } catch (_) { mode = 'fail-closed' }
      dispatch('vyra-session-state', { mode, reason: 'ownership-lost', persistent: true });
    }

    // A normal projection whose rollback could not reach storage. NOT the same thing as the
    // logout's fail-closed: here the last committed Studio state is still the truth and is still
    // shown, and a verified goal snapshot may keep streaming. What is gone is the right to write.
    function enterReadonlyError() {
      mode = 'studio-readonly-error';
      dispatch('vyra-session-state-error', { message: FAILED_NOTICE, mode });
    }

    // ---- generation ---------------------------------------------------------------------------
    function beginProjection() {
      generation += 1;
      return { projectionId: randomId(), generation };
    }
    const isCurrent = token => !!(token && token.generation === generation);

    // ---- the write path -----------------------------------------------------------------------
    // Snapshot first, then marker `preparing`, then every key, then caches and memory, then marker
    // `committed`. On any failure every touched key is put back from the snapshot. All of it inside
    // the lock, which is what makes the rollback safe: no other tab can have committed in between.
    function applyProjection({ projectionId, owner, state, extras, version }) {
      const touched = [MARKER_KEY, STATE_KEY, ...EXTRA_KEYS];
      const snapshot = {};
      touched.forEach(key => { snapshot[key] = storage.getItem(key) });
      const previousState = clone(activeStateObject), previousExtras = { ...activeExtras };

      // Returns whether storage could be put back. Memory is always restored — that is what the UI
      // reads, and an unsaved edit must never survive as though it had been saved.
      const restore = () => {
        let restored = true;
        for (const key of touched) {
          try {
            if (snapshot[key] == null) storage.removeItem(key); else storage.setItem(key, snapshot[key]);
          } catch (_) { restored = false }
        }
        swapActive(previousState);
        swapExtras(previousExtras);
        try { runCaches(previousExtras) } catch (_) { restored = false }
        if (!restored) enterReadonlyError();
        return restored;
      };

      try {
        const serialisedState = JSON.stringify(state);
        const serialisedExtras = {};
        EXTRA_KEYS.forEach(key => {
          if (extras && extras[key] != null) serialisedExtras[key] = String(extras[key]);
        });

        writeMarker('preparing', projectionId, owner, version);
        if (hooks.afterFirstKey) return { deferred: true, serialisedState, serialisedExtras, snapshot, restore };

        return finishProjection({ projectionId, owner, version, serialisedState, serialisedExtras, restore });
      } catch (error) {
        restore();
        return { ok: false, reason: 'storage-error' };
      }
    }

    function finishProjection({ projectionId, owner, version, serialisedState, serialisedExtras, restore }) {
      try {
        storage.setItem(STATE_KEY, serialisedState);
        for (const key of EXTRA_KEYS) {
          if (key in serialisedExtras) storage.setItem(key, serialisedExtras[key]);
          else storage.removeItem(key);
        }
        runCaches(serialisedExtras);
        swapActive(parse(serialisedState, neutralState()));
        swapExtras(serialisedExtras);
        writeMarker('committed', projectionId, owner, version);
        safeState = clone(activeStateObject);
        safeExtras = { ...serialisedExtras };
        return { ok: true };
      } catch (error) {
        restore();
        return { ok: false, reason: 'projection-failed' };
      }
    }

    // ---- public: full projection ---------------------------------------------------------------
    async function projectActive(token, request) {
      if (!isCurrent(token)) return { ok: false, reason: 'stale-token' };
      if (!locks) return { ok: false, reason: 'no-lock-manager' };
      const opGeneration = generation;
      if (hooks.beforeLock) await hooks.beforeLock();

      return locks.request(LOCK, { mode: 'exclusive' }, async () => {
        if (generation !== opGeneration) return { ok: false, reason: 'superseded' };
        if (committed) {
          const marker = readMarker();
          if (marker && !ownedByUs(marker)) { syncFromWinner(); return { ok: false, reason: 'lost-ownership' } }
        }
        if (hooks.afterValidate) await hooks.afterValidate();
        if (generation !== opGeneration) return { ok: false, reason: 'superseded' };

        const owner = { mode: request.mode || 'studio-committed',
          workspaceId: request.workspaceId == null ? null : request.workspaceId,
          overlayId: request.overlayId == null ? null : request.overlayId };
        const version = (committed ? committed.version : 0) + 1;
        const started = applyProjection({ projectionId: token.projectionId, owner,
          state: request.state, extras: request.extras, version });

        let result = started;
        if (started.deferred) {
          await hooks.afterFirstKey();
          if (hooks.failAfterFirstKey) {
            started.restore();
            result = { ok: false, reason: 'projection-failed' };
          } else if (generation !== opGeneration) {
            started.restore();
            result = { ok: false, reason: 'superseded' };
          } else {
            result = finishProjection({ projectionId: token.projectionId, owner, version,
              serialisedState: started.serialisedState, serialisedExtras: started.serialisedExtras,
              restore: started.restore });
          }
        }

        if (!result.ok) { if (mode === 'boot-neutral' || mode === 'neutral') mode = 'boot-neutral'; return result }
        committed = { projectionId: token.projectionId, tabId, workspaceId: owner.workspaceId,
          overlayId: owner.overlayId, mode: owner.mode, version };
        mode = owner.mode;
        dispatch('vyra-session-state', { mode, reason: request.reason || 'projection', persistent: true });
        return { ok: true };
      });
    }

    // ---- public: single-key edit inside a committed projection ----------------------------------
    async function writeActive(key, value) {
      if (!PROTECTED_KEYS.includes(key)) return { ok: false, reason: 'unprotected-key' };
      if (!isWritableMode() || !committed) return { ok: false, reason: 'not-writable' };
      if (!locks) return { ok: false, reason: 'no-lock-manager' };
      const opGeneration = generation;
      if (hooks.beforeLock) await hooks.beforeLock();

      return locks.request(LOCK, { mode: 'exclusive' }, async () => {
        if (generation !== opGeneration) return { ok: false, reason: 'superseded' };
        const marker = readMarker();
        if (!ownedByUs(marker)) { syncFromWinner(); return { ok: false, reason: 'lost-ownership' } }
        if (hooks.afterValidate) await hooks.afterValidate();
        if (generation !== opGeneration) return { ok: false, reason: 'superseded' };

        const snapshotValue = storage.getItem(key), snapshotMarker = storage.getItem(MARKER_KEY);
        const previousState = clone(safeState), previousExtras = { ...safeExtras };
        const version = committed.version + 1;
        try {
          writeMarker('preparing', committed.projectionId, marker.owner, version);
          storage.setItem(key, String(value));
          if (key === STATE_KEY) swapActive(parse(String(value), previousState));
          else { activeExtras[key] = String(value); runCaches(activeExtras) }
          writeMarker('committed', committed.projectionId, marker.owner, version);
          committed = { ...committed, version };
          safeState = clone(activeStateObject);
          safeExtras = { ...activeExtras };
          return { ok: true };
        } catch (error) {
          // Restore storage where possible, and the in-memory object always: the caller mutated a
          // widget before calling, and that unsaved edit must not survive as if it had been saved.
          let restored = true;
          try {
            if (snapshotValue == null) storage.removeItem(key); else storage.setItem(key, snapshotValue);
            if (snapshotMarker != null) storage.setItem(MARKER_KEY, snapshotMarker);
          } catch (_) { restored = false }
          swapActive(previousState);
          swapExtras(previousExtras);
          try { runCaches(previousExtras) } catch (_) { restored = false }
          if (!restored) enterReadonlyError();
          return { ok: false, reason: 'storage-error' };
        }
      });
    }

    // ---- public: read-only projections ----------------------------------------------------------
    // An OBS link. Memory only: no lock, no marker, no key — a token page cannot make a Studio tab
    // read-only, and cannot leave a trace another tab could adopt.
    async function projectReadonlyOverlay(request) {
      generation += 1;
      const values = {};
      EXTRA_KEYS.forEach(key => {
        if (request.extras && request.extras[key] != null) values[key] = String(request.extras[key]);
      });
      swapActive(request.state && Array.isArray(request.state.widgets) ? request.state : neutralState());
      swapExtras(values);
      committed = null;
      mode = 'overlay-token-readonly';
      try { runCaches(values) } catch (_) { mode = 'fail-closed' }
      dispatch('vyra-session-state', { mode, reason: 'overlay-token', persistent: false });
      return { ok: true };
    }

    async function endReadonlyOverlay() {
      generation += 1;
      swapActive(neutralState());
      swapExtras({});
      committed = null;
      mode = 'neutral';
      try { runCaches({}) } catch (_) { mode = 'fail-closed' }
      dispatch('vyra-session-state', { mode, reason: 'overlay-token-ended', persistent: false });
      return { ok: true };
    }

    // No lock manager means no way to exclude another tab, so nothing persistent may be written.
    // Verified data may still be shown — from memory, never from what happens to be in storage.
    //
    // It still gets a state event: `vyra-session-state` means "a complete, safe active projection
    // exists", not "it is committed to storage". Without it the renderer would never learn that
    // activeStateObject now holds verified data, and the goal stream could never start. The
    // distinction travels in `persistent`, and the read-only warning is a separate event after it.
    async function projectVerifiedReadonly(request) {
      const state = request && request.state;
      if (!state || !Array.isArray(state.widgets)) return { ok: false, reason: 'invalid-state' };
      generation += 1;
      const values = {};
      EXTRA_KEYS.forEach(key => {
        if (request.extras && request.extras[key] != null) values[key] = String(request.extras[key]);
      });
      swapActive(state);
      swapExtras(values);
      committed = null;
      mode = request.mode === 'overlay-token' ? 'overlay-token-readonly' : 'studio-readonly-lock-missing';
      try { runCaches(values) } catch (_) { mode = 'fail-closed' }
      if (mode === 'fail-closed') {
        swapActive(neutralState());
        swapExtras({});
        dispatch('vyra-session-state-error', { message: FAILED_NOTICE, mode });
        return { ok: false, reason: 'cache-failed' };
      }
      dispatch('vyra-session-state', { mode, reason: 'verified-readonly', persistent: false });
      dispatch('vyra-session-state-error', { message: READONLY_NOTICE, mode });
      return { ok: true };
    }

    // ---- public: logout --------------------------------------------------------------------------
    // The order is the security property. The layout is neutralised BEFORE the account-bound EXTRA
    // keys and before the marker, so that a storage that starts refusing halfway has still removed
    // the most revealing thing first. The backup runs before any of it, because it has to read the
    // values that are about to be destroyed.
    async function beginLogout() {
      generation += 1;                       // synchronous, before anything can await
      const run = async () => {
        let degraded = false;
        for (const [, fn] of teardowns) {
          try { await fn() } catch (_) { degraded = true }
        }

        const workspaceId = committed && committed.workspaceId;
        const previousState = storage.getItem(STATE_KEY);
        const previousExtras = {};
        EXTRA_KEYS.forEach(key => { const v = storage.getItem(key); if (v != null) previousExtras[key] = v });

        if (workspaceId) {
          try {
            storage.setItem(`vyra-session-backup:${workspaceId}`, JSON.stringify({
              state: parse(previousState), extras: previousExtras, at: new Date(now()).toISOString() }));
          } catch (_) { degraded = true }
        }

        try { storage.setItem(STATE_KEY, JSON.stringify(neutralState())) } catch (_) { degraded = true }
        for (const key of [...EXTRA_KEYS, ...RETIRED_KEYS]) { try { storage.removeItem(key) } catch (_) { degraded = true } }
        try { storage.removeItem(MARKER_KEY) } catch (_) { degraded = true }

        swapActive(neutralState());
        swapExtras({});
        safeState = clone(activeStateObject);
        safeExtras = Object.create(null);
        committed = null;
        try { runCaches({}) } catch (_) { degraded = true }

        mode = degraded ? 'fail-closed' : 'neutral';
        return degraded;
      };

      let degraded = true;
      try {
        degraded = locks ? await locks.request(LOCK, { mode: 'exclusive' }, run) : await run();
      } catch (_) {
        swapActive(neutralState());
        swapExtras({});
        committed = null;
        mode = 'fail-closed';
      } finally {
        dispatch('vyra-session-ended', { mode });
      }
      if (mode === 'fail-closed') dispatch('vyra-session-state-error', { message: FAILED_NOTICE, mode });
      else dispatch('vyra-session-state', { mode, reason: 'logout', persistent: true });
      return { ok: mode === 'neutral' };
    }

    // ---- public: the machine's own session --------------------------------------------------------
    // VYRA Desktop has no account system, so nothing will ever verify a workspace there. This is that
    // machine's session: the same lock and the same marker — two tabs still cannot both write — but
    // no workspace, no queue, no push, no backup and no goal stream. Entered only on an explicit
    // {authRequired:false}; a failed config request must leave the app in boot-neutral instead.
    async function projectLocalSession() {
      const token = beginProjection();
      const stored = parse(storage.getItem(STATE_KEY));
      const state = stored && Array.isArray(stored.widgets) ? stored : onboardingState();
      const extras = {};
      EXTRA_KEYS.forEach(key => { const v = storage.getItem(key); if (v != null) extras[key] = v });
      return projectActive(token, { mode: 'local-committed', workspaceId: null, overlayId: null,
        state, extras, reason: 'local-session' });
    }

    // A backup restore is a new projection under the identity that is already committed — cloud or
    // local. It never invents an owner of its own.
    async function projectRestore(request) {
      if (!committed) return { ok: false, reason: 'not-writable' };
      const token = beginProjection();
      return projectActive(token, { mode: committed.mode, workspaceId: committed.workspaceId,
        overlayId: committed.overlayId, state: request.state, extras: request.extras,
        reason: 'restore' });
    }

    // Callers treat these as never-throwing: media.js and the action modules call save() without
    // awaiting, and a rejected floating promise there would surface as an unhandled rejection with
    // no owner. A storage that throws on getItem (blocked cookies) is the realistic case.
    const settled = fn => async (...args) => {
      try { return await fn(...args) } catch (_) { return { ok: false, reason: 'unavailable' } }
    };

    return {
      MARKER_KEY, STATE_KEY, EXTRA_KEYS, RETIRED_KEYS, PROTECTED_KEYS,
      activeState: () => activeStateObject,
      readActiveExtra: key => (key in activeExtras ? activeExtras[key] : null),
      mode: () => mode,
      neutralState, onboardingState,
      beginProjection, isCurrent,
      committedProjection: () => (committed ? { ...committed } : null),
      projectActive: settled(projectActive), writeActive: settled(writeActive),
      projectReadonlyOverlay: settled(projectReadonlyOverlay),
      endReadonlyOverlay: settled(endReadonlyOverlay),
      projectVerifiedReadonly: settled(projectVerifiedReadonly),
      beginLogout: settled(beginLogout),
      registerCache: (key, reload) => { caches.set(key, reload) },
      registerTeardown: (name, fn) => { teardowns.push([name, fn]) },
      // A verified snapshot is enough to stream goals; the right to WRITE is what the read-only
      // modes lose. Only the unidentified and the security-neutralised modes close the stream.
      canOpenGoalStream: () => ['studio-committed', 'studio-readonly', 'studio-readonly-error',
        'studio-readonly-lock-missing', 'overlay-token-readonly'].includes(mode),
      canQueue: () => mode === 'studio-committed' && !!committed,
      canPush: () => mode === 'studio-committed' && !!committed,
      canBackup: () => mode === 'studio-committed' && !!committed,
      projectLocalSession: settled(projectLocalSession), projectRestore: settled(projectRestore)
    };
  }

  // The browser singleton gets only safe defaults. No hooks are passed and none are read from a
  // global, so the test seams above cannot be reached in production.
  if (typeof window !== 'undefined' && window.localStorage) {
    root.VyraSessionState = createSessionState({
      storage: window.localStorage,
      locks: (window.navigator && window.navigator.locks) || null,
      tabId: (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Math.random()).slice(2),
      dispatch: (name, detail) => root.dispatchEvent(new CustomEvent(name, { detail }))
    });

    // The ONLY listener on this event, anywhere. auth-client clears the identity and then fires it;
    // this raises the generation, backs the account's work up under its own namespace, neutralises
    // the active state and finally announces `vyra-session-ended`. Every other module listens to
    // that one instead, so no consumer can run before the state is safe — listener order between
    // files is not something any of this may depend on.
    root.addEventListener('vyra-auth-identity-cleared', () => { root.VyraSessionState.beginLogout() });
  }
  if (typeof module === 'object' && module.exports) module.exports = { createSessionState, neutralState, onboardingState };
})(typeof window !== 'undefined' ? window : globalThis);
