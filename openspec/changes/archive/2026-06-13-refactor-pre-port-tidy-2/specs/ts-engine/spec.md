# ts-engine spec delta — Pre-port tidy #2

## ADDED Requirements

### Requirement: The engine provides a shared recessed-border drawing helper

The engine SHALL provide `drawRecessedBorder(dr, bounds, inset, highlight,
lowlight)` in `src/native/engine/draw.ts`, where `bounds` is the playfield's
outer pixel box (`{ left, top, right, bottom }`, edges inclusive), `inset` is the
bevel depth (the tile size), and `highlight`/`lowlight` are the two palette
colours. It SHALL draw the upstream two-pentagon recessed bevel — a top-right
highlight wedge and a bottom-left lowlight wedge — in one canonical winding.
Games that draw a bevelled frame SHALL call this helper, each supplying its own
edge derivation, instead of re-deriving the polygons locally. Per-game extras
that are not the bevel (e.g. a separator rectangle just outside the grid) SHALL
remain at the call site.

#### Scenario: A bevelled game draws its frame through the helper

- **WHEN** a game with a recessed border (e.g. Fifteen, Sixteen, Twiddle,
  Samegame, Flood) draws its first frame
- **THEN** it calls `drawRecessedBorder` with its computed bounds, tile size, and
  highlight/lowlight colours
- **AND** the two filled pentagons cover the same pixels the game's prior private
  copy did (the lowlight wedge is winding-independent, so traversal order does not
  change the filled region)

### Requirement: The engine provides a shared rectangle-outline drawing helper

The engine SHALL provide `drawRectOutline(dr, x, y, w, h, colour)` in
`src/native/engine/draw.ts`, drawing a 1px-thick rectangle border via four lines
using the upstream-faithful **inclusive** convention (corners `(x,y)` to
`(x+w−1, y+h−1)`), matching upstream `draw_rect_outline`. Games drawing a
rectangle outline (cursor markers, cell borders) SHALL call this helper instead
of carrying a private copy or inlining the four `drawLine` calls.

#### Scenario: A caller draws an inclusive-convention outline

- **WHEN** a game calls `drawRectOutline(dr, x, y, w, h, colour)`
- **THEN** the border spans `(x, y)`..`(x+w−1, y+h−1)` inclusive
- **AND** a caller that previously used an exclusive `x+w` convention adjusts its
  width/height argument so its drawn pixels are unchanged

### Requirement: The engine provides a shared permutation-parity helper

The engine SHALL provide `permParity(perm: Int32Array, n: number): number` in
`src/native/engine/shuffle.ts`, returning the parity (0 or 1) of the number of
inversions in the first `n` entries of `perm` — the idiomatic shared form of the
generator parity check used by sliding-tile puzzles. Per-game parity *correction*
(which entries to swap, and under what condition) SHALL remain local to each
game's generator.

#### Scenario: Parity reflects the inversion count

- **WHEN** a game calls `permParity` on a permutation with an odd number of
  inversions
- **THEN** the result is `1`
- **AND** a permutation with an even number of inversions yields `0`

### Requirement: A game maps its params to type-summary config values via a Game hook

A game with custom parameters SHALL expose its type-summary configuration values
through an optional `describeParams?(p: Params): ConfigValues` member on the
`Game` interface, receiving its own decoded, typed `Params` and returning the
`ConfigValues` record consumed by the app's type-summary formatter. Boolean
config values SHALL be real booleans and choice values SHALL be numeric indices
(never their string renderings), matching upstream `config_values_from_config`
typing. The worker adapter's `decodeCustomParams` SHALL build a generic
`{ width, height }` base from `w`/`h` params and spread the game's
`describeParams` result over it, rather than branching on `puzzleId` in a central
switch. A game whose parameters are exactly `w`/`h` MAY omit the hook.

#### Scenario: A custom-params game surfaces its config through the hook

- **WHEN** the adapter decodes a custom params string for a game implementing
  `describeParams`
- **THEN** the adapter merges the generic width/height base with the game's
  returned config values
- **AND** the resulting `ConfigValues` is value-for-value what the prior central
  switch produced

#### Scenario: Boolean config values keep their type through the hook

- **WHEN** a game's `describeParams` returns a boolean config value (e.g. Guess's
  `allow-blanks`)
- **THEN** the value is a real `boolean`, so the type-summary formatter's
  numeric-index coercion does not NaN it out and the annotation renders
