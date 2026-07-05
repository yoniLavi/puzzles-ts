# Tasks — add-tents-ts-port

## 1. Shared matching tweak

- [x] 1.1 `engine/latin.ts` `matching()`: accept optional `rs`, guard the
      `shuffle(Lorder)` and `random_upto` adjacency swap on `rs` presence
      (faithful to `matching.c`'s `if (rs)`); existing latin tests green.

## 2. Scaffold + state/codec

- [x] 2.1 `scripts/new-game-port.sh tents`; fill `state.ts`: params
      (w/h/diff), encode/decode/validate params, desc codec (run-length
      tree grid + `,`-separated edge numbers), `newState` (shared frozen
      numbers), the move union (cells batch / solve tents list), status,
      text format.
- [x] 2.2 Tier-1 tests: params round-trip, desc round-trip, validateDesc
      rejections, completion check on a generated board (incl. the matching
      existence check).

## 3. Solver + generator (byte-match-critical)

- [x] 3.1 `solver.ts`: `tents_solve` faithful — link deduction, non-tent
      marks, tree single-candidate (+ Tricky diagonal-pair), row/column
      combination enumeration (+ Tricky adjacent-row), 0/1/2 verdict.
- [x] 3.2 `generator.ts`: tent placement (order permutation + `random_upto`),
      tree placement via `matching`, empty row/col reject, edge numbers,
      solver-gate on exact difficulty; desc + aux encoding.
- [x] 3.3 C trace harness `puzzles/auxiliary/tents-trace.c` (+ CMake line);
      build pure-C (`-DUSE_TS_RANDOM=0`); recorded fixtures (6 presets +
      3 non-preset sizes) to `__fixtures__/`.
- [x] 3.4 Gated differential `tents-differential.test.ts` via
      `describeDescDifferential` — byte-match green (9 fixtures) + solver
      grades each C board at the recorded difficulty.
- [x] 3.5 Tier-1 solver tests: generated boards uniquely solvable at
      exactly the target difficulty; Tricky boards unsolvable by Easy;
      solve() recovers the grid from a dirty mid-game state.

## 4. Game glue + rendering

- [x] 4.1 `index.ts`: `interpretMove` (drag-based click/drag/release,
      `drag_xform`, cursor keys + select/select2 + T/N/B), `executeMove`
      (cells/solve, completion check with matching), `solve()` (aux or
      re-solve at Tricky), `findMistakes`, `paramConfig` + `describeParams`,
      `needsRightButton`, `colours` index-for-index, flash length.
- [x] 4.2 `render.ts`: NARROW_BORDERS geometry, packed `Int32Array` tile
      cache (v + error bits + cursor + flash + mistake — every overlay in
      the diff key), tree/tent/error-diamond drawing, edge numbers with
      their own diff array, `find_errors` (adjacency + numeric + dsf
      over-commitment, with the drag dsx transform), first-draw background.
- [x] 4.3 Tier-1 input/executeMove/findMistakes tests; tier-2.5 render
      scenario + snapshot (tent/tree draw, adjacency error diamond, red
      number, mistake overlay repaints on the second paint).
- [x] 4.4 Icons: tents already has committed icons from the C build (no
      recapture needed).

## 5. Stage 1 — register + verify

- [x] 5.1 Register in `ts-ported-ids.ts` + `games/index.ts`;
      `augmentation.test.ts` + `custom-params.test.ts` green.
- [x] 5.2 Full gate green (`tsc`, `biome lint`, `vitest run` — 2150 tests,
      `vite build`).
- [x] 5.3 Dev-server Playwright smoke on the TS path: left-click place tent
      (valid yellow vs over-committed red), right-drag paint non-tents,
      numeric-clue red highlight, Solve → completion dialog, Check & Save
      refusal with the red mistake overlay on the offending cell; 0 console
      errors.
- [x] 5.4 Owner smoke-test / acceptance pass. (Accepted 2026-07-05.)

## 6. Stage 2 — on owner acceptance only

- [x] 6.1 `TS_PORTED` in `puzzles/CMakeLists.txt` (dropped `solver(tents)`),
      deleted `puzzles/tents.c` + `puzzles/auxiliary/tents-trace.c` (+ its
      CMake line); `rm -rf build/wasm` + rebuilt; tents in catalog, no wasm.
      `puzzles/matching.c` + `puzzles/dsf.c` stay (other C consumers).
- [x] 6.2 Updated `docs/porting/game-port-playbook.md` (§2.1 matching reuse);
      archived this change in the same commit.
