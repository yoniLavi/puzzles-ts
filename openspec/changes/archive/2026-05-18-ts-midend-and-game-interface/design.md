## Context

This is the keystone of the top-down migration. Every later change
depends on the two artefacts decided here: the `Game` interface a port
implements, and the `Midend` that orchestrates it. The `ts-migration`
spec mandates this change exists, forbids any port before it, and
explicitly defers two decisions to it (the per-game switch shape; the
`src/` location). It deserves a design doc to record *why* the
interface and selection mechanism take the shape they do — a future
port author reads this to know the contract, and a future session must
not casually re-litigate the switch.

The hard constraint: the app shell (`src/screens/`, `src/dialogs/`,
`src/puzzle/puzzle.ts`, the `Drawing` canvas layer) already consumes a
stable Comlink `WorkerPuzzle` surface (mapped in the investigation:
`newGame`/`newGameFromId`/`processKey`/`processMouse`/`redraw`/
`undo`/`redo`/`solve`/`getPresets`/`saveGame`/`loadGame`/`timer`/…
plus the `ChangeNotification` callback shapes). The TS engine must
*reproduce that surface*, not invent a new one. The seam is therefore
a single dispatch point in the worker factory; everything above it is
unchanged.

## Goals / Non-Goals

- **Goals**: a clean idiomatic `Game` interface (the contract for all
  ~40 future ports); a `Midend` reproducing the C midend's
  orchestration (move/undo/redo, timer, presets, status, anim/flash,
  serialise) behind the existing Comlink surface; a per-game runtime
  selection mechanism; a clean TS save format; midend behavioural
  tests with a fake game.
- **Non-Goals**: porting a real game; the differential harness;
  drawing-layer changes; worker-existence re-evaluation; C deletion;
  byte-compatibility with C saves or pre-pivot shared IDs.

## The `Game` interface (idiomatic rendering of `struct game`)

Upstream's `struct game` (puzzles.h:689) is ~50 C function pointers
passing opaque handles with manual `dup_*`/`free_*`. The idiomatic TS
rendering (per AGENTS.md "TS port style"): a generic interface with
**immutable** state, GC instead of `free`, `boolean`/union types
instead of `0|1`/sentinels, plain return values instead of out-params.

```ts
interface Game<Params, State, Move, Ui, DrawState> {
  readonly id: string;                 // catalog puzzleId
  readonly defaultParams: () => Params;
  readonly presets: () => PresetMenu<Params>;
  encodeParams(p: Params, full: boolean): string;
  decodeParams(s: string): Params;
  validateParams(p: Params, full: boolean): string | null; // null = ok
  // settings/prefs config <-> Params (drives the existing config UI)
  configure(p: Params): ConfigDescription;
  customParams(c: ConfigValues): Params;

  newDesc(p: Params, rng: RandomState): { desc: string; aux?: string };
  validateDesc(p: Params, desc: string): string | null;
  newState(p: Params, desc: string): State;          // pure
  newUi(state: State): Ui;

  // input → optional move; move → new state (both pure, immutable)
  interpretMove(s: State, ui: Ui, ds: DrawState,
                p: Point, button: Button): Move | null;
  executeMove(s: State, m: Move): State;             // returns NEW state

  status(s: State): GameStatus;                       // union, not int sign
  canSolve: boolean;
  solve?(orig: State, curr: State, aux?: string): Move | string; // or err
  canFormatAsText: boolean;
  textFormat?(s: State): string;

  // drawing — reuses the existing Drawing/DrawingImpl from src/puzzle
  colours(): Colour[];
  newDrawState(s: State): DrawState;
  computeSize(p: Params, tileSize: number): Size;
  redraw(dr: Drawing, ds: DrawState, prev: State | null, s: State,
         dir: number, ui: Ui, animTime: number, flashTime: number): void;
  animLength?(a: State, b: State, dir: number, ui: Ui): number;
  flashLength?(a: State, b: State, dir: number, ui: Ui): number;

  readonly isTimed: boolean;
  timingState?(s: State, ui: Ui): boolean;
  readonly wantsStatusbar: boolean;
}
```

State is immutable: `executeMove` returns a new `State`, so the
midend's undo/redo stack is just `State[]` — no `dup_game`/`free_game`,
no drawstate diffing ceremony for correctness (only for redraw
optimisation, which a port may ignore initially). `Move` is a typed
value, not the C `char*` move string (the *save format* serialises it;
the in-memory contract is typed).

## The `Midend`

A class owning, per live game: the `Game`, current `Params`, the
`State[]` history + cursor, the `Ui`, `DrawState`, a `RandomState`
(the existing `random.ts`), timer bookkeeping, and the
`ChangeNotification` emitter. It implements exactly the methods the
worker's `WorkerPuzzle` needs (`newGame` → `newDesc`+`newState`,
`processKey`/`processMouse` → `interpretMove`+`executeMove`+push
history, `undo`/`redo` → move cursor, `redraw` → `Game.redraw` into the
existing `Drawing`, `getPresets`, `solve`, serialise). It emits the
same `game-id-change` / `game-state-change` / `params-change` /
`status-bar-change` notifications the app already listens for, so
`src/puzzle/puzzle.ts` signals light up unchanged.

## Decisions

### Decision: per-game switch = runtime registry, not a build flag

A `Map<puzzleId, Game>` populated by each game-port module. The worker
factory checks it before the WASM path.

- *Alternative — `USE_TS_<GAME>` CMake/Vite flag* (mirroring
  `USE_TS_<MODULE>`). Rejected: those flags exist to flip C-internal
  leaf bridges *inside one WASM build*; "which engine serves a game"
  is a different axis. A build flag forces a rebuild to switch, can
  desync across the CMake/Vite halves (the coherence check exists
  precisely because that's painful), and a ported game has no C to
  bridge into anyway.
- *Alternative — catalog-level static field* (`engine` in
  `catalog.json`). Rejected: `catalog.json` is generated from the C
  build; a TS game may have no C at all once its C is deleted. The
  source of truth for "is there a TS impl" is *the TS code that
  exports the impl*, so the registry is that code.
- *Alternative — build-time tree-shake* (conditional import). Rejected
  as premature; a runtime map is simpler, supports the per-game-hybrid
  scenario directly, and tree-shaking can be layered later if bundle
  size demands without changing the contract.
- The registry also makes per-game C deletion clean: when a port
  ships and its `<game>.c` is deleted, that game simply stops having a
  WASM target; the registry entry is then the only path, with no flag
  to flip.

### Decision: TS midend runs in the existing worker

The seam is one branch in the Comlink factory (`src/puzzle/worker.ts`):
registry hit → construct a `Midend`-backed object implementing the
`WorkerPuzzle` surface; miss → today's WASM `Frontend`. Keeping it in
the worker means zero app-shell change and honours the `ts-migration`
instruction to defer the worker-existence question until after the
first ports. Moving TS games to the main thread is a *later*,
separately-justified change if the ports prove the worker is dead
weight for light TS games.

### Decision: clean TS save format (versioned JSON envelope)

`{ v: 1, puzzleId, params, gameId, moves: SerialisedMove[],
timerElapsed, checkpoints }`. `Game` gains the minimal codec it needs
(serialise/parse a `Move` and a `Params`); the midend replays `moves`
from the initial `desc` to reconstruct history (mirrors how C
serialise stores the move list, but JSON and typed). Not
C-compatible — `ts-migration` makes old C saves and pre-pivot shared
IDs expendable. `random.ts` (bit-identical, retained) keeps *future*
game IDs reproducible across builds. The Dexie `SavedGameRecord.data`
is already `Uint8Array | Blob`; the JSON envelope is UTF-8 encoded into
it — no schema migration.

### Decision: behavioural tests, no corpus

A ~30-line in-repo fake `Game` (a trivial counter/toggle game) drives
midend tests: undo/redo invariants, history truncation on a new move
after undo, serialise→parse round-trip reproduces state, timer
accumulation, preset-tree parse, status transitions, notification
emission. This is the `ts-migration` "accepted without a golden
corpus" discipline applied to the midend itself. Property tests where
there's a closed-form invariant (e.g. `undo∘executeMove == identity`
on state).

## Risks / Trade-offs

- *New architecture, no real game to prove it* → Mitigation: ships
  with an empty registry (runtime identical to today); the fake-game
  behavioural suite exercises every midend path; the first port (next
  change) is explicitly the validation and may feed interface
  adjustments back via a follow-up.
- *Interface churn once a real game lands* → Accepted: the first port
  is *expected* to refine the interface; the spec wording is
  behavioural ("the midend SHALL own undo/redo…"), not a frozen
  signature, so refinement isn't a spec breach. The signature above is
  design guidance, not a spec clause.
- *Save format lock-in* → Mitigated by the `v` version field; the
  format is owned solely by the midend and has no external consumers
  yet.

## Migration Plan

Additive only. New `src/native/engine/`; one dispatch branch in the
worker. Rollback = revert the change; the empty registry means the
WASM path is untouched and nothing else references the engine. No data
migration (no save uses the new format until a TS game is registered).

## Open Questions

- Exact `DrawState`/redraw-optimisation contract (full-redraw-only vs
  incremental) — deferred to the first port, which has a real redraw to
  shape it. The interface permits a no-op `newDrawState` + full redraw
  initially.
- Whether `solve`/`textFormat` stay optional or become required per
  `canSolve`/`canFormatAsText` — left as capability booleans + optional
  methods until a port needs the stricter shape.
