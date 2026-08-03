'use strict';
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
function incrementSql(contributions) {
  const rows = contributions
    .map((_, i) => `($${i * 2 + 2}::text, $${i * 2 + 3}::bigint)`)
    .join(', ');
  return `
    UPDATE goal_runtime gr
       SET progress = gr.progress + contribution.amount,
           updated_at = now()
      FROM overlays o,
           (VALUES ${rows}) AS contribution(metric, amount)
     WHERE o.id = gr.overlay_id
       AND o.workspace_id = $1
       AND gr.metric = contribution.metric
       AND contribution.amount <> 0
    RETURNING gr.overlay_id, gr.widget_id, gr.metric, gr.progress, gr.epoch
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
function normalizeGoalRow(row) {
  if (!row) return null;
  return { ...row,
    epoch: Number(row.epoch), baseline: Number(row.baseline),
    progress: Number(row.progress), target: Number(row.target) };
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
          SET progress = 0, epoch = epoch + 1, reset_at = now(), updated_at = now()
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
                     target = EXCLUDED.target, updated_at = now()
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

// Batched so a long vacuum pause cannot block ingest, and bounded by a window wider than the Redis
// dedupe TTL so a row that could still be replayed is never removed.
async function sweepApplied(pool, { olderThan = '48 hours', limit = 5000 } = {}) {
  const q = await pool.query(
    `DELETE FROM goal_event_apply
      WHERE ctid IN (SELECT ctid FROM goal_event_apply
                      WHERE applied_at < now() - $1::interval LIMIT $2)`,
    [olderThan, limit]);
  return { deleted: q.rowCount };
}

module.exports = {
  METRICS, CLAIM_SQL, incrementSql,
  goalAmount, contributionsFor, normalizeGoalRow,
  applyEvent, resetGoal, upsertGoal, readGoal, sweepApplied
};
