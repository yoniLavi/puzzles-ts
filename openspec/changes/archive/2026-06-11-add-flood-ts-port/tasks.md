# Tasks: Flood TS Port

## Phase 1: State, codec, generator
- [x] 1.1 Create `src/native/games/flood/` directory
- [x] 1.2 `state.ts` — `FloodParams` (`w`,`h`,`colours`,`leniency`),
  `FloodState` (`grid` Uint8Array, `w`,`h`,`colours`,`moves`,`movelimit`,
  `complete`,`cheated`), `FloodMove` (`{type:"fill",colour}` | `{type:"solve"}`);
  encode/decode params (`WxH` + `c{n}m{lenient}` when full; lenient/square
  decode); desc codec (colour chars `0-9A-Z` + `,{movelimit}`) + `validateDesc`;
  `newState`; `validateParams` (w·h≥2, 3≤colours≤10, leniency≥0); the 7 presets;
  `defaultParams`
- [x] 1.3 `fill(grid,w,h,colour)` + `completed(grid)` (corner flood-fill + all-equal)
- [x] 1.4 Generator `newDesc` — random grid (re-roll if already complete) → run
  the solver to count moves → `movelimit = moves + leniency`
- [x] 1.5 `textFormat` (colour chars per row)

## Phase 2: Solver
- [x] 2.1 `solver.ts` — `search` (boundary-distance BFS → `{dist,number,control}`)
- [x] 2.2 `choosemove` + `choosemove_recurse` (depth-3 look-ahead, tie-break
  `dist → number → control → first colour`, win short-circuit). Branch-for-branch
  port for solver parity (see design D-RISK)

## Phase 3: Game glue, render, hint
- [x] 3.1 `index.ts` — `Game` glue, `interpretMove` (click/cursor-select → fill
  if the target cell's colour differs from the corner; cursor move via
  `cursorDelta` + clamp), `executeMove` (fill / solve-snap), `status`
  (`solved`/`lost`/`ongoing`), `statusbarText`, `solve`, `registerGame`
- [x] 3.2 `hint()` + `hintKeepTrack` — solver's whole plan, highlight the
  absorbed (`SOLNNEXT`) squares per step
- [x] 3.3 `render.ts` — coloured tiles + separator borders/corners between
  differing colours + playfield frame; recessed bevel border (first draw);
  cursor outline; `SOLNNEXT` circle markers; victory rainbow flash + defeat
  black-blink flash (flash type derived from status); per-tile `Int32Array`
  flag cache; `colours` (mkhighlight + 10 fixed + separator), `computeSize`,
  `setTileSize`
- [x] 3.4 Register in `src/native/games/index.ts`; add `flood` to
  `TS_PORTED_PUZZLE_IDS`

## Phase 4: Tests
- [x] 4.1 `flood.test.ts` (tier 1) — params round-trip/lenient/square decode +
  `c`/`m` flags; presets; `validateParams` rejections; desc round-trip +
  `validateDesc`; `fill`/`completed`; generation (boards complete-able, movelimit
  = solver+leniency); fill move semantics + immutability; win + **lose** status
  transitions; `solve` snaps + cheated; input mapping (click different-colour
  cell, same-colour/complete ignored, cursor move/select); `status`/flags
- [x] 4.2 `flood-solver.test.ts` (tier 1) — solver completes every generated
  board; look-ahead picks a legal colour; bounded move count
- [x] 4.3 `flood-midend.test.ts` — real `Midend`: forced redraw paints; a fill
  advances the move counter; completing wins; reaching the limit unsolved
  reports `"lost"`; undo/redo; hint surfaces a SOLNNEXT circle
- [x] 4.4 `flood-render.test.ts` (tier 2) — recording `GameDrawing`: tiles in
  the play colours, separators between differing-colour cells, cursor outline,
  hint circle on the next-move squares, victory vs defeat flash frames

## Phase 5: Validation & parity
- [x] 5.1 Full pre-commit gate green (tsc → biome → vitest → vite build)
- [x] 5.2 Dev-server smoke (Playwright): a 12×12 preset renders, click fills and
  the region grows, move counter advances, **winning flashes the rainbow and
  losing (exhaust the limit) shows the defeat state**, hint highlights the next
  fill, Solve auto-completes, undo/redo, 0 console errors, TS badge.
  **Explicitly verify the app's lost-state UX on the TS path (design D6).**
- [x] 5.3 Owner acceptance (rendering + flashes + win/lose + input — not a green
  suite alone)
- [x] 5.4 On acceptance: `TS_PORTED` in CMake, delete `puzzles/flood.c` +
  `puzzles/auxiliary/flood-trace.c`, archive

## Phase 6: Solver-parity differential
- [x] 6.1 Per design D-RISK: transient `puzzles/auxiliary/flood-trace.c` →
  `__fixtures__/flood-c-reference.json` (12 seeds across the presets + small
  boards); gated `flood-differential.test.ts` asserting the TS generator
  reproduces C's **whole desc** (grid + move limit) byte-for-byte — so shared
  game IDs reproduce the same board *and* movelimit, proving both `random.ts`
  fidelity and solver parity
