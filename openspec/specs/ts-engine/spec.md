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

The engine SHALL provide the `Dsf` class in `src/native/engine/dsf.ts`, promoted from the Galaxies local implementation. The class SHALL support `constructor(n)`, `reinit()`, `canonify(i)`, `merge(a, b)`, `size(i)` (the number of elements in `i`'s class), and `equivalent(a, b)` (whether `a` and `b` share a class) with path compression and union-by-size. Games that need union-find SHALL import from this shared location.

#### Scenario: A game imports the shared Dsf

- **WHEN** a game needs disjoint-set operations
- **THEN** it imports `Dsf` from `src/native/engine/dsf.ts`
- **AND** no game directory contains a local `dsf.ts`

#### Scenario: Size and equivalence reflect merges

- **WHEN** elements are merged into a class and `size`/`equivalent` are queried
- **THEN** `size(i)` returns the count of elements in `i`'s class for any member `i`
- **AND** `equivalent(a, b)` returns true iff `a` and `b` are in the same class

### Requirement: The engine supports an ephemeral Hint System

The engine SHALL support a UI-only, ephemeral Hint System built on **plans**.
The `Game` interface SHALL define an optional `hint(state, aux?)` method returning
a non-empty ordered plan of `HintStep`s — each a move plus a human-readable
explanation and optional visual highlights, narrated for the state that step
applies to (`HintResult`). The optional second argument `aux` is the generator's
solution hint (upstream `aux_info`), the same value passed to `solve`; the
`Midend` SHALL pass its stored `aux` so a game whose best hint derives from the
known solution can use it when present (and fall back otherwise), while deductive
games ignore it. The `Midend` SHALL store the whole plan plus a current-step index
in `activeHint` (midend-only, never in game state, never persisted), SHALL display
**at most** one step at a time (the displayed step is passed to the game's `redraw`
and its explanation appended to the status bar; a stored plan MAY be hidden,
displaying nothing), and SHALL recompute a plan only when no valid plan is stored.

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

**Hint-authoring convention — one deduction firing = one journey.** When a
game's `hint()` derives its plan from a solver/deduction engine, a **single
logical deduction that forces more than one move** (e.g. a coupled pair of
edges, or a clue that simultaneously resolves several of its sides) SHALL be
emitted as **one journey**: an ordered run of `HintStep`s whose first leg
carries the full explanation of the deduction (and SHOULD surface the whole set
visually, e.g. the other forced moves as sibling highlights) and whose
subsequent legs are flagged `continuesPrevious` with abbreviated narration.
Distinct deductions remain separate hints (the first leg of each is
unflagged, so the user asks again to see the next deduction). This keeps the
manual flow ("clear this one, then the rest" stays on screen through its legs)
and the auto-play flow (the legs animate back-to-back as one multi-part move)
consistent across every game whose hints group naturally.

**Hint-authoring convention — element-type colour legend.** When a game's hint
narration names **more than one distinct kind of board element** (e.g. a filled
cell as premise versus the forced cell as conclusion, or a clue versus a
region), the game's `redraw` SHALL distinguish those types with a **stable
per-game colour legend**: each element type is assigned one highlight colour used
consistently across all that game's hints (so the legend is learnable), and only
the types a given hint actually names are highlighted. Each legend colour SHALL
be paired with a **non-colour cue** (ring versus shade versus fill, the drawn
digit/clue, or position) so the type mapping survives for colourblind players —
colour SHALL NOT be the sole carrier, and colour names SHALL NOT appear in the
narration text. This convention is orthogonal to "equivalent moves share a
colour": equivalent *forced moves* still share the single target colour; the
legend governs *premise/element types*.

A non-deductive game (no technique to teach) MAY instead derive its plan from
the known solution via `aux`: it is a legitimate hint strategy to walk the
player to the unique solution. Such a game SHOULD prefer the `aux`-derived plan
when `aux` is present (guaranteeing the plan completes) and MAY fall back to a
local heuristic when it is absent.

#### Scenario: A hint naming multiple element types colours them by a stable legend

- **WHEN** a game's displayed hint step narrates two distinct board-element
  types (for example a cited filled/decided premise cell and the forced target
  cell)
- **THEN** `redraw` highlights each type in its own legend colour, paired with a
  distinguishing non-colour cue, rather than rendering both in the single target
  colour

#### Scenario: A legend colour is the same across different hints of one game

- **WHEN** two different hints of the same game each name the same element type
  (for example "a shaded square" appears as a premise in two different
  deductions)
- **THEN** that element type is drawn in the same legend colour in both hints

#### Scenario: Requesting a hint from the midend

- **WHEN** the user requests a hint via `midend.hint()` with no active plan,
  on a game that implements the `hint` method
- **THEN** the midend computes a plan once, stores it with index 0, appends
  the first step's explanation to the status bar, and schedules a repaint

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

### Requirement: The midend reconciles persisted Ui across state transitions

The `Game` interface SHALL provide an optional
`changedState(ui, oldState, newState)` hook — the idiomatic rendering of
upstream's `game_changed_state` — by which a game derives any persisted Ui that
tracks the current state (e.g. a working-input row reconstructed from the latest
move). The midend SHALL invoke it, mutating the live `ui` in place, after every
**real** state transition it processes — a move, undo, redo, solve, and restart —
and once at new-game setup with `oldState = null`, and SHALL invoke it **before**
computing animation/flash durations and before the post-transition repaint so the
reconciled Ui is what the frame and the next input see. The midend SHALL NOT
invoke it on a bare `UI_UPDATE` (no state changed; the user is mid-edit). A game
that omits the hook SHALL behave exactly as before (the midend treats the absent
hook as a no-op).

#### Scenario: The hook fires on a move and reconciles the Ui

- **WHEN** the midend applies a move that produces a new state
- **THEN** it calls `changedState(ui, prevState, newState)` before the repaint,
  and the mutated `ui` is the one passed to `redraw`

#### Scenario: The hook fires on undo and redo

- **WHEN** the midend processes an undo or a redo
- **THEN** it calls `changedState(ui, prevState, restoredState)` so a Ui that
  tracks state is reconstructed for the restored position

#### Scenario: The hook does not fire on a UI-only update

- **WHEN** `interpretMove` returns `UI_UPDATE`
- **THEN** the midend repaints without calling `changedState` (the persisted Ui
  is left exactly as `interpretMove` mutated it)

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

### Requirement: Hint explanation surfaces independent of the status bar

The active hint step's explanation SHALL be surfaced to the UI (the hint
banner) whenever a hint is displayed, **regardless of whether the game
requests a status bar** (`wantsStatusbar`). The explanation rides on the
`status-bar-change` notification together with the status-bar text; the
`Midend` SHALL emit that notification for a game that has either a status bar
or a `hint` capability, so a hint-carrying game with no status bar (e.g.
Range) still shows and clears the banner. The status-bar DOM remains gated on
`wantsStatusbar` independently, so the empty status-bar text emitted for a
no-status-bar game is inert.

#### Scenario: A no-status-bar game shows and clears the hint banner

- **WHEN** a game with `wantsStatusbar = false` and a `hint` method is sent a
  hint request, and then the player makes a move
- **THEN** the midend emits the hint explanation while the hint is displayed
- **AND** the explanation is cleared (emitted empty) once a move hides the hint

### Requirement: A refused hint surfaces the board's mistakes

The `Midend` SHALL invoke `findMistakes()` whenever a hint is refused (the
game's `hint()` returns an unsuccessful result), so the offending cells are
surfaced in the same overlay Check & Save uses. A hint is typically refused
precisely because the board has mistakes ("fix the highlighted mistakes
first"), and the refusal message alone highlights nothing; routing the refusal
through `findMistakes()` makes that promise literally true. A refusal with no
mistakes (already solved, nothing deducible) finds zero and highlights nothing;
a game without a `findMistakes` hook is unaffected. This applies to every
refusal path — the manual Hint request and Auto-Hint both flow through the
single plan-computation chokepoint.

#### Scenario: Asking for a hint on a board with a mistake highlights it

- **WHEN** the board has a mistake and the game's `hint()` refuses
- **THEN** the midend computes and displays the mistake overlay (the same one
  Check & Save populates) so the offending cells render in the mistake colour
- **AND** the refusal message is still returned to the caller

#### Scenario: A refusal unrelated to mistakes highlights nothing

- **WHEN** a hint is refused on a board with no mistakes (e.g. already solved)
- **THEN** the mistake overlay stays empty and no cell is highlighted

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

### Requirement: The engine supports per-game user preferences

The engine SHALL support per-game user preferences, the idiomatic-TS
realisation of upstream's `get_prefs`/`set_prefs`. The `Game` interface
SHALL define an **optional** declarative `prefs` member: an ordered list
of preference items, each carrying a stable keyword (`kw`), a
human-readable `name`, a discriminated `type` (`"boolean"` or
`"choices"`, with `choices` items carrying the ordered choice labels),
and `get`/`set` accessors that read and write the preference's value on
the game's **`Ui`** value (preferences live on the `Ui`, exactly as
upstream stores them on `game_ui`, so `interpretMove` and `redraw` see
them). A game with no preferences SHALL omit `prefs`, and the engine
SHALL report an empty preferences set for it — the correct behaviour for
the four-plus existing ports, not a stub.

The `Midend` (and the `EngineCore` surface it implements) SHALL expose
`getPreferencesConfig()`, `getPreferences()`, and `setPreferences(values)`
that translate the declarative `prefs` to and from the app's existing
`ConfigDescription`/`ConfigValues` shapes: a `boolean` item maps to a
boolean value, a `choices` item maps to the selected zero-based numeric
index. `setPreferences` SHALL apply only the keys present in the supplied
values (leaving others unchanged), coerce each value to its item's type,
and request a repaint (a preference such as "highlight crossed edges"
changes rendering). The `TsWorkerPuzzle` worker adapter SHALL delegate
these three methods to the engine, so the app's existing
`puzzle-preferences-form` and per-puzzle IndexedDB persistence drive a TS
game's preferences with no app-shell change.

Because the midend recreates the `Ui` (`newUi`) on every new game / load
/ game-from-id, the midend SHALL retain the last-applied preference
values and re-apply them after each `Ui` recreation, so a player's
preference survives starting a new game (upstream keeps one `game_ui`
across new games; this reproduces that effect). Preferences SHALL NOT be
written into the save file (they are app-level, persisted per puzzle by
the existing settings store). The binary `savePreferences`/
`loadPreferences` surface (an internal C/WASM serialisation the app does
not use for persistence) MAY remain a no-op on the TS path.

#### Scenario: A game declares preferences and the app drives them unchanged

- **WHEN** a registered TS game declares a `prefs` list and the user opens
  the puzzle preferences form
- **THEN** `getPreferencesConfig()` returns a `ConfigDescription` whose
  items reflect the declared keywords, names, types, and choice labels
- **AND** `getPreferences()` returns the current value of each preference
  (boolean, or the numeric index for a choice) read from the live `Ui`
- **AND** toggling a preference calls `setPreferences(...)`, which writes
  the new value onto the `Ui` and repaints

#### Scenario: A preference survives a new game

- **WHEN** the user changes a preference and then starts a new game of the
  same puzzle
- **THEN** the freshly created `Ui` carries the player's chosen
  preference values, not just the `newUi` defaults

#### Scenario: A game with no preferences reports an empty set

- **WHEN** the engine is asked for the preferences of a game that omits
  `prefs` (e.g. Flip, Galaxies)
- **THEN** `getPreferencesConfig()` returns an empty item set and
  `getPreferences()` returns an empty value map, with no error

#### Scenario: A preference change repaints even when no board state moved

- **WHEN** the user toggles a preference that affects only rendering
  (e.g. Untangle's vertex style or crossed-edge highlight), changing no
  vertex position
- **THEN** the midend forces a full repaint (dropping the per-frame draw
  cache, as for a palette/font change) so the new appearance shows
  immediately rather than being skipped by the game's redraw early-out

### Requirement: The midend retains generator aux info for Solve

The `Midend` SHALL retain the solver-shortcut `aux` info a game's
`newDesc` returns (upstream `aux_info`) and pass it to the game's
`solve(orig, curr, aux)`. The `aux` SHALL be retained for a freshly
*generated* game (both `newGame` and a random `<params>#<seed>` id). The
retained `aux` SHALL be cleared for
a descriptive `<params>:<desc>` id and for a loaded save (where no aux is
available), so a game whose solver requires aux correctly reports the
solution as unknown for those — faithful to upstream, where Solve is
available only for a game generated in the current session.

#### Scenario: Solve uses the generator's aux on a freshly generated game

- **WHEN** a game is started from `newGame` or a `#seed` id and the user
  invokes Solve
- **THEN** the midend passes the retained `aux` to the game's `solve`,
  and a game that needs it (e.g. Untangle) solves the board

#### Scenario: Solve is unavailable on a loaded game

- **WHEN** a game requiring aux for Solve is loaded from a save (no aux)
  and the user invokes Solve
- **THEN** the midend passes `undefined` aux and the game reports the
  solution is not known, leaving the board unchanged

### Requirement: The Untangle port exposes its three preferences via the hook

The Untangle port SHALL expose its three upstream preferences through the
`prefs` hook: **snap-to-grid** (boolean), **show-crossed-edges**
(boolean), and **vertex-style** (a two-way choice, Circles/Numbers).
Lacking an in-app default-divergence mechanism beyond `newUi`, the port's
`newUi` SHALL set the shipped defaults: **show-crossed-edges ON** (it
doubles as the built-in mistake feedback), snap-to-grid OFF, and
vertex-style Circles. The keywords SHALL match upstream
(`snap-to-grid`, `show-crossed-edges`, `vertex-style`) for tidiness.

#### Scenario: Untangle preferences round-trip through the engine

- **WHEN** `getPreferencesConfig()` is called for a registered Untangle
  game
- **THEN** it returns three items — two booleans and one two-choice — and
  `getPreferences()` reports show-crossed-edges true by default
- **AND** `setPreferences({ "show-crossed-edges": false })` turns off the
  crossed-edge highlight and repaints, leaving the other two unchanged

### Requirement: The engine surface exposes a "fill all pencil marks" capability

The engine surface SHALL expose `canMarkAll` in its static attributes, true
iff the active game supports the "fill every empty cell with all candidate
pencil marks" action (upstream's `M`/`m` key). The `Game` interface SHALL
define an optional `readonly canMarkAll?: boolean` flag; the `Midend` SHALL
surface it as `canMarkAll: game.canMarkAll ?? false`. For an unported C/WASM
game, `canMarkAll` SHALL be false.

The action itself reuses the existing keyboard input path rather than a new
engine method: a game that sets `canMarkAll` SHALL handle the `M`/`m` key in
`interpretMove` and return its mark-all move. The app shell SHALL render a
control in the same toolbar `wa-button-group` as Hint and Check & Save, shown
only when `canMarkAll` is true, which on activation injects the `M` key via the
surface's `processKey`.

#### Scenario: A pencil-mark game shows the control and fills candidates

- **WHEN** the active game reports `canMarkAll` true and the player activates
  the toolbar control
- **THEN** the `M` key is injected via `processKey`, the game fills every empty
  cell with all candidate pencil marks, and the board repaints

#### Scenario: A game without pencil marks shows no control

- **WHEN** the active game does not set `canMarkAll`
- **THEN** `canMarkAll` is false and the app shell renders no mark-all control

#### Scenario: An unported game reports no capability

- **WHEN** the active game runs on the C/WASM engine
- **THEN** `canMarkAll` is false and the app shell renders no mark-all control

