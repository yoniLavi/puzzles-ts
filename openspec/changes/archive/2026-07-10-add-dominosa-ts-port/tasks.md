# Tasks — add-dominosa-ts-port

## 1. Shared leaf: FlipDsf
- [x] 1.1 Add a `FlipDsf` class to `src/native/engine/dsf.ts` porting
  `dsf_new_flip` / `dsf_canonify_flip` / `dsf_merge_flip` (parity union-find,
  union-by-size, second-arg-wins tie-break).
- [x] 1.2 Tier-1 test: singleton reinit, merge-together vs merge-opposite,
  transitive parity, brute-force parity reference under random merges.

## 2. State + params (`state.ts`)
- [x] 2.1 `DominosaParams` (`n`, `diff`) + `TRI`/`DCOUNT`/`DINDEX` helpers.
- [x] 2.2 encode/decode/validate params (`d{t|b|h|e|a}`, legacy `a`).
- [x] 2.3 desc parse (`newState`) + `validateDesc` (length, range, `[NN]`
  escape, per-number balance = `n+2`).
- [x] 2.4 `DominosaState` (frozen `numbers`, cloned `grid`/`edges`), `cloneState`,
  move + ui types, presets.

## 3. Solver (`solver.ts`)
- [x] 3.1 `solver_scratch` object graph (`SolverDomino`/`SolverPlacement`/
  `SolverSquare`), `setupGrid`, `ruleOutPlacement`.
- [x] 3.2 Trivial + Basic deductions (single-placement ×2, single-domino,
  must-overlap, local-duplicate ×2).
- [x] 3.3 Parity deduction via `engine/findloop.ts`.
- [x] 3.4 Set analysis (`deduce_set`, both `doubles` modes).
- [x] 3.5 Forcing-chain deduction via `FlipDsf` + stable sorts.
- [x] 3.6 `runSolver(maxDiff)` returning 0/1/2 + `max_diff_used`;
  `solutionPairs()` reading out the forced placements.

## 4. Generator (`generator.ts`)
- [x] 4.1 `alloc_scratch` + `alloc_make_layout` (over `engine/laydomino.ts`).
- [x] 4.2 `alloc_trivial`, `alloc_try_unique`, `alloc_find_neighbour`,
  `alloc_try_hard` (RNG-faithful draw order).
- [x] 4.3 `newDesc`: difficulty cap, generate/solve/keep loop, number-string
  encode with `[NN]`, solution `aux`.

## 5. Render + glue (`render.ts`, `index.ts`)
- [x] 5.1 Palette (index-for-index, `COL_MISTAKE` appended), NARROW_BORDERS
  `computeSize`/`COORD`/`FROMCOORD`, `setTileSize`.
- [x] 5.2 `redraw` + `drawTile`: dominoes, edges, numbers, highlights, clash,
  cursor, flash, mistake overlay; packed `Int32Array` cache with every overlay
  in the diff key.
- [x] 5.3 `interpretMove` (click→domino/edge, highlight toggles, half-grid
  cursor), `executeMove` (domino/edge/solve + completion check), `newUi`.
- [x] 5.4 `solve` (aux fast-path else re-solve), `findMistakes`, `textFormat`,
  `describeParams`/`paramConfig`, `colours`, `registerGame`.

## 6. Differential + tests
- [x] 6.1 `puzzles/auxiliary/dominosa-trace.c` + CMake line; build pure-C;
  record `__fixtures__/dominosa-c-reference.json` (10 fixtures across all 5
  difficulties).
- [x] 6.2 Gated `dominosa-differential.test.ts`: byte-match `newDesc` desc +
  TS-solver grades each C board at the recorded difficulty. **All 10 green.**
- [x] 6.3 Tier-1 tests: params/desc round-trip, solver grading, move logic,
  completion, findMistakes, solve; tier-2.5 clash render scenario.

## 7. Register + gate + close
- [x] 7.1 Register (stage 1): add to `ts-ported-ids.ts` + import in
  `games/index.ts`.
- [x] 7.2 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run`
  (2234) → `vite build`); dev smoke-test in browser (renders, places dominoes,
  Solve fills + completes, 0 console errors).
- [x] 7.3 **Stage 2 (owner acceptance):** `TS_PORTED` in
  `puzzles/CMakeLists.txt`, delete `puzzles/dominosa.c` +
  `puzzles/laydomino.c` (now its last C consumer) + trace harness, rebuild
  wasm, archive change.
</content>
