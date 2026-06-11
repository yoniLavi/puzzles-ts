# Tasks: Fifteen TS Port

## Phase 1: State, codec, generator
- [x] Create `src/native/games/fifteen/` directory structure
- [x] Implement `state.ts` — `FifteenParams` (`w`, `h`), `FifteenState`
  (`tiles` Int32Array with `0` = gap, `gapPos`, `completed`, `usedSolve`,
  `moveCount`), `FifteenMove` (`{type:"move",x,y}` | `{type:"solve"}`),
  `FifteenUi` (`invertCursor`); encode/decode params (`WxH`, square `W`
  shorthand, lenient); desc codec (comma-separated tile values) +
  `validateDesc`; `newState`; `validateParams`; presets (`4x4`); `defaultParams`
- [x] Implement the generator in `state.ts` — `newDesc`: parity-corrected
  random placement (place all but last two via `randomUpto`, fix permutation
  parity = gap chessboard-parity ⊕ parity-of-n, reject already-solved)
- [x] Implement `textFormat`, `isCompleted`, `permParity`, `parityOf` helpers

## Phase 2: Greedy solver
- [x] Implement `solver.ts` — `computeHint(state) -> {x,y} | null`: faithful
  port of `compute_hint` + `nextMove` + `nextMove3x2` (verbatim 120-byte
  endgame table). Returns the next single-cell gap destination, or null when
  solved.

## Phase 3: Game glue, move logic, render, hint
- [x] Implement `index.ts` — `Game` glue, `interpretMove` (left-click →
  gap-destination if it shares exactly one coordinate; cursor keys → immediate
  one-cell slide with the default arrow semantics; ignore otherwise),
  `executeMove` (slide a line into the gap, counting one move per tile;
  `"solve"` → snapped solved grid with `usedSolve`), `status`, `solve`,
  `register`
- [x] Implement `redraw` in `index.ts` — recessed bevelled border (first draw),
  per-tile bevelled tiles with centred number, two-pass slide animation
  (pass 0 blanks vacated cells, pass 1 draws moving tiles interpolated), per-tile
  `Int32Array` cache + `bgcolour`, completion flash (genuine completion only),
  `computeSize`/`setTileSize`, `colours` via `mkhighlight`
- [x] Implement `hint()` in `index.ts` — one-step plan from `computeHint`
  (narrate "Slide tile N", highlight the sliding tile + its destination); no
  `hintKeepTrack`
- [x] `statusbarText` — `COMPLETED! Moves: k` / `Moves: k` /
  `Moves since auto-solve: k`
- [x] Register in `src/native/games/index.ts`
- [x] Add `fifteen` to `TS_PORTED_PUZZLE_IDS` in `ts-ported-ids.ts`

## Phase 4: Tests
- [x] `fifteen.test.ts` (tier 1) — params round-trip + lenient/square decode;
  presets; generation (every board solvable: `PARITY_S == perm_parity`, and
  never starts solved); desc round-trip + `validateDesc` rejects; slide move
  semantics (line shift, move count per tile, completion); `"solve"` snaps +
  `usedSolve`; immutability of `executeMove`; input mapping (click sharing one
  coord, click sharing zero/two coords ignored, out-of-bounds ignored, cursor
  keys slide); `status`/flags
- [x] `fifteen-solver.test.ts` (tier 1) — from N random solvable boards,
  repeatedly applying `computeHint` reaches the solved state within `5·n³`
  moves (the upstream solver invariant); covers the 3×2 endgame table and the
  last-column recursion
- [x] `fifteen-midend.test.ts` — real `Midend` lifecycle: forced redraw paints;
  a cursor-key slide advances the move counter in the status bar; undo/redo
  restore tiles + move count; `hint()` surfaces a step
- [x] `fifteen-render.test.ts` (tier 2) — recording `GameDrawing`: first draw
  emits the recessed border + one bevelled tile per non-gap cell + numbers;
  a mid-slide animation frame draws a moving tile at interpolated coordinates;
  completion flash toggles the background

## Phase 5: Validation & parity
- [x] Full pre-commit gate green (`tsc -b --noEmit` → biome → vitest → vite build)
- [x] Dev-server smoke test (Playwright on `4x4`): tiles + recessed border
  render, click-slide and arrow-slide animate, move counter advances,
  completion flash on solving, Solve resets, Hint highlights a tile + slides it,
  undo/redo reverse a slide, 0 console errors, TS badge shown
- [x] Smoke-test a non-square preset (custom `5x4` via params) in dev — slides
  along both axes, animation correct, 0 console errors
- [ ] Owner acceptance testing (rendering + animation + input parity — not a
  green suite alone)
- [ ] On owner acceptance: add `TS_PORTED` in CMake, remove the now-dead
  `solver(fifteen)` line, delete `puzzles/fifteen.c`, capture the two
  per-puzzle icon PNGs if not already present
- [ ] Archive the change (tasks current, spec deltas applied) together with the
  C-deletion commit

## Phase 6 (optional, deferred): differential testing
- [ ] Optional/advisory (non-gating, like Cube): transient
  `puzzles/auxiliary/fifteen-trace.c` → `__fixtures__/fifteen-c-reference.json`;
  gated `fifteen-differential.test.ts` (TS generator reproduces C's tile array
  for the same seed). Low value — no solver/uniqueness loop, just a short
  `random_upto` sequence over the already-bit-identical `random.ts`. Revisit if
  shared-game-ID parity for Fifteen is wanted.
