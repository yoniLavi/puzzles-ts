# add-crossing-hint

## Why

Crossing is the last shipped x-sheep deductive game without an explained hint,
and it is an unusually cheap one to add: it already has everything the hint needs
and nothing it doesn't.

- **A real deductive solver, already ported** (`crossing/solver.ts`) — two
  techniques run to a fixpoint: positional narrowing over each run's still-fitting
  numbers, and naked singles. There is no difficulty grading and no guessing
  (upstream's own `// TODO harder techniques?`), so **every step is narratable**
  and there is no "just because" fallback to design around.
- **Pencil notes are already first-class** (`state.marks`), and `findMistakes`
  already flags a note that excludes the solution's digit (playbook §3.7). So the
  refusal path and the note-strike move shape both exist.
- **A shared framework already exists for exactly this kind of game.**
  `engine/candidate-hint.ts` owns the reusable mechanics of the
  candidate-elimination family and has four consumers (Towers, Unequal, Keen,
  Solo). Crossing is the closest structural fit of any remaining game — a grid,
  a per-cell candidate bitmask, digits 1–9, `{x, y, n}` marks.

## The deduction the hint should teach — and why it is *not* what the solver returns

`solverMarks` computes a run's forced digits by unioning the digits of every
still-fitting number and intersecting each cell's candidates with that union. It
returns *which* candidates died, carrying **no name for why**. That is the Pattern
situation (hint-authoring §5.6a): the named technique has to be **re-derived**, and
here it is very much worth doing, because the honest names are the two things a
Crossing player actually thinks:

1. **"Only one listed number still fits this run."** Then the whole run is that
   number — and the existing two techniques already produce exactly that result
   (the union collapses to one number's digits, then naked singles place them
   all). The hint gets to say it as *one* deduction filling a whole run, which is
   both the strongest teaching and the most satisfying move.
2. **"Every number that still fits this run has a 4 in this position."** The
   positional-narrowing deduction, stated the way a human states it.

Narrating the raw solver output instead ("this cell's candidates collapsed to one")
would be a hint that is correct, useless, and unteachable.

## What Changes

- **A recording deduction pass** (`crossing/hint-solver.ts`) beside the untouched
  `solveCrossing`, replaying the two techniques one firing at a time over the
  shared `engine/hint-plan.ts` loop, and re-deriving the *named* technique per
  firing rather than reporting bare candidate deaths.
- **`hint()` / `hintKeepTrack()` / `refreshHintStep()`** in `crossing/index.ts`,
  with narration meeting the quality bar, one firing = one journey, and the three
  standard refusals coupling to the existing mistake overlay.
- **Three move shapes, each echoed in its own mark** (hint-authoring §5.1a):
  Crossing can *place a whole number into a run*, *enter one digit*, and *strike a
  note*. The whole-run placement is the payoff move and the one the strongest
  deduction produces.
- **Hint rendering** in `crossing/render.ts`, including the number panel — the
  evidence for both techniques is "which listed numbers still fit", so the
  **clue list is part of the highlight**, not just the grid.
- **Two shared-code extractions the port motivates** (design D6, D7):
  `DeductionRecord` moves out of `latin.ts` (a non-Latin game should not import
  the Latin solver to speak the shared record shape), and the candidate-hint
  helpers stop hard-coding a `type` discriminator so a game whose `Move` union
  uses a different key can adopt them — which also unblocks **Group**, whose
  `refreshHintStep` is a hand-rolled copy of `refreshCandidateHintStep` today.
- **Tests** — `crossing-hint.test.ts` plus enrolment in `testing/hint-games.ts`.

Explicitly **not** in this change:

- **Any change to `solveCrossing`, the generator or the codec.** The generator is
  solver-gated and the byte-match differential covers it end to end; the recording
  pass stays strictly parallel (hint-authoring §5.6a).
- **The clickable-clue-list aid.** It already ships. This change *reads* it as
  hint evidence; it does not change how it behaves.

## Impact

- Affected specs: `crossing` (a hint requirement), `ts-engine` (none — the hint
  mechanics are generic).
- Affected code: `src/native/games/crossing/{hint-solver,index,render}.ts` (new
  `hint-solver.ts`), `src/native/engine/{candidate-hint,latin}.ts` (the two
  extractions), enrolment in `src/native/engine/testing/hint-games.ts`, and a
  follow-on delegation in `src/native/games/group/index.ts`.
- No C, no wasm: `crossing.c` is already deleted and its frozen differential must
  stay green untouched.
