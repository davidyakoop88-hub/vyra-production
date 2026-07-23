# Recognition Runtime — Hardening Report (Roadmap Phase 2)

Date: 2026-07-22. Branch `feature/vyra-vfx-engine`. Reviewed as of commit `21cffb8`.

## Scope

A full-system review of the Recognition Engine (Types → Rules → Normalizer → Merge → Queue
→ Controller → Card Mapper → Card → Runtime), per the roadmap's Phase 2 checklist, plus new
automated hardening test cases added to `recognition-verify.js` and a check of the existing
`?recognitiondebug=1` diagnostics mode.

## Checklist results

| Item | Finding |
|---|---|
| Deterministic ordering | Already enforced — Queue orders strictly by `(priority desc, sequence asc)`, no `Date.now()`/wall-clock dependency in ordering logic. Covered by existing Queue test suite (Steg 5) and re-exercised end-to-end by the new 500-event stress case. |
| Timestamp consistency | Every timing-sensitive call (`push`, `tick`, `flush`) takes an explicit `now`; no file in the pipeline reads the real wall clock for behavior (only `recognition-card.js`'s own animation-phase `setTimeout`s use real time, which is outside the deterministic-logic surface by design). |
| Pause behavior | Re-verified manually this session (see `VYRA_PROJECT_STATE.md`): `pause()` blocks the next presentation from starting even while `tick()` is called repeatedly; `resume()` restores progression without shortening the current presentation's `endsAt`. |
| Stale event expiration | Already covered by existing Queue (`expiresAt`, lazy-checked on peek/dequeue, no timer) and Merge (`mergeWindowMs`/`expirationMs`) test suites. Not re-tested this pass beyond what Hardening 1's 500-event stress exercises incidentally. |
| Memory cleanup | New **Hardening 3** case: 20 repeated `mount()`/`clear()` cycles leave exactly one `.vyra-recognition-root` element in the DOM — confirms `mount()`'s idempotency doesn't accumulate duplicate Card root nodes. Full JS-heap-level leak detection was not performed (no profiler available in this environment); flagged for the Phase 18 performance audit, which has real tooling access. |
| Duplicate subscriptions | New **Hardening 4** case: 10 sequential `push()` calls against a single external `runtime.subscribe()` listener produce exactly 20 notifications (2 per immediate-kind push — `push` then `enqueue`, per the existing Runtime 43 baseline), proving `ensureWired()`'s lazy, once-only internal Merge/Controller subscription is not re-registered on every call. |
| Handling of malformed input | Already extensively covered — Normalizer/Merge/Queue/Card Mapper each reject non-object, missing-id, unknown-kind, negative-count/coins, and gift-without-data inputs without throwing (visible in the Node test run's `[recognition-*] rejected: ...` debug lines, all expected). |
| URL validation | `recognition-card.js`'s `sanitizeImageUrl()` is the single choke point for every external image (avatar + gift) — already covered by the existing Card test suite (Steg 8). No change needed. |
| Card replacement behavior | Already covered (Card 26: "show under aktivt kort ger replace"). Not re-tested this pass. |
| Merge-window boundaries | Already covered by the existing Merge test suite (Steg 4) and re-exercised functionally by this session's manual Like-burst-10 demo test (`mergedCount:10` confirmed). |
| Queue-full replacement | Already covered at the Queue level (Queue 13/14/15: full-queue drop vs. priority-based replace). New **Hardening 1** confirms this policy holds end-to-end through the full Runtime (`queue.size()` never exceeds `Rules.queue.maxLength` = 30 despite 500 pushed events). |
| Runtime after repeated start/stop cycles | New **Hardening 2** case: 25 start/stop cycles followed by a final `start()`, then a push+tick, correctly produces a new presentation — proves no degraded/stuck state accumulates. |
| Runtime after repeated mount/clear cycles | Covered by **Hardening 3** (see Memory cleanup row above). |
| Runtime after 500 mixed events | Covered by **Hardening 1** — no throw, queue bounded, zero new errors introduced by the stress sequence itself (measured as a before/after delta on `runtime.getStats()`, since stats are cumulative for the life of the shared singleton and earlier test sections had already added their own counts). |

## New test cases added

`recognition-verify.js` gained 4 new cases (`Hardening 1`-`4`), inserted into
`runRuntimeCases` immediately before the permanent destroy-lifecycle block (Phase I), since
they still need a live Runtime instance. Total automated case count: **242 → 246**.

One test-authoring bug was found and fixed during this pass (not a Runtime bug): the first
draft of Hardening 1 asserted `stats.errors === 0` as an absolute value, but Runtime stats are
cumulative for the life of the shared singleton (`clear()` only increments `stats.cleared`,
per its own documented contract) — by the time Hardening 1 runs, dozens of earlier test
sections have already incremented `errors`/`pushed`/etc. Fixed by asserting on the
before/after **delta** produced by this test's own 500-event loop instead.

## Diagnostics mode (`?recognitiondebug=1`)

Already exists across the entire pipeline (`recognition-runtime.js` and every sibling file),
added in earlier steps of this build — confirmed by direct read, not re-implemented:

```js
function isDevMode() {
  if (typeof window === 'undefined') return true; // Node / verification context
  try {
    return !!(window.location && /(^|[?&])recognitiondebug=1(&|$)/.test(window.location.search || ''));
  } catch (err) { return false; }
}
function logDebug(message) {
  if (!isDevMode()) return;
  try { console.debug('[recognition-runtime] ' + message); } catch (err) { /* no-op */ }
}
```

`logDebug()` is wired into every caught-and-swallowed error path in `recognition-runtime.js`
(`start`/`stop`/`pause`/`resume`/`tick`/`clear`/`destroy`/subscriber dispatch — 8 call sites).
It is silent by default in a browser (no query param → no `console.debug` calls at all) and
always-on under Node (so the test harness's own debug output, visible in every Node test run
above, is expected and intentional — not a leak into production browser behavior). No new
diagnostics code was needed for this phase; the existing mechanism already satisfies the
roadmap's requirement.

## Test results

- Node: **246/246 passed** (`node -e "require(...).run().then(...)"`).
- Browser (`recognition-verify.html`, fresh page load, single automatic `run()` invocation):
  **246 / 246 fall godkanda**, zero console errors (`read_console_messages({onlyErrors:true})`
  → "No console logs.").

## Conclusion

No Recognition Runtime defects were found during this hardening pass — the system was
already built to be deterministic, timer-free (outside Card's own permitted animation
timers), and defensively coded against malformed input from the Steg 1-9 work. This phase's
value is the **new regression coverage** (4 stress/lifecycle cases) and the **explicit
written confirmation** that the existing `?recognitiondebug=1` diagnostics mode meets the
roadmap's "never affects normal production behavior" requirement. No behavior changes were
made to any `recognition-*.js` file; only `recognition-verify.js` (new test cases) and this
report were added.
