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

A game whose state carries **candidate/pencil annotations** (e.g. Towers) MAY
report **annotation-level** contradictions as mistakes, consistently with how a
placed value is reported: a non-empty candidate set that **excludes** the cell's
unique-solution value (the player has crossed out the correct answer) is a
contradiction and MAY be returned, whereas a candidate set that merely holds
extra, non-solution candidates is ordinary mid-solve state and SHALL NOT be
reported. The solution such a game checks against SHALL be derived from the
committed placements only, never from the annotations themselves (an annotation
can be wrong — that is precisely what is being checked). This makes pencil notes
first-class markings, so the existing Check-&-Save gate (which refuses a save
while `findMistakes` is non-empty) refuses a board carrying an invalid note
exactly as it refuses a wrong placed value.

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

#### Scenario: A candidate annotation that excludes the solution is a mistake

- **WHEN** a game with pencil/candidate annotations reports mistakes on a state
  where an undecided cell's non-empty candidate set excludes that cell's
  unique-solution value
- **THEN** `findMistakes` includes that cell
- **AND** a cell whose candidate set still contains the solution value (with or
  without extra candidates) is not included
- **AND** Check-&-Save refuses to quick-save the board while such a cell exists

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

The mark-all action SHALL be **adaptive** for a game whose cells have uniqueness
regions (one that supplies a per-game region provider): if any empty cell has **no
pencil notes at all** the action fills every note-less empty cell with all candidates
(as before); otherwise (every empty cell already carries notes) the action SHALL
instead **remove the obvious candidates** — every pencilled value equal to a value
already *placed* in one of that cell's uniqueness regions (row/column, plus sub-block
and X-diagonal where the game has them; a Keen arithmetic cage is NOT a uniqueness
region). "Obvious" SHALL be judged only against placed values, never inferred from
another pencil mark.

The cleanup SHALL be emitted as the existing atomic `pencilStrike` move with its marks
computed at `interpretMove` time, so replay and undo are exact. When there is nothing to
fill **and** nothing to strike (an already-cleaned, fully-noted board) the action SHALL
produce **no move at all** (a true no-op that adds no undo entry), rather than an empty
`pencilStrike`. The cleanup SHALL be **idempotent** and a pure function of the placed
(non-pencil) grid: repeated presses converge to and remain at "every empty cell noted with
all candidates minus the values placed in its regions" — there SHALL be no fill⇄clean
toggle, and a cleaned board SHALL NOT silently re-fill. A clean SHALL NOT empty a cell of its last note (a cell whose every
candidate is region-eliminated occurs only on an already-mistaken board; leaving its last
note keeps idempotency unconditional). A game without a row/column uniqueness model (e.g.
Undead) SHALL keep the fill-only behaviour.

#### Scenario: A pencil-mark game shows the control and fills candidates

- **WHEN** the active game reports `canMarkAll` true and the player activates
  the toolbar control
- **THEN** the `M` key is injected via `processKey`, the game fills every empty
  cell with all candidate pencil marks, and the board repaints

#### Scenario: A second press on a fully-noted board removes obvious candidates

- **WHEN** every empty cell is already fully noted and the player activates the
  mark-all control on a game with uniqueness regions
- **THEN** the action emits a `pencilStrike` that removes exactly the pencilled
  values already placed in each cell's row/column (and block/diagonal where the game
  has them), leaving every still-possible candidate, and replaying the move
  reproduces the cleaned board

#### Scenario: Repeated presses are idempotent (no re-fill, no toggle)

- **WHEN** the player activates the mark-all control a third time, after a fill and a
  clean, with no board change in between
- **THEN** the cleaned board is unchanged — the action produces no move (a true no-op,
  no undo entry) and does not re-fill any cell — and the resulting notes equal `{1..n}`
  minus the placed values in each cell's regions

#### Scenario: An arithmetic cage is not a uniqueness region

- **WHEN** the game is Keen and a cell's pencilled value also appears in its cage but
  not in its row or column
- **THEN** the cleanup does NOT remove that candidate (the value is still legal under
  the cage's arithmetic constraint)

#### Scenario: A non-uniqueness game keeps fill-only

- **WHEN** the game has no row/column uniqueness model (e.g. Undead)
- **THEN** the mark-all action only ever fills missing candidates; it performs no
  obvious-candidate cleanup

#### Scenario: A game without pencil marks shows no control

- **WHEN** the active game does not set `canMarkAll`
- **THEN** `canMarkAll` is false and the app shell renders no mark-all control

#### Scenario: An unported game reports no capability

- **WHEN** the active game runs on the C/WASM engine
- **THEN** `canMarkAll` is false and the app shell renders no mark-all control

### Requirement: executeHint supports a single-step (hide-after) mode

`midend.executeHint(hideAfter?)` SHALL accept an optional `hideAfter` flag
(default false, threaded through `PuzzleEngineSurface` and the worker adapter).
When false the behaviour is unchanged — the executed step stays displayed
through its animation and, on settle, the plan advances and the next step is
**displayed as the auto-play preview**. When `hideAfter` is true the executed
step still stays displayed through its animation, but on settle the plan
advances and is then **hidden** (the same hidden-but-stored state a manual step
completion produces), so nothing is previewed; the next `midend.hint()`
re-displays the advanced step without recomputing. The C/WASM surface accepts
and ignores the flag (it supports no hints).

#### Scenario: Single-step execute hides the plan instead of previewing

- **WHEN** `executeHint(true)` is called on a game with a stored plan
- **THEN** the current step's move is applied and, once it settles, the plan
  advances and is hidden (no next-step preview is displayed)
- **AND** a subsequent `hint()` re-displays the advanced step without
  recomputing the plan

#### Scenario: Auto-play execute still previews the next step

- **WHEN** `executeHint()` (no argument) is called on a game with a stored plan
- **THEN** the executed step settles and the next step is displayed as the
  auto-play preview, exactly as before

### Requirement: The toolbar Hint button alternates show and apply

The app shell's **Hint** control SHALL alternate between showing and applying
one hint step, built on the two midend primitives (`hint()` to display,
`executeHint(true)` to apply one step and hide it), without changing any game's
`hint()`. The intent is one applied hint per request: most players need a single
nudge to get unstuck, so applying is terminal — it does not auto-advance to the
next hint.

The orchestrating `Puzzle` SHALL maintain an "armed to apply" flag that is:

- **set** when a Hint press successfully *displays* a step (the `hint()` show
  path returns no refusal), and
- **cleared** when a Hint press *applies* a step (so the rhythm is
  show → apply → show → apply), and by any intervening user action — a move
  (key or pointer), undo, redo, solve, restart, new game, checkpoint load,
  loading a saved game, deletion, or starting Auto-Hint.

A Hint press SHALL:

- when **not armed**, run the show path (`midend.hint()` via the surface),
  arming the flag only if the show succeeds (a refused hint — mistakes present,
  already solved, nothing deducible — SHALL surface its banner/overlay as today
  and SHALL NOT arm);
- when **armed**, disarm and apply exactly the current step via
  `executeHint(true)` (which hides the plan on settle rather than previewing the
  next step). On success, with the board not yet solved, the hint banner SHALL
  show a transient confirmation ("Hint applied"); on an `executeHint` error the
  message SHALL surface in the banner. The next Hint press then *shows* the next
  step.

The separate Auto-Hint play/pause button is unchanged and remains the way to
animate the whole remaining plan unattended (it uses `executeHint()` with no
`hideAfter`, keeping the continuous preview).

#### Scenario: First press shows, second press applies and stops

- **WHEN** the player presses Hint on a hinted game with no active plan, and
  then presses Hint again without any other interaction
- **THEN** the first press displays the current step (no move is applied) and
  the second press applies that one step in slow motion, hides the plan
  (no next step is previewed), and shows a "Hint applied" confirmation

#### Scenario: Presses alternate show and apply

- **WHEN** the player keeps pressing Hint with no other interaction between
  presses
- **THEN** the presses alternate show, apply, show, apply — each apply lands one
  move and stops, and the following press shows the next step

#### Scenario: An intervening action re-arms the show

- **WHEN** the player presses Hint (showing a step), then performs any other
  action (e.g. a move or undo), then presses Hint again
- **THEN** the next press *shows* the now-relevant step rather than applying a
  stale one (the apply is disarmed by the intervening action)

#### Scenario: A refused hint does not arm the apply

- **WHEN** a Hint press is refused (the game's `hint()` returns an
  unsuccessful result, e.g. the board has mistakes)
- **THEN** the refusal banner/overlay surfaces as before and the next Hint
  press is still on the show path (it does not apply a step)

### Requirement: A displayed hint step never references already-resolved state

The `Midend` SHALL guarantee that whenever a hint step is on display, every
element the step asks the player to act on is still actionable in the current
state — in particular, a candidate-elimination step SHALL NOT name a candidate
that has already been removed from its cell. A stored plan that is kept across a
player's exact-follow moves (the `hintKeepTrack` `"completed"`/`"onTrack"`
path) SHALL be re-validated against the current state before (re-)display, so a
move's side effects (e.g. auto-pencil eliminations) can never leave a later
displayed step referring to a candidate the player has already cleared.

The re-validation SHALL use an optional `Game.refreshHintStep(step, state)`
hook: given a stored step and the current state, the game returns the step with
no-longer-actionable parts dropped (rebuilding its highlights to match, or the
same reference when nothing changed), or `null` when the step is now fully
resolved. The `Midend` SHALL call this before (re-)displaying the plan's current
step — on `midend.hint()` re-show, after a kept manual move advances or shrinks
the plan, and after an executed-hint step settles — advancing past any step the
hook reports fully resolved and recomputing a fresh plan if the whole stored
plan drains. A game that does not implement the hook has its stored steps shown
as-is (correct for games whose move types cannot be partially resolved by a
sibling move's side effects).

This preserves the existing semantics that an exact-follow move keeps the plan
and a conflicting move (`"off"`) drops it; it only adds the freshness guarantee
on top.

The `Midend` SHALL classify a player move with `hintKeepTrack(move, step,
state)` against the **pre-move** state (the state the move is about to be
applied to), so a game MAY itself apply the move to reason about its result
(e.g. a slide puzzle computing the landing cell), and a game classifying a
candidate toggle SHALL test liveness against that pre-move state (a toggle
*clears* a candidate iff it is present before the move; toggling an absent
candidate re-adds it and is off-plan).

#### Scenario: A displayed step is re-validated before showing

- **WHEN** the midend is about to (re-)display the current step of a stored plan
- **THEN** it calls the game's `refreshHintStep` (when provided) and shows the
  refreshed step, advancing past any step reported fully resolved and
  recomputing a fresh plan if every stored step has been resolved

### Requirement: Requesting a hint never mutates the board

Computing or (re-)displaying a hint SHALL NOT change the game state. A hint
*displays* a plan (via highlights the game's `redraw` paints); the player applies
a step only by following it or by an explicit apply action. `Game.hint` SHALL be
pure on its `state` argument, and the act of showing a hint SHALL leave every
board value — including pencil notes — untouched. A displayed highlight that
acts on a board element (e.g. a struck candidate) SHALL be drawn legibly against
its cell, never in the same colour as the cell's own background fill, so the
element it references remains visible rather than appearing already-resolved.

#### Scenario: Showing a hint leaves the board unchanged

- **WHEN** the player requests a hint (the show, not an apply)
- **THEN** the game state is byte-for-byte unchanged — only highlighting is added
- **AND** a struck/acted-on candidate remains visible (its highlight contrasts
  with the cell background), not hidden behind a same-colour fill

#### Scenario: A kept plan never shows an already-removed candidate

- **WHEN** a hint plan is kept across the player's exact-follow moves, and one
  of those moves (or its auto-pencil side effects) removes a candidate that a
  later stored step would have struck
- **THEN** that later step is not displayed as striking the already-removed
  candidate — the midend drops the dead mark (advancing or recomputing the plan
  as needed) so every displayed elimination is still live

#### Scenario: Exact-follow still keeps the plan; a conflict still regenerates

- **WHEN** the player makes a move that exactly follows the displayed hint
- **THEN** the plan is kept (advanced), not dropped
- **AND WHEN** the player instead makes a conflicting move
- **THEN** the plan is dropped and the next hint recomputes from the new state

### Requirement: Latin-family hints distinguish naked, hidden and forced singles

A Latin-square-family game's hint SHALL narrate a forced single placement by the deduction that actually forces it, re-derived from the working board, not from the solver's recorded reason.

This applies to every game riding the shared `latin.ts` solver (Towers, Unequal,
Keen, and future Solo / Undead). The generic `elim` records naked and hidden singles
under one `single` reason; the hint re-derives which it is and narrates accordingly.
The shared classifier (`src/native/engine/latin-hint.ts`) distinguishes three kinds,
considering only *empty* cells as competitors for a digit:

1. a **naked single** — the cell's own candidates are exactly `{n}` — narrated "every
   other number/height has been ruled out in this cell, so it can only be N", with the
   cell alone as evidence;
2. a **hidden single** — no other empty cell of a row (or a column) can still take `n`,
   the cell itself still showing several candidates — narrated by its line ("in this
   row/column, N can go in only this cell"), with the **whole row or column** shaded as
   evidence;
3. a **forced single** — neither of the above (the working notes lag behind a deeper
   set/forcing deduction) — narrated honestly ("working through this cell's row and
   column together, only N can still go here") **without** claiming the cell's visible
   candidates are down to one.

A game SHALL reclassify **only** a recorded `single` placement; a game's own
clue/region-driven forced placements (e.g. Towers' facing-clue and full-line
placements) keep their own reasons. A hidden single's evidence SHALL be its full line
of cells so the player can see that no other cell in the line takes the digit.

#### Scenario: A hidden single is narrated by its line

- **WHEN** a Latin-family hint forces a placement into a cell that still shows several
  candidates, because the placed digit fits nowhere else in its row (or column)
- **THEN** the narration names the line ("in this row/column, N can go in only this
  cell"), not "every other number has been ruled out in this cell"
- **AND** the whole row (or column) is shaded as evidence, the cell marked as the
  placement target

#### Scenario: The naked-single phrasing is never used on a multi-candidate cell

- **WHEN** any Latin-family hint emits a placement step whose narration says "ruled
  out in this cell"
- **THEN** the cell's working notes are genuinely a single candidate (a true naked
  single) — a hidden or forced single uses its own truthful narration instead

### Requirement: A shared candidate-elimination hint-plan abstraction

The engine SHALL provide a shared module (`src/native/engine/candidate-hint.ts`) that
implements the reusable parts of the candidate-elimination hint *plan* — shared by every
pencil-notes game whose hint sets and strikes candidate notes and places a value when a
cell's notes collapse to one (Towers, Unequal, Keen, Solo, and any future such game).
The shared module SHALL own the parts that are identical across those games, while the
game retains the parts that carry game-specific *meaning* — including the per-game
`buildSteps` walk, whose step order, strike-split policy and journey-continuation
tracking differ enough between games that hoisting it into a shared driver would be a
callback shell over a few lines of genuinely-shared loop skeleton (evaluated and
deliberately not done; the per-game walk stays, configured by the shared helpers).

The shared module SHALL provide:

1. **Pure plan helpers** over a working `(grid, pencil)` and a recorded
   `DeductionRecord[]` deduction script: finding a naked single, detecting whether any
   empty cell lacks notes (needs populate), the first recorded placement not yet
   reflected on the working grid, the next still-live strike *firing* (one `group`,
   excluding placement-bookkeeping `dup` elims), and the next forced placement (returned
   whole so the game reads its own reason union). A `joinNums` value-list narration helper.
2. **Generic `keepCandidateHintTrack` and `refreshCandidateHintStep`** over the shared
   pencil-move shape (`set` / `pencilAll` / `pencilStrike`) and the shared
   `CandidateHighlights`, implementing the cross-game verdicts (a populate match, a
   placement match, a strike whose marks shrink in place or complete) and the
   no-stale-step guarantee (drop dead marks, resolve a filled placement, resolve a
   fully-noted populate).

Narration, the per-game reason union, and the `buildSteps` walk (with its game-specific
strike-split and continuation tracking) SHALL remain in the game — the shared module owns
the reusable mechanics, the game owns meaning and control flow.

The placement-classifier in `src/native/engine/latin-hint.ts` (which re-derives whether a
recorded generic `single` placement is a naked single, a hidden single, or a forced
single — see the "Latin-family hints distinguish naked, hidden and forced singles"
requirement) SHALL generalise to an arbitrary **region list**, so a game reasoning over
sub-blocks and diagonals (Solo) classifies a hidden single in any of its regions, while
the row/column games pass only `[row, column]` and are unchanged.

Routing a game's hint through the shared module SHALL be behaviour-preserving: the
game's existing hint requirement and its observable narration, journeys, keep-track
verdicts, resume guarantee and rendered frames are unchanged. The bespoke and shared
solvers and the generator/solve paths are untouched — the shared abstraction is
hint-plan plumbing only, consuming the already-shared `DeductionRecord`/`HintOp` shape.

#### Scenario: A migrated game's hint is unchanged

- **WHEN** a candidate-elimination game (Towers, Unequal, Keen or Solo) is routed
  through the shared hint-plan module
- **THEN** its hint plan — the populate/strike/place steps, their narration, the
  one-firing-one-journey grouping, the `hintKeepTrack` verdicts and the rendered
  highlight frame — is identical to before the migration
- **AND** the game's per-game hint suite, the shared `hint-resume.test.ts`, and the
  render snapshots pass with no change

#### Scenario: A hidden single is classified in a non-row/column region

- **WHEN** a game reasoning over sub-blocks or diagonals (Solo) forces a placement that
  is a hidden single within a sub-block or diagonal
- **THEN** the shared classifier identifies the region and the narration names it
  (e.g. "in this block / diagonal, N can go in only this cell"), the same way the
  row/column games name a row or column

### Requirement: Games may expose on-screen key labels

The engine SHALL support an optional `Game.requestKeys(params)` hook returning an
ordered list of `KeyLabel` (`{ button, label }`) — the on-screen virtual-keypad
buttons for that game, faithful to upstream `game_request_keys`. The hook SHALL
depend only on `params` (not on `state` or `ui`), matching upstream and the fact
that the app's key panel reloads its labels only when params change. Each entry's `button` is the
key code processed exactly as the equivalent physical keypress, and `label` is the
resolved display text (the digit/letter character, or `"Clear"` for the clear key,
so the app's icon mapping renders it); the engine does not re-derive labels from
button codes.

The `EngineCore` surface SHALL expose `requestKeys(): KeyLabel[]`, and the midend
SHALL return `game.requestKeys(params)` for the current params when the hook is
present and an empty list when it is absent. The worker adapter SHALL forward this
result rather than returning a fixed empty list, so a TS-served game shows the same
keypad it showed on the C/WASM path. A game without the hook SHALL show no keypad
(an empty list), unchanged from prior behaviour.

#### Scenario: A keypad game's labels are served on the TS path

- **WHEN** the app requests the key labels for a TS-served game that implements
  `requestKeys`
- **THEN** the midend returns that game's `KeyLabel[]` for the current params
- **AND** the app renders one on-screen button per label, each entering the key
  when pressed

#### Scenario: A game without the hook shows no keypad

- **WHEN** the app requests the key labels for a TS-served game that does not
  implement `requestKeys`
- **THEN** the midend returns an empty list and no keypad is shown

### Requirement: A shared cell-region helper for candidate-elimination games

The shared candidate-elimination module (`src/native/engine/candidate-hint.ts`) SHALL
provide a single representation of "the uniqueness regions a cell belongs to" that all
three consumers — the placement classifier, the basic-strike opening, and a placement's
duplicate cull — share, so they cannot disagree about a cell's regions.

A candidate-elimination game SHALL supply a per-game region provider (`regionsOf(state,
x, y)`) returning the regions in which the value at `(x, y)` must be unique (each a cell
list plus a game tag for naming). The module SHALL provide a `findRegionDuplicate` that,
given the board and the provider, returns one firing of a placed value still present as a
pencil note in one of its regions (subsuming the per-game `basicLatinStrike` /
`basicRegionStrike`), and a placement duplicate-cull that returns the marks a placement
strikes from its regions. The placement classifier (`classifyPlacementInRegions`) SHALL
consume the same provider.

Routing a game's hint through the shared region helper SHALL be behaviour-preserving: the
game's observable narration, journeys, keep-track verdicts, resume guarantee and rendered
frames are unchanged.

#### Scenario: The three consumers agree on a cell's regions

- **WHEN** a candidate-elimination game's hint classifies a placement, finds a basic-strike
  duplicate, and culls a placement's region duplicates
- **THEN** all three derive the cell's regions from the one per-game `regionsOf` provider,
  and the game's hint suite + `hint-resume.test.ts` pass with no snapshot change

#### Scenario: A cage is not a uniqueness region

- **WHEN** the game is Keen (digits may repeat within an arithmetic cage)
- **THEN** `regionsOf` returns only the row and column, so neither the cleanup nor the
  basic-strike removes a candidate that is legal under the cage constraint

### Requirement: A shared candidate-elimination hint entry

The shared candidate-elimination module (`src/native/engine/candidate-hint.ts`) SHALL
provide a `candidateHint` entry that owns the `Game.hint` control flow common to every
candidate-elimination game: refuse on a completed board, refuse (with the standard
message) when the game's `findMistakes` reports any mistake, read the `autoPencil`
preference (defaulting off, per the games' default-auto-pencil-off preference), build the
plan via the game's `buildSteps`, refuse when the
plan is empty, and otherwise return the steps. The standard refusal and empty-plan
messages SHALL live in this one place. A game's `hint` SHALL be a one-line call passing
its own `findMistakes` and `buildSteps`; routing through it SHALL be behaviour-preserving.

#### Scenario: A migrated game's hint refusals and success are unchanged

- **WHEN** a candidate-elimination game (Keen, Towers, Unequal, Solo) routes its `hint`
  through the shared entry
- **THEN** a completed board, a board with mistakes, and a stuck board each refuse with the
  same message as before, a solvable board returns the same plan, and the game's hint suite
  passes with no change

### Requirement: A shared win-flash helper

The engine SHALL provide a shared `winFlash(from, to, flashTime)` helper returning
`flashTime` exactly when a move transitions the board from unsolved to solved without a
cheat (`!from.completed && to.completed && !from.cheated && !to.cheated`) and `0`
otherwise, reading the common `completed` / `cheated` state fields structurally. A game
whose `flashLength` is this canonical shape SHALL delegate to it; a game with bespoke flash
timing keeps its own. Delegation SHALL be behaviour-preserving.

#### Scenario: A fresh solve flashes; other transitions do not

- **WHEN** a move solves a previously-unsolved board with no cheat used
- **THEN** `winFlash` returns the flash duration; for an already-solved board, a non-solving
  move, or a cheated solve it returns `0`, matching the per-game `flashLength` it replaced

### Requirement: A shared narrator for generic Latin deduction reasons

When adopted, the shared Latin-hint module (`src/native/engine/latin-hint.ts`) SHALL
provide a `narrateLatinReason(reason, ns)` that renders the *generic* Latin deduction
reasons whose narration is identical across the **row/column** Latin games (`single`,
`hiddenSingle`, `forcedSingle`, `dup`, `set`, `forcing`). A row/column game (Keen, Unequal)
SHALL delegate those arms to the shared narrator and keep its game-specific arms (cages,
inequality/adjacency clues) local. Delegation SHALL be behaviour-preserving — the rendered
narration strings are byte-identical to before, asserted by each game's hint suite.

A game whose generic-arm wording legitimately diverges SHALL keep its own `narrate` rather
than carry overrides into the shared narrator: **Solo** (its `single`/`dup`/`forcedSingle`
name "row, column and block" and its `hiddenSingle` names a block/diagonal region) and
**Towers** (it narrates the whole family in "height" vocabulary with a single value, not an
`ns` list) are conformingly left local. The requirement is satisfied either by the shared
narrator (for the games where the arms are verbatim-identical) **or** by a recorded decision
in `docs/porting/hint-authoring.md` that a given game's arms were left per-game because the
override surface made a shared narrator less readable — both are conforming outcomes.

#### Scenario: A delegated generic arm narrates identically

- **WHEN** a game routes a generic Latin reason (`single` / `set` / `forcing`) through the
  shared narrator
- **THEN** the produced sentence is byte-identical to the prior per-game string and the
  game's hint suite passes with no change

### Requirement: Candidate-elimination hints clean obvious candidates at populate

A candidate-elimination game's hint plan SHALL, once pencil notes first exist on the working
board — whether the plan just populated them or the board was already noted — emit one
bulk **obvious-candidate cleanup** step that removes every pencilled value already placed in
one of its cell's uniqueness regions, as the adaptive "fill all pencil marks" control's
second press does (`obviousCandidateMarks` over the game's `regionsOf`). The cleanup SHALL be
a single `pencilStrike` step (the marks baked into it at plan time), SHALL be flagged
`continuesPrevious` when it directly follows the populate fill so "fill, then clear the
obvious ones" reads and auto-plays as one setup journey (and stand alone when the board was
already noted), and SHALL fire at most once per plan. An empty cleanup (nothing obvious to
remove) SHALL emit no step. The struck marks SHALL be applied to the plan's working notes so
the rest of the walk sees the cleaned board. The shared engine helper `emitObviousCleanStep`
(`src/native/engine/candidate-hint.ts`) SHALL own this emission so every such game produces
it identically.

Consequently the plan SHALL NOT separately re-teach those obvious row/column/region
eliminations one firing at a time — the bulk clean subsumes the per-given basic-region
opening. The rest of the walk is unchanged: easy-first ordering, the explicit per-placement
cleanup when auto-pencil is off, and the harder combined deductions (sets, forcing chains,
cages, inequality/sightline clues) reached only when no easier move remains.

This applies to every candidate-elimination game with a region-uniqueness populate (Towers,
Unequal, Keen, Solo). A game whose hint has no such populate (Undead) is unaffected.

#### Scenario: A hint's populate fills then bulk-clears the obvious candidates

- **WHEN** an auto-played hint populates the notes on a board carrying placed values
  (givens, or placements the plan made before populate)
- **THEN** the populate journey first fills `1..n` in every empty cell, then strikes in one
  `continuesPrevious` step every candidate already placed in its row/column/region, leaving
  the same notes the adaptive Mark-all control would produce — and the plan does not afterward
  re-teach those obvious eliminations individually

#### Scenario: The cleaned-note plan still replays and refreshes

- **WHEN** the populate-plus-clean journey is followed, undone/redone, or re-requested
- **THEN** the `pencilStrike` cleanup replays exactly (its marks were baked at plan time),
  `hintKeepTrack` and `refreshHintStep` treat it as an ordinary strike step, and the hint
  resume guarantees hold

### Requirement: The engine exposes each game's custom-params configuration UI

The engine SHALL let a game describe its **custom-params** configuration form so
the app's "Custom type…" dialog can edit the game's parameters, mirroring the
per-game preferences surface. The `Game` interface SHALL define an optional
declarative `paramConfig`: an ordered list of field descriptors, each with a
stable keyword, a display name, a type (`string` for a text field — e.g. a numeric
width/height — `choices` for a select, or `boolean` for a checkbox), and
`get`/`set` accessors over the game's `Params`. A shared width/height helper SHALL
supply the common dimension fields so a plain w/h game declares them in one line.

The `Midend` SHALL build the app's `ConfigDescription` and initial `ConfigValues`
from `paramConfig` and the current params, and SHALL apply a submitted form by
mapping the values back onto a copy of the params, validating them with the
game's own `validateParams`, and — on success — adopting the new params (so the
app generates a new game) or — on failure — returning the validation error string
without applying. The worker-side adapter SHALL forward these to the midend rather
than return an empty configuration. A game that declares no `paramConfig` keeps an
empty custom dialog (correct for a preset-only game).

This is independent of the type-summary `describeParams` hook (which renders the
menu label, not the form) and of the preferences surface.

#### Scenario: A width/height game's custom dialog is populated and applied

- **WHEN** the "Custom type…" dialog is opened for a TS game that declares
  `paramConfig` (e.g. width/height)
- **THEN** the form shows a field per descriptor initialised from the current
  params
- **AND** submitting valid values validates them with the game's `validateParams`
  and generates a new game at those params

#### Scenario: An invalid custom value is rejected with the game's message

- **WHEN** the submitted values fail the game's `validateParams`
- **THEN** the engine returns the validation error string and does not change the
  current params

#### Scenario: A game without paramConfig keeps an empty dialog

- **WHEN** a TS game declares no `paramConfig`
- **THEN** its custom dialog is empty and no fields are shown (unchanged behaviour)

### Requirement: A shared deduction-fixpoint scaffold

The engine SHALL provide a reusable deduction-fixpoint runner (in
`src/native/engine/`) that a logic game's solver and its explained hint share, so
the ordered-rung loop, the difficulty cap, the optional recorder threading, and
the non-termination step-budget are written **once** rather than hand-rolled per
game. The runner SHALL take an ordered list of technique rungs (each reporting
whether it changed the board), an optional maximum rung (to cap grading at a
tier's needed rung), and an optional recorder that, when present, gates every
reason allocation so the generation path stays byte-for-byte unchanged and, when
absent, runs unguarded. The runner SHALL tick a step budget once per iteration
**only** on the recording (hint) path, so a non-terminating fixpoint throws a
labelled error while the generator runs unbudgeted.

The technique rungs themselves remain per-game (each game's deductions are its
own); only the loop, cap, recorder-gating, and budget are shared. Games that
currently hand-roll this loop (Filling, Pattern, Undead, and the Latin core)
SHALL converge onto the shared runner without changing their techniques, order,
or verdicts.

#### Scenario: The generation path is unchanged by the shared runner

- **WHEN** a game's solver runs through the shared runner with no recorder
- **THEN** it reaches the same solved/stuck verdict (and, where graded, the same
  difficulty) as before the extraction
- **AND** its differential / behavioural regression suite stays green

#### Scenario: The hint path records off the same runner

- **WHEN** the same game runs the shared runner with a recorder on the hint path
- **THEN** each firing is recorded with its technique and premise in solver order
- **AND** a non-terminating fixpoint on the hint path throws a labelled
  step-budget error rather than hanging

### Requirement: A hint step always names a technique — no un-narrated fallback

A displayed hint step SHALL always explain *why* its move is forced by a named
technique; a game's hint SHALL NOT emit a generic, unexplained "fallback" step
(e.g. "only one arrangement fits") for a deduction its technique set does not
cover. A game SHALL satisfy this by one of two strategies: **narrating every
deduction** its generator accepts (promoting any catch-all into an honest, if
non-local or tedious, technique — as Filling narrates its global
candidate-elimination), or **rejecting at generation** the boards whose solution
needs a deduction it cannot narrate (see the `ts-migration` narratable-deduction
generation policy). This is the Hint-System companion to that generation policy.

This requirement governs deductive (logic) games. Movement/objective games whose
hint is heuristic or an `aux`-walk carry an intentionally empty or imperative
explanation and are exempt; an explicitly-named `Unreasonable` tier MAY carry a
non-deductive hint on boards that require guessing.

#### Scenario: A logic game's hint never shows an unexplained step

- **WHEN** a hint plan is computed for any non-`Unreasonable` board of a deductive
  game
- **THEN** every step names the technique that forces it (its explanation is not a
  generic "only one arrangement fits" placeholder)

#### Scenario: A movement game's hint is exempt

- **WHEN** a movement/objective game (no deductive "why") returns a hint
- **THEN** an empty or imperative explanation is permitted and is not a violation

