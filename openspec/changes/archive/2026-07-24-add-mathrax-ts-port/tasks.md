# Tasks — add-mathrax-ts-port

## 1. Scaffold and survey

- [x] 1.1 `scripts/new-game-port.sh mathrax` to stamp `src/native/games/mathrax/`
      with typed `Game<…>` stubs; read `keen/` and `unequal/` end-to-end first as the
      Latin-family exemplars, plus `galaxies/` for the file-split pattern.
- [x] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters, no print
      promise, not timed. Record it in `design.md` if anything surprises.

## 2. Params, config and the desc codec

- [x] 2.1 `MathraxParams { o, diff, options }`; the `MathraxDiff` union
      (`Easy|Normal|Tricky|Recursive`) and the six `options` clue-type bits
      (`Add|Sub|Mul|Div|Eql|Odd`, all-set = `OPTIONSMASK`).
- [x] 2.2 `encodeParams`/`decodeParams` (design D1): `%d` of `o`; on `full`,
      `d<diffchar>` + clue letters `A S M D E O` **only when `options != OPTIONSMASK``;
      decode restores `OPTIONSMASK` when none named.
- [x] 2.3 `validateParams` in upstream order: `o ≥ 3` → `o ≤ 9` → `diff` known →
      (`full`) at least one clue type enabled.
- [x] 2.4 `paramConfig` (design D1): `Size` string, `Difficulty` choices, six clue
      booleans; keys match the C config slugs; numeric `set` via `parseConfigInt`.
      `describeParams` emits `size` + `difficulty` (0-based level index).
- [x] 2.5 Add the `mathrax` config-summary template to `src/puzzle/augmentation.ts`
      (square + difficulty; the generic `{width,height}` base does not fit) — guarded
      by `augmentation.test.ts` (no literal `{field}`).
- [x] 2.6 Presets — the nine upstream presets (`5×5` Easy/Normal/Tricky, `6×6`
      Easy/Normal/Tricky, `7×7`/`8×8`/`9×9` Normal), all `OPTIONSMASK`; preset names
      `"o×o Difficulty"`.
- [x] 2.7 State: immutable `MathraxState` (`grid` `Uint8Array`, `flags`
      `Uint32Array` with `F_IMMUTABLE`, `marks` `Uint16Array`, `clues`
      `Uint32Array` shared by reference across states — the clues never change,
      §3.1 shared-frozen pattern), `completed`, `cheated`; `newState`, `cloneState`.
- [x] 2.8 Desc codec (design D1): the two run-length parts (grid givens `1..9` +
      `a..z` empty runs; `,`; clues `A<n>/S<n>/M<n>/D<n>/E/O` + `a..z` runs, `S0` =
      equality) as exact inverses. Port `new_game_desc` encode and `load_game` decode
      — byte-match surface.
- [x] 2.9 `validateDesc`: reject overlong grid part, digit `> o`, unknown character,
      clue number `> 99`, unknown clue letter, short (`0 < pos < size`) grid/clue part.

## 3. The solver (over `engine/latin.ts`)

- [x] 3.1 `mathraxOptions(o, clue, oppositeMarks, simple)` (upstream `mathrax_options`):
      the per-clue candidate-digit mask — arithmetic pair enumeration, `E`/`O` fixed
      masks, `=` as `Sub 0`, `simple` short-circuit when the opposite cell is unconfirmed.
- [x] 3.2 The user-solver `mathraxSolverApplyOptions`: sync marks with the latin cube,
      intersect each cell's marks across its four adjacent clues, write eliminations
      back; `IMPOSSIBLE` on a wiped cell; the `Easy` (`simple`) and `Easy|Normal`
      (confirm-single-only) gates; `Tricky` full propagation (design D2).
- [x] 3.3 The thin driver: map `Easy/Normal/Tricky/Recursive` onto `latinSolver`'s
      `cfg` with `usersolvers = {easy, normal, tricky}` and latin recursion for
      `Recursive`; `valid` constant `true`; return the `1/0/2/-1` verdict shape
      (`mathrax_solve`).
- [x] 3.4 Tier-1 tests: a hand-built board solves to the known square; an under-clued
      board reports ambiguous/unfinished; each difficulty reaches the expected verdict.

## 4. The generator (over `engine/latin.ts`)

- [x] 4.1 `mathraxCandidateClue(a1,b1,a2,b2,options)` — the exact clue precedence and
      `a≥b` normalisation (design D3), verbatim.
- [x] 4.2 `newDesc`: `latinGenerate(o, rs)` the solution, compute every interior
      candidate clue, `mathraxStripGridClues` then `mathraxStripMathClues` (each: one
      `shuffle` + keep-while-solvable at `diff`). Port the **ambiguous-counts-as-solved**
      strip quirk and the no-"exactly-diff"-gate behaviour verbatim (design D3, §4.4).
- [x] 4.3 `solve()` re-runs `mathraxSolve(state, Recursive)` and returns a
      `{ kind: "solve", digits }`; no `aux` threading (re-derivable). Error on
      unsolvable.
- [x] 4.4 Tier-1: every preset and a size/difficulty sweep generate a board the fresh
      solver solves at ≤ the target difficulty; the desc round-trips through
      `validateDesc`.

## 5. Input, moves and completion

- [x] 5.1 The `MathraxMove` discriminated union (`set` / `pencil` / `markAll` /
      `solve`) + `MathraxUi` (`hx, hy, cshow, ckey, cpencil, pencilSticky`) — design D4.
- [x] 5.2 `interpretMove` (design D4): left-click ink-select, right-click pencil-select
      (right button load-bearing — do **not** fold onto left), arrow-key cursor
      (`gridCursorMove`), Enter pencil toggle, bare digits `'1'..'9'` place/toggle,
      `'\b'`/space/`'0'` clear. Local no-op suppression (re-enter same digit → `null` /
      `UI_UPDATE`). `fromCoord` with `BORDER = 1`.
- [x] 5.3 `executeMove`: apply `set` (place/clear a mutable cell), `pencil` (toggle a
      mark bit / clear all marks), `markAll`, `solve` (write the solution into mutable
      cells, set `cheated`); set `completed` when the grid is full and error-free.
- [x] 5.4 `M`/`m` handling via `adaptiveMarkAllMove(grid, pencil, o, regionsOf)`
      (`regionsOf` = row + column), not plain fill-only (§3.7, design D5).
- [x] 5.5 Sticky pencil mode (`pencilSticky` `Ui` default true) + the `prefs` hook +
      the pencil mode indicator glyph (§3.7, design D5).
- [x] 5.6 `requestKeys(params) → digitKeys(o)` (design D5, §3.8); pin the `KeyLabel[]`
      tier-1.
- [x] 5.7 `textFormat` returns `undefined` (upstream `game_text_format` is `NULL`);
      `canFormatAsText` static `false`.

## 6. `findMistakes` and live error highlighting

- [x] 6.1 `findMistakes(state)` (design D6): re-solve from immutable clues to the
      unique solution, flag placed digits contradicting it (`kind: "cell"`) and empty
      cells whose notes crossed out the solution value (`kind: "note"`); `[]` when not
      uniquely deducible. Derive the solution from placed values only, never notes.
- [x] 6.2 Port upstream's live immediate-contradiction flags (`FE_COUNT` row/column
      duplicate, `FE_*` clue violations) for during-play red rendering — distinct from
      Check-&-Save (design D6); share the `COL_ERROR`/`COL_ERRORBG` palette.
- [x] 6.3 Paint-twice mistake test (§3.2): paint, `findMistakes`, redraw the *same*
      drawstate, assert the red overlay appears on the second paint and clears on a
      third frame without it.

## 7. Rendering

- [x] 7.1 Palette in C enum order (design D7): `BACKGROUND/HIGHLIGHT/LOWLIGHT/BORDER/
      GUESS/PENCIL/ERROR/ERRORBG`, derived from the app background; no dark-mode
      luminance adjustment (§3.3).
- [x] 7.2 `computeSize`/`setTileSize`: `o*tilesize + 2*BORDER`, `BORDER = 1`
      (`NARROW_BORDERS` arm, design D7).
- [x] 7.3 `redraw`: per-tile `Int32Array` cache (digit + mark bitmask + cursor/pencil/
      flash flags), the four incident clue circles, the pencil-mark mini-grid, the
      minus/times/divide text-fallback glyphs, the error/mistake `OverlaySidecar` in the
      diff key (§3.2). Completion flash over `FLASH_TIME = 0.7 s` (`(x+y) % 3` wave); no
      slide animation.
- [x] 7.4 Tier-2.5 render-scenario tests + snapshots: a selected cell, a pencil-mark
      cell, a clued frame, a mistake-overlay frame, and a completion-flash frame.

## 8. Differential

- [x] 8.1 `puzzles/auxiliary/mathrax-trace.c` (`#include "../unreleased/mathrax.c"`);
      add its `cliprogram(mathrax-trace mathrax-trace.c)` line. Build pure-C
      (`-DUSE_TS_RANDOM=0`, §4.2).
- [x] 8.2 Fixture matrix: the nine presets plus a size (3..9) / difficulty / restricted-
      `options` sweep, each seed dumping the desc (+ recorded difficulty).
- [x] 8.3 `mathrax-differential.test.ts` via `describeDescDifferential`: TS `newDesc`
      reproduces the C desc byte-for-byte, with a follow-on `validateDesc` check
      (design D8).

## 9. Registration and stage-1 close-out

- [x] 9.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzles/unreleased/mathrax.c` stays — stage-2 gate; the C/WASM fallback remains.
- [x] 9.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`).
- [x] 9.3 `openspec validate add-mathrax-ts-port --strict`.
- [x] 9.4 Dev-verify in the browser: select / digit entry / pencil marks / mark-all /
      keypad on touch, Solve, completion flash, live error highlighting, Check & Save
      hard-block on a wrong board, Custom params (size / difficulty / clue subsets).
- [x] 9.5 Update `docs/porting/game-port-playbook.md` if the port surfaced anything new
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

## Implementation notes (deltas from the plan above)

- **2.5 was already satisfied** — `src/puzzle/augmentation.ts` already carried a
  `mathrax` `describeConfig` (it was written for the C/WASM build). `describeParams`
  emits exactly the keys it reads (`size`, `difficulty`, `<type>-clues`), pinned by a
  test.
- **5.1 diverges from design D4** — the move union uses the Latin family's
  `type: "set" | "pencilAll" | "pencilStrike" | "solve"` names, because the shared
  `adaptiveMarkAllMove` helper constructs them (design F1).
- **5.5 ships sticky pencil + the mode indicator**, the latter in a new half-tile
  strip below the board (there is no border to put it in under `NARROW_BORDERS` —
  design F8).
- **8.x came out green first run at 28/28**, and then surfaced a real upstream defect
  in the `Recursive` tier which the port now fixes with owner approval; the tier keeps
  a weaker solver-verdict check instead of a byte-match (design F7).
- **3.2's `Easy`/`Normal` gates and 4.2's strip loops** are one shared body
  (`applyOptions`) wired at three rungs, exactly as upstream's three one-line
  `usersolver` wrappers.

## Dev-verification record (task 9.4, Playwright on port 5183)

Verified on the TS path (TS badge shown), 0 console errors (only Lit's standard
dev-mode warning):

- **Renders** — clue circles straddling the interior intersections with correct
  glyphs (`=`, `2-`, `4x`, `1-`, `9+`, `12x`), givens in black, board on its
  black backing rectangle.
- **Digit entry** (mouse-select then keypress) and the **live duplicate error** —
  two `3`s in one row both red (`FE_COUNT` -> `COL_ERROR`).
- **Pencil mode** — right-click toggles it, marks draw teal in the auto-sized
  grid, the cell shows upstream's top-left mode triangle, and the fork
  pencil-mode indicator (yellow pencil) appears in the strip below the board.
- **Check & Save** — refused with "1 mistake found" and a red inset outline on
  the offending cell. Note it flagged **one** of the two red `3`s: the live check
  reds both duplicates, `findMistakes` flags only the one contradicting the
  unique solution. Both behaviours are correct and visibly distinct.
- **Mark-all** — first press fills every empty cell 1..o; second press performs
  the adaptive cleanup (row 0 lost `3`, column 3 lost the given `4`).
- **Solve** — fills the solution green, keeps givens black, clears notes, shows
  "What's next?" (solved-with-help) with **no** win flash.
- **Custom dialog** — Size, Difficulty (4 choices) and all six clue checkboxes
  render and apply; 7x7 regenerated and the keypad grew to 1..7.
- **Restricted clue types end-to-end** — game ID `6dtAM#verify1` produced a board
  whose every clue is an addition clue, with the header reading
  "6x6 Tricky, only addition/multiplication" (no literal `{field}`).
- **Keyboard** — arrow cursor moves and renders its highlight; a digit typed on a
  given is correctly ignored.
