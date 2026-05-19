# ts-engine spec delta

## MODIFIED Requirements

### Requirement: The midend repaints on every transition and drives animation

The TS midend SHALL cause the canvas to repaint after every state
transition it processes — moves, undo, redo, solve, restart, load,
and UI-only updates — mirroring the C frontend, which redraws after
every processed input. A transition that changes what is displayed
SHALL NOT leave the canvas stale.

For games that animate, the midend SHALL drive the animation/flash
timer to parity with `midend.c`: it SHALL obtain the animation and
flash durations from the game, run the timer while either an
animation/flash is in progress or a timed-clock game is running, paint
each animation frame, and settle to a final clean paint when the
animation completes. A non-animated transition SHALL paint once;
animation frames (including the first) SHALL be driven by the timer
rather than by an extra synchronous paint that would race the timer.

**Background-fill / fresh-drawstate parity with `midend_size` and
`midend_force_redraw`:** the midend SHALL also reproduce upstream's
"first draw" contract that gives a game a clean canvas after the
backing store has been invalidated. Specifically:

- `Midend.size()` SHALL, when a drawstate has already been sized,
  discard it and construct a fresh one from the current state via
  `game.newDrawState`, apply `setTileSize` to that new drawstate, and
  arm a first-draw flag. This mirrors `midend_size`'s
  free-drawstate-and-recreate / `first_draw = true` step (see
  `puzzles/midend.c`).
- `Midend.redraw(dr)` SHALL, while the first-draw flag is armed, fill
  the entire window with the game's background colour (palette index
  0) **before** calling `game.redraw`, and SHALL emit a full-window
  `drawUpdate` **after** the game's redraw completes. The flag SHALL
  be cleared by the redraw it covers.
- The midend SHALL expose `forceRedraw(dr)` that performs the
  drawstate recreation, arms the first-draw flag, and runs a redraw —
  mirroring `midend_force_redraw`. The worker adapter SHALL call this
  when an already-installed palette or font is replaced (those
  invalidate any per-tile cache the game holds), matching the
  C-path's `frontend.forceRedraw()` invocations from
  `setDrawingPalette` / `setDrawingFontInfo`.

A startup invariant: the first-draw flag SHALL be armed by default so
the very first `redraw` after game/canvas setup paints a clean
background — independently of whether the per-game `redraw` itself
paints the border / margin area.

#### Scenario: A processed move repaints

- **WHEN** the midend processes a move, undo, redo, solve, restart,
  load, or UI-only update
- **THEN** a repaint of the canvas is requested for that transition
- **AND** the displayed board reflects the new state without requiring
  any further external redraw call

#### Scenario: An animated move is driven by the timer to completion

- **WHEN** a move on an animating game is processed
- **THEN** the midend arms the animation/flash timer and the canvas is
  repainted on each timer tick through the animation
- **AND** when the animation and flash complete the midend settles
  with a final paint of the resting state and releases the timer

#### Scenario: A non-rendering port is not at parity

- **WHEN** a TS port processes input correctly but the midend does not
  repaint (the game appears frozen)
- **THEN** this is a parity regression, not a cosmetic deferral
- **AND** the game is not eligible for parity registration until it
  repaints and animates to parity with the C build

#### Scenario: A reshape that picks the same tile size still repaints from scratch

- **WHEN** the app calls `size()` after a previous successful `size()`
  call — for example because the user switched to a new board shape
  whose pixel size differs from before, but the per-tile size resolves
  to the same value as the previous game
- **THEN** the midend discards the existing drawstate, constructs a
  fresh one from the new game's initial state, and arms first-draw
- **AND** the next `redraw(dr)` fills the entire window with palette
  index 0 before delegating to `game.redraw`, so the canvas is not
  left in whatever state `Drawing.resize` (which clears to opaque
  black under `{alpha:false}`) left it

#### Scenario: A palette change after first install repaints from scratch

- **WHEN** the worker adapter receives a `setDrawingPalette` call that
  replaces an already-installed palette (e.g. the user toggles
  light/dark mode)
- **THEN** the adapter calls `engine.forceRedraw(dr)` rather than the
  plain `engine.redraw(dr)`
- **AND** the redraw fills the window with the new palette's index 0
  before the game's own `redraw` runs, so any per-tile cache the game
  holds against the old palette is invalidated and the canvas is
  repainted cleanly
