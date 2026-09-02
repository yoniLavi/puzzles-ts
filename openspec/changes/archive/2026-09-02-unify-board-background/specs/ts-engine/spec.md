# ts-engine Specification Delta — unify-board-background

One **ADDED** requirement. The existing "full mkhighlight palette helper" and
"shared semantic colour palette" requirements are untouched: `mkhighlight` keeps
its derivation, and the app still supplies pure white in dark mode — what is new
is that the engine shifts it before any game sees it.

## ADDED Requirements

### Requirement: Every game's board sits at one tone

The engine SHALL hand a game's `colours()` a background already shifted off pure
white and pure black by `mkhighlightBackground`, from a single resolution point
(`resolvePalette`) that every consumer of a game's palette — the midend's palette
and dark-value reporting and the render-scenario harness — goes through. The
colour a game paints its board with SHALL therefore resolve to the same value
across the collection for a given host background, whether or not the game's own
`colours()` calls `mkhighlight`.

A game MAY call `mkhighlight` on the background it receives to obtain the bevel
trio; the background it gets back SHALL be identical to the one it was handed.

#### Scenario: A raw-background game and a mkhighlight game paint one board

- **WHEN** a game that assigns the background it receives as its board, and a
  game that assigns `mkhighlight(...).background`, are both resolved against pure
  white
- **THEN** the two board colours are equal

#### Scenario: Every registered game paints the collection's board

- **WHEN** every registered game's palette is resolved against pure white and
  against the light host
- **THEN** the colour at each game's board index equals the shifted host in both
  cases
- **AND** the check counts the games it looked at and fails if the shift did not
  fire

#### Scenario: A game calling mkhighlight is unaffected

- **WHEN** a game's `colours()` calls `mkhighlight` on the background it receives
- **THEN** the trio it obtains equals the trio derived from the unshifted host,
  because the shift is idempotent
