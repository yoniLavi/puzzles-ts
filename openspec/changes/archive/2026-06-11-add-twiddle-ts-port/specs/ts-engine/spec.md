## ADDED Requirements

### Requirement: The engine provides shared grid-coordinate helpers

The engine SHALL provide `coord(pos: number, tileSize: number, border: number):
number` and `fromCoord(pixel: number, tileSize: number, border: number): number`
in `src/native/engine/geometry.ts`, implementing the upstream `COORD` /
`FROMCOORD` mapping with the caller supplying the per-game border (most games
use `Math.floor(tileSize / 2)`). `fromCoord` SHALL use `Math.floor((pixel −
border) / tileSize)` directly — correct for pixels in the border region without
the C truncating-division idiom (`+k·tileSize / −k`) that per-game copies carry.
Grid games SHALL import these instead of re-deriving the mapping locally.

#### Scenario: A game maps a pixel inside a cell to that cell

- **WHEN** a game calls `fromCoord(pixel, tileSize, border)` for a pixel that
  lies within cell `c`'s extent
- **THEN** the result is `c`
- **AND** `coord(c, tileSize, border)` returns the cell's top-left pixel

#### Scenario: A border-region click maps to a negative cell index

- **WHEN** `fromCoord` receives a pixel left of the first cell (inside the
  border, `pixel < border`)
- **THEN** it returns a negative index (so the caller's bounds check rejects it),
  matching the upstream macro's intent without the truncation workaround

### Requirement: The engine provides a shared cursor button-to-delta helper

The engine SHALL provide `cursorDelta(button: number): { dx: number; dy: number }
| null` in `src/native/engine/pointer.ts`, returning the unit grid delta for the
four cursor-direction buttons (`CURSOR_UP` → `{0,−1}`, `CURSOR_DOWN` → `{0,+1}`,
`CURSOR_LEFT` → `{−1,0}`, `CURSOR_RIGHT` → `{+1,0}`) and `null` for any other
button. Per-game cursor clamping, bounds, obstacle-skipping, and lock modes
SHALL remain local to each game; only the button→delta mapping is shared.

#### Scenario: A cursor key yields its unit delta

- **WHEN** a game calls `cursorDelta(CURSOR_LEFT)`
- **THEN** it receives `{ dx: -1, dy: 0 }`

#### Scenario: A non-cursor button yields null

- **WHEN** a game calls `cursorDelta(LEFT_BUTTON)`
- **THEN** it receives `null`, and the game falls through to its other input
  handling
