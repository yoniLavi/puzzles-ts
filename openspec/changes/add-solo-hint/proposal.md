# Proposal: Add an explained deduction hint to Solo

**Status**: Proposed

## Why

The Solo TS port (`add-solo-ts-port`, archived 2026-06-27) deferred `hint()`,
exactly as every Latin-family port before it (Towers/Unequal/Keen). Solo's
signature reasoning is the same **candidate-elimination** shape — the deductive
techniques (`solver_place`/`solver_elim`/`solver_intersect`/`solver_set`/
`solver_forcing`, plus the four killer-cage deductions) each *narrow a cell's set
of possible digits* rather than directly forcing one — so the hint is the
established pattern re-applied.

The one genuinely different thing about Solo: **it is not an `engine/latin.ts`
consumer.** Towers, Unequal and Keen got recording "for free" because the generic
`LatinSolver`'s candidate cube and its `place`/`elim`/`set`/`forcing` layers
already record with reasons. Solo has its **own** bespoke solver (`solver.ts`'s
`SolverUsage` class, ported faithfully from `solo.c`), so the recording machinery
the hint narrates has to be added **to Solo's own techniques** — the new work this
change carries that Keen's did not. Solo also reasons over **four** region types
(row, column, sub-block — rectangular *or* jigsaw — and, for X boards, the two
diagonals) plus **killer cages**, and it has **givens**, so the narration and the
basic-opening handling are richer than Keen's.

The fork already treats pencil notes as first-class markings for Solo — the base
port shipped `findMistakes` flagging a note set that excludes the solution digit
(`kind: "note"`), the `pencilStrike` move, the `pencilAll` fill-all, and the
auto-pencil / sticky / keep-highlight UX. So this change adds only the explained
hint on top: a recording mode in Solo's solver, the `hint()` family in `index.ts`,
and the hint rendering.

## What Changes

- **`solver.ts` gains a hint-only recording mode** threaded through `SolverUsage`'s
  technique methods. Each candidate elimination / forced placement is captured with
  the rule + premise that fired it:
  - `place` — a positional/numeric single (a cell whose region forces a digit, or
    whose own candidates collapse to one), naming the region (row/column/block/
    diagonal) that forced it;
  - `elim` — a digit ruled out of a cell because the region already holds it;
  - `intersect` — a digit confined to one row/column within a block (or vice
    versa), ruled out elsewhere in the crossing line;
  - `set` — a naked/hidden subset locking a set of digits to a set of cells;
  - `forcing` — a forcing-chain contradiction;
  - the **killer** deductions — single-square cage, cage min/max bound, cage
    sum-combination, and deduced extra-cage (`KSINGLE`/`KMINMAX`/`KSUMS`/
    `KINTERSECT`), each named by the cage and its sum clue.
  One technique *firing* maps to exactly one `group` (the solver **returns per
  firing on the recording path**, gated on the recorder) so a hint step never mixes
  regions. With recording off, the generate/solve path is **byte-for-byte
  unchanged** (verified by the existing C differential). Add
  `recordSoloDeductions(...)` returning the ordered op script. The recursion tier
  (`DIFF_RECURSIVE`) is **not** recorded — a guess is not a teachable note strike.
- **`index.ts` gains `hint()` + `hintKeepTrack()` + `refreshHintStep()`.** The plan
  builder walks a working copy the way a person solves it: a **naked single**
  first; else (after a lazy `pencilAll` populate) the **basic-region** dups a placed
  value (or a given) implies in its row/column/block/diagonal; else the next
  **deductive elimination** (the technique worth teaching); else a forced
  **placement** (a cube collapse the notes lag — naked or hidden/positional single,
  the *why* re-derived from the working board). Narration meets the quality bar
  (indication → reasoning → necessity conclusion), names the firing region (or the
  cage by its sum clue), and reads correctly across all region types and the killer
  deductions. Auto-pencil folds the trivial region eliminations into a placement
  when on, teaches them when off.
- **`render.ts` renders the hint.** Append `COL_HINT` / `COL_HINT_CELL` to the
  palette (past the fork pencil-body at index 9; Solo's only dark-mode override
  touches `COL_GRID`), shade the driving region's cells (`COL_HINT_CELL`), mark the
  target cell(s) (`COL_HINT`), and draw the struck candidate(s) crossed through in
  the pencil grid — folded into the existing per-cell cache via a
  `hintPacked`/`drawnHint` `Int32Array` sidecar (the third sidecar alongside
  `pencil` and `drawnWrong`). Element-type colour legend per the cross-game
  convention when a step names ≥2 region types at once.
- **Tests**: a recorded reason per technique (incl. one killer deduction); the plan
  solves a generated board from empty *and* from a self-played mid-game position
  (`soloGame` joins the shared `hint-resume.test.ts`); refusal on solved / on
  mistakes; `hintKeepTrack` verdicts; a tier-2.5 render-scenario snapshot of an
  elimination journey frame.

## Impact

- **Affected specs:** `solo` (ADDED hint requirement). No `ts-engine` change — the
  hint hooks, the `findMistakes` first-class-notes convention, the
  refusal→mistake coupling, the element-type colour legend, and the shell
  Hint/Auto-Hint buttons all already exist.
- **Affected code:** `src/native/games/solo/{solver,index,render}.ts` and their
  tests; the shared `engine/hint-resume.test.ts` list. **No change to
  `engine/latin.ts`** (Solo does not use it).
- Parity-gated: the hint ships registered for owner acceptance; `add-solo-hint`
  archived only on owner acceptance.

## Out of scope

- **Live (rule-violation) error-checking of pencil notes** — the same boundary the
  other Latin-family hints drew: Solo checks only the solution-contradiction
  (`findMistakes`) tier, not a live note-error tier.
- **A bespoke populate move** — populate reuses `pencilAll`; the only added move
  (`pencilStrike`) already exists from the base port.
- **Hints that require the `DIFF_RECURSIVE` (Unreasonable) guess** — capped below
  recursion; on a board only solvable by guessing, the hint reports it cannot
  deduce the next move (faithful to "a guess is not a teachable note strike").
- **`add-solo-hint` does not touch the `divvy.c` deletion question** — see the
  separate note: `divvy.c` stays until the unfinished `separate` puzzle is ported
  or dropped.
