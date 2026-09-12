## MODIFIED Requirements

### Requirement: Tents game implements the Game interface

The engine SHALL provide a registered `tents` game implementing
`Game<TentsParams, TentsState, TentsMove, TentsUi, TentsDrawState, TentsMistake>`:
place tents on a `w × h` grid of fixed trees so that each tent is
orthogonally adjacent to a tree in a one-to-one tree↔tent matching, no two
tents are even diagonally adjacent, and each row/column contains exactly its
edge-clue number of tents. Params SHALL be `w`, `h` and `diff`
(Easy / Normal), encoded `{w}x{h}d{e|t}` (short form `{w}x{h}`, square
shorthand `{n}`). All 6 upstream presets (8×8, 10×10, 15×15 × Easy/Normal)
SHALL be offered. `validateParams` SHALL enforce minimum size 4×4. The game
SHALL report `canSolve = true` and `canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 15, h: 15, diff: DIFF_TRICKY }` (the Normal tier) are encoded in full
- **THEN** the result is `15x15dt` and decoding it round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a grid smaller than 4×4
- **THEN** it returns a non-null error string
