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

**The engine emits no pixels of its own.** `Midend.redraw(dr)`
SHALL delegate the entire frame to `game.redraw` (between
`startDraw`/`endDraw`). It SHALL NOT emit a background-fill rectangle,
a clear, or any other paint operation that overwrites what the game
last drew. Background and one-time setup (grid lines, board border,
fixed-position artwork) SHALL be the game's responsibility, painted
in its `!ds.started` branch and re-fired on a fresh drawstate.

**Canvas-cleared / cache-stale signals.** The engine SHALL expose:

- `Midend.size(maxSize, isUserSize, dpr): Size` — **purely
  informational**. It SHALL compute and return the puzzle's preferred
  pixel size at the resolved tile size and SHALL inform the game via
  `setTileSize`, but SHALL NOT recreate the drawstate, invalidate any
  per-tile cache, or schedule any framework-emitted overpaint. The
  frontend may call `size()` on every layout perturbation (any
  element-size change goes through it via `puzzle-view.ts`'s
  `ResizeController`); a side-effecting call here would wipe caches
  at unrelated moments and cause spurious full repaints.

- `Midend.canvasCleared()` — the signal that the canvas backing
  store has been reset by `Drawing.resize` (`alpha:false` clears to
  opaque black on every `canvas.width=` write). The midend SHALL
  discard the per-game drawstate and construct a fresh one via
  `game.newDrawState`, applying `setTileSize`. The next `redraw`
  SHALL therefore see `!ds.started` and the game SHALL paint from
  scratch, including its own background. The worker adapter SHALL
  invoke this from `resizeDrawing` immediately after `Drawing.resize`.

- `Midend.forceRedraw(dr)` — palette or font replacement does not
  clear the canvas but invalidates the colour/font choices baked
  into cached tiles. `forceRedraw` SHALL discard the drawstate (the
  same effect as `canvasCleared`) and immediately call `redraw(dr)`;
  the game's `!ds.started` branch paints a fresh frame over the
  old pixels, in the new palette/font. The worker adapter SHALL
  invoke `forceRedraw` when `setDrawingPalette` or
  `setDrawingFontInfo` replaces an already-installed value.

A startup invariant: a drawstate created by `startFrom` (newGame /
newGameFromId / loadGame) SHALL have `started=false` (or its
per-game equivalent), so the first `redraw` after a new game paints
the bg + one-time setup via the game's first-paint branch.

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

#### Scenario: `Midend.size` is purely informational

- **WHEN** the frontend calls `size()` repeatedly (e.g. on every
  ResizeController tick, including ones with no actual canvas-size
  change)
- **THEN** the midend computes and returns the preferred pixel size
  but DOES NOT recreate the drawstate, change drawstate identity, or
  cause the next `redraw` to emit a background fill
- **AND** the per-tile cache the game holds survives unchanged

#### Scenario: A real canvas clear invalidates the drawstate

- **WHEN** the worker adapter calls `Midend.canvasCleared()` after
  `Drawing.resize` reset the canvas backing store
- **THEN** the midend discards the per-game drawstate and constructs
  a fresh one (with `started=false` and any cache cleared)
- **AND** the next `redraw(dr)` causes the game's `!ds.started`
  branch to run, painting the bg + one-time setup + every tile
  fresh

#### Scenario: A palette replacement repaints without clearing the canvas

- **WHEN** the worker adapter receives a `setDrawingPalette` call that
  replaces an already-installed palette (e.g. the user toggles
  light/dark mode)
- **THEN** the adapter calls `engine.forceRedraw(dr)`, which discards
  the drawstate and runs `redraw`
- **AND** the game's `!ds.started` branch paints the full frame in
  the new palette over the existing canvas content — the framework
  itself emits no overpaint

#### Scenario: `Midend.redraw` emits no draw ops of its own

- **WHEN** `Midend.redraw(dr)` is called
- **THEN** the only ops it emits directly are `startDraw` and
  `endDraw`; every other paint operation in the recording originates
  from `game.redraw`
- **AND** there is no framework-level background fill, clear, or
  full-window overpaint
