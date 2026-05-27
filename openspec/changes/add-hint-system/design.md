# Design: Hint System

## Core insight

The hint is a **UI-layer concern**, not a game-state concern. Flip couples hint display to game state (bit-1 markers in the grid, `hintsActive` flag) because that was the simplest path for that game. But for sequential-solution games, the hint is ephemeral: "here's what to do next." It should vanish when the player makes any move, without polluting the state type or the undo history.

## Architecture

### New types

```typescript
/** Result of a hint attempt — discriminated so a Move
 * cannot be confused with an error message. */
type HintResult<Move> =
  | { ok: true; move: Move; explanation: string }
  | { ok: false; error: string };

/** A hint currently being displayed. Stored in the midend,
 * passed to the game's redraw so it can render the hint. */
interface ActiveHint<Move> {
  move: Move;
  explanation: string;
}
```

### Game interface change

New optional method:

```typescript
interface Game<...> {
  // ... existing ...

  /** Compute a heuristic hint for the current state.
   * Returns a single move + explanation, or an error.
   * The move is NOT auto-applied — the midend stores it
   * as an active hint and the renderer displays it.
   * The player executes the move themselves. */
  hint?(state: State): HintResult<Move>;
}
```

### Midend change

The midend gains:

1. **`activeHint: ActiveHint<Move> | null`** — stored in midend, not game state
2. **`hint(): string | undefined`** — new public method, analogous to `solve()`
3. **Hint clearing** — any call to `processInput` that produces a real move (not UI_UPDATE) clears `activeHint`. Undo/redo also clear it.
4. **Hint passed to redraw** — `redraw` receives the active hint so the game can render it

### Redraw signature change

The `redraw` method gains a hint parameter:

```typescript
redraw?(
  dr: GameDrawing,
  ds: DrawState | null,
  prev: State | null,
  s: State,
  dir: number,
  ui: Ui,
  animTime: number,
  flashTime: number,
  hint?: ActiveHint<Move>,
): void;
```

This is backward-compatible: existing games that don't implement `hint()` never receive a non-null hint, and the parameter is optional so existing `redraw` implementations don't need to change.

### Rendering

Each game decides how to render its hint. For Sixteen:

- Highlight the arrow corresponding to the hinted row/column slide
- Show the explanation in the status bar (appended to the existing status text)

For Flip (future): could highlight the next cell to flip with a distinct colour.

### Status bar

The midend appends the hint explanation to the game's status bar text when an active hint is present. Games don't need to handle this themselves.

### Solve vs Hint

| | Solve | Hint |
|---|---|---|
| Button | "Solve" | "Hint" |
| Returns | Full solution move | Single next-step move + explanation |
| Applied | Immediately (via `applyMove`) | Not applied — stored as active hint |
| Display | Game-specific (Flip: hint mask; others: jump to solved) | Game-specific highlight + status bar explanation |
| Clears on | N/A (it's a move in history) | Any player move, undo, or redo |

## Sixteen hint heuristic

Find a tile that's out of place. Determine which single row/column slide moves it closer to its target position. Prefer moves that also help other tiles. The explanation is auto-generated: *"Slide row 2 left — moves tile 7 one step closer to its target."*

No BFS. No optimality. Just a reasonable next step that makes progress.

## Risks / open questions

- **Redraw signature change** — adding a parameter is backward-compatible in TypeScript (optional param), but existing call sites in the midend need updating. Low risk.
- **Hint quality** — a bad heuristic (suggesting a move that doesn't help) is worse than no hint. The Sixteen heuristic should be conservative: only suggest moves that demonstrably move at least one tile closer.
- **Hint for solved state** — `hint()` should return `{ ok: false, error: "Already solved" }` when the puzzle is complete.
