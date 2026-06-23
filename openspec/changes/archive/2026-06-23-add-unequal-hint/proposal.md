# Proposal: Add an explained deduction hint to Unequal

**Status**: Proposed

## Why

The Unequal TS port (`add-unequal-ts-port`, archived 2026-06-23) deferred
`hint()`, exactly as Towers did before `add-towers-hint`. Unequal is the second
Latin-square-family game (after Towers) and its signature reasoning is the same
**candidate-elimination** shape: the two-mode clue deductions (greater-than
"link" bound elimination in Unequal mode; differ-by-1 adjacency elimination in
Adjacent mode) *narrow a cell's set of possible numbers* rather than directly
forcing one. The shared generic `LatinSolver` (`engine/latin.ts`) already carries
the recording machinery Towers built (the `o³` candidate cube *is* a pencil-notes
representation; `place`/`elim`/`set`/`forcing` already record with reasons). So
Unequal's hint is the Towers pattern re-applied: the only genuinely new work is
recording Unequal's three user-solvers with Unequal-specific reasons and writing
the two-mode narration.

The fork already treats pencil notes as first-class markings for Unequal — its
base port shipped `findMistakes` flagging a note set that excludes the solution
value (`kind: "note"`), the `pencilStrike` move, and the auto-pencil / sticky /
fill-all UX. So this change adds only the explained hint on top.

## What Changes

- **`solver.ts` gains a hint-only recording mode** for the three Unequal
  user-solvers. Thread the existing `solver.recorder` through `solverLinks`
  (Unequal mode), `solverAdjacent` and `solverAdjacentSet` (Adjacent mode) so each
  candidate elimination is captured with the rule + premise that fired it
  (`greater`/`lesser` for an inequality bound; `adjacent`/`adjacentSet` for a
  differ-by-1 clue). Each user-solver **returns as soon as one firing fires on the
  recording path** (gated on `solver.recorder`) so one recorded `group` is one
  clue's deduction — the Towers "marks never bleed across the narrated clue"
  discipline. With recording off the generator/solve path is byte-for-byte
  unchanged (verified by the existing C differential). Add `recordUnequalDeductions`
  (the raw deduction script a hint narrates).
- **`index.ts` gains `hint()` + `hintKeepTrack()` + `refreshHintStep()`.** The
  plan builder walks a working copy the way a person solves it: a **naked single**
  first; else (after a lazy `pencilAll` populate) the **basic Latin** row/column
  eliminations a given/placed value implies (Unequal boards carry a few givens, so
  these are taught honestly rather than baked into the fill); else the next
  **clue elimination** (the link/adjacency deduction worth teaching); else a forced
  **placement** (a cube collapse the notes lag). Narration meets the quality bar
  (indication → reasoning → necessity-voice conclusion), two-mode aware, and
  re-reads correctly at the degenerate clue extremes (§2.7). Auto-pencil folds the
  trivial row/column eliminations into a placement when on, teaches them when off.
- **`render.ts` renders the hint.** Append `COL_HINT` / `COL_HINT_CELL` to the
  palette (past the existing fork colours; Unequal has no dark-mode overrides),
  shade the driving clue's two cells (`COL_HINT_CELL`), mark the target cell(s)
  (`COL_HINT`), and draw the struck candidate(s) crossed through in the pencil
  grid — folded into the per-cell `Int32Array` diff cache. Element-type colour
  legend per the cross-game convention.
- **Tests**: a recorded reason per technique in both modes; the plan solves a
  generated board from empty *and* from mid-game (`unequalGame` joins the shared
  `hint-resume.test.ts`); refusal on solved / on mistakes; `hintKeepTrack`
  verdicts; a tier-2.5 render-scenario snapshot of an elimination-journey frame in
  each mode.

## Impact

- **Affected specs:** `unequal` (ADDED hint requirement). No `ts-engine` change —
  the hint hooks, the `findMistakes` first-class-notes convention, the refusal→
  mistake coupling, the element-type colour legend and the shell Hint/Auto-Hint
  buttons all already exist.
- **Affected code:** `src/native/games/unequal/{solver,index,render}.ts` and their
  tests; the shared `hint-resume.test.ts` list. No change to `engine/latin.ts`
  (its recording mode is already complete and shared).
- Parity-gated: registered hint shipped for owner acceptance; `add-unequal-hint`
  archived only on owner acceptance.

## Out of scope

- **Live (rule-violation) error-checking of pencil notes** — same boundary Towers
  drew: Unequal checks only the solution-contradiction (`findMistakes`) tier, not a
  live note-error tier.
- **A bespoke populate move** — populate reuses `pencilAll`; the only added move
  (`pencilStrike`) already exists from the base port.
