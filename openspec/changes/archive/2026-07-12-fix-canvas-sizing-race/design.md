## Context

The board renders too small on load and only a window resize fixes it. This document
captures the investigation done during the `add-dominosa-reference-panel` review so the fix
can be picked up cold.

### How canvas sizing works today (`src/puzzle/puzzle-view.ts`)

- A `ResizeController` observes the **host element** (`<puzzle-view-interactive>`), calling
  `throttle(() => this.resize(), 100)` on every observed resize (`puzzle-view.ts:71-75`).
- `resize()` (`:276-319`) computes the available space via `getAvailableCanvasSize()`
  (`:251-272`) — `hostBox − content.offsetWidth + canvas.offsetWidth`, an *incremental*
  "free space + current canvas" measurement — then `await this.puzzle.size(available, true, 1)`
  (an **async worker round-trip** through Comlink) and, if the returned size differs, applies
  it and redraws.
- The **first** sizing on load is driven from `updated()` when `renderedPuzzleGameId` goes
  `undefined → defined` (`:111-118`, `needsResize = true`). The canvas itself is created
  asynchronously in `createCanvas()` (awaits the worker attaching an `OffscreenCanvas`).

### Root cause (measured, not guessed)

The first `resize()` runs **before the async worker canvas attach + layout have settled**, so
it measures a transient small layout and sizes the board too small. Crucially, the host box is
`flex: 1` and reaches full size almost immediately and **then never changes again** — so the
`ResizeObserver` never re-fires to correct the stale size. The only thing that changes the host
box afterward is an actual **window resize**, which is why "resize the window to fix it" works.

**Evidence** (Playwright, dominosa at 1400×900, 2.5s after load, before any manual resize):

| measurement            | at load (stuck)     | after a 1px viewport nudge |
|------------------------|---------------------|----------------------------|
| host box (getBoundingClientRect) | `1336 × 718` (full!) | `1337 × 718`          |
| canvas offset size     | `348 × 304` (too small) | `710 × 620` (correct)   |
| content offset size    | `544 × 396`         | `758 × 712`                |

At 2.5s the host box is already full and a fresh `resize()` *would* compute `710×620` — but
nothing calls it (no `ResizeObserver` event). The 1px nudge is the only trigger. So the board
is not size-capped; it is **stuck because the corrective recompute is never invoked**.

### Why it dominates dev

Editing a Lit component does a **full page reload**, not HMR (Lit elements can't hot-swap;
Vite log shows `page reload src/...`). Every reload re-runs the load race, so "the board
shrinks whenever I make a change." A production first-load hits the same race but less visibly.

### Attempts already tried and REVERTED (don't repeat blindly)

1. **`import.meta.hot` → resize on `vite:afterUpdate`.** Wrong tool: component edits full-reload
   rather than HMR, so `vite:afterUpdate` never fires.
2. **Deferred re-resize after first render** — two `requestAnimationFrame`s, then a 250ms
   `setTimeout`. Neither reliably fixed it: a direct `resize()` call at those times still
   computed the small size, because the corrective factor is not *elapsed time* but the
   **worker canvas attach completing + a fresh measurement being fed to `size()`**. A fixed
   delay races the async attach.

Takeaway: the fix must be **event-driven on the canvas actually attaching / the drawing being
ready**, not a timer, and must feed `size()` a settled measurement.

## Goals / Non-Goals

- Goals: a freshly-loaded board fills its available space with **no** manual resize; robust
  across games; no resize loop; window-resize and `maxScale` behaviour unchanged.
- Non-Goals: rewriting `size()` or the worker protocol; changing game `redraw`; touching the
  reference panel.

## Decisions (candidate approaches — evaluate first thing next session)

- **A (preferred to investigate first): recompute right after the canvas attaches.** In
  `createCanvas()` / the path that resolves the worker `attachCanvas`, once the canvas is in the
  DOM and `canvasReady`, call `resize()` (it already redraws on change). This targets the exact
  moment the earlier measurement was premature. Verify it feeds a settled `getAvailableCanvasSize`.
- **B: observe the content/canvas element, not only the host.** Add the `[part=content]` (or the
  canvas) to the `ResizeController` so a late layout settle (content offset growing as the canvas
  attaches) re-fires `resize()`. Must guard against a feedback loop (resize → canvas grows →
  observer → resize): the existing `changed` check + 100ms throttle likely suffice, but confirm.
- **C: make `getAvailableCanvasSize` absolute, not incremental.** It currently adds back the
  *current* canvas size; derive available purely from the container minus non-canvas content so a
  stale small canvas can't bias the measurement. Lower-level; do only if A/B are insufficient.

Recommend implementing **A** (smallest, most targeted), keeping **B** as the fallback, and
treating **C** as a robustness improvement if the race still slips through.

## Risks / Trade-offs

- Shared by every game → a regression here breaks all boards. Gate with the existing
  `puzzle-view-interactive.test.ts` plus a new no-synthetic-resize load check.
- Resize loops: any new observer/recompute must converge (assert idempotence — a second
  `resize()` with no layout change returns `changed === false`).

## Migration Plan

Pure fix; no data/format/protocol change. Land behind the normal gate; verify in dev that a
component edit (full reload) leaves the board full-size with no manual resize.

## Open Questions

- Does `createCanvas()` already have a clean "canvas attached & ready" resolution point to hook
  A onto, or does it need a small refactor to expose one?
- Is the premature measurement the host box (unlikely — measured full at 2.5s) or the
  content/canvas offsets during attach? The evidence points at the latter; confirm by logging
  `getAvailableCanvasSize`'s components at the *first* `resize()` call (not at 2.5s).

## Resolution (measured 2026-07-12)

The design above guessed "host box not settled" and proposed a timer/observer recompute
(approaches A/B). Instrumentation disproved that guess and pinpointed a **circular width
measurement** instead:

`[SIZING]` logs (Playwright, dominosa @ 1400×900), first two resizes on load:

```
resize gameId=none   -> used=1288x670 changed=true          (pre-game: size()=availableSize; sets canvasSize=1288)
getAvail host=1336x718 content=1288x242 canvasEl=300x150 -> avail=348x626   ← the poisoned frame
resize inCreate=true -> used=348x304  changed=true          (board stuck small)
```

The host box is a stable `1336×718` the entire time — it is **not** the premature value. The
bug is that `getAvailableCanvasSize()` measured available width incrementally as
`host − content.offsetWidth + canvas.offsetWidth`, and at the `createCanvas()` frame:

- `content.offsetWidth` = **1288** — inflated by the hint banner, whose reserved width is
  `max(canvasSize.w, 34rem)` and `canvasSize.w` was just set to the full `1288` by the pre-game
  resize (which returns `availableSize` because no `gameId` is known yet);
- `canvas.offsetWidth` = **300** — the freshly-created `<canvas>` still at its intrinsic default,
  because `updateCanvasSize()` hasn't applied the real size yet.

So `avail.w = 1336 − 1288 + 300 = 348`, and the board is sized to `348×304`. It stays stuck
because the host box never changes again, so the `ResizeObserver` never re-fires; only an
incidental resize (window nudge, scrollbar, 1px rounding) later corrects it — exactly the "resize
the window to fix it" symptom. This precisely reproduces the evidence table's stuck `348×304`.

**Fix (approach C, pinned to the banner):** measure available **width** from the *puzzle
wrapper* (`[part=puzzle]`, which contains only the canvas + its padding), not from `content`
(which also contains the board-width-derived banner). Height stays content-based (statusbar +
banner heights are genuine vertical consumers and do not depend on the board width). The
arithmetic moved to a pure `computeAvailableCanvasSize()` in `src/puzzle/canvas-sizing.ts`, unit
-tested in `canvas-sizing.test.ts`. No timer, no extra observer, no loop-guard: the existing
post-attach `resize()` now computes the correct size on the first try. Verified idempotent
(a same-viewport recompute reports `changed=false`) and resize-preserving across
dominosa/solo/towers/galaxies/pattern in both orientations.
