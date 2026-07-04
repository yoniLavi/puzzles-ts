# Tasks — Separate TS port

## 1. Promote divvy to a shared engine leaf

- [x] 1.1 Move `solo/divvy.ts` → `src/native/engine/divvy.ts` (`git mv`); keep the
  cap + byte-match docs. Repoint `solo/generator.ts` import.
- [x] 1.2 Delete `palisade/divvy.ts`; repoint `palisade/solver.ts` (and any other
  importer) at `engine/divvy.ts`.
- [x] 1.3 `tsc -b --noEmit` + run solo/palisade tests (byte-match differentials
  stay green).

## 2. Scaffold + state

- [x] 2.1 `scripts/new-game-port.sh separate`; keep the test/differential stubs.
- [x] 2.2 `state.ts`: `SeparateParams {w,h,k}`, `SeparateState` (letters
  `Uint8Array`, borders `Uint8Array`, completed/cheated), move/UI/mistake types,
  the three-valued border constants (mirror Palisade), presets, params
  encode/decode/validate, desc encode/validate/`newState`/`cloneState`,
  `isSolved` (region size `k` + one-of-each-letter + no interior wall),
  `executeMove`, `status`, `textFormat`.

## 3. Solver + generator

- [x] 3.1 `solver.ts`: port `solver_attempt` (DSF + `disconnect` matrix +
  `contents`) run to a fixpoint; `solveToBorders(params, letters)` → the unique
  partition's border bytes (or `null` if not fully deducible).
- [x] 3.2 `generator.ts`: port `generate` (`divvyRectangle` + fill-and-re-solve
  retry with gen-lock); `newDesc(p, rng)` → `{ desc }`. Bounded loops (loud-fail
  cap).

## 4. Index + render

- [x] 4.1 `index.ts`: `Game` object + `interpretMove` (edge-nearest click + half-
  grid cursor, mirror Palisade), `solve`, `findMistakes`, `flashLength`,
  params/config, `registerGame(separateGame)`.
- [x] 4.2 `render.ts`: palette, `computeSize`, `fromCoord`, per-tile `Int32Array`
  cache, three-valued walls, the letter in each cell, cursor, win flash, live
  error highlighting (over-size / duplicate-letter region) + the `findMistakes`
  overlay in the diff key.

## 5. Differential + tests

- [x] 5.1 `puzzles/auxiliary/separate-trace.c` (+ CMakeLists line): print the
  generated desc as JSON for a seed range. Build pure-C (§4.2), record
  `__fixtures__/separate-c-reference.json`.
- [x] 5.2 `separate-differential.test.ts`: byte-match `newDesc` vs the fixture
  via `describeDescDifferential`; plus a solver-agreement follow-on (every C
  board is uniquely solvable by the TS solver).
- [x] 5.3 Tier-1 tests: params/desc round-trip, `validateParams`/`validateDesc`
  rejections, `isSolved` true/false cases, generated boards solvable, `solve`
  solves, `findMistakes` flags a contradicting wall (and repaints on a second
  redraw — the §3.2 already-drawn guard).
- [x] 5.4 Tier-2.5 render scenario + snapshot (opener frame, and a `showMistakes`
  frame).
- [x] 5.6 Completed-region highlight (`COL_CORRECT`, the shared neutral-grey shade) in **both** Separate and
  Palisade render (size `k` + correct content + no interior wall, in the diff key);
  tests: one sealed region shows exactly `k` shaded cells (Separate); solved board
  shaded / untouched none (Palisade). Owner-requested this session.
- [x] 5.5 Benchmark generation on a fixed seed for each preset; drop any preset
  that is unacceptably slow in the browser (document in design D5).

## 6. Stage 1 — register for smoke-testing

- [x] 6.1 Add `separate` to `ts-ported-ids.ts` + import in `games/index.ts` so
  `registerGame` runs.
- [x] 6.2 Add the catalog `puzzle(separate … TS_PORTED)` entry to the **main**
  `puzzles/CMakeLists.txt` and remove it from `unfinished/CMakeLists.txt`;
  `npm run build:wasm` so `catalog.json` lists it. (Icons captured next.)
- [x] 6.3 Capture the two icon PNGs (`?screenshot` capture mode) →
  `src/assets/icons/separate-{64,128}d8.png`; `asset-integrity.test.ts` green.
- [x] 6.4 `npm run dev`; owner smoke-tests the TS path (render, input, solve,
  Check & Save, keyboard/mouse). Fix parity gaps before stage 2.

## 7. Stage 2 — acceptance, C + divvy deletion, archive

- [x] 7.1 On owner acceptance: delete `puzzles/unfinished/separate.c` and the
  transient `separate-trace.c` (+ its CMakeLists line + the advisory diff script
  if any).
- [x] 7.2 Delete `puzzles/divvy.c`, `puzzles/auxiliary/divvy-test.c` (+ its
  CMakeLists line), drop `divvy.c` from `core_obj`, remove the `divvy_rectangle`
  decl from `puzzles.h` (and the `devel.but` reference). `npm run build:wasm`;
  confirm the build links, `separate` is in the catalog with no wasm, and no
  other C consumer of divvy remains.
- [x] 7.3 Gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build`). Format only `src/native/games/separate/` + `engine/divvy.ts`.
- [x] 7.4 Update `docs/porting/game-port-playbook.md` with anything this
  finish-an-unfinished-game port taught. Archive the change
  (`openspec archive add-separate-ts-port --yes`) in the same commit as the C
  deletion.
