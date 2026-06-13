# Tasks: Port Palisade to TypeScript

## 1. Extend the shared `Dsf`
- [x] 1.1 Add `Dsf.size(i)` and `Dsf.equivalent(a, b)` to
  `src/native/engine/dsf.ts`; extend `dsf.test.ts`. Galaxies/Pegs stay green.

## 2. State, params, desc codec (`state.ts`)
- [x] 2.1 Types: `PalisadeParams` (`w`,`h`,`k`), `PalisadeState`
  (shared frozen `clues: Int8Array`, per-state `borders: Uint8Array`,
  `completed`, `cheated`), `PalisadeMove` (discriminated union), `PalisadeUi`
  (`x`,`y`,`show`); border-flag constants (`BORDER_*`, `DISABLED`, `FLIP`,
  `BORDER_MASK`, `bitcount`, `dx`/`dy`).
- [x] 2.2 `defaultParams`, `presets` (4 upstream), `encodeParams` (`WxHnK`),
  `decodeParams` (lenient), `validateParams` (k≥1, w/h≥1, k | w·h, k<w·h,
  k=2 corridor rule).
- [x] 2.3 Clue desc codec: encode (digit clues, `a`–`z` empty runs) +
  `validateDesc` + `newState` parse; `init_borders` rim; `cloneState`;
  `textFormat`.
- [x] 2.4 `isSolved` (black-border DSF: region size = k, clue = wall count,
  no stray border); `executeMove` (`edges` two-sided XOR with rim guard,
  `solve` border replace); `status`.
- [x] 2.5 Unit tests for all of the above.

## 3. `divvy_rectangle` leaf (`divvy.ts`)
- [x] 3.1 `addRemCommon`, `divvyRectangleAttempt` (typed-array `own`/`sizes`/
  `addable`/`removable`, BFS square-stealing), `divvyRectangle` retry loop;
  kept-as-assert cross-check.
- [x] 3.2 Unit tests: every cell owned by exactly one size-`k` region; runs
  across presets/seeds; `w·h % k === 0` precondition.

## 4. Solver + generator (`solver.ts`)
- [x] 4.1 `SolverCtx` + edge primitives (`connect`/`connected`/`disconnect`/
  `disconnected`/`maybe`); the six deductions, faithfully ported with inline
  C references; the fixpoint loop; `solver()` → `isSolved`.
- [x] 4.2 Generator `newDesc`: divvy → derive clues + solution borders →
  shuffle-and-strip clues while still uniquely solvable → emit RLE desc + aux
  solution.
- [x] 4.3 Unit tests: each deduction in isolation on a hand-built board; full
  solve of a generated board; generator output validity + unique solvability
  across all 4 presets and several seeds.

## 5. Input + Game object (`index.ts`)
- [x] 5.1 `newUi`; `interpretMove`: mouse — nearest-edge selection, left =
  wall↔unknown, right = no-wall↔unknown, emit the two-sided edit (with
  off-grid rejection); cursor — half-grid move + `UI_UPDATE`, select/select2
  toggling the cursor's edge.
- [x] 5.2 `solve` (run solver from the rim, emit `{type:"solve", borders}`);
  `findMistakes` (re-solve to the unique solution; flag player walls the
  solution lacks and no-wall marks the solution contradicts; empty when the
  clue set isn't uniquely solvable); `statusbarText` ("Region size: k");
  Game object wiring (sixth `PalisadeMistake` generic); `registerGame`.
- [x] 5.3 Unit tests: edge selection from click coordinates, two-sided edit,
  rim protection, cursor movement + select, `findMistakes` (wrong wall flagged,
  correct board clean).

## 6. Rendering (`render.ts`)
- [x] 6.1 `colours` (`game_mkhighlight` background/flash + grid-black +
  error-red + line-maybe-yellow + line-no via the shared mkhighlight helper),
  `computeSize` (margin ts/2, +WIDTH), `setTileSize`, `newDrawState`
  (`Int32Array` flag cache).
- [x] 6.2 `redraw`: first-draw grid-corner dots + background (behind
  `ds.started`); per-tile diffed `drawTile` (four border rects via the
  state→colour map, clue text with `F_ERROR_CLUE` colour); the black/yellow
  border-DSF error computation; the half-grid cursor box.
- [x] 6.3 `flashLength` (0.7s on fresh, non-cheated completion); fold the
  `findMistakes` overlay into the per-tile error bits; tier-2 render-ops test
  (red error rect for an over-large region; cursor box; mistake overlay edge).

## 7. Adapter + register + gate
- [x] 7.1 `worker-adapter` / `describeParams`: `width`/`height`/`region-size`
  (verify against `augmentation.ts` palisade `configFormatter`).
- [x] 7.2 Add `import "./palisade/index.ts"` to `src/native/games/index.ts`;
  add `palisade` to `TS_PORTED_PUZZLE_IDS`.
- [x] 7.3 Midend integration test (`palisade-midend.test.ts`): new-game,
  edge toggle, solve, undo/redo round-trip, serialise/deserialise.
- [x] 7.4 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build` — all green.
- [x] 7.5 `npm run dev` smoke on Palisade (Playwright): board renders with
  clues + status bar ("Region size: N") + TS badge + type summary; left-click
  draws/erases a wall, right-click toggles a no-wall mark, an over-large region
  reddens its walls; keyboard cursor + Enter toggles an edge; Solve fills a
  correct division and flashes; 0 console errors.
- [ ] 7.6 Commit (registered, parity-gated; `palisade.c` kept as fallback).

## 8. Owner acceptance → C deletion (separate step)
- [ ] 8.1 On owner-accepted parity: add `TS_PORTED` for `palisade` in
  `puzzles/CMakeLists.txt`, delete `puzzles/palisade.c`.
- [ ] 8.2 Archive the change.
