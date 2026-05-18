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

