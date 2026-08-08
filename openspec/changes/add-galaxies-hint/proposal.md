# Change: Galaxies explained hint, narrated in association vocabulary

## Why

Galaxies is the most prominent of the games still without a `hint()`
(see `docs/games/hints.md`'s coverage note), and the owner has asked for
it specifically (2026-08-07): the game "currently requires a lot of back
and forth", and the hint should teach the deductions that remove it.

**Re-founded 2026-08-08** (with `fix-galaxies-drag-preview`): the
original scaffold narrated hints in the pencil-mark vocabulary of
`add-galaxies-association-marks`, since **withdrawn** — review showed
the committed association already is the consequence-free cell↔dot
notation (it never enters completion, never colours a tile, is freely
reversible and undoable), so the hint's action vocabulary is the
association move the game already has. What made arrows feel unusable
was a drag-rendering defect, fixed in that change.

## What Changes

- `Game.hint()` for Galaxies as a **recorded projection of the existing
  solver** (one engine, two projections): the same difficulty-graded
  deduction chain (`solver_obvious`, lines-opposite, spaces-oneposs,
  expand-from-dot, extend-exclaves) runs with a recorder, and each
  firing becomes one narrated journey meeting the Palisade bar — why
  the association is forced, not just what to do.
- **A journey's action is the committed association** — the tile and
  its 180° partner as `continuesPrevious` legs (one firing, one
  journey), plus any edges the firing forces outright. Evidence (the
  blocked symmetric partner, the only-reaching dot) renders as area
  highlights in the hint colour legend; equivalent moves share a
  colour. Rule-outs are narrated and highlighted as evidence — the
  player never has to draw them.
- Refusal couples to `findMistakes` with the banner; `hintKeepTrack`
  and `refreshHintStep` handle the player committing ahead of the plan.
- Unreasonable-tier boards whose next deduction needs the recursion
  rung get the honest non-local treatment rather than a fabricated
  local reason (no un-narrated fallback — the guess-free policy's
  hint-side obligation).
- Enrolment: `testing/hint-games.ts` (which auto-enrols the overlay and
  resume guards), hint-quality wording tests, tier-2.5 render
  scenarios.

## Impact

- Affected specs: `galaxies` (one ADDED requirement — the deduction
  hint).
- Affected code: `src/games/galaxies/{solver,index,render}.ts` (+ a
  `hint.ts` if the plan assembly earns its own module), hint tests.
- Depends on: `fix-galaxies-drag-preview` (landed — the association
  gesture the hint teaches must render sanely).
