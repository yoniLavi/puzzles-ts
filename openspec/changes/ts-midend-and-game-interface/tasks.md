## 1. Engine layer (`src/native/engine/`)

- [x] 1.1 `game.ts` — the `Game<Params,State,Move,Ui,DrawState>`
  interface + shared engine types (`PresetMenu`, re-use existing
  `GameStatus`/`Colour`/`Point`/`Size`/`Button`/`ConfigDescription`
  from `src/puzzle/types.ts`; do not duplicate them)
- [x] 1.2 `midend.ts` — the `Midend` class: holds `Game`, `Params`,
  `State[]` history + cursor, `Ui`, `DrawState`, `RandomState`
  (`src/native/random`), timer state; implements the `WorkerPuzzle`
  surface (newGame/newGameFromId/restart/processKey/processMouse/
  undo/redo/solve/redraw/getPresets/status/serialise) and emits the
  existing `ChangeNotification` shapes
- [x] 1.3 `registry.ts` — `Map<puzzleId, Game>` + `registerGame()` /
  `getGame()`; exported so game-port modules self-register
- [x] 1.4 `save.ts` — versioned JSON save codec (`{ v, puzzleId,
  params, gameId, moves, timerElapsed, checkpoints }`), encode/decode
  to `Uint8Array`; round-trips via move replay from `desc`
- [x] 1.5 Wire the dispatch seam in `src/puzzle/worker.ts`: if
  `getGame(puzzleId)` is set, construct a `Midend`-backed object
  satisfying the Comlink `WorkerPuzzle` surface; else the existing
  WASM path. No other worker behaviour changes

## 2. Tests (behavioural, no corpus)

- [x] 2.1 `__fixtures__`-free fake `Game` (tiny toggle/counter game)
  for driving the midend
- [x] 2.2 `midend.test.ts` — undo/redo invariants; history truncation
  after move-following-undo; `status` transitions; notification
  emission; timer accumulation; preset-tree parse
- [x] 2.3 `save.test.ts` — serialise→parse round-trips reconstruct
  identical history/state; version field present; bad payload rejected
- [x] 2.4 Property test: `undo` after `executeMove` returns the prior
  state for the fake game

## 3. Verification

- [x] 3.1 Pre-commit gate green: `tsc -b --noEmit` → `biome lint` →
  `vitest run`
- [x] 3.2 `npm run build` exits 0 (production build unaffected)
- [x] 3.3 Manual: every catalog game still loads its WASM (registry
  empty ⇒ runtime identical to pre-change); no console errors
- [x] 3.4 `openspec validate ts-midend-and-game-interface --strict`

## 4. Docs + archive

- [ ] 4.1 `AGENTS.md` — add "What's been done" entry; resolve the
  "per-game switch shape" and "src/ engine location" known questions;
  point migration-order item 1 at this landed change
- [ ] 4.2 Mark every task above `- [x]`; archive via
  `openspec archive ts-midend-and-game-interface --yes`; confirm
  `openspec validate --strict` passes post-archive
