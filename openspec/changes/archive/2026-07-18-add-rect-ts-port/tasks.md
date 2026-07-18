# Tasks — add-rect-ts-port

## 1. Scaffold + state/codec

- [x] 1.1 `scripts/new-game-port.sh rect`; fill `state.ts`: params
      (w/h/expandfactor/unique), encode/decode/validate params (`%g`/`atof`/
      `Math.fround` for the float), the run-length desc codec (`a–z` gaps, `_`
      separators, decimal numbers), `RectState` (grid numbers + hedge/vedge +
      correct + completed/cheated), `newState`/`cloneState`, the move union.
- [x] 1.2 `moves.ts`: `getCorrect` (win/highlight analysis), `gridDrawRect`,
      `executeMove` (rect/edge/solve ops → new state, recompute correct + set
      completed) — shared by index + render so render's drag preview can import
      without a cycle (playbook §3.2).
- [x] 1.3 Tier-1 tests: params round-trip (incl. `e`/`a` suffixes), desc
      round-trip, `validateDesc` rejections (bad char, too much/little data).

## 2. Solver + generator (byte-match-critical)

- [x] 2.1 `solver.ts`: `rectSolver(w, h, numbers, hedge?, vedge?, rs?)` —
      candidate enumeration, overlaps/rectbyplace bookkeeping, the deduction
      loop (sole-number-position, placement intersection, rectangle-focused and
      square-focused elimination), and the `rs`-gated number winnowing. Returns
      0/1/2 and, when `hedge`/`vedge` given, writes the placed edges. Reproduce
      the `remove_rect_placement`/`remove_number_placement` swap-with-end order
      (it feeds the RNG index).
- [x] 2.2 `generator.ts`: `newDesc` — base-grid tiling (`enumRects` +
      `placeRect`), singleton removal, the two-pass expand-and-transpose
      stretch, solver-gated number placement, aux + run-length desc encoding.
      Byte-faithful RNG draw order.
- [x] 2.3 C trace harness `puzzles/auxiliary/rect-trace.c` (+ CMake line); build
      pure-C (`-DUSE_TS_RANDOM=0`); record fixtures (presets + non-square +
      non-preset + `unique=false`) to `__fixtures__/rect-c-reference.json`.
- [x] 2.4 Gated differential `rect-differential.test.ts`: byte-match desc + aux
      via `describeDescDifferential` (+ `validateDesc` passes).
- [x] 2.5 Tier-1 solver tests: generated boards uniquely solvable; `solve()`
      recovers the unique solution from a blank/dirty mid-game state.

## 3. Game glue + rendering

- [x] 3.1 `render.ts`: palette (index-for-index with C enum + `COL_MISTAKE`),
      `computeSize` (NARROW_BORDERS `BORDER = 1`), `newDrawState`, the corner
      computation + `Int32Array` cache word, `drawTile`, `redraw` (drag preview,
      correct fill, cursor, flash), `flashLength`.
- [x] 3.2 `index.ts`: `coord_round`, `interpretMove` (drag-rect / erase /
      edge-toggle / keyboard cursor with press-to-drag), `newUi`, `solve`,
      `findMistakes`, `textFormat`, `describeParams`/`paramConfig`, the `Game`
      object + `registerGame`.
- [x] 3.3 Register: add `"rect"` to `ts-ported-ids.ts` and import in
      `games/index.ts`.

## 4. Tests + gate

- [x] 4.1 Tier-1 input/executeMove tests (drag draws outline, right-drag erases
      interior, edge toggle, no-op suppression, completion detection).
- [x] 4.2 `findMistakes` tier-1 + a paint-twice tier-2 render test (a wrong edge
      reds even when the tile was already drawn — playbook §3.2).
- [x] 4.3 `rect-render-scenario.test.ts`: a targeted op-assertion + snapshot on
      a reached frame (opener + a correct-fill frame).
- [x] 4.4 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`); `openspec validate add-rect-ts-port --strict`.
- [x] 4.5 Dev-verify in the browser (Playwright): renders with the TS badge,
      drag draws/erases rectangles, edge-click toggles, completion flash + grey
      correct fill, Check & Save refuses a wrong board, Solve completes; 0
      console errors.

## 5. Stage 2 (on owner acceptance)

- [x] 5.1 Flip `TS_PORTED` in `puzzles/CMakeLists.txt`; delete `puzzles/rect.c`
      + `puzzles/auxiliary/rect-trace.c` + its `cliprogram` line; `rm -rf
      build/wasm/` + rebuild (rect in catalog, no rect.wasm).
- [x] 5.2 Capture the two icon PNGs (`?screenshot` capture mode).
- [x] 5.3 `openspec archive add-rect-ts-port`; commit port + archive together.
