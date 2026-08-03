// "Kopiera widgetlänk" from the catalog has to end in one of two places: a link the server has
// already accepted, or a clear message and no change at all. Never a link to a widget the server
// rejected, and never a half-created instance left behind for the next save to push.
//
// cloud-sync.js reads the layout out of localStorage, so the candidate has to exist locally before
// it can be sent. That makes the rollback the delicate part: another tab, an action, or the streamer
// themselves may have changed the layout in the meantime, so a failure removes the candidate **by
// its own id** and nothing else. Restoring a snapshot of the whole array would quietly undo their
// work — which is the failure this module is most careful about.
(function (root) {
  'use strict';

  const inFlight = new Map();   // catalog key -> promise, so a double click cannot create two

  function widgets() {
    const state = root.state;
    return state && Array.isArray(state.widgets) ? state.widgets : null;
  }

  // The workspace's own limits, never a plan name. A trial and a paid plan differ only in what the
  // server says their limits are, and this code should not know which is which.
  async function widgetLimit(fetchJson, workspaceId) {
    const data = await fetchJson(`/api/workspaces/${workspaceId}/billing`);
    const limit = data && data.limits ? Number(data.limits.widgets) : NaN;
    if (!Number.isFinite(limit)) throw quotaError('Kunde inte läsa kontots widgetgräns. Försök igen.');
    return limit;
  }

  function quotaError(message) {
    const err = new Error(message);
    err.code = 'quota';
    return err;
  }

  const UPGRADE = 'Din plan har inga widgetplatser kvar. Uppgradera för att skapa fler widgetar.';

  // Removes exactly the candidate, by id, and leaves every other change alone.
  function rollback(candidateId) {
    const list = widgets();
    if (!list) return;
    const at = list.findIndex(w => w && w.id === candidateId);
    if (at !== -1) list.splice(at, 1);
  }

  async function create(catalogKey, deps) {
    const d = deps || {};
    const Widgets = d.widgets || root.VyraWidgets;
    const sync = d.sync || root.VyraCloudSync;
    const fetchJson = d.fetchJson;
    const save = d.save || root.save;
    const list = widgets();
    if (!list) throw new Error('Layouten är inte laddad än.');

    // 1. An instance built from this catalog entry already exists — same link, same id, no new slot.
    const existing = list.find(w => Widgets.isStandalone(w) && w.createdFrom === catalogKey);
    if (existing) return { widget: existing, reused: true };

    // 2. Quota, before the factory and before any change to state. Layout and standalone count
    //    together because the server counts state.widgets.length, and that is the number that
    //    decides. The server stays authoritative; this only makes the refusal legible.
    const workspaceId = d.workspaceId || sync?.current?.()?.workspace?.id;
    if (!workspaceId) throw new Error('Logga in för att skapa en widgetlänk.');
    const limit = await widgetLimit(fetchJson, workspaceId);
    if (list.length >= limit) throw quotaError(UPGRADE);

    // 3. Candidate. Local-first because cloud-sync reads the layout from storage, but nothing is
    //    copied until the server has accepted it.
    const candidate = Widgets.create(catalogKey, { placement: 'standalone' });
    list.push(candidate);
    if (typeof save === 'function') save();

    let result;
    try {
      result = await sync.push();
    } catch (err) {
      rollback(candidate.id);
      if (typeof save === 'function') save();
      throw networkError(err);
    }

    if (!result || result.ok !== true) {
      rollback(candidate.id);
      if (typeof save === 'function') save();
      if (result && result.status === 402) throw quotaError(UPGRADE);
      if (result && result.status === 409) {
        const err = new Error('Layouten ändrades i ett annat fönster. Ladda om och försök igen.');
        err.code = 'conflict';
        throw err;
      }
      throw networkError(result && result.error);
    }
    return { widget: candidate, reused: false };
  }

  function networkError(cause) {
    // The message is fixed. Anything carried out of a failed request could contain the overlay URL,
    // and the overlay URL contains the access token.
    const err = new Error('Widgeten kunde inte sparas. Kontrollera anslutningen och försök igen.');
    err.code = 'network';
    err.causeCode = cause && cause.status ? cause.status : undefined;
    return err;
  }

  // One click at a time per catalog entry: a double click must not produce two instances or two
  // quota checks racing each other.
  function createOnce(catalogKey, deps) {
    if (inFlight.has(catalogKey)) return inFlight.get(catalogKey);
    const promise = create(catalogKey, deps).finally(() => inFlight.delete(catalogKey));
    inFlight.set(catalogKey, promise);
    return promise;
  }

  // The empty-state flag exists for exactly one save: the one where the streamer deleted their last
  // widget on purpose. It is armed here, consumed by cloud-sync's push, and cleared in a finally so
  // an automatic save later in the session can never inherit it. It is never written to state, to
  // localStorage or into the cloud payload — cloud-sync reads it off the global and sends only the
  // boolean it computes from it.
  async function deleteStandalone(widgetId, deps) {
    const d = deps || {};
    const sync = d.sync || root.VyraCloudSync;
    const save = d.save || root.save;
    const confirmDelete = d.confirm || root.confirm;
    const list = widgets();
    if (!list) throw new Error('Layouten är inte laddad än.');
    const at = list.findIndex(w => w && w.id === widgetId);
    if (at === -1) return { deleted: false, reason: 'missing' };

    if (typeof confirmDelete === 'function' &&
        !confirmDelete('Ta bort widgeten? Länken slutar fungera direkt.')) {
      return { deleted: false, reason: 'cancelled' };
    }

    const removed = list.splice(at, 1)[0];
    const wasLast = list.length === 0;
    if (wasLast) root.__vyraUserEmptiedWidgets = true;
    try {
      if (typeof save === 'function') save();
      const result = await sync.push();
      if (!result || result.ok !== true) {
        list.splice(at, 0, removed);
        if (typeof save === 'function') save();
        return { deleted: false, reason: result && result.status === 409 ? 'conflict' : 'failed' };
      }
      return { deleted: true, widget: removed };
    } finally {
      if (wasLast) delete root.__vyraUserEmptiedWidgets;
    }
  }

  root.VyraStandalone = { create: createOnce, deleteStandalone, UPGRADE, rollback };

  if (typeof module === 'object' && module.exports) module.exports = root.VyraStandalone;
})(typeof window !== 'undefined' ? window : globalThis);
