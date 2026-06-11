# Tasks: Twiddle TS Port (+ geometry/cursor helper extraction)

## Phase 0: Shared-helper extraction (Twiddle is the first consumer)
- [x] 0.1 Add `src/native/engine/geometry.ts` — `coord(pos, tileSize, border)`
  and `fromCoord(pixel, tileSize, border)` (using `Math.floor((pixel −
  border)/tileSize)`, no C truncation idiom); unit test
  (`geometry.test.ts`): in-cell pixel → cell, top-left round-trip, border-region
  pixel → negative index, **and parity with both legacy C idioms across all
  pixels**
- [x] 0.2 Add `cursorDelta(button)` to `src/native/engine/pointer.ts`; extend
  the pointer test with the four directions + a null case
- [x] 0.3 Migrate existing games onto the helpers — `fifteen`/`sixteen`/`pegs`
  keep a thin local `coord`/`fromCoord` that delegates to the shared formula
  (border curried per game), so call sites are untouched and only the formula +
  C-ism are removed; `flip`'s inline `fromCoord` site delegates too. Cursor
  button→delta in `flip`, `pegs` (×2), `sixteen`, `fifteen`, `galaxies` now
  routes through `cursorDelta`. Galaxies excluded from coord/fromCoord (its
  `scoord`/`coordRoundToEdge` are edge-aware, legitimately different).
  **Sixteen's `border = tileSize` `fromCoord` confirmed equivalent** to the
  shared `Math.floor((pixel − border)/ts)` for all pixels (geometry test proves
  parity with both legacy idioms); its render/input tests pass unchanged.
  Verified: `tsc -b` clean, 257 tests green across the 5 games + helpers

## Phase 1: State, codec, generator
- [x] 1.1 Create `src/native/games/twiddle/` directory structure
- [x] 1.2 Implement `state.ts` — `TwiddleParams` (`w`,`h`,`n`,`rowsonly`,
  `orientable`,`movetarget`), `TwiddleState` (`numbers` Int32Array, `orient`
  Uint8Array, `completed`, `usedSolve`, `moveCount`, `movetarget`,
  `lastX`/`lastY`/`lastR`), `TwiddleMove`
  (`{type:"rotate",x,y,dir}` | `{type:"solve"}`); encode/decode params
  (`WxHnN[r][o][mK]`, square shorthand, lenient); desc codec
  (comma-separated numbers, or `u/l/d/r`-separated when orientable) +
  `validateDesc`; `newState`; `validateParams`; the 8 presets; `defaultParams`
- [x] 1.3 Implement `doRotate(numbers, orient, w, h, n, orientable, x, y, dir)`
  — the in-place quarter-coset rotation + odd-`n` centre orientation tweak,
  operating on copies; and `isComplete` (numbers non-decreasing row-major; all
  orientations 0 when orientable)
- [x] 1.4 Implement the generator in `state.ts` — `newDesc`: solved grid →
  scramble by `total_moves` random rotations under the `prevmoves`
  anti-undo/anti-repeat guard (incl. the `w==h==n` special case), re-rolling
  while solved
- [x] 1.5 Implement `textFormat` (column-aligned numbers, orientation arrows
  when orientable)

## Phase 2: Game glue, move logic, render
- [x] 2.1 Implement `index.ts` — `Game` glue, `interpretMove` (click → centred
  region rotation; cursor keys → clamped origin move (`cursorDelta` + local
  clamp) returning `UI_UPDATE`; `CURSOR_SELECT`/`SELECT2` → rotate at cursor;
  corner letters `a`/`b`/`c`/`d`(+shifted) and parity-gated numpad rotations),
  `executeMove` (`doRotate` + completion; `"solve"` → sorted solved grid,
  cleared orientations, `usedSolve`), `status`, `solve`, `colours` (via
  `mkhighlight` + the gentle highlight/cursor tints), `computeSize`/
  `setTileSize`, `statusbarText`, `registerGame`
- [x] 2.2 Implement `render.ts` — `redraw`: one-time recessed bevelled border;
  per-tile bevelled tiles with centred number + orientation triangle; the
  rotation animation (`rotate` point-rotate about block centre, clipped block
  cleared then redrawn, bevel edges recoloured via the 32-entry
  `highlightColour(angle)` table); cursor-region bevel-edge highlight; per-tile
  cache (`ds.numbers`/`ds.orient`/`bgcolour`, `−1` sentinel for animating
  block); completion flash (genuine completion only); `animLength =
  ANIM_PER_BLKSIZE_UNIT·sqrt(n−1)`, `flashLength` (genuine completion only),
  uses the shared `coord` helper
- [x] 2.3 Register in `src/native/games/index.ts`; add `twiddle` to
  `TS_PORTED_PUZZLE_IDS` in `ts-ported-ids.ts`

## Phase 3: Tests
- [x] 3.1 `twiddle.test.ts` (tier 1) — params round-trip + lenient/square decode
  + orientable/rowsonly/movetarget flags; presets; `validateParams` rejections;
  generation (every preset terminates, board scrambled and not pre-solved);
  desc round-trip (plain + orientable) + `validateDesc` rejects; `doRotate`
  forward/inverse round-trip on a known block; rotation move semantics (turn,
  move count, completion; orientable orientation advance + upright-required
  completion); `"solve"` snaps + clears orientation + `usedSolve`; immutability
  of `executeMove`; input mapping (centred click → region, edge-overflow click
  ignored, cursor move/clamp, select rotates, corner/numpad shortcuts);
  `status`/flags; `textFormat`
- [x] 3.2 `twiddle-midend.test.ts` — real `Midend` lifecycle: forced redraw
  paints; a rotation advances the move counter in the status bar; undo/redo
  restore the grid + move count; solve snaps and suppresses flash
- [x] 3.3 `twiddle-render.test.ts` (tier 2) — recording `GameDrawing`: first
  draw emits the recessed border + one bevelled tile per cell + numbers; a
  mid-rotation frame draws the block's tiles at rotated coordinates and the
  static tiles unrotated, with bevel edges from the colour table; completion
  flash toggles the background only on a genuine win; cursor highlight draws
  cursor-coloured edges around the region

## Phase 4: Validation & parity
- [x] 4.1 Full pre-commit gate green (`tsc -b --noEmit` → biome → vitest →
  vite build)
- [x] 4.2 Dev-server smoke test (Playwright): verified on `3x3n2` — bevelled
  numbered tiles + recessed border render via the TS path (TS badge shown),
  a centre mouse-click rotates a 2×2 block (Moves 0→1) and the `a` key rotates
  the top-left block (Moves 1→2), the rotation animates and settles, the move
  counter advances, undo enables; **0 console errors** (only the expected Lit
  dev-mode warning)
- [x] 4.3 Smoke-tested `3x3n2o` (orientation triangles render per tile) and
  `5x5n3` (larger grid + 3×3 blocks render) via `?type=` URLs; 0 console
  errors across preset switches. (Completion flash on solving + a rowsonly
  preset left for owner acceptance below.)
- [x] 4.4 Owner acceptance testing (rendering + animation + input parity — not a
  green suite alone). Owner directed the archive 2026-06-11 (treated as
  acceptance); dev-verification screenshots reviewed.
- [x] 4.5 On owner acceptance: added `TS_PORTED` to the `puzzle(twiddle ...)`
  CMake entry (so no twiddle.c/wasm builds), deleted `puzzles/twiddle.c` and the
  dead `puzzles/sixteen.c`. Icons already committed (twiddle was a catalog game).
- [x] 4.6 Archive the change (tasks current, spec deltas applied) together with
  the C-deletion commit

## Phase 5 (optional, deferred): differential testing
- [ ] 5.1 Optional/advisory (non-gating, like Cube/Fifteen): transient
  `puzzles/auxiliary/twiddle-trace.c` → `__fixtures__/twiddle-c-reference.json`;
  gated `twiddle-differential.test.ts` (TS generator reproduces C's grid for the
  same seed). Low value — a `random_upto` scramble over the already bit-identical
  `random.ts`, no uniqueness loop. Revisit if shared-game-ID parity for Twiddle
  is wanted
