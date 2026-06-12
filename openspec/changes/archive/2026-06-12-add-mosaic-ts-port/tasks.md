# Tasks: Port Mosaic to TypeScript

## 1. Promote the shuffle helper
- [x] 1.1 Add `src/native/engine/shuffle.ts` (Fisher-Yates over `RandomState`,
  upstream `misc.c shuffle` semantics) with a small unit test.
- [x] 1.2 Repoint Galaxies' generator to it; galaxies tests stay green.

## 2. State, params, desc codec (`state.ts`)
- [x] 2.1 Types: `MosaicParams`, `MosaicBoard` (shared frozen clue board),
  `MosaicState`, `MosaicMove` (discriminated union), `MosaicUi`; cell-state
  flag constants.
- [x] 2.2 `defaultParams`, `presets` (6 upstream), `encodeParams` (`WxH[h<b>]`),
  `decodeParams` (lenient), `validateParams` (3×3 min, 10000-tile max).
- [x] 2.3 Desc codec: encode (digit clues, letter runs) + `validateDesc` +
  `newState` parse; `cloneState`; `textFormat`.
- [x] 2.4 `updateBoardStateAround` + clue recount; `executeMove`
  (`toggle`/`paint`/`solve`); `status`.
- [x] 2.5 Unit tests for all of the above.

## 3. Solver + generator (`solver.ts`)
- [x] 3.1 `solveCell` (discriminated progress/none/contradiction),
  typed-array scratch.
- [x] 3.2 `solveCheck` (rng-shuffled clue order, `needed` tracking),
  `solveGameActual` (board-side).
- [x] 3.3 Generator: `generateImage`, `populateCell` (edge/corner full rules),
  `startPointCheck` (faithful `(w-1)*(h-1)` quirk), `hideClues` (aggressive
  minimisation), `newDesc`.
- [x] 3.4 `solve` command bitmap encode; `findMistakes` vs deduced solution.
- [x] 3.5 Unit tests: deductions, contradiction, generator validity +
  solvability across sizes/seeds, hide/revert behaviour, findMistakes.

## 4. Input + Game object (`index.ts`)
- [x] 4.1 `newUi`; `interpretMove`: click/right-click toggle with paint-state
  capture, straight-line drag/release painting, margin rejection, post-completion
  freeze, keyboard cursor + select/select2.
- [x] 4.2 `statusbarText`; `solve`; Game object wiring; `registerGame`.
- [x] 4.3 Unit tests: input mapping incl. drag anchor reset and no-op
  suppression.

## 5. Rendering (`render.ts`)
- [x] 5.1 `colours`, `computeSize` (margin ts/2), `newDrawState`
  ((w+1)×(h+1) Int32Array cache), `setTileSize`.
- [x] 5.2 `redraw`: per-cell diffed drawCell (grid lines, cursor edges, clue
  text with state-dependent colour, margin closing lines), flash inversion,
  mistake outline, first-draw background fill behind `ds.started`.
- [x] 5.3 `flashLength` (0.5s, suppressed when cheating); tier-2 render test.

## 6. Adapter + register + gate
- [x] 6.1 `worker-adapter.decodeCustomParams` mosaic branch
  (`width`/`height`/`aggressive-generation` keys, boolean aggressive).
- [x] 6.2 Add `import "./mosaic/index.ts"` to `src/native/games/index.ts`; add
  `mosaic` to `TS_PORTED_PUZZLE_IDS`.
- [x] 6.3 Midend integration test (`mosaic-midend.test.ts`).
- [x] 6.4 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build` — all green.
- [x] 6.5 `npm run dev` smoke on Mosaic (Playwright): board renders with clues
  + status bar + TS badge + `Size: 10x10` type summary; left-click marks,
  right-click blanks, drag paints a row, keyboard cursor + Enter/Space toggle;
  an overcommitted clue reddens; Check & Save refuses with 2 highlighted
  mistakes; 0 console errors.
- [x] 6.6 Commit (registered, parity-gated; `mosaic.c` kept as fallback).

## 7. Owner acceptance → C deletion (separate step)
- [x] 7.1 On owner-accepted parity: add `TS_PORTED` for `mosaic` in
  `puzzles/CMakeLists.txt`, delete `puzzles/mosaic.c`.
- [x] 7.2 Archive the change.
