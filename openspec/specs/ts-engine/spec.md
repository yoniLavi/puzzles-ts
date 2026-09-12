# ts-engine Specification

## Purpose
The native-TypeScript puzzle engine: the single idiomatic `Game`
interface every port implements, the `Midend` that orchestrates a game
behind the existing Comlink surface, the runtime per-game registry
that is the hybrid TS-vs-C/WASM decision point, the clean TS-native
save format, and the behavioral (corpus-free) test discipline for the
engine. This is the keystone the `ts-migration` doctrine mandates
before any game port; it realizes that doctrine's "midend precedes
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

The midend SHALL provide the app-facing Comlink surface (new game, new game from
ID, restart, process key/mouse, undo, redo, solve, redraw, presets, status,
serialize/deserialize, timer) and SHALL emit the change-notification shapes the
app consumes. The app shell, screen, dialog, drawing-canvas, and store code SHALL
NOT require changes to drive a game.

This requirement previously read "SHALL reproduce the existing Comlink
`WorkerPuzzle` API surface" — that class was the C/WASM implementation, and it
was deleted by `retire-c-engine`. The obligation is unchanged in substance; it is
simply no longer defined by reference to a second implementation, because there
is only one. `PuzzleEngineSurface` is where the shape is stated.

#### Scenario: A game is driven through the unchanged app surface

- **WHEN** the app opens a game
- **THEN** it drives it through the same Comlink surface and change
  notifications it used before the C engine was retired
- **AND** no app-shell, screen, dialog, drawing-canvas or store code changed to
  make that so

### Requirement: Per-game engine selection is a runtime registry, not a build flag

The engine SHALL resolve a game's implementation at runtime through a registry
keyed by `puzzleId`, populated by `registerGame(...)` side effects — never
through a build flag, and never per-game at build time.

The registry began as a *selection* mechanism: present meant "served by the TS
midend", absent meant "fall back to C/WASM", and it shipped empty so production
was unchanged until the first port registered itself. `retire-c-engine` removed
the alternative, so there is nothing left to select between: a `puzzleId` absent
from the registry is **unplayable**, not delegated. The worker SHALL fail
explicitly for an unregistered id rather than falling through.

Because the registry is now the *only* answer to "which games exist", it SHALL
agree with the catalog exactly, in both directions — every cataloged game is
registered, and every registered game is cataloged — and that SHALL be asserted
by a test rather than left to discipline.

#### Scenario: An unregistered puzzle id fails explicitly

- **WHEN** the worker is asked for a `puzzleId` with no registered `Game`
- **THEN** it raises an error naming the id
- **AND** no fallback implementation is attempted

#### Scenario: Catalog and registry cannot drift

- **WHEN** a game is added to the catalog but not registered, or registered but
  not cataloged
- **THEN** the gate fails

### Requirement: The engine uses a clean TS-native save format

The midend SHALL serialize and restore a game using a clean,
versioned TypeScript-native format (a version-tagged envelope carrying
the puzzle id, parameters, game id, the move list, timer elapsed, and
checkpoints). Restoration SHALL reconstruct history by replaying the
saved moves. The format SHALL NOT be required to be compatible with
the C `midend_serialise` format, and loading a pre-pivot C-format save
SHALL NOT be required (consistent with the `ts-migration` decision
that old saves and pre-pivot shared IDs are expendable). Saving and
restoring SHALL round-trip: a restored game SHALL have the same state
and history as the saved game.

The envelope SHALL spell the solver-was-used flag as every game's state spells
it (see "One completion vocabulary across games"), so that one word means one
thing from a game's state through to the saved bytes.

**A version bump SHALL come with an upgrade, not a rejection**, whenever the
older shape carries the same facts: the decoder SHALL lift an older envelope to
the current shape before validating it, so an existing save keeps working. The
validator SHALL then describe only the current shape, so it cannot drift into
blessing both. An envelope the decoder cannot lift — a *future* version, or an
older one whose fields are missing or malformed — SHALL still be rejected.

#### Scenario: Save/restore round-trips

- **WHEN** a TS-engine game is saved and then restored from that data
- **THEN** the restored game has identical state, move history, and
  redo availability
- **AND** the saved payload carries a format version field

#### Scenario: C-format save is not required to load

- **WHEN** a payload produced by the pre-pivot C-serialization path is
  presented to the TS midend
- **THEN** the midend is NOT required to load it
- **AND** this is not treated as a defect

#### Scenario: An older envelope is upgraded, not discarded

- **WHEN** a save written under the previous envelope version is loaded
- **THEN** it is lifted to the current shape and restores normally
- **AND** the retired field name is gone from the result rather than carried
  alongside the new one

#### Scenario: An envelope that cannot be lifted is still rejected

- **WHEN** the payload names a version the decoder does not know, or an older
  version whose fields are missing or of the wrong type
- **THEN** decoding fails

### Requirement: Midend correctness is established by behavioral tests, not a corpus

Midend correctness SHALL be established by behavioral and property
tests driven by a small in-repo fake `Game`, NOT by a byte-identical
characterization corpus. The suite SHALL cover undo/redo invariants,
history truncation after a move following an undo, status transitions,
change-notification emission, timer accumulation, preset-tree parsing,
and save/restore round-tripping. This applies the `ts-migration`
"accepted without a golden corpus" discipline to the engine itself.

#### Scenario: The midend is validated without a golden corpus

- **WHEN** the engine layer is implemented
- **THEN** its tests drive a fake `Game` and assert behavioral
  invariants (including `undo` after a move restoring the prior state)
- **AND** no characterization corpus captured from the C build is
  required for the midend to be accepted

### Requirement: The `Game` drawing, color, and input-feedback contract is fully specified

The engine SHALL fully specify the drawing surface, UI-only input
feedback, and color derivation that the keystone left as a minimal
placeholder for the first real port to fix, as follows.

- `GameDrawing` SHALL expose the full puzzle drawing API — filled
  rectangle, line, polygon, circle, text, clip/unclip,
  start/end-draw, draw-update, and the blitter save/restore quartet —
  with the same coordinate and palette-index semantics the existing
  canvas drawing surface already honors. The existing canvas
  `Drawing` SHALL satisfy `GameDrawing` structurally without
  modification. The engine SHALL NOT impose a full-vs-incremental
  redraw policy; redraw optimization (per-element diffing,
  first-draw-only setup) is the game's own concern, as in upstream.
- `interpretMove` SHALL be able to report a UI-only change (cursor or
  other UI state changed in place) distinctly from "a move" and from
  "nothing happened". The midend SHALL, on a UI-only result, redraw
  and notify without creating a history entry; on "nothing happened"
  it SHALL do nothing; on a move it SHALL apply it to history.
- A game's `colors` SHALL receive the frontend default background
  color, and the engine SHALL thread that default from the worker
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

- **WHEN** the app requests the color palette with its default
  background
- **THEN** the game receives that background and returns a palette
  derived from it (not a hardcoded background)

### Requirement: The worker exposes one shared puzzle-engine surface

The worker SHALL expose exactly one puzzle-engine implementation — the
TS-midend-backed puzzle — behind the `PuzzleEngineSurface` interface the app
drives over Comlink. With the C engine retired, the C/WASM-backed
implementation, the WASM-instantiation path, and the leaf-bridge coherence
check SHALL be removed, and the worker's dispatch SHALL always construct the TS
engine rather than choosing between two implementations.

`PuzzleEngineSurface` SHALL be retained (or inlined) so the app-facing remote
puzzle type keeps the same shape it had; removing the C implementation SHALL NOT
require changes to `src/screens/`, `src/dialogs/`, `src/puzzle/puzzle.ts`, the
drawing canvas, or `src/store/`.

#### Scenario: The worker constructs the TS engine unconditionally

- **WHEN** the worker opens any game
- **THEN** it constructs the TS-midend-backed puzzle
- **AND** there is no C/WASM implementation or WASM-coherence check to select
  between

#### Scenario: The app's remote type is unchanged by the removal

- **WHEN** the C implementation is removed
- **THEN** the app-side remote puzzle type keeps the same shape
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

#### Scenario: Flip is cataloged but has no wasm

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
  clear the canvas but invalidates the color/font choices baked
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

### Requirement: The engine provides a shared color-mkhighlight helper

The engine SHALL provide `mkhighlightBackground(bg: Color): Color` in `src/engine/color/color-mkhighlight.ts`, implementing the `misc.c` `game_mkhighlight_specific` background-adjustment logic with the near-white epsilon fix. Every white/black-tile game SHALL be able to import and use this instead of re-deriving it locally.

#### Scenario: A game imports the shared mkhighlightBackground

- **WHEN** a game's `colors()` method receives a default background that is near-white
- **THEN** `mkhighlightBackground` shifts the background away from pure white so that a pure-white tile color is visibly brighter
- **AND** the game does not contain a local copy of the highlight logic

### Requirement: The engine provides a shared disjoint-set forest (dsf)

The engine SHALL provide the `Dsf` class in `src/engine/dsf.ts`, promoted from the Galaxies local implementation. The class SHALL support `constructor(n)`, `reinit()`, `canonify(i)`, `merge(a, b)`, `size(i)` (the number of elements in `i`'s class), and `equivalent(a, b)` (whether `a` and `b` share a class) with path compression and union-by-size. Games that need union-find SHALL import from this shared location.

#### Scenario: A game imports the shared Dsf

- **WHEN** a game needs disjoint-set operations
- **THEN** it imports `Dsf` from `src/engine/dsf.ts`
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

**Hint-authoring convention — element-type color legend.** When a game's hint
narration names **more than one distinct kind of board element** (e.g. a filled
cell as premise versus the forced cell as conclusion, or a clue versus a
region), the game's `redraw` SHALL distinguish those types with a **stable
per-game color legend**: each element type is assigned one highlight color used
consistently across all that game's hints (so the legend is learnable), and only
the types a given hint actually names are highlighted. Each legend color SHALL
be paired with a **non-color cue** (ring versus shade versus fill, the drawn
digit/clue, or position) so the type mapping survives for colorblind players —
color SHALL NOT be the sole carrier, and color names SHALL NOT appear in the
narration text. This convention is orthogonal to "equivalent moves share a
color": equivalent *forced moves* still share the single target color; the
legend governs *premise/element types*.

A non-deductive game (no technique to teach) MAY instead derive its plan from
the known solution via `aux`: it is a legitimate hint strategy to walk the
player to the unique solution. Such a game SHOULD prefer the `aux`-derived plan
when `aux` is present (guaranteeing the plan completes) and MAY fall back to a
local heuristic when it is absent.

#### Scenario: A hint naming multiple element types colors them by a stable legend

- **WHEN** a game's displayed hint step narrates two distinct board-element
  types (for example a cited filled/decided premise cell and the forced target
  cell)
- **THEN** `redraw` highlights each type in its own legend color, paired with a
  distinguishing non-color cue, rather than rendering both in the single target
  color

#### Scenario: A legend color is the same across different hints of one game

- **WHEN** two different hints of the same game each name the same element type
  (for example "a shaded square" appears as a premise in two different
  deductions)
- **THEN** that element type is drawn in the same legend color in both hints

#### Scenario: Requesting a hint from the midend

- **WHEN** the user requests a hint via `midend.hint()` with no active plan,
  on a game that implements the `hint` method
- **THEN** the midend computes a plan once, stores it with index 0, appends
  the first step's explanation to the status bar, and schedules a repaint

### Requirement: The engine provides shared pointer button constants

The engine SHALL provide button code constants (`LEFT_BUTTON`, `RIGHT_BUTTON`, `RIGHT_DRAG`, `RIGHT_RELEASE`, cursor keys, etc.) in `src/engine/pointer.ts`, matching the values in the engine's own `types.ts` `PuzzleButton`. These SHALL be plain `const` values (not an enum) so advisory diff scripts can import them under Node's strip-only TS loader.

#### Scenario: A game imports shared button constants

- **WHEN** a game's `interpretMove` function receives a button number
- **THEN** it compares against the shared constants from `pointer.ts` instead of locally-declared values
- **AND** no game file contains duplicate button code declarations

### Requirement: The engine provides a full mkhighlight palette helper

The engine SHALL provide `mkhighlight(bg: Color): { background: Color; highlight: Color; lowlight: Color }` in `src/engine/color/color-mkhighlight.ts`, implementing the full `misc.c` `game_mkhighlight` derivation: the background is adjusted via `mkhighlightBackground`, then the highlight is shifted from the adjusted background toward white by K = sqrt(3)/6 and the lowlight toward black by K. Per upstream, when the background is within K of white the highlight SHALL saturate to pure white, and when within K of black the lowlight SHALL saturate to pure black. Games needing the standard bg/highlight/lowlight trio SHALL destructure this helper instead of re-deriving the colors locally.

#### Scenario: A game derives its palette from the shared helper

- **WHEN** a game's `colors()` method calls `mkhighlight(defaultBackground)`
- **THEN** it receives background, highlight, and lowlight colors matching upstream `game_mkhighlight`, with the highlight strictly brighter and the lowlight strictly darker than the background
- **AND** the game contains no local copy of the highlight/lowlight math

#### Scenario: Light host backgrounds get a pure-white highlight

- **WHEN** the host background is white or near-white
- **THEN** the highlight saturates to pure white instead of collapsing into the adjusted background (the defect the previous per-game inline copies had)

### Requirement: The engine provides a shared leading-integer param parser

The engine SHALL provide `parseLeadingInt(s: string, start: number): { value: number; next: number }` in `src/engine/params.ts`, returning the integer formed by the maximal digit run starting at `start` (0 when the run is empty) and the index of the first non-digit character. Games whose `decodeParams` walks an upstream-format param string SHALL import this instead of declaring a local copy.

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
in `src/engine/geometry.ts`, implementing the upstream `COORD` /
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
| null` in `src/engine/pointer.ts`, returning the unit grid delta for the
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
returns coordinates and never owns or mutates a game's `ui`.

`gridCursorMove` is the primitive beneath the shared cursor, not the interface a
game reaches for. A game holding an ordinary bounded-grid cursor SHALL drive it
through `moveCursor` (see "One keyboard-cursor vocabulary across games"), which
owns the position, the reveal and the changed-tracking together. `cursorDelta`
and `gridCursorMove` remain for a **traversal** that is not a bounded clamp —
obstacle-skipping, lock modes, half-cell coordinates, non-positional rolling
cursors — and for whatever a game does *while* the cursor moves.

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
  `sixteen`'s `moveCursor`) are deleted in favor of it
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
lowlight)` in `src/engine/draw.ts`, where `bounds` is the playfield's
outer pixel box (`{ left, top, right, bottom }`, edges inclusive), `inset` is the
bevel depth (the tile size), and `highlight`/`lowlight` are the two palette
colors. It SHALL draw the upstream two-pentagon recessed bevel — a top-right
highlight wedge and a bottom-left lowlight wedge — in one canonical winding.
Games that draw a beveled frame SHALL call this helper, each supplying its own
edge derivation, instead of re-deriving the polygons locally. Per-game extras
that are not the bevel (e.g. a separator rectangle just outside the grid) SHALL
remain at the call site.

#### Scenario: A beveled game draws its frame through the helper

- **WHEN** a game with a recessed border (e.g. Fifteen, Sixteen, Twiddle,
  Samegame, Flood) draws its first frame
- **THEN** it calls `drawRecessedBorder` with its computed bounds, tile size, and
  highlight/lowlight colors
- **AND** the two filled pentagons cover the same pixels the game's prior private
  copy did (the lowlight wedge is winding-independent, so traversal order does not
  change the filled region)

### Requirement: The engine provides a shared rectangle-outline drawing helper

The engine SHALL provide `drawRectOutline(dr, x, y, w, h, color)` in
`src/engine/draw.ts`, drawing a 1px-thick rectangle border via four lines
using the upstream-faithful **inclusive** convention (corners `(x,y)` to
`(x+w−1, y+h−1)`), matching upstream `draw_rect_outline`. Games drawing a
rectangle outline (cursor markers, cell borders) SHALL call this helper instead
of carrying a private copy or inlining the four `drawLine` calls.

#### Scenario: A caller draws an inclusive-convention outline

- **WHEN** a game calls `drawRectOutline(dr, x, y, w, h, color)`
- **THEN** the border spans `(x, y)`..`(x+w−1, y+h−1)` inclusive
- **AND** a caller that previously used an exclusive `x+w` convention adjusts its
  width/height argument so its drawn pixels are unchanged

### Requirement: The engine provides a shared permutation-parity helper

The engine SHALL provide `permParity(perm: Int32Array, n: number): number` in
`src/engine/shuffle.ts`, returning the parity (0 or 1) of the number of
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
  Check & Save populates) so the offending cells render in the mistake color
- **AND** the refusal message is still returned to the caller

#### Scenario: A refusal unrelated to mistakes highlights nothing

- **WHEN** a hint is refused on a board with no mistakes (e.g. already solved)
- **THEN** the mistake overlay stays empty and no cell is highlighted

### Requirement: The engine provides shared keyboard modifier-mask constants

The engine SHALL provide the keyboard modifier-mask constants `MOD_MASK`
(`0x7800`), `MOD_NUM_KEYPAD` (`0x4000`), `MOD_SHFT` (`0x2000`), and `MOD_CTRL`
(`0x1000`) in `src/engine/pointer.ts`, matching upstream's `puzzles.h`
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
number; h: number; next: number }` in `src/engine/params.ts`, built on
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
realization of upstream's `get_prefs`/`set_prefs`. The `Game` interface
SHALL define an **optional** declarative `prefs` member: an ordered list
of preference items, each carrying a stable keyword (`kw`), a
human-readable `name`, a discriminated `type` (`"boolean"` or
`"choices"`, with `choices` items carrying the ordered choice labels),
and `get`/`set` accessors that read and write the preference's value on
the game's **`Ui`** value (preferences live on the `Ui`, exactly as
upstream stores them on `game_ui`, so `interpretMove` and `redraw` see
them). A game with no preferences SHALL omit `prefs`, and the engine
SHALL report an empty preferences set for it — the correct behavior for
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
the existing settings store). The engine SHALL NOT carry a binary
`savePreferences`/`loadPreferences` surface. It existed only to mirror
upstream's `midend_serialize_prefs` across the C/WASM boundary; the app has
never used it for persistence, and the TS adapter answered it with an empty
buffer — a method that silently returned nothing rather than refusing, which is
worse than its absence. If an import/export feature is ever wanted it SHALL
choose its own wire format rather than inherit the C's.

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
instead **remove the obvious candidates** — every penciled value equal to a value
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
Undead) SHALL keep the fill-only behavior.

#### Scenario: A pencil-mark game shows the control and fills candidates

- **WHEN** the active game reports `canMarkAll` true and the player activates
  the toolbar control
- **THEN** the `M` key is injected via `processKey`, the game fills every empty
  cell with all candidate pencil marks, and the board repaints

#### Scenario: A second press on a fully-noted board removes obvious candidates

- **WHEN** every empty cell is already fully noted and the player activates the
  mark-all control on a game with uniqueness regions
- **THEN** the action emits a `pencilStrike` that removes exactly the penciled
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

- **WHEN** the game is Keen and a cell's penciled value also appears in its cage but
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
When false the behavior is unchanged — the executed step stays displayed
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
its cell, never in the same color as the cell's own background fill, so the
element it references remains visible rather than appearing already-resolved.

#### Scenario: Showing a hint leaves the board unchanged

- **WHEN** the player requests a hint (the show, not an apply)
- **THEN** the game state is byte-for-byte unchanged — only highlighting is added
- **AND** a struck/acted-on candidate remains visible (its highlight contrasts
  with the cell background), not hidden behind a same-color fill

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
The shared classifier (`src/engine/latin-hint.ts`) distinguishes three kinds,
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

The engine SHALL provide a shared module (`src/engine/candidate-hint.ts`) that
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

The placement-classifier in `src/engine/latin-hint.ts` (which re-derives whether a
recorded generic `single` placement is a naked single, a hidden single, or a forced
single — see the "Latin-family hints distinguish naked, hidden and forced singles"
requirement) SHALL generalize to an arbitrary **region list**, so a game reasoning over
sub-blocks and diagonals (Solo) classifies a hidden single in any of its regions, while
the row/column games pass only `[row, column]` and are unchanged.

Routing a game's hint through the shared module SHALL be behavior-preserving: the
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
(an empty list), unchanged from prior behavior.

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

The shared candidate-elimination module (`src/engine/candidate-hint.ts`) SHALL
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

Routing a game's hint through the shared region helper SHALL be behavior-preserving: the
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

The shared candidate-elimination module (`src/engine/candidate-hint.ts`) SHALL
provide a `candidateHint` entry that owns the `Game.hint` control flow common to every
candidate-elimination game: refuse on a completed board, refuse (with the standard
message) when the game's `findMistakes` reports any mistake, read the `autoPencil`
preference (defaulting off, per the games' default-auto-pencil-off preference), build the
plan via the game's `buildSteps`, refuse when the
plan is empty, and otherwise return the steps. The standard refusal and empty-plan
messages SHALL live in this one place. A game's `hint` SHALL be a one-line call passing
its own `findMistakes` and `buildSteps`; routing through it SHALL be behavior-preserving.

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
timing keeps its own. Delegation SHALL be behavior-preserving.

#### Scenario: A fresh solve flashes; other transitions do not

- **WHEN** a move solves a previously-unsolved board with no cheat used
- **THEN** `winFlash` returns the flash duration; for an already-solved board, a non-solving
  move, or a cheated solve it returns `0`, matching the per-game `flashLength` it replaced

### Requirement: A shared narrator for generic Latin deduction reasons

When adopted, the shared hint-text module (`src/engine/hint-text.ts`) SHALL
provide a `narrateLatinReason(reason, ns)` that renders the *generic* Latin deduction
reasons whose narration is identical across the **row/column** Latin games (`single`,
`hiddenSingle`, `forcedSingle`, `dup`, `set`, `forcing`). A row/column game (Keen, Unequal)
SHALL delegate those arms to the shared narrator and keep its game-specific arms (cages,
inequality/adjacency clues) local. Delegation SHALL be behavior-preserving — the rendered
narration strings are byte-identical to before, asserted by each game's hint suite.

A game whose generic-arm wording legitimately diverges SHALL keep its own `narrate` rather
than carry overrides into the shared narrator: **Solo** (its `single`/`dup`/`forcedSingle`
name "row, column and block" and its `hiddenSingle` names a block/diagonal region) and
**Towers** (it narrates the whole family in "height" vocabulary with a single value, not an
`ns` list) are conformingly left local. The requirement is satisfied either by the shared
narrator (for the games where the arms are verbatim-identical) **or** by a recorded decision
in `docs/games/hints.md` that a given game's arms were left per-game because the
override surface made a shared narrator less readable — both are conforming outcomes.

#### Scenario: A delegated generic arm narrates identically

- **WHEN** a game routes a generic Latin reason (`single` / `set` / `forcing`) through the
  shared narrator
- **THEN** the produced sentence is byte-identical to the prior per-game string and the
  game's hint suite passes with no change

### Requirement: Candidate-elimination hints clean obvious candidates at populate

A candidate-elimination game's hint plan SHALL, once pencil notes first exist on the working
board — whether the plan just populated them or the board was already noted — emit one
bulk **obvious-candidate cleanup** step that removes every penciled value already placed in
one of its cell's uniqueness regions, as the adaptive "fill all pencil marks" control's
second press does (`obviousCandidateMarks` over the game's `regionsOf`). The cleanup SHALL be
a single `pencilStrike` step (the marks baked into it at plan time), SHALL be flagged
`continuesPrevious` when it directly follows the populate fill so "fill, then clear the
obvious ones" reads and auto-plays as one setup journey (and stand alone when the board was
already noted), and SHALL fire at most once per plan. An empty cleanup (nothing obvious to
remove) SHALL emit no step. The struck marks SHALL be applied to the plan's working notes so
the rest of the walk sees the cleaned board. The shared engine helper `emitObviousCleanStep`
(`src/engine/candidate-hint.ts`) SHALL own this emission so every such game produces
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
- **THEN** the form shows a field per descriptor initialized from the current
  params
- **AND** submitting valid values validates them with the game's `validateParams`
  and generates a new game at those params

#### Scenario: An invalid custom value is rejected with the game's message

- **WHEN** the submitted values fail the game's `validateParams`
- **THEN** the engine returns the validation error string and does not change the
  current params

#### Scenario: A game without paramConfig keeps an empty dialog

- **WHEN** a TS game declares no `paramConfig`
- **THEN** its custom dialog is empty and no fields are shown (unchanged behavior)

### Requirement: A shared deduction-fixpoint scaffold

The engine SHALL provide a reusable deduction-fixpoint runner (in
`src/engine/`) that a logic game's solver and its explained hint share, so
the ordered-technique loop, the difficulty cap, the optional recorder threading,
and the non-termination step-budget are written **once** rather than hand-rolled
per game.

**A technique is a declaration, not a closure.** The runner SHALL take an
ordered list of techniques, each declaring a stable `id`, the difficulty `tier`
it belongs to, and a `run` reporting whether it changed the board (`> 0` fired,
`0` nothing to do, `< 0` contradiction proved). Both `id` and `tier` SHALL be
required: a ladder states its own tiers rather than encoding them in array
positions, and states its own names rather than leaving a reader to count.

**The grade and the cap are tiers, never positions.** The runner SHALL report as
the grade the highest `tier` among the techniques that fired, and SHALL accept an
optional maximum *tier* that excludes every technique above it **wherever it sits
in the ladder** — so a cheap technique placed after an expensive one is still
run under a low cap. Grading a board SHALL NOT depend on a technique's index.

**A conditionally-available technique SHALL guard itself inside `run` and return
`0`.** The runner SHALL NOT provide an availability predicate: such a predicate
would be indistinguishable in effect from returning `0`, so it would exist only
to document, and one option per game is how this runner becomes a configuration
language. A game whose technique applies only under a board rule (a variant
mode) or only at one exact tier expresses that in its own `run`.

**The runner SHALL accept an optional early-out meaning "the ladder should stop,
because there is nothing left for it to do"**, checked at the top of every
iteration so no technique is attempted on an already-settled board. This SHALL
NOT be specified as "solved": most callers use it to stop on a contradiction, on
a refuted board, or on an action budget the game itself imposes, and a name
narrower than its meaning obliges every reader to consult the doc comment.

The runner SHALL also accept an optional recorder that, when present, gates every
reason allocation so the generation path stays byte-for-byte unchanged and, when
absent, runs unguarded. The runner SHALL tick a step budget once per iteration
**only** on the recording (hint) path, so a non-terminating fixpoint throws a
labeled error while the generator runs unbudgeted. **When a budget is present the
runner SHALL attribute a non-termination to the technique responsible**, naming
the techniques by firing count in the thrown error; when no budget is present it
SHALL count nothing, so the generation path allocates nothing extra.

The techniques themselves remain per-game (each game's deductions are its own);
only the loop, cap, recorder-gating, budget and attribution are shared. Games
that hand-roll this loop SHALL converge onto the shared runner without changing
their techniques, order, or verdicts.

**A game that does not fit SHALL have its reason recorded against this contract,
and that record SHALL be re-derived rather than carried forward when the contract
changes** — a reason that a game did not fit an earlier runner is not evidence
about the current one. A recorded reason SHALL name **a promise this runner makes
that the game must break**; a description of the game's loop shape is not such a
reason. Adoption SHALL require no new option on the runner: a game that would
need one stays bespoke.

**A bespoke loop SHALL carry three obligations, recorded per game rather than
assumed**: every board it accepts remains walkable to completion by a hint
projection, its tiers bind to real technique differences, and a non-terminating
recording path fails loud. An obligation that is **vacuous** rather than
satisfied SHALL be recorded as unmet.

#### Scenario: The generation path is unchanged by the shared runner

- **WHEN** a game's solver runs through the shared runner with no recorder
- **THEN** it reaches the same solved/stuck verdict (and, where graded, the same
  difficulty) as before the extraction
- **AND** its differential / behavioral regression suite stays green

#### Scenario: The hint path records off the same runner

- **WHEN** the same game runs the shared runner with a recorder on the hint path
- **THEN** each firing is recorded with its technique and premise in solver order
- **AND** a non-terminating fixpoint on the hint path throws a labeled
  step-budget error rather than hanging

#### Scenario: Two techniques sharing one tier grade alike

- **WHEN** a ladder declares two techniques at the same `tier` and only the later
  one fires
- **THEN** the reported grade is that shared tier, not the technique's position
  in the ladder

#### Scenario: A cap excludes by tier, not by position

- **WHEN** a ladder places a low-tier technique after a high-tier one and runs
  under a cap below the high tier
- **THEN** the high-tier technique is skipped and the low-tier one still runs

#### Scenario: A runaway technique is named

- **WHEN** a technique on the recording path reports progress without changing
  the board until the step budget trips
- **THEN** the thrown error names the techniques by firing count, so the
  responsible one is identified without bisecting the ladder

#### Scenario: The early-out stops a refuted board, not only a solved one

- **WHEN** a game's early-out reports that the board is refuted, or that a budget
  the game imposes on itself is spent
- **THEN** the ladder stops without attempting a further technique, exactly as it
  does for a completed board

#### Scenario: A recorded no-go is re-derived, not copied, when the contract moves

- **WHEN** the runner's contract changes such that a previously recorded reason
  no longer names a promise the game must break
- **THEN** that game is re-derived against the new contract, and adopts it if
  adoption needs no new option on the runner

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

**A search is not a technique, but a chain is — if it is walked.** A deduction
that reaches its conclusion through a hypothesis SHALL be classified by whether
the reasoning is a **bounded run of individually glanceable steps**:

- **Check** — a contradiction visible **at the placement**, with no propagation.
  Ordinary deduction; narratable at any tier.
- **Tactic** — a **bounded** chain of forced consequences to a named endpoint.
  Permitted at a non-`Unreasonable` tier, and its hint SHALL **show the chain on
  the board** — every link marked, *in the order it falls*, with both ends
  anchored (the hypothesis and the contradiction) — rather than compressing it
  into a single claim the player can only check by redoing the deduction. The
  narration SHALL name the two ends and cite the links by their position, and
  SHALL supply the **rule that propagates the chain**, which is the technique
  being taught and is nowhere on the board. Where the conclusion rests on more
  than one branch of a case split, the narration SHALL say so; a conclusion that
  does not follow from its own stated premises is a defect.

  **The order is not optional and is not the marks' array position.** A set of
  marked cells with no order is not a chain — the narration's "then", "next" and
  "by the time you reach" name nothing the player can follow, which is the
  compressed-claim failure in a different costume. A game SHALL therefore declare
  each link's position as data its renderer reads, and that position SHALL reach
  the canvas.

  **The order SHALL be drawn as an ordinal, not as a path.** A line or arrow
  between consecutive links asserts that each forces the next, which is true of
  some chains and false of others — measured at **34%** false for Clusters, whose
  links are forced by their own neighborhood rather than by their predecessor in
  discovery order. One mark means one thing across the collection, so every game
  draws the weakest claim every chain can make: *this is the order they fall in*.

  A Tactic SHALL NOT be required to advance one leg at a time. That stricter
  reading — a display-only step per link, so the player is walked through one
  inference at a time — was designed, costed and **set aside by owner decision**
  (2026-08-12): holding a *hypothesis* in mind is acceptable, holding the *chain*
  is not, and marking the chain meets the weaker requirement without widening
  `HintStep` (whose `move` is required, and which 29 games' types live under).
- **Search** — running the whole solver from a hypothesis, or branching and
  backtracking. The hint SHALL NOT report its survivor as a deduction on any
  tier; it SHALL refuse, and the refusal SHALL say that deduction has run out
  rather than reading as a failure.

The test is therefore not whether a trial propagates, nor whether the technique
is called "forcing", but whether the propagation is bounded and can be laid out
for the player.

**A rung SHALL be classified by the bound it guarantees, not by the depth it
typically reaches.** Two rungs may be *the same function* invoked with different
limits and still fall on opposite sides of this line, and the observed
distributions may be indistinguishable at the median while differing entirely in
the tail. Where a game gates a rung on such a bound, that bound SHALL be defined
once and documented as load-bearing for the tier's name rather than as a
performance dial.

Where two rungs differ in this way but produce **the same narration** — so that a
wording check cannot tell them apart — the guarantee that the hint reaches only
the permitted one SHALL be structural and asserted directly (for instance, that
planning at the harder tier yields the same plan as planning at the permitted
one), with a control that prevents the assertion holding vacuously.

Games whose hints are **strategic** rather than deductive — a stable subgoal plus
the next move serving it, justified by a monotone potential rather than by force
— are outside this classification entirely and narrate imperatively.

The tier names follow the same line. A tier whose boards can require **Search**
SHALL be named `Unreasonable`; no other tier name may require it. A game whose
hard tier ships a propagating trial SHALL resolve it by whichever of these the
game's ladder determines — and **SHALL NOT delete the tier**:

- where a tier named `Unreasonable` already sits above the rung's tier, **the
  rung moves up to it**, and the lower tier is re-graded by what remains;
- where the rung's tier is the game's **top** tier, **that tier is renamed**
  `Unreasonable`;
- where emptying the tier would leave it with the same technique set as the tier
  below — so that no board can be solvable at it and not below, and the tier
  therefore generates nothing — the game SHALL first **build the missing
  deductive rung** and re-grade, then move the trial up.

"SHALL NOT delete the tier" is about tiers that **name boards**. Where a rename
would leave an ordering a player cannot read because a name above it belongs to a
tier that generates nothing — one already refused at generation on a measurement
— that name MAY be dropped from the tier list, provided its encoded difficulty
character still decodes and still round-trips, so that no existing game ID or
saved game changes meaning, and provided the refusal keeps its reason. Nothing a
player could previously play is thereby removed.

**A tier list SHALL have one definition per game**, read by the preset menu, the
difficulty contract and the custom-params dialog alike. A hand-copied second list
ships a menu and a dialog that disagree the first time a tier is renamed.

**Dropping a name from a declared tier list silently drops whatever cross-game
guard iterates that list.** A game that shortens its list SHALL re-establish the
lost guarantee in its own tests — at minimum that the undeclared tier's
difficulty character still round-trips.

A rung that moves SHALL be shown to leave its old tier still generable, at every
size the game offers, before the move is called done; a size/tier pair that
becomes ungenerable SHALL be refused by `validateParams` with a reason rather
than silently downgraded. A game MAY retain the trial at its upstream tier
behind a flag set by its differential and by nothing else, so that a frozen
byte-match oracle survives a divergence that changes every board on the affected
tier.

**A narration SHALL identify every element it refers to.** Where a displayed
step marks **more than one** element on the board, its narration SHALL NOT refer
to the acted-on element by a bare deictic alone ("this cell", "this square",
"here"): with two marks in view and no tie between them, such a phrase points at
neither, and the reader must infer the mark-role convention before the sentence
parses. The narration SHALL tie the acted-on element to the others by one of:

- a **relation the code guarantees** — "its ringed red *neighbor*", "the shaded
  brick *above*", "the end of the shaded run". A relation asserted in prose but
  not enforced in code is a false claim and is forbidden by the same rule that
  governs every other sentence a hint utters;
- a **value or other concrete identifier** the player can read off the board, in
  games that have one ("This 3 shares a line with the ringed white 3");
- a **role word tied to the mark's shape**, where the game's other marks already
  use distinct ones ("ringed" for an outline against "shaded" for a wash);
- a **number on the other marks**, where the step marks an ordered chain: the
  narration names those elements by their position and keeps the bare deictic for
  the one carrying no number. A numbered mark and an unnumbered one are not the
  same kind of thing, which is the general rule the three ties above are each an
  instance of.

A narration SHALL NOT identify an element by its **color**. Color is never the
only cue available to a player: the palette is scheme-relative by construction,
so a hue named in prose is wrong under the other scheme, and the sentence is
unreadable to a color-blind player. This holds even where the game's marks
differ only by hue — in that case the *marks* need fixing, not the sentence.

Where a step marks exactly one element, a bare deictic is correct and a
qualifier is noise.

This requirement governs deductive (logic) games. Movement/objective games whose
hint is heuristic or an `aux`-walk carry an intentionally empty or imperative
explanation and are exempt.

#### Scenario: A logic game's hint never shows an unexplained step

- **WHEN** a hint plan is computed for any board of a deductive game
- **THEN** every step names the technique that forces it (its explanation is not a
  generic "only one arrangement fits" placeholder)

#### Scenario: A step showing two marks says which one it is acting on

- **WHEN** a displayed hint step marks both the cell it acts on and a second
  element it reasons from
- **THEN** its narration ties the two together — by a relation the code
  guarantees, by a concrete value, or by distinct role words — rather than
  referring to the acted-on cell as "this cell" alone

#### Scenario: The tie is never a color name

- **WHEN** a narration must distinguish the acted-on element from another mark
- **THEN** it does so without naming either element's color, so the sentence
  stays true under both color schemes and to a reader who cannot distinguish
  the hues

#### Scenario: A single-mark step keeps its bare deictic

- **WHEN** a displayed hint step marks only the cell it acts on
- **THEN** "this cell" is sufficient and no disambiguating phrase is required

#### Scenario: A movement game's hint is exempt

- **WHEN** a movement/objective game (no deductive "why") returns a hint
- **THEN** an empty or imperative explanation is permitted and is not a violation

A game MAY still run the trial to **certify** a position — to establish that no
value the player has already entered is wrong, which some hints require before
offering any step at all. Certifying is not narrating: the plan records only the
deductions it may teach, and stops recording at the first point the trial is
needed, while the walk that produces the verdict continues.

#### Scenario: A search may certify a position but never teach one

- **WHEN** a game's hint must first establish that the player's board is still
  consistent with the unique solution, and doing so needs the propagating trial
- **THEN** the trial may run to produce that verdict, and the plan the player is
  shown contains only the steps up to the first point the trial was needed

#### Scenario: Deduction running out is refused, not guessed past

- **WHEN** the only remaining progress on a board needs a value assumed and the
  **whole solver** run from it, or a branch explored and backtracked
- **THEN** the hint refuses with a message saying deduction has run out, and
  does not present the surviving assumption as a technique

#### Scenario: A bounded chain is walked, not asserted

- **WHEN** a hint's next deduction is a bounded chain of forced consequences
  reaching a named contradiction
- **THEN** every link is marked on the board in the order it falls, with the
  hypothesis and the contradiction both anchored, and the narration names the two
  ends, cites the links by position and states the rule that propagates them —
  rather than one sentence asserting the conclusion
- **AND** where the conclusion rests on a case split, the narration states both
  branches
- **AND** the player walks it on the board at their own pace; the hint is not
  required to advance one link per step (`walk-tactic-hint-chains` D2 — the
  scenario keeps its name because renaming one is a deletion, and its THEN is
  what binds)

#### Scenario: A declared chain order reaches the canvas

- **WHEN** a hint step declares a position for each link of a chain
- **THEN** those positions are exactly `1..n`, and the frame drawn for that step
  paints every one of them in the ordinal's own color
- **AND** the check is made against the resolved color rather than a palette
  index or the bare glyph, since a candidate game already prints those digits as
  pencil marks

#### Scenario: Two strengths of one rung are classified separately

- **WHEN** a game applies the same trial function at two tiers, bounding the
  hypothesis' consequences at one and leaving them unbounded at the other
- **THEN** the bounded one is a Tactic and the unbounded one a Search, whatever
  their measured distributions look like on typical boards
- **AND** the game asserts structurally that its hint reaches only the bounded
  one, because both produce the same words

#### Scenario: A tier that can require guessing says so in its name

- **WHEN** a game's generator can emit, at a given tier, a board whose solution
  needs a propagating trial
- **THEN** that tier is named `Unreasonable`

#### Scenario: Moving a trial rung up leaves the tier below still generable

- **WHEN** a propagating rung is moved off a tier to the game's `Unreasonable`
  tier
- **THEN** every size the game offers still generates at the vacated tier, or
  that size/tier pair is refused by `validateParams` with a reason the player
  can read — the tier is never left silently unreachable, and never quietly
  downgraded to another difficulty

#### Scenario: A byte-match oracle survives the divergence

- **WHEN** moving the rung changes every description the affected tier generates
- **THEN** the game's differential may drive the generator and solver at
  upstream's rung placement through a flag it alone sets, so the frozen fixtures
  still match byte-for-byte over everything the move did not change

### Requirement: The engine provides a shared loop-finding helper

The engine SHALL provide `src/engine/findloop.ts`, an idiomatic TS
port of upstream `findloop.c` (Tarjan's bridge-finding algorithm, the
non-recursive linked-list variant): `findLoops(nvertices, neighbors)`
takes a neighbor callback `(vertex: number) => Iterable<number>` over an
undirected graph and returns `{ anyLoop, isLoopEdge(u, v),
isBridge(u, v) }`, where an edge is a loop edge exactly when it is not a
bridge (its removal would not disconnect its component) and `isBridge`
optionally reports the vertex counts on either side. Games needing
loop-error detection (Slant now; Bridges, Dominosa, Loopy, Tracks when
ported) SHALL consume this helper rather than re-rolling it.

#### Scenario: A cycle's edges are loop edges

- **WHEN** `findLoops` runs over a graph containing a cycle with a tail
- **THEN** `anyLoop` is true, every cycle edge reports `isLoopEdge` true,
  and the tail edge reports `isLoopEdge` false

#### Scenario: A forest has no loops

- **WHEN** `findLoops` runs over a multi-component tree graph
- **THEN** `anyLoop` is false and every edge is a bridge with correct
  vertex counts on each side

### Requirement: Fit-to-window sizing honors user-size expansion

`Midend.size(maxSize, isUserSize, dpr)` SHALL resolve the tile size as
upstream `midend_size` does: the largest integer tile size whose
`computeSize` result fits `maxSize` (binary search), where `isUserSize`
permits growing beyond the game's preferred tile size and its absence caps
the tile at the preferred size. The app shell passes `isUserSize = true`
(fill the layout slot), so a TS-served game SHALL occupy the same space the
C/WASM build did rather than freezing at its preferred size. The call
remains purely informational per the existing size requirement (no
drawstate recreation, no cache invalidation).

#### Scenario: A large slot expands the board

- **WHEN** `size` is called with user-size on a slot much larger than the
  preferred-size board
- **THEN** the resolved tile size exceeds the preferred tile size and the
  returned window size fits the slot

#### Scenario: Without user-size the preferred size is the ceiling

- **WHEN** `size` is called without user-size on the same large slot
- **THEN** the resolved tile size equals the preferred tile size

### Requirement: The engine surface exposes a per-game reference-aid capability

The engine surface SHALL expose an optional per-game "reference aid": a read-only
checklist of a puzzle's fixed inventory of pieces with found/outstanding status, plus a
way to spotlight one item on the board.

The `Game` interface SHALL define two optional hooks:

- `reference(state, ui): ReferenceModel` — returns a plain, serializable model of the
  inventory. `ReferenceModel` SHALL be `{ items: ReferenceItem[]; selected: string | null;
  columns?: number }`, and `ReferenceItem` SHALL be `{ key: string; label: string; pips?:
  readonly number[]; status: "outstanding" | "placed" | "conflict" }`. `key` is a stable id;
  `pips` is optional face-value data for games whose pieces render as pips; `selected`
  echoes the currently spotlighted key (or null).
- `selectReference(ui, key): boolean` — spotlights the item `key` (or clears it when `key`
  is null) by mutating `Ui`, and returns whether anything changed.

The `Midend` SHALL surface `hasReference = this.game.reference !== undefined` in its static
attributes, and SHALL provide `getReference(): ReferenceModel | null` (returning
`game.reference(state, ui)` or null) and `selectReference(key): void`. `selectReference`
SHALL call `game.selectReference(this.ui, key)` and, on a `true` return, take the same
repaint path as a `UI_UPDATE`: it SHALL NOT create a move, add an undo entry, alter the move
log, or be serialized into a save. For an unported C/WASM game `hasReference` SHALL be false,
`getReference()` SHALL return null, and `selectReference()` SHALL be a no-op.

`hasReference`, `getReference`, and `selectReference` SHALL be part of the shared
`PuzzleEngineSurface` so the same call site works for both the TS midend and C/WASM.

#### Scenario: A game exposing a reference is discoverable through the surface

- **WHEN** the active game defines `reference` and the app queries static attributes
- **THEN** `hasReference` is true and `getReference()` returns the game's model, whose
  `items` reflect current board state and whose `selected` matches the spotlighted key

#### Scenario: Selecting a reference item repaints without a history entry

- **WHEN** the app calls `selectReference(key)` on a game whose `selectReference` reports a
  change
- **THEN** the board repaints with that item spotlighted, and no move is added — the move
  log, undo/redo availability, and any subsequent save are byte-for-byte identical to before
  the call

#### Scenario: An unported game reports no reference

- **WHEN** the active game is served by C/WASM
- **THEN** `hasReference` is false, `getReference()` returns null, `selectReference()` does
  nothing, and no reference control is shown

### Requirement: The app shell shows a non-blocking, responsive reference panel

The app shell SHALL render a reference control in the same toolbar button group as Hint,
shown only when `hasReference` is true. Activating it SHALL toggle a `<reference-panel>`
open and closed like a disclosure (not a one-shot modal).

The panel SHALL be **non-blocking** and keep the board visible and interactive while open,
in both layouts:

- When there is room to dock beside the board — a wide viewport that is **not** in the
  app's short-landscape "horizontal" orientation — the panel SHALL dock beside the board
  (the board reflowing to make room), with no scrim over the board.
- On a narrow viewport, **or** in the app's "horizontal" orientation (short landscape,
  where a side dock would shove the board off-center against the toolbar column), the panel
  SHALL present as a bottom sheet, leaving the board visible and centered above it, with an
  explicit close affordance and no scrim.

The panel SHALL render each `ReferenceItem` with status-distinct styling (drawing `pips` as
piece faces when present, else `label`), reflect found status **live** as the board changes,
and on clicking an item SHALL toggle its selection and call `selectReference` with that item's
`key` (or null when deselecting). Selection feedback in the list SHALL be immediate and SHALL
NOT wait on the asynchronous model refresh.

The board spotlight SHALL **persist when the panel is closed** — on a small screen the common
flow is to mark a piece, close the (large) panel to see the board, then act on the highlight,
so closing MUST NOT clear it. The primary dismiss is therefore a **board interaction**: acting
on the board clears the spotlight (a game clears it in `interpretMove` on any board tap — the
discoverable, touch-friendly clear). Additionally, the **Escape** key SHALL clear it whether the
panel is open (leaving the panel open) or closed, and re-clicking the selected item also clears
it.

#### Scenario: The control appears only for a reference-bearing game

- **WHEN** the active game reports `hasReference` true
- **THEN** a reference toggle button is shown next to Hint; for a game reporting false, no
  such button is shown

#### Scenario: The panel keeps the board interactive and updates live

- **WHEN** the panel is open and the player places or removes a piece on the board
- **THEN** the board input is unaffected by the panel and the panel's checklist status
  updates to reflect the new board state without being reopened

#### Scenario: Clicking an item spotlights it on the still-visible board

- **WHEN** the player clicks an outstanding item in the open panel
- **THEN** the item shows as selected immediately and the board (still visible beside or
  above the panel) highlights that item's occurrences; clicking it again clears the highlight

#### Scenario: The spotlight persists after close and clears on Escape

- **WHEN** a reference item is spotlighted and the player closes the panel
- **THEN** the board spotlight remains (so the player can act on it with the panel out of the way)
- **WHEN** a reference item is spotlighted and the player presses Escape (panel open or closed)
- **THEN** the spotlight is cleared — and if the panel is open its item is deselected and it stays open

### Requirement: The midend hides the stylus modifier from games that do not want it

The midend SHALL strip `MOD_STYLUS` from the button before calling
`Game.interpretMove`, unless the game sets `wantsStylusModifier`. A press, drag
or release from a finger or a pen therefore reaches an ordinary game as the plain
button code, and a game that tests `button === LEFT_BUTTON` works on touch
without having to strip anything.

This is a deliberate divergence from upstream, where `midend.c` hands the bit to
`interpret_move` and each game is expected to strip it. That contract is a
footgun: comparing the raw button is the obvious thing to write, it reads
correctly, and it fails silently — and only on a device no test suite exercises.
It caught nine of this collection's first thirty-two ports (Flip, Galaxies, Pegs,
Blackbox, Dominosa, Guess, Signpost, Untangle, Inertia), each of which shipped
completely deaf to touch. Inverting the default makes the dangerous case the one a
game has to ask for.

A game whose touch behavior genuinely differs SHALL set `wantsStylusModifier`
and handle the bit itself. **Pattern and Loopy** are those games: neither has a
right button available to a finger, so a touch press cycles a cell (Pattern) or
an edge (Loopy) through its states rather than simply filling it.

*This requirement previously said "Pattern is the only such game". It was true
when written and stopped being true when Loopy landed — nothing failed, because
**a count in a spec is a fact that goes stale silently**. Prefer naming the
members to counting them, and where a count is unavoidable, give it a guard.*

#### Scenario: A touch press plays the game

- **WHEN** a press arrives with `MOD_STYLUS` set, for a game that has not set
  `wantsStylusModifier`
- **THEN** the game interprets it exactly as it interprets the same press from a
  mouse

#### Scenario: A game may still ask for the stylus bit

- **WHEN** a game sets `wantsStylusModifier` and a touch press arrives
- **THEN** `interpretMove` receives the button with `MOD_STYLUS` still set

### Requirement: Touch equivalence is guarded for every registered game

The test suite SHALL assert, for **every** game in the runtime registry, that a
touch press does what the same mouse press does, across a sweep of the whole
board — so that a newly ported game is covered on the day it is registered rather
than when somebody remembers to check it on a phone.

The sweep SHALL be dense enough to land on the game's live targets, and SHALL
fail rather than pass vacuously when no probe reaches one (an early cut of this
guard missed Untangle entirely, because its vertices sit at arbitrary points that
a coarse grid never hit).

#### Scenario: A new port that ignores touch fails the suite

- **WHEN** a game is registered whose `interpretMove` compares an unstripped
  button against `LEFT_BUTTON`, and the midend's stripping is removed
- **THEN** the guard test fails for that game

### Requirement: Hint mechanics are engine-owned and cross-game guarded

A game's hint SHALL contain only what is genuinely that game's: **what it can prove, what
it marks on the board, and what it says**. The *mechanics* a hint needs — how a plan is
carried and advanced, how a mark survives a move animation, how an overlay reaches the
render cache, how a plan stays stable across recompute, how a step is narrated in the
shared vocabulary — SHALL be provided by the engine or by a shared hint library, and SHALL
NOT be re-derived per game.

The overlay clause is overlay-general, not hint-specific: **any** per-cell overlay a game
paints on top of its tiles (the hint overlay, the mistake overlay) SHALL reach the render
cache through the shared overlay sidecar (`engine/overlay-sidecar.ts`) rather than a
per-game re-derivation of the repack/stale/commit dance, except where a game's overlay
genuinely does not fit the per-cell shape (recorded as a no-go with its reason).

This requirement states the **invariant**, not an API: which seams are extracted, and in
what shape, is decided by the audit this change carries (`design.md`), and a seam that
fails those criteria SHALL be recorded as a deliberate no-go rather than forced.

Two rules make it enforceable rather than aspirational:

- **A hint defect class that has occurred in two or more games SHALL be closed
  structurally or by a cross-game guard** — a test every hinting game is enrolled in (as
  `hint-resume.test.ts` already guards plan convergence) — and SHALL NOT be left to a rule
  in a document that each new port must remember. Documented rules are how the same defect
  reaches a second game.
- **A shared hint mechanism SHALL NOT cost a game any of its narration.** The exemplar
  hints — Palisade's deduction bar, Inertia's stable subgoal, Towers' recorded
  eliminations, Filling's grouped multi-square step — are the acceptance test: if a shared
  abstraction cannot express one of them without loss, the abstraction is wrong, not the
  hint. The hint is the product; the framework serves it.

#### Scenario: A recurring hint defect is closed for every game at once

- **WHEN** a hint defect is found that has already occurred in another game — a mark that
  does not track its moving piece, an overlay absent from the render cache's diff key, a
  plan that loops across recomputes
- **THEN** it is fixed in the shared mechanism and guarded by a test every hinting game is
  enrolled in, rather than fixed only in the game that reported it

#### Scenario: A new hinting game inherits the mechanics

- **WHEN** a newly ported game adds a hint
- **THEN** it implements its deductions, its marks and its narration, and inherits plan
  lifecycle, mark-vs-animation placement, overlay cache invalidation and the narration
  vocabulary from the engine — it does not re-derive them

#### Scenario: An extraction that would flatten a hint is rejected

- **WHEN** a proposed shared abstraction cannot express an exemplar game's hint without
  losing part of what that hint says
- **THEN** the abstraction is rejected or reshaped, and the rejection is recorded with its
  reason

#### Scenario: A mistake overlay reaches the cache the same way the hint overlay does

- **WHEN** a game paints a per-cell mistake overlay (the `findMistakes` highlight) over
  tiles whose values are otherwise unchanged
- **THEN** the overlay is carried by the shared overlay sidecar — packed per frame,
  stale-compared in the cache-miss test, committed after draw — so a Check & Save on an
  already-drawn board repaints the flagged cells

### Requirement: A game can supersede its game description mid-play

The engine SHALL let a game replace the stored game description (and optionally a
private, serialization-only description) after a move commits — upstream
`midend_supersede_game_desc` — without games holding a midend back-reference and without
`executeMove` losing purity. On supersession the midend SHALL emit its id-change
notification so the shareable game ID reflects the real board, restart SHALL restart the
superseded description, and a save taken after supersession SHALL restore the superseded
(private, when provided) description.

#### Scenario: Mines' first click generates the real layout

- **WHEN** a game's first move generates the actual board (first-click-never-a-mine) and
  signals supersession with the real description and a private layout-only description
- **THEN** the stored description is replaced, the id-change notification fires, and the
  shareable game ID names the real board

#### Scenario: Restart after supersession

- **WHEN** the player restarts after the description was superseded
- **THEN** the game restarts from the superseded description, not the pre-supersession
  placeholder

#### Scenario: Save and restore mid-game

- **WHEN** the player saves after supersession and later restores
- **THEN** the restored game is built from the superseded (private, when provided)
  description and replays cleanly

### Requirement: The engine serializes Ui state a move-log replay cannot reconstruct

The engine SHALL support optional `encodeUi(ui): string` / `decodeUi(ui, encoded): void`
`Game` hooks (upstream `encode_ui`/`decode_ui`). The midend SHALL write `encodeUi(ui)` into
the save envelope's `ui` field when the hook is present, and — after rebuilding state 0 and
replaying the move log on load — SHALL restore it via `decodeUi`. A game without the hooks
SHALL save no `ui` field, and its `Ui` SHALL be reconstructed from `newUi` plus the replay
alone (every game before Mines).

This exists because a `Ui` field that lives **outside** the undo history and is set by
`interpretMove` cannot be recovered by replaying the move log: replay goes through
`executeMove`, never `interpretMove`. Mines' persistent death counter is exactly such a
field — dying and then undoing removes the death from the move log — so without ui
serialization the count would reset on every save/restore.

#### Scenario: A persistent Ui counter survives a save

- **WHEN** a game with `encodeUi`/`decodeUi` accumulates ui-only state (Mines' death count),
  is saved, and reloaded
- **THEN** the reloaded game shows the same ui-only state, even though the move log alone does
  not contain it

### Requirement: The midend displays a timed game's elapsed clock in the status bar

For a game with `isTimed = true` and `wantsStatusbar = true`, the midend SHALL prefix the
game's status-bar text with the elapsed time as `[M:SS] ` (upstream
`midend_rewrite_statusbar`). The prefix is the midend's responsibility, not the game's —
`statusbarText` returns only the game-specific text. A non-timed game's status bar SHALL be
unaffected.

#### Scenario: A timed game shows the clock

- **WHEN** a timed game's status bar is emitted with 75 seconds elapsed
- **THEN** the status-bar text begins with `[1:15] `, followed by the game's own status text

### Requirement: Adapting a color to another scheme preserves its relation to the board

A calculated per-scheme value SHALL preserve the color's relationship to its own
background: a color close in lightness to the background in one scheme SHALL be close
to the background in the other, and a color far from it SHALL stay far from it. The
failure this forbids is a subtle tint of the board becoming a prominent area of color
purely because the scheme changed.

This SHALL hold regardless of how colorful the color is. A rule that treats grays and
chromatic colors by different principles will make a game's near-background tints
behave unlike its near-background grays, which is that failure.

#### Scenario: A near-background tint stays near the background

- **WHEN** a color close in lightness to the game's background is adapted to the
  opposite scheme
- **THEN** it remains close in lightness to that scheme's background

#### Scenario: Text and fills keep their order

- **WHEN** a color drawn as text or a thin line, and a color drawn as a large fill,
  are both adapted to a dark scheme
- **THEN** the text color is lighter than the fill color it may be drawn over

### Requirement: A palette may carry its own per-scheme decisions

The engine SHALL report to the frontend, **per palette index**, any decision a palette
entry makes about its own behavior when the color scheme changes — a decision an
entry may carry where that behavior is a property of the color's meaning rather than
of the game showing it. Reporting per index is required because the association between
a color and its meaning cannot be assumed to survive transfer to the frontend.

A per-puzzle adjustment SHALL take precedence over a decision carried by the palette,
so that a game whose board needs different treatment can still state it.

#### Scenario: A color's own decision is applied

- **WHEN** a palette entry states that it must not be adapted, and the puzzle declares
  no adjustment for that index
- **THEN** the frontend leaves that color unchanged

#### Scenario: A per-puzzle adjustment wins

- **WHEN** a palette entry states that it must not be adapted, and the puzzle also
  declares an adjustment for that index
- **THEN** the puzzle's adjustment is applied instead

### Requirement: A color that means "this piece is black or white" is distinct from ink and paper

The engine SHALL distinguish a color used as **maximum-contrast foreground or surface**
(grid lines, glyphs, text, a white cell background) from a color used to say **a game
object is black or white** (a black peg, a black mine, the filled squares of a
two-color game).

The two SHALL NOT share a role, because they require opposite treatment when the scheme
changes: foreground and surface colors invert, so that text stays readable against the
surface it is drawn on, while a piece's black or white is the game's own meaning and
SHALL be preserved — inverting it would tell the player the piece is the other color.

#### Scenario: Ink inverts so text stays readable

- **WHEN** a color used for grid lines, glyphs or text is resolved for a dark scheme
- **THEN** it is light enough to read against that scheme's surface

#### Scenario: A black piece stays black

- **WHEN** a color whose meaning is that a game object is black is resolved for a dark
  scheme
- **THEN** it remains black
- **AND** the game requires no per-puzzle adjustment to keep it black

### Requirement: The engine provides a shared semantic color palette

The engine SHALL provide a shared module of **semantic color roles** — the colors
that mean something to the *player* — alongside the existing structural
`color-mkhighlight` helpers. A role SHALL be defined in exactly one place, and every
game SHALL obtain its player-facing colors from there rather than writing an RGB
triple.

A role SHALL be declared in one of two forms, chosen by whether it must survive the
app's dark-mode adaptation:

- an **absolute** color, for a role whose purpose is to be unmistakable regardless of
  the board (the error/mistake color);
- a **function of the frontend background**, for any role that must stay legible
  *against the board*. This is required, not stylistic: the app passes a game **pure
  white** as its default background in dark mode, so a fixed pale color that reads
  correctly in light mode can otherwise land on the background in dark mode.

A color SHALL be a shared role only where **two or more games use it to mean the same
thing to the player**. A color that belongs to one game's visual identity, or that is
a member of that game's own enumerated set whose job is to be distinguishable from the
set's other members (peg colors, region colors, tile color sets, per-number digit
colors), SHALL remain game-local — but SHALL be **declared** as such rather than left
undeclared.

The engine SHALL NOT duplicate the structural background/highlight/lowlight
derivation, which the `mkhighlight` helpers continue to own.

#### Scenario: Two games needing the same cue get the same color

- **WHEN** two games render the same player-facing cue (a hint, a flagged mistake, a
  keyboard cursor)
- **THEN** both obtain that color from the same role
- **AND** neither contains a literal color value for it

#### Scenario: A role that must stay legible is derived from the background

- **WHEN** a background-derived role is resolved against a light host background and
  against the pure white the app supplies in dark mode
- **THEN** the resulting color is visibly distinct from that background in both cases

#### Scenario: A game-specific color set stays game-specific

- **WHEN** a game's colors form its own enumerated set whose members must be
  distinguishable from each other rather than carrying a meaning that recurs elsewhere
- **THEN** those colors remain defined by that game
- **AND** they are declared as game-local, so the declaration is a recorded decision
  rather than an omission

### Requirement: A game's palette contains no undeclared color

The suite SHALL fail when any registered game's palette contains a color that is
neither traceable to a shared role or the `mkhighlight` trio, nor listed as a declared
game-local color for that game.

The failure mode this guards is **silent divergence**: a hand-written color is
invisible to a render snapshot (which records whatever the game emits) and to a
targeted op assertion (which names the game's own constant), so without this guard a
new color, or a second spelling of an existing role, can enter the collection with
nothing objecting.

#### Scenario: An undeclared color fails the suite

- **WHEN** a game's palette gains a color that is neither a shared role nor declared
  game-local
- **THEN** the suite fails, naming the game and the color
- **AND** it passes once the color is either mapped to a role or declared game-local

### Requirement: A game's palette index order is stable

A game's palette SHALL keep its color indices stable: the app's per-puzzle dark-mode
adjustments (`paletteOverrides` and `paletteSwaps`) are keyed by **color index**, so
reordering a palette silently re-targets them — the game then renders correctly in one
color scheme and incorrectly in the other, with nothing failing.

A game that needs an additional color SHALL **append** it past the indices its
upstream color enum defines, rather than inserting or reordering. Changing a color's
*value* is permitted; changing its *position* is not.

#### Scenario: Adopting a shared role does not move a color

- **WHEN** a game replaces a literal color with a shared role
- **THEN** that color keeps the palette index it had
- **AND** any per-puzzle dark-mode adjustment for that index continues to apply to the
  same color

#### Scenario: A new color is appended

- **WHEN** a game needs a color its upstream enum does not define
- **THEN** it is appended past the upstream indices, leaving every existing index
  untouched

### Requirement: A game contains no color value

A game SHALL NOT contain a color value. Every color a game shows SHALL be a named
reference to a shared color token, or the result of a shared function whose inputs are
such tokens.

The second form exists because some colors are genuinely *relative* to another color —
a bevel highlight is a function of the surface it sits on, a pencil mark is a function
of the board it is written on, and an interpolated ramp is a function of its endpoints.
Requiring literal values for these would replace one correct line of arithmetic with
many authored values that must then be kept consistent by hand.

A game's palette SHALL depend on nothing but the frontend background: no game requires
a color computed from its parameters or its state. A game MAY choose **which** token to
draw with based on its state; that is selection, not computation.

#### Scenario: A color is referenced, never written

- **WHEN** a game builds its palette
- **THEN** each entry is a token reference or a call to a shared derivation
- **AND** the game source contains no color value of its own

#### Scenario: A relative color is derived from tokens

- **WHEN** a color's meaning is defined relative to another color, such as a bevel
  against its surface
- **THEN** it is produced by a shared function whose inputs are tokens
- **AND** it is not authored as an independent value per game

### Requirement: A color token defines a value per color scheme

A color token SHALL define its value for **each color scheme the app offers**, chosen
for what the token means to the player under that scheme rather than converted from
another scheme's value by a general formula.

A token MAY leave a scheme's value unstated, in which case it SHALL be adapted by
calculation, so that schemes can be authored incrementally. A token's name SHALL
describe its **meaning**, not its appearance, since its appearance differs between
schemes.

Changing a scheme's appearance SHALL be possible by editing the token table alone, and
adding a color scheme SHALL require no change to any game.

#### Scenario: A scheme is restyled without touching a game

- **WHEN** a scheme's values are changed in the token table
- **THEN** every game that references those tokens shows the new colors
- **AND** no game source is modified

#### Scenario: A scheme is added

- **WHEN** a new color scheme is introduced
- **THEN** it is defined by giving tokens their values for that scheme
- **AND** no game source is modified

#### Scenario: An unstated scheme value falls back

- **WHEN** a token does not state a value for the active scheme
- **THEN** its value is calculated from a scheme it does state
- **AND** the game renders correctly

### Requirement: The collection's colors are a small named set

The colors the collection uses SHALL be a **small named set**, sized by what the
games demonstrably need to distinguish rather than by how many colors happen to
have been written. A color SHALL NOT be added to it because one game wants a
shade; a game that needs a color the set does not have SHALL record what it means
to the player and why no existing color serves.

Every color a game shows SHALL be a reference to a **meaning** — an error, a
hint, a completed clue — except where the color itself is the meaning: a member
of a set whose job is to be told apart from the other members, or a color the
game names to the player.

A meaning SHALL be defined in terms of a color from the set rather than holding a
value of its own, so that changing a color changes every meaning built on it.

#### Scenario: A game asks for a meaning

- **WHEN** a game needs the color for something being wrong, or for the move a
  hint is proposing
- **THEN** it references that meaning
- **AND** the meaning resolves to a color from the named set

#### Scenario: A color the set does not have

- **WHEN** a game needs a color no existing meaning or named color provides
- **THEN** the reason is recorded with the color: what it means to the player, and
  why nothing in the set serves

### Requirement: A named color's name is true

Where a color is referenced **by name** rather than by meaning, the name SHALL
describe the color as a player would, under **every** color scheme. A scheme MAY
change such a color's shade; it SHALL NOT change it into a color a player would
give another name.

This exists because a name reaches the player. A hint that says "fill with yellow"
is making a claim about the board, and a scheme that renders that color as
something else makes the game lie to the player.

#### Scenario: A hint names a color

- **WHEN** a hint's explanation refers to a color by name
- **THEN** the color that name resolves to is recognisably that color in the
  active scheme

#### Scenario: A scheme restyles a named color

- **WHEN** a scheme gives a named color a different value
- **THEN** the value is a different shade of the same color
- **AND** every explanation that names it is still true

### Requirement: A set of colors meant to be told apart is designed as a set

Colors a game relies on to distinguish items SHALL be mutually distinguishable in
every scheme, and that SHALL be a property of the named set rather than of any one
game that draws from it.

Mutual distinguishability cannot be established one color at a time: it is a
relation between members, so no rule applied to a single color — including
adapting it to a scheme — can establish or preserve it.

#### Scenario: A scheme is added or changed

- **WHEN** a color scheme is introduced or restyled
- **THEN** the members of the named set remain distinguishable from one another
- **AND** this is verified by measurement rather than by inspection

### Requirement: The engine owns its type vocabulary and depends on nothing above it

The engine's shared puzzle vocabulary SHALL live under `src/engine/` and SHALL be imported *from* there by the app; it SHALL NOT live in the app layer and be imported upward by the engine and the games.

The vocabulary is `Color`, `Point`, `Size`, `Rect`, `KeyLabel`,
`PresetMenuEntry`, `DrawTextOptions`, `ConfigDescription` and the change
notifications the engine emits.

These declarations are parts of contracts the engine states: `Color` is what a
game's `colors()` returns, and `Rect`/`Point`/`Size` are the drawing API's
coordinate records. They sat in `src/puzzle/types.ts` for a historical reason —
they were re-exported from the Emscripten-generated `emcc-runtime.d.ts`, so the
root of the type graph was a generated file in a gitignored assets directory, and
`retire-c-engine` hand-authored them in place precisely so that none of the 201
importers had to change while it proved nothing else moved.

The consequence, measured on 2026-08-02: **182 files under the engine and the
games imported the app layer**, and the layering check could not see it, because
its rule named `screens/`, `dialogs/` and `components/` and the imports went
through `src/puzzle/`.

Correspondingly, the Comlink-facing adapter (`TsWorkerPuzzle`, implementing
`PuzzleEngineSurface`) SHALL live on the app side of the seam, in `src/puzzle/`,
not inside `src/engine/`. It exists to present the engine in the shape the app's
`Puzzle` expects; an adapter belongs with the thing being adapted *to*, and it
was the only production module under the engine importing upward.

Together these two placements make the invariant in the `repo-layout` layering
requirement — the engine and games import nothing under `src/` outside their own
two directories — hold with **no exceptions and no allowlist**, which is what
makes it enforceable rather than aspirational.

#### Scenario: A game imports the drawing vocabulary

- **WHEN** a game's `render.ts` needs the `Color` type for its `colors()`
- **THEN** it imports it from the engine
- **AND** no module under `src/engine/` or `src/games/` imports from
  `src/puzzle/`, `src/utils/`, `src/store/` or any other app directory

#### Scenario: The app consumes the engine's vocabulary

- **WHEN** a Lit component or the main-thread `Puzzle` needs `Rect` or
  `PresetMenuEntry`
- **THEN** it imports them from the engine, the dependency running app → engine
- **AND** the direction is checked automatically, not by convention

### Requirement: A tiered game declares its difficulty contract

A game with difficulty tiers SHALL declare an optional `difficulty` contract on
its `Game`: `tierOf(params)`, a pure `withTier(params, tier)`, and
`solveAtCap(params, desc, cap)` running the game's solver with its deduction
ladder capped at `cap`. A game without tiers omits it, exactly as a game without
a solver omits `solve`.

The contract SHALL NOT carry the tier list. **The tier names are read off the
game's own difficulty `paramConfig` item** — `difficultyTiers(game)` — which is
the list a player picks from, and which decides both *whether* a game is tiered
and *what its tiers are*. A `tiers` array on the contract was a second
hand-maintained copy of that list held equal to it by an assertion, and eight
games really did write the names out as two separate literals; there is nothing
for a derived list to disagree with.

Deriving the list SHALL NOT weaken the coupling the removed assertion carried.
Two equal string arrays never proved the contract and the form addressed the
same params field, so the guard SHALL instead assert that the form item's
`get`/`set` and the contract's `tierOf`/`withTier` move the same tier, for every
tier — a strictly stronger statement, and the one that fails when the derivation
finds some other `choices` item.

`solveAtCap` SHALL return a **discriminated verdict** (`"solved"` /
`"unsolved"` / `"impossible"`), not the raw integer its solver uses. The
collection's solvers report `-1 / 0 / 1` with meanings that are **not uniform** —
one game's `0` is "ambiguous", another's is "stuck", another returns a status
enum — so the per-game translation belongs in the adapter. Propagating the raw
integers would import 26 conventions into every cross-game consumer.

`solveAtCap` SHALL stay per-game and SHALL NOT be derived. Measured across all
29 contracts, its only shared step is `newState(params, desc)`, which `Game`
already provides and each adapter spends one line on; the cap is passed straight
through to the game's own solver, and the verdict mapping is the per-game
knowledge the discriminated verdict exists to hold. There is no capping logic to
share — the shared part was `latinVerdict`, and it is already extracted.

The contract SHALL describe what the game already does and SHALL NOT change any
board it generates: adopting it is a no-op, and a differential fixture that moves
means an adapter misreports its game's solver.

The tier list SHALL NOT be derived from the game's `DIFF_*` constants. A `DIFF_*`
constant is not reliably a tier: Solo declares eight and offers six (two are
solver verdicts), Galaxies' names list has five entries and two tiers, Singles
has a `DIFF_MAX` *and* a `DIFF_ANY`, and Salad has a `DIFF_HOLESONLY` at −1.

A tier that the game's solver understands but that the generator refuses at every
size SHALL still be offered in the form, because a saved game or a
description-carrying game ID may request it and `solveAtCap` must be able to
answer. Its refusal SHALL come from `validateParams` with a human-readable
reason, never from silent failure.

A tier that deliberately does **not** promise a uniquely-solvable board SHALL
declare itself, so that the cross-game guard asserts what that tier actually
promises rather than the opposite. Dominosa is the case, and it was found by the
guards rather than anticipated: the last entry in its difficulty menu is
"Ambiguous", and its generator branches on it to skip the uniqueness search
entirely — so a tier is not always a rung of the deduction ladder, it can instead
be a relaxation of what the puzzle promises.

Because generation is already uniform through `Game.newDesc(params, rng)`, the
contract SHALL NOT add a separate "generate at tier" entry point —
`newDesc(withTier(p, t), rng)` is that, and a second spelling of an existing
capability is how a contract sprawls.

#### Scenario: A newly tiered game is enrolled by declaring the contract

- **WHEN** a game with difficulty tiers declares `difficulty`
- **THEN** every cross-game difficulty guard covers it without further enrollment
- **AND** its tier list is read from the difficulty choices its custom-params
  form offers, so there is no second list for a game that gains a tier to leave
  stale
- **AND** a game that offers such a choice without declaring the contract fails
  the guard, so enrollment is conscription rather than invitation
- **AND** a game that declares the contract while offering no such choice fails
  the guard, because it would have no tiers at all and every per-game assertion
  would loop zero times over it while reporting health

#### Scenario: A tier is declared but generates at no size

- **WHEN** a tier exists in the solver's ladder but the generator refuses it
  everywhere
- **THEN** the tier stays offered in the form, so a saved game or game ID can
  still name it
- **AND** `validateParams` refuses it with a human-readable reason, which the
  guard requires — a tier that fails to generate and says nothing about why is a
  silent downgrade wearing a menu entry

#### Scenario: An adapter misreports its solver

- **WHEN** an adapter maps a solver's return value to the wrong verdict
- **THEN** the "every declared tier is reachable" guard fails, because a board
  the game's own generator just produced at that tier is reported unsolved
- **AND** the adapter is corrected rather than the guard relaxed

### Requirement: The difficulty contract lives on the Game interface

The difficulty contract SHALL be declared on `Game`, not added to the
`puzzleId → Game` registry and not held in a test-only enrollment module.

The registry's single responsibility is identity lookup, and
`catalog-registry.test.ts` asserts it equals the catalog in both directions;
attaching metadata for 26 of 57 entries makes that statement no longer the whole
truth about it. A test-only enrollment module is excluded for two independent
reasons: the generator-acceptance helper built on this contract is **production**
code and would have to be duplicated, and the module-layering rule exempts
exactly one engine→games importer *by name* — deliberately refusing a wildcard —
so a second enrollment file would widen an exemption that was made narrow on
purpose.

#### Scenario: A capability is proposed for the registry

- **WHEN** a change proposes attaching per-game capability metadata
- **THEN** it goes on the `Game` interface as an optional hook, alongside `hint`,
  `findMistakes` and `supersededDesc`
- **AND** the registry keeps its single responsibility

### Requirement: The hint emphases stay distinguishable in both schemes

Hint-role colors SHALL stay distinguishable in **each** scheme, not only in
light. Every pair among the acted-on color, the fill behind text it is about,
the evidence, and the two premise references SHALL stay more than 0.12 apart in
OKLCH in each scheme, and the acted-on color SHALL carry more than twice the
chroma of either wash in each scheme.

This is what the narration rule above rests on. A narration may tie two marks
together in words only where the marks are themselves distinguishable by
something other than hue; a solid acted-on color against a wash qualifies
because it differs in **weight**, which is the cue left to a reader who cannot
compare hues. An exemption resting on a number is worth exactly as much as the
assertion that keeps the number true.

Measuring the light column alone does NOT state this requirement. The two
schemes are authored separately by construction, so their separations differ:
the closest pair of the six is the fill-versus-evidence pair in **dark**, at
0.124, against 0.147 for the same pair in light. A guard that reads only the
light value stays green through a dark-scheme collapse.

#### Scenario: A scheme's hint colors converge

- **WHEN** a color edit brings two hint roles within 0.12 in either scheme
- **THEN** the palette guard fails, naming the pair and the scheme

#### Scenario: The acted-on color loses its weight

- **WHEN** the acted-on hint color's chroma falls to twice a wash's or below,
  in either scheme
- **THEN** the palette guard fails, because the narration rule's exemption for
  solid-against-wash marks no longer holds

### Requirement: A dark-scheme palette swap keeps its bevel lit from one side

For every bevel trio a game exchanges via `paletteSwaps`, the highlight SHALL be
lighter than the surface it sits on and the lowlight darker, **in both schemes**.

`paletteSwaps` exists because inverting every color's lightness turns an emboss
into an inset. It is hand-maintained and keyed by raw color index, so a wrong
pair leaves every color present, every test green, and one game lit from the
wrong side in one scheme only.

The requirement above is a relationship to that *surface* and not to the board, so
a measurement of a swapped index against the background does not state it and MUST
NOT be read as though it did: the two indices of a pair denote different roles in
the two schemes, so such a measurement compares a highlight with a lowlight.

#### Scenario: A bevel survives the scheme flip

- **WHEN** a game's bevel trio is resolved for the light scheme and for the dark
  scheme
- **THEN** in each scheme its highlight is lighter than its base and its lowlight
  is darker

#### Scenario: A swap names two distinct colors

- **WHEN** a game declares a `paletteSwaps` pair
- **THEN** both indices exist in that game's palette, they differ in lightness,
  and no index is named by more than one pair

### Requirement: Param validation distinguishes generating a board from loading one

The midend SHALL pass `full: true` to `Game.validateParams` only when the params
are about to be used to **generate** a board, and `full: false` when a
description is already in hand. A `<params>#<seed>` game id regenerates and is
therefore validated with `full: true`; a `<params>:<desc>` game id carries its
finished board and SHALL be validated with `full: false`, so a bound that only
generation is subject to — a size whose generator succeeds too rarely to wait
for, a difficulty that no longer produces distinct boards — never retires a game
id that was shared before the bound existed. This mirrors upstream
`midend.c`'s `validate_params(params, desc == NULL)`.

A game MAY express a generation-only bound by gating it on `full`. The engine
SHALL NOT make that gate vacuous by passing a constant.

#### Scenario: A generation-only bound refuses the seed form

- **WHEN** a `<params>#<seed>` id names params outside a game's generation-only
  bound
- **THEN** the midend refuses it with the game's reason, because the board would
  have to be generated

#### Scenario: A generation-only bound does not refuse the descriptive form

- **WHEN** a `<params>:<desc>` id names the same params, with its description
  present
- **THEN** the midend accepts it and the board loads, because nothing is
  generated

#### Scenario: A bound that is not generation-only still applies to both

- **WHEN** params fail a check the game applies regardless of `full`
- **THEN** the midend refuses them on the descriptive form as well as the
  seed form

### Requirement: A game rejects a move it cannot play, rather than guessing

`Game.executeMove` SHALL reject a move that its dispatch does not recognize, by
throwing an error naming the game and the move. It SHALL NOT return a state it
did not compute from that move, SHALL NOT return a non-state, and SHALL NOT
treat the move as a no-op.

The move reaching `executeMove` is not guaranteed to be a member of the game's
move union: `SaveEnvelope.moves` is `unknown[]` and is cast on replay, not
parsed, so a save written by another build supplies an off-union value that type
checking cannot exclude.

Where the game's move type is a discriminated union, the dispatch SHALL be
written so that an unhandled union member is a **compile-time** error — a
`switch` whose catch-all binds the move to `never` (`assertNever`). A bare
`default` that throws is insufficient, because its presence makes the function
total for the type checker and so surrenders the exhaustiveness guarantee it was
added to reinforce.

Where a game's move is not a union, it SHALL validate the fields its dispatch
depends on and throw in the same form.

#### Scenario: A move from another build is refused, not misread

- **WHEN** a saved game is replayed whose move log contains a move this build's
  dispatch does not recognize
- **THEN** `executeMove` throws an error naming the game, the midend refuses the
  save, and the board is left playable

#### Scenario: An unrecognized move is never silently ignored

- **WHEN** such a move is replayed in a game whose dispatch previously had a
  tolerant catch-all
- **THEN** the save is refused rather than loaded as a board differing from the
  one that was saved

#### Scenario: Adding a move type without handling it fails to compile

- **WHEN** a member is added to a game's move union and no dispatch arm handles it
- **THEN** the type checker reports the error at that game's `executeMove`

### Requirement: The Game contract carries no capability without a consumer

Every optional member of the `Game` interface SHALL have at least one game
implementing it and at least one consumer reading it, and the two SHALL be
checked separately, because they fail differently: no implementer means dead
weight in the interface, while no consumer means every implementer wrote code
that never runs.

A capability with no consumer is worse than absent: game code written against
the documented contract reads as protection while doing nothing, and the gap is
invisible until the day the capability is first genuinely needed.
`validateParams`'s `full` flag was passed a literal `true` by all four
production call sites while sixteen games gated a bound on it, three of them
with comments describing the behavior that was not happening — and it silently
refused game IDs a game had deliberately kept loadable.

A member whose only consumer is a cross-game guard is permitted, since such a
guard is a real reader — `Game.difficulty` exists precisely so a property about
difficulty tiers can be asserted for every tiered game at once — but SHALL be
recorded as such with its argument. A member with **no** consumer SHALL be
recorded with the change that owns the decision to wire it up or remove it; an
entry with no owning change is the accumulation this requirement exists to
prevent.

Consumers SHALL be derived from the source's syntax tree rather than by matching
text, because a comment is not a consumer: `needsRightButton`'s only mention
outside the games is a commented-out line proposing to read it. A value copied
into a field of the same name SHALL NOT count as a consumer, since relaying is
not reading.

#### Scenario: An optional hook nothing invokes is reported

- **WHEN** a member of the `Game` interface is implemented by one or more games
  but read by no engine or app-shell call site
- **THEN** the check reports it, naming the number of implementers whose code
  cannot run

#### Scenario: An optional hook no game implements is reported

- **WHEN** an optional member of the `Game` interface has no implementer
- **THEN** the check reports it as surface to remove

#### Scenario: A recorded exception that has stopped being true is reported

- **WHEN** a member recorded as having no consumer acquires one
- **THEN** the check fails, so the record is corrected rather than left
  describing a finding that no longer exists

#### Scenario: The check states how much it inspected

- **WHEN** the check runs
- **THEN** it asserts the number of interface members it examined, the number of
  modules it scanned for consumers, and the size of the registry it read
  implementers from, so a sweep that silently matched nothing cannot report
  success

### Requirement: A game is handed a draw state, never the absence of one

`Game.newDrawState` and `Game.redraw` SHALL be required members, and the draw
state passed to `Game.redraw` and `Game.interpretMove` SHALL be non-null and
SHALL already have the current tile size applied.

The midend SHALL create the draw state and apply `setTileSize` in a single
operation, so that no caller can produce a drawstate whose tile size is still at
its initial value, and SHALL decline to redraw or to interpret input when no
game has been set up.

This exists because the alternative was measured: while `newDrawState` was
optional, fifty-five games opened `redraw` with a guard against a null the
engine could not produce, and fifty-seven mapped pointer coordinates through a
`ds?.tilesize ?? PREFERRED_TILE_SIZE` fallback — not inert, but a silent wrong
answer waiting for a null that would have sent every click to the wrong cell.

#### Scenario: A game reads the tile size it is actually drawn at

- **WHEN** a game's `interpretMove` maps a pointer coordinate to a cell
- **THEN** it reads the tile size from the draw state it was passed, with no
  fallback, because the midend guarantees that value is set

#### Scenario: No board, no paint

- **WHEN** `redraw` or `processInput` is called before a game has been set up
- **THEN** the midend returns without calling into the game

### Requirement: No game ships an empty custom-params dialog

The app offers "Custom type…" for every game, so every registered game SHALL
declare a non-empty `paramConfig`, and a check SHALL assert it across the
registry.

Sokoban shipped without one from its port until this was asserted, so choosing
"Custom type…" opened a dialog with no fields in it. Two silent skips hid it: the
sweep over `paramConfig` began by skipping any game that had none, and the menu
entry was gated on a `canConfigure` flag the midend answered `true`
unconditionally. A genuinely preset-only game is a decision about what its menu
should say, to be taken deliberately rather than by omission.

#### Scenario: A game with no custom-params form is reported

- **WHEN** a registered game declares no `paramConfig`, or an empty one
- **THEN** the check reports it by name, rather than skipping it

### Requirement: The static-attributes relay carries no field the app does not read

Every field of `PuzzleStaticAttributes` SHALL be read by the app shell, and a
check SHALL assert it. A field with no app reader SHALL be removed, or recorded
with the change that owns the decision to give it one.

This is the sibling of the rule that the `Game` contract carries no capability
without a consumer, and it needs stating separately because the two contracts
fail independently: every field here is produced by `Midend.getStaticProperties`
and relayed under the same name into a `Puzzle` field, so the chain is easy to
extend and its far end is easy to forget. Two of the original nine fields turned
out to have no reader — `canConfigure`, which the midend answered with a literal
`true` while it gated the type menu's "Custom type…" entry, and `displayName`,
which `Puzzle` overrode from the catalog on every reachable path.

The check SHALL count only reads from outside the engine, because the two
contracts share field names: `canSolve` is also a `Game` member, so an engine
read of `game.canSolve` would otherwise vouch for an app field nothing touches.

#### Scenario: A relayed field the app never reads is reported

- **WHEN** a `PuzzleStaticAttributes` field has no app-shell reader
- **THEN** the check reports it by name, so the midend stops computing and
  shipping a value for nobody

#### Scenario: The check states how much it inspected

- **WHEN** the check runs
- **THEN** it asserts the number of fields it examined and the number of
  app-shell modules it scanned, so a sweep that silently matched nothing cannot
  report success

### Requirement: A hint marks beside the content, never behind it

A hint's marks SHALL NOT be drawn *underneath* anything the player has to read.
The acted-on cell SHALL be **ringed** rather than filled, in every game and with
no exceptions. An evidence area whose cells carry content — entered digits,
pencil marks, clue glyphs, a placed mark, or a background the deduction is
reading — SHALL be **outlined** rather than washed.

Both marks SHALL be drawn on the space the cell's **border** already occupies,
which is either the gutter between cells or the cell's own outermost pixels
depending on how the game is laid out, so that a mark costs the content no room
and reads as a highlight by *color* rather than by weight. Where the border
belongs to a game object in its own right — a wall in Galaxies or Palisade — the
mark SHALL be inset inside the cell instead, so it cannot be read as that object.

An evidence area whose cells carry **no** content MAY remain a wash. The
governing question is `docs/games/hints.md` § "Shade vs ring"'s — *would the fill
hide the premise?* — where **hide** includes *rendered unreadable by contrast*,
not only *occluded*. A game that keeps a wash is asserting that nothing is drawn
on it, and SHALL record that reason where it names the role. The target has no
such allowance: it is ringed even where a fill would hide nothing, because one
mark means one thing across the collection, and because in a game whose move is
"give this cell a color" a fill states with the board what the narration is
still proposing.

**A fill behind content cannot be rescued by choosing a different color**, and
this is a measured fact rather than a preference: the target fill scores 1.91:1
against a pencil mark in light and 1.96:1 in dark; clearing ~2.6:1 requires a
wash so pale it collides with the evidence wash, and the only hues that clear it
sit beside `ERROR_WASH`, which would make the cell a hint points at resemble the
cell that is wrong. A joint search over both hint fills, every hue, and both
schemes returns no feasible arrangement. The palette SHALL therefore carry no
fill counterpart to the acted-on color at all, so that a future change cannot
reopen this by retuning one.

A **wash** kept for a content-free evidence area faces the mirror of the same
squeeze and SHALL be tuned for visibility rather than for legibility-through: a
fill dark enough to keep a *derived* foreground readable measures 1.15:1 against
its own board in dark mode, which is a mark nobody can see. The two requirements
move in opposite directions along one axis, so a wash carrying content loses
whichever way it is tuned.

Because a mark on a border is read *against* a surface rather than *through* it,
it SHALL take a **strong** color rather than a wash step, and specifically a
step whose lightness differs between schemes (a `_BOLD`), so that it stands off
the board by a similar margin in each. A step at one lightness under both schemes
reads soft on a pale board and bright on a dark one.

The evidence color and the **chain ordinal** that indexes it SHALL be one role
rather than two roles holding the same value: a number saying where a cell falls
in an ordered chain is an index *into* the evidence, so a name of its own would
claim the ordered cells were a different kind of premise from the unordered ones.

Where a mark lies **outside** the cell's content box, no tile owns those pixels,
so it SHALL be driven by the game's drawstate rather than by its per-tile cache:
a mark that moves or is dismissed SHALL be erased explicitly, and a mark that
persists SHALL be repainted each frame, so that a neighboring cell repainting
for its own reasons cannot clip it. Where a mark lies wholly **inside** the box,
the cell's own repaint undoes it and no such bookkeeping is required — the hint
overlay is already part of that cell's cache key.

Guards on this SHALL assert the mark's **shape** — that a target is a ring of
thin sides and not a solid fill, and that a contiguous evidence region is one
contour rather than a ring per cell. An assertion that some primitive carries the
hint color is satisfied equally by the fill being removed. The cross-game guard
SHALL derive each game's hint palette indices from that game's own renderer
rather than from a list maintained beside it, and SHALL assert how many games it
examined, so that it cannot shrink in silence.

#### Scenario: The acted-on cell is ringed, not filled

- **WHEN** a hint step marks the cell it acts on
- **THEN** the mark is a ring of thin sides drawn on the cell's border, and no
  primitive fills the cell with a hint color
- **AND** the same mark is used whether the step places a value or strikes a
  candidate, so the cell is never identified only by the strike
- **AND** this holds even where the cell is empty and a fill would hide nothing

#### Scenario: Evidence carrying content is outlined

- **WHEN** a hint step marks an evidence area whose cells carry entered digits,
  pencil marks, clue glyphs, or a background the deduction is reading
- **THEN** the area is drawn as an outline: a side wherever the neighbor across
  it is not also evidence, so a contiguous region reads as one contour and a
  scattered set as one ring per cell
- **AND** the content inside it is drawn exactly as it would be without the hint

#### Scenario: A mark outside the content box survives a neighbor's repaint

- **WHEN** a cell adjacent to a marked one repaints for its own reasons while the
  hint is still displayed
- **THEN** the mark is still whole on the next frame
- **AND** when the hint is dismissed or moves, the space it occupied is restored

#### Scenario: A wash is kept only where nothing is drawn on it

- **WHEN** a game keeps an evidence wash rather than an outline
- **THEN** its evidence cells carry no content the player must read, and the game
  records that reason where it names the role
- **AND** the cross-game guard names that game explicitly, so a further game
  taking the same allowance fails until its reason is written down

#### Scenario: A mark never impersonates a game object

- **WHEN** a game draws its own objects on the cell border — a wall between two
  cells, say
- **THEN** the hint's marks are inset inside the cell instead, so that neither
  mark can be read as one of those objects

### Requirement: Touch equivalence is guarded at gesture level, not only at press level

The collection-wide touch guard SHALL cover **gestures, not only a single
press**. A press alone is not what play consists of, and it is not what the
frontend's traps break: a finger that stays within 8 px for 350 ms is delivered
as `RIGHT_BUTTON` (`detectSecondaryButton`), which kills a press-and-drag gesture
precisely when the player pauses to aim — while leaving the press itself working,
so a press-only guard passes.

The sweep SHALL therefore exercise press → drag → release sequences for every
registered game, and SHALL fail rather than pass vacuously when no gesture probe
reaches a live target, on the same terms as the existing press sweep.

The sweep SHALL be **frontend-faithful**: it sends the drag and release only when
the press was consumed, because `view-interactive.ts` installs `pointerTracking`
only `if (consumed)`. A sweep that sent the drag regardless would score a game
whose press returns `null` — the shipped Galaxies left-drag defect, where every
drag frame was silently dropped — as healthy.

A game that sets `wantsStylusModifier` SHALL NOT be skipped by the guard, but
SHALL be asserted against the touch behavior it declares — excluding those games
makes the two with bespoke touch handling the two that nothing checks.

#### Scenario: A drag gesture is equivalent from a finger

- **WHEN** a press, drag and release sequence is delivered from touch to a game
  that handles drags
- **THEN** the resulting board state matches the same sequence delivered from a
  mouse

#### Scenario: A game that asks for the stylus bit is still covered

- **WHEN** the collection-wide input guards run
- **THEN** a game setting `wantsStylusModifier` is not simply skipped, but is
  asserted against the touch behavior it declares

### Requirement: A game with no secondary meaning is not given a synthetic one

A game in which the secondary button means **nothing observable** SHALL declare
`Game.ignoresSecondaryButton`, and the interactive view SHALL then skip
`detectSecondaryButton` entirely for that game — neither long press nor
two-finger tap promoting the press, and the press delivered immediately rather
than held for the detection window.

Without it the promotion is pure loss: the frontend converts a held press to
`RIGHT_BUTTON`, the game tests no such button, and the whole gesture disappears —
only on touch, and only for the player who paused. "Press, pause to aim, then
drag" *is* a press that stays put, so a press-and-drag game loses its one gesture
exactly when the player stops to think. Seven games were in that state when the
collection was swept (Cube, Fifteen, Filling, Flip, Flood, Pegs, Sokoban), Pegs
and Filling being the two whose whole interaction is a drag.

The guard SHALL assert the **biconditional** — a game declares the flag if and
only if the secondary button means nothing observable on a real board — so the
declaration can neither be forgotten by a new game nor left behind by a game that
grows a secondary meaning.

**What counts as a meaning SHALL be derived, never declared.** Reading all 57
games found exactly three legitimate answers, and the guard SHALL credit all
three because they are one question rather than three cases — *did the secondary
gesture change anything the player can perceive, now or next?*

1. **It commits a move** (34 games).
2. **It changes what the next input does** (16) — the pencil-mode press, which
   nine games reach through the shared `pressNoteTakingCell` without naming
   `RIGHT_BUTTON` at all; plus Guess's peg hold, Samegame's selection clear,
   Rome's pencil drag, Signpost's backward grab and Ascent's candidate cycle.
   None of these commits anything by itself.
3. **It folds onto the primary button** (Slide's `asPrimary`) — the documented
   alternative to the flag.

Consumption alone SHALL NOT satisfy the biconditional. It was the previous
question and it was satisfied by a bare repaint: 16 of 57 games consumed
`RIGHT_BUTTON` without ever committing a move, so for those the guard held
whatever the game did. Replacing a game's secondary meaning with a bare
`UI_UPDATE` is green under "was it consumed" and red under this requirement.

The observation SHALL be **the painted frame together with the save**, not the
save alone. A game may keep a secondary meaning in UI state it never serializes —
Guess's peg holds — and a save-only probe reports such a game as meaningless,
demanding the flag from a game that has a meaning and turning off the promotion
it handles.

This SHALL NOT be read as reinstating "did the board change" as a conviction.
That question was rejected because its *negation* is unsound — an eraser on a
fresh board correctly changes nothing. Here a change is only ever a **sufficient**
sign that the button means something, and a game is reported meaningless only
when it is invisible under every observation, so the derivation cannot convict an
innocent game.

**A known bound, measured rather than merely admitted**: a secondary press whose
only effect is incidental — shared with the primary press, such as hiding the
keyboard cursor on any mouse-down — is credited on that alone. Removing both of
Ascent's real secondary arms leaves the guard green for exactly this reason, so
the gap is reachable rather than hypothetical.

What is *not* true is that any shipped game rests on it. Measured across the
collection: of the 50 games credited with a secondary meaning, **38 change the
save** and the remaining **12 change the painted frame**, and all twelve were
read — nine draw pencil marks (`pressNoteTakingCell`), plus Guess's peg holds,
Samegame's selection highlight and Signpost's drag highlight. Every one is a
meaning a player can see; none is an incidental repaint. The guard's priming
SHALL therefore include a two-press and a drag setup, because a one-press prime
left Ascent credited only by the incidental effect — the right verdict on
evidence that would not have survived the game changing.

Closing the gap entirely needs a "does the secondary do something the primary
does not" comparison, and Slide's deliberate fold — where the secondary does
*exactly* what the primary does — would fail it. The bound therefore stands
until a derivation exists that does not convict Slide, and it is documented so
the next reader does not rediscover it as a surprise.

This flag is **not** upstream's `REQUIRE_RBUTTON` inverted, and SHALL NOT be
derived from it. Those two describe different sets, and the difference is the
largest group of all: a game may *use* the secondary button without *needing* it
(Tracks), and suppressing its promotion would break a gesture it handles
correctly.

#### Scenario: A held touch press still plays a drag game

- **WHEN** a touch press is held past the long-press window and then dragged, in
  a game that declares `ignoresSecondaryButton`
- **THEN** the gesture is delivered as a left-button press, drag and release, and
  completes as it would have without the pause

#### Scenario: The declaration cannot drift from the behavior

- **WHEN** a registered game's secondary button means something observable
- **THEN** the guard fails if that game declares `ignoresSecondaryButton`
- **AND** when it means nothing observable, the guard fails if it does not

#### Scenario: A repaint is not a secondary meaning

- **WHEN** a game answers `RIGHT_BUTTON` but the gesture leaves the same frame
  and the same save, and changes nothing about what the next input does
- **THEN** the guard demands `ignoresSecondaryButton`, even though the button was
  consumed

#### Scenario: A meaning reached through a shared helper counts

- **WHEN** a game's secondary meaning is supplied by `pressNoteTakingCell` or
  another shared helper, with no `RIGHT_BUTTON` branch of its own
- **THEN** the guard credits it, because the derivation reads behavior rather
  than source

### Requirement: The gesture layer's own decisions are tested

`detectSecondaryButton` SHALL have direct tests, separate from the per-game
sweeps. A per-game guard that hands a game a synthetic `RIGHT_BUTTON` proves the
game copes with the decision; it cannot prove the decision was the right one, and
those are two different guarantees.

The tests SHALL cover the numbers the gesture arbitrates, because each is a
behavior rather than a constant: the hold window, the drag threshold and a
wobble inside it, a pointer type that is not touch, both affordances disabled,
the two-finger tap from either finger's release, and the second finger's **timer
reset** — which is what makes the documented worst case twice the hold time.

They SHALL also cover `unhandledEvent`, since the view replays it: without that,
a tap faster than the detection round trip loses its release entirely, and any
state the puzzle shows only while a press is held stays on screen.

#### Scenario: A stationary finger past the hold window is secondary

- **WHEN** a touch press stays within the drag threshold for longer than the hold
  time
- **THEN** the detector reports the secondary button

#### Scenario: A finger that moves is not

- **WHEN** a touch press moves beyond the drag threshold before the hold time
- **THEN** the detector reports the primary button, and hands back the move event
  it consumed so the view can replay it

### Requirement: Keyboard reachability is a recorded decision for every game

Every registered game SHALL either handle keyboard cursor input, or appear on an
explicit exemption list whose entry states **why** — and the exemption's reason
SHALL be in that game's spec, not only in a comment or a test fixture.

The point is not that every game must have a cursor. It is that "this game has no
keyboard" must be a decision somebody made and wrote down, rather than a
condition nobody noticed.

Handling a cursor key is necessary and not sufficient: the guard SHALL also
assert that some **keyboard-only sequence commits a move**, because a cursor that
goes everywhere and does nothing is not a keyboard. That probe SHALL allow
multi-step sequences, since several games pick a piece up with one select and put
it down with a second (Pegs, Map, Rectangles, Samegame, Signpost, Slide,
Untangle), and a single-keypress probe scores every one of them deaf.

The check SHALL derive a game's coverage through the registry and the shared
input helpers, not by reading its `index.ts` alone: Palisade and Separate have no
direct `CURSOR_*` reference and full cursor handling, via
`border-grid.ts`'s `interpretBorderGridInput`. A check that reads one file
convicts two games that are fine, which is the failure mode where a guard is
turned off rather than fixed.

#### Scenario: A game with no keyboard handling must be on the list

- **WHEN** a registered game handles no cursor input
- **THEN** the guard fails unless that game is on the exemption list
- **AND** the exemption names the reason, which is also stated in the game's spec

#### Scenario: Cursor handling through a shared helper counts

- **WHEN** a game's cursor input is supplied by `interpretBorderGridInput` or
  another shared helper rather than by its own `CURSOR_*` branches
- **THEN** the guard recognizes it as covered

#### Scenario: A cursor that cannot act is not a keyboard

- **WHEN** a game moves a cursor in response to the arrow keys but no
  keyboard-only sequence changes the board
- **THEN** the guard fails

### Requirement: Every on-screen key a game offers reaches that game

For every game declaring `requestKeys`, the suite SHALL assert that each returned
button is one the game's `interpretMove` actually consumes somewhere on a real
board. On touch the key panel is the only character-entry route there is, so a
panel key that reaches nothing is an input a touch player cannot make at all.

This is the **reverse direction** of the emittable-key scan, and neither
substitutes for the other: that scan asks whether a code a game *tests* can be
sent, and this asks whether a code the frontend *sends* is received.

The probe SHALL prime the board before convicting a key — a "Clear" key on an
already-empty cell is a legitimate no-op, and scoring that as dead wrongly
convicts every keypad game. A key that is genuinely unreachable SHALL be recorded
in the guard as a finding under management, naming the change that owns it,
rather than silently excluded.

The count of games with a panel SHALL carry a floor that only moves up, because a
game that *loses* its `requestKeys` hook makes every one of its on-screen keys
unreachable at once — the largest version of this defect, and the one a per-key
sweep structurally cannot see.

#### Scenario: A panel key the game ignores fails the suite

- **WHEN** a game's `requestKeys` returns a button its `interpretMove` never
  consumes
- **THEN** the guard fails, naming the key and the game

#### Scenario: A clear key on an empty board is not a finding

- **WHEN** the probe tests a key whose only effect is to erase
- **THEN** it first writes something for that key to erase, rather than reporting
  the key as unreachable

### Requirement: The on-screen key panel is a second key emitter

A guard reasoning about which button codes this frontend can deliver SHALL
account for **both** emitters: `puzzleKeyMap` in the interactive view, and the
buttons a game's own `requestKeys` puts on the on-screen panel, which
`puzzle-keys` sends straight to `Puzzle.processKey`.

The set SHALL be computed **per game**, not as a union over the collection. The
clear key's button is `8` — upstream's `'\b'`, which `puzzleKeyMap` never sends —
so it is reachable in a game that offers it on its keypad and unreachable in a
game with no keypad at all. A union would excuse exactly the dead bindings the
scan exists to find.

A scan for a button compared against an unsendable code SHALL cover
`switch (button) { case <code>: }` as well as `button === <code>`. A `case` label
is neither a comparison nor a declaration, and one survived the collection-wide
erase-key sweep in that form: Unruly's gate admitted `DELETE` through
`isEraseKey` and its switch matched only `8`, so the key read as wired at every
level and was dead at the last one.

#### Scenario: A dead binding inside a switch is caught

- **WHEN** a game contains `switch (button)` with a `case` label for a control
  code neither the key map nor that game's own panel can send
- **THEN** the scan reports it, naming the file and line

#### Scenario: The clear key is emittable only where it is offered

- **WHEN** the scan evaluates a comparison against button `8`
- **THEN** it is accepted in a game whose `requestKeys` includes the clear key,
  and reported in a game that declares no keypad

### Requirement: One keyboard-cursor vocabulary across games

A game with a keyboard cursor SHALL hold it in the engine's shared cursor
shape — a position and a visibility flag — under one canonical `Ui` field,
rather than naming either itself. The engine SHALL provide that shape and the
verbs for it: constructing one, moving it, revealing it and hiding it.

A **plain** arrow press SHALL reveal the cursor **and** move it, so a keyboard
player never spends a keypress on the reveal. A pointer press SHALL hide it.
Where an arrow is *itself an action on the board* — a modified arrow that marks,
a mode in which the arrow slides the grid — a first press on a hidden cursor MAY
reveal without acting, because a player who cannot see the cursor cannot see
where the action would land; the plain arrow beside it SHALL still reveal and
move.

What a game does *while* the cursor moves SHALL remain entirely its own: a game
may paint, fill a line, or refuse a step, and the shared shape SHALL NOT grow to
cover any of it. A genuinely different **traversal** — half-cell coordinates,
corner-skipping, a lock mode — likewise stays per-game, and a helper for one
SHALL be named apart from the shared verb so neither shadows the other. A game
MAY carry an extra flag *beside* the cursor where it draws a real distinction
the shared shape does not (which device revealed it; what it is armed for). The
shared part is the noun; the verb is the game's.

The engine SHALL fail the build for a cursor held anywhere but the canonical
field. That check SHALL find it **structurally** — by the shape, read off the
engine's own constructor, over every game's real `newUi` output — rather than by
matching names, so an eleventh spelling is caught as surely as the ten that
preceded it. A game SHALL NOT re-declare an engine cursor helper, which is
enforced from `pointer.ts`'s own export list.

#### Scenario: One arrow press both reveals and moves

- **WHEN** a player presses an arrow key on a board whose cursor is hidden
- **THEN** the cursor becomes visible **and** has moved one cell

#### Scenario: An arrow that acts on the board still reveals first

- **WHEN** a player presses a modified arrow that would mark or slide, on a
  board whose cursor is hidden
- **THEN** the cursor becomes visible and the board is unchanged

#### Scenario: A game keeps what it does while moving

- **WHEN** a game paints or fills as its cursor traverses
- **THEN** that behavior is unchanged by the shared cursor shape, which reports
  only where the cursor is and whether it is visible

#### Scenario: A cursor under any other field fails the build

- **WHEN** a game holds a cursor-shaped object under a field of its own naming
- **THEN** the guard fails, naming the game and the field — without having been
  told that name in advance

### Requirement: The note-taking cell is one shared mechanic, not eleven copies

A game whose player **highlights a cell, types a value into it, and pencils
candidate marks in it** SHALL obtain that mechanic from the engine rather than
implementing it. The engine SHALL provide it as a *mechanic* module — the same
shape and the same test as the shared border-marking grid: what belongs in it is
what would otherwise have to change in every copy at once, and nothing that
merely looks alike.

The engine SHALL own **what a pointer press does to the highlight**: which
button selects and which deselects, how the fork's sticky pencil mode behaves,
and the fact that a pointer press hands the cursor's provenance back to the
mouse. The engine SHALL also own **what a symbol entry does to the highlight** —
whether a real entry puts it away, and what a keystroke that would write nothing
returns.

A game SHALL keep everything about its puzzle: its coordinate mapping, its
symbol vocabulary, the predicate that decides whether a keystroke is a no-op,
and its own `Move` type. The shared code SHALL report what the press did to the
highlight and SHALL NOT construct a move, because a shared move type would
couple save formats that have no reason to be identical.

The two questions a game answers for itself SHALL be exactly *may the player
type a value into this cell* and *may this cell carry pencil marks*. Those are
real differences about the puzzle — a given, a wall, a clue square and a filled
square are each some game's answer — and everything around them is not.

**Two rules replace disagreements that no game could explain in terms of its
puzzle**, and both SHALL hold for every game in the mechanic:

- A pointer press SHALL move the highlight to the pressed cell, whether or not
  the cell can take what the press offers; the cell decides only whether the
  highlight is *shown*. The position is observable while hidden, because the
  next arrow key resumes from it.
- The highlight SHALL be shown only where the mode it is in could write —
  against "may carry marks" in pencil mode and "may take a value" otherwise.

The sticky pencil toggle is the one arm exempt from the first rule: because it
is a mode switch rather than a selection, a press on a cell that could take no
mark SHALL leave the highlight where it is.

Neither the press nor the entry SHALL change pencil mode as a side effect of
putting the highlight away. A latched pencil mode stays latched until the player
unlatches it, which is what the preference's own wording promises.

The mechanic's `Ui` fields SHALL have one spelling and one polarity across the
whole collection, including in a game that carries the cursor-provenance flag
without the rest of the mechanic. Where a game does not offer one of the pencil
preferences, its behavior SHALL be derived from that absent declaration rather
than from a roster of exempt games.

**Every game in the mechanic SHALL offer both pencil preferences, defaulted the
same way**, so that one gesture does one thing across the family and the player
who wants the other still has it. The collection previously answered
"does a mouse-driven pencil mark keep the highlight" two ways — five games kept
it with no preference at all, six offered the preference and defaulted it off —
which a player met as the same gesture behaving oppositely in two games of the
same shape. Both halves SHALL be guarded over the derived population: the
default, and that the preference is offered at all.

Enrollment SHALL be **derived**: a game is in the mechanic iff its `Ui` carries
the fields, read off its own `newUi` output. The engine SHALL fail the build for
a game that carries them and does not route its press through the shared arm —
a check that must be a source scan, because what is being asserted is that a
hand-written twelfth copy does not exist.

#### Scenario: A press onto a cell that cannot take a value

- **WHEN** a player presses a given, while the highlight is showing elsewhere
- **THEN** the highlight is hidden **and** has moved to the pressed cell
- **AND** the next arrow key steps from the pressed cell

#### Scenario: The sticky toggle does not double as a selection key

- **WHEN** a player presses the secondary button on a filled cell, in a game
  offering sticky pencil mode
- **THEN** pencil mode toggles
- **AND** the highlight is exactly where it was, shown or hidden as it was

#### Scenario: A latched pencil mode survives a mouse-driven mark

- **WHEN** a player has latched pencil mode and enters a mark with the pointer
- **THEN** pencil mode is still latched

#### Scenario: The family answers a preference question once

- **WHEN** a player makes the same mouse-driven pencil mark in any two games of
  the mechanic, having changed no preferences
- **THEN** the highlight behaves the same way in both

#### Scenario: A game carrying the fields must use the mechanic

- **WHEN** a game's `newUi` returns the mechanic's `Ui` fields
- **AND** its sources never call the shared press arm
- **THEN** the build fails, naming that game

### Requirement: One completion vocabulary across games

Every game's state SHALL express "the player has solved this" and "a solver was
used" under the same two names, so that the engine can derive from them rather
than sniffing each game's spelling.

The convention SHALL be: flash once when a **player move** brings the board into
a solved state. What is suppressed is the Solve *command* — the move on which
"a solver was used" flips false→true — and **not** a board that has ever been
cheated. A player who uses Solve, unmakes some of it, and finishes by hand has
won; the record that they used the solver survives in the status bar and in the
midend's solved-with-help status, which is where it belongs.

Whether a game can reach that case is the game's own business: it requires
"solved" to be **recomputed** on each move rather than latched once. A game that
latches it simply never presents the case, and the shared helper SHALL behave
for it exactly as the stricter condition did.

Any game whose win celebration is that convention SHALL use the shared helper
rather than restating the condition. A game MAY keep its own celebration hook, but only
for a genuine difference: more than one flashing outcome, a duration that is not
the shared one, a condition that is not "became solved", or a completion that is
not a flag at all. **A differently spelled flag SHALL NOT be a reason to keep
one**, because it is not a difference a player can see. The engine SHALL keep
the surviving exceptions listed with their reasons, so the list cannot grow
without someone stating one.

A game whose state genuinely lacks one of the two — because it has no solver, or
computes completion rather than storing it — SHALL have that absence recorded
**per field**, and the record SHALL be checked against the games: an exemption
for a field the game actually has SHALL fail, so the list cannot decay into a
blanket that hides a later removal.

The engine's own save envelope is **not** governed by this requirement. Its
solver-was-used key is a persisted wire name, so changing it breaks saved games;
that is a player-visible compatibility decision and belongs to the owner, not to
a vocabulary sweep.

#### Scenario: The convention is not restated

- **WHEN** a game's win flash is the collection's convention
- **THEN** it calls the shared helper, and contains no hand-written copy of the
  transition condition

#### Scenario: A manual completion after a Solve still celebrates

- **WHEN** a player uses Solve, unmakes part of it, and completes the board by
  hand, in a game that recomputes rather than latches "solved"
- **THEN** the flash plays, and the solver-was-used record is unaffected

#### Scenario: The Solve command itself does not celebrate

- **WHEN** the Solve command completes the board
- **THEN** no flash plays

#### Scenario: A genuine celebration keeps its own hook

- **WHEN** a game flashes on more than one outcome, or for a different duration
- **THEN** it keeps its own hook, and records which of those reasons applies

#### Scenario: A re-spelled flag fails the build

- **WHEN** a game declares one of the retired spellings on its state
- **THEN** the guard fails, naming the file and line

#### Scenario: A stale exemption fails the build

- **WHEN** a game is recorded as lacking one of the two flags but in fact has it
- **THEN** the guard fails, so the exemption list cannot outlive its reason

### Requirement: A hint refusal is worded once for the whole collection

A refusal returned by `Game.hint` SHALL come from the collection's single set of
refusal messages, and a game SHALL NOT spell one of those messages itself. The
set SHALL distinguish, at minimum: the board is finished; the board contradicts
its clues **and the offending cells will be highlighted**; the board is
inconsistent but **no individual entry can be shown to be wrong**; deduction has
run out; and — for a game that teaches no technique — that no move would help.

This is required because the help teaches "there is a mistake on the board" and
"deduction has run out" as a *pair* whose responses are opposite, and a player
cannot learn a pair whose members are worded differently in each puzzle.

The choice between the two mistake refusals SHALL be made by **whether a
highlight will actually appear**. A message promising highlighted cells SHALL be
emitted only where the game has established that its `findMistakes` returns some;
where a game's `findMistakes` is a rule validator that cannot see a
wrong-but-legal entry, the refusal SHALL be the one that asks the player to undo
rather than one that points at a highlight that never comes.

A game MAY word a refusal differently where naming *its own* dead end is the
substance of the hint — a game with no deduction to offer has nothing else to
give — and such an exception SHALL be recorded with its reason where the
guarantee is enforced, rather than left as an unexplained difference.

Conformance SHALL be asserted by scanning for the refusal's **shape** rather
than for the name of the function returning it. A scan keyed on a function named
`hint` misses a game whose hint is named for the game, and did: it reported a
census of the whole collection with one game absent from every figure.

#### Scenario: Two games refuse for the same reason

- **WHEN** two games decline to hint because no further move can be deduced
- **THEN** the player reads the same sentence in both

#### Scenario: A new phrasing cannot arrive unnoticed

- **WHEN** a game returns a refusal message that is neither one of the shared
  messages nor a recorded exception
- **THEN** the conformance check fails

#### Scenario: A copy of a shared message is not a substitute for it

- **WHEN** a game spells out the text of a shared refusal instead of using it
- **THEN** the conformance check fails, because a copy drifts the first time the
  wording is improved

#### Scenario: A refusal promises a highlight only when there will be one

- **WHEN** a game refuses because the board contradicts its clues
- **THEN** it uses the message naming highlighted cells only if its
  `findMistakes` reports some for that board
- **AND** otherwise uses the message that asks the player to undo instead

#### Scenario: A game whose dead end is its own

- **WHEN** a game's refusal names a situation particular to it, and saying so is
  what the hint has to offer
- **THEN** that wording is permitted, and the reason is recorded alongside the
  check that would otherwise reject it

### Requirement: Every game's board sits at one tone

The engine SHALL hand a game's `colors()` a background already shifted off pure
white and pure black by `mkhighlightBackground`, from a single resolution point
(`resolvePalette`) that every consumer of a game's palette — the midend's palette
and dark-value reporting and the render-scenario harness — goes through. The
color a game paints its board with SHALL therefore resolve to the same value
across the collection for a given host background, whether or not the game's own
`colors()` calls `mkhighlight`.

A game MAY call `mkhighlight` on the background it receives to obtain the bevel
trio; the background it gets back SHALL be identical to the one it was handed.

#### Scenario: A raw-background game and a mkhighlight game paint one board

- **WHEN** a game that assigns the background it receives as its board, and a
  game that assigns `mkhighlight(...).background`, are both resolved against pure
  white
- **THEN** the two board colors are equal

#### Scenario: Every registered game paints the collection's board

- **WHEN** every registered game's palette is resolved against pure white and
  against the light host
- **THEN** the color at each game's board index equals the shifted host in both
  cases
- **AND** the check counts the games it looked at and fails if the shift did not
  fire

#### Scenario: A game calling mkhighlight is unaffected

- **WHEN** a game's `colors()` calls `mkhighlight` on the background it receives
- **THEN** the trio it obtains equals the trio derived from the unshifted host,
  because the shift is idempotent

### Requirement: A ruled-out edge is discernible in both schemes

The shared "ruled out" role (`lineNoColor`) SHALL resolve to a color a clear
step off the board in both schemes — a mid gray — and SHALL remain visibly
distinct from the completed-region fill (`correctRegionColor`) it may be drawn
across, so that a player, and in particular a keyboard player whose cursor walks
the edges, can see where a ruled-out edge lies while still reading it as
disabled rather than drawn.

#### Scenario: A ruled-out edge stands off a dark board

- **WHEN** the role is resolved for the dark scheme against the collection's
  board
- **THEN** its lightness differs from the board's by more than the undecided
  edge's did before this change (the value the owner's playtest found nearly
  invisible)
- **AND** it remains darker than ink

#### Scenario: A ruled-out edge across a completed region still shows

- **WHEN** the role and `correctRegionColor` are resolved against the same
  board in either scheme
- **THEN** the two are visibly distinct

### Requirement: The solved flash is one role

A game whose completion flash is drawn as a fill or line color SHALL take that
color from the shared `FLASH` role, which is maximum contrast against the
surface and inverts with the scheme. A game whose flash is an animation rather
than a color — a bevel wave, a state swap, a color cycle, a wash under text —
keeps its own mechanism and is not covered by this requirement.

#### Scenario: Two white-flashing games flash the same color

- **WHEN** two games that flash their board to white on completion are resolved
  in either scheme
- **THEN** both flash colors are equal
- **AND** neither is the board's own color in that scheme

### Requirement: A departure from a shared role is stated at the assignment

Where the shared palette defines a role for a meaning a game's color carries
(the keyboard cursor, a held or dragged item, a flagged mistake, a hint's action
or evidence, a black or white piece, a retired clue, a correctly completed
region), the game SHALL assign that role. A game that assigns a different color
for that meaning SHALL state, on or immediately above the assignment, why its
board has spent the role's color — so that the departure is a recorded decision
and not an unexamined inheritance.

A cross-game check SHALL find every such departure by the shape of the
assignment rather than by the slot's name, and SHALL fail on one that carries no
reason.

#### Scenario: A game whose board has spent the cursor's green says so

- **WHEN** a game assigns its keyboard-cursor slot a color other than the shared
  cursor role
- **THEN** the assignment carries a one-line reason naming what the role's color
  is already used for on that board

#### Scenario: An unexplained departure fails the check

- **WHEN** a game assigns a slot whose meaning a shared role covers to a color
  other than that role, with no reason at the assignment
- **THEN** the cross-game check names the game and the slot

#### Scenario: The check counts what it looked at

- **WHEN** the cross-game check runs
- **THEN** it reports the number of games and slots it examined and fails if that
  number is not the collection's

### Requirement: The difficulty tier list is not a projection of the technique ladder

A game's tier list SHALL NOT be derived from its declared deduction techniques,
and a change proposing to do so SHALL be answered with this requirement rather
than by re-surveying the games. The framework vision (`docs/framework-rdd/`,
retired by `retire-the-framework-vision`) proposed the projection — *"if your
techniques carry tiers … there is no hand-written `DifficultyContract`; it is a
projection of the technique ladder"* — and `declare-deduction-techniques` appeared
to supply the lever by giving every technique a declared `tier`. It does not, for
three independent reasons, each sufficient on its own.

**A ladder declares tier *indices*; a tier list is *names*.**
`DeductionTechnique.tier` is a `number`. "Easy" and "Unreasonable" are strings a
player reads in the Custom dialog, and no projection invents them from integers.

**The projection runs the wrong way.** `runDeductionFixpoint` *receives*
`maxTier`, derived from a tier index — it is downstream of the tier list, not
upstream of it. Every ladder in the collection is an array literal built inside a
solve, closing over board state, so there is nothing to interrogate at module
load, which is when `paramConfig` and the params codec need the list.
`engine/latin.ts` makes this concrete: it synthesizes its rungs as `0..maxdiff`,
so asking that ladder for its tiers returns the cap it was handed.

**A tier is not always a rung.** Towers, Keen, Group, Unequal and Mathrax put
their top tier on `latinSolverRecurse`, outside the fixpoint entirely — and the
latin ladder still synthesizes a rung for it that can never fire, because no
built-in technique maps to that level and the game's `usersolvers` slot is
`null`. Dominosa's "Ambiguous" is a relaxation of what the puzzle promises rather
than a technique. Undead's only ladder on the shared runner is its *hint
recorder*, whose two techniques both sit on tier 0 while the game offers three
tiers. A ladder-derived list is short for every one of them.

The scope this was measured over SHALL be recorded rather than re-estimated:
14 games run a solver on the shared fixpoint runner (Group, Keen, Mathrax, Salad,
Towers and Unequal through `engine/latin.ts`; Clusters, Filling, Magnets,
Pattern, Singles, Spokes, Undead and Unruly directly), 29 declare a difficulty
contract, and the overlap is 12 — Filling and Pattern are untiered. Boats and
Loopy name `runDeductionFixpoint` only in doc comments explaining why they do not
use it, so a name-keyed scan over-counts them.

#### Scenario: A change proposes deriving tiers from techniques

- **WHEN** a change proposes projecting the difficulty contract from the
  technique ladder
- **THEN** it is refused with the three reasons above, which do not depend on
  which games are currently on the shared runner
- **AND** the reasons are re-derived only if `DeductionTechnique` starts carrying
  a tier *name*, the ladder becomes declarable without a board, and every tier a
  game offers becomes a rung — all three, since any one of them left standing
  defeats the projection on its own

### Requirement: Difficulty tier names come from one collection-wide scale

A tiered game SHALL name its tiers from the collection's scale by position,
rather than choosing words of its own. The scale, easiest first, is **Easy ·
Normal · Tricky · Hard · Extreme**, and a game with `n` tiers takes the first
`n`. `tierNames(n)` in `engine/difficulty.ts` is that projection and SHALL be the
only definition a game writes.

**Position and name SHALL be a bijection across the collection.** "Tricky" is the
third rung in every game that has one; "Normal" the second. This is the property
the convention exists for: before it, the 29 tiered games had chosen twelve
different words with no decision behind the spread — the six three-tier games
used six different vocabularies, the eleven two-tier games five, and "Tricky" was
the second rung in six games and the third in three others, so the word carried
no meaning between games.

**`Unreasonable` SHALL NOT be issued by position.** It is not a rung of the scale
but a promise about one — reserved by "A tier whose boards can require Search
SHALL be named `Unreasonable`" — so `tierNames(n, { search: true })` replaces the
top name with it on the game's declaration that its hardest rung searches. A
two-tier game whose harder rung backtracks is `Easy · Unreasonable`; a six-tier
game whose top rung is a bounded tactic never acquires the word.

`tierNames` SHALL refuse a count the scale cannot name rather than returning a
short list. A truncated list would leave a game with fewer names than tiers, and
every cross-game guard iterates the names — so the shortfall would surface as
guards quietly covering fewer tiers, not as an error.

**An override SHALL remain first-class**, declared in the change that needs it. A
tier already declared in `nonUniqueTiers` is exempt automatically and SHALL NOT
be listed anywhere else: Dominosa's "Ambiguous" is a relaxation of what the
puzzle promises rather than a difficulty, and it already says so for its own
reasons. Deriving the exemption from that declaration rather than from a roster
keeps the guard's exception list from going stale as quietly as a membership list
would.

Adopting the convention SHALL NOT change any board, any tier index, any params
encoding, or any generated puzzle. `DIFF_CHARS` maps a tier *index* to a
character, so every existing game ID and saved game continues to decode to the
same board at the same tier; only the word on the menu moves. A differential
fixture that moves under a renaming means the rename reached code it should not
have.

**A game's internal `DIFF_*` constant names are solver rung labels, not tier
names**, and SHALL NOT be read as the player-facing list. They were already
unreliable — Solo declares eight and offers six — and under the convention they
routinely differ, as Unruly's `DIFF_TRIVIAL` naming a tier a player sees as
"Easy". The rung labels stay because the solvers and the differentials are
written in them.

#### Scenario: A new game declares its difficulty tiers

- **WHEN** a game with `n` difficulty tiers is implemented
- **THEN** it calls `tierNames(n)` — or `tierNames(n, { search: true })` when its
  hardest rung can require Search — rather than authoring names
- **AND** it inherits the collection's vocabulary without a decision to make

#### Scenario: A game's tier names drift from the scale

- **WHEN** a game names a tier off the scale, or out of position
- **THEN** `difficulty-contract.test.ts` fails, naming the game and the
  conventional list it should have used
- **AND** the game either adopts the convention or declares an override with its
  reason, rather than the guard being relaxed

#### Scenario: A preset title names a difficulty

- **WHEN** a preset's title uses one of the collection's difficulty words
- **THEN** it SHALL be that preset's own tier
- **AND** a title that names no difficulty at all is permitted — Salad's presets
  name a symbol range, Solo's Killer preset names its mode — so the rule is a
  prohibition rather than a requirement, and needs no exemption roster
- **AND** preset titles SHALL derive their tier word from the game's tier list
  rather than restating it, because a restated word is a copy that no test reads
  and that goes stale silently: Solo's menu offered "3x3 Intermediate" while its
  Custom dialog offered "Tricky", with the whole suite green

#### Scenario: The guard is mistaken for a check on the Search promise

- **WHEN** a game's tier list ends in `Unreasonable` and the guard passes
- **THEN** that is evidence about the *shape* of the list only
- **AND** it is **not** evidence that the tier has earned the name, because
  `search` is read from the game's own top name and "this rung is a Search" is a
  judgment about the code that no test can read off it

### Requirement: A game declares its params encoding once, and both codec halves are derived

A game whose params encoding fits the collection's grammar SHALL declare it as
an ordered list of segments and obtain `encodeParams` and `decodeParams` from
`paramsCodec` in `engine/params-codec.ts`, rather than hand-writing two
functions that must be exact inverses of each other.

The grammar is what the 57 hand-written codecs turned out to spell, and no
more: a `dims` prefix (`WxH`, with upstream's square fallback) or a `size`
(one untagged leading integer), followed by tagged segments — `num` (`n12`),
`choice` (a tag plus one letter from a table) — and bare `flag` letters. The
options are the variations those codecs actually contained: `full` for a
generator-only field the brief encoding omits, `invalid` for the out-of-range
value an unrecognized difficulty letter leaves behind, `means` for a letter
written when its field is *off*, `omitWhen` for a field written only when
non-zero, and `whenAbsent` for a default computed from params already decoded.

**A segment SHALL name a `paramConfig` field by its `kw` and reuse that item's
`get`/`set`.** This is the requirement's substance rather than an
implementation note: the params form and the codec were two hand-synced copies
of one field list, and naming the field through the form makes it impossible
for a field to appear in the Custom dialog and be dropped from the game ID, or
the reverse. It also keeps a field's representation the game's own business —
three of the converted games store a difficulty tier as something other than an
index, and none of them changed to become encodable. A field the dialog does
not offer may still be encoded by supplying accessors on the segment.

**A segment naming a `kw` no item declares SHALL throw**, rather than encoding
nothing. A silently skipped segment would drop a field from every game ID the
game issues.

#### Scenario: A declared codec round-trips

- **WHEN** a game declares its encoding as a segment list
- **THEN** `decodeParams(encodeParams(p, true))` re-encodes to the same string,
  for every params object the game can reach

#### Scenario: A segment naming an undeclared field is refused

- **WHEN** a segment names a `kw` that the game's `paramConfig` does not declare
- **THEN** building the codec throws, naming the missing `kw`

### Requirement: A params encoding the grammar does not fit stays hand-written

A game whose encoding the segment grammar cannot express SHALL keep a
hand-written codec, and that codec SHALL remain first-class rather than being
treated as debt.

Measured over all 57 games at the time the grammar was written, the shapes it
does not express are: a float-valued param (Rectangles' expansion factor, Net's
and Netslide's barrier probability), a leading letter before the dimensions
(Cube), a `switch` mapping a field to multi-character strings with defaults
omitted (Solo's symmetry and difficulty), a `while` loop over the tail
accepting letters in any order (Dominosa, Mines), and a boolean encoded as an
integer (Mosaic).

**The grammar SHALL NOT grow an option to absorb a single game.** A shared form
escaped by more games than it serves is not a win, and a form that swallows
every game by accreting a per-game hatch is two ways plus a seam rather than
one obvious way — which is the outcome this whole direction exists to avoid.
An option earns its place by serving several games, as `whenAbsent` does.

#### Scenario: A bespoke codec is held to the same guarantee

- **WHEN** a game keeps a hand-written codec
- **THEN** its encodings are asserted by the same byte-stability guard as every
  declared one, so the two shapes differ in how they are written and not in
  what is promised

### Requirement: A game's config field is spelled the same everywhere it is named

A `paramConfig` item's `kw` SHALL be the same string the game's `describeParams`
emits for that field, because the two are joined by key wherever a value is
rendered with its declared name.

Loopy spelled its difficulty item `diff` while `describeParams` emitted
`difficulty`. Nothing failed: the Custom dialog reads the item and the type
header read the value, and neither had occasion to look the other up — until the
header started resolving names from the declaration, at which point the join
missed and it rendered a raw tier index. `difficultyChoiceItem` matches the `kw`
by prefix (`/^diff/`) precisely so a variant spelling stays *enrolled*, which is
a different guarantee from the two spellings being *joinable*.

A game with a genuine reason to differ states the mapping explicitly rather than
relying on the keys happening to match.

#### Scenario: A field named in two places uses one spelling

- **WHEN** a game declares a `paramConfig` item and emits the same field from
  `describeParams`
- **THEN** both use the same key, so a lookup by that key resolves

### Requirement: A shared mechanic is joined by having it, not by declaring it

A game SHALL join a shared engine mechanic by **having** it — registering the
object, carrying the `Ui` fields, declaring the method, calling the arm — and a
cross-game guard SHALL derive its population from what the game *is* rather than
from a roster of opted-in names. A game SHALL NOT be required to add itself to a
list in order to be guarded.

The enrollment fact SHALL be one of: the registered game object (a member's
presence, a flag's value), the `Ui` its `newUi` returns, or the game's own
source with comments removed. `src/engine/testing/enrollment.ts` SHALL be the
shared way to ask those questions, and a guard needing one of them SHALL use it
rather than re-deriving the population.

Every derived sweep SHALL assert a floor on **the population it drew from**, not
only on the set it filtered out of that population.

Where the derived set legitimately contains members the guard's rule must not
apply to, the guard SHALL record them as a **ledger in the guard** — one entry
per member, each carrying its reason — and SHALL assert that the ledger equals
what the derivation found. A ledger entry SHALL NOT be the enrollment key: the
derivation says which games are members, and the ledger says only why a member
is excused. An empty ledger is a valid and meaningful assertion.

#### Scenario: A newly ported game joins every guard for its capabilities

- **WHEN** a game is registered that declares `hint()`
- **THEN** it is covered by every cross-game hint guard, including the
  necessity-voice rule, without any list being edited

#### Scenario: A derived sweep that found nothing fails rather than passing

- **WHEN** the registry a cross-game guard draws from is empty or short
- **THEN** the guard fails on the population floor rather than reporting health
  over an empty set

#### Scenario: A ledger entry that has stopped being true fails

- **WHEN** a guard's exemption ledger names a game the derivation no longer
  places in the exempt set
- **THEN** the guard fails, naming the stale entry

### Requirement: A boolean capability declaration is held to the behavior it claims

The `Game` interface MAY carry a boolean capability flag **only** where a
production consumer needs the answer synchronously and cannot observe it. Every
such flag SHALL be asserted equal to a derivation of the fact it declares, so a
flag that is forgotten, left behind by a changed game, or simply wrong fails a
test rather than going unnoticed.

The three flags the contract carries SHALL be held as follows:

- `ignoresSecondaryButton` SHALL be set if and only if the game consumes no
  `RIGHT_BUTTON` press anywhere on its board.
- `canMarkAll` SHALL be set if and only if the game's `interpretMove` returns a
  move for an `M` press.
- `wantsStylusModifier` SHALL be set if and only if the game's own code reads
  `MOD_STYLUS`.

A flag whose effect is to **disable** a guard SHALL carry such a check, because
nothing else observes it when it lies.

A source scan standing in for one of these derivations SHALL read the game's
code with comments removed: a mention in prose is not a use.

#### Scenario: A flag declared without the behavior fails

- **WHEN** a game sets `wantsStylusModifier` but its code never reads
  `MOD_STYLUS`
- **THEN** the touch guard fails, reporting that the game is exempt from the
  touch-parity sweep for nothing

#### Scenario: A game documenting the absence of a behavior is not convicted

- **WHEN** a game's source mentions `MOD_STYLUS` only in a comment explaining
  that it deliberately has no stylus branch
- **THEN** the guard does not treat that mention as a read

### Requirement: The engine catalog names every shared helper there is

`docs/games/engine-catalog.md` SHALL carry an entry for every module under
`src/engine/`, so the menu a game author consults before re-rolling a helper
cannot silently shrink. A module deliberately without its own entry SHALL be
recorded in a ledger carrying its reason, and that ledger SHALL fail when it
names a module that no longer exists.

The check SHALL run in the pre-commit gate's fast prefix, ahead of the
documentation-only shortcut, and SHALL NOT be a vitest file — a test reading
`docs/` would make that shortcut unsafe (`repo-layout`).

#### Scenario: A new engine module ships without a catalog entry

- **WHEN** a module is added under `src/engine/` and the catalog is not updated
- **THEN** the gate fails, naming the module and pointing at the catalog

#### Scenario: A documentation-only commit deleting an entry is still checked

- **WHEN** a commit touches only `docs/` and removes a module's catalog entry
- **THEN** the check still runs, because it sits ahead of the documentation-only
  shortcut

### Requirement: The necessity-voice rule applies to every hinting game not ledgered as narrating moves

The cross-game narration guard SHALL derive the games subject to the
necessity-voice rule as **every game that ships a `hint()`**, minus a ledger of
games whose hints narrate *moves* rather than deductions, each carrying its
reason. A game SHALL NOT have to be added to a list to be necessity-checked.

An owner-endorsed per-game idiom, exempting narration that carries necessity in
its own words rather than a modal, SHALL be a predicate over the **step** rather
than over its text alone, so an idiom belonging to one leg of a grouped journey
can say so and be held to it. An idiom SHALL be rejected for a game the
necessity rule does not apply to, since such an entry does nothing.

Words that any game could reasonably write to make a necessity claim belong to
the shared vocabulary, not to a per-game idiom.

#### Scenario: A hinting game not named anywhere is necessity-checked

- **WHEN** a game ships a `hint()` and appears in no list
- **THEN** its narration is held to the necessity-voice rule

#### Scenario: An idiom scoped to a continuation leg does not excuse a lead leg

- **WHEN** an endorsed idiom is declared for a game's continuation legs and a
  lead leg is worded the same way
- **THEN** the lead leg is still required to carry necessity of its own

### Requirement: One note-taking vocabulary across games

A game holding the player's provisional per-cell candidate marks SHALL keep them
in a typed array named `pencil`, so that shared code and cross-game guards can
read a game's notes rather than being told per game where they live.

`pencil` SHALL be the word because the engine had already committed to it
everywhere else it speaks about notes — `Ui.pencilMode`, the `pencilSticky` and
`pencilKeepHighlight` preferences, `pencil-prefs.ts`, `pencil-indicator.ts`, and
the `pencilAll` / `pencilStrike` move vocabulary. The element type and the slot
arity SHALL stay the game's own: a candidate bitmask in one slot and a candidate
*cube* of `n` contiguous slots per cell are both conforming, and the array's
width is a fact about the puzzle.

Two things are **outside** this convention, and a guard SHALL NOT convict them:

- A field that is not a candidate set, even where it carries the retired word.
  Pearl's `marks` are the player's *no-line* marks on a cell's four edges, which
  is Loopy's `LINE_NO` rather than a set of candidates.
- A **solver's** own working candidate scratch. It is a different object with a
  different lifetime, and in a game with no note-taking at all it is the only
  candidate array there is; naming it `pencil` would claim a player-facing
  affordance the game does not offer.

The convention SHALL be enforced by scanning for the retired spellings **as a
typed-array field declaration** rather than by enumerating the games that have
notes: there is no runtime signal for "this array holds candidates", so the
population is not derivable and only the violation is. A bare name scan SHALL
NOT be used, because `marks` remains live and correct elsewhere — `HintMarks`,
the `pencilStrike` move's `marks`, a `Mark[]`.

#### Scenario: A game declares its candidate notes under a retired spelling

- **WHEN** a game's state declares `marks` or `pencils` as a typed array
- **THEN** the vocabulary guard fails, naming the file and line, and offers both
  remedies: rename it, or ledger it as not being a candidate set

#### Scenario: A solver's candidate scratch is left alone

- **WHEN** a game's solver module declares its own `marks` working array
- **THEN** the guard does not convict it, by a stated path rule rather than by an
  enumerated exemption for that game

#### Scenario: A ledgered exception that stops being true fails

- **WHEN** a file ledgered as not holding candidate notes no longer declares a
  retired spelling
- **THEN** the guard fails, so the ledger cannot outlive the finding it records

### Requirement: The Mark-all guard derives its roster from the capability

The cross-game Mark-all guard SHALL derive the games it exercises from
`Game.canMarkAll` and read each game's notes through the shared field name,
rather than carrying a hand-written row per game. The only per-game datum it may
hold is one a game genuinely answers differently — the slot arity — and that
ledger SHALL be asserted to name only games that offer the press.

An enrollment check comparing a hand-written roster with the flag it was copied
from SHALL NOT be kept once the roster is derived from that flag: it is then a
tautology. The question that survives is whether the flag matches what the game
*does*, which is asserted separately.

#### Scenario: A newly ported game shipping Mark-all is guarded immediately

- **WHEN** a game is registered that sets `canMarkAll`
- **THEN** it is exercised by every Mark-all property without any row being added

#### Scenario: A slot-arity entry for a game without the press fails

- **WHEN** the arity ledger names a game that does not offer Mark-all
- **THEN** the guard fails, naming it

### Requirement: The engine provides a shared raised-bevel drawing helper

The engine SHALL provide `drawRaisedBevel(dr, bounds, highlight, lowlight)` in
`src/engine/draw.ts`, where `bounds` is the tile body's pixel box
(`{ left, top, right, bottom }`, edges inclusive) and `highlight`/`lowlight` are
the two palette colors. It SHALL draw the raised block — a bottom-right lowlight
triangle and a top-left highlight triangle, lowlight first — in one canonical
winding. Games that draw a raised tile SHALL call this helper, each supplying
its own tile body, instead of re-deriving the triangles locally. The inner fill
that covers the triangles' middle SHALL remain at the call site, because its
color and inset are the game's own.

The engine SHALL also provide `raisedBevelWidth(tileSize)`, returning
`max(1, floor(tileSize / 16))`, and games drawing a raised tile SHALL size their
inner fill's inset from it rather than from a private divisor. The `max(1, …)`
floor is normative: without it the inset reaches zero at small tile sizes and
the inner fill covers both triangles, so the bevel disappears rather than
thinning.

#### Scenario: A raised-tile game draws its bevel through the helper

- **WHEN** a game with a raised tile (e.g. Fifteen, Sixteen, Mines, Inertia,
  Sokoban, Pegs) draws a tile
- **THEN** it calls `drawRaisedBevel` with that tile's own bounds and its
  highlight/lowlight colors
- **AND** it insets its own inner fill by `raisedBevelWidth(tileSize)`
- **AND** the two filled triangles cover the same pixels the game's prior
  private copy did (a filled triangle is winding-independent, so traversal order
  does not change the filled region)

#### Scenario: A game whose bevel is not two triangles keeps its own

- **WHEN** a game draws a beveled shape that is not the two-triangle block —
  Twiddle's four trapezoids meeting a center point, each taking its own
  cursor-highlight color and rotating during its animation
- **THEN** it SHALL NOT be expressed through this helper, and keeps its own
  drawing code

#### Scenario: No game re-derives the bevel

- **WHEN** the collection's game sources are scanned for an adjacent pair of
  `drawPolygon` calls filled with the bare `COL_LOWLIGHT` and `COL_HIGHLIGHT`
  constants
- **THEN** the set is empty
- **AND** the scan reports how many sources it read, so it cannot pass by
  matching nothing

### Requirement: A comment naming a palette-override index is checked against the declaration

A game's render module SHALL NOT state, in prose, which dark-mode
`paletteOverrides` indices the app applies to that game unless
`src/puzzle/augmentation.ts` actually declares them, and a test SHALL hold the
two together.

Such a comment is a claim about another file, and it is usually stated as the
*reason* appending a palette index past the upstream `COL_*` enum is safe. When
the declaration is deleted the comment keeps reading as verified, because its
conclusion stays true for a different reason — no overrides at all makes any
append safe — so nothing fails and nobody looks. Six such comments across four
games survived the deletion of every override but one.

The guard SHALL find its population by **shape** — *every* `paletteOverrides`
mention in any game's render module, whatever the game and however the sentence
is phrased — never from a roster of games, and SHALL assert the number of files
scanned and mentions matched so that a scan matching nothing cannot report
health.

It SHALL **classify** what that shape catches rather than filter it, into the
two forms a claim can take — "this game declares none", and "this game's
overrides are indices *n*, *m*" — and a mention fitting neither SHALL fail. An
unclassifiable claim is precisely the one nothing can check: the sixth stale
comment named no index at all, saying only that the overrides "apply
unchanged", and a guard that skipped what it could not parse would have skipped
it.

The declaration side SHALL be read from the module, not from a parse of its
text, so there is no second reading of it to drift.

#### Scenario: A game's comment names an override index that is not declared

- **WHEN** a render module's comment names a `paletteOverrides` index for its
  game
- **AND** `src/puzzle/augmentation.ts` declares no such override for that game
- **THEN** the guard fails, naming the file, the claimed index and the actual
  declaration

#### Scenario: The declaration moves

- **WHEN** an override's index changes in `src/puzzle/augmentation.ts`
- **THEN** the guard fails for every comment still naming the old index

#### Scenario: A comment states a claim the guard cannot check

- **WHEN** a render module mentions `paletteOverrides` without either declaring
  the game has none or naming the indices
- **THEN** the guard fails, asking for one of the two checkable phrasings

#### Scenario: The scan matches nothing

- **WHEN** the scan finds no render modules, or no `paletteOverrides` mentions
- **THEN** the guard fails on its own input count rather than passing over an
  empty population

### Requirement: The midend reports where a displayed hint sits in its journey

When a hint step is on display, the midend SHALL report its position within the
**journey** it belongs to, and the journey's length, so the chrome can say
"Step 2 of 3" while one deduction plays out over several moves.

A journey is the unit this collection already has: the step on display plus
every following step the game flagged `continuesPrevious` ("One deduction firing
is one journey"). The midend SHALL derive it by walking back to the first step of
that run and forward to the last — never from anything a game declares for this
purpose, because `continuesPrevious` is already set by the games that group their
steps, for their own reasons.

The position SHALL NOT be the index within the stored plan. For a plan-based
game the stored plan is the whole tour, and "Step 3 of 47" is a fact about the
solver rather than about the hint the player is looking at. A game that never
groups its steps therefore reports a journey of length 1, and the chrome shows
nothing.

The report SHALL be absent when no step is displayed, so a stale position cannot
sit beside a board with no hint on it.

#### Scenario: A multi-leg deduction reports its progress

- **WHEN** a hint plan's steps 2 and 3 are flagged `continuesPrevious`
- **AND** the first step is displayed
- **THEN** the midend reports position 1 of 3
- **AND** after a move completes that step, position 2 of 3

#### Scenario: A single-leg hint reports a journey of one

- **WHEN** the displayed step is flagged neither as a continuation nor followed
  by one
- **THEN** the journey length is 1, and the chrome shows no step counter

#### Scenario: No hint is displayed

- **WHEN** no hint step is on display
- **THEN** no journey position is reported at all

### Requirement: A game declines a button it did not act on

`interpretMove` SHALL return `null` for a button it did not act on, and the suite
SHALL assert that across every registered game by sending button codes nothing in
the vocabulary can mean.

The return value is not only a repaint hint. Three collection-wide input guards
ask their questions *by* it — keyboard reachability, the
`ignoresSecondaryButton` biconditional, and the on-screen-key sweep — and
`view-interactive.ts` raises `puzzle-key-unhandled` exactly when a game declines
a key, which is what lets a bare letter become an app command with no per-game
roster. **A game that answers everything therefore passes every one of those
guards vacuously and takes the app's bare-letter shortcuts away from its own
players**, and both failures are invisible from a green suite.

The probe codes SHALL be asserted unactionable rather than assumed so, against
the shared button vocabulary itself: free of every bit in `MOD_MASK`, outside the
mouse and cursor ranges, outside the printable-ASCII and cancel-key codes, and
absent from every game's `requestKeys`. **Unicode's private-use area is not a
safe choice and SHALL NOT be used**: button codes are not Unicode, `MOD_MASK` is
`0x7800`, and `0xE000` decodes as `MOD_NUM_KEYPAD | MOD_SHFT | 0x8000`. That
choice is how this guard was first mis-measured — it convicted Sixteen, which
reads the keypad bit and was answering the probe exactly as designed, and put a
second game into a finding whose real population was one.

The probe SHALL be sent at the keyboard origin `(0, 0)` as well as across the
board, because a game gating on pointer *coordinates* alone answers every key
that arrives there, and a board-only sweep scores it healthy.

A game that claims such a code SHALL appear on an explicit ledger whose entry
states why, and the ledger SHALL be asserted **exactly equal** to the set the
sweep finds, so an entry cannot outlive the behavior it excuses.

This guard SHALL NOT be read as reopening "did the board change" as the question
the other input guards ask; that question falsely convicted four games and
"consumed" remains the right one. Asserting that a code with *no meaning* leaves
the board untouched is the one direction that has no innocent reading.

#### Scenario: A game answering a meaningless code is caught

- **WHEN** a registered game returns non-`null` for a button code the vocabulary
  cannot express
- **THEN** the guard fails and names the code, unless that game is on the ledger

#### Scenario: The probe codes are checked before the games are

- **WHEN** the guard runs
- **THEN** each probe code is asserted to carry no modifier bit, to be no mouse,
  cursor, cancel or printable-ASCII code, and to be offered by no game's keypad

#### Scenario: A fixed game cannot stay on the ledger

- **WHEN** a game on the ledger stops claiming unactionable codes
- **THEN** the guard fails until its entry is deleted

#### Scenario: The keyboard-reachability guard is sensitive again

- **WHEN** a game that previously answered every code has its cursor-key
  handling removed
- **THEN** the keyboard-reachability guard fails for that game, where before it
  passed

### Requirement: The collection's input guards share one behavioral probe

The questions the collection-wide input guards ask of a game SHALL live in one
shared module (`src/engine/testing/input-probe.ts`), and each guard SHALL ask
them through it rather than carrying its own copy.

Two guards in different directories were building the same board, walking the
same probe grid and hashing the same save, and they had already drifted: the
bare-letter sweep seeded its board differently, tested a single cursor position,
and consequently reported a different set of games the moment its board changed —
Tents accepts `n` on any square but a tree, so the finding depended on what the
seed dealt.

Every probe SHALL be **behavioral**: it drives a real `Midend` over a real board
through the same path the frontend uses. No probe SHALL read a game's source, and
none SHALL read a declaration about a game — a game joins a population by *having*
the behavior. A probe whose answer depends on where a cursor happens to land SHALL
walk the cursor rather than test one cell.

#### Scenario: A new guard inherits the probes

- **WHEN** a new collection-wide input guard is written
- **THEN** it obtains its board, probe points and questions from the shared
  module, and does not restate them

#### Scenario: A probe does not depend on the deal

- **WHEN** a probe's answer would differ according to which board a seed dealt
- **THEN** it sweeps the positions that could differ rather than asserting from
  one

### Requirement: A cross-game guard SHALL assert that tiers bind

`ts-migration` § "A difficulty tier binds the board it generates" already
requires the behavior, and `engine/difficulty.ts`'s `solvableAtExactlyTier` is
its one expression. **This requirement adds only the check**, because until it
nothing in the collection compared the tier a board was generated at with the
tier the board needs: `difficulty-contract.test.ts` computed the lowest solving
cap and used it only as the floor of a monotonicity sweep — an assertion sitting
beside the very value that would have proved the point, measuring a neighbor of
it (`AGENTS.md` § "Method").

A cross-game guard SHALL, over a population derived from the registry with no
enrollment list, require that a board dealt from a preset whose tier the game's
difficulty contract can read is solvable at that tier and at no lower one.

**The rule has two spellings and the guard SHALL be what makes them meet.** A
game's generator states the tier-acceptance rule in its own terms, and the
game's `DifficultyContract.solveAtCap` states it again for every cross-game
consumer. A game's own tests exercise only the first, so a contract whose capped
solve is *wider* than the tier it names is invisible: Undead's generator bounded
Easy at three arc-consistency passes while its contract ran arc-consistency
unbounded, so every Normal board graded as Easy-solvable and the collection's
difficulty guards read an Easy that was not Undead's. Neither side was checkable
alone.

**The guard SHALL be keyed on the presets a player can pick**, reading each
preset's own tier through the difficulty contract — never on a tier written onto
some other preset. The distinction is not pedantic: applying a hard tier to the
collection's smallest preset asks a question no generator can answer (a 4×4 Solo
board cannot be Hard however its params are labeled), and a guard written that
way reported ten violations across four games where there were three across one.
`validateParams` accepting a params record is not evidence that a board can carry
the tier in it.

**Exceptions SHALL be derived from a declaration the game already makes**, never
from a roster. A tier listed in `nonUniqueTiers` promises the opposite of unique
solvability and is exempt automatically; a contract declaring `nonMonotone` has
no well-defined lowest cap and is exempt for the same reason it is exempt from
the monotonicity sweep. A game that genuinely cannot generate a declared tier at
a given size SHALL refuse it from `validateParams` with a reason — the shape
already required by "either generates every declared tier, or refuses it with a
reason" — rather than being added to an exemption list.

**The guard SHALL carry a vacuity count.** It iterates presets whose tier is
readable; a contract that stopped reporting one would make every assertion pass
over nothing. The count of asserted preset cases SHALL be asserted above a floor.

**Cost SHALL be tiered rather than paid per commit.** The full matrix over every
preset of every tiered game is expensive; the per-commit slice samples seeds
through the shared budget helper and the full matrix runs in the opt-in slow
tier, with the doc comment stating what the gate slice still covers.

#### Scenario: A generator downgrades a tier

- **WHEN** a game's generator accepts a board its lower cap already solves, for a
  preset the menu labels with the higher tier
- **THEN** the cross-game guard fails, naming the game, the preset and the caps
  it found

#### Scenario: A contract's capped solve is wider than the tier it names

- **WHEN** a game's `solveAtCap` omits a bound its generator's tier-acceptance
  rule applies, so boards of a higher tier solve at a lower cap
- **THEN** the guard fails, even though the game deals correct boards and every
  test the game owns passes

#### Scenario: A tier is unreachable at a size

- **WHEN** a declared tier cannot be generated at some preset's size
- **THEN** the game refuses those params from `validateParams` with a reason,
  and the guard asserts nothing about a board that was never dealt

#### Scenario: A new game joins

- **WHEN** a game is registered that offers a difficulty choice
- **THEN** it is asserted by this guard from its first commit, with no line added
  anywhere to enroll it

### Requirement: The generator accept loop's correctness case SHALL be argued from measurement

A proposal to move a game's generate-and-strip loop into shared machinery SHALL
argue **economy**, and SHALL NOT argue that it is needed to make guess-free or
on-tier generation reliable.

Measured 2026-09-08 by `assert-that-tiers-bind`: across 285 preset cases in every
tiered game, **282 boards needed exactly the tier their preset claimed**, with
all three exceptions in one game and contradicting that game's own spec. The 39
hand-written generators comply; what was missing was a guard, not a driver.

The framework vision (`docs/framework-rdd/`, retired by
`retire-the-framework-vision`) argued the opposite — that a framework-owned
strip/accept loop would make guess-free generation *"not a policy to comply with
but the only thing the driver can do"*. That argument was fiction, and this
requirement records why it is also unnecessary: the compliance it promised
already exists, and the 39 migrations it would cost buy a property one derived
sweep now asserts.

The figure carries its date and its change id because it is a measurement, not a
claim (`AGENTS.md` § "A count written in prose is a census nobody re-runs"); a
later proposal SHALL re-run the sweep rather than quote it.

#### Scenario: A proposal argues the framework should own the accept loop

- **WHEN** a change proposes moving generate-and-strip loops into shared
  machinery
- **THEN** it argues from the per-game surface removed, and does not claim the
  move is needed for guess-free or on-tier generation
- **AND** it re-runs the on-tier sweep rather than quoting the recorded figure

#### Scenario: A generator regresses after the loop is shared

- **WHEN** a game adopts shared generation machinery
- **THEN** the on-tier guard still asserts its boards need the tier their preset
  claims, because that property is asserted of the boards and not of the loop
  that produced them

### Requirement: The hint walk SHALL cover every preset a game offers

The cross-game guarantee that following hints solves the board, from any reached
position, SHALL be asserted over **every leaf preset** of every hinting game, not
over one of them.

It was asserted over `firstLeaf(game.presets())` — by convention the smallest and
easiest board a game offers — for thirty games. The guard therefore had never
seen a Hard board, an `Unreasonable` board, or any mode variant, while reading as
the collection's strongest hint guarantee. Widened (2026-09-08) it walked **209
preset cases** and reported thirteen refusals that the narrow form could not
reach, all of them a real finding.

The sweep SHALL carry a vacuity count of preset cases walked, and its cost SHALL
be tiered rather than paid per commit — with the per-commit slice keeping at
least one preset **per axis the game actually varies**: one per declared tier for
a game that has tiers, and the first and last preset for one that does not.

Keying the slice on tier alone is not sufficient, and that is a measurement
rather than a precaution. Every preset of an untiered game carries the same tier
key, so such a game collapsed to its first preset — reinstating, for the twelve
untiered hinting games, exactly the first-leaf blindness the widening existed to
remove, on the same day it removed it. Sixteen is untiered with five presets: its
3×3 walks in seven moves and its 5×5 hint cycled for ever, and only the slow tier
could see it.

**Any cross-game sweep over presets SHALL ask the same question**, and the answer
SHALL be derived from the game rather than assumed. A second sweep keyed on tier
did worse than sample one preset of an untiered game: it skipped such games
before reaching its own vacuity count, so twelve of the thirty hinting games were
outside it while it read as covering them all. The shared preset enumeration
these sweeps derive their population from lives with the other cross-game hint
testing helpers, so a sweep does not re-answer it.

**A sweep's finding SHALL be pinned by its shape where it has one, rather than by
more sampling.** The stranding above appears on about a fifth of boards, which no
affordable number of seeds catches reliably; every instance is the same
recognizable board shape, and a test that names two such boards asserts the same
property deterministically in seconds. Seeds remain the wrong dial to turn.

#### Scenario: A hint works on Easy and gives up on Hard

- **WHEN** a game's hint cannot walk a board dealt from a preset at a
  deduction-complete tier
- **THEN** the walk fails, naming the game, the preset and the position

#### Scenario: A game gains a preset

- **WHEN** a preset is added to a game's menu
- **THEN** it is walked from that commit, with no line added anywhere to enroll
  it

#### Scenario: An untiered game's largest board is walked per commit

- **WHEN** a hinting game declares no difficulty contract, so every preset it
  offers carries the same tier key
- **THEN** the per-commit slice walks its last preset as well as its first,
  rather than collapsing the game to one board

#### Scenario: A sweep meets a game with no tiers

- **WHEN** a cross-game sweep varies a game's params by tier, and the game
  declares no difficulty contract
- **THEN** it varies that game by preset instead of skipping it, and its vacuity
  count counts what it actually looked at

### Requirement: Deduction running out on a sound board SHALL have one wording

A hinting game that finds no move on a board which is sound, unsolved and free of
mistakes SHALL refuse with the collection's single constant for that situation,
and SHALL NOT invent a phrasing, alias the constant, or spell out its value.

**There is one situation here, not two, and that is a measurement.** Two
constants existed — one bare, one naming trial and error — and the distinction
between them was asserted rather than observed. Walking every preset of every
hinting game found thirteen refusals and **every one was on a board whose tier
permits search**; nothing refused on a deduction-complete tier at any size or in
any mode. A game whose tiers are all deduction-complete cannot reach this refusal
at all, so a wording that hedges about whether trial and error is expected
describes a state no player occupies.

The wording SHALL tell the player that the position is the tier's expected end
and what to do about it. A refusal that says only that nothing follows leaves a
player unable to distinguish a puzzle demanding a guess from a broken hint, which
is the pair `help/features.md` § Hints teaches as calling for opposite responses.

**Every builder of a `hint()` SHALL import the constants, shared ones included,
and SHALL NOT retype their values.** `candidate-hint.ts` — which is the whole
`hint()` of eleven candidate games — held literal copies of **three** of the
seven refusal constants while its own doc comment described them as shared "so a
wording tweak lands in one place". It was one place, and not the same one place
as the other 21 games'; a change to either half would have left the other lying,
and no grep for a constant's *name* could see it.

**The guard that scans for stray refusals SHALL read the engine's hint builders
as well as `src/games/`.** It already keys on the right *shape* — every
`{ ok: false, error: <string literal> }` in the AST, deliberately a superset —
and still missed a third of the collection's refusals by scanning the wrong
*place*. A refusal lives wherever a `hint()` is built, and eleven of them are not
built under `games/`.

**A refusal SHALL be reachable only where the game's own tier declaration permits
search.** The permission is derived — a tier named `Unreasonable` is the
collection's promise that its boards may need search — never declared for a
guard's benefit. A hinting game with no difficulty contract SHALL NOT be able to
emit this refusal, and the guard SHALL assert that rather than skipping such a
game.

#### Scenario: A player exhausts deduction on a search-permitting board

- **WHEN** a hint is asked on a sound, unsolved board dealt at a tier whose name
  promises search
- **THEN** the refusal is the single constant, and it says what the player can do

#### Scenario: A game invents a phrasing

- **WHEN** a game returns its own sentence for deduction having run out
- **THEN** the refusal guard fails, whether the sentence is written at the game's
  call site or inside a shared module

#### Scenario: A shared hint builder inlines a refusal

- **WHEN** a module under `src/engine/` that builds a `hint()` writes a refusal
  as a string literal rather than importing the constant
- **THEN** the refusal guard sees it and fails, because its scan covers the
  engine's hint builders and not only `src/games/`

#### Scenario: A refusal escapes onto a deduction-complete tier

- **WHEN** a hint refuses on a board dealt at a tier that does not permit search
- **THEN** the walk fails — the defect is the refusal, not the wording

### Requirement: A deductive hint SHALL open with the shared refusal pair

A game whose `hint()` refuses a finished board with `ALREADY_SOLVED` and a
mistaken board with `FIX_MISTAKES_FIRST` SHALL reach both through
`commonHintRefusal` rather than writing the pair itself.

Two rules live in that opening and are invisible at each hand-written copy. The
refusals SHALL be asked **in order** — a finished board is not a wrong board, and
asking the second first reports a mistake on a board the player has completed.
And `FIX_MISTAKES_FIRST` **promises a highlight**, so it SHALL be emitted only
where the game has already established there is something to highlight, never
speculatively. In the helper both are structural; in fifteen copies each was a
chance to get one wrong silently, and nothing would have said so.

`commonHintRefusal` took **booleans rather than a state** for a reason that still
holds: `completed` lives under a different name in several games, `findMistakes`
is each game's own, and a helper taking the `Game` could not be called from
inside the very `hint` that object is being built from.

**Two escapes, and both are answers about the puzzle.** A game whose board can be
inconsistent *without any single entry being provably wrong* owes
`CONTRADICTION_UNLOCALIZED` instead of `FIX_MISTAKES_FIRST`, because the promised
highlight would never appear; it writes the explicit form and says why at the
site. A game with no mistake concept at all owes only the first refusal, and one
line is already the whole of it.

**The helper SHALL NOT grow a parameter for the second message.** A parameter
that exists so two games can pass a different constant converts a convention into
a configuration language, which is what a first-class override exists *instead*
of (`AGENTS.md` § "Convention over configuration": the override is the explicit
form plus a stated reason, not a knob).

**Enrollment SHALL be derived and the declines SHALL be a ledger.** The guard
finds the games that emit both constants by reading their source and requires
them to reach both through the helper; the games that legitimately do not are
listed *in the guard*, one entry per game with its reason, and the derivation
asserts the ledger is exactly right. A skip list nothing derives rots the way
every enrollment roster in this repo has.

#### Scenario: A game hand-writes the pair

- **WHEN** a game returns `ALREADY_SOLVED` for a finished board and
  `FIX_MISTAKES_FIRST` for a mistaken one without calling `commonHintRefusal`
- **THEN** the guard fails, naming the game

#### Scenario: A game owes a different second refusal

- **WHEN** a game's board can be inconsistent with no entry provably wrong
- **THEN** it emits `CONTRADICTION_UNLOCALIZED`, writes the reason at the site,
  and appears in the guard's ledger — which the derivation checks is exactly the
  set that did not adopt

#### Scenario: A new hinting game arrives

- **WHEN** a game gains a `hint()` that refuses on both a finished and a mistaken
  board
- **THEN** it is required to use the helper from that commit, with no line added
  anywhere to enroll it

### Requirement: Sliding-permutation games share one slide planner whose exact search always runs

The engine SHALL provide a shared toroidal slide planner
(`src/engine/slide-planner.ts`) that every sliding-permutation game's
`hint` uses, rather than each game carrying its own copy of the search.

The planner SHALL own the parts that are hard and game-independent: a heuristic
forward search over slide moves; an exact bidirectional search that returns a
**shortest** path; and a **partial-plan** result when the search improves on the
starting board without reaching the goal (the plan runs out, the player is
closer, and the next request recomputes).

The planner SHALL work on **the board as the player sees it** — one integer per
cell, whose meaning is the game's — and SHALL NOT distinguish two boards that
look alike. A game whose pieces are not all distinct (Netslide's wire masks)
otherwise has the planner chasing arrangements no sequence of slides can produce:
on an odd-width torus every slide is an even permutation, so a target that
distinguishes identical pieces may sit in an unreachable coset while the finished
picture is a move away.

The planner SHALL be parameterized on what genuinely differs between games — the
grid, the legal move set (including whether a slide may cover more than one
step), the finished board, the goal test, and **how far from finished a board
is** — and SHALL contain no game-specific narration or rendering.

**The exact search SHALL run on every board**, before the heuristic search, and a
game SHALL supply only its budget — never a condition under which it runs. A game
that cannot afford the search omits it entirely; there is no third option.

This replaces a rule that let a game hold the search back for the boards that
needed it — as a last resort where the heuristic proved helpless, or behind a
cheap test for "nearly finished". Both cycle, and the reason is structural rather
than a matter of tuning: **a shortest plan does not look like progress on the way
home**, so a gate keyed on any cheap board measure switches off partway down the
descent the search itself opened, the heuristic takes back over, and it walks the
board back where it came from. Sixteen's 5×5 hint did exactly this — a period-4
cycle in which the board reached four tiles from finished and left again, for
ever — and the same board's shortest plan peaks at 17 tiles out of place and a
total travel of 30 on its way home from 9 and 9. Three gates were measured and
all three cycled.

The cost this rule accepts is the searches on boards too far away to reach, which
spend their whole budget and come back empty. A game's budget SHALL therefore be
the smallest that still crosses its worst endgame rather than the largest it can
afford, and the planner's own state storage SHALL be allocation-free and packed,
because how much a failed search costs is what decides whether the guarantee is
affordable at all.

The planner's consumers SHALL be guarded by their own hint suites and by the
cross-game resume walk, which is the only guard that sees this class of defect: a
walk that follows a plan to its end never recomputes, and so is green on a game
whose hint ping-pongs.

#### Scenario: A second sliding game reuses the planner

- **WHEN** a sliding-permutation game other than Sixteen implements `hint`
- **THEN** it supplies its own legal moves, distance measure, goal test and
  narration, and reuses the shared search rather than re-implementing it

#### Scenario: The exact search is not held back for the boards that need it

- **WHEN** a game configures the exact search
- **THEN** it runs on every board the game hints on, with no condition available
  for the game to attach to it

#### Scenario: A search that cannot reach the goal still helps

- **WHEN** the forward search improves on the starting board but exhausts its
  budget before reaching the goal
- **THEN** the planner returns the partial plan to its best board, rather than
  failing

#### Scenario: The exact search returns a shortest plan

- **WHEN** the exact search reaches the goal
- **THEN** the plan it returns is a shortest sequence of moves to it, so that
  playing its first move leaves the board strictly nearer the goal

### Requirement: The slide planner SHALL carry a last resort bounded by depth rather than by memory

The shared slide planner SHALL offer a second exact search for the boards its
state-bounded search cannot reach, and that search SHALL be bounded by **depth**
rather than by stored states: a breadth-first **endgame database** of every board
within a given number of slides of the goal, kept between hints because it
depends only on the goal and the move set, and a depth-first walk from the board
that slides a line in place and slides it back, holding one board however deep it
goes.

**The reason it must be shaped that way is a measurement, not a preference.**
Sixteen's swapped-pair endgames sit exactly nine moves from finished while
reading as two cells out, and the state-bounded search reaches eight at that
board size. Reaching nine by storing states costs 18–24 million of them, about
ten seconds and the better part of a gigabyte, which a browser tab may not spend;
so the hint gave up on those boards — twelve of forty walked 5×4 games and five
of forty 5×5 ones — saying no move would get the player closer, on boards that
were perfectly solvable. Splitting the same nine plies into a kept four-ply
database and a five-ply walk costs tens of megabytes and a few seconds, once per
game.

A game SHALL declare only the two depths, never a condition under which the
search runs. **The deep search SHALL reach at most one ply further than the
ungated search**, and this is the property that makes it safe to gate at all: a
plan it opens is then at most one move longer than the ungated search can
finish, so playing that plan's first move leaves a board the ungated search
handles, on every board, because the ungated search has no condition on it. Two
plies further would leave a board nothing ungated can finish, the gate would shut
on it, and the recompute cycle that `fix-sixteen-hint-recompute-stability`
removed would return.

**The database's completeness SHALL be asserted directly**, not inferred from the
search's answers. A hash index that narrows its key — a Zobrist hash stored in an
`Int32Array` and compared against an unsigned copy of itself — does not fail when
it is wrong; it goes half blind, returns "no plan" on boards it holds, and reads
exactly like a search that cannot reach far enough. It survived a full round of
measurement and produced a confident wrong conclusion about which boards were
reachable. An end-to-end agreement check does **not** catch it at test-sized
depths, because losing half of a small database changes no answer.

#### Scenario: A board past the state-bounded search still gets a plan

- **WHEN** a hint is asked on a board beyond the reach of the planner's
  state-bounded search, where the heuristic search is also at a strict local
  minimum
- **THEN** the deep search returns a shortest plan within its declared depths,
  rather than the planner returning nothing

#### Scenario: The two exact searches agree

- **WHEN** the same board is planned by the state-bounded search and by the deep
  search, both within reach
- **THEN** they return plans of the same length, each reaching the goal

#### Scenario: The database is asked whether it holds a board it must hold

- **WHEN** the deep search is configured to walk no plies at all, and asked about
  a board fewer slides from the goal than its database is deep
- **THEN** it returns a plan for that board, because the database holds every
  such board and can match it

#### Scenario: Following the deep search's plan converges

- **WHEN** a plan from the deep search is followed one move at a time, with a
  fresh plan computed after each move
- **THEN** each plan is strictly shorter than the last, and the walk reaches the
  goal

### Requirement: A hint that plans by searching SHALL refuse honestly past its reach

A `hint()` that plans by **searching ahead a bounded number of moves**, rather
than by deducing, SHALL refuse with the collection's single constant for a
search out of reach, and SHALL NOT use the refusal that says no move would get
the player closer.

The two say different things, and only one of them is checkable. "No move here
would get you closer" is a claim about the **board**; a game may make it only
where it has established it, which is why its remaining callers are
constructions that cannot return empty on an unsolved board. A bounded search
returning empty has established nothing about the board, only about itself.
Sixteen said the first sentence on tangled endgames a dozen moves from home
where most moves *did* get the player closer, on positions they had reached by
following thirty-odd of that same hint's suggestions.

The wording SHALL name what still works from such a position rather than only
reporting the failure, and SHALL NOT name a control that will fail for the same
reason the hint just did — continuous hinting refuses wherever a single hint
refuses, so pointing at it is advice that cannot work.

**The collection's strongest hint guarantee — that a hint never gives up on a
solvable board — SHALL be relaxed for exactly this population and no other.** A
deductive game can meet it: its deduction is complete for the tier, or the
tier's own name promises that search may be needed. A searching game has a
*reach* instead, and past it no budget makes an honest answer available — each
further ply of Sixteen's search costs about 40×. Such a game passes the walk on
the seeds it is given and MAY go red truthfully on a new one, which is the guard
reporting the truth rather than a regression.

**The relaxation SHALL be derived from what the game is**, by reading which
games call the shared planner out of their own comment-stripped source, never
from a declaration a game makes for the guard's benefit. Where the derivation
cannot see *why* a member has a reach, that reason SHALL be recorded per member
and the derivation SHALL assert the ledger is exactly right — so an empty
derivation, which would silently restore the unattainable promise with every
assertion still passing, fails instead.

#### Scenario: A searching hint runs out of reach

- **WHEN** a game whose hint plans by searching finds no plan on a sound,
  unsolved board
- **THEN** the refusal is the collection's constant for a search out of reach,
  and the walk accepts it as an honest end

#### Scenario: A searching hint uses the board-claiming refusal instead

- **WHEN** such a game refuses with the message that no move would get the player
  closer
- **THEN** the walk fails, because that sentence asserts something the search
  never checked

#### Scenario: A deductive game borrows the search refusal

- **WHEN** a game that does not call the shared planner refuses with the
  search-out-of-reach message
- **THEN** the walk fails, because the relaxation is derived from the mechanic
  and that game does not have it

#### Scenario: The derivation finds nobody

- **WHEN** the source scan that derives the searching games matches nothing
- **THEN** the ledger equality fails, rather than every walk silently passing
  under the old promise

### Requirement: A plan steered by a measure SHALL be steered by one measure

Where a `hint()` plans by searching under a heuristic measure of the board,
exactly **one** such measure SHALL be in play on every board. A game SHALL NOT
apply a second, sharper measure only where the first is helpless.

This is the recompute-stability rule one level down. A plan is recomputed after
every move the player makes, so a *measure* that changes between recomputes
ping-pongs exactly as two plans do: the sharper measure walks the board out of a
position, the blunt one measures the result and walks it back, and neither is
wrong by its own lights. Measured on Sixteen — as a last-resort second pass the
named board ran 400 recomputed hints without solving; as the only measure it
solved in sixteen.

**Sharpening a measure SHALL be checked against every gate that reads it.** A
search gated on "the fallback found nothing better than standing still" is gated
on a statement *about the measure*, so a sharper measure silently changes which
boards reach it. Sixteen's deep search stopped firing on the very endgames it
was built for, turning a complete nine-move plan into a five-move partial one,
in a change whose whole intent was to refuse less. A sharpened measure SHALL
therefore differ from the blunt one only where the searches above it cannot help
anyway, so that every board they own is measured exactly as before.

#### Scenario: A sharper measure is armed only where the blunt one is stuck

- **WHEN** a game's hint measures a board one way normally and another way where
  the first way is helpless
- **THEN** the resume walk fails to converge, because consecutive recomputes
  steer by different measures

#### Scenario: A sharpened measure disarms a gate that read it

- **WHEN** a measure is sharpened and a search is gated on that measure finding
  no improvement
- **THEN** the gate stops opening, and the boards it owned lose the plans it gave
  them — so the sharpening is confined to boards past that search's reach

### Requirement: Hint narration SHALL NOT use an em-dash

Player-facing hint text SHALL NOT contain U+2014, in a game's own narration or
in the shared narration and refusal wording the engine writes on a game's
behalf. A comma, a semicolon, a colon, a sentence break or a parenthetical aside
SHALL be used instead.

The rule is about the punctuation only. A rewrite SHALL preserve the step's
indication → reasoning → conclusion arc and its necessity modal; **removing a
clause to remove the dash is a violation of the narration-quality bar**, not a
way of satisfying this one.

The **en-dash** (U+2013) SHALL NOT be swept up with it, because it is used as
notation rather than as punctuation: a domino written `3–5` is a name, not a
connective.

The guard SHALL find its population the way every cross-game hint guard here
does — from the games that declare a `hint()` — and SHALL additionally scan the
engine's own shipped code, because a family's narration is frequently written
once in the engine and shared across its games. A guard that scanned only the
game directories would report a clean collection while the sentence those games
display carried the character.

The engine scan SHALL exclude test files and the `engine/testing/` tree by
those structural facts rather than by a roster of filenames, so that a new
shared narration module is covered by existing, and a new test helper is
excluded, without anyone maintaining a list.

Both the source scans and the runtime narration sweep SHALL apply the rule.
They are kept as overlapping nets on purpose: the runtime sweep sees only the
narration arms that fire on the boards it walks, and a source scan sees only
what is written as a literal.

#### Scenario: A game's narration adds an em-dash

- **WHEN** a hinting game's source writes an em-dash in a narration string
- **THEN** the cross-game narration guard fails, naming the game and the line

#### Scenario: Shared engine narration adds an em-dash

- **WHEN** a shared narration or refusal string in the engine's shipped code
  writes an em-dash
- **THEN** the guard fails, naming the module and the line, even though no game
  directory changed

#### Scenario: A domino label keeps its en-dash

- **WHEN** a game writes a value such as `3–5` with an en-dash
- **THEN** the guard does not fire, because only U+2014 is retired

### Requirement: A hint SHALL show only steps the player's board does not already decide

A deductive hint SHALL NOT show a step whose every change the player's board
already decides. The shared plan loop (`deduceHintPlan`) SHALL provide the
mechanism, as an optional `showable(board, firing)` judgment the game supplies:

- a firing that is not showable SHALL still advance the plan's working board,
  since later firings may rest on it, and SHALL NOT become a step;
- the plan cap SHALL count shown steps only, so hidden firings can never turn a
  plan into a refusal;
- the loop SHALL report how many firings it hid, and SHALL tick its step budget
  for hidden firings as for shown ones.

What is evident is the game's to judge, since it depends on what that game
draws; the judgment SHALL hide only conclusions the player's board already
shows, and SHALL NOT hide a change the win condition needs. Where a game derives
it from move legality — the game would refuse the move (Galaxies) or its
contrary (Tracks) — that derivation SHALL be judged on the board before the
firing, and a game that declares which rules are evident SHALL hold the
declaration to such a derivation in a test.

#### Scenario: A redundant deduction is never a step

- **WHEN** a deduction's every change is one the player's board already decides
  — Tracks' "a finished piece's other two sides are blocked", beside squares the
  player has marked empty
- **THEN** the plan applies it to its working board and shows no step for it

#### Scenario: Hidden firings do not spend the plan cap

- **WHEN** several hidden firings precede the next showable one and the plan cap
  is one step
- **THEN** the plan holds that showable step, and reports the hidden ones as a
  count

#### Scenario: A hidden firing that changes nothing still terminates

- **WHEN** a firing is hidden but changes nothing, so the loop would ask for it
  again for ever
- **THEN** the step budget throws, exactly as it does for a shown one

### Requirement: A game's hint sentences SHALL live in one text module per game

Every game whose hint speaks SHALL keep every sentence it speaks, and every word inside
one, in `src/games/<id>/hint-text.ts`, exported as `say`; sentences several games speak
word for word SHALL live in `src/engine/hint-text.ts`. A game's narration SHALL decide
only which sentence a step speaks and with what values, passing values as the board means
them (counts, axes, directions, the deduction's own record) and never words, and a text
module SHALL NOT read the board. Refusal messages are outside this requirement: they are
held to one list by `src/engine/hint-refusal.ts` and its guard. A hint that speaks no
words has no text module.

The population SHALL be derived, not declared: a cross-game test finds the games whose
hint speaks and asserts that each has a text module and that no text module belongs to a
game whose hint does not speak.

#### Scenario: A new game's hint speaks

- **WHEN** a game gains a `hint()` whose steps carry narration and no `hint-text.ts`
- **THEN** the cross-game guard fails, naming the game

#### Scenario: Rewording a sentence

- **WHEN** a sentence's wording changes
- **THEN** the change touches the game's `hint-text.ts`, or the engine's for a sentence
  several games share, and not the code that decides which sentence fires

### Requirement: Hint narration SHALL be short enough to read at a glance

Every hint step's narration SHALL be at most 120 characters. The check SHALL
cover every hinting game at every tier and on every preset, since a mode a
preset selects can speak sentences no tier reaches, and SHALL walk each board's plans into the middle of the game rather
than reading only the opening plan, because the sentences that need room are
the ones spoken once more of the board is decided.

A sentence template MAY exceed the limit only when a ledger entry names it,
the games that speak it, and the reason it needs the room. A ledgered sentence
SHALL still be at most 300 characters. The ledger SHALL be asserted in both
directions: a step over the limit that no entry matches fails, and an entry
that matches no step over the limit fails, so a sentence brought under the
limit takes its entry with it.

#### Scenario: A long sentence without a ledger entry fails

- **WHEN** a hint step's narration is longer than 120 characters and no ledger
  entry for its game matches it
- **THEN** the check fails, naming the sentence and its length

#### Scenario: A ledger entry that no longer matches anything long fails

- **WHEN** a ledgered sentence is shortened under 120 characters, or stops
  being spoken
- **THEN** the check fails until the entry is deleted

#### Scenario: A ledgered sentence still has a ceiling

- **WHEN** a ledgered sentence grows past 300 characters
- **THEN** the check fails, ledger or not

### Requirement: The engine answers which key is a digit, once

The engine SHALL provide `digitOf(button: number): number | null` in
`src/engine/pointer.ts`: the digit `0`–`9` a button stands for, or `null` for
any other button. It SHALL look through the keyboard modifier bits, so a
numpad digit with Num Lock on (`MOD_NUM_KEYPAD | '7'`) reads as that digit —
the keypad is a convenience route to the same key, never a different one.

A game SHALL NOT spell the digit range itself — not as a comparison or
subtraction against the button (`48`, `0x39`, `button - 48`), not as a numeric
`case` in a `switch` on the button, and not as a local constant holding a digit
code that is then compared against the button. A guard SHALL find every such
site by its **codes**, under every name the collection gives the button — the
names derived from the `interpretMove` signatures rather than listed — and
SHALL prove itself on planted copies of each shape before scanning.

What a game does with the digit SHALL remain the game's: the bound it accepts
and the meaning it gives `0` (a clear, the value zero, ten, sixteen, one more
typed digit, a command) are answers about the puzzle, written beside the call.
A game that gives the **numpad's** digits another meaning (a direction pad)
SHALL resolve those before asking, as `MOD_NUM_KEYPAD | <digit>` bindings
already do.

#### Scenario: A numpad digit enters the same value as the bare key

- **WHEN** a game reads `digitOf(MOD_NUM_KEYPAD | '5')`
- **THEN** it receives `5`, exactly as for the bare `'5'`

#### Scenario: A hand-parsed digit fails the build

- **WHEN** a game source compares or offsets the button against a digit code,
  labels a `case` with one under a `switch` on the button, or declares a
  constant holding one and compares the button against it
- **THEN** the guard reports the file and line, whatever the game named the
  button

#### Scenario: The bound and the meaning of zero stay with the game

- **WHEN** two games read the same digit key
- **THEN** each applies its own bound and its own reading of `0` — Guess the
  tenth color, Bridges sixteen, Seismic a clear — with no such policy in the
  helper

### Requirement: A Hint press in flight is dropped, and a slow one says it is thinking

While a Hint press is being answered by the worker, a further press SHALL be
dropped — not queued. Nothing else in the app queues behind a hint either:
the show/apply rhythm of "The toolbar Hint button alternates show and apply"
SHALL be exactly as it would be had the dropped presses never happened, in
both beats (during a *show* nothing is armed yet; during an *apply* the step
was disarmed on the way in).

A show whose answer lands after Auto-Hint has been started SHALL NOT arm the
apply behind it: Auto-Hint owns the plan from the moment it starts.

A press unanswered after a short delay (`HINT_PENDING_MS`, 300 ms) SHALL be
visible as work in progress: the Hint control's label and the hint banner
SHALL both say "Thinking…" until the answer lands. The delay exists so an
ordinary hint never flickers. When the answer lands, the label reverts to the
beat the next press will take, and the banner shows the answer's own message
(a refusal, "Hint applied") or is cleared if the show succeeded.

A slow hint is deliberately **not cancellable**: the search runs synchronously
inside the worker, so an interrupt would need every game's search to poll a
flag, and the longest case is a few seconds once or twice a game. Making the
wait legible is the whole remedy.

#### Scenario: Presses during a slow hint are dropped, and the rhythm survives

- **WHEN** the player presses Hint three times while the first press is still
  being answered
- **THEN** exactly one request reaches the worker, and the press after it
  lands applies the step that press showed

#### Scenario: A slow hint is labeled

- **WHEN** a Hint press has gone unanswered for `HINT_PENDING_MS`
- **THEN** the Hint control reads "Thinking…" and the banner says the same,
  and both revert when the answer lands

#### Scenario: A fast hint is never labeled

- **WHEN** a Hint press is answered within `HINT_PENDING_MS`
- **THEN** neither the control nor the banner ever says "Thinking…"

#### Scenario: A late answer's own message wins

- **WHEN** a hint that was labeled "Thinking…" lands as a refusal
- **THEN** the banner shows the refusal, not an empty banner

### Requirement: The engine provides a shared centered-glyph text-options helper
The engine SHALL provide one helper returning the text options a game uses to
draw a glyph centered in a tile, and games SHALL call it rather than writing the
option object themselves.

Centering a digit in a tile is not a decision a game makes. Measured 2026-09-12,
56 copies of the same four-field object stood in 40 game files, and three games
had already pulled it into a local helper under three different names. A game
that genuinely needs different text options writes them, as the eight sites
drawing fixed-width, left- or right-aligned text already do; the helper covers
the one shape the rest share.

#### Scenario: a game draws a digit in a tile

- **WHEN** a game's renderer draws a glyph centered in a tile
- **THEN** it takes its text options from the engine helper, passing only the size
- **AND** the drawn output is identical to the literal it replaced, which the
  game's render snapshots assert

#### Scenario: a game needs different text options

- **WHEN** a game draws fixed-width or non-centered text
- **THEN** it writes the options it needs, and the helper does not grow a
  parameter to cover the case

### Requirement: A game's render test records through the shared recording drawing
A test asserting what a game draws SHALL drive the engine's shared recording
drawing rather than a double of its own, so that the record it asserts against
contains every primitive the game emitted.

A hand-rolled double records only the calls its author anticipated. A game that
begins drawing something new, or stops drawing something, leaves such a test
green, and the test reads as coverage while being a filter. Measured 2026-09-12:
18 game test files carried their own double against 37 using the shared one, and
96 of the repository's 109 `as unknown as` casts were in test files, most of them
making those doubles typecheck.

#### Scenario: a game changes what it draws

- **WHEN** a game's renderer emits a primitive it did not emit before
- **THEN** the recording contains it, whether or not the test asserts on it
- **AND** a test asserting the frame as a whole shows it as a reviewable diff

#### Scenario: a migrated test still catches its own defect

- **WHEN** a test moves from a local double to the shared recorder
- **THEN** the defect named in the test's title is planted, seen red, and restored
- **AND** a test that cannot be made red is reported as the finding it is

### Requirement: A hot constant's placement is decided by the build, not by the suite
A constant that a hot loop reads MAY be hoisted into a shared module, and a
slowdown observed under vitest SHALL NOT by itself forbid the hoist. Where such a
constant is kept module-local for speed, the comment saying so SHALL record the
measured ratio, its control, and that the cost does not reach a player.

Measured 2026-09-12 on Range's generator, three arms in one process, rotated and
interleaved, 21 reps, four runs: an imported table costs **1.62–1.73×** against
an A/A control of **0.98–1.01**. The mechanism is not in doubt — vite's
module-runner transform rewrites `DR[i]` to `__vite_ssr_import_0__.DR[i]` and
defines every export as a getter, so the loop pays an accessor call per access.

**It does not survive bundling.** `vite build` flattens the two modules into one
scope and the read compiles to a direct `var` access, byte-identical to the
module-local form. The cost is a fact about the suite; a refactor that removes
six copies of a table makes the tests slower and the game exactly as fast.

#### Scenario: a shared table is proposed for a hot loop

- **WHEN** a constant read inside a solver or generator loop is proposed for a
  shared module
- **THEN** the decision is made on what the production build emits, and the
  suite's slowdown is weighed only as suite cost
- **AND** if the constant stays local, the comment says so with its measurement
  rather than asserting a bare multiplier

#### Scenario: an arm is timed against another

- **WHEN** two implementations are compared by timing
- **THEN** every arm is exercised once before the clock starts, the arms are
  interleaved with rotating order, and the minimum is reported beside the median
- **AND** an A/A control arm is timed alongside them, so a ratio that is really
  an artifact of module load order or of warm-up has somewhere to show up

#### Scenario: a control looks suspiciously tight

- **WHEN** a paired-timing control is suspected of flattering itself
- **THEN** the suspicion is checked by warming the arms rather than by loading
  a second module instance
- **AND** measured here, one instance timed twice (0.98–1.02) and two separately
  loaded instances (0.98–1.01) are indistinguishable once every arm is warmed

### Requirement: The engine owns the pencil-mode indicator, not only its glyph
The engine SHALL provide the whole pencil-mode indicator — the background box,
the glyph, and the invalidation of that box — so that a game supplies only what
is its own: where the indicator sits and which palette indices it uses. A game
SHALL NOT write the paint-and-invalidate sequence itself.

The engine SHALL also own the repaint decision, taking the game's own
first-frame flag as an input, so that the indicator's cache is written once
rather than once per game.

#### Scenario: a game places the indicator and says nothing else about it

- **GIVEN** a game that offers a pencil mode and has chosen a box for its
  indicator
- **WHEN** it renders a frame
- **THEN** it names the box, the mode and its own three palette indices, and the
  engine paints, skips or erases accordingly
- **AND** the box is invalidated whenever it is painted, without the game
  arranging that

#### Scenario: the mode changes on a draw state that has already painted

- **GIVEN** a draw state that has painted at least one frame with the mode off
- **WHEN** the player turns pencil mode on and the game redraws
- **THEN** the glyph appears
- **AND** turning it off again erases the glyph on the following frame

### Requirement: A repaint cue belongs in the tile cache before a sidecar
Where a cue can be expressed as a bit in a game's existing per-tile cache key,
the game SHOULD express it that way rather than adding a second cache keyed on
its own scalar. A second cache is a second key, and a key that stops naming one
of its inputs fails silently — the cue simply never repaints.

A game SHALL add a sidecar cache only where the cue has no tile to live in, and
SHALL then name every input the painter reads in that cache's key.

#### Scenario: a cue that has a tile available

- **GIVEN** a cue whose position coincides with a tile the game already caches
- **WHEN** the game renders it
- **THEN** it packs the cue into that tile's key rather than comparing a scalar
  on the draw state
