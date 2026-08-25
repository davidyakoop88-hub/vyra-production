(function (root) {
  'use strict';
  // Live goal values: one runtime, two transports, one ordering rule.
  //
  // Ordering is `revision` and nothing else. The server owns it, it is per goal row, and it only ever
  // increases. epoch says which run a number belongs to and `at` is for display — neither can order
  // two changes: now() is the transaction's START time, two writes inside one millisecond collapse
  // once getTime() truncates them, and two rows changed in one transaction share a timestamp exactly.
  // revision is compared as a string of digits, never as a Number, because past 2^53 two distinct
  // revisions round to the same float and the newer one would look stale.
  //
  // The value never touches state.widgets, localStorage, save() or cloud-sync. It lives in a Map that
  // dies with the page, which is what makes a goal safe to show in an OBS link: nothing about it can
  // be written back by a browser source.
  //
  // Frames are batched through one requestAnimationFrame. At the ingest ceiling of 100 events a
  // second the alternative is 100 DOM passes a second, and rebuilding the canvas would restart every
  // Top Gift and Top Streak animation on the page.

  const MAX_GOAL_VALUE = 1_000_000_000_000;

  // Digit-string comparison: longer wins, then lexicographic. Safe for any bigint the column can hold.
  function newerRevision(next, current) {
    const a = String(next == null ? '' : next).replace(/^0+(?=\d)/, '');
    const b = String(current == null ? '' : current).replace(/^0+(?=\d)/, '');
    if (!/^\d+$/.test(a)) return false;
    if (!/^\d+$/.test(b)) return true;
    if (a.length !== b.length) return a.length > b.length;
    return a > b;
  }

  const isGoalNumber = value => typeof value === 'number' && Number.isSafeInteger(value)
    && value >= 0 && value <= MAX_GOAL_VALUE;

  function createGoalRuntime(options) {
    const opts = options || {};
    const request = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    const Source = opts.EventSource || root.EventSource;
    const raf = opts.requestAnimationFrame
      || (root.requestAnimationFrame ? root.requestAnimationFrame.bind(root) : fn => fn(0));
    const ask = opts.confirm || (root.confirm ? root.confirm.bind(root) : () => false);
    // The legacy mirror. Best effort by design: a failed local write must never undo a PATCH the
    // server already accepted, so it is called inside a try and its outcome is not reported.
    const mirror = typeof opts.save === 'function' ? opts.save : null;

    const store = new Map();          // widgetId -> {value, target, epoch, at, revision, metric}
    const listeners = new Set();
    let buffered = [];                 // frames waiting for the snapshot or the next frame
    let ready = false;                 // a snapshot has been applied
    let scheduled = false;
    let generation = 0;
    let source = null, owned = false, onGoal = null, onOpen = null;
    let scope = null;                  // {mode:'token', token} | {mode:'member', workspaceId, overlayId}
    let overlayId = null;
    const inFlight = new Map();        // widgetId:field -> promise

    // ---- store ------------------------------------------------------------------------------------
    function accept(frame) {
      if (!frame || !frame.widgetId) return false;
      if (overlayId && frame.overlayId && frame.overlayId !== overlayId) return false;
      const current = store.get(frame.widgetId);
      if (current && !newerRevision(frame.revision, current.revision)) return false;
      store.set(frame.widgetId, { widgetId: frame.widgetId, metric: frame.metric,
        value: Number(frame.value), target: Number(frame.target), epoch: Number(frame.epoch),
        at: Number(frame.at), revision: String(frame.revision),
        baseline: frame.baseline == null ? undefined : Number(frame.baseline),
        progress: frame.progress == null ? undefined : Number(frame.progress) });
      return true;
    }

    function flush() {
      scheduled = false;
      const pending = buffered;
      buffered = [];
      const changed = [];
      for (const frame of pending) if (accept(frame)) changed.push(frame.widgetId);
      if (!changed.length) return;
      const unique = [...new Set(changed)];
      for (const listener of listeners) listener(unique);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      raf(flush);
    }

    // ---- transport --------------------------------------------------------------------------------
    // The snapshot is the recovery mechanism: frames are not replayable, so every open and every
    // reconnect fetches one. Frames that arrive while it is in flight are buffered, not dropped, and
    // then filtered against it by revision — which is why the stream is opened FIRST.
    function snapshotUrl() {
      if (!scope) return null;
      return scope.mode === 'token'
        ? `/api/overlay-access/${encodeURIComponent(scope.token)}/goals`
        : `/api/workspaces/${scope.workspaceId}/overlays/${scope.overlayId}/goals`;
    }

    async function loadSnapshot() {
      const url = snapshotUrl();
      if (!url || !request) return { ok: false };
      const mine = generation;
      let payload = null;
      try {
        const response = await request(url, { cache: 'no-store' });
        payload = await response.json();
      } catch (_) {
        return { ok: false };
      }
      if (mine !== generation) return { ok: false, reason: 'superseded' };
      if (!payload || !Array.isArray(payload.goals)) return { ok: false };

      for (const item of payload.goals) {
        if (!overlayId && item.overlayId) overlayId = item.overlayId;
        const current = store.get(item.widgetId);
        if (current && !newerRevision(item.revision, current.revision)) continue;
        store.set(item.widgetId, { widgetId: item.widgetId, metric: item.metric,
          value: Number(item.value), target: Number(item.target), epoch: Number(item.epoch),
          at: Number(item.at), revision: String(item.revision),
          baseline: Number(item.baseline), progress: Number(item.progress) });
      }
      ready = true;
      if (buffered.length) schedule();
      for (const listener of listeners) listener(payload.goals.map(g => g.widgetId));
      return { ok: true };
    }

    function bind(next) {
      onGoal = message => {
        let frame = null;
        try { frame = JSON.parse(message.data) } catch { return }
        if (!frame) return;
        buffered.push(frame);
        if (ready) schedule();
      };
      // EventSource reconnects on its own. Every reopen needs a fresh snapshot: frames sent while the
      // socket was down are gone, and only an absolute value can recover from that.
      onOpen = () => { if (ready) loadSnapshot() };
      next.addEventListener('goal', onGoal);
      next.addEventListener('open', onOpen);
      source = next;
    }

    // The OBS link's stream belongs to overlay-access.js. This adds listeners and removes them again;
    // it never closes it, because a goal runtime tearing down must not take the raw event stream with
    // it.
    async function attachSource(existing, options) {
      const settings = options || {};
      generation += 1;
      scope = settings.scope || null;
      overlayId = settings.overlayId || null;
      owned = settings.owned === true;
      bind(existing);
      return loadSnapshot();
    }

    // Studio opens its own overlay-scoped stream and owns it.
    async function openOwnSource(target) {
      generation += 1;
      scope = { mode: 'member', workspaceId: target.workspaceId, overlayId: target.overlayId };
      overlayId = target.overlayId;
      owned = true;
      bind(new Source(`/api/workspaces/${target.workspaceId}/overlays/${target.overlayId}/events/stream`));
      return loadSnapshot();
    }

    function close() {
      generation += 1;
      if (source) {
        if (onGoal) source.removeEventListener('goal', onGoal);
        if (onOpen) source.removeEventListener('open', onOpen);
        if (owned) { try { source.close() } catch (_) {} }
      }
      source = null; onGoal = null; onOpen = null; owned = false; scope = null; overlayId = null;
      store.clear(); buffered = []; ready = false; scheduled = false;
      inFlight.clear();
    }

    // ---- controls ----------------------------------------------------------------------------------
    function controlUrl(widgetId, suffix) {
      if (!scope || scope.mode !== 'member') return null;
      return `/api/workspaces/${scope.workspaceId}/overlays/${scope.overlayId}/goals/`
        + encodeURIComponent(widgetId) + (suffix || '');
    }

    function applyServerGoal(goal) {
      if (!goal || !goal.widgetId) return;
      store.set(goal.widgetId, { widgetId: goal.widgetId, metric: goal.metric,
        value: Number(goal.value), target: Number(goal.target), epoch: Number(goal.epoch),
        at: Number(goal.at), revision: String(goal.revision),
        baseline: Number(goal.baseline), progress: Number(goal.progress) });
      for (const listener of listeners) listener([goal.widgetId]);
    }

    // One request per widget and field. A double click on a number input fires change twice, and two
    // PATCHes racing on the same row would leave the input showing whichever answered last.
    function once(key, run) {
      if (inFlight.has(key)) return inFlight.get(key);
      const promise = run().finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise;
    }

    async function sendPatch(widgetId, field, value) {
      if (!isGoalNumber(value)) return { ok: false, reason: 'invalid' };
      if (field === 'target' && value < 1) return { ok: false, reason: 'invalid' };
      const url = controlUrl(widgetId);
      if (!url || !request) return { ok: false, reason: 'not-editable' };
      return once(`${widgetId}:${field}`, async () => {
        const mine = generation;
        let payload = null;
        try {
          const response = await request(url, { method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: value }) });
          payload = await response.json();
          if (!payload || payload.ok !== true) return { ok: false, reason: 'refused' };
        } catch (_) {
          return { ok: false, reason: 'network' };
        }
        if (mine !== generation) return { ok: false, reason: 'superseded' };
        applyServerGoal(payload.goal);
        // Only what the streamer set is mirrored back into the saved widget — never live progress.
        if (mirror) { try { mirror(widgetId, { [field]: value }) } catch (_) {} }
        return { ok: true, goal: payload.goal };
      });
    }

    const patchBaseline = (widgetId, value) => sendPatch(widgetId, 'baseline', value);
    const patchTarget = (widgetId, value) => sendPatch(widgetId, 'target', value);

    async function reset(widgetId) {
      const url = controlUrl(widgetId, '/reset');
      if (!url || !request) return { ok: false, reason: 'not-editable' };
      if (!ask('Nollställ målet? Startvärdet och målet behålls.')) return { ok: false, reason: 'cancelled' };
      return once(`${widgetId}:reset`, async () => {
        const mine = generation;
        let payload = null;
        try {
          const response = await request(url, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: '{}' });
          payload = await response.json();
          if (!payload || payload.ok !== true) return { ok: false, reason: 'refused' };
        } catch (_) {
          return { ok: false, reason: 'network' };
        }
        if (mine !== generation) return { ok: false, reason: 'superseded' };
        applyServerGoal(payload.goal);
        return { ok: true, goal: payload.goal };
      });
    }

    // NY SANDNING => AUKTORITATIV OMHAMTNING, inte en omritning.
    //
    // Uppmatt: `store` haller sista ramen per widget i minnet och `vyra-live-repaint` ritar bara om
    // DEN. Serverns nollstallning publicerar ingen malram, sa en oppen malwidget stod kvar med
    // foregaende sandnings progress tills nasta liveevent rakade knuffa den.
    //
    // Ingen ny mekanik: `resetWorkspaceGoals` bumpar `revision`, och loadSnapshot filtrerar mot
    // store per revision. Resetraden ar strikt nyare i det enda ordningsbegrepp klienten lyder
    // under, och en forlorad kapplopning ar darfor ofarlig.
    //
    // BARA `live:start`. Ett avslut ska INTE hamta om: sandningen tog slut, och den sista siffran
    // ska sta kvar pa skarmen tills nagon stanger kallan.
    const handelser = opts.events
      || (root && typeof root.addEventListener === 'function' ? root : null);
    if (handelser) {
      handelser.addEventListener('vyra-live-session', event => {
        const detalj = event && event.detail;
        if (!detalj) return;   // MUTATION K: hamtar om aven vid live:end
        try { loadSnapshot() } catch (e) {}
      });
    }

    return {
      MAX_GOAL_VALUE,
      attachSource, openOwnSource, close,
      read: widgetId => store.get(widgetId) || null,
      subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
      patchBaseline, patchTarget, reset,
      isReady: () => ready
    };
  }

  if (typeof window !== 'undefined' && window.document) {
    root.VyraGoals = createGoalRuntime({
      // The Studio controls mirror the streamer's own numbers back into the saved widget through the
      // session owner, which is the only thing allowed to write vyra-state.
      save: (widgetId, patch) => {
        const state = root.VyraSessionState && root.VyraSessionState.activeState();
        const widget = state && Array.isArray(state.widgets)
          && state.widgets.find(w => w && w.id === widgetId);
        if (!widget) return;
        const heart = widget.type === 'templateHeartGoal';
        if (patch.baseline != null) widget[heart ? 'heartCurrent' : 'goalCurrent'] = patch.baseline;
        if (patch.target != null) widget[heart ? 'heartTarget' : 'goalTarget'] = patch.target;
        root.VyraSessionState.writeActive('vyra-state', JSON.stringify(state));
      }
    });

    // Studio starts when a committed projection exists — not by polling for a workspace. The event
    // carries the mode; the owner carries the identity.
    root.addEventListener('vyra-session-state', event => {
      const detail = event && event.detail;
      if (!detail || detail.mode !== 'studio-committed') return;
      const committed = root.VyraSessionState.committedProjection();
      if (!committed || !committed.overlayId) return;
      if (!root.VyraSessionState.canOpenGoalStream()) return;
      root.VyraGoals.close();
      root.VyraGoals.openOwnSource({ workspaceId: committed.workspaceId,
        overlayId: committed.overlayId });
    });

    // The session's teardown is the runtime's teardown: owned stream closed, borrowed stream only
    // unsubscribed, store emptied, pending snapshot invalidated.
    // MALA OM GENAST NAR WIDGETARNA BYGGTS PA NYTT.
    //
    // Samma skal som i live-leaderboard.js: en widget som ritas om kommer upp med det varde som
    // ligger i KONFIGURATIONEN, inte det live-varde som star pa skarmen. Ramarna ar inte
    // ateruppspelningsbara, sa nasta ram kan drojja lange - och till dess visar OBS ett gammalt
    // eller nollstallt mal mitt i en sandning.
    //
    // `store` bar redan sista ramen per widget, sa omritningen kostar ingenting extra: vi ber bara
    // lyssnarna rita om det de redan har.
    root.addEventListener('vyra-live-repaint', () => {
      try {
        const ids = [...store.keys()];
        if (ids.length) for (const listener of listeners) listener(ids);
      } catch (e) {}
    });
    root.addEventListener('vyra-session-ended', () => root.VyraGoals.close());
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { createGoalRuntime, newerRevision, MAX_GOAL_VALUE };
  }
})(typeof window !== 'undefined' ? window : globalThis);
