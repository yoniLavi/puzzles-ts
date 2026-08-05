# add-subsets-difficulty-tiers

> **`solvableAtExactlyTier` now exists** (`add-game-difficulty-contract`,
> 2026-08-05). The acceptance rule this change needs — *solvable at its tier and
> not at the tier below* — is `engine/difficulty.ts`'s
> `solvableAtExactlyTier(solve, tier)`. It takes a `(cap) => DifficultyVerdict`
> closure, so a generator calls it without importing its own `index.ts`, and it
> asks the **cheap** question first so a too-easy candidate is rejected before
> the deep solve is paid for. Apply it rather than re-deriving the rule; declare
> `Game.difficulty` too, which enrolls the game in the cross-game
> cap-monotonicity / tier-reachability guards automatically.


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

## What `add-clusters-difficulty-tiers` found (landed 2026-08-04)

Clusters went first precisely to establish the pattern, and four of its findings
transfer. The first is a hazard rather than a convention, and it does not announce
itself:

1. **Check the retry loop's shape before adding a second acceptance test.** A
   solver-gated generator that carries state between attempts — keeping the cells
   the solver proved and re-rolling only the rest — is a *hill-climb*, not
   independent sampling. Two consequences. (a) If a rejection can now happen to a
   **completed** candidate, refusing it plainly may re-derive the identical board,
   draw no randomness and **spin for ever**; it must be perturbed. (b) Discarding
   the accumulated state on rejection is the expensive way to perturb: clearing
   Clusters' grid instead of flipping one cell cost 5–7× the median generation
   time, and 20.7 s against 3.7 s at the worst case. Neither shows up in a test
   suite — the first is a hang, the second is only visible if you measure.
2. **Order the gate cheap-rung-first where the tiers nest.** Solving at the tier
   below first, on the candidate itself, is free when the deeper solve resumes
   from that same fixpoint — and it skips the expensive rung entirely on every
   candidate the cheap one finishes. In Clusters that made the generator *faster
   than before it had tiers*, so the honest gate cost less than nothing.
3. **Measure any size or parameter floor; never reason one out.** The guessed
   Clusters floor was 25 squares and the measured one is 12 — a threshold set by
   intuition would have refused seven working board shapes — and **area was not
   even the right predicate**, since a 1×N strip never binds at any length.
4. **Reach for `upstreamLooseGate` before accepting the loss of the byte-match.**
   The task below says to retire it; try the Spokes shape first. Clusters kept its
   oracle in full by making the *original* acceptance check reachable from the
   differential alone. It is worth an attempt here even though a repaired or
   extended solver is a harder case than a changed gate: what the flag has to
   preserve is the old *verdict*, and a solver rung can be held behind the same
   flag as an acceptance rule can.

One wording note, since both changes inherit the phrase: **"a default that
reproduces today's boards" may not exist.** Clusters' old gate accepted the union
of both tiers, so neither tier reproduced it and the default was argued instead —
majority tier, collection convention, and the observation that the choice cannot
change an existing board, only what the next generation produces.

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
