# Tasks — add-slant-ts-port

## 1. Shared findloop leaf

- [x] 1.1 `src/native/engine/findloop.ts`: idiomatic Tarjan bridge-finder
      (`findLoops(nvertices, neighbours)` → `{ anyLoop, isLoopEdge,
      isBridge }`) per D1.
- [x] 1.2 Tier-1 tests: no loop in a tree/forest, loop edges identified in a
      cycle-with-tail graph, bridges vs loop edges, multi-component graphs,
      vertex counts on either side of a bridge.

## 2. Scaffold + state/codec

- [x] 2.1 `scripts/new-game-port.sh slant`; fill `state.ts`: params
      (w/h/diff), encode/decode/validate params, desc codec (run-length
      `a–z` gaps + `0–4` clues over the `(w+1)×(h+1)` vertex grid),
      `newState`/`cloneState` (shared frozen clues), move union, error
      recompute (D5) helpers.
- [x] 2.2 Tier-1 tests: params round-trip, desc round-trip, validateDesc
      rejections, completion/error checks on a hand-built small board.

## 3. Solver + generator (byte-match-critical)

- [x] 3.1 `solver.ts`: clue-point counting pass (with the Hard-only
      single-pair equivalence tracking), square pass (immediate loop
      avoidance always; dead-end avoidance + slashval at Hard), vbitmap
      pass (Hard only), `fillSquare` with release-build semantics (D2),
      exits/border bookkeeping over the shared `Dsf`.
- [x] 3.2 `generator.ts`: filled-grid growth (shuffle + per-square
      `random_upto` fallback), clue derivation, two-pass prioritised
      solver-gated clue removal, regenerate-while-too-easy loop, desc
      encoding, aux solution.
- [x] 3.3 C trace harness `puzzles/auxiliary/slant-trace.c` (+ CMake line);
      build pure-C (`-DUSE_TS_RANDOM=0`); record fixtures (6 presets +
      non-preset sizes) to `__fixtures__/`.
- [x] 3.4 Gated differential `slant-differential.test.ts` via
      `describeDescDifferential` — byte-match green.
- [x] 3.5 Tier-1 solver tests: generated boards uniquely solvable at
      exactly the target difficulty; Hard boards unsolvable by the Easy
      solver; solve() recovers a correct grid from a dirty mid-game state.

## 4. Game glue + rendering

- [x] 4.1 `index.ts`: `interpretMove` (click cycles with swap pref, cursor
      keys + select/select2, literal `\`//`/backspace), `executeMove`
      (set/solve, error recompute, completion latch), `solve()` (aux or
      re-solve at Hard), `findMistakes` (D4), `prefs` (`left-button`,
      `fade-grounded`), `paramConfig` + `describeParams` (D7), text format,
      flash length.
- [x] 4.2 `render.ts`: palette index-for-index (D6), `(w+2)×(h+2)` packed
      `Int32Array` cache with the findMistakes overlay as a packed MISTAKE
      bit (rebuilt each frame, so it is in the diff key by construction —
      no sidecar needed), tile draw (slashes, corner dots, clue circles,
      error colouring, cursor, grounded fade, flash), first-draw
      background.
- [x] 4.3 Tier-1 input/executeMove tests; tier-2.5 render scenario +
      snapshot (slash chessboard colours, loop-error red, clue-error red,
      grounded fade pref, mistake overlay repaints on second paint).
- [x] 4.4 Icons: n/a (slant already has committed icons from the C build).

## 5. Stage 1 — register + verify

- [x] 5.1 Register in `ts-ported-ids.ts` + `games/index.ts`;
      `augmentation.test.ts` (describeParams keys) + `custom-params.test.ts`
      green.
- [x] 5.2 Full gate green (`tsc`, `biome lint`, `vitest run`, `vite build`).
- [x] 5.3 Dev-server Playwright smoke on the TS path: click cycling both
      directions, error highlighting (loop red, clue red), Check & Save
      refusal with red squares, Solve, undo, Preferences shows both prefs
      and they act, Custom type generates with a correct header; 0 console
      errors.
- [ ] 5.4 Owner smoke-test / acceptance pass.

## 6. Stage 2 — on owner acceptance only

- [ ] 6.1 `TS_PORTED` in `puzzles/CMakeLists.txt` (drop `solver(slant)`),
      delete `puzzles/slant.c` + `puzzles/auxiliary/slant-trace.c` (+ its
      CMake line); `rm -rf build/wasm` + rebuild; slant in catalog, no
      wasm. `puzzles/findloop.c` stays (five C consumers remain).
- [ ] 6.2 Update `docs/porting/game-port-playbook.md` with anything
      learned; archive this change in the same commit.
