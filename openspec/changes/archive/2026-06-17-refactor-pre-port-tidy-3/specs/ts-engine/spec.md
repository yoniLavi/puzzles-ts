## ADDED Requirements

### Requirement: The engine provides shared keyboard modifier-mask constants

The engine SHALL provide the keyboard modifier-mask constants `MOD_MASK`
(`0x7800`), `MOD_NUM_KEYPAD` (`0x4000`), `MOD_SHFT` (`0x2000`), and `MOD_CTRL`
(`0x1000`) in `src/native/engine/pointer.ts`, matching upstream's `puzzles.h`
modifier bits, plus a `stripModifiers(button: number): number` helper returning
`button & ~MOD_MASK`. These SHALL be plain `const` values (not an enum) for the
same strip-only-TS-loader reason as the button constants. Games that mask
modifier bits off an incoming button SHALL import these instead of redeclaring
the magic numbers locally.

#### Scenario: A game strips modifier bits from a button

- **WHEN** a game's `interpretMove` receives a button with modifier bits set and
  calls `stripModifiers(button)`
- **THEN** the result has the `MOD_MASK` bits cleared and the base button code
  and any unrelated high bits preserved
- **AND** no game file contains a local `MOD_MASK = 0x7800` (or sibling
  `MOD_NUM_KEYPAD`/`MOD_SHFT`/`MOD_CTRL`) declaration

### Requirement: The engine provides a shared dimension param parser

The engine SHALL provide `parseDimensions(s: string, start?: number): { w:
number; h: number; next: number }` in `src/native/engine/params.ts`, built on
`parseLeadingInt`: it reads a width, then an optional `"x"` followed by a height,
falling back to a **square** (`h = w`) when no `"x"` is present; `next` is the
index of the first character after the consumed dimensions. Games whose
`decodeParams` opens with an upstream `WxH`-or-square dimension prefix SHALL use
this instead of re-implementing the parse (whether via a `parseLeadingInt` pair,
a hand-rolled digit loop, or `indexOf("x")` + slice). Each game assigns the
returned `w`/`h` into its own typed params (whose field names may differ) and
continues parsing any trailing suffix from `next`.

#### Scenario: A rectangular param decodes

- **WHEN** a game calls `parseDimensions("10x7")`
- **THEN** it receives `{ w: 10, h: 7, next: 4 }`

#### Scenario: A bare square param decodes via the fallback

- **WHEN** a game calls `parseDimensions("4")` (no `"x"`)
- **THEN** it receives `{ w: 4, h: 4, next: 1 }` — the square fallback, fixing the
  prior `indexOf("x")`-based decoders (sixteen, pegs) that mis-sliced a bare
  square form
- **AND** parsing continues correctly for a trailing suffix (e.g.
  `parseDimensions("4x4m10")` yields `next` pointing at the `"m"`)

## MODIFIED Requirements

### Requirement: The engine provides a shared cursor button-to-delta helper

The engine SHALL provide `cursorDelta(button: number): { dx: number; dy: number }
| null` in `src/native/engine/pointer.ts`, returning the unit grid delta for the
four cursor-direction buttons (`CURSOR_UP` → `{0,−1}`, `CURSOR_DOWN` → `{0,+1}`,
`CURSOR_LEFT` → `{−1,0}`, `CURSOR_RIGHT` → `{+1,0}`) and `null` for any other
button, plus an `isCursorMove(button: number): boolean` predicate (true iff the
button is one of the four cursor-direction keys).

For the common case of an axis-aligned bounded grid, the engine SHALL also
provide `gridCursorMove(button: number, x: number, y: number, w: number, h:
number, wrap?: boolean): { x: number; y: number } | null` in the same module,
returning the new cursor coordinates after applying the button's delta — clamped
to `[0, w) × [0, h)` when `wrap` is false (the default) or wrapped toroidally when
`wrap` is true — or `null` when the button is not a cursor key or the move is a
no-op against a clamped edge. `gridCursorMove` SHALL be **position-only**: it
returns coordinates and never owns or mutates a game's `ui`. The per-game
policy that genuinely varies — which field holds the cursor, `changed`-tracking,
the "first arrow-press only reveals the cursor" idiom, and the
null-vs-`UI_UPDATE` return — SHALL stay in each game. Custom cursor traversal
that is not a simple bounded/toroidal clamp (obstacle-skipping, lock modes,
paint-while-traversing, non-positional rolling cursors) SHALL keep using
`cursorDelta` (or its own logic) locally; only the common bounded-grid clamp is
shared via `gridCursorMove`.

#### Scenario: A cursor key yields its unit delta

- **WHEN** a game calls `cursorDelta(CURSOR_LEFT)`
- **THEN** it receives `{ dx: -1, dy: 0 }`

#### Scenario: A non-cursor button yields null

- **WHEN** a game calls `cursorDelta(LEFT_BUTTON)`
- **THEN** it receives `null`, and the game falls through to its other input
  handling

#### Scenario: A bounded-grid cursor move clamps at the edge

- **WHEN** a game calls `gridCursorMove(CURSOR_LEFT, 0, 3, w, h)` with the cursor
  already at the left edge and `wrap` defaulting to false
- **THEN** it receives `null` (no-op at the clamped edge), and the game makes no
  cursor change
- **AND** the same call one column in (`x = 1`) returns `{ x: 0, y: 3 }`

#### Scenario: A toroidal cursor move wraps

- **WHEN** a toroidal game calls `gridCursorMove(CURSOR_LEFT, 0, 3, w, h, true)`
- **THEN** it receives `{ x: w - 1, y: 3 }`

#### Scenario: A game that reinvented the clamp adopts the helper

- **WHEN** the engine ships `gridCursorMove`
- **THEN** the former local clamp helpers (`fifteen`'s `moveCursorClamped`,
  `sixteen`'s `moveCursor`) are deleted in favour of it
- **AND** no positional-cursor game carries its own bounded/toroidal clamp copy
