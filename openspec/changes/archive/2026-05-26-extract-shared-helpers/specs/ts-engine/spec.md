## ADDED Requirements

### Requirement: The engine provides a shared colour-mkhighlight helper

The engine SHALL provide `mkhighlightBackground(bg: Colour): Colour` in `src/native/engine/colour-mkhighlight.ts`, implementing the `misc.c` `game_mkhighlight_specific` background-adjustment logic with the near-white epsilon fix. Every white/black-tile game SHALL be able to import and use this instead of re-deriving it locally.

#### Scenario: A game imports the shared mkhighlightBackground

- **WHEN** a game's `colours()` method receives a default background that is near-white
- **THEN** `mkhighlightBackground` shifts the background away from pure white so that a pure-white tile colour is visibly brighter
- **AND** the game does not contain a local copy of the highlight logic

### Requirement: The engine provides shared pointer button constants and action categorisation

The engine SHALL provide button code constants (`LEFT_BUTTON`, `RIGHT_BUTTON`, `RIGHT_DRAG`, `RIGHT_RELEASE`, cursor keys, etc.) in `src/native/engine/pointer.ts`, matching the values in `src/puzzle/types.ts` `PuzzleButton`. These SHALL be plain `const` values (not an enum) so advisory diff scripts can import them under Node's strip-only TS loader. The engine SHALL also provide a `PointerAction` discriminated union type and a `parsePointerAction(button: number): PointerAction` function that categorises a raw button number into a typed action.

#### Scenario: A game imports shared button constants

- **WHEN** a game's `interpretMove` function receives a button number
- **THEN** it compares against the shared constants from `pointer.ts` instead of locally-declared values
- **AND** no game file contains duplicate button code declarations

#### Scenario: A game uses PointerAction categorisation

- **WHEN** a game calls `parsePointerAction(button)`
- **THEN** it receives a discriminated union with `type: "press" | "drag" | "release" | "cursor"`
- **AND** the compiler tracks unhandled action types

### Requirement: The engine provides a shared disjoint-set forest (dsf)

The engine SHALL provide the `Dsf` class in `src/native/engine/dsf.ts`, promoted from the Galaxies local implementation. The class SHALL support `constructor(n)`, `reinit()`, `canonify(i)`, and `merge(a, b)` with path compression and union-by-size. Games that need union-find SHALL import from this shared location.

#### Scenario: A game imports the shared Dsf

- **WHEN** a game needs disjoint-set operations
- **THEN** it imports `Dsf` from `src/native/engine/dsf.ts`
- **AND** no game directory contains a local `dsf.ts`
