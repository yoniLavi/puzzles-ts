# Tasks — add-magnets-ts-port

## 1. Shared laydomino leaf

- [x] 1.1 Port `domino_layout` (`laydomino.c`) to
      `src/native/engine/laydomino.ts`, RNG-faithful (initial list shuffle +
      per-BFS-node neighbour shuffle; chessboard-parity singleton fixup).
      Tier-1 test: every cell paired with a valid partner (or a lone
      singleton for odd area), deterministic for a fixed seed.

## 2. Scaffold + state/codec

- [x] 2.1 `scripts/new-game-port.sh magnets`; fill `state.ts`: params
      (w/h/diff/stripclues), encode/decode/validate params, the desc codec
      (4 comma-separated clue rows + `wh` domino chars), `newState` (shared
      frozen dominoes + counts), the move union, status, text format.
- [x] 2.2 Tier-1 tests: params round-trip, desc round-trip, validateDesc
      rejections (short desc, inconsistent dominoes).

## 3. Solver + generator (byte-match-critical)

- [x] 3.1 `solver.ts`: `MagnetsSolver` faithful — clearflags/startflags,
      force, neither, checkfull, oddlength (Easy); advancedfull, nonneutral,
      countdominoes-neutral/non-neutral (Tricky, incl. the un-reset `ndom`
      quirk); −1/0/1 verdict.
- [x] 3.2 `generator.ts`: `genGame` (`dominoLayout` + `layDominoes`), derive
      counts, `checkDifficulty` (soluble at exactly `diff`; strip clues in
      shuffled order while uniquely solvable), desc + aux encoding.
- [x] 3.3 C trace harness `puzzles/auxiliary/magnets-trace.c` (+ CMake line);
      built pure-C (`-DUSE_TS_RANDOM=0`); 9 fixtures (8 presets-ish + a 7×7
      singleton case + a 5×5 stripclues case) to `__fixtures__/`.
- [x] 3.4 Gated differential `magnets-differential.test.ts` via
      `describeDescDifferential` — byte-match GREEN (desc **and** aux) + the
      TS solver grades each C board at the recorded difficulty.
- [x] 3.5 Tier-1 solver tests: generated boards uniquely solvable at exactly
      the target difficulty; Tricky boards unsolvable by Easy; Solve reaches
      completion.

## 4. Game glue + rendering

- [x] 4.1 `index.ts`: `interpretMove` (magnet/neutral cycles, clue toggle,
      cursor keys + select/select2), `executeMove` (set/flag/clue/solve +
      completion check), `solve()` (aux or re-solve), `findMistakes`,
      `paramConfig` + `describeParams`, `needsRightButton`, `colours`
      index-for-index, flash length, `changedState`.
- [x] 4.2 `render.ts`: NARROW_BORDERS geometry, packed `Int32Array` tile
      cache (which + set/error/cursor/not/flash + mistake — every overlay in
      the diff key), rounded-domino / symbol drawing, the four-border counts
      with their own diff arrays + grey "done" colour + red over-commit,
      corner `+`/`−` symbols, first-draw background.
- [x] 4.3 Tier-1 input/executeMove/findMistakes tests; tier-2.5 render
      scenario + snapshot (domino fills, magnet symbols, mistake overlay
      repaints on the second paint).
- [x] 4.4 Icons: already committed (`src/assets/icons/magnets-{64,128}d8.png`)
      — magnets was a catalog game before the port, so no recapture needed.

## 5. Stage 1 — register + verify

- [x] 5.1 Register in `ts-ported-ids.ts` + `games/index.ts`;
      `augmentation.test.ts` + `custom-params.test.ts` green.
- [x] 5.2 Full gate green (`tsc`, `biome lint`, `vitest run` — 2204 tests,
      `vite build`).
- [x] 5.3 Dev-server Playwright smoke on the TS path: magnet cycle (red +/
      black −), neutral/not-neutral cycle (green X / blue ?), clue-grey
      toggle, Check & Save refusal with the red mistake overlay (2 mistakes,
      overlay clears on dismiss), Solve → full solution + completion dialog;
      0 console errors.
- [x] 5.4 Owner smoke-test / acceptance pass. (Accepted 2026-07-05.)

## 6. Stage 2 — on owner acceptance only

- [x] 6.1 `TS_PORTED` in `puzzles/CMakeLists.txt` (dropped `solver(magnets)`),
      deleted `puzzles/magnets.c` + `puzzles/auxiliary/magnets-trace.c` (+ its
      CMake line); `rm -rf build/wasm` + rebuilt; magnets in catalog, no wasm.
      `puzzles/laydomino.c` stays (dominosa still uses `domino_layout`).
- [x] 6.2 Icons already committed; updated
      `docs/porting/game-port-playbook.md` (laydomino leaf noted); archived
      this change in the same commit.
