# Tasks: Filling (Fillomino) TS port

## 1. State, params, codec
- [x] 1.1 `FillingParams { w, h }`; presets 9×7, 13×9 (default), 17×13; encode
      `WxH`; `validateParams` (w≥1, h≥1, w·h not unreasonably large).
- [x] 1.2 Run-length desc codec: `validateDesc` (area == w·h, valid chars),
      `newState` (decode clues, board = clues copy), `encodeRun`.
- [x] 1.3 `FillingState` (immutable `clues` shared, mutable `board`,
      `completed`/`cheated`); `cloneState`; completion check (region DSF).
- [x] 1.4 `FillingMove` union + `executeMove` (set cells / solve) + completion.
- [x] 1.5 `textFormat` (the ASCII grid).

## 2. Solver
- [x] 2.1 `FillingSolver`: working board, region `Dsf` + cyclic `connected`
      list, `nempty`, `filledSquare`/`mergeCC`, `expand`, `expandsize`,
      `checkCapacity` (explicit visited).
- [x] 2.2 `learnBlockedExpansion`.
- [x] 2.3 `learnExpandOrOne`.
- [x] 2.4 `learnCriticalSquare` — incl. the upstream i-quirk (skip when only the
      canonical cell is in range) and the grow-during-pass `connected` walk.
- [x] 2.5 `learnBitmapDeductions` (per-cell number bitmap incl. ghost regions).
- [x] 2.6 `solveFilling(board) → { solved, board }`; fixpoint driver.

## 3. Generator
- [x] 3.1 `makeBoard` — byte-faithful shuffled DSF partition + conflict merge
      (`randomUpto(rs,10)` gate, per-cell `shuffle(directions,4)`) + `mergeOnes`
      (incl. the C loop-increment `board[i]=1` reset after the final fall-through).
- [x] 3.2 `minimizeClueSet` — whole-region then per-cell removal, solver-gated.
- [x] 3.3 `newDesc` — no `aux` (upstream `new_game_desc` sets none; Solve
      re-derives via the solver, faithful to C).

## 4. Render
- [x] 4.1 Palette mirroring the C enum; `computeSize`; `setTileSize`.
- [x] 4.2 Region-border computation + per-cell flag packing + `Int32Array` cache.
- [x] 4.3 `redraw`: `!started` grid frame, background/correct/error/highlight,
      digits (clue vs user colour), borders, cursor, completion flash.
- [x] 4.4 `findMistakes` overlay (inset error outline via a packed cache bit).

## 5. Game glue
- [x] 5.1 `interpretMove` (selection + cursor + digit fill, faithful to C).
- [x] 5.2 `changedState` (clear selection/keydragging).
- [x] 5.3 `solve` (re-derive via solver), `findMistakes`, `status`,
      `flashLength`, `colours`, the `Game` object + `registerGame`.

## 6. Tests
- [x] 6.1 Tier-1: params/desc round-trip; generator produces solvable, uniquely
      deducible boards at each preset; solver solves them; completion detection;
      move + selection logic; `findMistakes` flags a wrong fill and clears.
- [x] 6.2 Tier-2.5: `renderScenario` initial frame + completed/overfull frames
      — targeted op asserts + `toMatchSnapshot`.
- [x] 6.3 Differential: `puzzles/auxiliary/filling-trace.c` + `cliprogram` line;
      frozen `__fixtures__/filling-c-reference.json`; gated byte-match
      (`describeDescDifferential`, 12 fixtures) + TS-solver-agreement `extra`. No
      advisory `scripts/diff-*.test.ts` (deleted-with-`.c` lifecycle; the gated
      frozen fixture is the durable form).

## 7. Registration + gate (stage 1)
- [x] 7.1 Import `./filling/index.ts` in `games/index.ts`; add `"filling"` to
      `TS_PORTED_PUZZLE_IDS`.
- [x] 7.2 Pre-commit gate green (`tsc -b --noEmit` → biome → vitest 1320 →
      vite build).
- [x] 7.3 Owner smoke-test in `npm run dev` (keyboard + mouse + touch; dark mode;
      Check & Save; Solve; completion flash). Accepted 2026-06-19 alongside the
      explained hint (`add-filling-hint`): "Fabulous work".

## 8. Acceptance (stage 2 — only on owner sign-off)
- [x] 8.1 Add `TS_PORTED` to `filling`'s `puzzle()` in `puzzles/CMakeLists.txt`
      (and remove the `solver(filling)` line — no `.c` to build it from).
- [x] 8.2 Delete `puzzles/filling.c`, `puzzles/auxiliary/filling-trace.c` (+ its
      `cliprogram` line) in one commit (no advisory `scripts/diff-filling.test.ts`
      was added). Clean `build:wasm` re-verified: C build healthy, `filling`
      still in `catalog.json`/`puzzleIds` via `ts_ported_names`, no `filling.wasm`.
- [x] 8.3 Capture the two icon PNGs via `?screenshot` (already committed
      `src/assets/icons/filling-{64,128}d8.png`).
- [x] 8.4 `openspec archive add-filling-ts-port --yes` in the same commit.
