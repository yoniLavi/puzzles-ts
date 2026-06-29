# Proposal: Extract the shared cell-region helpers (candidate-elimination games)

**Status**: Proposed (follow-up to `extract-candidate-hint-plan`; the highest-leverage of
the four refactors that change left on the table.)

## Why

After `extract-candidate-hint-plan`, three places in each candidate-elimination game still
independently recompute *the uniqueness regions a cell belongs to* (its row, column, and —
for Solo — sub-block and X-diagonals):

1. the `classifyPlacementInRegions` call (re-derive a placement's *why*);
2. the basic-strike opening — `basicLatinStrike` (Keen/Unequal, row+col) /
   `basicRegionStrike` (Solo, row+col+block+diag) — find a placed value still live as a
   pencil duplicate in one of its regions;
3. `emitPlacement`'s dup-cull — strike the just-placed value from the rest of its regions.

All three answer the same question — "what cells share a uniqueness constraint with
`(x, y)`, and which of them still note value `n`?" — and each game spells it out three
times. This is the next real duplication cluster, and the natural unifying abstraction
(a cell's regions) is already implied by `classifyPlacementInRegions`, which takes a region
list. It is also the substrate the `add-pencil-cleanup-on-markall` QoL feature needs.

## What Changes

- **A per-game region provider** — `regionsOf(state, x, y): ClassifyRegion[]` (cells + a
  game tag) — written once per game (Towers/Unequal/Keen: `[row, col]`; Solo:
  `[row, col, block, diag0, diag1]`), the single source of truth for "the cell's
  uniqueness regions."
- **A shared `findRegionDuplicate(grid, pencil, regionsOf)`** in `engine/candidate-hint.ts`
  that subsumes both `basicLatinStrike` and `basicRegionStrike` (scan filled cells, return
  one firing of a placed value still live in one of its regions).
- **A shared placement dup-cull** that `emitPlacement` calls to compute the marks a
  placement strikes from its regions (the row/col vs row/col/block/diag branch disappears).
- **Route `classifyPlacementInRegions` through the same `regionsOf`** so the classifier and
  the strikes can never disagree about a cell's regions.

## Impact

- **Affected specs:** `ts-engine` (ADDED — the shared cell-region helper for
  candidate-elimination games).
- **Affected code:** `src/native/engine/candidate-hint.ts` (+ test); the hint code of
  `keen`, `towers`, `unequal`, `solo` (the three region recomputations collapse to one
  `regionsOf` each). Behaviour-preserving — gated by the per-game hint suites +
  `hint-resume.test.ts`, no snapshot change.
- Pure maintenance-debt paydown + it unblocks `add-pencil-cleanup-on-markall`.

## Out of scope

- The `buildSteps` walk and narration (per-game by design — see `extract-candidate-hint-plan`
  design D2).
- Undead (not a row/col uniqueness game — its candidate model is disjoint).
