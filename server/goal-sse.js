'use strict';
// Goal frames on the wire, and who is allowed to see them.
//
// A workspace has one Redis channel. Every overlay in that workspace listens to it, because raw
// TikTok events are workspace-wide by contract — two OBS links on the same account see the same
// gifts. Goals are not workspace-wide: a goal belongs to one overlay, and an OBS link is issued per
// overlay. So the same channel carries messages two connections must NOT both receive.
//
// That makes the write path the only safe place for the rule. sseChunk() is the single function that
// turns a message into bytes; openEventStream() has nothing else it can write. A frame for another
// overlay does not become a chunk, so there is no code path where it reaches res.write() — live or
// replayed, well-formed or not.
//
// Two more decisions worth stating, because they are easy to undo by accident:
//
//   Absolute, never delta. A frame carries the number the widget should show. SSE is lossy across a
//   reconnect and a browser cannot ask "what did I miss", so an increment would drift silently with
//   nothing able to correct it. One dropped absolute frame is corrected by the next one.
//
//   Frames are published, never added to the stream. xAdd would put them in the replay history that
//   Last-Event-ID reads, where they would be replayed to whoever reconnects with that id — and their
//   ids would move a client's resume position to something xRange cannot find. They are pub/sub only,
//   and carry no `id:` line.
//
// Nothing here logs. This module sees overlay ids, widget ids and per-link values on every event;
// the cheapest guarantee that none of it lands in a log line is to have no logging at all.
const { METRICS } = require('./goal-runtime');

// The frame, in full. Exactly these eight fields reach the browser — no workspace id, no user, no
// token, no event id. A widget needs the value, the target, which epoch it belongs to and which
// version of the row it is; anything else would be identity leaking through a public OBS link.
//
// revision is the ordering field and the browser uses nothing else for it. It was missing until
// 2026-08-04, which meant every frame after the first was discarded as "not newer" and the widget
// froze on its first value. tests/goal-contract.test.js now runs a row through this module and into
// the real goal-client.js, so the two halves cannot drift apart again.
const FIELDS = ['overlayId', 'widgetId', 'metric', 'value', 'target', 'epoch', 'at', 'revision'];

// An increment cannot be turned into an absolute frame here, and a caller sending both an absolute
// value and a delta has not decided what it means. Either way: reject, do not guess.
const DELTA_KEYS = ['amount', 'delta', 'increment'];

const MAX_ID = 160;

// Only a real number or a plain integer string. Number() alone would turn '', null, [] and true into
// 0 or 1 and quietly invent progress that never happened; pg hands back bigint as a string, which is
// why the string form has to be accepted at all.
function intOf(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.floor(value) : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

// The one field that must NOT go through intOf(). revision is bigint and unbounded — a busy goal
// takes one step per event and never resets — so past 2^53 Number() rounds two distinct revisions to
// the same double and the newer frame would compare as stale. It stays a string of digits the whole
// way: out of pg as a string, onto the wire as a string, compared by length-then-lexicographic in
// the browser. A plain integer is accepted for callers that hold a small one, and normalised.
function revisionOf(value) {
  const text = typeof value === 'number'
    ? (Number.isSafeInteger(value) && value >= 0 ? String(value) : '')
    : (typeof value === 'string' ? value.trim() : '');
  if (!/^\d+$/.test(text)) return null;
  return text.replace(/^0+(?=\d)/, '');
}

function idOf(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_ID ? trimmed : null;
}

const pick = (source, ...names) => {
  for (const name of names) if (source[name] !== undefined && source[name] !== null) return source[name];
  return undefined;
};

// The absolute value, from whichever shape the caller had. A goal_runtime row carries baseline and
// progress; a caller that already computed the number carries value. Both is allowed only when they
// agree — disagreement is a bug in the caller, and picking a winner would hide it.
function valueOf(update) {
  const direct = intOf(pick(update, 'value'));
  const baseline = intOf(pick(update, 'baseline'));
  const progress = intOf(pick(update, 'progress'));
  const hasParts = baseline !== null && progress !== null;
  const gaveParts = pick(update, 'baseline') !== undefined || pick(update, 'progress') !== undefined;

  if (direct !== null && hasParts) return direct === baseline + progress ? direct : null;
  if (direct !== null) return gaveParts ? null : direct;   // half a pair is an incomplete update
  return hasParts ? baseline + progress : null;
}

// A complete, absolute, normalised frame — or null. Never throws: this sits on the ingest path, and
// one malformed row must not take a request or a subscriber callback down with it.
function buildFrame(update) {
  try {
    if (!update || typeof update !== 'object' || Array.isArray(update)) return null;
    if (DELTA_KEYS.some(key => update[key] !== undefined)) return null;

    const overlayId = idOf(pick(update, 'overlayId', 'overlay_id'));
    const widgetId = idOf(pick(update, 'widgetId', 'widget_id'));
    const metric = pick(update, 'metric');
    if (!overlayId || !widgetId || !METRICS.includes(metric)) return null;

    const value = valueOf(update);
    const target = intOf(pick(update, 'target'));
    const epoch = intOf(pick(update, 'epoch'));
    if (value === null || value < 0) return null;
    if (target === null || target <= 0) return null;
    if (epoch === null || epoch < 1) return null;

    // Fail closed. A frame with no usable revision cannot be placed against the one already on
    // screen, and guessing — treating it as newest, or as oldest — is how an old value overwrites a
    // new one. Refusing costs at most one update; the next frame is absolute and carries the truth.
    const revision = revisionOf(pick(update, 'revision'));
    if (revision === null) return null;

    // The timestamp is the transport's, not the caller's: a missing or unusable one is filled in
    // rather than costing a real update, which none of the fields above would be.
    const at = intOf(pick(update, 'at')) ?? Date.now();

    return { overlayId, widgetId, metric, value, target, epoch, at, revision };
  } catch (_) {
    return null;
  }
}

// uuids are case-insensitive by definition, and both sides of this comparison are text out of
// Postgres. Folding case here means a frame is never dropped over spelling; everything else about
// this function is deny-by-default — no scope, no frames.
function visibleTo(frame, overlayId) {
  const scope = idOf(overlayId);
  if (!scope || !frame) return false;
  const owner = idOf(frame.overlayId);
  return !!owner && owner.toLowerCase() === scope.toLowerCase();
}

const frameEnvelope = frame => ({ goal: frame });
const isGoalMessage = item => !!item && typeof item === 'object'
  && item.goal !== undefined && item.goal !== null;

// The one place a message becomes bytes. Returns null for everything that must not be written, and
// unknown envelopes are in that set: a shape nobody recognises is dropped, not forwarded.
//
// Frames are rebuilt here rather than trusted. A publisher that skipped buildFrame — a future
// caller, a stale process, anything writing to the channel — cannot get an extra field onto the
// wire, because what is serialised is this function's own object, not the one that arrived.
function sseChunk(item, overlayId) {
  if (!item || typeof item !== 'object') return null;

  if (isGoalMessage(item)) {
    const frame = buildFrame(item.goal);
    if (!frame || !visibleTo(frame, overlayId)) return null;
    return `event: goal\ndata: ${JSON.stringify(frame)}\n\n`;
  }

  // Raw TikTok events, unchanged: workspace-scoped, replayable, same bytes for every overlay.
  if (item.event && typeof item.event === 'object' && item.streamId) {
    return `id: ${item.streamId}\nevent: live\ndata: ${JSON.stringify(item.event)}\n\n`;
  }
  return null;
}

// Publishes on the workspace channel — the same one raw events use, so one subscription per
// connection carries both. Refuses an invalid frame instead of putting it on the channel: every
// subscriber would have to drop it anyway, and it would be indistinguishable from a real one in a
// packet capture.
async function publish(eventBus, workspaceId, update) {
  const frame = buildFrame(update);
  if (!frame) return false;
  const client = await eventBus.connect();
  await client.publish(eventBus.channel(workspaceId), JSON.stringify(frameEnvelope(frame)));
  return true;
}

module.exports = { FIELDS, buildFrame, visibleTo, isGoalMessage, frameEnvelope, sseChunk, publish };
