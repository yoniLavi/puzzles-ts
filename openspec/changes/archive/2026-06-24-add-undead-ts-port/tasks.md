# Tasks: Undead TS port

## 1. State, params, codec (`undead/state.ts`)
- [x] 1.1 `UndeadParams { w, h, diff }` (Easy/Normal/Tricky); presets per
      `undead_presets`; encode `{w}x{h}` / `{w}x{h}d{c}`; `decodeParams`;
      `validateParams` (w,h ≥ 3; w·h ≤ 54; known diff).
- [x] 1.2 Desc codec: `encode` (totals + run-length grid + sightings) is generator-
      side; `newState`/decode (totals, run-length grid → `grid`/`xinfo`/`fixed`,
      sightings into border), `validateDesc` (counts, grid area, monster total,
      sighting count, no trailing).
- [x] 1.3 Immutable `UndeadCommon` (params, wh, per-type totals, `grid`/`xinfo`
      `Int32Array`, `fixed` `Uint8Array`, `paths`); `range2grid`/`grid2range`/
      `num2grid`/`isClue`/`clueIndex`; `makePaths` + the stable path sort.
- [x] 1.4 `UndeadState` (shared `common`; `guess`/`pencils` `Uint8Array`;
      `cellErrors`/`hintErrors`/`countErrors`/`hintsDone`; `solved`/`cheated`);
      `cloneState`; `newState` from desc.
- [x] 1.5 `UndeadMove` union (`set`/`clear`/`pencil`/`markAll`/`hintDone`/`solve`);
      `UndeadUi` + `newUi` (hx/hy/hshow/hpencil/hcursor; ascii; pencilSticky on;
      pencilKeepHighlight off; countStyle total).
- [x] 1.6 Live error computation: `checkNumbersDraw` + `checkPathSolution`
      (recompute `countErrors`/`cellErrors`/`hintErrors` from a guess), used by
      `executeMove`.

## 2. Solver (`undead/solver.ts`)
- [x] 2.1 `nextList(guess, possible, pos)` odometer ported branch-for-branch (D2).
- [x] 2.2 `checkNumbers` (totals not exceeded), `checkSolution` (both sightings
      match for a full guess).
- [x] 2.3 `solveIterative` (per-path candidate intersection; returns solved) and
      the fixpoint driver; `solveBruteforce` (whole-grid unique-solution search).
- [x] 2.4 `solveUndead(common, fixedGuess, maxdiff)` grading driver (iterative
      depth + ambiguity + brute-force) returning `{ solved, guess, depth,
      ambiguous, iterativeSolved, inconsistent, unique }`; `findUndeadSolution`
      (the full unique solution for `solve`/`findMistakes`).

## 3. Generator (`undead/generator.ts`)
- [x] 3.1 `newUndeadDesc(p, rng)`: random mirror/empty/monster fill
      (`random_upto(rs,5)`), the `num_total ≤ 4` / ratio 0.48–0.78 / max-path-length
      gates; `makePaths`; stable sort.
- [x] 3.2 `getUnique` (enumerate path views via `nextList`, keep views achieved by
      exactly one assignment, pick one at random) up to the per-difficulty
      `filling` threshold; random fill of remaining `7`s; trivial-puzzle discards.
- [x] 3.3 Sighting computation; iterative+bruteforce grade to *exactly* the target
      difficulty (retry otherwise); encode desc + `aux` (`S`-placements). Capped
      regenerate backstop.

## 4. Rendering (`undead/render.ts`)
- [x] 4.1 Palette index-for-index with the C enum (`COL_BACKGROUND`/`COL_GRID`/
      `COL_TEXT`/`COL_ERROR`/`COL_HIGHLIGHT`/`COL_FLASH`/`COL_GHOST`/`COL_ZOMBIE`/
      `COL_VAMPIRE`/`COL_DONE`) + the appended pencil-mode body colour.
- [x] 4.2 `PREFERRED_TILE_SIZE`/`computeSize`/`setTileSize`; `calculateCountLayout`;
      the per-interior-cell `Int32Array` cache + error/mistake sidecars.
- [x] 4.3 `drawMonster` (ghost/vampire/zombie shapes), `drawMirror`,
      `drawBigMonster` (+ ascii), `drawPencils`, `drawCellBackground` (highlight +
      pencil triangle).
- [x] 4.4 `drawMonsterCount` (+ layout, count styles, error/done colours),
      `drawPathHint` (strike-through done, error red).
- [x] 4.5 `redraw`: first-draw bg + grid frame, count row (recompute layout on
      style change), edge hints, diffed grid cells, the live error overlay, the
      mistake overlay, completion flash, the pencil-mode indicator.

## 5. Game glue (`undead/index.ts`)
- [x] 5.1 `interpretMove`: highlight cursor + select; left = real select, right =
      pencil (sticky-pencil + filled-cell rules); `G`/`V`/`Z`/`1`/`2`/`3` set,
      `E`/`backspace`/`0` clear, honouring pencil mode + `fixed` cells + no-op
      suppression; `M`/`m` → markAll; clue click → `hintDone`; `a` → ascii toggle;
      `c`/right-click on count row → count-style cycle; count-block click →
      place/remove.
- [x] 5.2 `executeMove` (apply move; recompute live error overlays; completion
      sweep → `solved`); `status`; `changedState` (cancel pencil highlight when a
      cell fills).
- [x] 5.3 `solve` (return `aux` when present, else `findUndeadSolution`; report
      unsolvable/inconsistent faithfully); `findMistakes` (re-solve, flag
      contradicting placed cells + note-mistakes; never from notes).
- [x] 5.4 `prefs` hook (pencil-keep-highlight, monsters, count-style) + sticky-pencil
      pref + `canMarkAll`; `flashLength` (solve only, not cheat); `animLength = 0`;
      `colours`/`computeSize`/`setTileSize`/`newDrawState`/`redraw` wiring;
      `describeParams` (`width`/`height`/`difficulty` keys matching
      `augmentation.ts`); `registerGame`.

## 6. Tests
- [x] 6.1 Tier-1: params/desc round-trip + `validateDesc` rejects; generator emits
      solvable, uniquely-determined boards at the target difficulty (seeded,
      generous timeout) for a couple of sizes/difficulties; solver solves known
      boards; move transitions (set/clear/pencil/markAll/clue-done); live error
      overlays (over-count reddens; impossible sightline reddens); completion +
      flash; `findMistakes` flags a wrong monster + a note-mistake and ignores
      ordinary notes; Solve through a real `Midend` (aux path).
- [x] 6.2 Tier-2.5: `renderScenario` initial frame + a partially-filled board with
      pencils + a mirror; targeted op assertions (count blocks, an edge hint, a
      mirror line, a monster) + `toMatchSnapshot`.
- [x] 6.3 Differential: `puzzles/auxiliary/undead-trace.c` + `cliprogram()` line;
      regenerate `__fixtures__/undead-c-reference.json` pure-C (each difficulty,
      a couple of sizes) recording desc + the order-independent verdicts (unique,
      iterative-solved, ambiguous count); gated `undead-differential.test.ts`
      (solver-agreement per D1). No advisory `scripts/diff-undead.test.ts`.

## 7. Registration (stage 1) + close-out
- [x] 7.1 Add `undead` to `TS_PORTED_PUZZLE_IDS` and import in `games/index.ts`.
- [x] 7.2 Icons: N/A — Undead is an existing upstream game; its committed
      `undead-{64,128}d8.png` are already present (asset-integrity test green).
- [x] 7.3 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
      `vite build`); update the playbook with anything this port surfaced.
- [x] 7.4 Dev smoke-test the TS path (`npm run dev` / Playwright): play, pencil,
      mark-all, count-style cycle, ascii toggle, clue strike, Check & Save.

## 8. Owner acceptance (stage 2) — do NOT do before sign-off
- [ ] 8.1 Owner smoke-tests the TS path; address parity gaps.
- [ ] 8.2 Add `TS_PORTED` to undead in `puzzles/CMakeLists.txt`; delete
      `puzzles/undead.c`, `puzzles/auxiliary/undead-trace.c`, and its
      `cliprogram()` line.
- [ ] 8.3 Rebuild wasm; confirm undead still in the catalog with no `undead.wasm`.
- [ ] 8.4 Archive the change (`openspec archive add-undead-ts-port --yes`) in the
      same commit as the C deletion.
