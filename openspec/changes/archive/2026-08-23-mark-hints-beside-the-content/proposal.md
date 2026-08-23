# Change: a hint marks beside the content, never behind it

## Why

`walk-tactic-hint-chains` established, by measurement, that a hint fill behind a
digit cannot work: `HINT_FILL` scores **1.91:1** against a pencil mark in light
and **1.96:1** in dark, and no colour in the palette fixes it — the pale end
holds one cool wash, and the only hues clearing ~2.6:1 sit next to `ERROR_WASH`,
which would make the cell a hint points at look like the cell that is *wrong*.

Keen is the exemplar: the target is **ringed** and the evidence region
**outlined**, both in the grid gutter, so neither touches the content and both
take a strong colour. Six games still fill a target, and the candidate games
still wash evidence under pencil marks.

## What Changes

- **The six remaining fills become rings**: group, solo, undead, unequal,
  towers, filling.
- **Evidence over content becomes an outline** in the candidate games. Evidence
  over *empty* cells stays a wash — `docs/games/hints.md` § "Shade vs ring"
  already discriminates on "would the fill hide the premise?", and this change
  only widens *hide* to include "by contrast". Each game's call is recorded.
- **A wash that no longer carries content can be bright again.** Where evidence
  stays a wash it goes back to `TEAL_WASH`; if no game washes evidence under
  content afterwards, `TEAL_WASH_DEEP` has no remaining reason and is retired
  with the last consumer.
- **One role, not two that agree.** Keen's outline and its chain ordinal arrive
  at `TEAL_BOLD` by separate routes, which is the coincidence `palette.ts`
  exists to prevent; they become a single role.
- **The guard moves cross-game.** Keen's shape assertions (four thin rects and
  none solid; `2w + 2` sides for a `w`-cell contour) become one guard over the
  `hint-games.ts` enrolment, so a game that fills instead of ringing fails.

## Impact

- Affected specs: `ts-engine` (a new requirement on how a hint marks).
- Affected code: seven games' `render.ts`, `engine/colour/palette.ts`, and a new
  cross-game guard beside `hint-ordinal.test.ts`.
- **No solver, generator or narration change**, so no board moves and no
  differential is touched: marks and colours only.
- Player-visible in every hinting game, in both schemes — the acceptance pass is
  a browser check per game rather than a green suite.
