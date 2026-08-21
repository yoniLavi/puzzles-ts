# ts-engine Specification Delta — bound-abcd-generable-sizes

## ADDED Requirements

### Requirement: Param validation distinguishes generating a board from loading one

The midend SHALL pass `full: true` to `Game.validateParams` only when the params
are about to be used to **generate** a board, and `full: false` when a
description is already in hand. A `<params>#<seed>` game id regenerates and is
therefore validated with `full: true`; a `<params>:<desc>` game id carries its
finished board and SHALL be validated with `full: false`, so a bound that only
generation is subject to — a size whose generator succeeds too rarely to wait
for, a difficulty that no longer produces distinct boards — never retires a game
id that was shared before the bound existed. This mirrors upstream
`midend.c`'s `validate_params(params, desc == NULL)`.

A game MAY express a generation-only bound by gating it on `full`. The engine
SHALL NOT make that gate vacuous by passing a constant.

#### Scenario: A generation-only bound refuses the seed form

- **WHEN** a `<params>#<seed>` id names params outside a game's generation-only
  bound
- **THEN** the midend refuses it with the game's reason, because the board would
  have to be generated

#### Scenario: A generation-only bound does not refuse the descriptive form

- **WHEN** a `<params>:<desc>` id names the same params, with its description
  present
- **THEN** the midend accepts it and the board loads, because nothing is
  generated

#### Scenario: A bound that is not generation-only still applies to both

- **WHEN** params fail a check the game applies regardless of `full`
- **THEN** the midend refuses them on the descriptive form as well as the
  seed form
