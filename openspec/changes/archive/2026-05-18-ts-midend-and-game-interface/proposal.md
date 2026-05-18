# Change: TS midend + clean `Game` interface (the keystone)

## Why

The `ts-migration` doctrine (landed 2026-05-18) is top-down: build the
TS midend and a clean `Game` interface *first*, then port games by
user-facing priority. Its own spec hardcodes this change as the next
step ("the first implementation change is the TS midend + `Game`
interface (`ts-midend-and-game-interface`)") and forbids any per-game
port before this interface exists.

Nothing the project actually wants — a hot-reloading enhanceable game,
quick-save, mistake-checking, explained hints, per-game aids — is
reachable without this layer. It is the keystone: every later change
(every game port, every cross-game feature) implements against the
`Game` interface and runs on this midend. Two open questions the
doctrine explicitly deferred to *this* change are decided here:

1. **The per-game switch shape** (a `USE_TS_<GAME>` build flag vs a
   catalog-level toggle vs build-time tree-shake).
2. **Where the TS midend + `Game` interface + per-game ports live** in
   `src/` (the `repo-layout` spec defers the `src/` location to this
   change, and its current `src/native/<module>` text still mandates
   the now-retired `__fixtures__/` characterization-corpus layout).

## What Changes

Adds the native-TS engine layer behind the existing Comlink
`WorkerPuzzle` boundary, so a TS game is selected and driven through
the *same* surface the app already consumes for C/WASM games. No app
shell, screen, dialog, or drawing-canvas code changes.

- **New `ts-engine` capability spec.** Codifies: the idiomatic `Game`
  interface (an immutable-state, generic-over-`Params/State/Move/UI/
  DrawState` rendering of upstream's `struct game`, not a handle-
  passing transliteration); the TS `Midend` that owns the move/undo/
  redo stack, timer, preset tree, status, anim/flash, and serialise;
  the **per-game hybrid runtime selection** mechanism; the clean
  TS-native save format; and the midend's behavioural-test discipline
  (no characterization corpus).
- **Decision — per-game switch = a runtime TS game registry, not a
  build flag.** A `puzzleId`-keyed registry of TS `Game`
  implementations. The worker consults it: registered ⇒ instantiate
  the TS midend; absent ⇒ load the game's WASM as today. No new
  CMake/Vite flag; the `USE_TS_LEAVES` umbrella is orthogonal (it
  governs C-internal leaf-library bridges, not which engine serves a
  game). Rationale + alternatives in `design.md`.
- **Decision — the TS midend runs in the existing Web Worker**,
  exposing the identical Comlink `WorkerPuzzle` surface
  (`src/puzzle/worker.ts`). This defers the "does the worker survive"
  question exactly as the `ts-migration` spec asks (re-evaluate after
  the first few ports), and keeps the seam to a single dispatch point
  in the worker factory.
- **Decision — clean TS save format.** A versioned JSON envelope
  (`{ v, puzzleId, params, gameId, moves, timerElapsed, checkpoints }`)
  produced/consumed by the TS midend. Not C-`midend_serialise`
  compatible; the `ts-migration` spec explicitly makes old C-format
  saves and pre-pivot shared IDs expendable. `random.ts` keeps future
  game IDs reproducible.
- **`repo-layout` spec — MODIFIED.** The `src/native/<module>`
  requirement is updated: drop the mandatory `__fixtures__/`
  characterization-corpus + "replay test / corpus captured from the
  native C build" language (retired by `pivot-to-top-down-ts`), and
  define the engine/games locations: `src/native/engine/` (midend +
  `Game` interface + registry) and `src/native/games/<game>/` (one
  folder per ported game), with behavioural `*.test.ts` colocated.
- **Implementation** under `src/native/engine/`: the `Game` interface
  types, the `Midend` class, the registry, the save codec, and the
  worker dispatch seam, plus behavioural tests driven by a tiny
  in-repo fake `Game` (no real game is ported here).

**Out of scope** (deliberately, to keep the keystone coherent):

- Porting any actual game. The pattern-establishing first port
  (Cube/Flip/Pegs) is the *next* change and is what first exercises
  this interface end-to-end.
- The dev-time differential spot-check harness. It needs a ported game
  to diff against C; it is built with/around the first game port, not
  here. (`ts-migration` makes it advisory/SHOULD, not a gate.)
- Any change to the drawing layer. The existing `src/puzzle/drawing.ts`
  `Drawing` / `DrawingImpl` is reused as-is by TS `Game.redraw`.
- Deleting any C or removing any WASM target (per-game C deletion
  happens in each game-port change, when that port ships).
- Re-evaluating the worker's existence (explicitly deferred by
  `ts-migration` until after the first few ports).

## Impact

- **Affected specs**: `ts-engine` (ADDED — new capability);
  `repo-layout` (MODIFIED — `src/` location of the TS engine + games;
  drop retired corpus layout from `src/native/<module>`).
- **Realises (does not modify)**: `ts-migration` "Midend precedes game
  ports" and "Per-game hybrid" — this change implements the mechanism
  the doctrine mandates without altering the doctrine.
- **Affected code**: new `src/native/engine/` (interface, midend,
  registry, save codec, tests); a single dispatch seam in
  `src/puzzle/worker.ts` (route to the TS midend when the registry has
  the `puzzleId`, else the existing WASM path). No screen/dialog/
  drawing/store changes; the Comlink surface is unchanged.
- **Build-pipeline**: untouched. The selection is runtime, not a build
  flag; `USE_TS_LEAVES` and the worker coherence check are orthogonal
  and keep working.
- **Risk**: medium. It is new architecture, but it ships with **zero
  registered games**, so the production runtime is byte-for-byte the
  current all-WASM path until the first port registers. The midend is
  covered by behavioural tests against a fake `Game`; the real
  exercise is the next change.
- **Verification**: `openspec validate ts-midend-and-game-interface
  --strict` passes; the pre-commit gate (`tsc -b --noEmit` → `biome
  lint` → `vitest run`) is green; `npm run build` still exits 0;
  selecting any catalog game still loads its WASM (registry empty).
