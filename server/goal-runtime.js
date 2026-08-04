'use strict';
// Metric rules live in goal-metrics.js — the server's own copy, because widget-factory.js is
// outside the Docker build context. See tests/goal-metric-parity.test.js.
const Metrics = require('./goal-metrics');
// Live-driven goals: what an event is worth, and how that reaches Postgres exactly once.
//
// Progress is the server's, not the browser's. A layout link and a widget link for the same widget id
// read the same row, so they can never drift, and a reload or a Railway restart cannot reset a goal
// because nothing about it lives in localStorage.
//
// The whole design rests on one transaction per event:
//
//   1. Claim (workspace_id, event_id) — but only if the workspace actually has a goal for one of the
//      metrics this event contributes to. Claim and existence check are ONE statement, so there is no
//      window between "does a goal exist" and "write the id" for a concurrent reset to slip through,
//      and no idempotency row is written for an event nobody is counting.
//   2. Add every contribution in ONE update. A gift feeds two metrics — gifts by count, diamonds by
//      value — and both must land or neither, so a second claim per metric is not an option.
//
// Both statements share a transaction. A crash between them rolls back the claim too, which matters:
// a spent id with no increment would be a permanently lost event, invisible and unrecoverable.

// ---- what an event is worth ---------------------------------------------------------------------
// A streak has already been collapsed to its final frame by the bridge, so `count` is the streak's
// total and `value` is diamondCount x count. See tiktok-bridge/normalizer.js.
const METRICS = ['follows', 'likes', 'shares', 'gifts', 'diamonds'];

// One row per metric an event of this type feeds. A gift feeds two; everything else feeds one.
// `value` appears here only for diamonds — for a like it is TikTok's running room-wide total, and
// counting it would credit a goal with the whole room on every tap.
const CONTRIBUTIONS = {
  follow: () => [['follows', 1]],
  share: () => [['shares', 1]],
  like: event => [['likes', num(event.count)]],
  gift: event => [['gifts', num(event.count)], ['diamonds', num(event.value)]]
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function eventType(event) {
  const type = String(event?.type || '').toLowerCase();
  return type === 'likes' ? 'like' : type;
}

// The amount a single metric takes from an event. Zero when the event does not feed that metric at
// all, so a gift never nudges a like goal.
function goalAmount(metric, event) {
  if (!METRICS.includes(metric)) throw new Error(`Okänd metrik "${metric}" — giltiga: ${METRICS.join(', ')}`);
  const build = CONTRIBUTIONS[eventType(event)];
  if (!build) return 0;
  const row = build(event).find(([name]) => name === metric);
  return row ? row[1] : 0;
}

// Every non-zero contribution this event makes. Zero-amount rows are dropped before the claim, so a
// like with count 0 in a likes-only workspace writes no idempotency row for an increment of nothing.
function contributionsFor(event) {
  const build = CONTRIBUTIONS[eventType(event)];
  if (!build) return [];
  return build(event).filter(([, amount]) => amount > 0);
}

// ---- SQL ----------------------------------------------------------------------------------------
// Claim and existence check in one statement. RETURNING 1 is what makes "no rows" mean "already
// claimed, or nothing to count" — without it the INSERT reports nothing either way.
const CLAIM_SQL = `
  INSERT INTO goal_event_apply (workspace_id, event_id)
  SELECT $1, $2
  WHERE EXISTS (
    SELECT 1
      FROM goal_runtime gr
      JOIN overlays o ON o.id = gr.overlay_id
     WHERE o.workspace_id = $1
       AND gr.metric = ANY($3::text[])
  )
  ON CONFLICT (workspace_id, event_id) DO NOTHING
  RETURNING 1
`;

// goal_runtime is keyed by overlay; an event arrives for a workspace. The join through overlays is
// what turns one into the other. The contributions arrive as a VALUES table so a gift updates both
// its metrics in a single statement rather than one round trip per metric.
//
// baseline and target ride along in the RETURNING because the caller publishes an absolute goal
// frame from exactly these rows. Reading them back in a second query would be a second
// transaction's answer: by then a PATCH or a reset could have moved them, and the frame would carry
// a value that never existed.
function incrementSql(contributions) {
  const rows = contributions
    .map((_, i) => `($${i * 2 + 2}::text, $${i * 2 + 3}::bigint)`)
    .join(', ');
  return `
    UPDATE goal_runtime gr
       SET progress = gr.progress + contribution.amount,
           revision = gr.revision + 1,
           updated_at = now()
      FROM overlays o,
           (VALUES ${rows}) AS contribution(metric, amount)
     WHERE o.id = gr.overlay_id
       AND o.workspace_id = $1
       AND gr.metric = contribution.metric
       AND contribution.amount <> 0
    RETURNING gr.overlay_id, gr.widget_id, gr.metric, gr.baseline, gr.progress, gr.target, gr.epoch,
              gr.revision
  `;
}

// ---- write path ---------------------------------------------------------------------------------
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Applies one event to every goal in the workspace it feeds. Returns {applied:false} for a duplicate
// id and for an event no goal is counting — the caller cannot tell those apart, and does not need to.
// `opts.failAfterClaim` exists for the contract test that proves the rollback; nothing else sets it.
async function applyEvent(pool, workspaceId, event, opts = {}) {
  const contributions = contributionsFor(event);
  const eventId = String(event?.id || '');
  if (!eventId) throw new Error('Eventet saknar id — idempotens är omöjlig utan ett stabilt ID');
  if (!contributions.length) return { applied: false, updatedGoals: 0, epoch: null, rows: [] };

  return withTransaction(pool, async client => {
    const claim = await client.query(CLAIM_SQL,
      [workspaceId, eventId, contributions.map(([metric]) => metric)]);
    if (!claim.rowCount) return { applied: false, updatedGoals: 0, epoch: null, rows: [] };

    if (opts.failAfterClaim) throw new Error('injicerat fel efter claim');

    const params = [workspaceId];
    for (const [metric, amount] of contributions) params.push(metric, amount);
    const updated = await client.query(incrementSql(contributions), params);

    return {
      applied: true,
      updatedGoals: updated.rowCount,
      epoch: updated.rows[0] ? updated.rows[0].epoch : null,
      rows: updated.rows
    };
  });
}

// pg returns bigint as a string so precision is not silently lost. Every one of these fits in a
// Number, and a caller comparing progress === 0 must not fail against "0" depending on which
// function returned the row — so both readGoal and resetGoal pass through here.
//
// revision is deliberately NOT in that list. It is the one bigint here that is allowed to grow past
// 2^53, and it exists to order two writes against each other — the moment it becomes a double, two
// distinct revisions can compare equal and the newer frame looks stale. It stays a string of digits
// from the column to the widget.
function normalizeGoalRow(row) {
  if (!row) return null;
  return { ...row,
    epoch: Number(row.epoch), baseline: Number(row.baseline),
    progress: Number(row.progress), target: Number(row.target),
    revision: String(row.revision) };
}

// Reset clears progress and moves the goal into a new epoch. baseline is untouched — "start value"
// and "reset" are separate ideas, and a reset must not silently discard the number the streamer typed.
// The row lock is what serialises this against a concurrent event: whichever commits first, the other
// sees a consistent row, and the epoch on the increment says which order it was.
async function resetGoal(pool, overlayId, widgetId) {
  return withTransaction(pool, async client => {
    await client.query(
      'SELECT 1 FROM goal_runtime WHERE overlay_id=$1 AND widget_id=$2 FOR UPDATE',
      [overlayId, widgetId]);
    const q = await client.query(
      `UPDATE goal_runtime
          SET progress = 0, epoch = epoch + 1, revision = revision + 1,
              reset_at = now(), updated_at = now()
        WHERE overlay_id = $1 AND widget_id = $2
        RETURNING *`,
      [overlayId, widgetId]);
    return normalizeGoalRow(q.rows[0]);
  });
}

async function upsertGoal(pool, { overlayId, widgetId, metric, baseline = 0, target = 1000 }) {
  const q = await pool.query(
    `INSERT INTO goal_runtime (overlay_id, widget_id, metric, baseline, target)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (overlay_id, widget_id)
       DO UPDATE SET metric = EXCLUDED.metric, baseline = EXCLUDED.baseline,
                     target = EXCLUDED.target, revision = goal_runtime.revision + 1,
                     updated_at = now()
     RETURNING *`,
    [overlayId, widgetId, metric, baseline, target]);
  return q.rows[0];
}

// The displayed number is baseline + progress; nothing else may compute it.
async function readGoal(pool, overlayId, widgetId) {
  const q = await pool.query(
    'SELECT * FROM goal_runtime WHERE overlay_id=$1 AND widget_id=$2', [overlayId, widgetId]);
  const row = normalizeGoalRow(q.rows[0]);
  if (!row) return null;
  return { ...row, value: row.baseline + row.progress };
}

// One batch, one short statement. FOR UPDATE SKIP LOCKED is what lets two processes — or two
// replicas — drain at the same time: each takes rows the other has not locked rather than queueing
// behind it. Ingest only ever INSERTs, so it is never blocked by this either way. The window stays
// wider than the Redis dedupe TTL, so a row that could still be replayed is never removed.
const SWEEP_SQL = `
  DELETE FROM goal_event_apply
   WHERE ctid IN (
     SELECT ctid FROM goal_event_apply
      WHERE applied_at < now() - $1::interval
      LIMIT $2
      FOR UPDATE SKIP LOCKED
   )
`;

async function sweepApplied(pool, { olderThan = '48 hours', limit = 5000 } = {}) {
  const q = await pool.query(SWEEP_SQL, [olderThan, limit]);
  return { deleted: q.rowCount };
}

// A single 5 000-row batch covers 50 seconds of inflow at the 100 events/s ingest ceiling, so one
// batch per tick can never keep up: on a fifteen-minute timer the queue would grow by ~5 700 rows
// every round and the retention window would stop meaning anything.
//
// So several short batches per run, bounded twice. maxBatches caps the work, budgetMs caps the time,
// and a short batch means the queue is empty. Each batch is its own statement — never one long
// transaction holding locks across the whole drain.
//
// 20 x 5 000 per 60 s is 100 000 rows/minute against a need of 6 000. The time budget is the real
// guard; the batch cap stops a pathological queue turning one tick into a long job.
async function drainApplied(pool, { batch = 5000, maxBatches = 20, budgetMs = 5000,
                                    olderThan = '48 hours', now = Date.now } = {}) {
  const deadline = now() + budgetMs;
  let deleted = 0, batches = 0, exhausted = false;
  while (batches < maxBatches && now() < deadline) {
    const out = await sweepApplied(pool, { olderThan, limit: batch });
    deleted += out.deleted;
    batches += 1;
    if (out.deleted < batch) { exhausted = true; break }
  }
  return { deleted, batches, exhausted };
}

// The scheduler. `running` stops a slow drain from having a second one started on top of it by the
// next tick — the same shape startCapacityMonitor already uses. Errors go through the project's JSON
// line format and are swallowed, so a failing batch leaves the timer alive for the next tick instead
// of becoming an unhandled rejection.
function startAppliedDrain({ pool, metrics = null, intervalMs = 60_000, ...options } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return { skipped: true };
    running = true;
    const startedAt = Date.now();
    try {
      const out = await drainApplied(pool, options);
      const durationMs = Date.now() - startedAt;
      if (metrics) {
        metrics.gauge('goal_cleanup_last_run_at', startedAt);
        metrics.gauge('goal_cleanup_deleted', out.deleted);
        metrics.gauge('goal_cleanup_duration_ms', durationMs);
      }
      if (out.deleted) {
        console.log(JSON.stringify({ level: 'info', event: 'goal_cleanup', deleted: out.deleted,
          batches: out.batches, exhausted: out.exhausted, durationMs, at: new Date().toISOString() }));
      }
      return out;
    } catch (error) {
      if (metrics) metrics.gauge('goal_cleanup_errors', 1);
      console.error(JSON.stringify({ level: 'error', event: 'goal_cleanup_failed',
        message: error.message, at: new Date().toISOString() }));
      return { error: error.message };
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  // Cleanup must never be the only thing keeping the process alive.
  if (typeof timer.unref === 'function') timer.unref();
  return { stop: () => clearInterval(timer), tick, isRunning: () => running };
}

// ---- limits the goal API enforces ----------------------------------------------------------------
// Declared here rather than beside the functions that use them further down: module.exports runs at
// load time, and a const below it would still be in its temporal dead zone.
//
// 1e12 is far past any real follower count or diamond total, and four orders of magnitude below
// 2^53, so baseline + progress stays an exact JavaScript number in the widget that renders it. The
// bigint column would take far more; the browser is the binding constraint, not Postgres.
const MAX_GOAL_VALUE = 1_000_000_000_000;

// A PATCH may set the two numbers the streamer owns. progress, epoch and metric are the server's:
// progress comes from events, epoch from reset, metric from the widget in the layout.
const PATCH_FIELDS = ['baseline', 'target'];

module.exports = {
  METRICS, CLAIM_SQL, incrementSql,
  goalAmount, contributionsFor, normalizeGoalRow,
  applyEvent, resetGoal, upsertGoal, readGoal,
  SWEEP_SQL, sweepApplied, drainApplied, startAppliedDrain,
  syncGoalsFromState, putOverlayWithGoals,
  MAX_GOAL_VALUE, PATCH_FIELDS, validateGoalPatch, goalItem,
  listGoals, patchGoal, resetGoalWidget
};

// ---- overlay save and goal sync, in one transaction ----------------------------------------------
// A successful Layout save has to mean the goal is live. Splitting the save from the sync leaves a
// window where the widget is on screen and does not count, and those events are lost rather than
// delayed — nothing retries a save that already returned 200.
//
// Sync only ever adds what is missing and removes what is gone. It never UPDATEs: once a row exists
// the server owns baseline, progress, target and epoch, and a later save still carrying the old
// goalCurrent must not undo a PATCH or a reset.
async function syncGoalsFromState(client, overlayId, state) {
  const goals = Metrics.goalWidgetsIn(state);
  const ids = goals.map(g => g.widgetId);

  // An empty list is a real case — every goal removed — and `x <> ALL('{}')` is true for every row,
  // so this deletes them all without needing a special path.
  const removed = await client.query(
    'DELETE FROM goal_runtime WHERE overlay_id = $1 AND widget_id <> ALL($2::text[]) RETURNING widget_id',
    [overlayId, ids]);

  let created = 0;
  for (const goal of goals) {
    const q = await client.query(
      `INSERT INTO goal_runtime (overlay_id, widget_id, metric, baseline, target)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (overlay_id, widget_id) DO NOTHING
       RETURNING widget_id`,
      [overlayId, goal.widgetId, goal.metric, goal.baseline, goal.target]);
    created += q.rowCount;
  }
  return { created, removed: removed.rowCount, total: goals.length };
}

// The whole save. Auth, membership, body validation and same-origin stay outside — this owns the
// transaction and nothing else. Returns a typed outcome for the caller to map onto its existing HTTP
// contract; only a genuine database failure throws, which the shared handler turns into a 500.
async function putOverlayWithGoals(pool, { overlayId, workspaceId, name = null, state,
                                           expectedVersion, allowEmptyWidgets = false,
                                           failSync = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE so two saves racing on the same version serialise here rather than both reading the
    // old row and both believing they won.
    const existing = await client.query(
      'SELECT state, version FROM overlays WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
      [overlayId, workspaceId]);
    if (!existing.rows[0]) { await client.query('ROLLBACK'); return { missing: true } }

    // Wipe-guard: a client with empty local state must not silently blank a cloud layout that has
    // widgets. Same rule as before, now inside the transaction so a block leaves nothing behind.
    const hadWidgets = Array.isArray(existing.rows[0].state?.widgets)
      && existing.rows[0].state.widgets.length > 0;
    const incomingEmpty = !Array.isArray(state?.widgets) || state.widgets.length === 0;
    if (hadWidgets && incomingEmpty && allowEmptyWidgets !== true) {
      await client.query('ROLLBACK');
      return { emptyBlocked: true };
    }

    const updated = await client.query(
      `UPDATE overlays SET name=COALESCE($1,name), state=$2, version=version+1, updated_at=now()
        WHERE id=$3 AND workspace_id=$4 AND version=$5 RETURNING *`,
      [name, state, overlayId, workspaceId, expectedVersion]);
    if (!updated.rows[0]) { await client.query('ROLLBACK'); return { conflict: true } }

    // Same client, so the sync is inside this transaction. Using the pool here would commit
    // independently and defeat the whole point.
    const sync = await syncGoalsFromState(client, overlayId, state);
    if (failSync) throw new Error('injicerat syncfel');

    await client.query('COMMIT');
    return { ok: true, overlay: updated.rows[0], sync };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ---- the goal API's read and write paths ---------------------------------------------------------
// Everything below is what the four goal routes call. The routes own auth, membership, CSRF and the
// HTTP shape; these own the transaction and the rules about what a goal row may become.
//
// The overlay is the boundary. Every statement is keyed by (overlay_id, widget_id) and the overlay
// is loaded by its own id — optionally narrowed to a workspace — so a widget id belonging to another
// overlay simply does not exist for this one. There is no path where an id from the URL selects a
// row on its own.

const inRange = (value, min) => typeof value === 'number' && Number.isSafeInteger(value)
  && value >= min && value <= MAX_GOAL_VALUE;

// Number.isSafeInteger is the whole check: NaN, Infinity (which JSON turns into null on the way in
// anyway), decimals and any exponent landing outside 2^53 all fail it, and a numeric string fails
// the typeof before that. Returns {patch} or {error}; the route turns an error into a 400.
function validateGoalPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Patchen måste vara ett objekt med baseline och/eller target' };
  }
  const keys = Object.keys(input);
  if (!keys.length) return { error: 'Tom patch — ange baseline och/eller target' };
  const unknown = keys.filter(key => !PATCH_FIELDS.includes(key));
  if (unknown.length) return { error: `Okända fält: ${unknown.join(', ')}` };

  const patch = {};
  if ('baseline' in input) {
    if (!inRange(input.baseline, 0)) return { error: `baseline måste vara ett heltal 0–${MAX_GOAL_VALUE}` };
    patch.baseline = input.baseline;
  }
  if ('target' in input) {
    if (!inRange(input.target, 1)) return { error: `target måste vara ett heltal 1–${MAX_GOAL_VALUE}` };
    patch.target = input.target;
  }
  return { patch };
}

// The API shape, and the only place a row becomes one. pg returns bigint as a string so precision is
// never lost silently; every number a client sees is converted here exactly once. `at` is a
// millisecond number rather than a timestamp string, so the REST list and the SSE frame agree.
// revision is the exception and stays a string — see normalizeGoalRow. The snapshot this builds and
// the SSE frame are ordered against each other in the browser, so both have to carry it in the same
// form or a GET after a reconnect would look either newer or older than it is.
function goalItem(row) {
  const baseline = Number(row.baseline), progress = Number(row.progress);
  return {
    overlayId: row.overlay_id, widgetId: row.widget_id, metric: row.metric,
    baseline, progress, value: baseline + progress,
    target: Number(row.target), epoch: Number(row.epoch),
    revision: String(row.revision),
    at: new Date(row.updated_at).getTime()
  };
}

// FOR UPDATE, so a lazy backfill and a concurrent Layout save cannot both decide what this overlay's
// goals are. workspaceId narrows the lookup rather than being checked afterwards: an overlay in
// another workspace has to be indistinguishable from one that does not exist.
async function loadOverlay(client, overlayId, workspaceId) {
  const q = workspaceId
    ? await client.query('SELECT id, state FROM overlays WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [overlayId, workspaceId])
    : await client.query('SELECT id, state FROM overlays WHERE id=$1 FOR UPDATE', [overlayId]);
  return q.rows[0] || null;
}

// Sorted by widget_id, so two calls — and the OBS link and Studio — always agree on the order.
async function selectGoals(client, overlayId) {
  const q = await client.query(
    'SELECT * FROM goal_runtime WHERE overlay_id=$1 ORDER BY widget_id', [overlayId]);
  return q.rows.map(goalItem);
}

// Lazy backfill and listing in ONE transaction. Overlays saved before the PUT started syncing have
// goal widgets and no rows; a GET that returned an empty list and filled the table for next time
// would show a streamer nothing at all on the first load. The layout state is the authority on what
// is a goal — it comes from the database, never from the caller — so the same sync the PUT uses runs
// here, which also means a widget deleted from the layout stops being listed the moment it is gone.
async function listGoals(pool, overlayId, { workspaceId = null } = {}) {
  return withTransaction(pool, async client => {
    const overlay = await loadOverlay(client, overlayId, workspaceId);
    if (!overlay) return { missing: true };
    const sync = await syncGoalsFromState(client, overlayId, overlay.state);
    return { goals: await selectGoals(client, overlayId), sync };
  });
}

// The one row a write is about. Only a widget that is STILL a goal widget in the saved layout can be
// reached: an id that is unknown, deleted, or no longer a goal type gets `unknownWidget` and the
// transaction ends without having written anything — no row is created for it, and no other widget's
// row is touched on the way.
async function withGoalWidget(pool, overlayId, widgetId, workspaceId, apply) {
  return withTransaction(pool, async client => {
    const overlay = await loadOverlay(client, overlayId, workspaceId);
    if (!overlay) return { missing: true };

    const goal = Metrics.goalWidgetsIn(overlay.state).find(g => g.widgetId === widgetId);
    if (!goal) return { unknownWidget: true };

    // The same backfill the GET does, narrowed to this widget: a legacy overlay must be editable
    // without a listing call first, and DO NOTHING keeps the server's numbers if the row exists.
    await client.query(
      `INSERT INTO goal_runtime (overlay_id, widget_id, metric, baseline, target)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (overlay_id, widget_id) DO NOTHING`,
      [overlayId, goal.widgetId, goal.metric, goal.baseline, goal.target]);

    return apply(client);
  });
}

// COALESCE so an absent field keeps what is there — one field at a time is the normal case in the
// Studio UI, and a PATCH must never take the other one along by writing a default.
async function patchGoal(pool, overlayId, widgetId, patch, { workspaceId = null } = {}) {
  return withGoalWidget(pool, overlayId, widgetId, workspaceId, async client => {
    const q = await client.query(
      `UPDATE goal_runtime
          SET baseline = COALESCE($3, baseline), target = COALESCE($4, target),
              revision = revision + 1, updated_at = now()
        WHERE overlay_id = $1 AND widget_id = $2
        RETURNING *`,
      [overlayId, widgetId,
       patch.baseline === undefined ? null : patch.baseline,
       patch.target === undefined ? null : patch.target]);
    return { goal: goalItem(q.rows[0]) };
  });
}

// Reset means "start counting again", not "forget the numbers": progress goes to zero and the epoch
// moves, while baseline and target stay exactly as the streamer set them. The epoch is what lets a
// widget tell a reset apart from a lost event.
async function resetGoalWidget(pool, overlayId, widgetId, { workspaceId = null } = {}) {
  return withGoalWidget(pool, overlayId, widgetId, workspaceId, async client => {
    const q = await client.query(
      `UPDATE goal_runtime
          SET progress = 0, epoch = epoch + 1, revision = revision + 1,
              reset_at = now(), updated_at = now()
        WHERE overlay_id = $1 AND widget_id = $2
        RETURNING *`, [overlayId, widgetId]);
    return { goal: goalItem(q.rows[0]) };
  });
}
