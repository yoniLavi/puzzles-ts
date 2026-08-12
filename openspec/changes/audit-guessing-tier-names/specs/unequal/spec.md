# unequal Specification Delta — audit-guessing-tier-names

Unequal's top tier is renamed `Recursive` → `Unreasonable` (design D7). It is a
genuine recursion tier — it branches and backtracks, a **Search** under design D9
— and `Unreasonable` is the collection's only tier word with a stable meaning
(nine games use it, and in every one it is the last tier). The difficulty
character `r` is unchanged, so game IDs, saved games and shared links are
unaffected, and no board moves.

The custom-params dialog **hand-copied** the tier list rather than reading
`DIFF_NAMES`, so a rename could have shipped a menu and a dialog that disagreed;
it now reads the one list.

## MODIFIED Requirements

### Requirement: Unequal game implements the Game interface

The engine SHALL provide a registered `unequal` game implementing
`Game<UnequalParams, UnequalState, UnequalMove, UnequalUi, UnequalDrawState,
UnequalMistake>`: a Latin-square puzzle on an `order × order` grid in which the
player places a number `1..order` in every cell so each row and column contains
every number exactly once, subject to clues between orthogonally adjacent cells.
The game SHALL support two modes: **Unequal** (greater-than signs, `a > b`) and
**Adjacent** (a bar means the two numbers differ by exactly 1, and the absence of
a bar between two cells means they do not). Params SHALL be `order`, `mode`
(Unequal or Adjacent), and `diff` (Trivial, Easy, Tricky, Extreme, or
`Unreasonable`), encoded `{order}` with an `a` suffix for Adjacent mode and a
`d{c}` suffix for difficulty when full (`c` = `t`/`e`/`k`/`x`/`r`), with the
upstream preset list. The top tier is named `Unreasonable` rather than upstream's
`Recursive` because it branches and backtracks, which is the one thing the
collection reserves that name for; its difficulty character stays `r`, so an
existing game ID names the same board. The tier names SHALL have a single
definition in the game, read by both the preset menu and the custom-params
dialog, so the two cannot disagree. `validateParams` SHALL require
`3 ≤ order ≤ 32`, a known difficulty, and `order ≥ 5` for Adjacent puzzles of
Tricky difficulty or harder. The game SHALL report `wantsStatusbar = false`,
`isTimed = false`, `canSolve = true`, `canFormatAsText = true`, and
`canMarkAll = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ order: 5, mode: "adjacent", diff: "tricky" }` are encoded
  with `full = true`
- **THEN** the result is `5adk`
- **AND** decoding it round-trips the params
- **AND** encoding with `full = false` yields `5a`

#### Scenario: The renamed top tier keeps its difficulty character

- **WHEN** params at the top tier are encoded with `full = true`
- **THEN** the difficulty suffix is still `dr`

#### Scenario: The menu and the custom dialog offer the same tiers

- **WHEN** the tier names the preset menu shows are compared with the choices the
  custom-params difficulty field offers
- **THEN** they are the same list

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `order < 3`, an unknown difficulty, or
  an Adjacent puzzle below order 5 at Tricky or harder
- **THEN** it returns a non-null error string
