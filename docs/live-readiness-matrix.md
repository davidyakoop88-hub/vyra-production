# Live-readiness matrix

Audit of every widget and overlay feature against `main` at `b2d3404`, 2026-08-04.

Method: the widget-type list, renderer files, live-event listeners, trigger functions and their
callers were extracted from source rather than recalled, then each live handler was read to see what
it actually does. Where a claim could not be settled from source it says **unknown** instead of a
guess.

## How live data reaches a widget

There is exactly one fan-out, and everything below hangs off it:

```
tiktok-bridge  →  POST /api/events/tiktok/:ws  →  Redis  →  SSE
                                                             │
  overlay-access.js (OBS link)  ─────────────────────────────┤
  live-client.js (Studio, web mode)  ────────────────────────┘
        │
        ├─ VyraDedupe gate            (one event once per browser source)
        ├─ localStorage['vyra-live-event'] = …   ← a storage write per event
        ├─ CustomEvent 'vyra-live-event'          ← 7 listeners
        └─ VyraActionEvent.handleEvent(trigger, payload)
                 └─ action-runtime.js execute() → runWidget() → window.trigger*()
                          └─ runtime-controls.js wraps 5 of them in VyraAlertQueue
```

Goals are the exception: they do not travel on `vyra-live-event` at all. The server computes them
and pushes an absolute `goal` frame on the same SSE connection, which `goal-client.js` consumes.

`payload` is built by `liveEventTriggers()` in `live-client.js` and carries `count`, `repeatcount`
and `combo` — **all three set from the same `e.count`**. Any of the three is equivalent.

## Matrix

Legend for status: **Live** = driven by real events end to end · **Preview-only** = renders but
nothing feeds it · **Partial** = fires but with a known defect · **Unknown** = not settled from source.

| Widget / feature | In Studio | Defined in | Overlay renderer | Real live trigger | Trigger source | State | Unsafe on live data | Prod-safe | Status |
|---|---|---|---|---|---|---|---|---|---|
| Top Likes | yes | `widget-factory.js` | `media.js` | yes | `vyra-live-event` → `live-leaderboard.js` | client | no | yes | **Live** |
| Top Coins | yes | `widget-factory.js` | `media.js` | yes | `vyra-live-event` → `live-leaderboard.js` | client | no | yes | **Partial** — zero rows keep the `♥` icon |
| Top Points | yes | `widget-factory.js` | `media.js` | yes | `vyra-live-event` → `points-system.js` | client (localStorage) | no | yes | **Live** |
| Top Gift | yes | `widget-factory.js` | `media.js`, `premium-final.js` | yes | gift → `live-leaderboard.js` `updateTopGift()` | client | **yes** — `gift-event-images.js` calls `save()` + `render()` | no | **Partial** |
| Top Streak | yes | `widget-factory.js` | `media.js`, `premium-final.js` | yes | gift → `gift-event-images.js` | client | **yes** — same `save()` + `render()` | no | **Broken** — identical data to Top Gift |
| Gift Campaign | yes | `widget-factory.js` | `media.js` | yes | gift → `gift-event-images.js` | client | **yes** — same `save()` + `render()` | no | **Partial** |
| Heart Me Goal | yes | `widget-factory.js` | `media.js` (`heartGoalHtml`) | yes | **server goal frame** → `goal-client.js` | **server** | no — rAF-batched DOM patch | yes | **Broken in production** — observed 0/50 while Top Likes read 87 |
| Follower / Like Goal | yes | `widget-factory.js` | `media.js`, `premium-final.js` | yes | **server goal frame** → `goal-client.js` | **server** | no — rAF-batched DOM patch | yes | **Live** (same frame path as above; unverified against a real stream) |
| Gift Fireworks | yes | `gift-fireworks.js` | `gift-fireworks.js` | yes | gift → Actions → `triggerGiftFireworks` | client | **yes** — `save()` + `render()` per gift | no | **Partial** — fix open in PR #53 |
| Like Fountain | yes | `widget-factory.js` | `media.js` | yes | likes → Actions → `triggerLikeFountainPop` | client | unknown | unknown | **Unknown** |
| Battle MVP | yes | `widget-factory.js` | `media.js` | yes | Actions → `triggerBattleMvp` (queued 8 s) | client | no | yes | **Live** |
| Gifter Level Up | yes | `widget-factory.js` | `media.js` | yes | Actions → `triggerGifterLevelUp` (queued 6 s) | client | no | yes | **Live** |
| Fan Level Up | yes | `widget-factory.js` | `media.js` | wired, never reached | `routeLiveBattleEvent` on type `fan_level` — **not an ingest type** | client | no | yes | **Preview-only in practice** |
| New Follower Alert | yes | `widget-factory.js` | `media.js` | yes | follow → Actions → `triggerNewFollower` (queued 5 s) | client | no | yes | **Live** |
| Glove Snipe | yes | `widget-factory.js` | `media.js`, `live-control.js` | wired, never reached | `routeLiveBattleEvent` on `tap`/`snipe`/`glove`/`x2`/`x3` — **none are ingest types** | client | no | yes | **Preview-only in practice** |
| Last-X Alerts | yes | `last-x-alerts.js` | `last-x-alerts.js` | yes | `ingest()` → `routeLiveBattleEvent` (rewrapped in `last-x-alerts.js:385`) → `showLastX` | client | no | yes | **Live** |
| Last Gifter / Liker / Sharer / Subscriber | no | — | `last-x-alerts.js` (as modes of Last-X) | yes | gift / like / share / subscribe via the same wrapper | client | no | yes | **Live** |
| Title | yes | `widget-factory.js` | `media.js` | n/a | static text | client | no | yes | **Live** (static by design) |
| Custom text / image / video | yes | `custom-widgets.js` | `custom-widgets.js` | n/a | static content | client | no | yes | **Live** (static by design) |
| Standalone widget links | yes | `standalone-links.js` | `public/widgets/base-widget.js` | yes | own `EventSource` on `/api/overlay-access/:token/events/stream` | server token | no | yes | **Live** |
| OBS overlay link | yes | `overlay-access.js` | `overlay-access.js` | yes | `EventSource` → `VyraLive.ingest` + `VyraGoals.attachSource` | **server** | no | yes | **Live** |
| Overlay zero-state | n/a | `live-zero-state.js` | `live-zero-state.js` | yes | `vyra-live-event` (disconnects on first real event) | client | no | yes | **Live** |
| Event dedupe | n/a | `event-dedupe.js` | `live-client.js` gate | yes | every ingest | client | no | yes | **Live** |
| Actions & Events | yes | `action-event.js` | `action-runtime.js` | yes | `VyraActionEvent.handleEvent` from `ingest()` | client (localStorage) | no | yes | **Live** |
| TTS Chat | yes | `tts-chat.js` | `tts-chat.js` | yes | `vyra-live-event` (chat) | client + server TTS | no | yes | **Live** |
| Sound Alerts | yes | `sound-alerts.js` | `sound-alerts.js` | via Actions | Actions engine only | client | no | yes | **Live** |
| Chatbot overlay | yes | `chatbot-overlay.js` | `chatbot-overlay.js` | via Actions | Actions type `chat` → `vyra:chatbot-send` → `chatbot-overlay.js:20` | client | no | yes | **Live-ready via Actions** |
| Points system | n/a | `points-system.js` | `points-system.js` | yes | `vyra-live-event` (gift/like/chat) | client (localStorage) | no | yes | **Live** |
| Stream time analytics | yes | `stream-time-analytics.js` | — | yes | `vyra-live-event` | client (localStorage) | no | yes | **Live** |
| State backup | yes | `state-backup.js` | — | n/a | 3 s timer, disabled in overlay mode | both | no | yes | **Live** |

## Critical issues

**1. `gift-event-images.js` calls `save()` and `render()` on every gift.**
The handler ends in `if (changed) { save(); render(); }`. That is a full canvas repaint and a state
write per gift, on the path shared by Top Gift, Top Streak and Gift Campaign. It breaks the rule the
session and goal work established — live data must never trigger a full render — and a repaint
destroys any animation currently playing. This is the single confirmed unsafe live path in the
client. Widest blast radius of anything in this audit.

**2. Top Streak has no data source of its own.**
The same handler writes identical fields to `templateTopGift` and `templateTopStreak`, and
`dataValue` takes `coins` before `count`. Both widgets therefore show the same person and the same
number; the streak length is never displayed. `live-leaderboard.js` has an `updateTopGift()` and no
streak equivalent — zero occurrences of `templateTopStreak` in that file.

**3. Heart Me Goal reads 0 in production while likes are flowing.**
Observed live: `0 / 50` on the goal while Top Likes showed `♥ 87` for the same user. The client
chain is sound — markup hooks, `goalLiveFor()` and the DOM patcher all agree, and the server maps
`templateHeartGoal` to the `likes` metric. The claim gate in `goal-runtime.js` only applies an event
when a `goal_runtime` row with a matching metric exists, so a missing row means likes are silently
discarded and the widget sits at zero forever. Not confirmed against the database.

**4. Overlay and Studio can show different layouts with nothing reporting it.**
`overlay-access.js` renders the overlay state the server holds; Studio renders the local session
state reconciled by `cloud-sync.js` with a conflict prompt. When they diverge the audience sees
widgets the streamer cannot see or delete — observed live with a Like Fountain visible in OBS and
absent from the layer list. The layer panel applies no filter at all, so anything missing there is
genuinely absent from local state.

**5. A localStorage write per live event.**
`ingest()` does `localStorage.setItem('vyra-live-event', …)` before every fan-out. Not a protected
key, so the write monopoly is intact, but it is a synchronous storage write on every event at an
ingest ceiling of 100 events/second per workspace.

**6. PR #53's stated root cause is wrong — correct before merging.**
It claims the combo never reached `triggerGiftFireworks` because the event carries `count` while the
call read `payload.combo`. `liveEventTriggers()` sets `count`, `repeatcount` **and** `combo` from the
same `e.count`, so the value was arriving all along. The code changes in that PR are still right —
removing `save()`/`render()` from the live path, not persisting `fwCombo`, extending rather than
restarting the animation — but the description and one test assert a defect that did not exist. The
observed "only one firework" is better explained by `VyraAlertQueue` giving each fireworks a
six-second slot, measured at five separate gifts: first plays at 54 ms, second not until 7 000 ms.

**7. `routeLiveBattleEvent()` listens for six event types the pipeline cannot deliver.**
`media.js` routes live events to the battle widgets by matching the event type against `tap`,
`snipe`, `glove`, `x2`, `x3`, `battle_mvp`, `gifter_level`, `fan_level`, `follow` and `like`. The
server's `TIKTOK_INGEST_TYPES` accepts only `gift`, `like`, `likes`, `chat`, `follow`, `share`,
`member`, `subscribe`, `viewer` and `battle`. The overlap is `follow` and `like` alone — everything
battle-shaped is matched against a type that is rejected at ingest before it can reach a browser.
Note `battle` does not satisfy `type.includes('battle_mvp')` either. The wiring is real and the
handlers are correct; they are simply waiting for names nothing emits.

## Preview-only or misleading features

These are selectable, render correctly, and are fed by nothing. A streamer adding one has no way to
tell it will never react.

| Feature | Why it never fires |
|---|---|
| **Fan Level Up** | One path left. The Actions half is **fixed** — `runWidget()` now tests `fan level` before `level`, so a rule naming the fan widget reaches `triggerFanLevelUp` (`tests/action-widget-routing.test.js`). What remains is the automatic path: `routeLiveBattleEvent()` fires it on event type `fan_level`, which the ingest whitelist does not accept. A streamer with an Actions rule can drive it today; nothing drives it on its own. |
| **Glove Snipe** | `routeLiveBattleEvent()` fires it on `tap`, `snipe`, `glove`, `x2` or `x3`. None of those are in `TIKTOK_INGEST_TYPES`, so no such event can ever arrive. There is no Actions route for it either; `live-control.js` drives it from the battle UI only. |
| **Gift Fireworks "Testa" button** | Fires immediately and bypasses `VyraAlertQueue`, so the editor shows a responsiveness the live path does not have — one gift plays for six seconds before the next is allowed to start. |

### Corrected after the first pass

Three rows in the table above were wrong in the first version of this audit, and the corrections
matter because a cleanup plan was nearly written against them.

- **Last-X Alerts** and its four modes are **live**, not preview-only. The first pass searched for
  callers of `window.triggerLastXAlert` and found none. That is the wrong name. The real path is
  `ingest()` in `live-client.js:130`, which calls `routeLiveBattleEvent(e)` for *every* live event;
  `last-x-alerts.js:385` rewrites that global and adds `showLastX` for `gift`, `like`, `share` and
  `subscribe` — all four real ingest types. Proven end to end in
  `tests/last-x-live-wiring.test.js`: a routed gift changes the widget's name from the `Alex`
  placeholder to the real username.
- **Chatbot overlay** is **live via Actions**, the same shape as Sound Alerts. `chat` is a
  selectable action type (`action-event.js:4`), `action-runtime.js` dispatches `vyra:chatbot-send`,
  and `chatbot-overlay.js:20` listens. It is not in the widget catalog at all.

Both mistakes share a cause: searching for a trigger by name instead of following the call chain
from `ingest()`. Anything still marked preview-only below should be re-checked that way before it is
acted on.

Two more that mislead without being dead:

- **Top Coins zero rows** keep the `♥` from the shared row markup while the first row gets the
  metric's own icon once real data lands, so one widget shows two different units at once.
- **Demo data outside overlay mode** is correct by design — the editor needs something to lay out
  against — but the same widget in Studio and in OBS shows different numbers, which reads as a bug
  during a stream.

## What this audit did not establish

- Whether Like Fountain's live path works end to end. `triggerLikeFountainPop` has a caller, but the
  handler was not traced to a rendered effect.
- Whether the Heart Me Goal row exists in production. That needs a database read, not source.
- Whether Follower/Like Goal updates against a real stream. The frame path is identical to the heart
  goal's, and the heart goal is known to be sitting at zero.

## Corrections made while auditing

Two claims in the first pass were wrong and are recorded here rather than quietly edited out.

The extraction script looked for callers of each `window.trigger*` while excluding the file that
defines it. `media.js` both defines and calls `triggerGloveSnipe` and `triggerFanLevelUp`, so both
were reported as having no caller at all. They are wired — through `routeLiveBattleEvent()` — and
the real reason they never fire is the event-type mismatch in critical issue 7. Same conclusion,
entirely different cause, and the wrong one would have sent someone hunting for a missing call.

`triggerLastXAlert` survived the same re-check: `last-x-alerts.js` contains exactly one occurrence,
the definition. That one has no caller anywhere.
