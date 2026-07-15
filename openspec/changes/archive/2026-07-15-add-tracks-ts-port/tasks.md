# Tasks — add-tracks-ts-port

## 1. Scaffold + state/codec

- [x] 1.1 `scripts/new-game-port.sh tracks`; fill `state.ts`: params
      (w/h/diff/single_ones), encode/decode/validate params, the shared
      `numbers`/station model, desc codec (run-length `a–z` gaps + hex
      direction-flag clue squares over `w*h`, then the `,`-separated `S?`
      clue-number list), `newState`/`cloneState`, the S_E edge-flag helpers
      (edges shared across adjacent squares), move union.
- [x] 1.2 Tier-1 tests: params round-trip (incl. `single_ones` suffix), desc
      round-trip, `validateDesc` rejections (bad char, wrong clue count, not
      exactly one entrance + one exit).

## 2. Solver + generator (byte-match-critical)

- [x] 2.1 `solver.ts`: `tracksSolve(state, diff)` with the exact rung order —
      Easy (`update_flags`, `count_clues`, `check_loop` over a `Dsf`), Tricky
      (`check_single`, `check_loose_ends`, `check_neighbours(false)`), Hard
      (`check_neighbours(true)`, `check_bridge_parity` over `findLoops`).
      Reproduce C's edge-processing order in `check_bridge_parity`
      (D-then-R, x-outer/y-inner) — each parity read sees earlier edges set in
      the same pass. `check_completion` (mark) for the live error overlay.
- [x] 2.2 `generator.ts`: `lay_path` (random walk left→bottom), clue-number
      derivation, boring/consecutive-1 rejection, `add_clues` (lay clues to
      solubility at the target difficulty, then strip redundant), 4×4-Tricky→
      Easy fallback, desc encoding. Byte-faithful RNG draw order.
- [x] 2.3 C trace harness `puzzles/auxiliary/tracks-trace.c` (+ CMake line);
      build pure-C (`-DUSE_TS_RANDOM=0`); record fixtures (presets + non-preset
      + `single_ones=false`) to `__fixtures__/tracks-c-reference.json`.
- [x] 2.4 Gated differential `tracks-differential.test.ts`: byte-match desc via
      `describeDescDifferential`, plus inline TS-solver-agreement (grade each C
      board at the recorded difficulty, fail one below).
- [x] 2.5 Tier-1 solver tests: generated boards uniquely solvable at exactly
      their difficulty; Hard boards not solvable by the Tricky solver;
      `solve()` recovers the unique solution from a dirty mid-game state.

## 3. Game glue + rendering

- [x] 3.1 `moves.ts` (shared by index + render, avoids the render↔index
      cycle): the edge/square flip predicates (`ui_can_flip_square/edge`),
      `copyAndApplyDrag`, `moveDiff` (before→after op list), and `executeMove`
      (apply ops with the flip guard, skipped for solve; run `check_completion`;
      latch `completed`).
- [x] 3.2 `index.ts`: `interpretMove` (mouse down/drag/release with the
      straight-line drag constraint and click-vs-edge geometry; half-grid
      cursor + select/select2), `solve()` (re-solve curr then orig; `aux`
      unused), `findMistakes`, `paramConfig` + `describeParams` (keys
      `width`/`height`/`difficulty`/`disallow-consecutive-1-clues`), text
      format, flash length, `registerGame`.
- [x] 3.3 `render.ts`: palette index-for-index with the C enum; NARROW_BORDERS
      geometry (`sz6`/`TILE`, border 0, one-tile clue margin); per-tile
      `Int32Array` cache (`flags` + `flags_drag`, num-errors sidecar) with the
      findMistakes overlay in the diff key; straight/curved rails with
      sleepers, no-track crosses, drag preview (COL_DRAGON/COL_DRAGOFF), clue
      numbers, A/B labels, cursor, completion flash.
- [x] 3.4 Tier-1 input/executeMove/findMistakes tests (incl. the mistake
      paint-twice test — flag a wrong cell, redraw the same drawstate, assert
      the red overlay on the second paint); tier-2.5 render scenario + snapshot
      (rails + sleepers, clue-error red, drag preview, mistake overlay).

## 4. Stage 1 — register + verify

- [x] 4.1 Register in `ts-ported-ids.ts` + `games/index.ts`;
      `augmentation.test.ts` + `custom-params.test.ts` + `touch-input.test.ts`
      green.
- [x] 4.2 Full gate green (`tsc -b --noEmit`, `biome lint`, `vitest run`,
      `vite build`).
- [x] 4.3 Dev-server Playwright smoke on the TS path (port 5199, 6×6): renders
      with TS badge, A/B labels, clue numbers, given clue rails (curved rails +
      brown sleepers); left-drag lays track (cells tint white); Check & Save
      shows the success toast on a correct partial board; Solve draws the full
      A→B railway (straight rails w/ sleepers, curves, grey X no-track marks)
      and fires the completion "What's next?" dialog; 0 console errors (lone
      warning is the standard Lit dev-mode notice).
- [x] 4.4 Owner smoke-test / acceptance pass.

## 5. Stage 2 — on owner acceptance only

- [x] 5.1 `TS_PORTED` in `puzzles/CMakeLists.txt`, delete `puzzles/tracks.c` +
      `puzzles/auxiliary/tracks-trace.c` (+ its CMake line); `rm -rf build/wasm`
      + rebuild; tracks in catalog, no wasm. `puzzles/dsf.c` +
      `puzzles/findloop.c` stay (other C consumers remain).
- [x] 5.2 Update `docs/porting/game-port-playbook.md` with anything learned;
      archive this change in the same commit.
