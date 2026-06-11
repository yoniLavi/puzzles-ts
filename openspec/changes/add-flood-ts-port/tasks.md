# Tasks: Flood TS Port (stub — not started)

## Phase 1: State, codec, generator
- [ ] 1.1 Create `src/native/games/flood/` directory
- [ ] 1.2 `state.ts` — `FloodParams` (`w`,`h`,`colours`,`leniency`),
  `FloodState` (`grid` Uint8Array, `w`,`h`,`colours`,`moves`,`movelimit`,
  `complete`,`cheated`), `FloodMove` (`{type:"fill",colour}` | `{type:"solve"}`);
  encode/decode params (`WxH` + `c{n}m{lenient}` when full; lenient/square
  decode); desc codec (colour chars `0-9A-Z` + `,{movelimit}`) + `validateDesc`;
  `newState`; `validateParams` (w·h≥2, 3≤colours≤10, leniency≥0); the 7 presets;
  `defaultParams`
- [ ] 1.3 `fill(grid,w,h,colour)` + `completed(grid)` (corner flood-fill + all-equal)
- [ ] 1.4 Generator `newDesc` — random grid (re-roll if already complete) → run
  the solver to count moves → `movelimit = moves + leniency`
- [ ] 1.5 `textFormat` (colour chars per row)

## Phase 2: Solver
- [ ] 2.1 `solver.ts` — `search` (boundary-distance BFS → `{dist,number,control}`)
- [ ] 2.2 `choosemove` + `choosemove_recurse` (depth-3 look-ahead, tie-break
  `dist → number → control → first colour`, win short-circuit). Branch-for-branch
  port for solver parity (see design D-RISK)

## Phase 3: Game glue, render, hint
- [ ] 3.1 `index.ts` — `Game` glue, `interpretMove` (click/cursor-select → fill
  if the target cell's colour differs from the corner; cursor move via
  `cursorDelta` + clamp), `executeMove` (fill / solve-snap), `status`
  (`solved`/`lost`/`ongoing`), `statusbarText`, `solve`, `registerGame`
- [ ] 3.2 `hint()` + `hintKeepTrack` — solver's whole plan, highlight the
  absorbed (`SOLNNEXT`) squares per step
- [ ] 3.3 `render.ts` — coloured tiles + separator borders/corners between
  differing colours + playfield frame; recessed bevel border (first draw);
  cursor outline; `SOLNNEXT` circle markers; victory rainbow flash + defeat
  black-blink flash (flash type derived from status); per-tile `Int32Array`
  flag cache; `colours` (mkhighlight + 10 fixed + separator), `computeSize`,
  `setTileSize`
- [ ] 3.4 Register in `src/native/games/index.ts`; add `flood` to
  `TS_PORTED_PUZZLE_IDS`

## Phase 4: Tests
- [ ] 4.1 `flood.test.ts` (tier 1) — params round-trip/lenient/square decode +
  `c`/`m` flags; presets; `validateParams` rejections; desc round-trip +
  `validateDesc`; `fill`/`completed`; generation (boards complete-able, movelimit
  = solver+leniency); fill move semantics + immutability; win + **lose** status
  transitions; `solve` snaps + cheated; input mapping (click different-colour
  cell, same-colour/complete ignored, cursor move/select); `status`/flags
- [ ] 4.2 `flood-solver.test.ts` (tier 1) — solver completes every generated
  board; depth-3 look-ahead chooses better than greedy on a crafted case
- [ ] 4.3 `flood-midend.test.ts` — real `Midend`: forced redraw paints; a fill
  advances the move counter; reaching the limit unsolved reports `"lost"`;
  undo/redo; hint surfaces a step
- [ ] 4.4 `flood-render.test.ts` (tier 2) — recording `GameDrawing`: tiles in
  the play colours, separators between differing-colour cells, cursor outline,
  hint circle on the next-move squares, victory vs defeat flash frames

## Phase 5: Validation & parity
- [ ] 5.1 Full pre-commit gate green (tsc → biome → vitest → vite build)
- [ ] 5.2 Dev-server smoke (Playwright): a 12×12 preset renders, click fills and
  the region grows, move counter advances, **winning flashes the rainbow and
  losing (exhaust the limit) shows the defeat state**, hint highlights the next
  fill, Solve auto-completes, undo/redo, 0 console errors, TS badge.
  **Explicitly verify the app's lost-state UX on the TS path (design D6).**
- [ ] 5.3 Owner acceptance (rendering + flashes + win/lose + input — not a green
  suite alone)
- [ ] 5.4 On acceptance: `TS_PORTED` in CMake, delete `puzzles/flood.c`, icons
  already committed (flood is a catalog game); archive

## Phase 6: Solver-parity differential (recommended, not optional here)
- [ ] 6.1 Per design D-RISK, Flood's par depends on the solver, so tighten the
  differential beyond "solvable": transient `puzzles/auxiliary/flood-trace.c` →
  `__fixtures__/flood-c-reference.json`; gated `flood-differential.test.ts`
  asserting the TS solver's **move count equals C's** for N seeds (so shared
  game IDs reproduce the same movelimit, not just the same grid)
