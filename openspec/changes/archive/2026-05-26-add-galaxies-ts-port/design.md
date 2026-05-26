# Design: add-galaxies-ts-port

## Context

Migration-order item 3 (`AGENTS.md` "Migration order"). The pattern is
already set by `add-flip-ts-port` and the post-Flip doctrine fixes:

- Engine emits no pixels of its own; each game's `redraw` owns its
  background fill in the `!ds.started` branch
  (`fix-flip-canvas-reshape`).
- `Midend.size` is side-effect-free; the only cache-stale signal is
  the adapter's `canvasCleared()` (same).
- Green automated suite is necessary but not sufficient for parity —
  rendering / animation / input must be owner-verified before
  registration, and a shortfall is never deferred as "cosmetic"
  (`add-parity-gated-registration`).
- Scene-graph reconciler was tried and withdrawn 2026-05-21
  (postmortem `openspec/postmortems/2026-05-21-scene-graph-
  withdrawal.md`); ports stay on the imperative `Game.redraw` path
  with the doctrine above carrying cache fragility on its own.

Galaxies is larger than Flip (~4500 lines C vs ~1000) and exercises
parts of the contract Flip did not. The decisions below are the
non-obvious ones.

## D1. Where DSF lives: local first

`dsf` is a general data structure that several games depend on
(Loopy, Slant, Tents, Magnets, etc.). The temptation is to put the
port at `src/native/engine/dsf.ts` immediately.

**Decision**: put it local at `src/native/games/galaxies/dsf.ts`,
matching how Flip handled `SortedMultiset` (its `tree234` equivalent).
Promote to `src/native/engine/` only when the second game ports and
needs it.

**Why**: the `ts-migration` spec is explicit ("Leaf libraries ... ported
lazily and idiomatically as ordinary TS dependencies *when a game
being ported needs them* — NOT as standalone bridged seams"). One
caller is not enough to warrant a shared module. Promotion is a
trivial future move + import-path update, not a design rewrite. The
cost of premature sharing is a phantom API shape decided with one
data point.

**API surface needed by Galaxies**: `dsf_new(n)`, `dsf_reinit()`,
`dsf_canonify(i)`, `dsf_merge(a, b)`. (Galaxies does not use
`dsf_canonify_with_size` or `dsf_minimal`, so we don't port those.
Add them when a future game wants them.) Idiomatic TS shape: a `Dsf`
class with `canonify(i)`, `merge(a, b)`, `reinit()` methods, plus a
constructor `new Dsf(n)` replacing `dsf_new`. Path compression +
union-by-size.

## D2. Grid representation: flat typed arrays + frozen wrapper

The C uses `space *grid` — a flat `(2w+1)×(2h+1)` array of `space`
structs, each carrying `x, y, type, flags, dotx, doty, nassoc`.
Galaxies' state is referenced *very* heavily by the solver (every
inference rule walks every tile/edge). The naive idiomatic
port — an array of `Space` objects — creates large per-`executeMove`
GC pressure for immutable updates.

**Decision**: store the grid as parallel typed arrays inside an
otherwise immutable `GalaxiesState`:

```ts
class GalaxiesState {
  readonly w: number;
  readonly h: number;
  readonly sx: number; // 2w+1
  readonly sy: number; // 2h+1
  readonly flags: Uint16Array;     // per-space flags (F_DOT, F_EDGE_SET, ...)
  readonly dotx: Int16Array;       // per-space (if F_TILE_ASSOC)
  readonly doty: Int16Array;
  readonly nassoc: Int16Array;     // per-space (if F_DOT)
  readonly dots: ReadonlyArray<{x: number; y: number}>; // cached
  readonly completed: boolean;
  readonly usedSolve: boolean;
}
```

Immutability is *external*: `executeMove` copies the typed arrays,
mutates the copies in place, and returns a frozen new state. The
solver internally allocates a *mutable working buffer* per call
(it does not need to clone-per-step). Static methods on the state
helpers expose `getFlags(s, x, y)` etc. for readability.

**Why**:
- 31×31 = 961 cells max; each typed-array clone is ~2KB; copies are
  fast and predictable. Object-per-cell with N moves would allocate
  ~30k objects per game on average.
- The solver is the dominant cost path; keeping its working state in
  typed arrays keeps it tight without sacrificing the public
  immutability the `Game` contract wants.
- This matches the established posture for the engine (pure
  `executeMove`, GC not dup/free) while avoiding the
  object-graph-per-cell cost trap.

`type` (s_tile / s_edge / s_vertex) is derivable from `(x, y)`
parity, so we do not store it. `x, y` per-cell in the C struct is
self-referential; we derive it from the index, same elision.

## D3. Subcell coordinate model is the same as C

We keep the C's `(2w+1)×(2h+1)` subcell model. Trying to "modernise"
it (e.g. separate tile/edge/vertex maps) was tempting but rejected:
the solver's geometry — opposite-tile-through-dot, edges-into-vertex,
adjacencies — all rely on the unified addressing where every kind of
cell is at integer coordinates and you walk by ±1. Splitting the
model would mean reimplementing every helper that crosses the type
boundary, which is most of them. The data layout (D2) modernises the
storage; the addressing stays.

`INGRID` / `INUI` / `IS_VERTICAL_EDGE` become small helper functions
on `GalaxiesState`.

## D4. Drag-and-hold interaction model

Upstream's interaction: pointer-press a dot to "hold" it (`M`),
then pointer-drag through nearby tiles emits `A x,y,ax,ay` move
fragments to associate those tiles with the held dot, then
pointer-release clears the hold (`M` toggle).

The `Game` contract's `interpretMove(s, ui, ds, p, button)` accepts
button events one at a time and returns at most one move per call.
The `Move` type is per-game, so we are free to model a Galaxies move
as a structured discriminated union — and to *concatenate* multiple
fragments into one move-string for save serialisation, the way
upstream does.

**Decision**: model the move shape as a discriminated union with
fragments, e.g.

```ts
type GalaxiesMove =
  | { kind: "edge"; x: number; y: number }                     // 'E'
  | { kind: "unassoc"; x: number; y: number }                  // 'U'
  | { kind: "hold"; x: number; y: number }                     // 'M'
  | { kind: "assoc"; x: number; y: number; ax: number; ay: number } // 'A'
  | { kind: "solve"; ops: SolveOp[] };                         // 's…'
```

`interpretMove` emits at most one fragment per button event. The
midend records them as individual history entries, which is
acceptable behaviour (slightly more granular than C's "concatenate
during drag" but functionally equivalent, and undo-friendly). If
this turns out to feel wrong in play, we can introduce a "coalesce
last move if of kind X" path on the `Ui`, but ship without it first.

`UI`-only changes (keyboard-cursor movement, hover) return
`UI_UPDATE` per the contract — same as Flip.

**Why**: this is the simplest shape consistent with the contract and
upstream's semantics. It keeps the save format JSON-safe (default
`serializeMove`), which is the `ts-migration` spec's clean-save
posture (no obligation to load C-format saves).

## D5. `midend *me` in C state is not ported

The C `game_state` carries a `midend *me` so `execute_move` can call
`midend_supersede_game_desc` when the player moves a dot mid-game in
a way that effectively changes the puzzle description. That path is
load-bearing for upstream's shared-ID stability after a dot move.

**Decision**: do not port the back-reference. Galaxies' TS port
emits a normal move; the midend's existing notification path tells
the app to refresh its title bar / share-link if the description
changed. If we later find a real product need for the supersede
machinery, add it as a `Game`-interface hook on its own change.

**Why**: keeping `me` would mean a circular reference between state
and midend, which fights the immutable-state model. Upstream's
supersede is a frontend nicety, not a correctness requirement; the
TS midend can recompute the share link from `currentDesc()` whenever
notifications fire. No behavioural regression.

## D6. Difficulty grading and the generator retry loop

C's generator (`new_game_desc`) places dots, then runs the solver at
the requested difficulty and:
- if `solver_state` reports a difficulty *higher* than requested, the
  puzzle would also be solvable at lower difficulty too — retry.
- if it reports the requested difficulty, keep it.
- if it reports lower than requested (puzzle is too easy), retry.
- if `DIFF_AMBIGUOUS` or `DIFF_IMPOSSIBLE`, retry.

**Decision**: port this loop literally. It is what makes "Normal vs
Unreasonable" mean what users expect, and there is no shortcut.
Performance is acceptable up to 15×15; if it turns out to be slow,
profile *after* parity is reached. Idiomatic TS, but the algorithm
is the algorithm.

## D7. Per-game tightening of the differential check

`ts-migration` spec, fourth requirement, allows per-game tightening
of the differential check when a generator has hard uniqueness or
difficulty-grading constraints. Galaxies has both.

**Decision**: tighten *the bar*, not *the comparison*. The gated
differential check (`galaxies-differential.test.ts`) asserts that
every C-built reference board (frozen snapshot) is
- decoded by the TS port,
- run through the TS solver at the C-recorded target difficulty,
- and produces **a unique solution at exactly that difficulty**
  (no `DIFF_AMBIGUOUS`, no diagnosis at a different difficulty).

Boards generated by the TS port are *not* expected to match C
byte-for-byte — the generator is allowed to be idiomatic and the
random walk diverges. The advisory live check
(`scripts/diff-galaxies.test.ts`) surfaces same-seed C-vs-TS diffs
for human review, with the additional assertion that every sampled
TS board is uniquely solvable at the requested difficulty.

This is the analogue of Flip's "CROSSES matches exactly, RANDOM
diverges but is solvable" split, adjusted for Galaxies' shape.

## D8. Rendering: imperative path with engine-emits-no-pixels

The `fix-flip-canvas-reshape` doctrine carries:
- Engine emits no pixels of its own.
- `Midend.size` is informational, side-effect-free.
- `canvasCleared()` is the only cache-stale signal.

Galaxies' `redraw` owns its background fill in the `!ds.started`
branch, follows the per-tile diff-cache pattern Flip uses, draws
the dot-move animation interpolating along the `movedot_cb`-computed
path, draws the win flash, and never touches the canvas outside its
declared rect. The keyboard cursor is part of the cache-key for the
affected tiles so a cursor move repaints only what it touches.

No scene-graph; no declarative reconciler; just `Game.redraw`. If
the cell↔dot aid (post-port follow-up) creates real cross-game
rendering pressure, that is the moment to revisit — not now.

## D9. Owner-acceptance gate before registration

Per `add-parity-gated-registration` and the explicit memory note
("Parity-gated; no premature 'done'"): registration of
`galaxies` + deletion of `puzzles/galaxies.c` are the **last** tasks.
They wait on owner acceptance of:
- a dev-server run-through covering generation across all 6 presets,
  drag-to-associate, undo/redo, edge toggle, keyboard cursor, solve,
  win flash, and dot-move animation,
- save/load round-trip,
- comparison against the C build for any subjective drift (e.g.
  animation feel) — using the `USE_TS_LEAVES=0` escape hatch to flip
  to pure C on demand for side-by-side feel checks.

Until that acceptance, the registry is left empty for `galaxies` and
the C build remains the runtime. The implementer does not declare
done; the owner does.

## Open questions (deferred to implementation, not blockers)

- **Solver structure**: split into `solver.ts` with per-rule
  functions, or keep flat in `index.ts`? Decision deferred to
  implementation — pick whichever reads better once written.
- **Animation timing**: upstream uses `ANIM_PER_DOT_MOVE` constants
  scaled by path length. Same constants in TS; only revisit if owner
  acceptance says the feel is off.
- **Diff-cache shape**: per-tile or per-rectangle. Start per-tile
  (same as Flip).
