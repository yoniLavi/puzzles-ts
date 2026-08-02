# add-subsets-difficulty-tiers

## Why

**Subsets ships a solver with one of its own deductions commented out, and no
difficulty setting.** Its author's Status names the second — *"There are currently
no difficulty options or alternate grid sizes"* — and the C carries the first
in-place, as a disabled block marked `// TODO repair this`: the mirror-image half
of the arrow deduction, which would eliminate, on the *subset* cell, options that
cannot fit inside the superset. Upstream wrote it, broke it, and left it out.

`add-subsets-ts-port` D2 deliberately did not port it, correctly at the time: the
generator keeps a cell blank only while the solver still solves, so restoring it
would change every generated board and forfeit the byte-match oracle. **The owner
released that constraint on 2026-08-01.**

The two items are one piece of work, and in this order. Subsets has a fixed 4×4
board over four letters — that is the only size where the sixteen possible sets
exactly fill the sixteen cells, so board size cannot carry difficulty here.
Difficulty has to come from deductive depth, and repairing the arrow rule is what
creates a second rung to grade against: with a stronger solver the generator can
leave more cells blank, which is exactly what makes a harder Subsets.

## Sequencing (owner decision, 2026-08-01)

**Waits for `retire-c-engine`**, and possibly for a round or two of refactoring
after it, so this lands on a TypeScript-only codebase rather than alongside the
C teardown. Nothing here needs the C build: this game's differential imports a
frozen JSON fixture and keeps working with no C present.

Note the one-way consequence of that order — with no C build there is no
re-baselining a fixture against upstream. Where this change diverges, the fixture
is retired or re-founded on properties, not re-recorded. That is the intended
effect of the released oracle, not an accident of the sequencing.


**After `add-clusters-difficulty-tiers`**, which establishes the parameter / preset / game-ID / differential pattern on a game with no deduction to invent.

## What Changes

- **Repair the disabled arrow deduction** — port upstream's commented-out block,
  fix what was wrong with it, and prove it sound (it must never eliminate a
  candidate that appears in a real solution).
- **Two tiers** over the resulting rungs: the easier one solvable without the
  repaired rule, the harder one requiring it, gated honestly per
  `grade-difficulty-tiers-honestly`.
- **Params, presets, Custom dialog, game ID.** Subsets currently ships *no*
  `paramConfig` at all (upstream's configure slot is `false`), so the Custom
  dialog gains its first entry for this game.
- **Re-found the assurance**: the desc byte-match cannot survive a stronger
  solver. Replace with uniquely-solvable-at-exactly-its-tier, and keep the C
  fixtures as solver-verdict checks where they still hold.

Explicitly **not** in this change: alternate grid sizes. The 4×4/four-letter
bijection is the puzzle; other sizes are a different game (`audit-author-known-issues`).

## Impact

- Affected specs: `subsets`.
- Affected code: `src/games/subsets/{solver,generator,state,index}.ts`.
- **Every Subsets board changes.** Existing IDs carrying a description still load.
- The repaired rule is the risk: an unsound elimination produces puzzles with no
  solution, which is the one failure mode worse than a weak solver.
