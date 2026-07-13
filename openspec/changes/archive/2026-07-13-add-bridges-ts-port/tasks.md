## 1. Scaffold + long-tail risk check

- [x] 1.1 Long-tail risk check against `bridges.c`: no supersede, no editor
      letters, no undo-via-state-string, no keypad; `dsf`/`findloop` already
      ported. Byte-match feasible (RNG = `random_upto` only, no `qsort`).
- [x] 1.2 `scripts/new-game-port.sh bridges` (file skeleton).
- [x] 1.3 openspec change `add-bridges-ts-port` (this) + `validate --strict`.

## 2. State + codec (`state.ts`)

- [x] 2.1 Immutable state (`BridgesState` class): grid flags (`G_ISLAND/LINEV/
      LINEH/MARKV/MARKH/NOLINEV/NOLINEH/WARN`), the per-cell line-count +
      possibles + max typed arrays, the island list + adjacency (`surrounds`),
      `gridi` index; clone shares fixed structures, `workingCopy` deep-copies.
      All island/grid/map helpers ported (join, togglemark, countbridges,
      adjspace, countspaces, isadj, countadj, impossible, mapUpdatePossibles,
      mapCount, mapClear, mapFindOrthogonal).
- [x] 2.2 Params: `w,h,maxb,islands,expansion,allowloops,difficulty`;
      encode/decode/validate params; the 9 presets. Tested.
- [x] 2.3 Desc codec: `newStateFromDesc`; `encodeGame`; `validateDesc`;
      `textFormat`. Move + UI + Mistake types. Tested (round-trip + placement +
      orthogonal-neighbour + validate rejections).

## 3. Solver + generator (`solver.ts`, `generator.ts`)

- [x] 3.1 Solver helpers: `mapUpdatePossibles` (in state), `mapGroup`/
      `mapGroupCheck`/`mapGroupFull`, `islandAdjspace`/`countspaces`/`impossible`,
      `solveFill`/`solveFillone`/`solveJoin`, `mapHasloops` (findloop-backed).
- [x] 3.2 Staged deductions: `solveIslandStage1` (Easy), `stage2` (Medium),
      `stage3` + subgroup/checkloop/impossible (Hard). `solveSub` is a monotone
      stage gate — NO guess recursion (C `depth` param is dead). Exact
      impossible/ambiguous/solved verdict per difficulty; dsf save/restore via
      `clone()`. `solveFromScratch` (map_clear) + `solveForHint` (from current).
- [x] 3.3 Generator `newBridgesDesc`: island placement + bridge growing +
      two-roll expansion + retry-to-difficulty. RNG-faithful (byte-match).
- [x] 3.4 C trace harness `puzzles/auxiliary/bridges-trace.c` + `cliprogram`
      line; recorded `__fixtures__/bridges-c-reference.json` (9 presets +
      `allowloops=0` + maxb=4 + non-preset = 12 cases). `bridges-differential.
      test.ts`: `newDesc` byte-match (12/12) + TS-solver-grades-C-boards (12/12).

## 4. Render + index glue (`render.ts`, `index.ts`)

- [x] 4.1 `render.ts`: `computeSize`, palette (index-for-index w/ C enum;
      NARROW_BORDERS geometry), per-tile `Int32Array` cache = the C packed-word
      draw descriptor (islands + intruding bridge-stubs / island-arcs, marks,
      drag-preview, hint-lines, cursor, win flash — all in the diff key).
- [x] 4.2 `index.ts`: `Game` object, `interpretMove` (left/right drag via
      `updateDragDst`/`finishDrag`, cursor cone-search, select, digit-jump,
      'g' hint toggle), `executeMove`, presets, `describeParams`+`paramConfig`,
      `colours`, `setTileSize`, `solve` (game_state_diff), `prefs` (show-hints).
- [x] 4.3 `findMistakes`: re-solve from clues, flag player bridge spans that
      strictly exceed the unique solution; render overlay reuses `COL_WARNING`
      (red), which lives in the diff key so it repaints clean when cleared.
- [x] 4.4 Auto-mark aid (owner request): `auto-mark-complete` pref (default on)
      auto-greys a satisfied island via `DI_BG_MARK` at render time — purely
      visual, no `G_MARK`/lock; manual click-to-mark retained. Tier-2 test asserts
      the pref gates the grey and leaves the island editable.

## 5. Tests

- [x] 5.1 Tier-1: params/desc round-trip + validate rejects; solver solves
      generated boards + grades (via the differential's solver-agreement pass);
      drag→move input model; executeMove; solve; findMistakes.
- [x] 5.2 Tier-2.5: `renderScenario` frame — islands + circles + clue text drawn.
- [x] 5.3 Solve through a real `Midend` (save round-trip; Playwright: Solve →
      full bridge network + completion dialog).

## 6. Register + gate + stage 2

- [x] 6.1 Register (stage 1): `ts-ported-ids.ts` + `games/index.ts` import.
- [x] 6.2 Full gate green (`tsc → biome → vitest (2296) → vite build`).
- [x] 6.3 Dev-verify via Playwright: renders (islands + clues, TS badge), manual
      drag places single/double bridges (known fixture board, positions match
      desc decode), `island_impossible` red warning fires, Solve → full network +
      completion; 0 console errors. (Icon PNGs: capture at stage 2.)
- [x] 6.4 Owner acceptance (2026-07-13) → stage 2: `TS_PORTED` flipped, `bridges.c`
      + `bridges-trace.c` + its cliprogram line deleted, wasm rebuilt (bridges in
      catalog, no wasm), `openspec archive add-bridges-ts-port`.
