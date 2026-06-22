# Fix: a displayed hint step must never reference already-resolved state

## Why

Owner-reported (2026-06-21), reproduced on a real Towers board: the Hint
display shows a candidate-elimination step for a candidate that is **already
gone** — e.g. *"Clue 3 can see only 3 towers … a tower of height 4 … can't go
here"* pointing at a cell whose pencil notes no longer contain 4. The hint is
telling the player to do something already done. This is a correctness/trust
defect in the explained-hint feature (a core deliberate-divergence product
value), and it must never happen.

Exact reproduction game id (5×5):
`5:2/4/3/2/1/2/1/3/2/3/3/1/3/4/2/1/3/3/2/2`
(top `2 4 3 2 1`, bottom `2 1 3 2 3`, left `3 1 3 4 2`, right `1 3 3 2 2`).

This change is **investigation + fix**: find the root cause and guarantee a
displayed hint step always reflects the current board.

**Second defect, same symptom (found 2026-06-22 during owner acceptance).** On a
*fresh* hint the candidate is genuinely present, yet the player still sees it
"already gone" — because the **render draws the struck candidate invisibly**. A
strike step flags its cells as hint *targets*, which fills the cell background
`COL_HINT` (the placement-target blue); the struck candidate *digit* is drawn in
`COL_HINT` too, so it is blue-on-blue and vanishes. The note is intact (verified:
`hint()` does not mutate state) but the frame hides it, reading identically to
the staleness bug. Owner's verbatim diagnosis: a hint should only highlight,
never change the notes. Reproduction id `5#b64d173663c12fe7b5afb449f8d26c25`.
Both defects are fixed here; both are guarded by tests.

## Owner-clarified hint-plan semantics (the constraint the fix must respect)

- A manual move that **exactly follows** the displayed hint **keeps the plan
  valid** (the player is following along; the plan advances). This is the
  existing `hintKeepTrack` `"completed"`/`"onTrack"` behaviour and must be
  **preserved**.
- Only a **conflicting** manual move invalidates and regenerates the plan
  (existing `"off"` behaviour).
- So the fix is **not** "drop the plan on every manual move" (that was tried in
  this session and reverted — it changed the desired UX and did not fix the
  defect anyway). The fix must keep the plan across exact-follow yet guarantee
  no kept/re-displayed step is ever stale.

## What Changes

To be decided after the root cause is confirmed. Candidate directions (see
`design.md`):
1. **Validate-at-display**: when the midend (re-)displays a stored step, drop
   marks (or recompute the plan) for any part of the step that is a no-op
   against the current state — so a stale step is never shown.
2. **Refresh-on-keep**: when `hintKeepTrack` keeps the plan after a move,
   re-filter the remaining steps' marks against the new state.
3. **Game-level**: a Towers-specific guarantee that a kept plan's later steps
   stay live.

## Impact

- Affected specs: `ts-engine` (Hint System — add a "displayed step is never
  stale" guarantee).
- Affected code: likely `src/native/engine/midend.ts` (hint lifecycle) and/or
  `src/native/games/towers/index.ts` (`buildSteps`/`hintKeepTrack`).
- Out of scope / keep: the bleed fix (`solver.ts` per-clue recording, already
  landed this session and owner-confirmed) and the Hint-button stepper.
