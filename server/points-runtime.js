'use strict';
// The points engine's server half — the workspace-scoped, idempotent twin of window.VyraPoints
// (action-runtime.js) and its computeLevel(). VyraPoints already exists and already works: it is a
// per-browser localStorage ledger, awarded manually via "Add points" Actions and automatically by
// points-system.js listening for 'vyra-live-event'. Neither path is idempotent (a re-delivered event
// just adds again) and neither is workspace-scoped (it is whichever tab happens to be open). This
// file does not replace that ledger — it gives the SAME earn-rate/level model an authoritative,
// crash-safe, multi-workspace home, following the exact pattern goal-runtime.js already proved for
// live-driven goals: claim (workspace_id, event_id) and increment in one transaction.
//
// See docs cross-reference: server/goal-runtime.js (CLAIM_SQL / applyEvent shape), server/
// viewer-levels.js (why level/points memory belongs on the server, not in a tab), action-runtime.js
// lines ~8-59 (the earn-rate settings shape and computeLevel this file ports).

// ---- earn-rate config -----------------------------------------------------------------------------
// Field names and defaults for perCoin/perShare/perLike/subscriberBonus/levelBasePoints/
// levelMultiplier are copied VERBATIM from action-runtime.js's POINTS_SETTINGS_KEY defaults and
// points-system.js's DEFAULTS, so a workspace that later migrates its localStorage settings into this
// table keeps the same numbers. perFollow and perComment are new: goal-runtime's CONTRIBUTIONS already
// models follow/share/like/gift as event types the platform counts, but VyraPoints never had a rate
// for a bare follow (TikFinity's own Points System page has one — a flat award, same shape as share).
// perComment defaults to 0, matching TikFinity's "comments/joins: 0 by default, configurable".
const DEFAULT_SETTINGS = {
  perCoin: 1,
  perShare: 50,
  perLike: 0.1,
  perFollow: 100,
  perComment: 0,
  subscriberBonus: 1,      // multiplier, not a percentage — same field/semantics as action-runtime.js
  levelBasePoints: 100,
  levelMultiplier: 1.2
};

const SETTINGS_FIELDS = Object.keys(DEFAULT_SETTINGS);
// points_settings' columns are snake_case (per_coin, level_base_points, ...); DEFAULT_SETTINGS and
// every function above the SQL layer use the camelCase names action-runtime.js already uses. This is
// the one place the two vocabularies meet.
const COLUMN_OF = Object.fromEntries(
  SETTINGS_FIELDS.map(f => [f, f.replace(/[A-Z]/g, c => '_' + c.toLowerCase())]));

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mergeSettings(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  const out = { ...DEFAULT_SETTINGS };
  for (const key of SETTINGS_FIELDS) {
    const raw = row[COLUMN_OF[key]];
    if (raw != null) out[key] = num(raw, DEFAULT_SETTINGS[key]);
  }
  return out;
}

// ---- what an event is worth ------------------------------------------------------------------------
// Mirrors goal-runtime.js's CONTRIBUTIONS: one small pure function per event type, event-type
// dispatch instead of a hardcoded if-chain, so a caller can unit-test "what does a like earn" without
// touching Postgres at all.
//
// Co-host gifts are excluded exactly like goal-runtime.js excludes them from a goal: `tillVarden`
// is the bridge's own determination of who the gift belongs to, and a gift the streamer never
// received must not inflate a viewer's points any more than it inflates a goal. `!== false`, not
// `=== true`, for the same reason goal-runtime.js uses it — an older bridge that never sends the
// field must count exactly as it does today.
function eventType(event) {
  const type = String(event?.type || '').toLowerCase();
  return type === 'likes' ? 'like' : (type === 'comment' || type === 'chat' ? 'comment' : type);
}

// event.value on a gift is already the streak's total coins (diamondCount x count — see
// goal-runtime.js's own comment on this), so the rate is applied to `value` alone, never `value *
// count`, or a multi-gift combo would be double-counted.
const AWARDS = {
  gift: (event, s) => event.tillVarden === false ? 0 : num(event.value, 0) * s.perCoin,
  like: (event, s) => num(event.count, 0) * s.perLike,
  follow: (_event, s) => s.perFollow,
  share: (_event, s) => s.perShare,
  comment: (_event, s) => s.perComment
};

// The amount ONE event earns its viewer, before rounding. Returns 0 for an event type the engine
// does not award points for (battle, viewer, member, ...) rather than throwing — an unknown type is
// not an error here the way an unknown METRIC is in goal-runtime.js, because every live event type
// reaches this function, not just the ones a workspace happens to be counting.
function pointsAmount(event, settings = DEFAULT_SETTINGS) {
  const build = AWARDS[eventType(event)];
  if (!build) return 0;
  const base = num(build(event, settings), 0);
  if (base <= 0) return 0;
  const subscriberBonus = Math.max(1, num(settings.subscriberBonus, 1));
  const bonus = (event?.isSubscriber || event?.isMember) ? subscriberBonus : 1;
  // Rounded to 4 decimals: perLike/perCoin are frequently fractional (0.1, 0.2, ...), and Postgres
  // numeric(20,4) below is the matching column precision — rounding here keeps the JS number and the
  // stored value in agreement instead of drifting at the 15th binary digit.
  return Math.round(base * bonus * 10000) / 10000;
}

// ---- level curve ------------------------------------------------------------------------------------
// Ported unchanged from action-runtime.js's computeLevel(): level N needs
// levelBasePoints*(levelMultiplier^(N-1)) MORE lifetime points than level N-1 needed in total. Kept as
// a live computation rather than a stored table on purpose — the background brief's competitor
// reference stores a static threshold table, but VyraPoints already has a formula-based getLevel(),
// and matching THAT (not the competitor) is what "extend what's there" means here. A workspace that
// changes levelBasePoints/levelMultiplier gets new thresholds for free with no migration.
function computeLevel(earned, settings = DEFAULT_SETTINGS) {
  const base = Math.max(1, num(settings.levelBasePoints, DEFAULT_SETTINGS.levelBasePoints));
  const mult = Math.max(1, num(settings.levelMultiplier, DEFAULT_SETTINGS.levelMultiplier));
  const points = Math.max(0, num(earned, 0));
  let level = 0, threshold = base, cumulative = 0;
  while (cumulative + threshold <= points && level < 999) {
    cumulative += threshold;
    level += 1;
    threshold = Math.round(threshold * mult);
  }
  return { level, pointsIntoLevel: points - cumulative, pointsForNextLevel: threshold };
}

// ---- SQL ----------------------------------------------------------------------------------------
// Same shape as goal-runtime.js's CLAIM_SQL, deliberately simpler: a goal claim is gated on "does a
// goal for this metric exist", because an ungated claim would write one idempotency row per event
// forever on a workspace with no goals. Points have no such gate — every workspace has a points
// ledger by definition — so the existence check goal-runtime.js needs is dropped, and what remains is
// exactly the ON CONFLICT (workspace_id, event_id) DO NOTHING pattern from goal_event_apply.
const CLAIM_SQL = `
  INSERT INTO points_event_apply (workspace_id, event_id)
  VALUES ($1, $2)
  ON CONFLICT (workspace_id, event_id) DO NOTHING
  RETURNING 1
`;

// One upsert, additive on both columns. `earned` only ever grows — this ledger has no spend/refund
// path yet (out of scope: this engine only AWARDS points from live events), so points and earned stay
// equal today, but are kept as two columns so a future spend feature (matching VyraPoints.spend/
// refund) can debit `points` without touching the lifetime total levels are computed from, exactly
// the distinction action-runtime.js's raknaSomIntjanat already draws client-side.
const AWARD_SQL = `
  INSERT INTO points_ledger (workspace_id, viewer_id, points, earned, updated_at)
  VALUES ($1, $2, $3, $3, now())
  ON CONFLICT (workspace_id, viewer_id) DO UPDATE SET
    points     = points_ledger.points + EXCLUDED.points,
    earned     = points_ledger.earned + EXCLUDED.earned,
    updated_at = now()
  RETURNING points, earned
`;

const SETTINGS_SQL = `SELECT * FROM points_settings WHERE workspace_id = $1`;

// ---- write path -----------------------------------------------------------------------------------
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

function viewerIdFor(event) {
  return String(event?.userId || event?.username || '').trim().slice(0, 160);
}

// Applies one event to one viewer's points ledger, exactly once per (workspaceId, event.id), inside
// one transaction — the same claim-then-increment shape as goal-runtime.js's applyEvent. Returns
// {applied:false} for a duplicate id, an event type this engine does not award, or an event with no
// resolvable viewer; the caller cannot (and does not need to) tell those apart, same contract as
// goal-runtime.js draws between "already claimed" and "nothing to count".
//
// `opts.failAfterClaim` exists only for the rollback contract test, mirroring goal-runtime.js.
async function applyEvent(pool, workspaceId, event, opts = {}) {
  const eventId = String(event?.id || '');
  if (!eventId) throw new Error('Eventet saknar id — idempotens är omöjlig utan ett stabilt ID');
  const viewerId = viewerIdFor(event);
  if (!workspaceId || !viewerId) return { applied: false, awarded: 0, points: null, earned: null, level: null };

  return withTransaction(pool, async client => {
    const settingsRow = await client.query(SETTINGS_SQL, [workspaceId]);
    const settings = mergeSettings(settingsRow.rows[0]);
    const amount = pointsAmount(event, settings);
    if (amount <= 0) return { applied: false, awarded: 0, points: null, earned: null, level: null };

    const claim = await client.query(CLAIM_SQL, [workspaceId, eventId]);
    if (!claim.rowCount) return { applied: false, awarded: 0, points: null, earned: null, level: null };

    if (opts.failAfterClaim) throw new Error('injicerat fel efter claim');

    const ledger = await client.query(AWARD_SQL, [workspaceId, viewerId, amount]);
    const points = Number(ledger.rows[0].points);
    const earned = Number(ledger.rows[0].earned);
    return { applied: true, awarded: amount, points, earned, level: computeLevel(earned, settings) };
  });
}

// ---- settings API ---------------------------------------------------------------------------------
async function getSettings(pool, workspaceId) {
  const q = await pool.query(SETTINGS_SQL, [workspaceId]);
  return mergeSettings(q.rows[0]);
}

// Partial update, COALESCE-style like goal-runtime.js's patchGoal: an absent field keeps whatever is
// already stored (or the default, on first write), never silently resets to DEFAULT_SETTINGS.
async function upsertSettings(pool, workspaceId, patch = {}) {
  const unknown = Object.keys(patch).filter(key => !SETTINGS_FIELDS.includes(key));
  if (unknown.length) throw new Error(`Okända inställningar: ${unknown.join(', ')}`);

  const columns = SETTINGS_FIELDS.map(f => COLUMN_OF[f]);
  const values = SETTINGS_FIELDS.map(f => patch[f] != null ? num(patch[f], DEFAULT_SETTINGS[f]) : null);

  const insertCols = ['workspace_id', ...columns].join(', ');
  const insertVals = ['$1', ...columns.map((_, i) => `COALESCE($${i + 2}, ${DEFAULT_SETTINGS[SETTINGS_FIELDS[i]]})`)].join(', ');
  const updateSet = columns.map((c, i) => `${c} = COALESCE($${i + 2}, points_settings.${c})`).join(', ');

  const q = await pool.query(
    `INSERT INTO points_settings (${insertCols})
     VALUES (${insertVals})
     ON CONFLICT (workspace_id) DO UPDATE SET ${updateSet}, updated_at = now()
     RETURNING *`,
    [workspaceId, ...values]);
  return mergeSettings(q.rows[0]);
}

// ---- reads ----------------------------------------------------------------------------------------
// points_ledger only ever stores viewer_id (see viewerIdFor above) — no display name, no avatar, on
// purpose: it is an idempotency-and-totals table, not a profile table, and a viewer's name/avatar can
// change after the row is written. gifter_totals already carries display_name/avatar_url for the same
// (workspace_id, viewer_id) pair (kept fresh by stream-stats.js on every event) and a viewer can only
// ever hold ONE (display_name, avatar_url) at a time per workspace regardless of how many
// tiktok_username rows they appear under, so DISTINCT ON (viewer_id), newest last_seen first, is a safe
// 1:1 pick — never a fan-out that would duplicate or drop a ledger row.
const PROFILE_JOIN = `
  LEFT JOIN (
    SELECT DISTINCT ON (viewer_id) viewer_id, display_name, avatar_url
    FROM gifter_totals
    WHERE workspace_id = $1
    ORDER BY viewer_id, last_seen DESC
  ) p ON p.viewer_id = l.viewer_id
`;

function normalizeLedgerRow(row, settings) {
  if (!row) return null;
  const earned = Number(row.earned);
  return {
    workspaceId: row.workspace_id, viewerId: row.viewer_id,
    displayName: row.display_name || null, avatarUrl: row.avatar_url || null,
    points: Number(row.points), earned,
    level: computeLevel(earned, settings)
  };
}

async function readLedger(pool, workspaceId, viewerId) {
  const settings = await getSettings(pool, workspaceId);
  const q = await pool.query(
    `SELECT l.*, p.display_name, p.avatar_url FROM points_ledger l ${PROFILE_JOIN}
     WHERE l.workspace_id = $1 AND l.viewer_id = $2`,
    [workspaceId, viewerId]);
  return normalizeLedgerRow(q.rows[0], settings)
    || { workspaceId, viewerId, displayName: null, avatarUrl: null, points: 0, earned: 0, level: computeLevel(0, settings) };
}

async function readTop(pool, workspaceId, { limit = 10 } = {}) {
  const settings = await getSettings(pool, workspaceId);
  const q = await pool.query(
    `SELECT l.*, p.display_name, p.avatar_url FROM points_ledger l ${PROFILE_JOIN}
     WHERE l.workspace_id = $1 ORDER BY l.points DESC LIMIT $2`,
    [workspaceId, limit]);
  return q.rows.map(row => normalizeLedgerRow(row, settings));
}

// ---- raw (unweighted) rankings ---------------------------------------------------------------------
// Top Like and Top Coins are NOT the points engine: David's explicit requirement is that they read raw
// gifter_totals counts and never touch points_settings/points_ledger or the earn-rate/level formula
// above. This reads a plain SUM of one gifter_totals column, workspace-scoped exactly like readTop, and
// shapes its rows into the SAME object shape normalizeLedgerRow produces (level always null — there is
// no level concept for a raw count) so the widget can stay metric-agnostic.
//
// gifter_totals' primary key is (workspace_id, tiktok_username, viewer_id): a workspace with more than
// one TikTok connection can have several rows for the same viewer_id. Summing the metric column
// GROUP BY viewer_id (instead of picking one row, the way PROFILE_JOIN's DISTINCT ON does for
// display_name/avatar_url alone) is what keeps such a viewer from being silently duplicated in — or
// dropped from — the leaderboard. display_name/avatar_url still only need ONE pick per viewer (a
// viewer has one identity regardless of how many rows they're summed from), so PROFILE_JOIN is reused
// unchanged for that part.
const RAW_METRIC_COLUMNS = { likes: 'likes', coins: 'diamonds' };

async function readTopRaw(pool, workspaceId, metric, { limit = 10 } = {}) {
  const column = RAW_METRIC_COLUMNS[metric];
  if (!column) throw new Error(`Unknown raw ranking metric: ${metric}`);
  const q = await pool.query(
    `SELECT g.viewer_id, p.display_name, p.avatar_url, SUM(g.${column}) AS metric
       FROM gifter_totals g ${PROFILE_JOIN.replace(/l\.viewer_id/, 'g.viewer_id')}
      WHERE g.workspace_id = $1
      GROUP BY g.viewer_id, p.display_name, p.avatar_url
     HAVING SUM(g.${column}) > 0
      ORDER BY metric DESC
      LIMIT $2`,
    [workspaceId, limit]);
  return q.rows.map(row => ({
    workspaceId, viewerId: row.viewer_id,
    displayName: row.display_name || null, avatarUrl: row.avatar_url || null,
    points: Number(row.metric), level: null
  }));
}

module.exports = {
  DEFAULT_SETTINGS, SETTINGS_FIELDS, mergeSettings,
  eventType, pointsAmount, computeLevel,
  CLAIM_SQL, AWARD_SQL,
  applyEvent, getSettings, upsertSettings, readLedger, readTop, readTopRaw, normalizeLedgerRow
};
