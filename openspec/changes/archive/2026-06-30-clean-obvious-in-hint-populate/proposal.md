# Proposal: Candidate-elimination hints clean obvious candidates at populate

**Status**: Proposed (owner-requested QoL, 2026-06-29; follow-up to
`add-pencil-cleanup-on-markall`).

## Why

The adaptive **Mark all** control already cleans the obvious candidates (every pencilled
value already placed in the cell's row/column/region) in one press. The **auto-played
hint** does not use that: when it pencils notes in it fills *all* candidates `1..n` —
including the obviously-dead ones — and then either re-teaches the trivial eliminations one
firing at a time (Unequal/Keen/Solo's per-given `findRegionDuplicate` loop) or, in Towers,
the populate step actively *wipes* the cleanup the pre-populate placements had already done.
Either way the hint looks dumber than Mark all and wastes auto-play steps on eliminations a
single Mark-all press would have cleared. Owner noticed this playtesting Towers.

The owner's lead: *mark the obvious candidates at the start (in bulk, like Mark all), keep
the explicit per-placement cleanup after each added value, and reach for the harder combined
deductions only when stuck.* The first half is the missing piece.

## What Changes

- **The hint plan cleans obvious candidates in one bulk step once notes exist.** A new
  shared helper `emitObviousCleanStep` (`candidate-hint.ts`) strikes the
  `obviousCandidateMarks` — every candidate already placed in that cell's uniqueness regions
  — as one `pencilStrike`, flagged `continuesPrevious` when it follows the populate fill
  ("fill, then clear the obvious ones" as one setup journey) and standing alone when the
  board was already noted. It fires at most once per plan. This is exactly the adaptive
  Mark-all second press, reused. Crucially it runs whether the plan populated the notes
  *or* they were already present (a pre-noted board) — the prior per-given loop only ran in
  the latter case and would have left a freshly-populated board uncleaned.
- **The per-given basic-region opening loop is removed where the bulk clean subsumes it.**
  Unequal/Keen/Solo's step-3 `findRegionDuplicate` loop (one taught firing per given) is
  replaced by the single bulk clean — the same eliminations, in one step instead of N.
  Towers (which had no such loop, and whose populate even wiped its pre-populate placements'
  cleanup) gains the bulk clean for the first time.
- **Everything else is unchanged**: easy-first ordering (naked single → forced line →
  populate → harder deduction → forced placement), the explicit per-placement row/column
  cleanup with auto-pencil off, and the harder "combined" deductions (sets, forcing chains,
  cages, inequality/sightline clues).

## Impact

- **Affected specs:** `ts-engine` (MODIFIED — the candidate-elimination hint convention
  gains the clean-obvious-at-populate behaviour).
- **Affected code:** a new shared `emitObviousCleanStep` in `candidate-hint.ts` (built on the
  already-shared `obviousCandidateMarks`), and the `buildSteps` walk of `towers`, `unequal`,
  `keen`, `solo` (each emits the one-shot clean step once notes exist; Unequal/Keen/Solo drop
  their per-given `findRegionDuplicate` opening loop). Gated by each game's hint suite +
  `hint-resume.test.ts` (the populate + cleaned-note plan must still replay and refresh
  correctly).

## Out of scope

- Undead (its hint has no `pencilAll`/region-uniqueness populate — §9.4).
- Changing the easy-first walk, the per-placement cleanup, or any narration of the harder
  deductions.
- A continuous "auto-candidate mode" (the cleanup stays a one-shot at populate, as Mark-all
  is a one-shot press).
