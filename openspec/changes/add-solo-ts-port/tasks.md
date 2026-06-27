# Tasks: Solo TS port

> Largest port to date; full parity across standard / jigsaw / X / killer in one
> change (registry is all-or-nothing per game). Follow the playbook lifecycle.

## 0. Scaffold
- [x] 0.1 `scripts/new-game-port.sh solo`; read `puzzles/solo.c` +
      `puzzles/divvy.c` and `src/native/games/keen/` end-to-end as the closest
      exemplar.

## 1. State, params, codec (`solo/state.ts`)  ✅ done + tested (`solo-state.test.ts`, 10 tests)
- [x] 1.1 `SoloParams { c, r, symm, diff, kdiff, xtype, killer }` (`cr = c·r`;
      jigsaw `r === 1`); the upstream preset list (in `index.ts`);
      `encodeParams`/`decodeParams` (base `{c}x{r}`/`{c}j`; `x`/`k` flags;
      full-mode symmetry `m8/m4/md4/m2/md2/r4/a` + difficulty `db/di/da/de/du`;
      lenient decode incl. legacy `{c}x{r}j`); `validateParams` (upstream bounds
      incl. killer `< 10`).
- [x] 1.2 Grid codec (`encodeGrid`/`specToGrid` run-length blank/digit) +
      block-structure codec (`encodeBlockStructureDesc`/`specToDsf`, run-length
      internal-edge, transposed read order — the `'z'` overflow quirk transcribed
      verbatim, documented). Desc assembly: givens grid; `,`+block-structure when
      jigsaw; `,`+cage-structure+`,`+cage-sum-grid when killer. `validateDesc`.
- [x] 1.3 Immutable `BlockStructure` (`whichblock`/per-block cell lists, built
      from a `Dsf` or the rectangular formula) and optional `SoloKiller` (cage
      `BlockStructure` + per-cage sum grid). `newState` rebuilds both from the
      desc; givens flagged immutable.
- [x] 1.4 `SoloState` (immutable shared blocks/killer; mutable `grid`/`pencil`;
      `completed`/`cheated`); `cloneState`.
- [x] 1.5 `SoloMove` union (`set`/`pencilAll`/`pencilStrike`/`solve`); the
      completion/validity check (`checkValid` — every row/col/block/diagonal holds
      each digit once, every killer cage sums correctly); `status`; `SoloUi` +
      `newUi` (sticky pencil on, auto-pencil on, keep-highlight off, cursor hidden).
      _Live per-cell error highlighting (`check_errors`) deferred to the render
      task 4.1._

## 2. Solver (`solo/solver.ts`)  ✅ done + tested (`solver.test.ts`, 7 tests)
- [x] 2.1 The `SolverUsage` model: per-cell candidate cube (`Uint8Array`) + the
      `row`/`col`/`blk`/`diag` "already-placed" grids; X-diagonals and jigsaw
      blocks fall out of the same loops (jigsaw via the immutable `BlockStructure`,
      X via the optional `diag` array). Shared `DIFF_*` sentinels. Killer working
      cages are a mutable `Cages` (plain JS arrays) coupled with `kclues` in one
      `KillerWork` field; `removeFromBlock`/`splitBlock` match C's compaction.
- [x] 2.2 Standard techniques ported faithfully: positional + numeric elimination
      (`DIFF_BLOCK`/`DIFF_SIMPLE`), block/row/column (+ diagonal) intersection
      (`DIFF_INTERSECT`), set elimination (`DIFF_SET`), row-vs-col + forcing chains
      (`DIFF_EXTREME`), and the bounded recursion (`DIFF_RECURSIVE`).
- [x] 2.3 Killer techniques: single-square cages (`DIFF_KSINGLE`), deduced
      extra-cages (`DIFF_KINTERSECT`, with `filter_whole_cages`/`split_block`),
      min/max elimination (`DIFF_KMINMAX`), sum-combination enumeration
      (`DIFF_KSUMS`) over the eagerly-precomputed `sum_bits{2,3,4}` tables.
- [x] 2.4 The `runSolver(...)` driver + `solveSolo(...)` `SoloState` wrapper: run
      techniques in difficulty order on both axes, return the difficulty reached
      (or `DIFF_AMBIGUOUS`/`DIFF_IMPOSSIBLE`), faithful to upstream's grading
      (incl. the `goto got_result` quirk where upstream's `dlev->diff =
      DIFF_IMPOSSIBLE` is overwritten by the local `diff` — replicated, commented).
      Validated on a known unique 3×3 board (full solution + Trivial grading),
      ambiguous/impossible verdicts, and killer/jigsaw codec→solve round-trips.

## 3. Generator (`solo/generator.ts` + `solo/divvy.ts`)  ✅ done + byte-match verified
- [x] 3.1 Port `divvy_rectangle` as `solo/divvy.ts` (idiomatic typed-array
      union-find + retry, RNG-faithful draw order — `order` shuffle, per-iteration
      `random_upto` omino pick, BFS over the same permutation). Local; promote to
      `engine/` only on a 2nd consumer. Byte-match-safe on the shared `Dsf`
      (membership-only consumer, playbook §2.2).
- [x] 3.2 `gridgen` full-solution generation under all active constraints (Latin +
      blocks + X-diagonals + killer cages), most-constrained-square heuristic + step
      budget; `symmetries()` (in `state.ts`) drives the symmetry-orbit removal.
- [x] 3.3 Killer cage generation (`gen_killer_cages` + the singleton-fold merges +
      `compute_kclues` sum assignment) when `killer`.
- [x] 3.4 `newDesc`: minimise givens in shuffled symmetry orbits via the graded
      solver to the exact target difficulty (solver-gated minimiser); capped-
      iteration backstop (`MAX_REGENERATE`) that throws rather than hanging
      (playbook §4.6). The 2x2 / jigsaw-`c<4` difficulty dial-down is faithful.
      _**Upstream-bug finding (design D5):** `merge_some_cages` never increments
      `npairs`, so no killer cages ever merge — every killer puzzle ships the raw
      `gen_killer_cages` layout. Reproduced verbatim (playbook §4.4); without it the
      killer desc diverges._

## 4. Render + glue (`solo/render.ts`, `solo/index.ts`)
- [ ] 4.1 `render.ts`: palette index-for-index with the C enum; block borders from
      the `Dsf` (rectangular + jigsaw); killer cage dashes + sum labels; X-diagonal
      shading; givens vs player digits; auto-sized pencil grids; cursor + pencil
      highlight; pencil-mode corner indicator; completion flash; `Int32Array` cache
      with the mistake overlay in the diff key (playbook §3.2 — ship the
      redraw-twice regression test).
- [ ] 4.2 `index.ts`: `interpretMove` (cell select; left real / right pencil with
      sticky + filled-cell rules; digit/backspace/space + no-op suppression +
      auto-pencil; `M` mark-all; keyboard cursor), `executeMove`, `status`,
      `solve`, `colours`, `setTileSize`, `describeParams` (variant-aware keys —
      playbook §3.4 + the `augmentation.test.ts` guard), `registerGame`.
- [ ] 4.3 `findMistakes`: re-solve from givens (+ killer cages) to the unique
      solution; flag wrong filled cells (`"cell"`) and notes that crossed out the
      solution digit (`"note"`); `[]` when not uniquely deducible.
- [ ] 4.4 `prefs` hook: sticky-pencil (on), auto-pencil (on), keep-highlight (off);
      `canMarkAll = true`. Defaults on the `Ui` via `newUi`.

## 5. Differential (`solo-trace.c` + `solo-differential.test.ts`)  ✅ done
- [x] 5.1 `puzzles/auxiliary/solo-trace.c` (+ `cliprogram` line); built pure-C
      (`-DUSE_TS_RANDOM=0`, playbook §4.2); 14 fixtures across all four variants +
      difficulties (Trivial→Unreasonable standard, X, jigsaw, killer), each
      recording desc + the upstream solver's (diff, kdiff) on the published board.
      One pathological case (Trivial killer, `kdiff=KSINGLE`) dropped — upstream
      generation of it takes minutes (rare-difficulty target), too slow to replay.
- [x] 5.2 Gated `solo-differential.test.ts`: **byte-match for every variant**
      (28 tests, all green) — the generator is byte-match across the board (no
      `qsort`/order-dependent step; D5), so no verdict-record fallback was needed —
      **plus** a solver-grading assertion (decode the C board, run the TS solver,
      assert C's recorded (diff, kdiff)). D5 outcome recorded in `design.md`.

## 6. Tests
- [ ] 6.1 Tier-1: param/desc round-trip (all variants), solver grades known boards,
      generator produces uniquely-solvable boards at the requested difficulty,
      move/executeMove purity + completion, `findMistakes` (cell + note).
- [ ] 6.2 Tier-2/2.5: render-op assertions + `toMatchSnapshot` for each variant's
      distinctive rendering (jigsaw borders, killer cages + sums, X shading, pencil
      grids, mistake overlay). Heavy generator tests seed-deterministic + explicit
      timeouts (playbook §5.2).
- [ ] 6.3 Full gate green: `tsc -b --noEmit` → `biome lint` → `vitest run` →
      `vite build` (format only `src/native/games/solo/`, playbook §7).

## 7. Stage-1 registration (owner smoke-test)
- [ ] 7.1 Add `solo` to `ts-ported-ids.ts`; import in `games/index.ts`
      (`registerGame`). Verify all four variants in `npm run dev` (render + input +
      animation), then hand to owner for acceptance.

## 8. Stage-2 (owner acceptance only)
- [ ] 8.1 Add `TS_PORTED` to solo's `puzzle()` in `puzzles/CMakeLists.txt`; delete
      `puzzles/solo.c`, `puzzles/divvy.c`, `puzzles/auxiliary/solo-trace.c` (+ its
      `cliprogram` line) and any advisory diff script. Rebuild wasm; confirm solo in
      the catalog with no `solo.wasm`.
- [ ] 8.2 `openspec archive add-solo-ts-port --yes` in the same commit as the C
      deletion. Update the migration-status memory + the dev guides with anything
      learned. (`add-solo-hint` is a separate follow-up change.)
