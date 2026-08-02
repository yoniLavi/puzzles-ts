# ts-engine Specification Delta — group-crowded-source-directories

> Path corrections only. `colour-mkhighlight.ts` moves into `src/engine/colour/`
> with the rest of the colour family. Both requirements are restated because
> each names the file; neither guarantee changes.

## MODIFIED Requirements

### Requirement: The engine provides a shared colour-mkhighlight helper

The engine SHALL provide `mkhighlightBackground(bg: Colour): Colour` in `src/engine/colour/colour-mkhighlight.ts`, implementing the `misc.c` `game_mkhighlight_specific` background-adjustment logic with the near-white epsilon fix. Every white/black-tile game SHALL be able to import and use this instead of re-deriving it locally.

#### Scenario: A game imports the shared mkhighlightBackground

- **WHEN** a game's `colours()` method receives a default background that is near-white
- **THEN** `mkhighlightBackground` shifts the background away from pure white so that a pure-white tile colour is visibly brighter
- **AND** the game does not contain a local copy of the highlight logic

### Requirement: The engine provides a full mkhighlight palette helper

The engine SHALL provide `mkhighlight(bg: Colour): { background: Colour; highlight: Colour; lowlight: Colour }` in `src/engine/colour/colour-mkhighlight.ts`, implementing the full `misc.c` `game_mkhighlight` derivation: the background is adjusted via `mkhighlightBackground`, then the highlight is shifted from the adjusted background toward white by K = sqrt(3)/6 and the lowlight toward black by K. Per upstream, when the background is within K of white the highlight SHALL saturate to pure white, and when within K of black the lowlight SHALL saturate to pure black. Games needing the standard bg/highlight/lowlight trio SHALL destructure this helper instead of re-deriving the colours locally.

#### Scenario: A game derives its palette from the shared helper

- **WHEN** a game's `colours()` method calls `mkhighlight(defaultBackground)`
- **THEN** it receives background, highlight, and lowlight colours matching upstream `game_mkhighlight`, with the highlight strictly brighter and the lowlight strictly darker than the background
- **AND** the game contains no local copy of the highlight/lowlight math

#### Scenario: Light host backgrounds get a pure-white highlight

- **WHEN** the host background is white or near-white
- **THEN** the highlight saturates to pure white instead of collapsing into the adjusted background (the defect the previous per-game inline copies had)
