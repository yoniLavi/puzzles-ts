# Tasks: Extract the shared cell-region helpers

> Behaviour-preserving refactor. Gate: per-game hint suites + `hint-resume.test.ts`,
> no snapshot change. Build on `extract-candidate-hint-plan`'s `ClassifyRegion` /
> `classifyPlacementInRegions`.

## 1. Shared helpers (`engine/candidate-hint.ts`)
- [x] 1.1 Define the per-game region-provider contract `regionsOf(state, x, y):
  ClassifyRegion[]` (document the tag each game attaches for naming). Row/col games
  share `rowColRegions(x, y, w)` in `latin-hint.ts`; Solo writes its own `regionsOf`.
- [x] 1.2 `findRegionDuplicate(grid, pencil, w, regionsOf)` — subsumes `basicLatinStrike` /
  `basicRegionStrike`; de-dup a cell reachable via two regions. Unit test.
- [x] 1.3 A shared placement dup-cull helper `regionDuplicateMarks` `emitPlacement` calls
  to compute the marks a placement strikes from its regions. Unit test.

## 2. Migrate the games (one at a time, suites green after each)
- [x] 2.1 Solo — write `regionsOf` (row/col/block/diag); delete `basicRegionStrike` and
  the inline dup-cull; route `soloPlacementReason` through `regionsOf`.
- [x] 2.2 Keen — `regionsOf` = `[row, col]` (NOT cages, design D3); delete
  `basicLatinStrike` + inline dup-cull.
- [x] 2.3 Towers, Unequal — `regionsOf` = `[row, col]`; delete `basicLatinStrike` (Towers
  had no givens → dup-cull only) + inline dup-cull.

## 3. Close-out
- [x] 3.1 Full gate green; no differential change (no solver/generator touch); no snapshot
  drift. (293 tests across the four games + engine hint modules; tsc clean.)
- [x] 3.2 Update `docs/porting/hint-authoring.md` §9 (the basic-strike / placement-cull
  pointers now name `regionsOf` + `findRegionDuplicate`).
- [x] 3.3 Owner acceptance → commit + archive.
