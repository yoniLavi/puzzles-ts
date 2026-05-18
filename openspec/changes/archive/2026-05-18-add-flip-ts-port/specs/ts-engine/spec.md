## ADDED Requirements

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
