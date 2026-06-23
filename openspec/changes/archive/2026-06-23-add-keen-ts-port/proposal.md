# Proposal: Port Keen to native TypeScript

**Status**: Proposed

## Why

Keen (the Times's "KenKen", and Nikoli's near-identical "Inshi No Heya") is
migration-order port #21 — the second Latin-square-family game (Unequal → Keen →
Undead → Solo, decided 2026-06-23), after Unequal landed. It is a Latin-square
puzzle: fill a `w × w` grid so each row and column contains every digit `1..w`
exactly once, subject to **arithmetic cage clues** — the grid is partitioned into
contiguous *blocks* (cages), each labelled with a target value and an operation
(`+`, `−`, `×`, `÷`) that the block's digits must satisfy. Subtraction and
division cages are always dominoes (area 2).

`keen.c` is ~2665 lines and rides on the **shared generic `latin_solver`
framework** (`engine/latin.ts`) already battle-tested for Towers and Unequal — it
adds only its own *cage* deductions (`solver_easy`/`solver_normal`/`solver_hard`,
which iterate each cage's consistent digit layouts and prune the candidate cube)
and a validator. Keen is the second proof that the shared Latin framework pays
back across the family, and the first to exercise it with a **dsf-partitioned
clue structure** rather than per-cell clues. It inherits the Sudoku-style
number-entry UI and the **pencil-mark UX** (mark-all, sticky pencil, the corner
indicator, note-mistakes) wholesale from Towers/Unequal.

It has **no long-tail-risk entanglements**: no `midend_supersede_game_desc` (the
desc is a fixed block structure + cage clues and never changes), no
undo-by-state-equality (every move is a definite cell/pencil toggle, completion
is locally decidable via `check_errors`), and no `#ifdef EDITOR` input. It
uniquely determines its solution, making it a natural `findMistakes` (Check &
Save) carrier and a strong future `hint()` candidate (a separate change).

## What Changes

- **Reuse `src/native/engine/latin.ts` unchanged.** Keen is the framework's
  third game consumer. It supplies its own `usersolvers` + `valid` callback and a
  thin driver mapping its five difficulty levels (Easy/Normal/Hard/Extreme/
  Unreasonable) onto the generic `diff_simple/set_0/set_1/forcing/recursive`
  parameterisation. No framework change is needed — the solver context (the
  immutable cage decomposition) never mutates, so the per-recursion ctx clone is
  a no-op, exactly as Towers/Unequal.
- **New `src/native/games/keen/` port** implementing
  `Game<KeenParams, KeenState, KeenMove, KeenUi, KeenDrawState, KeenMistake>`:
  - `state.ts` — `{ w, diff, multiplicationOnly }` params; the block-structure +
    clue desc codec (`encode/parse_block_structure` run-length edge encoding, plus
    the `a`/`s`/`m`/`d`-tagged clue list); the immutable `KeenClues` (the cage
    `Dsf`, a precomputed minimal-element map, and the packed-`op|value` clue array
    keyed at each cage's minimal cell); mutable `grid`/`pencil`; `completed`/
    `cheated`; `cloneState`; `checkErrors` (cage-value + Latin row/column error
    marking); the move/ui types; the `C_ADD/SUB/MUL/DIV`/`CMASK` clue constants.
  - `solver.ts` — Keen's cage `usersolver`s (`solverEasy`/`solverNormal`/
    `solverHard` via the shared `solverCommon`, iterating each cage's candidate
    digit layouts and pruning the cube — the EASY/NORMAL/HARD `iscratch`
    accumulation variants ported faithfully), the `keenValid` validator
    (transpose-aware cage-value check), and the
    `solveKeen(w, clues, soln, maxdiff)` driver mapping Easy→simple, Hard→set₀,
    Extreme→set₁+forcing, Unreasonable→recursion.
  - `generator.ts` — `newKeenDesc`: `latinGenerate` the solution → partition into
    blocks (random dominoes at prob 3/4, then fold remaining singletons into
    neighbours under `MAXBLK`) → choose a balanced clue type per block
    (good/"bad" candidate buckets, avoiding low-quality clues) → compute clue
    values → require solvable at exactly the target difficulty (regenerate
    otherwise; 3×3 above Normal dialled down, faithful). RNG-faithful for a
    byte-match differential.
  - `render.ts` — palette index-for-index with the C enum (`COL_USER`/
    `COL_HIGHLIGHT`/`COL_PENCIL` derived from the background, as upstream), the
    `BORDER = TILESIZE/2` geometry, the thick cage outlines drawn via
    `GRIDEXTRA`-widened per-cell rectangles + corner juts (the upstream
    `draw_tile` approach, not the print-only polygon tracer), the cage clue text
    in the minimal cell's top-left, digit + auto-sized pencil-mark grids, cursor +
    pencil highlight, the fork's pencil-mode corner indicator, the Check & Save
    mistake overlay, and the per-tile diff cache.
  - `index.ts` — `Game` glue: `interpretMove` (cell select; left = real, right =
    pencil with the Towers sticky-pencil + filled-cell rules; digit/backspace/
    space entry honouring pencil mode + no-op suppression + auto-pencil; `M` →
    mark-all), `executeMove`, `status`, `solve` (uses `aux` when present),
    `findMistakes`, the pencil-mark UX (`canMarkAll`, sticky-pencil + auto-pencil
    + keep-highlight prefs), `describeParams`, `colours`, `registerGame`.
- **`findMistakes` (Check & Save).** Keen re-solves from its (clue-only) block
  structure to the unique solution and flags every player grid cell that
  contradicts it, plus the note-mistake convention (an empty cell whose non-empty
  pencil notes have crossed out its solution value), so the shipped Check & Save
  control hard-blocks a wrong board.
- **Differential.** Keen earns a gated byte-match differential
  (`keen-differential.test.ts` vs a frozen C trace) across each difficulty + the
  multiplication-only flag: `random.ts` is bit-identical and the whole generation
  path (Latin square → block partition → clue assignment → solver-gated
  acceptance) is RNG-faithful, so a faithful port reproduces the C desc exactly
  for the same seed. The TS solver must additionally grade each board at the
  C-recorded difficulty (the solver-gated-generator bar, playbook §4.4). No
  advisory `scripts/diff-keen.test.ts` is committed (fixed seeds = the fixture →
  no signal beyond the gated test).
- **Stage-1 registration only.** Add `keen` to `ts-ported-ids.ts` and import it
  in `games/index.ts` so the TS impl serves it for owner smoke-testing. The
  `TS_PORTED` flag + `puzzles/keen.c` deletion happen **only on owner
  acceptance**, per the two-stage parity gate.

## Impact

- **Affected specs:** new `keen` capability (ADDED requirements: Game interface,
  block-structure + cage-clue desc codec, the Latin-square + cage-partition
  generator, the difficulty-graded cage solver, digit/pencil moves + cursor, cage
  rendering, the pencil-mark UX + preferences, mistake-checking).
- **Affected code:** new `src/native/games/keen/*`; one line each in
  `ts-ported-ids.ts` and `games/index.ts`; `puzzles/auxiliary/keen-trace.c` + its
  `cliprogram()` line (deleted with `keen.c` at acceptance). No change to
  `keen.c` until owner acceptance (stage 2). No change to `engine/latin.ts`.

## Out of scope

- An explained `hint()` is a **separate** change (`add-keen-hint`), to be done in
  a new session. Keen's graded deductive solver makes it a strong Palisade-bar
  candidate (narrate *why* each cage forces an elimination), but per the
  hint-authoring guide that is its own parity-gated change.
- Printing (`game_print`) — no TS replacement fork-wide; out of scope for every
  port so far.
- Grid sizes above 9 are rejected by upstream (`validate_params`: 3..9); the port
  matches.
