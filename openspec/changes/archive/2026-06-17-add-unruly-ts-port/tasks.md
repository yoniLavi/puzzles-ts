# Tasks: Port Unruly to native TypeScript

## 1. Pre-flight
- [x] 1.1 Read `puzzles/unruly.c` against the long-tail-risk checklist
  (no supersede_desc, no state-equality undo, no EDITOR letters — all clear).
- [x] 1.2 Pick Unruly as port #15 (owner-confirmed).

## 2. Shared helper
- [x] 2.1 Add `mkhighlightSpecific(base)` to
  `src/native/engine/colour-mkhighlight.ts` (faithful `game_mkhighlight_specific`:
  extrapolate base within `K` of an extreme; recalc lowlight from original `db`).
- [x] 2.2 Tests for `mkhighlightSpecific` (near-white base shifts; mid-grey base
  is symmetric).

## 3. State + codec (`state.ts`)
- [x] 3.1 Params (`w2`, `h2`, `unique`, `diff`), presets, encode/decode/validate.
- [x] 3.2 Run-length desc codec (`a`+run zero, `A`+run one, `z`/`Z` skip 25) +
  `validateDesc` + `newState` (immutable clue flags).
- [x] 3.3 Three-state grid (`EMPTY`/`ONE`/`ZERO`), `executeMove`, `status`,
  `textFormat`. `completed` recomputed from counts + 3-in-a-row validation.

## 4. Solver (`solver.ts`)
- [x] 4.1 Scratch counts (ones/zeros per row/col) + `validateCounts` /
  `validateRows` (3-in-a-row + unique-match) returning error overlays.
- [x] 4.2 The deductive techniques: check-threes (TRIVIAL), single-gap
  (TRIVIAL), complete-nums (EASY), uniques (EASY, unique mode), near-complete
  (NORMAL); `solveGame(state, diff)` fixpoint returning max difficulty used.

## 5. Generator (`generator.ts`)
- [x] 5.1 `fillGame` (shuffle spaces, place random, solve-forward to a full grid).
- [x] 5.2 `newDesc` (winnow clues keeping solvability at target diff;
  too-easy gate via solve at diff-1; encode run-length).

## 6. Render (`render.ts`)
- [x] 6.1 Palette mirroring the C colour-enum indices (BACKGROUND, GRID, EMPTY,
  COL_0/HL/LL, COL_1/HL/LL, CURSOR, ERROR) via `mkhighlightSpecific`.
- [x] 6.2 `computeSize`, `Int32Array` packed-flag cache, `redraw`: tile fill,
  immutable bevel, 3-in-a-row + count + unique-match errors, cursor, flash.

## 7. Game object (`index.ts`)
- [x] 7.1 `interpretMove` (left cycles empty→1→0→empty, right empty→0→1→empty,
  digit/backspace keys, keyboard cursor → UI_UPDATE, no-op suppression).
- [x] 7.2 `Game` object (`solve`, `flashLength`, `describeParams`, `colours`,
  `computeSize`, `setTileSize`, `redraw`); `registerGame`.
- [x] 7.3 `findMistakes` (re-solve from immutable clues, flag contradicting
  marks) + the mistake-overlay render bit, so Check & Save hard-blocks a wrong
  board. (Added 2026-06-17 after owner smoke-test found Check & Save accepted
  wrong moves; verified in-browser refusing with 2 highlighted mistakes.)

## 8. Tests + differential
- [x] 8.1 Tier-1: params/desc round-trip, solver solves generated boards at each
  diff, generator produces solvable unique boards, executeMove purity, status.
- [x] 8.2 Tier-2: render-ops (error rect on a 3-in-a-row, immutable bevel,
  cursor, flash inversion).
- [x] 8.3 Tier-2.5: `renderScenario` + targeted ops + `toMatchSnapshot`.
- [x] 8.4 Differential: gated frozen-snapshot vs a `__fixtures__` C reference +
  advisory `scripts/diff-unruly.test.ts`.

## 9. Parity gate
- [x] 9.1 Stage 1: add to `ts-ported-ids.ts` + `games/index.ts`; pre-commit gate
  green (`tsc -b --noEmit` → biome → vitest → vite build).
- [~] 9.2 Owner smoke-test in `npm run dev`. Owner confirmed render + mouse play
  + Check & Save refusal (2026-06-17). Remaining for full acceptance: keyboard,
  touch, all presets, solve, completion flash, unique-rows variant.
- [ ] 9.3 Stage 2 (owner acceptance only): add `TS_PORTED` to `puzzles/CMakeLists.txt`,
  delete `puzzles/unruly.c`, rebuild wasm, confirm catalog intact with no
  `unruly.wasm`.

## 10. Validate
- [x] 10.1 `openspec validate add-unruly-ts-port --strict`.
- [ ] 10.2 Archive on owner acceptance (with the C deletion commit).
