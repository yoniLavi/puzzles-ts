## Context

See `proposal.md` — Why. The constraint that shapes everything here is the one
`fix-flip-canvas-reshape` (2026-05-20) established and `midend.test.ts`'s
"`Midend.size` is purely informational (regression: ResizeObserver flicker)"
pins: `puzzle-view.ts`'s `ResizeController` calls `size()` on every element-size
change — CSS transitions, the mobile address bar — and a `size()` that replaced
the draw state each time made the board flicker.

That suite pins **two** promises, and only one of them is the flicker fix:

1. repeated `size()` at the **same** tile size leaves the draw state alone
   (the flicker); and
2. `size()` at a **different** tile size also leaves it alone (the tests at "does
   NOT recreate the drawstate even when called with a different size" and the
   `size({400})` half of "a redraw after only size() preserves the per-tile
   cache").

This change keeps the first and deliberately breaks the second.

## Goals / Non-Goals

**Goals:**

- A draw state exists only at one tile size for its whole life.
- No game writes resize invalidation, and no game's correctness after a
  tile-size change depends on the view noticing a pixel-size change.
- One reading of a draw state, so the harness has no sized/unsized hazard.

**Non-Goals:**

- The `started` flag and first-paint branch. The tile-loop postmortem
  (`openspec/postmortems/2026-09-09-tile-loop-inversion-withdrawal.md`) declined
  sharing them, because "the engine paints no pixels of its own" is doctrine.
  This change does not revisit that.
- `computeSize` and board-origin geometry — `unify-the-board-origin` served
  that, and the board-model postmortem closed the rest.
- Any change to which tile size `size()` picks.

## Decisions

### D1. `newDrawState(state, tileSize)`, not an engine-owned `tileSize` field

**Chosen:** the tile size is an argument to construction. A game with derived
geometry (Blackbox's radii, Samegame's gap, Ascent's offsets, Cube's origin)
computes it in the same literal.

**Alternative — the midend writes `ds.tileSize` itself** and `setTileSize`
becomes an optional hook for derived geometry. Rejected: it imposes a required
field on every `DrawState` type (a structural manifest the contract would have to
declare), keeps the second step that makes "sized" a state, and deletes only the
42 trivial hooks while leaving the nine invalidations in place.

**Alternative — keep `setTileSize` optional for derived geometry only.**
Rejected: once every draw state is built at its size, a hook that runs right
after construction with the same number is the constructor split in two.

### D2. `size()` replaces the draw state only when the tile size changes

`size()` compares the resolved tile size with `currentTileSize`. Unchanged: it
returns, touching nothing — promise 1 holds and its two tests stay as they are.
Changed: it records the size and, if a board exists, calls `freshDrawState`.

**Why breaking promise 2 cannot bring the flicker back:** a tile-size change
always moves the board's pixel size, and the view answers a pixel-size change
with `resizeDrawing` → `canvasCleared`, which replaces the draw state anyway. So
in production every tile-size change *already* ends in a fresh draw state and a
full repaint; this moves the replacement from the view's cooperation into the
midend, a few milliseconds earlier. **This is a claim about `view.ts`
(read 2026-09-12: `resize()` resizes the canvas iff `size.w`/`size.h` changed)
and task 1.3 re-reads it before relying on it.**

**Rewriting the two promise-2 tests is the point of the change, not collateral.**
Each becomes its opposite — a changed tile size yields a new draw state, and the
following redraw paints its background — and the same-tile tests stay verbatim.

### D3. `canvasCleared` and `startFrom` build at `currentTileSize`

`freshDrawState(s)` becomes `this.game.newDrawState(s, this.currentTileSize)`.
Before the first `size()`, `currentTileSize` is `preferredTileSize`, which is
what a game gets today after its hook runs.

### D4. Cube and Guess hold `tileSize`

Cube's `gridScale` is assigned exactly the tile size and Guess's `pegsz` is
exactly it (`computeGeometry`: `const pegsz = tilesize`). Both become `tileSize`.
Guess's genuinely derived fields (`gapsz`, `pegrad`, `hintsz`, …) stay — they are
geometry, not the tile size. Guess's `if (ds.pegsz === tileSize) return` guard
disappears with its hook.

### D5. The harness: one reading

- `sizedDrawState(game, state, tileSize?)` exists to pair two calls. With one
  call, delete it if its only remaining job is the call; keep it only if it still
  carries the preferred-size default (`game.preferredTileSize ?? 32`) that
  tests would otherwise repeat — and then say so in its doc comment.
- The capability snapshot reads `newDrawState(state, preferredTileSize)`. The
  "loses nothing by reading the draw state before it is sized" test is deleted:
  the hazard it guards (a field only sizing adds) cannot be written any more.
  Its vacuity sibling ("reads a draw state off every game") stays.
- `fakeGame`'s `setSizeCalls` counter goes; a midend test asserting the draw
  state's `tileSize` after `size()` replaces whatever read it.

## Risks / Trade-offs

- **[A redraw interleaves between `size()` and `resizeDrawing`]** (the worker is
  async; an animation tick can land in between) → it paints a full frame at the
  new tile size onto the not-yet-resized canvas. Today the same interleaving
  paints *changed* tiles at the new size over cached tiles at the old one, which
  is no better. Neither is visible for longer than one frame, because the resize
  clears the canvas next. Check it in the browser anyway (task 5.3).
- **[A game's `newDrawState` reads the tile size before it is set]** → gone:
  the argument is there from the first line.
- **[Bricks' `evenTs` rounding]** → `newDrawState` stores `evenTs(tileSize)`;
  its `computeSize` already rounds the same way. Read both before moving it.
- **[A test that built an unsized draw state and asserted its initial
  `tileSize`]** → would now fail to compile, which is the good outcome;
  `tsgo` finds every call site.

## Migration Plan

Internal contract; no deploy step or rollback beyond `git revert`. Order in
`tasks.md`: contract and midend first with the fake game, then the games in
batches the typechecker holds together, then harness and docs.
