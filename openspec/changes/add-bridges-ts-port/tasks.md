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

- [ ] 3.1 Solver helpers: `map_update_possibles`, `map_group`/`map_group_check`/
      `map_group_full`, `island_adjspace`/`countspaces`/`impossible`,
      `solve_fill`/`fillone`/`join`.
- [ ] 3.2 Staged deductions: `solve_island_stage1` (Easy), `stage2` (Medium),
      `stage3` + subgroup/checkloop (Hard); `solve_sub` guess recursion at Hard.
      Exact impossible/ambiguous/solved verdict per difficulty.
- [ ] 3.3 Generator `new_game_desc`: island placement + bridge growing +
      expansion + retry-to-difficulty. RNG-faithful (byte-match).
- [ ] 3.4 C trace harness `puzzles/auxiliary/bridges-trace.c` + `cliprogram`
      line; record `__fixtures__/bridges-c-reference.json` (all 9 presets +
      an `allowloops=0` case). Gated `bridges-differential.test.ts`:
      `newDesc` byte-match + TS-solver-grades-C-boards.

## 4. Render + index glue (`render.ts`, `index.ts`)

- [ ] 4.1 `render.ts`: `computeSize`, palette (index-for-index w/ C enum +
      mistake colour appended), per-tile `Int32Array` cache with every overlay
      in the diff key, islands/bridges/marks/drag-preview/hint-lines/cursor,
      win flash.
- [ ] 4.2 `index.ts`: `Game` object, `interpretMove` (left/right drag,
      `update_drag_dst`/`finish_drag`, cursor, select), `executeMove`, presets,
      `colours`, `setTileSize`, `solve`, `prefs` (show-hints), `findMistakes`.
- [ ] 4.3 `findMistakes`: re-solve from clues, flag contradicted player bridges;
      render overlay in the diff key (§3.2 twice-drawn regression test).

## 5. Tests

- [ ] 5.1 Tier-1: params/desc round-trip + validate rejects; solver solves
      generated boards + grades (Medium fails at Easy); generator produces
      solvable unique boards (seed-deterministic, explicit timeout).
- [ ] 5.2 Tier-2.5: `renderScenario` frames — islands + bridges drawn, a drag
      preview, a mistake overlay repaints on a later frame, `toMatchSnapshot`.
- [ ] 5.3 Solve through a real `Midend` (input → bridges → win flash).

## 6. Register + gate + stage 2

- [ ] 6.1 Register (stage 1): `ts-ported-ids.ts` + `games/index.ts` import.
- [ ] 6.2 Full gate green (`tsc → biome → vitest → vite build`).
- [ ] 6.3 Dev-verify via Playwright (render, drag-to-bridge, marks, cursor,
      Check-&-Save refusal + red, Solve, prefs, win flash; 0 console errors).
      Capture the two icon PNGs.
- [ ] 6.4 Owner acceptance → stage 2 (`TS_PORTED` + delete `bridges.c` + trace
      harness) + `openspec archive add-bridges-ts-port` in one commit.
