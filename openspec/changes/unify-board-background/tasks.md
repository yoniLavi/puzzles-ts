# unify-board-background — tasks

## 1. Measure

- [x] 1.1 Resolve Loopy's, Palisade's and Separate's palettes through the app's
      pipeline in both schemes and identify the difference (the board index
      only; the flash as a consequence). Recorded in `design.md`.
- [x] 1.2 Census all 57 games' background derivation (22 raw / 30 `mkhighlight`
      / 1 shift-only / 3 dual / 1 token). Recorded in `design.md`.
- [x] 1.3 Verify `mkhighlightBackground` is exactly idempotent on pure white
      before relying on it.

## 2. Implement

- [x] 2.1 `resolvePalette(game, host)` in `colour-mkhighlight.ts`; `Midend`'s
      `getColourPalette` and `darkPalette`, the render-scenario harness and
      `dark-palette.test.ts` go through it.
- [x] 2.2 `board-background.test.ts`: every registered game paints the shifted
      host at its `paletteBgIndex`, on a white and on the light host, with the
      57-game count and a vacuity check on the shift. Seen red with the shift
      bypassed before trusting it green.
- [x] 2.3 Correct the record: `palette.ts`, `palette-games.ts`, `view.ts`,
      Loopy/Netslide/Spokes/Rome comments, `docs/games/rendering.md` ("Every
      board is one tone"; "Dark mode is the app's concern" now points at
      authoring a role's dark value).
- [x] 2.4 Spec delta: `ts-engine` ADDED "Every game's board sits at one tone".

## 3. Verify

- [x] 3.1 Colour, puzzle and the affected games' suites green; render
      snapshots byte-identical (light host is outside the shift's reach).
- [x] 3.2 Chrome, dark mode: Loopy and Palisade boards match; Loopy's flash
      visible; a raw-background game with a dark override (Solo, Light Up)
      still reads; ABCD's margin and board one tone.
- [ ] 3.3 Owner acceptance of the dark-mode change on the 22 raw-background
      games and the three dual-background games.
