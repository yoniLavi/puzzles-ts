# Tasks — add-mathrax-ts-port

## 1. Scaffold and survey

- [ ] 1.1 `scripts/new-game-port.sh mathrax` to stamp `src/native/games/mathrax/`
      with typed `Game<…>` stubs; read `keen/` and `unequal/` end-to-end first as the
      Latin-family exemplars, plus `galaxies/` for the file-split pattern.
- [ ] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters, no print
      promise, not timed. Record it in `design.md` if anything surprises.

## 2. Params, config and the desc codec

- [ ] 2.1 `MathraxParams { o, diff, options }`; the `MathraxDiff` union
      (`Easy|Normal|Tricky|Recursive`) and the six `options` clue-type bits
      (`Add|Sub|Mul|Div|Eql|Odd`, all-set = `OPTIONSMASK`).
- [ ] 2.2 `encodeParams`/`decodeParams` (design D1): `%d` of `o`; on `full`,
      `d<diffchar>` + clue letters `A S M D E O` **only when `options != OPTIONSMASK``;
      decode restores `OPTIONSMASK` when none named.
- [ ] 2.3 `validateParams` in upstream order: `o ≥ 3` → `o ≤ 9` → `diff` known →
      (`full`) at least one clue type enabled.
- [ ] 2.4 `paramConfig` (design D1): `Size` string, `Difficulty` choices, six clue
      booleans; keys match the C config slugs; numeric `set` via `parseConfigInt`.
      `describeParams` emits `size` + `difficulty` (0-based level index).
- [ ] 2.5 Add the `mathrax` config-summary template to `src/puzzle/augmentation.ts`
      (square + difficulty; the generic `{width,height}` base does not fit) — guarded
      by `augmentation.test.ts` (no literal `{field}`).
- [ ] 2.6 Presets — the nine upstream presets (`5×5` Easy/Normal/Tricky, `6×6`
      Easy/Normal/Tricky, `7×7`/`8×8`/`9×9` Normal), all `OPTIONSMASK`; preset names
      `"o×o Difficulty"`.
- [ ] 2.7 State: immutable `MathraxState` (`grid` `Uint8Array`, `flags`
      `Uint32Array` with `F_IMMUTABLE`, `marks` `Uint16Array`, `clues`
      `Uint32Array` shared by reference across states — the clues never change,
      §3.1 shared-frozen pattern), `completed`, `cheated`; `newState`, `cloneState`.
- [ ] 2.8 Desc codec (design D1): the two run-length parts (grid givens `1..9` +
      `a..z` empty runs; `,`; clues `A<n>/S<n>/M<n>/D<n>/E/O` + `a..z` runs, `S0` =
      equality) as exact inverses. Port `new_game_desc` encode and `load_game` decode
      — byte-match surface.
- [ ] 2.9 `validateDesc`: reject overlong grid part, digit `> o`, unknown character,
      clue number `> 99`, unknown clue letter, short (`0 < pos < size`) grid/clue part.

## 3. The solver (over `engine/latin.ts`)

- [ ] 3.1 `mathraxOptions(o, clue, oppositeMarks, simple)` (upstream `mathrax_options`):
      the per-clue candidate-digit mask — arithmetic pair enumeration, `E`/`O` fixed
      masks, `=` as `Sub 0`, `simple` short-circuit when the opposite cell is unconfirmed.
- [ ] 3.2 The user-solver `mathraxSolverApplyOptions`: sync marks with the latin cube,
      intersect each cell's marks across its four adjacent clues, write eliminations
      back; `IMPOSSIBLE` on a wiped cell; the `Easy` (`simple`) and `Easy|Normal`
      (confirm-single-only) gates; `Tricky` full propagation (design D2).
- [ ] 3.3 The thin driver: map `Easy/Normal/Tricky/Recursive` onto `latinSolver`'s
      `cfg` with `usersolvers = {easy, normal, tricky}` and latin recursion for
      `Recursive`; `valid` constant `true`; return the `1/0/2/-1` verdict shape
      (`mathrax_solve`).
- [ ] 3.4 Tier-1 tests: a hand-built board solves to the known square; an under-clued
      board reports ambiguous/unfinished; each difficulty reaches the expected verdict.

## 4. The generator (over `engine/latin.ts`)

- [ ] 4.1 `mathraxCandidateClue(a1,b1,a2,b2,options)` — the exact clue precedence and
      `a≥b` normalisation (design D3), verbatim.
- [ ] 4.2 `newDesc`: `latinGenerate(o, rs)` the solution, compute every interior
      candidate clue, `mathraxStripGridClues` then `mathraxStripMathClues` (each: one
      `shuffle` + keep-while-solvable at `diff`). Port the **ambiguous-counts-as-solved**
      strip quirk and the no-"exactly-diff"-gate behaviour verbatim (design D3, §4.4).
- [ ] 4.3 `solve()` re-runs `mathraxSolve(state, Recursive)` and returns a
      `{ kind: "solve", digits }`; no `aux` threading (re-derivable). Error on
      unsolvable.
- [ ] 4.4 Tier-1: every preset and a size/difficulty sweep generate a board the fresh
      solver solves at ≤ the target difficulty; the desc round-trips through
      `validateDesc`.

## 5. Input, moves and completion

- [ ] 5.1 The `MathraxMove` discriminated union (`set` / `pencil` / `markAll` /
      `solve`) + `MathraxUi` (`hx, hy, cshow, ckey, cpencil, pencilSticky`) — design D4.
- [ ] 5.2 `interpretMove` (design D4): left-click ink-select, right-click pencil-select
      (right button load-bearing — do **not** fold onto left), arrow-key cursor
      (`gridCursorMove`), Enter pencil toggle, bare digits `'1'..'9'` place/toggle,
      `'\b'`/space/`'0'` clear. Local no-op suppression (re-enter same digit → `null` /
      `UI_UPDATE`). `fromCoord` with `BORDER = 1`.
- [ ] 5.3 `executeMove`: apply `set` (place/clear a mutable cell), `pencil` (toggle a
      mark bit / clear all marks), `markAll`, `solve` (write the solution into mutable
      cells, set `cheated`); set `completed` when the grid is full and error-free.
- [ ] 5.4 `M`/`m` handling via `adaptiveMarkAllMove(grid, pencil, o, regionsOf)`
      (`regionsOf` = row + column), not plain fill-only (§3.7, design D5).
- [ ] 5.5 Sticky pencil mode (`pencilSticky` `Ui` default true) + the `prefs` hook +
      the pencil mode indicator glyph (§3.7, design D5).
- [ ] 5.6 `requestKeys(params) → digitKeys(o)` (design D5, §3.8); pin the `KeyLabel[]`
      tier-1.
- [ ] 5.7 `textFormat` returns `undefined` (upstream `game_text_format` is `NULL`);
      `canFormatAsText` static `false`.

## 6. `findMistakes` and live error highlighting

- [ ] 6.1 `findMistakes(state)` (design D6): re-solve from immutable clues to the
      unique solution, flag placed digits contradicting it (`kind: "cell"`) and empty
      cells whose notes crossed out the solution value (`kind: "note"`); `[]` when not
      uniquely deducible. Derive the solution from placed values only, never notes.
- [ ] 6.2 Port upstream's live immediate-contradiction flags (`FE_COUNT` row/column
      duplicate, `FE_*` clue violations) for during-play red rendering — distinct from
      Check-&-Save (design D6); share the `COL_ERROR`/`COL_ERRORBG` palette.
- [ ] 6.3 Paint-twice mistake test (§3.2): paint, `findMistakes`, redraw the *same*
      drawstate, assert the red overlay appears on the second paint and clears on a
      third frame without it.

## 7. Rendering

- [ ] 7.1 Palette in C enum order (design D7): `BACKGROUND/HIGHLIGHT/LOWLIGHT/BORDER/
      GUESS/PENCIL/ERROR/ERRORBG`, derived from the app background; no dark-mode
      luminance adjustment (§3.3).
- [ ] 7.2 `computeSize`/`setTileSize`: `o*tilesize + 2*BORDER`, `BORDER = 1`
      (`NARROW_BORDERS` arm, design D7).
- [ ] 7.3 `redraw`: per-tile `Int32Array` cache (digit + mark bitmask + cursor/pencil/
      flash flags), the four incident clue circles, the pencil-mark mini-grid, the
      minus/times/divide text-fallback glyphs, the error/mistake `OverlaySidecar` in the
      diff key (§3.2). Completion flash over `FLASH_TIME = 0.7 s` (`(x+y) % 3` wave); no
      slide animation.
- [ ] 7.4 Tier-2.5 render-scenario tests + snapshots: a selected cell, a pencil-mark
      cell, a clued frame, a mistake-overlay frame, and a completion-flash frame.

## 8. Differential

- [ ] 8.1 `puzzles/auxiliary/mathrax-trace.c` (`#include "../unreleased/mathrax.c"`);
      add its `cliprogram(mathrax-trace mathrax-trace.c)` line. Build pure-C
      (`-DUSE_TS_RANDOM=0`, §4.2).
- [ ] 8.2 Fixture matrix: the nine presets plus a size (3..9) / difficulty / restricted-
      `options` sweep, each seed dumping the desc (+ recorded difficulty).
- [ ] 8.3 `mathrax-differential.test.ts` via `describeDescDifferential`: TS `newDesc`
      reproduces the C desc byte-for-byte, with a follow-on `validateDesc` check
      (design D8).

## 9. Registration and stage-1 close-out

- [ ] 9.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzles/unreleased/mathrax.c` stays — stage-2 gate; the C/WASM fallback remains.
- [ ] 9.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`).
- [ ] 9.3 `openspec validate add-mathrax-ts-port --strict`.
- [ ] 9.4 Dev-verify in the browser: select / digit entry / pencil marks / mark-all /
      keypad on touch, Solve, completion flash, live error highlighting, Check & Save
      hard-block on a wrong board, Custom params (size / difficulty / clue subsets).
- [ ] 9.5 Update `docs/porting/game-port-playbook.md` if the port surfaced anything new
      (Latin-family clue-consistency solver, notes-as-mistakes for an intersection-clue
      game).

## Stage 2 — on owner acceptance only (design D9)

- [ ] S2.1 Add `TS_PORTED` to `puzzle(mathrax …)` in
      `puzzles/unreleased/CMakeLists.txt` (the entry stays under `unreleased`).
- [ ] S2.2 Delete `puzzles/unreleased/mathrax.c` and `puzzles/auxiliary/mathrax-trace.c`
      (and any advisory `scripts/diff-mathrax.test.ts`).
- [ ] S2.3 `rm -rf build/wasm/` and rebuild — Mathrax TS-served, no `mathrax.wasm`.
      Icons already exist.
- [ ] S2.4 Archive, then commit port + archive together.
