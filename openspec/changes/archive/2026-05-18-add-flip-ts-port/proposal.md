# Change: Port Flip to native TypeScript (the pattern-establishing first game)

## Why

The keystone (`ts-midend-and-game-interface`) shipped the `Game`
interface, `Midend`, runtime registry, and `TsWorkerPuzzle` adapter,
but the registry is empty and three contract questions were
deliberately deferred to "the first real port" (the archived keystone
design.md "Open Questions"): the drawing API surface, how a game
reports a UI-only change, and how the default background reaches
`colours()`. This change is migration-order item 2 — the first
`registerGame(...)`, the first real game flowing end-to-end through the
TS midend — which is the agreed moment to resolve those, remove the
`as unknown as WorkerPuzzle` cast at the dispatch seam, and stand up
the dev-time differential spot-check the `ts-migration` doctrine asks
for.

Flip is the chosen first game: a self-contained GF(2) light-toggling
puzzle with a complete deterministic solver (Gaussian elimination), a
statusbar, flip animation and a win flash, keyboard cursor, and a
non-trivial random-matrix generator — enough to exercise the whole
interface for real, while its only engine-library dependency
(`tree234`, used solely by the RANDOM matrix generator) reduces to a
small idiomatic ordered-multiset helper.

## What Changes

- **Port Flip to TS** under `src/native/games/flip/` implementing
  `Game<FlipParams, FlipState, FlipMove, FlipUi, FlipDrawState>`:
  params/presets (3×3/4×4/5×5 × Crosses/Random), `CROSSES` and
  `RANDOM` matrix generation, the full GF(2) Gaussian-elimination
  solver, immutable `executeMove`, statusbar text, flip-animation and
  win-flash timing, keyboard cursor, text format, and `redraw`.
- **Lazy idiomatic leaf port**: an ordered-multiset helper (the
  on-demand `tree234` equivalent) local to the Flip generator — a
  sorted-array multiset with the positional/relative-find operations
  Flip's RANDOM generator needs, not a 2-3-4 tree.
- **`registerGame(flipGame)`** from the Flip module; the registry is
  no longer empty, so `flip` is served by the TS engine and its
  `puzzles/flip.c` is deleted (per-game C deletion per `ts-migration`).
- **Per-game hybrid catalog seam** (surfaced by deleting flip.c): a
  `TS_PORTED` marker on the CMake `puzzle()` macro keeps a TS-ported
  game in `catalog.json`/`puzzleIds` (so the app lists and routes it)
  while building no `<name>.c`/wasm; the catalog generator unions
  these with the wasm-built games.
- **Resolve the deferred `Game` contract** (the keystone's allowed
  interface refinement):
  - `GameDrawing` widened to the full puzzle drawing API
    (line/polygon/circle/clip/unclip/blitter), structurally satisfied
    by the existing canvas `Drawing`.
  - `interpretMove` may return a UI-only result so cursor/UI changes
    redraw without creating a history entry; the midend handles it.
  - `colours(defaultBackground)` receives the frontend default
    background, threaded through `EngineCore`/`TsWorkerPuzzle`.
- **Introduce `PuzzleEngineSurface`**: one shared interface that both
  `WorkerPuzzle` and `TsWorkerPuzzle` implement; the worker factory and
  `RemoteWorkerPuzzle` use it, removing the
  `as unknown as WorkerPuzzle` cast.
- **Dev-time differential spot-check** (advisory, not a gate): a
  native Flip harness target under `puzzles/auxiliary/` and a TS-side
  script that generate Flip game descriptions for the same seed/params
  and surface diffs for human review.
- **Behavioural + property tests** for the Flip port (solvable-board
  generation, solver solves generated and hand-entered boards,
  unsolvable detection, move/undo invariants, save round-trip, the
  ordered-multiset helper's invariants).
- Docs: `AGENTS.md` "What's been done" + migration-order updates;
  `ts-engine` spec deltas; new `flip` capability spec.

## Impact

- Affected specs: `ts-engine` (drawing/colour/input-feedback contract,
  shared engine surface), `flip` (new capability).
- Affected code: `src/native/games/flip/*` (new),
  `src/native/engine/{game.ts,midend.ts,worker-adapter.ts,index.ts}`,
  `src/puzzle/{worker.ts,engine-surface.ts}` (shared surface, cast
  removed), `puzzles/cmake/{setup.cmake,platforms/webapp.cmake}` +
  `puzzles/CMakeLists.txt` (`TS_PORTED` catalog seam),
  `scripts/diff-flip*`, `puzzles/flip.c` (deleted), `AGENTS.md`.
- Runtime: `flip` flips from C/WASM to TS; all other games unchanged
  (still C/WASM via the unchanged path).
