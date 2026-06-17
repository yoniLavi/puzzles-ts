# Proposal: Add an explained deduction hint + placement animation to Unruly

**Status**: Proposed

## Why

The Unruly TS port (`add-unruly-ts-port`, pending owner acceptance) deliberately
deferred `hint()` and shipped with no move animation (`animLength` 0), matching
upstream — whose `'h'` key returns one next move with no explanation, below this
fork's hint quality bar (the Palisade exemplar: narrate *why* a move is forced).
The owner asked for the explained hint **and** an animation so the solve reads as
motion. This change adds both. Unruly is an ideal hint subject: its solver is a
stack of five named deductive techniques, each a teachable "why".

## What Changes

- **`solver.ts` gains a recording deduction.** The five techniques (impending
  threes, single gap, complete counts, unique rows, near-complete) already drive
  `solveGame`; they gain an optional per-fill `record` callback capturing each
  forced cell, the technique that fired, and its premise cells. A new
  `deduceHintPlan` runs the deduction from the player's current marks and returns
  the ordered forced moves — the whole remaining solution. Moves a *single*
  firing forces (a whole row completing to one colour, a near-complete row's
  forced remainder) are tagged `continuesPrevious` so they read and auto-play as
  **one journey**, per the quality bar; the per-cell techniques (threes, uniques)
  emit independent steps.
- **`index.ts` gains `hint()` + `hintKeepTrack()` + an `animLength`.** `hint()`
  refuses (`{ ok: false }`) when the board is solved or `findMistakes` is
  non-empty (a hint off a contradictory board misleads — the Palisade precedent),
  else returns the plan as narrated `HintStep`s. Each step narrates the *why* per
  technique:
  - threes → "two of these three cells are already <dark>; a third would be three
    in a row, so this one must be <light>";
  - complete / single-gap → "this <row> already holds all its <dark> cells, so
    every remaining cell must be <light>";
  - unique → "this row is full and that one matches it everywhere but here; making
    this cell <dark> too would make the two rows identical — forbidden — so it
    must be <light>";
  - near-complete → "only one <dark> cell is left to place in this row; anywhere
    but the ringed pair would force three <light> in a row, so every other empty
    cell must be <light>".
  `hintKeepTrack` completes a step iff the player's move sets the hinted cell to
  the hinted value, else drops the plan.
- **`render.ts` renders the hint + a placement animation.** The hinted cell is
  filled `COL_HINT` (blue) with a preview of the forced colour; the deduction's
  **evidence is shown as an area** — sibling forced cells of the same journey
  light-shaded `COL_HINT_CELL`, and filled premise cells (the same-colour pair,
  the near-complete reserved window) **ringed** in `COL_HINT` (a filled tile
  can't take a light shade without hiding the colour that *is* the evidence).
  Independently, a **placement animation** grows the new colour from the cell
  centre over a short base duration; the midend stretches it to the uniform
  hint-step duration, so auto-hint flows as continuous fills rather than instant
  snaps. Both fold into the per-cell `Int32Array` cache (animating cells use the
  Flip-style always-redraw sentinel; hint bits packed into the key).
- **Tests**: each technique's recorded reason + premise; plan validity (every
  step legal, the plan solves the board); refusal on solved / on mistakes;
  `hintKeepTrack` completed/off; the visible-evidence invariant (every step shows
  an area or a ring, never a bare conclusion); a render-op test for the growing
  fill; and a tier-2.5 render-scenario snapshot of a hint frame.

## Impact

- **Affected specs:** `unruly` (ADDED: explained hint + placement animation
  requirement).
- **Affected code:** `src/native/games/unruly/{solver,index,render}.ts` and their
  tests. The `hint`/`hintKeepTrack` hooks, the midend `ActiveHint` lifecycle, the
  hint-move animation stretch (`HINT_ANIM_S`), and the shell Hint/Auto-Hint
  buttons already exist. Parity-gated: shipped for owner acceptance.

## Out of scope

- **A colour cross-fade animation.** The drawing API is palette-index based, so
  the placement animation is geometric (the new colour grows from the centre),
  not an RGB tween. This reads cleanly and needs no intermediate palette entries.
- **Recursion-depth hints.** Unruly tops out at Normal (no recursive solve), so
  every generated board stays deducible from any correct partial state and the
  plan always completes — no backtracking-narration case to handle.
