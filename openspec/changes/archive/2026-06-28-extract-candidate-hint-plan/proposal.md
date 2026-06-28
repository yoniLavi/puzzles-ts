# Proposal: Extract the shared candidate-elimination hint plan

**Status**: Proposed

## Why

Four shipped candidate-elimination hints — Towers, Unequal, Keen, Solo — carry a
near-verbatim copy of the same hint-plan plumbing (~250 lines each): the
naked-single-first walk, lazy populate, `nextStrike`/`nextPlace`, the strike
journey, `hintKeepTrack`, `refreshHintStep`, and small helpers. The duplication is
already taxing maintenance: the hidden-single-narration fix and the
facing-place-buries-clue-deductions fix each had to ship as coordinated multi-game
edits, and `latin-hint.ts` exists precisely because the team started hoisting the
shared pieces. With Solo (the last latin-family port) landed, the common shape is
well-evidenced across four exemplars — the right point to consolidate, so a future
bug fix or quality tweak is one edit, not four.

## What Changes

- **New shared module `src/native/engine/candidate-hint.ts`** owning the parts that
  are *identical* across the four games:
  - pure helpers over `(grid, pencil, ops)`: `nakedSingle`, `anyEmptyLacksNotes`,
    `firstUnreflectedPlaceIndex`, `nextStrike`, `nextPlace`, `joinNums`;
  - generic `hintKeepTrack` and `refreshHintStep` over a shared `PencilMove` shape
    (`set` | `pencilAll` | `pencilStrike` — structurally identical in all four games);
  - *(evaluated, deliberately not built — see design D2)* a `buildCandidatePlan` driver
    over the 5-step walk. On inspection the four games' walks diverge in step order,
    strike-split policy and journey-continuation tracking enough that a driver would be a
    callback shell over a ~6-line loop skeleton; the per-game `buildSteps` is more
    readable left in place, configured by the shared helpers above.
- **`config` injection points keep what is genuinely per-game**: `recordDeductions`,
  `narrate(reason, ns)`, `reasonArea`/`placementArea`, the strike-split policy (by
  digit vs by cell), and `basicRegionStrike`. Narration and the reason unions stay in
  each game — they are inherently game-specific.
- **Generalise `latin-hint.ts`'s placement classifier to arbitrary regions.**
  `classifyPlacement` currently checks only row/column; Solo already needed
  block + diagonal (`soloPlacementReason`). The shared classifier grows to take a
  region list, and Solo's bespoke version folds into it.
- **Migrate Towers, Unequal, Keen, Solo onto the shared module**, deleting each game's
  inline copies. Behaviour-preserving — gated by the existing per-game hint suites and
  `hint-resume.test.ts` (which already assert the exact narration, journey, keep-track
  and resume guarantees this refactor must not regress). Snapshots re-baselined only if
  an intended, reviewed wording change rides along (default: none).
- **Evaluate Undead** (`add-undead-hint`, a non-`latin.ts` candidate-elimination hint):
  its candidate model is a monster bitmask rather than digits `1..n`, so confirm during
  implementation whether the pure helpers fit cleanly; migrate it if so, otherwise leave
  it and record why.

## Impact

- **Affected specs:** `ts-engine` (ADDED — a requirement that the engine provides the
  shared candidate-elimination hint-plan abstraction). No per-game spec change: each
  game's hint requirement already mandates the behaviour this refactor preserves.
- **Affected code:** `src/native/engine/candidate-hint.ts` (new) + its test; the hint
  paths of `towers`, `unequal`, `keen`, `solo` (inline plumbing deleted, routed through
  the shared module); `latin-hint.ts` (classifier generalised); possibly `undead`.
  Generator/solve paths and the bespoke solvers are untouched — this is
  hint-display-plumbing only.
- Pure maintenance-debt paydown: no behaviour change, no new user-facing capability.
  The win is "one edit, not four" for every future candidate-hint change.

## Out of scope

- **Unifying the solvers.** Solo and Undead are bespoke for byte-match fidelity (the
  shared seam at the solver boundary is the `DeductionRecord` shape, already shared);
  this change does not touch how deductions are *produced*, only how the plan is built.
- **Changing any narration or hint behaviour.** Strictly a refactor; any wording change
  is a separate, explicitly-reviewed follow-up.
- **The `latin.ts` generic solver itself** (Towers/Unequal/Keen's deduction engine) —
  unchanged; only the per-game hint *plan* code that sits above it moves.
