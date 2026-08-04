# Live stabilization plan

Derived from `docs/live-readiness-matrix.md` (audit of `main` at `b2d3404`, 2026-08-04).

The matrix says what the state is. This says what to do about it, in what order, and — for the
several items where the honest answer is "we do not know yet" — what has to be measured before
anyone writes code.

One rule runs through the whole plan: **nothing here gets fixed on a hypothesis.** Two of the items
below already burned a cycle that way, and both are called out where they sit.

---

## A. Critical live blockers

Wrong behaviour, missing behaviour, broken sync, unreachable triggers, bad routing, unsafe writes.

### A1 — `gift-event-images.js` calls `save()` and `render()` on every gift
**Widest blast radius in the codebase.** The handler ends `if (changed) { save(); render(); }`. A
full canvas repaint plus a state write per gift, on the path shared by **Top Gift, Top Streak and
Gift Campaign**. The repaint destroys whatever animation is playing, which is the same class of
defect `VyraFlip` was built to solve in #52 and that PR #53 removes from Gift Fireworks.

*Fix:* patch the three widgets' DOM directly, the way `patchGoalDom()` does. No `render()`, no
`save()`, no full replacement.
*Risk:* medium — three widget families share the handler, so the DOM patch has to cover all three.
*Blocked by:* nothing.

### A2 — Top Streak shows Top Gift's data
`gift-event-images.js` writes **identical fields** to `templateTopGift` and `templateTopStreak`, and
`dataValue` takes `coins` before `count`. Both widgets end up showing the same person and the same
number. `live-leaderboard.js` has `updateTopGift()` and **zero** occurrences of `templateTopStreak`.
Confirmed visually on the 2026-08-04 stream: both showed the rose and `wpwer17`.

*Fix:* give Top Streak its own meaning — the streak length (`count`), and almost certainly the
**longest** streak rather than the most recent gift. That is a product decision before it is a code
change.
*Risk:* low once the meaning is decided.
*Blocked by:* **a decision from David** — see V4.

### A3 — `routeLiveBattleEvent()` matches event types the pipeline cannot deliver
```
media.js looks for : tap, snipe, glove, x2, x3, battle_mvp, gifter_level, fan_level, follow, like
ingest accepts     : gift, like, likes, chat, follow, share, member, subscribe, viewer, battle
overlap            : follow, like
```
Everything battle-shaped is matched against a name that is rejected at ingest before it can reach a
browser. `battle` does not satisfy `type.includes('battle_mvp')` either. **The wiring is real and the
handlers are correct** — they are waiting for words nothing says. This is why Glove Snipe and Fan
Level Up never fire, and it is not a missing function call.

*Fix:* unknown until we see a real `battle` event body. Either the client reads the sub-kind out of
the `battle` payload, or the bridge emits the finer types and the ingest whitelist grows to match.
*Risk:* medium — touches the ingest contract if it goes the second way.
*Blocked by:* **V2** (capture a real `battle` event).

### A4 — Fan Level Up is routed to the wrong widget
`action-runtime.js` sends any widget name containing `level` to `triggerGifterLevelUp`. A rule that
names the **fan** level widget therefore fires the **gifter** widget. Combined with A3 — `fan_level`
never arriving — Fan Level Up has no working path at all.

*Fix:* match the fan widget before the generic `level` fallback. Genuinely small.
*Risk:* **not zero** — an existing user rule named something like "level up" currently reaches the
gifter widget, and tightening the match silently changes what their rule does. Needs a deliberate
choice about existing rules, not just a reordered `if`.
*Blocked by:* nothing technical; wants a decision on existing rules.

### A5 — Heart Me Goal reads 0 while likes are flowing
Observed live: `0 / 50` on the goal while Top Likes showed `♥ 87` for the same user. The client chain
is sound end to end — markup hooks, `goalLiveFor()` and the DOM patcher all agree, and the server
maps `templateHeartGoal` to the `likes` metric. The claim gate in `goal-runtime.js` applies an event
only when a `goal_runtime` row with a matching metric exists; a missing row means likes are silently
dropped and the widget sits at zero forever.

*Fix:* unknown. Three candidates, and they need different fixes:
1. no `goal_runtime` row for that widget,
2. the row exists but no frame reaches the overlay,
3. the row exists and frames arrive but the client rejects them.

*Risk:* **high if guessed.** Fixing (1) when it is really (2) ships a change that does nothing and
looks like it worked.
*Blocked by:* **V1** — a database read and a frame capture. Do not write code before this.

### A6 — Overlay and Studio can show different layouts, silently
`overlay-access.js` renders the overlay state the **server** holds. Studio renders the **local**
session state reconciled by `cloud-sync.js` behind a conflict prompt. When they diverge the audience
sees widgets the streamer cannot see or delete — observed live: a Like Fountain visible in OBS and
absent from the layer list, which applies no filter at all.

*Fix:* the divergence is allowed by design (offline editing needs it). What is missing is that
**nothing reports it**. Minimum viable: Studio compares its widget id set against the overlay's on
load and says so.
*Risk:* low for a read-only warning; high for anything that auto-resolves.
*Blocked by:* nothing — but resist the urge to auto-sync.

### A7 — Gift Fireworks: the fix exists, the PR does not describe it correctly
**PR #53 must be corrected before merge.** Its stated root cause is wrong: it claims the combo never
reached `triggerGiftFireworks` because the event carries `count` while the call read `payload.combo`.
`liveEventTriggers()` sets `count`, `repeatcount` **and** `combo` from the same `e.count` — the value
was arriving all along.

The code in that PR is still right, for the other three reasons: `render()` per gift removed,
`save()` per gift removed, `fwCombo` no longer persisted into the saved layout, and a gift mid
animation extends rather than restarts.

*Fix:* rewrite the PR description and the one test that asserts `payload.count`; keep the code.
*Also:* the observed "only one firework" is better explained by `VyraAlertQueue` giving each
fireworks a six-second slot — measured across five separate gifts, the first plays at 54 ms and the
second not until 7 000 ms. Whether fireworks should leave that queue is a **design decision**, not a
bug: the queue is shared with Battle MVP, Gifter Level Up, Fan Level Up and New Follower, and taking
fireworks out means they can overlap other alerts.
*Blocked by:* a decision on the queue — see V5.

### A8 — a `localStorage` write on every live event
`ingest()` does `localStorage.setItem('vyra-live-event', …)` before every fan-out. Not a protected
key, so the write monopoly is intact — but it is a synchronous storage write per event, at an ingest
ceiling of 100 events/second per workspace.

*Fix:* the key looks like a cross-tab bridge. If nothing reads it, delete the write; if something
does, move it behind the same throttle the rest of the live path uses.
*Risk:* low, once we know who reads it.
*Blocked by:* **V3** — find the readers first.

---

## B. Non-blocking but incorrect

Wrong, but the stream survives them.

### B1 — Top Coins shows two different units at once
Zero rows keep the `♥` hardcoded in the shared row markup, while the first row gets the metric's own
icon (`●`) once real data lands. Seen on stream: rank 1 `● 52`, ranks 2–3 `♥ 0`. `live-leaderboard.js`
inherits the icon from the DOM (`em.textContent.trim().split(' ')[0] || '♥'`) instead of choosing it,
so a row that never receives data keeps the wrong unit forever. `rankingKinds` already declares the
right icon per type.
*Effort:* small. Highest visible-polish per line changed in this document.

### B2 — Chatbot overlay renders but never reacts
No live listener, no Actions reference. It is not misleading in a dangerous way — it simply does
nothing — but it is offered as a live feature.
*Effort:* unknown until someone decides whether it is meant to be live at all.

### B3 — Demo data differs between Studio and OBS
Correct by design: the editor needs something to lay out against, and `live-zero-state.js`
deliberately zeroes the overlay. But the same widget showing `658` in Studio and `0` in OBS reads as
a bug mid-stream. A label would cost nothing.

### B4 — The Gift Fireworks "Testa" button is faster than production
It bypasses `VyraAlertQueue` and fires immediately, so the editor demonstrates a responsiveness the
live path does not have. Worth making the test button honest once A7's queue question is settled.

---

## C. Preview-only / not ready

Visible in Studio, fed by nothing. **A streamer adding one has no way to tell it will never react.**
Everything here should be hidden or explicitly labelled before the next public live.

| Feature | Why | Recommendation before next live |
|---|---|---|
| **Last-X Alerts** | `window.triggerLastXAlert` is defined and called from nowhere. No `vyra-live-event` listener; absent from all 18 files that touch live data. | Label "kommer snart" or hide |
| **Last Gifter / Liker / Sharer / Subscriber** | Modes of Last-X, same dead trigger. No catalog entry; appear in `media.js` only as layer-panel labels. | Hide |
| **Glove Snipe** | Wired through `routeLiveBattleEvent()` on types that never arrive (A3). No Actions route. | Label until A3 is resolved |
| **Fan Level Up** | Both paths dead: `fan_level` never arrives (A3), and the Actions route sends it to the gifter widget (A4). | Label until A3 + A4 |
| **Chatbot overlay** | No live listener, no Actions reference. | Label or hide |
| **Like Fountain** | **Unknown, not preview-only.** `triggerLikeFountainPop` has a caller; the handler was never traced to a rendered effect. It may be fully live. | Do not label until V6 answers it |

---

## 1. Prioritized fix list

Ordered by *blast radius × certainty*, not by effort. Items blocked on measurement are listed where
they belong, marked with what unblocks them.

| # | Item | Class | Blocked by | Effort |
|---|---|---|---|---|
| 1 | A1 — remove `save()`/`render()` from the gift handler | A | — | M |
| 2 | A7 — correct PR #53's description and test, then merge | A | V5 for the queue half | S |
| 3 | A5 — Heart Me Goal | A | **V1** | ? |
| 4 | B1 — Top Coins icons | B | — | S |
| 5 | A2 — Top Streak's own data | A | **V4** (decision) | S–M |
| 6 | C — label or hide the preview-only widgets | C | V6 for Like Fountain | S |
| 7 | A4 — fan level routing | A | decision on existing rules | S |
| 8 | A6 — report overlay/Studio divergence | A | — | M |
| 9 | A3 — battle event vocabulary | A | **V2** | M–L |
| 10 | A8 — the per-event `localStorage` write | A | **V3** | S |
| 11 | B3 / B4 — label demo data, honest test button | B | — | S |
| 12 | B2 — decide what the chatbot overlay is | B | product decision | ? |

## 2. Recommended order before the next test live

The goal of a test live is to **learn**, so the order below front-loads whatever makes the next
stream more informative, and defers anything that needs a decision.

**Before the stream — code**

1. **A1.** Highest blast radius, nothing blocks it, and it makes every gift-driven widget behave
   predictably. Do this first or the next stream measures a moving target.
2. **A7.** Rewrite the description and the test, merge PR #53. The code is already verified in a
   browser; only the story is wrong. Leave the queue question alone for now.
3. **B1.** Small, visible, zero risk. Cheap credibility.
4. **C labels.** Whatever cannot be fixed must at least stop pretending. Last-X, Glove Snipe, Fan
   Level Up, chatbot. This is the single most valuable hour in the list — it stops the next stream
   generating bug reports we already understand.

**Before the stream — measurement, no code**

5. **V1** (Heart Me Goal). Ten minutes with the database answers a question that source cannot.
6. **V6** (Like Fountain). One widget, one stream, one answer.

**During the stream — observe only**

7. **V2.** Capture a real `battle` event body. Cannot be done any other way.
8. Watch whether Follower/Like Goal moves. If the heart goal is fixed by then and the social goal
   still is not, that narrows A5 by itself.

**After the stream**

9. A5 fix, now that V1 has said which of the three causes it is.
10. A2, once the streak's meaning is decided.
11. A3, with a real battle payload in hand.
12. A4, A6, A8.

**Explicitly not before the next live:** A3 and A5 fixes. Both are guesses until V1 and V2 come back,
and a guessed fix that appears to work is worse than a known gap.

## 3. Must verify, not guess

Each of these is a question source code cannot answer. Nothing downstream of one should be coded
before it comes back.

**V1 — Does the Heart Me Goal widget have a `goal_runtime` row, and do frames reach the overlay?**
Blocks A5. Three steps, in order:
```sql
SELECT overlay_id, widget_id, metric, baseline, progress, target, revision
  FROM goal_runtime WHERE overlay_id = '<overlayn>';
```
If no row for the heart widget → cause (1), and the fix is in the sync path.
If a row exists with `progress = 0` after a stream with likes → cause (2), and the fix is in ingest.
If `progress > 0` but the widget shows 0 → cause (3), and the fix is in the client after all.
Then open the OBS link with devtools and confirm whether `goal` frames arrive on the EventSource.

**V2 — What does a real `battle` event actually contain?**
Blocks A3. `TIKTOK_INGEST_TYPES` accepts `battle`, and `routeLiveBattleEvent()` wants `battle_mvp`,
`tap`, `x2`, `x3`. Capture one real event body during a battle and read its fields. That decides
whether the client learns to read the payload, or the bridge learns to emit finer types.

**V3 — Who reads `localStorage['vyra-live-event']`?**
Blocks A8. If nothing does, the write goes away. Search the desktop app too, not just the web client
— the two share this origin.

**V4 — What should Top Streak mean?** *(decision, not measurement)*
Blocks A2. Most likely "longest gift streak this stream", showing `count`. Confirm before building,
because "current streak" and "longest streak" are different widgets.

**V5 — Should Gift Fireworks leave `VyraAlertQueue`?** *(decision, not measurement)*
Affects A7's second half. The queue is shared with Battle MVP, Gifter Level Up, Fan Level Up and New
Follower. Leaving it means fireworks can overlap other alerts. Measured: a hundred separate gifts
currently play out over roughly ten minutes.

**V6 — Does Like Fountain actually render an effect on live likes?**
Blocks its classification. `triggerLikeFountainPop` has a caller, but the audit never traced the
handler to a painted effect. Add the widget, take likes, watch. One stream answers it.

**V7 — Does Follower/Like Goal move against a real stream?**
Its frame path is identical to the heart goal's, and the heart goal is known to sit at zero. It is
currently listed as **Live** in the matrix on the strength of the code path alone. If V1 finds a
server-side cause, this one is almost certainly affected too and its row should change.

---

## What this plan deliberately does not do

It does not schedule a fix for anything in section C beyond labelling. Last-X Alerts, the Last-*
family and the chatbot overlay are complete pieces of design work with no live wiring, and finishing
them is a feature project, not stabilization. Labelling them costs an hour and removes them as a
source of bug reports; building them out belongs in its own block, after the live path is trustworthy.
