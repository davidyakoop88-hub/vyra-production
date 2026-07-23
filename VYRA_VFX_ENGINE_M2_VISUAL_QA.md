# VYRA VFX Engine — Milestone 2 Visual QA

**Branch:** `feature/vyra-vfx-engine` (unmerged)
**Scope:** Visual inspection only, in the freshly built VYRA application (`electron-app/dist2/win-unpacked/VYRA.exe`, rebuilt this pass with a small debug-only addition — see below). No production Like Fountain integration. No Milestone 3 work. No visual-design changes were made — this pass found no rendering bug that would justify one.

**One small code addition, disclosed up front:** the dev debug panel (`vfx-fountain-debug.js`) had no way to visualize the source spawn zone or the fade/removal boundaries — only the 7 lane paths. Since the task explicitly asked for evidence of all three, I extended the existing "show lane paths" checkbox (renamed "show lane paths + zones") to also draw a green spawn-zone circle at the source and gold/red dashed lines at the fade-start and removal boundaries. This is diagnostic-only geometry drawn into the same dev-only `PIXI.Graphics` layer that already existed, gated behind `?vfxdemo=2`, never reachable in production. I also added a `?forceReducedMotion=1` dev flag (`vfx-fountain-demo.js`) to reliably trigger the reduced-motion path without needing to change a real OS accessibility setting. Neither touches the widget's actual rendered design.

---

## Methodology and an honest caveat on capture reliability

Screenshots were captured from the real, freshly rebuilt Electron app's own bundled dev server (`127.0.0.1:4173`), viewed in a genuine desktop Edge window (Windows-MCP `Screenshot`), not the automated browser-tab tool — that tool's screenshot capability was non-functional for this entire session (confirmed it hangs even on a blank `about:blank` page, so this is an environment issue, not something caused by the fountain's WebGL content).

The desktop-capture path itself was unreliable in ways worth disclosing plainly:
- Window focus repeatedly shifted to other applications on the shared desktop between tool calls (outside my control), producing several screenshots of the wrong window that had to be discarded and retaken.
- The dev server itself died mid-session and had to be restarted — several early "the demo isn't showing anything" screenshots turned out to be `ERR_CONNECTION_REFUSED` pages, not a code problem.
- Precise sub-second timing (needed for the entrance-sequence request) is not achievable through this tool chain — every click→screenshot round trip carries multiple seconds of inherent latency, so "0.0 seconds" and "0.5 seconds" frames could not be captured with real precision.

Given that constraint, the entrance sequence below is reported as a **qualitative progression** (empty → rising → settled), each frame identified by what the debug HUD's own gate/particle-count state shows was actually happening, rather than by a false claim of exact timestamps. Everything else (aspect ratios, quality modes, reduced motion, width, intensity, lane debug) was captured cleanly and is reported with real numbers read directly off the on-screen HUD at capture time.

All captures show the dev-only debug HUD and control panel overlaid (by design, for this build) — the fountain itself renders as a full-viewport transparent layer on top of the real Studio dashboard, which is also incidentally the transparency test (see below).

---

## 1. Entrance sequence

Captured via Clear scene → Replay entrance, then a rapid best-effort progression of screenshots (exact elapsed time not achievable — see caveat above; each frame identified by its actual HUD state):

| Frame | HUD state observed | What's visible |
|---|---|---|
| Earliest capturable | `active: ~110`, `source intensity: 1`, hearts already present | Round-trip latency meant even the fastest possible screenshot landed after the source and sparkle gates had already opened; a true 0.0s empty-canvas frame wasn't achievable with this tooling. |
| Rising | `active: ~146`, growing | More hearts joining, particle count still climbing toward steady state, visibly denser than the first frame. |
| Settled / idle | `active: ~127-149`, `source intensity: 1`, all gates open | Full population, source portal fully lit, matches the same steady-state look seen consistently in every later quality-mode capture. |

**Assessment:** the *qualitative* shape of the entrance (sparse → populating → full) is visible and reads correctly — nothing pops in abruptly or looks broken. I cannot personally confirm the *exact* GSAP-authored timing (0.0/0.5/1.0/1.5/2.5s windows) matches the visual result frame-for-frame this pass; that would need either a real video capture tool or scriptable exact-timestamp screenshotting, neither of which was reliably available this session.

---

## 2. Stable idle — portrait / landscape / square

Captured by resizing the actual Edge window to each aspect ratio *before* loading the page (so the canvas correctly sizes at construction, per the resize architecture fixed in the hardening pass), then letting the entrance settle.

- **Portrait** (narrow window): the responsive dashboard sidebar correctly collapsed to icon-only, and the fountain's fan shape was still clearly visible and centered within the narrower viewport — hearts didn't clip or bunch into a corner.
- **Landscape** (wide window): fountain rendered correctly across the wider canvas, fan shape intact, no stretching or distortion.
- **Square**: fountain adapted correctly, fan shape still read clearly, no obvious cropping.

**Assessment:** the widget adapted its geometry correctly at all three aspect ratios — consistent with the hardening pass's resize-propagation fix. No visual breakage at any ratio.

---

## 3. Quality modes

Directly selected via the debug panel's Quality dropdown, each given a moment to settle:

| Quality | Active particles | Trails | Visible difference |
|---|---|---|---|
| Low | 92 | 0/216 (disabled) | Noticeably sparser — fewer hearts, no trails — but still colorful, still shows the source portal, still reads as the same design, just quieter. |
| Medium | 117 | 2/216 | Visibly fuller than Low; trails beginning to appear. |
| High | 142 | 5/216 | Rich, well-populated fan; this is the mode used for every other capture in this report by default. |
| Ultra | 140-149 | 8/216 | Comparable density to High in a single still frame (the two budgets are close: 380 vs 600 max, and steady-state population is spawn-rate-limited, not budget-limited — see the hardening report's Little's-Law explanation) — the visible difference is more trail presence and a slightly higher ceiling for bursts, not a dramatically busier frame at rest. |

**Assessment:** quality changes are visually smooth in the sense that nothing broke or glitched when switching between them (consistent with the hardening pass's programmatic 60fps-across-transitions measurement) — I did not capture the actual *transition moment* on video, so I can't personally attest to zero visual popping mid-transition; the static before/after frames themselves look correct and continuous in overall composition.

**Does Low still look premium?** Yes, reasonably — the same crystal-heart shapes, same violet/pink/blue/gold coloring, same glowing source are all present; it's simply a lighter density, not a degraded look.

**Does Ultra look richer without becoming noisy?** At the density levels actually reached in these captures, yes — more trails and a higher population ceiling, but not visually cluttered or chaotic in these frames.

---

## 4. Reduced-motion mode

Forced via the new `?forceReducedMotion=1` dev flag (see disclosure above). HUD confirmed: `quality: low (reduced motion)`, `active: 54`.

**Assessment:** noticeably the sparsest state captured (below even plain Low's 120-particle budget, matching the dedicated `reducedMotion` budget's 60-particle cap from the hardening pass), but still visually coherent — recognizable crystal hearts, source glow still present, not an empty or broken-looking canvas. It reads as "calm" rather than "off," which is the right target for this mode. As already flagged in the hardening report, the entrance easing and lane-arc *shape* are unchanged for reduced-motion viewers — only density/effects scale down — so a viewer sensitive to swooping motion would still see the same path shapes, just fewer of them.

---

## 5. Fountain width — narrow / default / wide

Adjusted via the debug panel's Width slider (keyboard-stepped for precision, value confirmed on-screen each time):

- **Narrow (0.50):** hearts visibly pulled in toward the center, fan noticeably tighter.
- **Default (1.00):** the fan width seen in every other capture in this report — a clear, moderate spread.
- **Wide (1.50):** hearts visibly pushed outward, fan noticeably broader, reaching further toward the canvas edges.

**Assessment:** the width control produces a clear, correctly-directional visual change at both extremes — narrow genuinely looks narrower, wide genuinely looks wider — with no distortion or breakage at either end.

---

## 6. Intensity — 25% / 50% / 100%

Adjusted via the debug panel's Intensity slider:

| Intensity | Active particles | Source intensity |
|---|---|---|
| 25% | 34 | 0.25 (visibly dimmer glow) |
| 50% | 72 | 0.50 |
| 100% | 149 | 1.00 (full brightness, matches every default capture) |

**Assessment:** intensity scales both particle population and the source portal's glow brightness together, producing a clean, proportional dimming rather than just fewer particles at full brightness — this reads correctly as an "intensity" control, not just a density control.

---

## 7. Lane debug view

Captured with "show lane paths + zones" enabled: all three requested elements are visible in a single frame —
- **All 7 bezier lanes**, drawn as distinctly colored curves fanning from a single bottom point outward to the top, clearly showing the intended fan silhouette.
- **Source spawn zone**, drawn as a green circle at the convergence point — correctly reads as "this is where everything originates."
- **Fade/removal boundaries**, drawn as dashed horizontal lines near the top of the canvas — the fade-start line is clearly visible; the removal line (further above/off the visible canvas per its geometry, `removedY: -0.05`) was not visible within this particular window's canvas height, which is expected given its position is slightly above the top edge by design.

**Assessment:** this view directly confirms the fan shape's underlying geometry is correct — lanes visibly converge at one bottom point and spread symmetrically outward, matching the "readable fan silhouette" requirement.

---

## Answers to the full evaluation checklist

| Question | Answer |
|---|---|
| Is the fan silhouette readable? | **Yes** — clearly confirmed via the lane-debug view and visible in every normal capture; hearts spread outward from a bottom point, not a straight column. |
| Is the center sufficiently populated? | **Yes** — center/inner lanes visibly carry more particles than far-outer lanes in every capture, consistent with the weighted lane selection added in the hardening pass. |
| Are outer lanes controlled rather than chaotic? | **Yes** — outer lanes follow smooth, fixed bezier arcs (visible clearly in the lane-debug view) and carry fewer particles by design; nothing reads as scattered or random. |
| Does the source look like an energy portal? | **Partially confirmed** — a glowing core is clearly visible in every capture; the ring/ray/spark details described in the M2 spec are present per code but hard to fully verify at the screenshot resolution used this pass (see Visual Defects section). |
| Do the hearts look crystalline at actual viewing size? | **Plausibly yes, not fully verifiable this pass** — visible faceting/gradient in the captures, but screenshot downscaling (a 3840×1080 desktop capture) limits fine-detail confidence; see Visual Defects. |
| Are foreground, midground and background visually distinguishable? | **Yes, moderately** — a visible size/brightness gradient between smaller-dimmer and larger-brighter hearts is present in every capture; it reads as depth layering, not a strong parallax/blur effect (by design — the M2 spec never asked for blur). |
| Are hero hearts rare enough? | **Yes** — occasional larger hearts visible among many small/medium ones in every capture, consistent with the 5% HERO weight. |
| Are trails subtle? | **Present but hard to visually confirm as distinct in these screenshots** — HUD counts (0–8 active) show trails were rendering, but I could not clearly pick out individual trailing streaks at this screenshot resolution. Flagged honestly as unverified rather than claimed either way. |
| Are sparkles supporting the fountain rather than filling the screen? | **Yes** — sparkles read as small accent dots around the hearts, not a screen-filling layer, in every capture. |
| Is movement smooth during quality changes? | **Not directly re-verified visually this pass** (no video capture available) — the hardening report's programmatic measurement (steady 60fps across all quality transitions, zero dropped frames) is the actual evidence for this; static before/after frames here are consistent with that but don't independently prove smoothness mid-transition. |
| Does Low quality still look premium? | **Yes** — same visual language, just less dense. |
| Does Ultra look richer without becoming noisy? | **Yes**, at the densities actually reached in these captures. |
| Does reduced motion remain visually attractive? | **Yes, though clearly the sparsest state** — still coherent, not broken or empty-looking. |
| Are any hearts blurry, pixelated or incorrectly tinted? | **None observed** — colors read correctly (violet/pink/blue/gold variants visible), no obvious pixelation, consistent with the hardening pass's texture/tint bug fix. Caveat: screenshot downscaling limits certainty at the pixel level. |
| Does the effect look good on a transparent background? | **Yes** — every capture shows the fountain correctly composited over the real (dark-themed) Studio dashboard with no opaque background box. Not tested against a bright/light background this pass. |

---

## VISUAL DEFECTS AND DESIGN WEAKNESSES

Reported honestly, not softened:

1. **Entrance-sequence timing could not be precisely verified this pass.** I can confirm the entrance qualitatively ramps from sparse to full, but not that it hits the exact 0.0/0.5/1.0/1.5/2.5s windows specified in the original M2 design brief — that needs either real video capture or precise scriptable screenshot timing, neither reliably available this session.
2. **Trails are visually hard to distinguish in these captures.** The HUD confirms they're active (0–8 concurrent), but I could not clearly pick out individual tapered trail streaks at the screenshot resolution used. This might mean they genuinely read as "subtle" (the intended design goal) — or it might mean they're too subtle to register at all at typical viewing distance/resolution. This needs a closer, zoomed-in follow-up check before being called either a pass or a defect.
3. **Source-portal fine detail (rings, rays, sparks) is hard to independently verify at this capture resolution/size.** The M2 hardening report's own "visual differences from target" section already flagged known gaps here (soft gradient vs. hard-faceted crystal look, shimmer-as-pulse vs. a true moving highlight, ring wobble vs. true rotation) — nothing in this visual pass contradicts or resolves those; they remain open.
4. **The dev demo overlays the entire Studio dashboard**, not a clean isolated canvas — every capture includes the real app's nav, stat cards, and the debug HUD text itself layered on top. This makes it harder to judge the fountain purely on its own merits from a screenshot; a future QA pass would benefit from a clean, isolated black/checkered-background capture mode.
5. **Debug HUD text partially occludes the canvas** in every capture (fixed top-left position). Purely a dev-tooling artifact — never present in production — but it did shrink the usable frame for visual judgment this pass.
6. **Transparency was only tested against one (dark) background.** The composited-over-dashboard look reads well, but a light/bright background was not tested this session.
7. **No obvious rendering bug was found.** Per the task's own instruction ("do not modify the visual design yet unless there is an obvious rendering bug"), no such bug was found, so no design changes were made this pass beyond the disclosed dev-only debug-visualization addition.

---

## Milestone 3

Not started, per instruction. Production Like Fountain integration not started, per instruction. Waiting for visual review.
