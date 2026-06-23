# Proposal: Port Unequal to native TypeScript

**Status**: Proposed

## Why

Unequal is migration-order port #20 — the first of the Latin-square family
(Unequal → Keen → Undead → Solo) we are porting after Towers (decided
2026-06-23). It is a Latin-square puzzle: fill an `o × o` grid so each row and
column contains every number `1..o` exactly once, subject to *adjacency-style*
clues between cells. It has two modes:

- **Unequal** (the default): greater-than signs between some pairs of orthogonally
  adjacent cells (`a > b`).
- **Adjacent**: a bar between two cells means their numbers differ by exactly 1;
  the *absence* of a bar between two cells means they do **not** differ by 1.

`unequal.c` is ~2473 lines and rides on the **shared generic `latin_solver`
framework** (`engine/latin.ts`) we built and battle-tested for Towers — it adds
only its own clue deductions (inequality "links" / adjacency elimination) and a
validator. This is the smallest possible step from Towers: if the shared Latin
framework is going to pay back across the family, Unequal is the cheapest proof.
It inherits the Sudoku-style number-entry UI (digit/pencil entry, mouse +
keyboard cursor, immutable givens) and the **pencil-mark UX** (mark-all button,
sticky pencil mode, the corner indicator, note-mistakes) wholesale from Towers.

It has **no long-tail-risk entanglements**: no `midend_supersede_game_desc` (the
desc is fixed clues + givens and never changes), no undo-by-state-equality
(every move is a definite cell/pencil toggle or a clue "spent" toggle, completion
is locally decidable via `check_complete`), and no `#ifdef EDITOR` input. It
uniquely determines its solution, making it a natural `findMistakes` (Check &
Save) carrier and a strong future `hint()` candidate (a separate change).

## What Changes

- **Reuse `src/native/engine/latin.ts` unchanged.** Unequal is the framework's
  second game consumer (after Towers). It supplies its own `usersolvers` +
  `valid` callback and a thin driver mapping its five difficulty levels onto the
  generic `diff_simple/set_0/set_1/forcing/recursive` parameterisation. No
  framework change is needed — the optional per-recursion ctx clone is a no-op
  for Unequal (its solver context is immutable, derived from the fixed flags).
- **New `src/native/games/unequal/` port** implementing
  `Game<UnequalParams, UnequalState, UnequalMove, UnequalUi, UnequalDrawState,
  UnequalMistake>`:
  - `state.ts` — `{ order, mode, diff }` params (Trivial/Easy/Tricky/Extreme/
    Recursive; mode Unequal/Adjacent), the comma-separated per-cell desc codec
    (number + `URDL` adjacency flags), immutable shared `clueFlags`/`immutable`
    typed arrays + mutable `grid`/`pencil`/`spent` (the struck-clue flags),
    `completed`/`cheated`, `cloneState`, `textFormat`, the `adjthan` direction
    table, and `checkComplete`/error marking.
  - `solver.ts` — Unequal's `usersolver`s (`solverEasy` = links/adjacent by mode,
    `solverSet` = adjacent-set by mode), the `unequalValid` validator, the solver
    context carrying the inequality links, and the
    `solveUnequal(order, mode, flags, soln, maxdiff)` driver mapping
    Trivial→simple, Tricky→set₀, Extreme→set₁+forcing, Recursive→recursion.
  - `generator.ts` — `newUnequalDesc`: `latinGenerate` the solution → assemble
    clues greedily (`gg_best_clue`) until solvable at the target difficulty →
    strip redundant clues → require exact-difficulty (regenerate otherwise);
    Adjacent mode seeds all adjacency flags from the solution. RNG-faithful for a
    byte-match differential.
  - `render.ts` — palette via `mkhighlight` (index-for-index with the C enum),
    the gap-between-cells geometry (`SQUARE_SIZE = TILE + GAP`), greater-than
    polygons (Unequal) / adjacency bars (Adjacent) drawn in the gaps with
    error/spent colouring, pencil-mark grid, cursor + pencil highlight, the
    fork's pencil-mode corner indicator, the Check & Save mistake overlay, and
    the per-tile diff cache.
  - `index.ts` — `Game` glue: `interpretMove` (cell select + pencil highlight,
    digit/backspace entry honouring pencil mode + immutability, clicking a
    gt-sign/adjacency-bar in the gap to toggle its "spent" grey-out,
    shift/ctrl-cursor to toggle a neighbouring clue spent, `M` → mark-all),
    `executeMove`, `status`, `solve` (uses `aux` when present), `findMistakes`,
    the pencil-mark UX (`canMarkAll`, sticky-pencil + keep-highlight prefs),
    `colours`, `registerGame`.
- **`findMistakes` (Check & Save).** Unequal re-solves from its immutable givens
  + clues to the unique solution and flags every player grid cell that
  contradicts it, plus the note-mistake convention (an empty cell whose non-empty
  pencil notes have crossed out its solution value), so the shipped Check & Save
  control hard-blocks a wrong board.
- **Differential.** Unequal earns a gated byte-match differential
  (`unequal-differential.test.ts` vs a frozen C trace) across both modes and each
  difficulty: `random.ts` is bit-identical and the whole generation path (Latin
  square → greedy clue assembly → solver-gated strip) is RNG-faithful, so a
  faithful port reproduces the C desc exactly for the same seed. A live
  `scripts/diff-unequal.test.ts` is **not** committed (the trace binary has fixed
  seeds = the fixture → no signal beyond the gated test; see design).
- **Stage-1 registration only.** Add `unequal` to `ts-ported-ids.ts` and import
  it in `games/index.ts` so the TS impl serves it for owner smoke-testing. The
  `TS_PORTED` flag + `puzzles/unequal.c` deletion happen **only on owner
  acceptance**, per the two-stage parity gate.

## Impact

- **Affected specs:** new `unequal` capability (ADDED requirements: Game
  interface, two-mode desc codec, Latin-square generator, the difficulty-graded
  link/adjacency solver, digit/pencil/clue-spent moves + cursor, gap-clue
  rendering, the pencil-mark UX + preferences, mistake-checking).
- **Affected code:** new `src/native/games/unequal/*`; one line each in
  `ts-ported-ids.ts` and `games/index.ts`; `puzzles/auxiliary/unequal-trace.c`
  + its `cliprogram()` line (deleted with `unequal.c` at acceptance). No change
  to `unequal.c` until owner acceptance (stage 2). No change to
  `engine/latin.ts`.

## Out of scope

- An explained `hint()` is a **separate** change (`add-unequal-hint`), to be done
  in a new session. Unequal's graded deductive solver makes it a strong
  Palisade-quality-bar candidate (narrate *why* each elimination is forced from
  the inequality/adjacency clue), but per the hint-authoring guide that is its
  own parity-gated change.
- Printing (`game_print`) — no TS replacement fork-wide; out of scope for every
  port so far.
- Orders above 9 keep upstream's letter-digit entry (`A`–`Z` for `11`+), but the
  presets and practical play target `o ≤ 7`.
