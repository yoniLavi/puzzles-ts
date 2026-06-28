# Tasks: Adaptive mark-all (fill, then clean obvious)

> Depends on `extract-cell-region-helpers` (`regionsOf` / region-duplicate scan). Confirm
> the D2 oscillation choice with the owner before implementing.

## 1. Shared cleanup
- [ ] 1.1 A whole-board "obvious candidates" computation: for every empty cell, the
  pencilled values equal to a placed value in one of its `regionsOf` regions (reuse
  `findRegionDuplicate`'s region scan over all cells). Returns `pencilStrike` marks.
- [ ] 1.2 The adaptive trigger (D1): fill if any empty cell lacks any candidate, else emit
  the cleanup `pencilStrike`. Marks baked at `interpretMove` time (deterministic replay).

## 2. Per-game wiring
- [ ] 2.1 Route each pencil-mark game's `M`/`m` handling through the adaptive trigger:
  Solo (row/col/block/diag), Keen (row/col only — design D3), Towers, Unequal (row/col).
- [ ] 2.2 Confirm Undead (and any non-Latin-uniqueness game) keeps fill-only.

## 3. Tests + close-out
- [ ] 3.1 Move/scenario tests: fully-noted board → press strikes exactly the region
  duplicates; partial board → fills; Keen cage-only duplicate is NOT struck; Undead fills;
  replaying the emitted `pencilStrike` reproduces the cleaned board.
- [ ] 3.2 Update `docs/porting/hint-authoring.md` / playbook pencil-mark-games note with the
  adaptive mark-all behaviour.
- [ ] 3.3 Full gate green → owner acceptance (dev-server spot-check per game) → commit +
  archive.
