# Tasks: Keen TS port

## 1. State, params, codec (`keen/state.ts`)
- [x] 1.1 `KeenParams { w, diff, multiplicationOnly }` (diff Easy/Normal/Hard/
      Extreme/Unreasonable); presets per `keen_presets`; encode `{w}` /
      `{w}d{c}{m?}`; `decodeParams`; `validateParams` (3 ≤ w ≤ 9; diff valid).
- [x] 1.2 Block-structure codec: `encodeBlockStructure` (run-length non-edge
      encoding over the `2w(w−1)` internal grid lines + the compression pass) and
      `parseBlockStructure` (rebuild the cage `Dsf`); the clue-list tail (`a`/`s`/
      `m`/`d` + value); `validateDesc` (block sanity, clue count, SUB/DIV ⇒ area
      2).
- [x] 1.3 `KeenClues { w, dsf, minimal, clues }` (immutable, shared): the cage
      `Dsf`, a precomputed `minimal[]` (minimal element per class — Keen stores
      each clue at its cage's minimal cell), and the packed-`op|value` clue array.
      `buildMinimal(dsf, a)`.
- [x] 1.4 `KeenState` (immutable shared `clues`; mutable `grid`/`pencil`;
      `completed`/`cheated`); `cloneState`; `newState` (parse block structure +
      clues).
- [x] 1.5 `KeenMove` union (`set`/`pencilAll`/`pencilStrike`/`solve`);
      `checkErrors` (cage value via the running fold + Latin row/column dup
      marking, faithful to `check_errors`); `status`; the `C_ADD/SUB/MUL/DIV`/
      `CMASK` constants + `clueOp`/`clueVal` helpers.
- [x] 1.6 `KeenUi` + `newUi` (defaults: sticky pencil on, auto-pencil on,
      keep-highlight off, cursor hidden).

## 2. Keen solver (`keen/solver.ts`)
- [x] 2.1 Build the solver ctx from the dsf: `nboxes`, `boxlist` (transposed cell
      indices grouped by box), `boxes` (box → boxlist range), `clues` (per box),
      `whichbox` (transposed cell → box).
- [x] 2.2 `solverClueCandidate` (EASY: OR all values everywhere; NORMAL:
      per-square value bitmaps; HARD: per-row/column required-digit intersection)
      + `solverCommon` (SUB/DIV domino enumeration; ADD/MUL combination
      enumeration; then the EASY/NORMAL cube-prune vs the HARD cross-box prune,
      including the "revert to easier after one hard hit" early return).
- [x] 2.3 `solverEasy`/`solverNormal`/`solverHard` usersolvers (Easy omitted when
      maxdiff > Easy, faithful); `keenValid` (transpose-aware cage-value check).
- [x] 2.4 `solveKeen(w, clues, soln, maxdiff)` driver wiring Easy→simple,
      Hard→set₀, Extreme→set₁+forcing, Unreasonable→recursion through
      `latinSolver`. Thread `maxdiff` into the ctx (for the Easy-omission hack).

## 3. Generator (`keen/generator.ts`)
- [x] 3.1 Block partition: place dominoes at prob 3/4 by `revorder` preference,
      fold remaining singletons into a neighbour under `MAXBLK`, restart if any
      singleton is stranded — RNG-faithful (`random_upto(rs,4)` etc.).
- [x] 3.2 Clue-type choice: per-block good/bad candidate bitmaps (avoid
      low-quality sums/products/differences/quotients), then the balanced
      round-robin assignment (DIV→SUB→MUL→ADD, prefer good then bad), and clue
      values via the per-op running fold.
- [x] 3.3 `newKeenDesc(p, rng)`: `latinGenerate` → partition → assign → require
      solvable at exactly `diff` (not `diff−1`), regenerate otherwise (3×3 above
      Normal dialled to Normal, faithful); encode desc (block structure + clue
      list) + `aux` (`S`-prefixed solution). Capped regenerate backstop.

## 4. Rendering (`keen/render.ts`)
- [x] 4.1 Palette index-for-index with the C enum (`COL_BACKGROUND`/`COL_GRID`/
      `COL_USER`/`COL_HIGHLIGHT`/`COL_ERROR`/`COL_PENCIL`, the user/highlight/
      pencil shades derived from the background) + the fork pencil-mode-body
      colour.
- [x] 4.2 `computeSize`/`setTileSize`/`PREFERRED_TILE_SIZE`; the `BORDER =
      TILESIZE/2` geometry (`COORD`/`FROMCOORD`); the per-tile diff cache
      (Int32Array key + sidecars for the mistake overlay).
- [x] 4.3 `drawTile` faithful to `draw_tile`: the `GRIDEXTRA`-widened cage
      background (so adjacent same-cage cells merge), the four corner juts, the
      cage clue text (op symbol omitted for area-1 / multiplication-only blocks),
      the centred digit, the auto-sized pencil-mark grid, the cursor + pencil
      highlight, the Check & Save mistake overlay.
- [x] 4.4 `redraw`: first-draw bg + the big containing grid rectangle,
      `checkErrors` error overlay (`DF_ERR_CLUE`/`DF_ERR_LATIN`), the diffed
      repaint, completion flash, the pencil-mode corner indicator.

## 5. Game glue (`keen/index.ts`)
- [x] 5.1 `interpretMove`: cell select (left = real, right = pencil; sticky-pencil
      + filled-cell rules from Towers/Unequal); digit/backspace/space entry
      honouring pencil mode + immutability (none — no givens) + no-op suppression
      + auto-pencil; `M`/`m` → `pencilAll`. (No clue-spent — Keen has no
      strike-clue UI upstream.)
- [x] 5.2 `executeMove` (set/pencilAll/pencilStrike/solve; completion via
      `checkErrors`); `status`; `changedState` (cancel pencil highlight when a
      cell fills).
- [x] 5.3 `solve` (return `aux` when present, else `solveKeen` at max diff);
      `findMistakes` (re-solve from the clue structure, flag contradicting cells +
      note-mistakes; never from notes).
- [x] 5.4 `prefs` hook (sticky-pencil, auto-pencil, keep-highlight) + `canMarkAll`;
      `flashLength`; `animLength = 0`; `colours`/`computeSize`/`setTileSize`/
      `newDrawState`/`redraw` wiring; `describeParams` (`grid-size`/`difficulty`/
      `multiplication-only` keys matching `augmentation.ts`); `registerGame`.

## 6. Tests
- [x] 6.1 Tier-1: params/desc round-trip; generator emits solvable,
      uniquely-determined, exact-difficulty boards (seeded, generous timeout) for
      a couple of sizes/difficulties + multiplication-only; solver grades known
      boards; move transitions; completion + flash; `findMistakes` flags a wrong
      digit + a note-mistake and ignores ordinary notes; Solve through a real
      `Midend` (aux path).
- [x] 6.2 Tier-2.5: `renderScenario` initial frame + a partially-filled board with
      pencil marks; targeted op assertions (cage clue text drawn, cage outline
      grid rects) + `toMatchSnapshot`.
- [x] 6.3 Differential: `puzzles/auxiliary/keen-trace.c` + `cliprogram()` line;
      regenerate `__fixtures__/keen-c-reference.json` pure-C (each difficulty +
      multiplication-only); gated `keen-differential.test.ts` (byte-match + solver
      grading at the C difficulty). No advisory `scripts/diff-keen.test.ts`.

## 7. Registration (stage 1) + close-out
- [x] 7.1 Add `keen` to `TS_PORTED_PUZZLE_IDS` and import in `games/index.ts`.
- [x] 7.2 Icons: N/A — Keen is an existing upstream game; its committed
      `keen-{64,128}d8.png` are already present (asset-integrity test green).
- [x] 7.3 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
      `vite build`); update the playbook with anything this port surfaced.

## 8. Owner acceptance (stage 2) — do NOT do before sign-off
- [x] 8.1 Owner smoke-tests the TS path; address parity gaps.
- [x] 8.2 Add `TS_PORTED` to keen in `puzzles/CMakeLists.txt` (drop the
      `solver(keen latin.c)` line); delete `puzzles/keen.c`,
      `puzzles/auxiliary/keen-trace.c`, and its `cliprogram()` line.
- [x] 8.3 Rebuild wasm; confirm keen still in the catalog with no `keen.wasm`.
- [x] 8.4 Archive the change (`openspec archive add-keen-ts-port --yes`) in the
      same commit as the C deletion.
