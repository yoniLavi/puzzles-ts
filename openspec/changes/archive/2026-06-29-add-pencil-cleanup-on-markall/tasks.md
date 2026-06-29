# Tasks: Adaptive mark-all (fill, then clean obvious)

> Depends on `extract-cell-region-helpers` (`regionsOf` / region-duplicate scan).
> Oscillation resolved (D2, owner-confirmed): idempotent clean decided from the placed
> grid, NO toggle. Fill triggers only on note-less cells.

## 1. Shared cleanup
- [x] 1.1 A whole-board "obvious candidates" computation (`obviousCandidateMarks` in
  `engine/candidate-hint.ts`): for every empty cell, the pencilled values equal to a placed
  value in one of its `regionsOf` regions. Returns `pencilStrike` marks. Unit-tested.
- [x] 1.2 The adaptive trigger (D1, `adaptiveMarkAllMove`): fill note-less cells (all
  candidates) if any empty cell has zero notes, else emit the cleanup `pencilStrike`
  (idempotent; never empties a cell's last note → returns `null` when nothing to fill or
  strike, so a no-op press adds no undo entry). Marks baked at `interpretMove` time.

## 2. Per-game wiring
- [x] 2.1 Route each pencil-mark game's `M`/`m` handling through the adaptive trigger:
  Solo (row/col/block/diag via its `regionsOf`), Keen (row/col only — design D3), Towers,
  Unequal (row/col via `rowColRegions`).
- [x] 2.2 Confirm Undead keeps fill-only — it uses its own `markAll` move (monster fill),
  is not a row/col-uniqueness game, and is untouched.

## 3. Tests + close-out
- [x] 3.1 Move/scenario tests: engine unit tests (`obviousCandidateMarks` /
  `adaptiveMarkAllMove`: fills, strikes-obvious, guard, idempotent no-op) + Keen
  integration tests driving `interpretMove` (fill → clean → no-op sequence; cage-only
  duplicate NOT struck). `executeMove(pencilStrike)` already idempotent (replay-exact).
- [x] 3.2 Update `docs/porting/hint-authoring.md` / playbook pencil-mark-games note with the
  adaptive mark-all behaviour.
- [x] 3.3 Full gate green → owner acceptance (dev-server spot-check per game) → commit +
  archive. (Dev-verified on Keen via Playwright: fill → clean strikes only the placed
  value's row/column, cages untouched, no-op third press; 0 console errors.)
