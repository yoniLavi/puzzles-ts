# ts-engine Specification Delta — refine-slide-appearance

## ADDED Requirements

### Requirement: A dark-scheme palette swap keeps its bevel lit from one side

For every bevel trio a game exchanges via `paletteSwaps`, the highlight SHALL be
lighter than the surface it sits on and the lowlight darker, **in both schemes**.

`paletteSwaps` exists because inverting every colour's lightness turns an emboss
into an inset. It is hand-maintained and keyed by raw colour index, so a wrong
pair leaves every colour present, every test green, and one game lit from the
wrong side in one scheme only.

The requirement above is a relationship to that *surface* and not to the board, so
a measurement of a swapped index against the background does not state it and MUST
NOT be read as though it did: the two indices of a pair denote different roles in
the two schemes, so such a measurement compares a highlight with a lowlight.

#### Scenario: A bevel survives the scheme flip

- **WHEN** a game's bevel trio is resolved for the light scheme and for the dark
  scheme
- **THEN** in each scheme its highlight is lighter than its base and its lowlight
  is darker

#### Scenario: A swap names two distinct colours

- **WHEN** a game declares a `paletteSwaps` pair
- **THEN** both indices exist in that game's palette, they differ in lightness,
  and no index is named by more than one pair
