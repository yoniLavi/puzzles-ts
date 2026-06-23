# Tasks: Unequal TS port

## 1. State, params, codec (`unequal/state.ts`)
- [x] 1.1 `UnequalParams { order, mode, diff }` (mode Unequal/Adjacent; diff
      Trivial/Easy/Tricky/Extreme/Recursive); presets per `unequal_presets`;
      encode `{order}` / `{order}a` / `{order}d{c}`; `decodeParams`;
      `validateParams` (3 ≤ order ≤ 32; diff valid; Adjacent ≥ 5 for ≥ Tricky).
- [x] 1.2 Desc codec: comma-separated per-cell `{n}{URDL flags}`, run-length
      blank skips (`a`–`z`); `validateDesc` (cell count, number range, flag
      sanity: off-grid + contradiction by mode); `newState` (decode numbers into
      immutable givens + grid, flags into `clueFlags`).
- [x] 1.3 `UnequalState` (immutable shared `clueFlags`/`immutable`; mutable
      `grid`/`pencil`/`spent`; `completed`/`cheated`); `cloneState`.
- [x] 1.4 The `adjthan` direction table (`f`/`fo`/`fe`/`dx`/`dy`/`c`/`ac`) +
      flag-bit constants (`F_ADJ_*`, `F_ERROR_*`, `F_SPENT_*`, `ADJ_TO_SPENT`).
- [x] 1.5 `UnequalMove` union (`set`/`spent`/`pencilAll`/`pencilStrike`/`solve`);
      `checkComplete`/`checkNumError`/`checkNumAdj` (dup + clue-violation error
      marking, mode-aware); `status`; `textFormat`; `n2c`/`c2n`.
- [x] 1.6 `UnequalUi` + `newUi` (defaults: sticky pencil on, keep-highlight off,
      auto-pencil on, cursor hidden).

## 2. Unequal solver (`unequal/solver.ts`)
- [x] 2.1 Solver ctx: build the inequality `links` from the flags (Unequal mode);
      Adjacent mode uses the flags directly. `solverNminmax` helper.
- [x] 2.2 `solverLinks` (inequality bound elimination), `solverAdjacent`
      (known-value adjacency elimination), `solverAdjacentSet` (possible-value
      adjacency elimination); `solverEasy`/`solverSet` dispatch on mode.
- [x] 2.3 `unequalValid` (completed grid satisfies every link / adjacency clue,
      mode-aware).
- [x] 2.4 `solveUnequal(order, mode, flags, soln, maxdiff)` driver wiring the
      five-level difficulty mapping through `latinSolver`.

## 3. Generator (`unequal/generator.ts`)
- [x] 3.1 `ggPlaceClue`/`ggRemoveClue`/`ggBestClue` (clue add/remove + greedy
      best-clue selection by remaining-possibilities then fewest-existing-clues).
- [x] 3.2 `gameAssemble` (add best clues until solvable at the capped difficulty)
      + `gameStrip` (remove redundant clues) + `addAdjacentFlags` (Adjacent seeds
      all flags from the solution).
- [x] 3.3 `newUnequalDesc(p, rng)`: `latinGenerate` → assemble → strip →
      require-not-too-easy (`MAXTRIES` regenerate, then drop a level) → encode
      desc (per-cell number + URDL) + `aux` (`S`-prefixed solution); RNG-faithful
      (separate shuffles for numeric vs inequality scratch, as upstream). Capped
      regenerate backstop.

## 4. Rendering (`unequal/render.ts`)
- [x] 4.1 Palette via `mkhighlight(bg)` index-for-index with the C enum
      (background, grid, text, guess, error, pencil, highlight, lowlight=spent),
      plus the fork pencil-mode-body colour.
- [x] 4.2 `computeSize`/`setTileSize`/`PREFERRED_TILE_SIZE`; the gap geometry
      (`SQUARE_SIZE = TILE + GAP`, `COORD`/`FROMCOORD`); the per-tile diff cache
      (Int32Array key + sidecars for mistake overlay).
- [x] 4.3 `drawGt` polygons (Unequal) / `drawAdjs` bars (Adjacent) in the gaps,
      with error (red) / spent (grey) / normal colouring; pencil-mark grid;
      number colour (immutable/guess/error); pencil/full cursor highlight; the
      pencil-mode corner indicator; the Check & Save mistake overlay.
- [x] 4.4 `redraw`: first-draw bg fill, `checkComplete` error overlay, the diffed
      repaint (clue gaps included in the diff so spent/error changes repaint),
      completion flash.

## 5. Game glue (`unequal/index.ts`)
- [x] 5.1 `interpretMove`: cell select (left = real, right = pencil; sticky-pencil
      + filled-cell rules from Towers); digit/backspace/space entry honouring
      pencil mode + immutability + no-op suppression + auto-pencil; clicking a
      gt-sign/adjacency-bar in the cell gap → toggle its `spent` flag;
      shift/ctrl-cursor → toggle a neighbouring clue spent; `M`/`m` → `pencilAll`.
- [x] 5.2 `executeMove` (set/spent/pencilAll/pencilStrike/solve; completion via
      `checkComplete`); `status`; `changedState` (cancel pencil highlight when a
      cell fills).
- [x] 5.3 `solve` (return `aux` when present, else `solveUnequal` at max diff);
      `findMistakes` (re-solve from immutable, flag contradicting cells +
      note-mistakes; never from notes).
- [x] 5.4 `prefs` hook (sticky-pencil, auto-pencil, keep-highlight) + `canMarkAll`;
      `flashLength`; `animLength = 0`; `colours`/`computeSize`/`setTileSize`/
      `newDrawState`/`redraw` wiring; `describeParams` (`mode`/`size`/`difficulty`
      keys matching `augmentation.ts`); `registerGame`.

## 6. Tests
- [x] 6.1 Tier-1: params/desc round-trip (both modes); generator emits solvable,
      uniquely-determined, exact-difficulty boards (seeded, generous timeout) for
      Unequal + Adjacent; solver grades known boards; move transitions; completion
      + flash; `findMistakes` flags a wrong number + a note-mistake and ignores
      ordinary notes; Solve through a real `Midend` (aux path).
- [x] 6.2 Tier-2.5: `renderScenario` initial frame (Unequal) + an Adjacent-mode
      frame + a partially-filled board with pencil marks; targeted op assertions
      (gt-signs / adjacency bars drawn) + `toMatchSnapshot`.
- [x] 6.3 Differential: `puzzles/auxiliary/unequal-trace.c` + `cliprogram()` line;
      regenerate `__fixtures__/unequal-c-reference.json` pure-C (both modes ×
      difficulties); gated `unequal-differential.test.ts` (byte-match + solver
      agreement). No advisory `scripts/diff-unequal.test.ts` (fixed seeds → no
      extra signal; see design).

## 7. Registration (stage 1) + close-out
- [x] 7.1 Add `unequal` to `TS_PORTED_PUZZLE_IDS` and import in `games/index.ts`.
- [x] 7.2 Icons: N/A — Unequal is an existing upstream game; its committed
      `unequal-{64,128}d8.png` are already present (asset-integrity test green).
- [x] 7.3 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
      `vite build`); update the playbook with anything this port surfaced.

## 8. Owner acceptance (stage 2) — do NOT do before sign-off
- [ ] 8.1 Owner smoke-tests the TS path (both modes); address parity gaps.
- [ ] 8.2 Add `TS_PORTED` to unequal in `puzzles/CMakeLists.txt` (drop the
      `solver(unequal latin.c tree234.c maxflow.c)` line if present); delete
      `puzzles/unequal.c`, `puzzles/auxiliary/unequal-trace.c`, and its
      `cliprogram()` line.
- [ ] 8.3 Rebuild wasm; confirm unequal still in the catalog with no
      `unequal.wasm`.
- [ ] 8.4 Archive the change (`openspec archive add-unequal-ts-port --yes`) in
      the same commit as the C deletion.
