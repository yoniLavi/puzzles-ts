# Tasks — add-lightup-ts-port

## 1. Scaffold + state/codec

- [x] 1.1 `scripts/new-game-port.sh lightup`; fill `state.ts`: params
      (w/h/blackpc/symm/difficulty), encode/decode/validate params (lenient
      quirks: ROT4→ROT2 demotion, legacy `r`), desc codec (run-length
      `a–z`/`B`/`0–4`), `newState`/`cloneState`, move union, `listLights`/
      `setLight`/`getSurrounds` helpers, completion checks
      (`gridLit`/`gridOverlap`/`gridAddsup`/`gridCorrect`).
- [x] 1.2 Tier-1 tests: params round-trip (incl. quirks), desc round-trip,
      validateDesc rejections, setLight/lit-count invariants.

## 2. Solver + generator (byte-match-critical)

- [x] 2.1 `solver.ts`: `tryForcedLight`, `tryClue` (satisfied→impossible,
      saturated→lights), discount sets (`discountUnlit`/`discountClue` over
      `Combi` from `src/native/combi/`, `tryRuleOut`, best-square selection),
      bounded recursion (MAXRECURSE 5, FORCEUNIQUE bookkeeping), `dosolve`
      with difficulty flags + maxdepth tracking, `F_NUMBERUSED` tracking.
- [x] 2.2 `generator.ts`: `setBlacks` (5 symmetry modes + centre-square
      draw), `placeLights`, `placeNumbers`, `puzzleIsGood`,
      `stripUnusedNums`, number-removal loop over the one-shot shuffled
      index list, difficulty floor check, blackpc ramp; desc encoding.
- [x] 2.3 C trace harness `puzzles/auxiliary/lightup-trace.c` (+ CMake line);
      build pure-C (`-DUSE_TS_RANDOM=0`); record fixtures (9 presets +
      non-default symm/blackpc/REF2/REF4/NONE cases) to `__fixtures__/`.
- [x] 2.4 Gated differential `lightup-differential.test.ts` via
      `describeDescDifferential` — byte-match green.
- [x] 2.5 Tier-1 solver tests: generated boards uniquely solvable at exactly
      the recorded difficulty; easy boards solvable without discount sets;
      solve() recovers a correct grid from a dirty mid-game state.

## 3. Game glue + rendering

- [x] 3.1 `index.ts`: `interpretMove` (left=light, right=mark, cursor keys +
      select/`i`), `executeMove` (toggles, solve compound, completion check),
      `solve()` (current-state then clean-state, emitting the op list),
      `findMistakes` (D4), `prefs` (`show-lit-blobs`), `paramConfig` +
      `describeParams` (D6), text format, `canMarkAll` n/a, flash length.
- [x] 3.2 `render.ts`: palette index-for-index (D5), per-tile packed cache +
      `wrong` sidecar in diff key, tile draw (black/number/lit/bulb/overlap/
      blob/cursor/error outline), first-draw background + border, flash.
- [x] 3.3 Tier-1 input/executeMove tests; tier-2.5 render scenario +
      snapshot (lit corridor colours, overlap error, wrong-number red,
      mistake overlay repaints on second paint, blob-pref toggle).
- [x] 3.4 Icons: two PNGs via `?screenshot` capture — n/a (lightup already
      has committed icons from the C build).

## 4. Stage 1 — register + verify

- [x] 4.1 Register in `ts-ported-ids.ts` + `games/index.ts`;
      `augmentation.test.ts` (describeParams keys) green.
- [x] 4.2 Full gate green (`tsc`, `biome lint`, `vitest run`, `vite build`).
- [x] 4.3 Dev-server Playwright smoke on the TS path (TS badge shown):
      bulbs + yellow corridors + overlap-red, right-click marks, Check &
      Save refusal (1 mistake, red ring on the wrong bulb only), Solve to
      a completed board, undo, Preferences shows show-lit-blobs, Custom
      type 9×9 4-way generates with a correct header; 0 console errors.
      (Win flash verified by the tier-1 flashLength test + the ported
      3-phase blink; not exercised in-browser.)
- [ ] 4.4 Owner smoke-test / acceptance pass.

## 5. Stage 2 — on owner acceptance only

- [ ] 5.1 `TS_PORTED` in `puzzles/CMakeLists.txt` (drop `solver(lightup)`),
      delete `puzzles/lightup.c` + `puzzles/auxiliary/lightup-trace.c` (+ its
      CMake line); `rm -rf build/wasm` + rebuild; lightup in catalog, no wasm.
- [ ] 5.2 Update `docs/porting/game-port-playbook.md` with anything learned;
      archive this change in the same commit.
