# Tasks: Extract the shared cell-region helpers

> Behaviour-preserving refactor. Gate: per-game hint suites + `hint-resume.test.ts`,
> no snapshot change. Build on `extract-candidate-hint-plan`'s `ClassifyRegion` /
> `classifyPlacementInRegions`.

## 1. Shared helpers (`engine/candidate-hint.ts`)
- [ ] 1.1 Define the per-game region-provider contract `regionsOf(state, x, y):
  ClassifyRegion[]` (document the tag each game attaches for naming).
- [ ] 1.2 `findRegionDuplicate(grid, pencil, regionsOf)` — subsumes `basicLatinStrike` /
  `basicRegionStrike`; de-dup a cell reachable via two regions. Unit test.
- [ ] 1.3 A shared placement dup-cull helper `emitPlacement` calls to compute the marks a
  placement strikes from its regions. Unit test.

## 2. Migrate the games (one at a time, suites green after each)
- [ ] 2.1 Solo — write `regionsOf` (row/col/block/diag); delete `basicRegionStrike` and
  the inline dup-cull; route `soloPlacementReason` through `regionsOf`.
- [ ] 2.2 Keen — `regionsOf` = `[row, col]` (NOT cages, design D3); delete
  `basicLatinStrike` + inline dup-cull.
- [ ] 2.3 Towers, Unequal — `regionsOf` = `[row, col]`; delete `basicLatinStrike` + inline
  dup-cull.

## 3. Close-out
- [ ] 3.1 Full gate green; no differential change (no solver/generator touch); no snapshot
  drift.
- [ ] 3.2 Update `docs/porting/hint-authoring.md` §9 (the basic-strike / placement-cull
  pointers now name `regionsOf` + `findRegionDuplicate`).
- [ ] 3.3 Owner acceptance → commit + archive.
