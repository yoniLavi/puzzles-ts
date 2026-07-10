# Add an explained hint to Dominosa

## Why

Explained hints are a core deliberate-divergence product value of this fork.
Dominosa's port already ships the full graded deductive solver (nine `deduce_*`
techniques), so the "narratable deduction engine" is in place — its explained
hint is the second projection of that engine (solver off ⇒ generate/grade,
solver on with a recorder ⇒ narrate). Upstream's `'h'` gives one move with no
explanation; this hint teaches *why* each move is forced, meeting the Palisade
quality bar.

## What Changes

- Add an optional **recorder** to `dominosa/solver.ts`: a gated `firstFiring()`
  driver that runs the ported deductions **one firing at a time** over a
  persistent scratch (seeded from the player's placed dominoes), capturing the
  first firing's technique + affected placements + per-technique evidence. The
  generator's `runSolver` path is untouched (recorder-free), so the byte-match
  differential is unaffected by construction.
- Implement `Game.hint(state)` in `dominosa/index.ts`: refuse on a solved or
  mistaken board (coupling to the existing `findMistakes` overlay + banner),
  else build a plan by walking `firstFiring` to a solved board. Each firing
  becomes one `HintStep`:
  - a **placement** step — a domino now has exactly one spot → "place the N-M
    domino here" (the payoff move), narrated with *why* the alternatives are
    gone;
  - a **barrier** step — a deduction proves a spot can't hold a domino → draw a
    barrier there, narrated by the technique (duplicate-forcing, must-overlap,
    parity split, set analysis, forcing chain). Multiple barriers from one
    firing group as one `continuesPrevious` journey (quality-bar rule 2); a
    barrier the player already drew is skipped for display but still advances
    the scratch.
- Implement `Game.hintKeepTrack`: the player's domino/edge move matching the
  step advances the plan; anything else drops it to recompute.
- Render the hint in `dominosa/render.ts`: the forced domino's two cells (or a
  barrier's two cells) in `COL_HINT`; the deduction's evidence squares in
  `COL_HINT_CELL`; every hint bit folded into the packed `Int32Array` diff key.
- Register `dominosaGame` in `hint-resume.test.ts` (the cross-game "a hint
  resumes from any mid-game position to solved" guard) and add tier-1 hint
  tests (refusal, narration voice, plan completeness) + a tier-2.5 hint render
  scenario.

## Impact

- Affected specs: **`dominosa`** (new hint requirements), merging into
  `ts-engine`'s Hint System on archive.
- Affected code: `src/native/games/dominosa/{solver,index,render}.ts`,
  `src/native/games/dominosa/dominosa-hint.test.ts` (new),
  `src/native/engine/hint-resume.test.ts` (register the game). No app-shell
  changes (the Hint button + Auto-Hint are generic). No generator/differential
  change.
</content>
