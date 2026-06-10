# Change: Mistake-checking hook + Galaxies implementation

## Why

"Mistake-checking" is one of the deliberate divergences from upstream
the migration is *for* (AGENTS.md Goal; migration-order item 6). It is
also the detection half the owner's combined **Check & Save** button
needs: a checkpoint is only worth saving if the board is still
provably on the solution path. This change lands the engine capability
and a first real implementer (Galaxies, the ported deduction game). Its
user-facing trigger is the combined **Check & Save** button delivered by
the companion `add-quick-save-check-save` change — the two ship and are
owner-accepted together, so no throwaway standalone control is built.

## What Changes

- **Engine hook.** Add an optional `Game.findMistakes(state)` returning
  the cells that contradict the puzzle's unique solution (game-specific
  highlight data; empty ⇒ no detectable mistakes). Mirror the Hint
  System's ephemerality: the `Midend` stores an `activeMistakes`
  display (midend-only, never in game state, never persisted), passes it
  to the game's `redraw`, exposes a **count** on the engine surface, and
  clears it on the next move / undo / redo / restart / new game / solve.
- **Surface.** Add `canFindMistakes` to the static attributes (true iff
  the game implements the hook) and `findMistakes(): number` to
  `PuzzleEngineSurface` (displays the mistakes and returns how many);
  thread it through both `WorkerPuzzle` (C/WASM: "not supported" → 0)
  and `TsWorkerPuzzle`, and `Puzzle` on the main thread.
- **Galaxies implementation.** Detect mistakes by solving a cleared copy
  (dots only) to the canonical tile→dot partition, then flag **both**
  (a) every player-associated tile whose dot differs from the solution's,
  and (b) every interior wall the player drew inside a single solution
  region. Render flagged tiles and walls with a mistake highlight. Wall
  detection is essential: Galaxies is commonly played entirely with walls
  (no association arrows), so a check blind to walls passes a wrong board
  as clean — the defect the owner hit.
- **App shell.** No control of its own — the trigger is the companion
  change's **Check & Save** button. The mistakes stay highlighted until
  the next move (a result you can study), exactly like a displayed hint.

## Impact

- Affected specs: `ts-engine` (ADDED: mistake-checking hook + surface),
  `galaxies` (ADDED: mistake detection + rendering).
- Affected code: `src/native/engine/{game,midend,worker-adapter}.ts`,
  `src/puzzle/{engine-surface,worker,puzzle}.ts`,
  `src/native/games/galaxies/{index,render}.ts`,
  `src/screens/puzzle-screen.ts`.
- No change for unported (C/WASM) games — `findMistakes()` returns 0 and
  the button is hidden (`canFindMistakes` false). Owner-acceptance gated
  before Galaxies' button ships.
