# add-sticks-difficulty-tiers

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

Sticks' author states the gap — *"There are currently no difficulty settings"* —
and unlike Clusters and Subsets, **Sticks has nothing in reserve to expose.** Its
solver has exactly one technique:

> for each blank cell, tentatively place a horizontal line; if the board becomes
> provably invalid, the cell must be vertical (and vice versa)

with `sticksValidate` serving as both constraint checker and deduction oracle. So
there is one implicit tier and no second rung to grade against. Adding difficulty
here means **inventing deductions**, which makes this the largest and least
predictable of the three difficulty changes reopened by
`audit-author-known-issues` §3c after the owner released the byte-match oracle on
2026-08-01.

It is still worth doing: a game with one difficulty is a game with one shape, and
Sticks' `%age of black squares` and `Symmetry` parameters vary the *look* of a
board without varying the thinking it asks for.

## Sequencing (owner decision, 2026-08-01)

**Waits for `retire-c-engine`**, and possibly for a round or two of refactoring
after it, so this lands on a TypeScript-only codebase rather than alongside the
C teardown. Nothing here needs the C build: this game's differential imports a
frozen JSON fixture and keeps working with no C present.

Note the one-way consequence of that order — with no C build there is no
re-baselining a fixture against upstream. Where this change diverges, the fixture
is retired or re-founded on properties, not re-recorded. That is the intended
effect of the released oracle, not an accident of the sequencing.


**Last of the three difficulty-tier changes**, after Clusters and Subsets: it is the only one that has to invent a deduction, so it should inherit a settled pattern for everything else.

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

- **Find the rungs first, in a spike, before committing to the feature.** Sticks
  is Tatebo-Yokobo; published examples and the genre's own literature are where
  the named techniques live (segment-length reachability beyond the current
  `x > 1` / `y > 1` checks, black-cell degree counting, parity and
  region-closure arguments). If the spike finds no rung that is both real and
  narratable, that is a finding that legitimately ends the change — better learned
  in a spike than after building a tier the generator cannot fill.
- **Grade honestly** per `grade-difficulty-tiers-honestly`: a board at a tier is
  not soluble one tier below.
- **Hints follow the rungs.** Sticks ships no `hint()` today; each new named
  technique is a candidate explanation, and the Palisade bar applies to any that
  ship. Whether the hint lands here or in a follow-up is a scoping call for the
  design.
- **Re-found the assurance** — a stronger solver retires the desc byte-match;
  replace with uniquely-solvable-at-exactly-its-tier.

## Impact

- Affected specs: `sticks`.
- Affected code: `src/games/sticks/{solver,generator,state,index}.ts`.
- **Every Sticks board changes** once the solver gains a rung.
- Sequencing: do this **after** `add-clusters-difficulty-tiers`, which establishes
  the params/presets/ID/differential pattern on a game where no deduction has to
  be invented. Sticks should only have to solve the hard half.
