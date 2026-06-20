# Tasks: Add a "fill all pencil marks" toolbar button

## 1. Engine capability
- [x] 1.1 Add `readonly canMarkAll?: boolean` to the `Game` interface
      (`game.ts`) with a doc comment tying it to the `M`-key mark-all move.
- [x] 1.2 `Midend.getStaticProperties`: emit `canMarkAll: game.canMarkAll ?? false`.
- [x] 1.3 `PuzzleStaticAttributes` (`types.ts`): add `canMarkAll: boolean`.
- [x] 1.4 C/WASM `getStaticProperties` (`worker.ts`): `canMarkAll: false`.
- [x] 1.5 `Puzzle` (`puzzle.ts`): destructure + expose `readonly canMarkAll`.
- [x] 1.6 Towers (`towers/index.ts`): set `canMarkAll: true`.

## 2. Toolbar button
- [x] 2.1 Register a `mark-all` icon (`src/icons.ts`, Lucide `grid-3x3`).
- [x] 2.2 `puzzle-history.ts`: render an icon button in the `wa-button-group`,
      gated on `puzzle.canMarkAll`, click → `puzzle.processKey(77)` ('M').

## 3. Tests + verification
- [x] 3.1 Midend test: `canMarkAll` reflects the game flag (true for a game that
      sets it, false otherwise), mirroring the `canHint`/`canFindMistakes` tests.
- [x] 3.2 Full gate green (tsc → biome → vitest → vite build).
- [x] 3.3 Dev-verify in the browser on Towers: button shows, click fills all
      pencil candidates; absent on a non-pencil game (e.g. Galaxies).

## 4. Spec + close-out
- [x] 4.1 `openspec validate add-mark-all-button --strict`.
- [ ] 4.2 Owner acceptance, then archive in the same commit.
