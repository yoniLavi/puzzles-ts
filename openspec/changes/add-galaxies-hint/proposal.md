# Change: Galaxies explained hint, narrated in association-mark vocabulary

## Why

Galaxies is the most prominent of the 13 games still without a `hint()`
(see `docs/games/hints.md`'s coverage note), and the owner has asked for it
specifically (2026-08-07): the game "currently requires a lot of back and
forth", and its hint should teach deductions using the association pencil
marks that `add-galaxies-association-marks` introduces — the hint records
its "this tile must belong to that dot" conclusions the same way a careful
player would, in pencil, before anything is committed.

## What Changes

- `Game.hint()` for Galaxies as a **recorded projection of the existing
  solver** (one engine, two projections): the same difficulty-graded
  deduction chain (`solver_obvious`, lines-opposite, spaces-oneposs,
  expand-from-dot, extend-exclaves) runs with a recorder, and each firing
  becomes one narrated step meeting the Palisade bar — why the deduction is
  forced, not just what to do.
- **Deduction steps emit pencil `mark` moves** (the owner's stated framing);
  commit-shaped steps (the association + its 180° partner, edges where
  implied) follow as grouped journeys. Evidence renders as area highlights
  in the hint colour legend; equivalent moves share a colour.
- Refusal couples to `findMistakes` (now mark-aware) with the banner;
  `hintKeepTrack` and `refreshHintStep` handle the player committing ahead
  of the plan (a committed association absorbs the marked step).
- Unreasonable-tier boards whose next deduction needs the recursion rung get
  the honest non-local treatment rather than a fabricated local reason (no
  un-narrated fallback — the guess-free policy's hint-side obligation).
- Enrolment: `testing/hint-games.ts` (which auto-enrols the overlay and
  resume guards), hint-quality wording tests, tier-2.5 render scenarios.

## Impact

- Affected specs: `galaxies` (one ADDED requirement — the deduction hint).
- Affected code: `src/games/galaxies/{solver,index,render}.ts` (+ a
  `hint.ts` if the plan assembly earns its own module), hint tests.
- Depends on: `add-galaxies-association-marks` (the mark move and its
  rendering are this hint's vocabulary).
