'use strict';
// The server's own copy of the goal-metric rules.
//
// widget-factory.js lives in the repo root, outside server/, which is the Docker build context.
// COPY ../widget-factory.js is not legal, and moving the context would change how the whole API is
// built — so the server cannot require it, and must not gain a runtime dependency on a file that is
// not in its image. The rule is therefore restated here, and tests/goal-metric-parity.test.js runs
// in the frontend suite, where both files exist, and fails if the two ever disagree.
//
// Anything that changes here has to change in VyraWidgets.goalKind() too, and the parity test is
// what makes that impossible to forget.

const GOAL_KINDS = { follows: 'follows', followers: 'follows', likes: 'likes' };

// followers is the legacy spelling of the same goal. Normalising it is what stops one variant
// producing two runtime rows with two different links.
function goalKind(value) {
  const raw = value === undefined || value === null || value === '' ? 'follows' : String(value);
  const canonical = GOAL_KINDS[raw];
  if (!canonical) {
    throw new Error('Okänd måltyp "' + raw + '" — giltiga: ' + Object.keys(GOAL_KINDS).join(', '));
  }
  return canonical;
}

// Only these two widget types are goals. Everything else returns null, which is what stops an
// arbitrary widget id from ever creating a runtime row.
function metricForWidget(widget) {
  const type = widget && widget.type;
  if (type === 'templateHeartGoal') return 'likes';       // a heart is a like; product decision
  if (type === 'templateSocialGoal') return goalKind(widget.goalKind);
  return null;
}

const nonNegative = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

// The number the streamer typed, used once when the runtime row is created and never read again —
// PATCH and reset are authoritative after that.
function baselineForWidget(widget) {
  return nonNegative(widget && (widget.goalCurrent ?? widget.heartCurrent));
}

// target has a CHECK (target > 0) in the schema, so a saved 0 has to be lifted rather than rejected.
function targetForWidget(widget) {
  return Math.max(1, nonNegative(widget && (widget.goalTarget ?? widget.heartTarget)) || 1000);
}

// Every goal widget in a saved overlay state, with what its runtime row should start as. Tolerates a
// malformed state rather than throwing: a broken blob must not take the whole request down.
function goalWidgetsIn(state) {
  const widgets = state && Array.isArray(state.widgets) ? state.widgets : [];
  const out = [];
  for (const widget of widgets) {
    if (!widget || !widget.id) continue;
    let metric;
    try { metric = metricForWidget(widget) } catch (_) { continue }  // unknown kind, not a goal here
    if (!metric) continue;
    out.push({
      widgetId: String(widget.id), metric,
      baseline: baselineForWidget(widget), target: targetForWidget(widget)
    });
  }
  return out;
}

module.exports = { GOAL_KINDS, goalKind, metricForWidget, baselineForWidget, targetForWidget, goalWidgetsIn };
