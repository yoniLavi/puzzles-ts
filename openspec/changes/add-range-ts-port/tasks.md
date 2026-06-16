# Tasks: Port Range to TypeScript

## 1. State, params, desc codec (`state.ts`)
- [x] 1.1 Types: `RangeParams` (`w`, `h`), `RangeState` (`Int8Array` grid +
  `hasCheated`/`wasSolved`), `RangeMove` (cell-set list + optional solve flag),
  `RangeUi` (cursor r/c + show); cell-value constants (`BLACK`/`WHITE`/`EMPTY`).
- [x] 1.2 `defaultParams`, `presets` (4 upstream), `encodeParams` (`WxH`),
  `decodeParams` (lenient), `validateParams` (min sizes, `w+h` overflow, the
  1×1/1×2/2×1/2×2 exclusions when full).
- [x] 1.3 Desc codec: encode (clue digits, `a`-`z` blank runs, `_` separator) +
  `validateDesc` + `newState` parse into the grid; `cloneState`; `textFormat`.
- [x] 1.4 `status`.
- [x] 1.5 Unit tests for codecs, validation, text format, status.

## 2. Solver + generator (`solver.ts`)
- [x] 2.1 `runLength` with the exact colour-mask semantics (clue cells counted
  iff the mask carries any high bit); `makeMove` scratch helper.
- [x] 2.2 The four reasoning rules: `ruleNotTooBig` (run-length arithmetic),
  `ruleAdjacency` (black ⇒ neighbours white), `ruleConnectedness` (DFS lowpoint
  cut-vertex detection ⇒ cut points are white). Recursion is provided by the
  clean validated `fullSolve` (deduction + DPLL) rather than the upstream
  best-effort recursion rule — see design D5/D7.
- [x] 2.3 `applyRules` (fixpoint over the three deductive rules) +
  `findClues`; `fullSolve` (Solve + findMistakes).
- [x] 2.4 Generator: `chooseBlackSquares` (n/3 random respecting
  adjacency + connectedness via flood-fill count), `computeClues`
  (row+column run lengths), `stripClues` (rotational-symmetry partition,
  remove symmetric pairs while still solvable without recursion, retry
  signal), `generateGrid`.
- [x] 2.5 Unit tests: each rule in isolation, full solve of generated boards,
  generator validity + unique no-recursion solvability across all presets,
  contradiction handling.

## 3. Input + Game object (`index.ts`)
- [x] 3.1 `newUi`; `interpretMove`: mouse-down sets cursor cell; left/select
  cycles empty→black→white→empty, right/select2 cycles empty→white→black→empty;
  clue cells inert; keyboard cursor movement; shift+cursor white-dots the
  vacated/entered run; out-of-bounds + post-cursor edge handling.
- [x] 3.2 `RangeMove` execution: apply each cell-set (validating bounds and
  clue-immutability), then `wasSolved = !findErrors` unless the move set the
  solve flag.
- [x] 3.3 `findErrors(grid, w, h, report?)`: black-adjacency, clue run-length
  mismatch, and white-connectedness via `dsf` — the shared solved-check and
  the live-error source for `redraw` (in `solver.ts`).
- [x] 3.4 `solve` command (full-recursion solve → cell-set list with the solve
  flag); `findMistakes` (re-solve initial clues, flag player cells that
  contradict the unique solution).
- [x] 3.5 Game object wiring; `registerGame`.
- [x] 3.6 Unit tests: cycle order both buttons, clue-cell inertness,
  solved-detection, `findMistakes` true/false.

## 4. Rendering (`render.ts`)
- [x] 4.1 `colours` (`mkhighlight` bg/lowlight, black grid/text/user, red
  error), `computeSize` (border ts/2), `setTileSize`, `newDrawState`
  (per-cell `Int32Array` cache).
- [x] 4.2 `redraw`: per-cell diffed `drawCell` (grid outline, fill by
  black/error/cursor/flash, inset red error outline, centred white dot, clue
  number with state-dependent colour), `findErrors`-driven live error
  highlighting, the Check & Save mistake overlay rendered red, first-draw
  background fill behind `ds.started`.
- [x] 4.3 `flashLength` (0.7s on transition to solved, suppressed when
  cheated); tier-2 + tier-2.5 render-scenario snapshot test.

## 5. Register + gate
- [x] 5.1 Add `import "./range/index.ts"` to `src/native/games/index.ts`; add
  `range` to `TS_PORTED_PUZZLE_IDS`.
- [x] 5.2 Midend integration test (Solve, honest move-by-move solve, mistakes).
- [x] 5.3 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build` — all green (1119 tests).
- [x] 5.4 `npm run dev` smoke on Range (Playwright): board renders with clues +
  TS badge + `9 x 6` type summary; left-click cycles black→white(dot)→empty,
  right-click the other way; adjacent blacks redden live and clear on fix;
  Check & Save refuses with "2 mistakes found", reds the wrong cells (correct
  black stays black) and the overlay clears on the next move; no Hint button
  (deferred); only transient vite dep-optimize 504s in console, no Range
  errors. **One bug found and fixed during smoke**: `redraw` ignored the
  midend's `mistakes` overlay arg, so Check & Save claimed cells were
  highlighted but drew nothing — now rendered red with an `F_MISTAKE` cache
  bit (tier-2 test added).
- [ ] 5.5 Commit (registered, parity-gated; `range.c` kept as fallback).

## 6. Owner acceptance → C deletion (separate step)
- [ ] 6.1 On owner-accepted parity: add `TS_PORTED` for `range` in
  `puzzles/CMakeLists.txt`, delete `puzzles/range.c`.
- [ ] 6.2 Archive the change.
