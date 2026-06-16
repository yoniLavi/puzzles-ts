# Proposal: Add an explained deduction hint to Range

**Status**: Proposed

## Why

The Range TS port (`add-range-ts-port`, archived 2026-06-16) deliberately
deferred `hint()`: upstream's `'h'` key returns one next deduced move with no
explanation, which is below this fork's hint quality bar (the Palisade
exemplar — narrate *why* a move is forced). The owner accepted the base port
but, not being a strong Range player, wants the explained hint live so they
can follow the solution while doing fuller acceptance testing. This change
adds that hint.

## What Changes

- **`solver.ts` gains a recording deduction.** The three deductive rules
  (not-too-big, adjacency, connectedness) already drive `applyRules`; they
  gain an optional per-move `record` callback that captures, for each forced
  cell, the rule that fired and its premise cells. A new `deduceHintPlan`
  runs the deduction from the player's current marks and returns the ordered
  list of forced `(cell, value, reason)` moves — the whole remaining
  no-recursion solution (a generated board stays no-recursion-solvable from
  any correct partial state, so the plan always completes).
- **`index.ts` gains `hint()` + `hintKeepTrack()`.** `hint()` refuses when the
  board is solved or when `findMistakes` is non-empty (a hint off a
  contradictory board would mislead — the Palisade precedent), else returns
  the plan as a non-empty sequence of narrated `HintStep`s. Each step narrates
  the *why* per rule:
  - adjacency → "next to a black square, and blacks can't touch — so white";
  - clue satisfied → "clue N already sees all N white cells, so the run stops
    here — black";
  - clue overrun → "white here would push clue N past N cells — black";
  - clue must-reach → "clue N only reaches N by extending this way — white";
  - connectedness → "black here would cut the white region in two — white".
  `hintKeepTrack` completes a step iff the player's move sets the hinted cell
  to the hinted value (so the plan auto-advances as they follow it), else
  drops the plan to recompute.
- **`render.ts` renders the hint highlight.** The hinted cell is filled
  `COL_HINT` (blue) with a preview of the move it forces (a black inset square
  for a forced black, a dot for a forced white); the premise cells (the clue,
  or the adjacent black) are light-shaded `COL_HINT_CELL`. Folded into the
  per-cell `Int32Array` cache via new hint bits. The shell's existing Hint
  (reveal) / Auto-Hint (step-through animation) buttons and `AUTO_HINT_STEP_MS`
  pacing drive it unchanged — that is the "animation" (Range has no move
  animation upstream; `animLength` stays 0).
- **One engine fix.** Range is the first hint-carrying game with
  `wantsStatusbar = false`, which exposed that the midend's hint explanation
  rides on the `status-bar-change` notification, suppressed when a game has no
  status bar — so the banner stayed empty. `Midend.emitStatusBar` now emits
  that notification for any game with a status bar **or** a `hint` capability
  (the status-bar DOM is gated on `wantsStatusbar` separately, so the empty
  text is inert), so the banner both appears and clears. Found during
  dev-smoke, not by the suite — the green-suite-isn't-parity lesson again.
- **Tests**: each rule's recorded reason, plan validity (every step's move is
  legal and the plan solves the board), refusal on solved / on mistakes,
  `hintKeepTrack` completed/off, a tier-2.5 render-scenario snapshot of a hint
  frame, and a midend test for the no-status-bar banner emit/clear.

## Impact

- **Affected specs:** `range` (ADDED hint requirement); `ts-engine` (ADDED:
  hint explanation surfaces independent of the status bar).
- **Affected code:** `src/native/games/range/{solver,index,render}.ts` and
  their tests, plus a one-line gate change in `src/native/engine/midend.ts`
  (`emitStatusBar`). The `hint`/`hintKeepTrack` hooks, the midend `ActiveHint`
  lifecycle, and the shell Hint/Auto-Hint buttons already exist. Parity-gated:
  shipped for owner acceptance testing.

## Out of scope

- **Grouping multiple cells forced by one firing into a single
  `continuesPrevious` journey.** Range's forced cells each carry a
  self-contained local premise, so one-cell-per-step already explains every
  move; grouping (e.g. a black forcing all four neighbours white as one
  journey) is a possible later refinement, not required to meet the
  explain-why bar here.
- **A move-fill animation** (Range has none upstream; the hint auto-play is
  the animation).
