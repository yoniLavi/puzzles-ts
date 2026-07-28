# Findings — fix-worker-repaint-nonsquare (WITHDRAWN 2026-07-28)

## Re-confirmation, 2026-07-28 (the pass that closed it)

The change was reopened one last time before archiving, to check the 2026-07-21
result still held on a tree that had gained ~20 commits since (nine game ports,
the app-shell click/release fix, the custom-params dialog work).

Both URLs the proposal names as staying blank were loaded cold in a **visible**
Chrome (`document.visibilityState === "visible"` asserted *first*, driven via
the `playwright-cli` skill, viewport 1280×720):

| URL | Canvas | Result |
|---|---|---|
| `/loopy?type=5x4t9dh` (4x5 Dodecagonal, Hard) | 741×487 non-square | **fully painted on first load** — grid, clues, dots all present |
| `/loopy?type=5x4t14dh` (4x5 Kagome, Hard) | non-square | **fully painted on first load** |

Zero console errors on either. No menu had to be opened, no resize forced. This
is the third independent non-reproduction; the owner withdrew the change.

**Scope note (owner directive, same day):** WebKit and Firefox — listed below as
"the gap" — are **explicitly out of scope for this phase**. Chrome-only browser
verification is sufficient evidence here (see `AGENTS.md`, "Browser checks:
Chrome only"). The item below is retained as history, not as outstanding work.

---

## Original pass (2026-07-21)

**Status: parked as not-reproducible.** Owner decision 2026-07-21, after a full
diagnosis pass. The change's core hypothesis — "a repaint is being dropped on
some resize/first-frame path specific to `w ≠ h`" — was **not confirmed; it was
contradicted**. No code fix was written. Do not implement §2 until the bug is
reproduced somewhere with a known mechanism (see "How to resume").

## What was tested

App served by `npm run dev` (all games TS-served). Instrumented the main-thread
`Puzzle` wrapper (`puzzle.ts`) and `puzzle-view.ts` to log the real ordering of
`attachCanvas → setDrawingPalette → size → resizeDrawing → redraw`, and read the
worker's actual offscreen bitmap via `puzzle.getImage()` (distinct-colour count
= "did the board really paint"). Instrumentation was temporary and has been
reverted — the tree is clean.

Drivers:

- **MCP "claude-in-chrome"** — *unusable for this bug, and the source of the
  original false signal.* Its automation tab runs permanently
  `document.visibilityState === "hidden"`. A hidden tab (a) pauses
  `requestAnimationFrame`, so `attachCanvas`'s `await nextAnimationFrame()`
  never resolves and `createCanvas` freezes mid-sequence, and (b) does not
  mirror the OffscreenCanvas to the onscreen canvas. Either alone shows a blank
  board regardless of the real bug. **A blank board in this tool proves
  nothing.**
- **Playwright (Chromium 1228), headless — page reports `visible`.** The real
  code path.
- **Playwright (Chromium), headed — real GPU compositor + real `.attached` CSS
  size transition.**

## Results (all Chromium)

| Scenario | Onscreen | Offscreen bitmap |
|---|---|---|
| `/loopy?type=5x4t9dh` (non-square 883×580) headless-visible | painted correctly | 28 colours @ 1766×1160 |
| same, headed (real compositor + transition) | painted correctly at 120–1500 ms | — |
| same + forced viewport resize after first paint | still painted | 29 colours, unchanged |
| `/loopy?type=7x7t0dh` (square 588×588) | painted correctly | 11 colours @ 1176×1176 |
| `/pearl?type=12x8dt` (non-square 882×590) | painted correctly | 18 colours @ 1764×1180 |

**In every case the worker's offscreen canvas was fully painted.** The engine
repaint is *not* dropped. The onscreen result matched.

## Why this contradicts the proposal

1. **No dropped engine repaint.** The offscreen bitmap is always fully painted,
   so there is nothing to re-issue at the `worker-adapter.ts` / `midend.ts`
   seam. The scaffolded §2 fix ("ensure the clear path is followed by a
   repaint") targets a drop that does not occur — which also explains the F8
   note's observation that a prior "repaint inside `resizeDrawing`" candidate
   "did not fix the symptom."
2. **No damaging second resize.** The trace shape is *identical* for square and
   non-square: `attachCanvas(300×150) → setDrawingPalette(firstInstall→forceRedraw)
   → size()→boardsize → resizeDrawing (clears + drops drawstate) → redraw → DONE`.
   It always ends on a `redraw`. A forced post-load resize either recomputes the
   *same* size (`changed=false` ⇒ nothing touches the canvas) or, if changed,
   runs `resizeDrawing` **then** `redraw`. There is no interleaving that leaves a
   clear as the last canvas op.
3. **The one plausible remaining mechanism is an onscreen-mirror gap in
   Safari/Firefox**, not an engine-repaint drop. The code already half-handles
   that class: `attachCanvas`'s deliberate `nextAnimationFrame` delay and
   `redrawWhenVisible` both exist (per their comments) for "Safari/Firefox where
   the onscreen canvas randomly appears blank." If the bug is real and current,
   that is where it lives, and the fix is "force an onscreen commit," a
   *different* fix from anything in this change's tasks.

## What was NOT tested (the gap)

- **WebKit and Firefox engines.** Only Chromium is installed at a Playwright-
  matching version; WebKit/Firefox need a one-time `npx playwright install`
  browser download. This is the single untested surface and the most likely home
  of a real, current bug per (3) above.
- The owner's own real browser, live, right now.

## How to resume (if the bug resurfaces)

1. Reproduce in a **visible** browser (Playwright headless is visible; the MCP
   Chrome tab is not — never trust it here). Confirm the *offscreen* bitmap via
   `puzzle.getImage()` colour count.
2. If offscreen is blank → it *is* an engine/adapter repaint drop; this change's
   §2 approach applies. (Nothing observed here supports this.)
3. If offscreen is painted but onscreen is blank → it is a compositor/mirror
   gap; the fix is forcing an onscreen commit (extend `redrawWhenVisible` /
   post-settle re-mirror), and the spec delta + test should be reframed around
   "the first frame reaches the *screen*," not "the first frame is painted."
4. Record which browser/engine reproduces it — that decides which of the two
   above it is.
