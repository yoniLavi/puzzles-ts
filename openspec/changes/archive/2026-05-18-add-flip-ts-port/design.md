## Context

The keystone landed the engine but left the registry empty and three
contract points "to be shaped by the first real port" (archived
`ts-midend-and-game-interface/design.md` Open Questions; codified by
the `GameDrawing` doc comment "the keystone does not constrain the
optimisation contract … shaped by the first real port", and
`Midend.size`'s "minus the user-size persistence the first port will
refine"). This is that port. Per `ts-migration`, a game is "done" when
it plays correctly under behavioural tests and a dev-time differential
spot-check looks right — **not** byte-identical to a corpus.

Flip (`puzzles/flip.c`, 1355 lines) is fully self-contained: the only
engine-library dependency is `tree234`, and only the `RANDOM`
matrix-type generator uses it. `random.ts` (already ported,
bit-identical) supplies `random_upto`.

## Goals / Non-Goals

- **Goals**: Flip plays correctly end-to-end through the TS midend
  (mouse + keyboard, undo/redo, solve, save/load, animation, flash,
  statusbar); `CROSSES` and `RANDOM` both supported; deterministic
  solver; resolve the three deferred contract points; remove the
  dispatch-seam cast; advisory C-vs-TS differential check; `flip.c`
  deleted.
- **Non-Goals**: Custom-params / preferences config UI (still the
  documented empty-but-valid shape in `TsWorkerPuzzle` — Flip's only
  config is w/h/type, reachable via presets and game IDs; the full
  `config_item` machinery is a later cross-cutting change, not this
  one). Byte-identical reproduction of C's RANDOM matrices. Removing
  the Web Worker (re-evaluated after a few ports, per doctrine).

## Decisions

### D1 — Idiomatic Flip types (no C-array mirroring)

- `FlipParams = { w: number; h: number; matrixType: "crosses" | "random" }`.
  `encodeParams` → `"WxH"` (+ `"c"`/`"r"` when `full`); `decodeParams`
  mirrors C's `decode_params` leniency (`atoi`-style prefix, optional
  `x`, optional trailing `c`/`r`).
- `FlipState` is immutable: `{ w, h, matrix, grid, moves, completed,
  cheated, hintsActive }`. `matrix` is a frozen `Uint8Array` (wh×wh,
  GF(2)) **shared by reference** across all states of one game (C
  reference-counts it; TS just shares it, GC frees it). `grid` is a
  `Uint8Array(wh)`, bit 0 = lit/"wrong", bit 1 = solver-hint marker;
  `executeMove` copies `grid` and returns a new state, never mutates.
- `FlipMove` is a discriminated union, JSON-safe so the default
  save serialiser suffices (no `serialiseMove`):
  `{ kind: "flip"; x: number; y: number }` |
  `{ kind: "solve"; mask: number[] }` (the solver's per-cell hint
  bits; mirrors C's `S` move).
- `FlipUi = { cx: number; cy: number; cursorVisible: boolean }`.
- `FlipDrawState = { w, h; started: boolean; tiles: Int16Array }`
  (per-tile cache; `-1` = never drawn, `255` = "animating" sentinel,
  exactly as C's `ds->tiles`).

### D2 — `tree234` → a local idiomatic `SortedMultiset`

The `RANDOM` generator is the irreducibly-hard part (every migration
plan pays for it; `ts-migration` says port leaf libs "lazily and
idiomatically … as ordinary TS dependencies", *not* as bridged seams
with corpora). C uses three `tree234`s as ordered multisets with three
comparators plus positional ops: `add234` (dedup when cmp==0),
`del234` (by value), `delpos234`/`index234` (by position),
`findrelpos234(…, REL234_LT, &pos)` and `findrel234(…, REL234_GT)`.

Decision: a single generic `SortedMultiset<T>` backed by a
**sorted array** with binary search by the supplied comparator,
exposing exactly the operations Flip needs (`add`, `delete`, `count`,
`get(pos)`, `removeAt(pos)`, `lastIndexLessThan(probe)`,
`firstGreaterThan(probe)`). Flip grids are tiny (presets ≤ 5×5 = 25
cells; the puzzle is "really hard at large sizes" so practical use is
small), so O(n) array splice is irrelevant and a 2-3-4 tree would be
gratuitous. It lives in `src/native/games/flip/sorted-multiset.ts`
with its own property tests; it is promoted to a shared
`src/native/lib/` only when a second game needs it (YAGNI; doctrine's
"lazily … on demand"). The generator follows C's algorithm
structurally (the pick/cov/osize multisets, coverage/omino-size
bookkeeping, the random pick over the equal-key run, the
duplicate-row rejection retry) so the differential check stays
meaningful — divergence is then a real bug, not an expected rewrite.

### D3 — Resolve the three deferred `Game` contract points

1. **Drawing API.** Widen `GameDrawing` from the keystone's 4-method
   placeholder to the full puzzle drawing surface
   (`drawRect`, `drawLine`, `drawPolygon`, `drawCircle`, `drawText`,
   `clip`, `unclip`, `startDraw`, `endDraw`, `drawUpdate`, and the
   blitter quartet `blitterNew/Free/Save/Load`). The existing canvas
   `Drawing` (`src/puzzle/drawing.ts`) already implements all of these,
   so it satisfies `GameDrawing` structurally with no change to
   `Drawing`. Flip uses rect/line/polygon/clip/unclip/drawUpdate (no
   blitter), but the full surface is specified now so later ports
   don't each re-litigate it. Coordinates/colour-index semantics match
   the existing C drawing API contract (the same `Drawing` honours
   them today). The redraw *optimisation* contract (per-tile diff via
   `DrawState.tiles`, `started`-gated grid lines) is the game's own
   business, exactly as in C — the engine does not impose full vs
   incremental.
2. **UI-only updates.** `interpretMove` returns
   `FlipMove | null | "ui"`. `"ui"` means "UI/cursor state changed in
   place; no history move; please redraw" (C's `MOVE_UI_UPDATE`).
   `Game.interpretMove`'s return type becomes
   `Move | null | typeof UI_UPDATE`. `Midend.processInput` returns
   `true` for both a real move and `"ui"`, but for `"ui"` it emits a
   redraw/state notification without pushing history. `null` stays
   "nothing happened" (C's `MOVE_NO_EFFECT`/`MOVE_UNUSED` collapse to
   `null`; the visible behaviour — no move, no redraw — is identical).
3. **Default background → `colours`.** `Game.colours` becomes
   `colours(defaultBackground: Colour): Colour[]`.
   `EngineCore.getColourPalette` becomes
   `getColourPalette(defaultBackground: Colour)`, threaded from
   `TsWorkerPuzzle.getColourPalette(defaultBackground)` (already
   receives it, currently ignored) into `Midend` into `game.colours`.
   Flip computes `COL_WRONG = bg/3`, `COL_GRID = bg/1.5`, etc. exactly
   as C's `game_colours` does from `frontend_default_colour`.

These are the keystone's explicitly-allowed interface refinement, not
a spec breach: the keystone shipped them minimal *because* the first
port was designated to shape them.

### D4 — `PuzzleEngineSurface` shared interface (remove the cast)

Define `PuzzleEngineSurface` in `src/puzzle/` enumerating exactly the
Comlink-exposed methods the main thread calls on the proxied puzzle
(the surface `RemoteWorkerPuzzle` is built from). `WorkerPuzzle
implements PuzzleEngineSurface` and `TsWorkerPuzzle implements
PuzzleEngineSurface`. The factory returns `PuzzleEngineSurface`;
`RemoteWorkerPuzzle = Remote<PuzzleEngineSurface>`. The
`as unknown as WorkerPuzzle` cast at `worker.ts:472` is deleted —
structural conformance is now compiler-checked on both sides, which is
strictly safer (a drift in either class is a type error, not a
run-time surprise). No app-side type changes: `RemoteWorkerPuzzle`
keeps the same shape it had (it was already the WorkerPuzzle surface).

### D5 — Dev-time differential spot-check (advisory)

Add `puzzles/auxiliary/flip-trace.c` (a `scripts/build-native.sh`
target) that, given `w h type seed`, prints Flip's game description
(the C `new_game_desc` output) — reusing the existing native harness
build that already backs `random-trace`. A TS script
(`scripts/diff-flip.ts`, run on demand, no npm wrapper, mirroring the
`build-native.sh` "run on demand" convention) generates the same for
the TS port and reports matches/diffs for N seeds. Per `ts-migration`
this is **review signal, not a pass/fail gate**: `CROSSES` should
match exactly (deterministic, no `tree234`); `RANDOM` is expected to
diverge (different but valid matrices) and is reported, not failed.
The CI/pre-commit gate is unchanged.

## Risks / Trade-offs

- **RANDOM generator fidelity.** A faithful structural port of the
  `tree234` algorithm is the main effort. Mitigation: property tests
  assert the real invariants (generated matrix has no two identical
  rows; the GF(2) solver finds a solution for every generated board;
  start grid is non-trivial), which is what *correctness* actually
  requires — exact-match to C is explicitly not the bar.
- **Widening `GameDrawing` now.** Locks the drawing surface before
  many games are seen. Mitigation: it is exactly the long-stable C
  `drawing_api` that the existing `Drawing` already implements; a
  later game needing more extends the interface (same allowance this
  change uses).
- **Shared-surface drift.** If `WorkerPuzzle` and `TsWorkerPuzzle`
  diverge later, `PuzzleEngineSurface` turns it into a compile error —
  this is a risk *reduction* vs the prior cast.
- **`flip.c` deletion.** Removes the C reference for Flip. Accepted:
  `ts-migration` mandates per-game deletion when a port ships; history
  + the differential harness’s recorded behaviour remain; pure-C
  bisive fallback for *other* games is unaffected.

## Migration Plan

1. Land engine contract refinements (D3/D4) with the fake game still
   green (interface widening is additive / well-typed).
2. Implement the Flip port + `SortedMultiset` + tests.
3. `registerGame(flipGame)`; manual play-through (mouse, keyboard
   cursor, undo/redo, solve, save/reload, both matrix types) in
   `npm run dev`.
4. Differential harness; spot-check `CROSSES` exact, eyeball `RANDOM`.
5. Delete `puzzles/flip.c`; update docs/specs; full pre-commit gate
   (incl. `vite build`); archive.

Rollback: unregister Flip (delete the `registerGame` call / module
import) — the empty-registry path restores all-WASM; `flip.c` is
recoverable from git history if a true revert is needed.

## Open Questions

- Whether `SortedMultiset` graduates to `src/native/lib/` — deferred
  until a second consumer exists (YAGNI).
- Whether Flip's keyboard-cursor visibility should default on in this
  PWA (C reads `PUZZLES_SHOW_CURSOR`). Defaulting **off** (C default);
  revisit as a cross-game input/a11y concern, not here.
