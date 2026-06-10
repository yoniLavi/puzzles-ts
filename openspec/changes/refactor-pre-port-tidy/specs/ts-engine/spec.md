## ADDED Requirements

### Requirement: The engine provides a full mkhighlight palette helper

The engine SHALL provide `mkhighlight(bg: Colour): { background: Colour; highlight: Colour; lowlight: Colour }` in `src/native/engine/colour-mkhighlight.ts`, implementing the full `misc.c` `game_mkhighlight` derivation: the background is adjusted via `mkhighlightBackground`, then the highlight is shifted from the adjusted background toward white by K = sqrt(3)/6 and the lowlight toward black by K. Per upstream, when the background is within K of white the highlight SHALL saturate to pure white, and when within K of black the lowlight SHALL saturate to pure black. Games needing the standard bg/highlight/lowlight trio SHALL destructure this helper instead of re-deriving the colours locally.

#### Scenario: A game derives its palette from the shared helper

- **WHEN** a game's `colours()` method calls `mkhighlight(defaultBackground)`
- **THEN** it receives background, highlight, and lowlight colours matching upstream `game_mkhighlight`, with the highlight strictly brighter and the lowlight strictly darker than the background
- **AND** the game contains no local copy of the highlight/lowlight math

#### Scenario: Light host backgrounds get a pure-white highlight

- **WHEN** the host background is white or near-white
- **THEN** the highlight saturates to pure white instead of collapsing into the adjusted background (the defect the previous per-game inline copies had)

### Requirement: The engine provides a shared leading-integer param parser

The engine SHALL provide `parseLeadingInt(s: string, start: number): { value: number; next: number }` in `src/native/engine/params.ts`, returning the integer formed by the maximal digit run starting at `start` (0 when the run is empty) and the index of the first non-digit character. Games whose `decodeParams` walks an upstream-format param string SHALL import this instead of declaring a local copy.

#### Scenario: A game decodes a WxH param string

- **WHEN** a game's `decodeParams` parses `"10x7"` using `parseLeadingInt`
- **THEN** the first call returns `{ value: 10, next: 2 }` and a second call starting after the `"x"` returns `{ value: 7, next: 5 }`
- **AND** no game file contains a duplicate `parseLeadingInt` declaration

## RENAMED Requirements

- FROM: `### Requirement: The engine provides shared pointer button constants and action categorisation`
- TO: `### Requirement: The engine provides shared pointer button constants`

## MODIFIED Requirements

### Requirement: The engine provides shared pointer button constants

The engine SHALL provide button code constants (`LEFT_BUTTON`, `RIGHT_BUTTON`, `RIGHT_DRAG`, `RIGHT_RELEASE`, cursor keys, etc.) in `src/native/engine/pointer.ts`, matching the values in `src/puzzle/types.ts` `PuzzleButton`. These SHALL be plain `const` values (not an enum) so advisory diff scripts can import them under Node's strip-only TS loader.

#### Scenario: A game imports shared button constants

- **WHEN** a game's `interpretMove` function receives a button number
- **THEN** it compares against the shared constants from `pointer.ts` instead of locally-declared values
- **AND** no game file contains duplicate button code declarations

## REMOVED Requirements

### Requirement: The Sixteen port implements heuristic hints and rendering

**Reason**: Game-specific requirement; migrated verbatim to the new `sixteen` capability spec so `ts-engine` carries only cross-game requirements (matching the flip/galaxies per-game-capability precedent).
**Migration**: Moved unchanged to `specs/sixteen/spec.md` in this change.

### Requirement: The Sixteen port supports direct row and column dragging

**Reason**: Game-specific requirement; migrated verbatim to the new `sixteen` capability spec.
**Migration**: Moved unchanged to `specs/sixteen/spec.md` in this change.
