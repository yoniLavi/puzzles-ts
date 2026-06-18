# Proposal: Add an explained deduction hint to Filling

**Status**: Proposed

## Why

The Filling (Fillomino) TS port (`add-filling-ts-port`) deferred `hint()`:
upstream's `'h'` key reveals one next deduced cell with no explanation, which
is below this fork's hint quality bar (the Palisade exemplar — narrate *why* a
move is forced). Filling's deductions ("this region can't reach its size
without that square", "this square can only be a 1") are exactly the kind of
technique a beginner benefits from being *taught*, so an explained hint is high
product value. This change adds it, mirroring the Range hint (`add-range-hint`),
which is the recording-deduction exemplar.

## What Changes

- **`solver.ts` gains a grouped hint deduction.** A new
  `deduceHintPlan(board, w, h)` runs from the player's current board and returns
  an ordered list of forced **groups** that together solve it. The primary
  deduction is region-growth, *grouped*: `nextRegionGroup` finds a region that
  cannot reach its size without a set of empty squares (each fails the capacity
  flood when blocked, so each is on every completion) and returns them all as
  one step — flagged `exact` when they *complete* the region. A single-cell
  fallback (`firstSolverMove`, the existing four-technique solver keeping its
  first recorded fill) covers cells no region-growth group reaches (lonely /
  candidate-elimination, plus the rare only-one-flood-path case). The plan is
  built on a working board, applying each group before finding the next, so
  every step's narration + shaded region reflect the board as that step fires.
  A generated board stays solver-solvable from any correct partial, so the plan
  always completes (verified on 53/53 scanned boards; ~29% of steps group >1
  square).
- **`index.ts` gains `hint()` + `hintKeepTrack()`.** `hint()` refuses when the
  board is solved or when `findMistakes` is non-empty (a hint off a
  contradictory board would mislead — the Palisade/Range precedent), else
  returns the plan as a non-empty sequence of narrated `HintStep`s. Narration is
  terse and number-light (the value is read off "the region of N" / "a 1"):
  - region growth (exact) → "the shaded region of N fits exactly into these
    squares";
  - region growth (partial) → "the shaded region of N can't fully grow without
    these squares";
  - only-one-growth → "this is the only empty square that the shaded region of N
    could grow into";
  - lonely cell → "no neighbouring region can grow to include this square, so it
    can only be a 1";
  - candidate elimination → "no other number can go here … so it must be a N".
  `hintKeepTrack` handles a multi-square step: `"completed"` when the move fills
  all the step's squares with the hinted value, `"onTrack"` (shrinking the step
  to the still-empty squares) when it fills some, `"off"` on a non-target cell or
  wrong value.
- **`render.ts` renders the hint highlight.** The target square(s) get a **mild
  `COL_HINT` "fill here" highlight with no digit** — owner-directed: a dark fill
  with the answer pre-printed reads as a filled-in answer, not a call to action.
  The evidence cells (the region, or the pinning neighbours) are shaded
  `COL_HINT_CELL` (light blue) — their digits stay visible on the light fill.
  Folded into the per-cell `Int32Array` cache via new hint bits. Filling has no
  move animation; the shell's Hint / Auto-Hint buttons and `AUTO_HINT_STEP_MS`
  pacing drive it unchanged.
- **No engine changes.** The no-status-bar hint banner emit/clear
  (`Midend.emitStatusBar`) and the refusal-highlights-mistakes coupling
  (`Midend.computeHintPlan` → `findMistakes`) already landed with
  `add-range-hint`; Filling is also `wantsStatusbar = false` and has
  `findMistakes`, so both work for free.
- **Tests**: each technique's recorded reason, plan validity (every step's move
  is legal and the plan solves the board), refusal on solved / on mistakes,
  the visible-evidence invariant, `hintKeepTrack` completed/off, and a tier-2.5
  render-scenario snapshot of a hint frame.

## Impact

- **Affected specs:** `filling` (ADDED hint requirement).
- **Affected code:** `src/native/games/filling/{solver,index,render}.ts` and a
  new `filling-hint.test.ts`. The `hint`/`hintKeepTrack` hooks, the midend
  `ActiveHint` lifecycle, and the shell Hint/Auto-Hint buttons already exist.
  Parity-gated: shipped for owner acceptance testing.

## Out of scope

- **Grouping multiple cells forced by one firing into a single
  `continuesPrevious` journey.** Filling's forced cells each carry a
  self-contained local premise (a distinct region or a distinct cell), so
  one-cell-per-step already explains every move; there is no Palisade-style
  single-firing-forces-N structure to group.
- **A move-fill placement animation** (Filling has none upstream; the hint
  auto-play is the animation). Could be added later (the Unruly grow-from-centre
  pattern) if owner acceptance wants visible motion per step.
