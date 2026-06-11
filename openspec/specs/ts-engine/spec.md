# ts-engine Specification

## Purpose
The native-TypeScript puzzle engine: the single idiomatic `Game`
interface every port implements, the `Midend` that orchestrates a game
behind the existing Comlink surface, the runtime per-game registry
that is the hybrid TS-vs-C/WASM decision point, the clean TS-native
save format, and the behavioural (corpus-free) test discipline for the
engine. This is the keystone the `ts-migration` doctrine mandates
before any game port; it realises that doctrine's "midend precedes
game ports" and "per-game hybrid" requirements.
## Requirements
### Requirement: The native engine defines one idiomatic `Game` interface that every port implements

The TS engine SHALL define a single `Game` interface that every ported
game implements. The interface SHALL be an idiomatic TypeScript
rendering of upstream's `struct game` responsibilities — generic over a
game's parameter, state, move, UI, and draw-state types — and SHALL
use **immutable** state transitions: applying a move SHALL return a new
state value rather than mutating in place. The interface SHALL NOT
require manual duplicate/free of game values, SHALL NOT pass opaque
handles, and SHALL use union/boolean types in place of integer
sentinels (e.g. a game-status union, not the sign of an int).

Ports SHALL depend on this interface only; they SHALL NOT call the
midend directly. The interface is the sole contract between a game and
the engine.

#### Scenario: A port implements the interface without handle ceremony

- **WHEN** a game is ported to TS
- **THEN** it implements the `Game` interface with its own
  parameter/state/move types
- **AND** applying a move returns a new state value (no in-place
  mutation, no explicit free of the prior state)
- **AND** the port does not reference the midend implementation
  directly

#### Scenario: Game status is a typed union

- **WHEN** the engine asks a game for its status
- **THEN** the result is the shared game-status union
  (`ongoing`/`solved`/`solved-with-help`/`lost`), not an integer whose
  sign encodes win/loss

### Requirement: The TS midend orchestrates a game behind the existing Comlink surface

The engine SHALL provide a midend that owns, per live game: the
selected `Game`, its parameters, the move/undo/redo history, the UI
and draw state, the engine random source (the retained bit-identical
`random.ts`), timer bookkeeping, and preset/configuration handling.
The midend SHALL reproduce the existing Comlink `WorkerPuzzle` API
surface (new game, new game from ID, restart, process key/mouse, undo,
redo, solve, redraw, presets, status, serialise/deserialise, timer)
and SHALL emit the existing change-notification shapes the app already
consumes. The app shell, screen, dialog, drawing-canvas, and store
code SHALL NOT require changes to drive a TS game.

#### Scenario: A TS game is driven through the unchanged app surface

- **WHEN** the app selects a game served by the TS engine and the user
  plays, undoes, redoes, and the game is solved
- **THEN** input, undo/redo, redraw, status, and timer behave through
  the same Comlink methods and notification shapes used for C/WASM
  games
- **AND** no `src/screens/`, `src/dialogs/`, `src/puzzle/puzzle.ts`,
  drawing-canvas, or `src/store/` code is modified to make this work

#### Scenario: Undo/redo history is owned by the midend

- **WHEN** a move is made, then undone, then a different move is made
- **THEN** the midend truncates the redo branch at the undo point
- **AND** the redo of the abandoned branch is no longer offered

### Requirement: Per-game engine selection is a runtime registry, not a build flag

The engine SHALL select a game's implementation at runtime via a
registry keyed by `puzzleId`. When a `puzzleId` has a registered TS
`Game`, the engine SHALL serve that game with the TS midend; otherwise
the engine SHALL serve it via the existing C/WASM path. Selection
SHALL NOT depend on a new build flag, and SHALL be independent per
game. The `USE_TS_LEAVES` umbrella and its per-module flags govern
C-internal leaf-library bridges only and SHALL remain orthogonal to
engine selection. This change SHALL ship with an empty registry, so
the production runtime is unchanged until a game-port change registers
an implementation.

#### Scenario: Empty registry preserves today's runtime

- **WHEN** this change has landed and no game is registered
- **THEN** every catalog game loads and runs via its C/WASM
  implementation exactly as before
- **AND** no build flag was introduced to achieve this

#### Scenario: A registered game is served by the TS engine

- **WHEN** a `puzzleId` has a registered TS `Game`
- **THEN** the worker constructs the TS-midend-backed implementation
  for that game
- **AND** other, unregistered games continue to load their C/WASM
  implementation in the same session

### Requirement: The engine uses a clean TS-native save format

The midend SHALL serialise and restore a game using a clean,
versioned TypeScript-native format (a version-tagged envelope carrying
the puzzle id, parameters, game id, the move list, timer elapsed, and
checkpoints). Restoration SHALL reconstruct history by replaying the
saved moves. The format SHALL NOT be required to be compatible with
the C `midend_serialise` format, and loading a pre-pivot C-format save
SHALL NOT be required (consistent with the `ts-migration` decision
that old saves and pre-pivot shared IDs are expendable). Saving and
restoring SHALL round-trip: a restored game SHALL have the same state
and history as the saved game.

#### Scenario: Save/restore round-trips

- **WHEN** a TS-engine game is saved and then restored from that data
- **THEN** the restored game has identical state, move history, and
  redo availability
- **AND** the saved payload carries a format version field

#### Scenario: C-format save is not required to load

- **WHEN** a payload produced by the pre-pivot C-serialisation path is
  presented to the TS midend
- **THEN** the midend is NOT required to load it
- **AND** this is not treated as a defect

### Requirement: Midend correctness is established by behavioural tests, not a corpus

Midend correctness SHALL be established by behavioural and property
tests driven by a small in-repo fake `Game`, NOT by a byte-identical
characterization corpus. The suite SHALL cover undo/redo invariants,
history truncation after a move following an undo, status transitions,
change-notification emission, timer accumulation, preset-tree parsing,
and save/restore round-tripping. This applies the `ts-migration`
"accepted without a golden corpus" discipline to the engine itself.

#### Scenario: The midend is validated without a golden corpus

- **WHEN** the engine layer is implemented
- **THEN** its tests drive a fake `Game` and assert behavioural
  invariants (including `undo` after a move restoring the prior state)
- **AND** no characterization corpus captured from the C build is
  required for the midend to be accepted

### Requirement: The `Game` drawing, colour, and input-feedback contract is fully specified

The engine SHALL fully specify the drawing surface, UI-only input
feedback, and colour derivation that the keystone left as a minimal
placeholder for the first real port to fix, as follows.

- `GameDrawing` SHALL expose the full puzzle drawing API — filled
  rectangle, line, polygon, circle, text, clip/unclip,
  start/end-draw, draw-update, and the blitter save/restore quartet —
  with the same coordinate and palette-index semantics the existing
  canvas drawing surface already honours. The existing canvas
  `Drawing` SHALL satisfy `GameDrawing` structurally without
  modification. The engine SHALL NOT impose a full-vs-incremental
  redraw policy; redraw optimisation (per-element diffing,
  first-draw-only setup) is the game's own concern, as in upstream.
- `interpretMove` SHALL be able to report a UI-only change (cursor or
  other UI state changed in place) distinctly from "a move" and from
  "nothing happened". The midend SHALL, on a UI-only result, redraw
  and notify without creating a history entry; on "nothing happened"
  it SHALL do nothing; on a move it SHALL apply it to history.
- A game's `colours` SHALL receive the frontend default background
  colour, and the engine SHALL thread that default from the worker
  surface through the midend to the game, so a game can derive its
  palette from the host background exactly as upstream's
  `game_colours` does.

#### Scenario: A game draws through the full surface

- **WHEN** a registered TS game's `redraw` runs
- **THEN** it may use rectangles, lines, polygons, circles, text,
  clipping, and blitters through `GameDrawing`
- **AND** the existing canvas drawing implementation services them
  with no change to that implementation

#### Scenario: A UI-only input redraws without a history entry

- **WHEN** input changes only UI state (e.g. moving a keyboard cursor)
- **THEN** the engine redraws and emits a state notification
- **AND** undo offers no extra step for that input (no history entry
  was created)

#### Scenario: Palette is derived from the host background

- **WHEN** the app requests the colour palette with its default
  background
- **THEN** the game receives that background and returns a palette
  derived from it (not a hardcoded background)

### Requirement: The worker exposes one shared puzzle-engine surface

The C/WASM-backed puzzle and the TS-midend-backed puzzle SHALL both
implement one shared `PuzzleEngineSurface` interface enumerating the
Comlink-exposed methods the app drives. The worker factory SHALL
return that interface and the app's remote puzzle type SHALL be built
from it. There SHALL NOT be an unchecked cast bridging the two
implementations at the dispatch seam; conformance SHALL be
compiler-checked on both implementations.

#### Scenario: Both implementations are compiler-checked against one surface

- **WHEN** either the C/WASM-backed or the TS-midend-backed puzzle
  drifts from the shared surface
- **THEN** it is a type error at build time
- **AND** the dispatch seam constructs either implementation without
  an `as unknown as` cast

#### Scenario: The app's remote type is unchanged

- **WHEN** the shared surface is introduced
- **THEN** the app-side remote puzzle type keeps the same shape it had
- **AND** no `src/screens/`, `src/dialogs/`, `src/puzzle/puzzle.ts`,
  drawing-canvas, or `src/store/` code changes to consume it

### Requirement: A TS-ported game stays in the catalog without a wasm artifact

A game whose engine is ported to native TS SHALL remain present in the
generated catalog (its metadata and `puzzleIds` entry) so the app
lists and routes to it, while its C source and per-puzzle wasm/deps
artifacts SHALL NOT be built. The build SHALL provide an explicit
marker for "this game is TS-served" rather than inferring it, and the
catalog generator SHALL union TS-ported games with the wasm-built
games.

#### Scenario: Flip is catalogued but has no wasm

- **WHEN** the project is built after Flip's C source is deleted
- **THEN** `catalog.json` and `puzzleIds` still include `flip` with
  its display metadata
- **AND** no `flip.wasm` (or per-puzzle Flip dependency target) is
  produced
- **AND** opening Flip in the app routes to the TS engine

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

### Requirement: The engine provides a shared colour-mkhighlight helper

The engine SHALL provide `mkhighlightBackground(bg: Colour): Colour` in `src/native/engine/colour-mkhighlight.ts`, implementing the `misc.c` `game_mkhighlight_specific` background-adjustment logic with the near-white epsilon fix. Every white/black-tile game SHALL be able to import and use this instead of re-deriving it locally.

#### Scenario: A game imports the shared mkhighlightBackground

- **WHEN** a game's `colours()` method receives a default background that is near-white
- **THEN** `mkhighlightBackground` shifts the background away from pure white so that a pure-white tile colour is visibly brighter
- **AND** the game does not contain a local copy of the highlight logic

### Requirement: The engine provides a shared disjoint-set forest (dsf)

The engine SHALL provide the `Dsf` class in `src/native/engine/dsf.ts`, promoted from the Galaxies local implementation. The class SHALL support `constructor(n)`, `reinit()`, `canonify(i)`, and `merge(a, b)` with path compression and union-by-size. Games that need union-find SHALL import from this shared location.

#### Scenario: A game imports the shared Dsf

- **WHEN** a game needs disjoint-set operations
- **THEN** it imports `Dsf` from `src/native/engine/dsf.ts`
- **AND** no game directory contains a local `dsf.ts`

### Requirement: The engine supports an ephemeral Hint System

The engine SHALL support a UI-only, ephemeral Hint System built on **plans**.
The `Game` interface SHALL define an optional `hint(state)` method returning a
non-empty ordered plan of `HintStep`s — each a move plus a human-readable
explanation and optional visual highlights, narrated for the state that step
applies to (`HintResult`). The `Midend` SHALL store the whole plan plus a
current-step index in `activeHint` (midend-only, never in game state, never
persisted), SHALL display **at most** one step at a time (the displayed step is
passed to the game's `redraw` and its explanation appended to the status bar;
a stored plan MAY be hidden, displaying nothing), and SHALL recompute a plan
only when no valid plan is stored.

Plan lifecycle:
- `midend.hint()` SHALL re-display the stored plan's current step (no
  recompute, no advance) while a plan is active, and SHALL compute and store
  a fresh plan at index 0 otherwise.
- `midend.executeHint()` SHALL execute the current step of the stored plan
  (computing a plan first if none is stored), keep that step displayed through
  the move's animation, and advance to the next step — displayed, as the
  auto-play preview — when the animation settles.
- A player move while a plan is active SHALL be classified by the game's
  `hintKeepTrack(move, currentStep, state)` verdict, whether or not the plan
  is currently displayed: `"completed"` advances the plan to the next step
  and **hides the display** (the user asks again to see the next step — one
  hint per request in manual play) — unless the next step is flagged
  `continuesPrevious` (the continuation of a journey the completed step
  previewed, e.g. the "then to column 5" leg), in which case the display
  SHALL stay on and transition to that step: a journey is presented as one
  hint and stays on screen through its legs. `"onTrack"` keeps the current
  step displayed (the game MAY adjust the step's move in place to reflect
  partial progress), and `"off"` drops the plan. A game returning
  `"completed"` is asserting that the resulting state matches the plan's
  expectation, so the remaining steps stay valid.
- The plan SHALL be cleared on undo, redo, restart, new game, solve, when the
  last step completes, and when the board reaches the solved state.

#### Scenario: Requesting a hint from the midend

- **WHEN** the user requests a hint via `midend.hint()` with no active plan,
  on a game that implements the `hint` method
- **THEN** the midend computes a plan once, stores it with index 0, appends
  the first step's explanation to the status bar, and schedules a repaint

#### Scenario: Following a hint manually shows one step per request

- **WHEN** the user makes a move that completes the displayed hint step
  (`hintKeepTrack` returns `"completed"`) and the next step is not a
  journey continuation
- **THEN** the midend advances the stored plan without recomputing and hides
  the hint display (no explanation, no highlights)
- **WHEN** the user requests a hint again via `midend.hint()`
- **THEN** the already-advanced current step is displayed instantly, still
  without recomputing the plan

#### Scenario: A multi-leg journey stays displayed through its legs

- **WHEN** the displayed step previews a journey continuation ("Move tile 10
  to row 2, then to column 5") and the user's move completes the first leg
- **THEN** the midend advances to the flagged continuation step and keeps the
  hint displayed, narrating the second leg, without a fresh hint request
- **WHEN** the journey's final leg completes and the following step is not a
  continuation
- **THEN** the display hides and the next step waits to be asked for

#### Scenario: An off-plan move drops the plan

- **WHEN** the user makes a move for which `hintKeepTrack` returns `"off"`
  (or undoes, redoes, restarts, or starts a new game) while a plan is active
- **THEN** the midend clears `activeHint`, redraws without hint visuals, and
  the next hint request computes a fresh plan

#### Scenario: Auto-play executes the stored plan

- **WHEN** `executeHint()` is called repeatedly while a stored plan has
  remaining steps
- **THEN** each call executes the plan's current step verbatim — `hint()` is
  not recomputed per step — and the plan advances at each animation settle,
  displaying the next step as the auto-play preview and clearing after the
  final step

### Requirement: The engine provides shared pointer button constants

The engine SHALL provide button code constants (`LEFT_BUTTON`, `RIGHT_BUTTON`, `RIGHT_DRAG`, `RIGHT_RELEASE`, cursor keys, etc.) in `src/native/engine/pointer.ts`, matching the values in `src/puzzle/types.ts` `PuzzleButton`. These SHALL be plain `const` values (not an enum) so advisory diff scripts can import them under Node's strip-only TS loader.

#### Scenario: A game imports shared button constants

- **WHEN** a game's `interpretMove` function receives a button number
- **THEN** it compares against the shared constants from `pointer.ts` instead of locally-declared values
- **AND** no game file contains duplicate button code declarations

### Requirement: The engine provides a full mkhighlight palette helper

The engine SHALL provide `mkhighlight(bg: Colour): { background: Colour; highlight: Colour; lowlight: Colour }` in `src/native/engine/colour-mkhighlight.ts`, implementing the full `misc.c` `game_mkhighlight` derivation: the background is adjusted via `mkhighlightBackground`, then the highlight is shifted from the adjusted background toward white by K = sqrt(3)/6 and the lowlight toward black by K. Per upstream, when the background is within K of white the highlight SHALL saturate to pure white, and when within K of black the lowlight SHALL saturate to pure black. Games needing the standard bg/highlight/lowlight trio SHALL destructure this helper instead of re-deriving the colours locally.

#### Scenario: A game derives its palette from the shared helper

- **WHEN** a game's `colours()` method calls `mkhighlight(defaultBackground)`
- **THEN** it receives background, highlight, and lowlight colours matching upstream `game_mkhighlight`, with the highlight strictly brighter and the lowlight strictly darker than the background
- **AND** the game contains no local copy of the highlight/lowlight math

#### Scenario: Light host backgrounds get a pure-white highlight

- **WHEN** the host background is white or near-white
- **THEN** the highlight saturates to pure white instead of collapsing into the adjusted background (the defect the previous per-game inline copies had)

### Requirement: The engine provides a shared leading-integer param parser

The engine SHALL provide `parseLeadingInt(s: string, start: number): { value: number; next: number }` in `src/native/engine/params.ts`, returning the integer formed by the maximal digit run starting at `start` (0 when the run is empty) and the index of the first non-digit character. Games whose `decodeParams` walks an upstream-format param string SHALL import this instead of declaring a local copy.

#### Scenario: A game decodes a WxH param string

- **WHEN** a game's `decodeParams` parses `"10x7"` using `parseLeadingInt`
- **THEN** the first call returns `{ value: 10, next: 2 }` and a second call starting after the `"x"` returns `{ value: 7, next: 5 }`
- **AND** no game file contains a duplicate `parseLeadingInt` declaration

### Requirement: The engine supports an ephemeral mistake-checking hook

The engine SHALL support a UI-only, ephemeral mistake-checking facility,
shaped like the Hint System. The `Game` interface SHALL define an
optional `findMistakes(state)` method returning the cells of the current
state that contradict the puzzle's unique solution as game-specific
highlight data (an empty result means no detectable mistakes). The
method SHALL be pure (no state mutation).

The `Midend` SHALL, on `findMistakes()`, call the game's hook, store the
result as `activeMistakes` (midend-only, never in game state, never
persisted), pass it to the game's `redraw`, and return the **count** of
flagged cells. `activeMistakes` SHALL be displayed until the next state
transition and SHALL be cleared on the same events that clear an active
hint (a player move, undo, redo, restart, new game, solve, and reaching
the solved state). A game that does not implement `findMistakes` SHALL
report it as unavailable.

The engine surface SHALL expose `canFindMistakes` (true iff the game
implements the hook) in its static attributes and `findMistakes(): number`
(display the mistakes as a side effect, return how many). For an
unported C/WASM game, `canFindMistakes` SHALL be false and
`findMistakes()` SHALL return 0.

#### Scenario: Checking a board with mistakes

- **WHEN** the user invokes `findMistakes()` on a game that implements
  the hook and the current state has cells contradicting the solution
- **THEN** the midend stores those cells as `activeMistakes`, schedules a
  repaint that draws them highlighted, and returns the count (> 0)
- **AND** the highlight remains until the next state transition

#### Scenario: Checking a clean board

- **WHEN** the user invokes `findMistakes()` and no cell contradicts the
  solution
- **THEN** the count returned is 0 and nothing is highlighted

#### Scenario: A transition clears the mistake display

- **WHEN** `activeMistakes` is displayed and the user makes a move,
  undoes, redoes, restarts, starts a new game, or solves
- **THEN** the midend clears `activeMistakes` and the next repaint draws
  no mistake highlights

#### Scenario: An unported game reports no capability

- **WHEN** the active game runs on the C/WASM engine
- **THEN** `canFindMistakes` is false and `findMistakes()` returns 0,
  and the app shell shows no mistake-checking control

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

