# Tasks: Singles (Hitori) TS port

## 1. State, params, codec
- [x] 1.1 `SinglesParams { w, h, diff }` (diff "easy"|"tricky"); presets
      5×5/6×6/8×8/10×10/12×12 each Easy+Tricky; encode `WxHd{e,k}` (full) /
      `WxH`; `decodeParams`; `validateParams` (w,h ≥ 2, ≤ 62; diff valid).
- [x] 1.2 Fixed-length desc codec: `n2c`/`c2n`, `validateDesc` (length == w·h,
      each char in 1..max(w,h)), `newState` (decode `nums`, blank `flags`).
- [x] 1.3 `SinglesState` (immutable `nums` shared, mutable `flags` Uint array,
      `completed`/`usedSolve`/`impossible`); `cloneState`.
- [x] 1.4 `SinglesMove` union (`set` cells black/circle/empty + `solve`) +
      `executeMove` (empty-first then set; `checkComplete(MARK_ERRORS)` →
      completed); `textFormat` (the ASCII grid with `~` circle row).
- [x] 1.5 `SinglesUi { cx, cy, cshow, showBlackNums }` + `newUi`.

## 2. Solver
- [x] 2.1 Op queue: `solverOpAdd`/`solverOpCircle`/`solverOpBlacken` +
      `solverOpsDo` cascade (black → circle 4 neighbours; circle → blacken same
      num in row/col), `impossible` on contradiction.
- [x] 2.2 `checkComplete(flags)` — black-adjacency via shared `Dsf`, per-row/col
      duplicate `checkRowcol`, single-largest-white-region check, `MUST_FILL`
      (solver) vs `MARK_ERRORS` (play) modes.
- [x] 2.3 Once-only deductions: `solveSinglesep`, `solveDoubles`, `solveCorners`,
      `solveOffsetpair` (Tricky).
- [x] 2.4 Loop deductions: `solveAllblackbutone`, `solveRemovesplits` (Tricky;
      `hasSingleWhiteRegion` flood fill).
- [x] 2.5 `solveSneaky` (generation-artefact step, `ss=null` → count only).
- [x] 2.6 `solveSpecific(state, diff, sneaky) → -1 | 0 | 1` driver matching the
      C order/fixpoint exactly.

## 3. Generator
- [x] 3.1 `matchingScratchSize` + `matchingWithScratch` (BFS layering + DFS
      augmenting paths, RNG-faithful: `shuffle(Lorder)` and the in-place
      `random_upto` adjacency swap) — idiomatic but byte-faithful.
- [x] 3.2 `latinGenerate(o, rs)` (row shuffle + per-row matching) +
      `latinGenerateRect(w, h, rs)`.
- [x] 3.3 `bestBlackCol` (shuffled number try, latin-removal preference then
      fallback) + `newGameIsGood` (solve at diff, fail at diff-1+sneaky).
- [x] 3.4 `newSinglesDesc` — Latin rect → shuffled random blacks with
      `solverOpsDo`/`allblackbutone`/`removesplits` between, restart on
      impossible → re-lay numbers under blacks → `MAXTRIES` difficulty-gate
      retry. Downgrade Tricky→Easy when min(w,h) < 4. No `aux`.

## 4. Render
- [x] 4.1 Palette mirroring the C enum index-for-index; `computeSize`;
      `setTileSize`; `PREFERRED_TILE_SIZE`.
- [x] 4.2 Per-tile flag packing + `Int32Array` cache; `tile_redraw`
      (bg/black/error, circle ring, number, cursor corners, impossible outline).
- [x] 4.3 `redraw`: `!started` grid frame + bg fill, per-tile diff loop,
      `flashLength` completion flash (not on solved-with-help).
- [x] 4.4 `findMistakes` overlay (inset error outline via a packed cache bit).

## 5. Game glue
- [x] 5.1 `interpretMove` (LEFT toggle black, RIGHT toggle circle, set→empty,
      off-grid toggles show-black-nums, cursor move + select/select2,
      `UI_UPDATE` for cursor-only changes), faithful to C.
- [x] 5.2 `executeMove` wiring + `status` (completed → solved).
- [x] 5.3 `solve` (try curr then orig via `solveSpecific(DIFF_ANY)`; diff to
      moves; mark `usedSolve`).
- [x] 5.4 `findMistakes(state)` (re-solve from `nums`, flag contradicting cells).
- [x] 5.5 `prefs` hook: `show-black-nums` boolean on the Ui.
- [x] 5.6 `colours`, `flashLength`, `animLength`, assemble `singlesGame`,
      `registerGame`.

## 6. Tests + differential + registration
- [x] 6.1 Tier-1: state/codec round-trip, solver solves generated boards,
      generator produces solvable + unique boards at each difficulty,
      `findMistakes` flags wrong cells / clean board returns `[]`.
- [x] 6.2 Tier-2.5: `renderScenario` initial frame + a black/circle/error frame,
      targeted op assertions + `toMatchSnapshot`.
- [x] 6.3 `puzzles/auxiliary/singles-trace.c` + `cliprogram()` line; regenerate
      `__fixtures__/singles-c-reference.json` (pure-C build).
- [x] 6.4 Byte-match differential (`singles-differential.test.ts` via
      `describeDescDifferential`) + live `scripts/diff-singles.test.ts`.
- [x] 6.5 Register: add to `ts-ported-ids.ts` + import in `games/index.ts`
      (`ts-ported-ids.test.ts` enforces agreement).
- [x] 6.6 Full gate green: `tsc -b --noEmit` → `biome lint` → `vitest run` →
      `vite build`.

## 7. Stage 2 (owner acceptance only — do NOT do before)
- [x] 7.1 Owner smoke-test in `npm run dev` (render/anim/input parity).
- [x] 7.2 Add `TS_PORTED` to `singles` in `puzzles/CMakeLists.txt`; delete
      `puzzles/singles.c`, `puzzles/auxiliary/singles-trace.c` + its
      `cliprogram()` line, and `scripts/diff-singles.test.ts`.
- [x] 7.3 Capture the two icon PNGs (`?screenshot` mode).
- [x] 7.4 Archive the change in the same commit as the C deletion.
