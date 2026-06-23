# Proposal: Add an explained deduction hint to Keen

**Status**: Proposed

## Why

The Keen TS port (`add-keen-ts-port`, archived 2026-06-23) deferred `hint()`,
exactly as Towers and Unequal did before their hint changes. Keen is the third
Latin-square-family game and its signature reasoning is the same
**candidate-elimination** shape: the per-cage arithmetic deductions
(`solverEasy`/`solverNormal`/`solverHard` via the shared `solverCommon`) *narrow a
cell's set of possible digits* rather than directly forcing one — for each cage,
enumerate the digit layouts consistent with its clue (target + operation) and the
current candidate cube, then prune the cube. The shared generic `LatinSolver`
(`engine/latin.ts`) already carries the recording machinery (the `o³` candidate
cube *is* a pencil-notes representation; `place`/`elim`/`set`/`forcing` already
record with reasons). So Keen's hint is the Towers/Unequal pattern re-applied: the
only genuinely new work is recording Keen's cage user-solvers with cage-specific
reasons and writing the cage-arithmetic narration.

The fork already treats pencil notes as first-class markings for Keen — its base
port shipped `findMistakes` flagging a note set that excludes the solution digit
(`kind: "note"`), the `pencilStrike` move, and the auto-pencil / sticky / fill-all
UX. So this change adds only the explained hint on top.

## What Changes

- **`solver.ts` gains a hint-only recording mode** for the cage user-solvers.
  Thread the existing `solver.recorder` through `solverCommon` so each candidate
  elimination is captured with the rule + premise that fired it: a `cage` reason
  (no arrangement of the cage's digits satisfying its clue leaves this candidate
  possible — the EASY/NORMAL per-square pruning) and a `cageLine` reason (a digit
  required in this cage along a row/column, so ruled out elsewhere in that line —
  the HARD cross-line pruning). `solverCommon` **returns as soon as one firing
  fires on the recording path** (gated on `solver.recorder`) so one recorded
  `group` is one cage's (or one line's) deduction — the Towers/Unequal "marks never
  bleed across the narrated clue" discipline. With recording off, the
  generator/solve path is byte-for-byte unchanged (verified by the existing C
  differential). Add `recordKeenDeductions` (the raw deduction script a hint
  narrates).
- **`index.ts` gains `hint()` + `hintKeepTrack()` + `refreshHintStep()`.** The
  plan builder walks a working copy the way a person solves it: a **naked single**
  first; else (after a lazy `pencilAll` populate) the **basic Latin** row/column
  eliminations a placed value implies (so a hint resumed from a board the player
  filled with auto-pencil off still teaches the row/column culls); else the next
  **cage elimination** (the arithmetic deduction worth teaching); else a forced
  **placement** (a cube collapse the notes lag). Narration meets the quality bar
  (indication → reasoning → necessity-voice conclusion), names the cage by its
  clue (`sum to 15`, `multiply to 72`, `differ by 3`, `have a ratio of 2`), and
  re-reads correctly across the operation set. Auto-pencil folds the trivial
  row/column eliminations into a placement when on, teaches them when off.
- **`render.ts` renders the hint.** Append `COL_HINT` / `COL_HINT_CELL` to the
  palette (past the existing fork colours; Keen has no dark-mode overrides), shade
  the driving cage's cells (`COL_HINT_CELL`), mark the target cell(s) (`COL_HINT`),
  and draw the struck candidate(s) crossed through in the pencil grid — folded into
  the per-cell `Int32Array` diff cache via a `hintPacked`/`drawnHint` sidecar.
  Element-type colour legend per the cross-game convention.
- **Tests**: a recorded reason per technique; the plan solves a generated board
  from empty *and* from mid-game (`keenGame` joins the shared
  `hint-resume.test.ts`); refusal on solved / on mistakes; `hintKeepTrack`
  verdicts; a tier-2.5 render-scenario snapshot of a cage-elimination journey frame.

## Impact

- **Affected specs:** `keen` (ADDED hint requirement). No `ts-engine` change — the
  hint hooks, the `findMistakes` first-class-notes convention, the refusal→mistake
  coupling, the element-type colour legend and the shell Hint/Auto-Hint buttons all
  already exist.
- **Affected code:** `src/native/games/keen/{solver,index,render}.ts` and their
  tests; the shared `hint-resume.test.ts` list. No change to `engine/latin.ts` (its
  recording mode is already complete and shared).
- Parity-gated: registered hint shipped for owner acceptance; `add-keen-hint`
  archived only on owner acceptance.

## Out of scope

- **Live (rule-violation) error-checking of pencil notes** — same boundary Towers
  and Unequal drew: Keen checks only the solution-contradiction (`findMistakes`)
  tier, not a live note-error tier.
- **A bespoke populate move** — populate reuses `pencilAll`; the only added move
  (`pencilStrike`) already exists from the base port.
