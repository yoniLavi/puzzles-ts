# Tasks: Port Same Game to TypeScript

> No engine change required: status bar (`wantsStatusbar` + `statusbarText`),
> the `UI_UPDATE` selection path, and `changedState` already exist in the `Game`
> interface and `Midend` (see design D2/D4). This port is game-only.

## 1. State, params, generators, desc codec (`state.ts`)
- [x] 1.1 Types: `SamegameParams` (`w, h, ncols, scoresub, soluble`),
  `SamegameState` (`w, h, ncols, scoresub, tiles, score, complete, impossible`),
  `SamegameMove` (`{ type: "remove"; tiles: number[] }`), `SamegameUi`
  (`selected, nselected, xsel, ysel, displaySel`). `SamegameDrawState` lives in
  `render.ts`; keep exported types aligned.
- [x] 1.2 `defaultParams` (`5×5 c3 s2 soluble`), `presets` (the five upstream
  presets — `5×5c3`, `10×5c3`, `15×10c3`, `15×10c4`, `20×15c4`, all `s2`
  soluble), `encodeParams` (`{w}x{h}c{ncols}s{scoresub}[r]`, the `r` only when
  `full && !soluble`), `decodeParams` (lenient, mirroring `decode_params`),
  `validateParams` (the soluble/random branches: ≥3 colours & area>1 when
  soluble; ≥2 colours & area ≥ 2·ncols when random; ncols ≤ 9; scoresub ∈ {1,2};
  w,h ≥ 1).
- [x] 1.3 `npoints(scoresub, n)` = `max(0, n − scoresub)²`.
- [x] 1.4 `genGrid` — the guaranteed-soluble inverse-move generator, faithful to
  `gen_grid` (seed, insertion-point list build + shuffle-consume, neighbour
  colour exclusion, left/right/up extension with the doubled-up vertical,
  odd-subarea rejection, inverse-move verification + BFS connectivity fill, retry
  on incomplete). Every `random_upto` in C's order (design D6/R1).
- [x] 1.5 `genGridRandom` — the legacy `r` generator (two of each colour, then
  random fill).
- [x] 1.6 `newDesc` (run the chosen generator → comma-separated colour list),
  `validateDesc` (area-many integers, each `0..ncols`, comma-separated),
  `newState` (parse desc → tiles, score 0, flags false).
- [x] 1.7 `snuggle(tiles)` (gravity down + columns-left, design D5) and
  `check(tiles)` (complete = all empty; impossible = no two orthogonally-adjacent
  same-colour tiles) as pure helpers over a mutable grid.
- [x] 1.8 `status` (`complete ? "solved" : "ongoing"` — never `"lost"`, design
  D8). `textFormat` (rows of digits/`a..`, blanks as space — `game_text_format`).
- [x] 1.9 Tier-1 tests: param round-trip + lenient decode + validation
  (both branches); `npoints` formula incl. the clamp; desc round-trip;
  `snuggle` (a column with a hole compacts; an empty column shuffles left);
  `check` (complete on empty grid, impossible on a no-adjacent-pair board).

## 2. Input + move logic + selection (`index.ts`)
- [x] 2.1 `newUi` (empty selection, cursor at 0,0, `displaySel` off),
  `changedState` (clear selection — upstream `sel_clear`).
- [x] 2.2 `selExpand(ui, state, tx, ty)` — flood the connected same-colour region
  into `ui.selected`; collapse to empty if the region size is 1 (a lone tile is
  unremovable). `selClear`. `selMovedesc` → the sorted `remove` move + clear.
- [x] 2.3 `interpretMove`: left/right click → `fromCoord`; cursor-move →
  reposition cursor (`UI_UPDATE`); cursor-select/select2 → act at the cursor.
  Off-grid or empty tile → `null`. On a selected tile: confirm-remove (left /
  `CURSOR_SELECT`) → `remove` move; deselect (right / `CURSOR_SELECT2`) →
  `UI_UPDATE`. On an unselected removable tile: clear + flood-select →
  `UI_UPDATE`.
- [x] 2.4 `executeMove`: validate indices in range, zero them, add
  `npoints`, `snuggle`, `check`; return a new frozen state (pure; does not touch
  the Ui — design D3).
- [x] 2.5 `statusbarText(state, ui)` — the four-case string (design D4).
- [x] 2.6 Tier-1 tests: `interpretMove` two-click select-then-remove yields a
  `remove` move with the right indices; clicking a lone tile selects nothing;
  right-click on a selection deselects; `executeMove` purity + score increment +
  win on clearing the last group; a midend test asserting `statusbarText`
  updates on a selection-only `UI_UPDATE` (design R2).

## 3. Rendering (`render.ts`)
- [x] 3.1 `colours` (background + 9 fixed peg colours `COL_1..COL_9` from the C
  table + `COL_IMPOSSIBLE` black + `COL_SEL` white + highlight/lowlight via the
  shared `mkhighlight`), `PREFERRED_TILE_SIZE = 32`, `computeSize`, `setTileSize`
  (`tilegap = (tilesize+8)/16`, `tileinner = tilesize − tilegap`), `newDrawState`.
- [x] 3.2 `redraw`: one-time recessed-border polygons; per-tile draw with
  right/down/diag joins (a region paints seamlessly), `COL_SEL` outline on
  selected, `COL_IMPOSSIBLE` inner on an impossible board, the `HASSEL` cursor
  inset; flash background alternation. Packed-bits `Int32Array` cache key (design
  D7) — not `BigInt64Array`.
- [x] 3.3 `flashLength` (`2 * FLASH_FRAME` on newly complete-or-impossible),
  `animLength` (0).
- [x] 3.4 Tier-2 render-ops test (recording `GameDrawing` double): two
  same-colour adjacent tiles emit a join fill (no internal gap); a selected tile
  draws a `COL_SEL` outer rect; an impossible board draws `COL_IMPOSSIBLE` inners.

## 4. Wire-up
- [x] 4.1 `registerGame(samegameGame)` in `samegame/index.ts`; import in
  `src/native/games/index.ts`.
- [x] 4.2 Add `"samegame"` to `TS_PORTED_PUZZLE_IDS` (`ts-ported-ids.ts`); the
  ports-match-registry gate stays green.
- [x] 4.3 Add the `samegame` branch to `worker-adapter.ts` `decodeCustomParams`
  (map `ncols` → colours, `scoresub` → the scoring-system config key, `soluble`
  → the ensure-solubility key; confirm the exact kebab keys against the live
  catalog config and verify the top-bar type summary renders).

## 5. Differential check
- [x] 5.1 Transient `puzzles/auxiliary/samegame-trace.c` (`#include
  "../samegame.c"` for the static generators) + its `CMakeLists.txt` line: emit
  (params, seed → desc) records across the presets and both generator paths.
- [x] 5.2 Build it (`cmake -B build/native -S puzzles -DUSE_TS_LEAVES=0`; the C
  `random.c`), freeze `src/native/games/samegame/__fixtures__/
  samegame-c-reference.json` (several presets × seeds, both soluble and `r`).
- [x] 5.3 Gated `samegame-differential.test.ts` (C-free, frozen snapshot): TS
  `newDesc` desc equals C byte-for-byte for every recorded (params, seed); each C
  desc passes `validateDesc`. (No advisory live-diff script — Flood/Guess
  precedent; the gated test compares against the C source byte-for-byte.)

## 6. Verify + gate
- [x] 6.1 **Dev-verified** via Playwright on the TS path (the hybrid catalog
  lists Same Game; the registry serves it). Confirmed live: renders correctly
  (recessed board, seamlessly-joined same-colour regions, TS badge, "5x5, 3
  colours" type summary, "Score: 0" status bar); generation produces fresh valid
  boards; first click flood-selects a connected group with white `COL_SEL`
  borders and the status bar shows `Selected: 3 (1)`; second click removes it →
  `Score: 1`, tiles fall (gravity) and columns compact, Undo enables; the
  keyboard cursor (arrow keys) moves the `HASSEL` inset marker; **0 console
  errors** (only the Lit dev-mode warning). The complete/impossible/win-flash
  states and the `r` variant are covered by the unit + midend + render tests.
  **Owner acceptance still pending** (parity gate → then section 7).
- [x] 6.2 Pre-commit gate green: `tsc -b --noEmit` → `biome lint` →
  `vitest run` → `vite build`.

## 7. On owner acceptance (separate commit, then archive)
- [x] 7.1 Add `TS_PORTED` to the `samegame` `puzzle(...)` block in
  `puzzles/CMakeLists.txt`; remove the `samegame-trace` `CMakeLists.txt` line.
- [x] 7.2 Delete `puzzles/samegame.c` + `puzzles/auxiliary/samegame-trace.c`.
- [x] 7.3 Clean `npm run build:wasm` — catalog still lists Same Game via
  `ts_ported_names`, no `samegame.wasm` artifact.
- [x] 7.4 `openspec validate add-samegame-ts-port --strict`; archive the change.
