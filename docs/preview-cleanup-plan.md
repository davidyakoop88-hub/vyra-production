# Preview-only cleanup — Studio exposure plan

> **Superseded in part.** The recommendation to hide Last-X Alerts was wrong and was never
> implemented. Last-X is live: `ingest()` (`live-client.js:130`) calls `routeLiveBattleEvent` for
> every event, and `last-x-alerts.js:385` rewraps it to fire `showLastX` on `gift`, `like`, `share`
> and `subscribe`. Proven in `tests/last-x-live-wiring.test.js`. Together with the Chatbot row, that
> is **two of the four** features in this plan that turned out not to be preview-only at all — both
> because the audit searched for a trigger by name instead of following the chain from `ingest()`.
> The Fan Level Up and Glove Snipe sections below still stand; nothing in this plan was implemented
> except the A4 routing fix.

Scope: only the features `docs/live-readiness-matrix.md` classifies as **preview-only or
misleading**, and only where Studio exposes them. Nothing is implemented here.

Line numbers are against `main` at the time of writing. Every file listed is minified-style
one-statement-per-line, so a "line" is a whole registration block.

---

## Correction to the matrix before anything is hidden

**The Chatbot overlay is not preview-only. It is wired end to end and must not be hidden.**

The matrix row says "no live listener, no Actions reference". That is wrong. The path exists:

| Step | Location |
|---|---|
| `chat` is a selectable action type, labelled "Skicka chatbotmeddelande" | `action-event.js:4` |
| An action of type `chat` dispatches `vyra:chatbot-send` | `action-runtime.js:58` |
| The overlay listens for it and renders the bubble | `chatbot-overlay.js:20` |

This is the same shape as **Sound Alerts**, which the matrix already classifies correctly as
live-via-Actions. The chatbot row should be reclassified the same way. It is also not in the widget
catalog at all — there is nothing to hide even if we wanted to.

What *is* true is narrower: the chatbot has no direct `vyra-live-event` listener, so it only ever
speaks when the streamer has configured an Actions rule. That is a configuration question, not a
dead feature.

**Recommended action: none. Fix the matrix row instead.**

---

## Inventory and recommendations

| Feature | Studio file | Current exposure method | Recommended action | Risk of hiding |
|---|---|---|---|---|
| **Last-X Alerts** (5 designs: Card, Stack, Skew, Badge, Royal Coronation) | `last-x-alerts.js:363–381` | JS-injected `<section data-last-x class="last-x-template-section">` prepended to `.widget-catalog` in `bind()`. 5 buttons `[data-last-x-add]`, each pushing a `templateLastX` widget. | **Leave alone — it is live.** See the banner above. | **High — do not hide.** Hiding would remove a working widget family from the catalog. |
| **Last Gifter / Liker / Sharer / Subscriber** | same block; modes of `templateLastX` (`TYPES` at `last-x-alerts.js:14–43`) | Not separately exposed. They are the `lastXType` field on a placed Last-X widget; new widgets default to `'all'`. | **Leave alone — live.** Each mode is driven by its own ingest type. | **High — do not hide.** |
| **Glove Snipe** | `media.js:541` (live entry) · `media.js:576` (already retired) | Its own catalog section was **already retired** — `media.js:576` removes `[data-glove-snipe]` on every bind. The only remaining path is `<div data-video-packs>` at `media.js:541`: 2 sections (Koi Pearl Lagoon, Masquerade Ball) × 4 buttons, each creating a `templateGloveSnipe` via `addBoostPack()`. | **Label, do not hide.** The buttons are branded as VIDEO FX packs, not as Glove Snipe. | **Medium.** Hiding `[data-video-packs]` removes the entire VIDEO FX pack offering, which is 8 of the catalog's buttons and is how the packs are sold visually. Hiding a widget class by removing an unrelated product surface is the wrong trade. |
| **Fan Level Up** (8 themes) | `media.js:441` | JS-injected `<section data-fan-level class="fan-level-template-section">` prepended to `.widget-catalog`. 8 buttons `[data-fan-theme]`, each creating a `catalog:fanlevel:<theme>` widget. | **Label** (preferred) or hide. See note below. | **Low-medium.** Nothing else reads `[data-fan-level]`. The risk is product-side: 8 finished designs disappear from the library for a routing bug that is a small fix. |

---

## Why "label" beats "hide" for Fan Level Up and Glove Snipe

Both are **one routing line away from working**, and both are the visible half of work that is
already finished:

- **Fan Level Up** — `action-runtime.js:58` routes any action whose widget name contains `level`
  to `triggerGifterLevelUp`. A rule naming the fan widget therefore fires the *gifter* widget.
  That is plan item **A4**, and it is a single conditional.
- **Glove Snipe** — `routeLiveBattleEvent()` fires it on `tap` / `snipe` / `glove` / `x2` / `x3`,
  none of which are ingest types (plan item **A3**).

Hiding them removes finished designs from the library to work around a defect that A3 and A4 fix
directly. Labelling tells the streamer the truth without throwing away the work, and reverses by
deleting one line.

**Last-X needs neither.** It works. The paragraph that used to stand here argued for hiding it on
the grounds that `window.triggerLastXAlert` has no caller. That is true and irrelevant: the live
path does not go through that name at all. See the banner at the top.

---

## The smallest, most reversible levers

### For hiding: follow the precedent already in the file

The codebase already retires a catalog section in exactly one line, at `media.js:576`:

```js
const retiredBattleCatalogBind=bind;bind=function(){retiredBattleCatalogBind();document.querySelector('[data-glove-snipe]')?.remove()};
```

Every injected section carries a stable `data-*` marker, so the same shape applies:

| Target | Marker |
|---|---|
| Fan Level Up | `[data-fan-level]` |
| Video FX packs (Glove Snipe) | `[data-video-packs]` |

This is one added line, reverses by deleting that line, touches no rendering code, and leaves every
already-placed widget working.

### For labelling: badge plus a disabled button

Each section's buttons are plain `<button>` elements inside a section with a stable class
(`fan-level-template-section`, `glove-snipe-template-section`). A label pass would:

1. append `<em class="vyra-preview-flag">PREVIEW · EJ LIVE</em>` to the section's `<h4>`
2. set `disabled` on the section's buttons

Both are attribute-level and reverse by deleting the block. No markup is rebuilt.

### What will *not* work: a `hidden: true` flag

`hidden` already exists in this codebase, but it means something else. It is a **per-placed-widget**
flag (`media.js:79–81`, `media.js:528–539`) that hides an instance already on the canvas, and
`tests/…` treats `hidden` and `placement` as deliberately separate concepts. Catalog entries are not
widget instances and have no `hidden` field to set — reusing the name here would overload a term
that already has a tested meaning.

Plain CSS `display: none` on the section classes is viable but weaker than the `data-*` removal: the
buttons stay in the DOM and stay clickable by keyboard and by script.

---

## Recommended order

1. **Fix the matrix row for Chatbot overlay.** It is misclassified, and the plan should not carry a
   cleanup item for a working feature.
2. ~~Hide Last-X Alerts~~ — **dropped.** It is live; hiding it would be a regression.
3. **Label the VIDEO FX packs** (Glove Snipe) — badge plus disabled buttons. Still open: A3.
4. **Fan Level Up needs no label for the Actions path** — A4 is fixed, so a streamer's own rule
   drives it correctly today. Only the automatic `fan_level` ingest path is still missing.
5. **Revisit after A3 lands.** The remaining label should come off at that point, which is the
   reason for preferring labels over removal.

---

## Must verify before implementing

- **V-P1** — Confirm `[data-last-x]`, `[data-fan-level]` and `[data-video-packs]` are the only
  entry points for their widget types. This inventory searched the Studio catalog path; a widget can
  also be created by a saved layout, by a standalone link, or by `VyraWidgets.create()` from
  elsewhere. Hiding a catalog button does not remove those.
- **V-P2** — Confirm the label markup survives `bind()` re-entry. Every section here is injected
  inside `bind`, which runs repeatedly and guards on its own marker; a label appended outside that
  guard would be re-appended on each pass.
- **V-P3** — Check both `view === 'editor'` and `view === 'overlay'`. The Fan Level and video-pack
  injections run in **both**, so a change made for Studio also affects the overlay catalog.
- **V-P4** — Verify in a real browser, not only in tests. The three defects found while fixing A1
  were all invisible to a sandbox DOM and only appeared against the rendered page.

## What this plan did not establish

- Whether any streamer has already placed a Last-X widget in a saved layout. Hiding the catalog
  entry does not remove existing ones, so this changes nothing for them — but it does mean the
  feature stays visible in the field.
- Whether the VIDEO FX packs have value independent of the Glove Snipe animation they create. That
  is a product question, and it is the reason this plan recommends labelling rather than hiding.
- "Last Follower" does not exist. The Last-X `TYPES` map defines exactly four modes — gifter, liker,
  sharer, subscriber. There is no follower mode to clean up; new-follower alerts are a separate,
  live widget.
