# Design: Extract the shared cell-region helpers

A behaviour-preserving consolidation of the "a cell's uniqueness regions" logic that
`extract-candidate-hint-plan` left duplicated three ways per game. Read that change's
archived design first; this builds directly on its `ClassifyRegion` /
`classifyPlacementInRegions`.

## Decisions

### D1 — One per-game `regionsOf`, the single source of truth

Each game writes `regionsOf(state, x, y): ClassifyRegion[]` once — the cells (as
`y*w+x` indices) of every region in which the value at `(x, y)` must be unique, each
tagged with what the game needs to name it. Towers/Unequal/Keen return `[row, col]`;
Solo returns `[row, col, block]` plus the diagonals the cell lies on when `xtype`.
The classifier, the basic-strike opening, and the placement dup-cull all consume it, so
they can never disagree about a cell's regions (a class of bug that can't arise once
there is one definition).

### D2 — `findRegionDuplicate` subsumes both basic-strike variants

`basicLatinStrike` (row+col) and `basicRegionStrike` (row+col+block+diag) are the same
scan over a different region set. With `regionsOf`, they become one shared
`findRegionDuplicate(grid, pencil, regionsOf)`: walk filled cells, gather every empty
cell of any of the placed value's regions that still notes that value, return the first
non-empty firing. The de-dup (a cell reachable via two regions) the Solo version did with
a `Set` moves into the shared helper.

### D3 — Keen's uniqueness regions are row+col, NOT cages

A Keen cage is an *arithmetic* constraint, not a uniqueness region — a digit may repeat
in a cage as long as it doesn't repeat in the row or column. So Keen's `regionsOf` returns
`[row, col]`; the cage logic stays where it is (it is a different kind of deduction). Get
this wrong and the cleanup/strike would remove legal candidates.

### D4 — Behaviour-preserving; the gate is the existing suites

No narration, journey, or move changes. A migration is correct when the per-game hint
suite + `hint-resume.test.ts` pass with no snapshot change. Migrate one game at a time.

## Relationship to other changes

`add-pencil-cleanup-on-markall` needs exactly this `regionsOf` + `findRegionDuplicate`
(its "remove obvious candidates" is `findRegionDuplicate` applied to *every* empty cell).
Land this first, or land them together with this as the foundation.

## Alternatives rejected

- **Bake regions into `state`.** Rejected — the regions are cheap to derive and a stored
  copy is one more thing to keep in sync across `cloneState`/serialisation.
- **One generic `regionsOf` in the engine keyed by game flags.** Rejected — the region
  shapes (jigsaw blocks, X-diagonals, plain Latin) are genuinely per-game; a flags-driven
  mega-function is less readable than a 5-line per-game provider.
