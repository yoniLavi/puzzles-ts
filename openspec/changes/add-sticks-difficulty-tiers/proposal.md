# add-sticks-difficulty-tiers

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
- Affected code: `src/native/games/sticks/{solver,generator,state,index}.ts`.
- **Every Sticks board changes** once the solver gains a rung.
- Sequencing: do this **after** `add-clusters-difficulty-tiers`, which establishes
  the params/presets/ID/differential pattern on a game where no deduction has to
  be invented. Sticks should only have to solve the hard half.
