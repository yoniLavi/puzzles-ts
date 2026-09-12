## MODIFIED Requirements

### Requirement: Magnets game implements the Game interface

The engine SHALL provide a registered `magnets` game implementing
`Game<MagnetsParams, MagnetsState, MagnetsMove, MagnetsUi, MagnetsDrawState, MagnetsMistake>`:
fill a `w × h` grid of pre-laid 2×1 dominoes so that each domino is either a
magnet (one `+` cell and one `−` cell) or neutral (both cells blank), no two
orthogonally-adjacent cells share a polarity, and each row and column contains
exactly its clue count of `+` and of `−` cells. Some dominoes MAY be fixed
singleton squares that are permanently neutral. Params SHALL be `w`, `h`,
`diff` (Easy / Normal) and `stripclues` (boolean), encoded `{w}x{h}` with a
full-form `d{e|t}` difficulty suffix and an `S` strip-clues suffix (square
shorthand `{n}`). All 8 upstream presets SHALL be offered. `validateParams`
SHALL enforce `w ≥ 2`, `h ≥ 2`, a per-difficulty minimum size (Easy: `w ≥ 3`
or `h ≥ 3`; Normal: `w ≥ 5` or `h ≥ 5`) and the area bound. The game SHALL
report `canSolve = true` and `canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 10, h: 9, diff: DIFF_TRICKY, stripclues: true }` (the
  Normal tier) are encoded in full
- **THEN** the result is `10x9dtS` and decoding it round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a 4×4 grid at Normal difficulty
- **THEN** it returns a non-null error string (Normal needs a side ≥ 5)
