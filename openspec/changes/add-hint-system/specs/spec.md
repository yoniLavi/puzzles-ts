# Spec: Hint System

## Types

```typescript
/** Result of a hint attempt. */
export type HintResult<Move> =
  | { ok: true; move: Move; explanation: string }
  | { ok: false; error: string };

/** A hint currently being displayed. Stored in the midend. */
export interface ActiveHint<Move> {
  move: Move;
  explanation: string;
}
```

## Game interface

New optional method:

```typescript
interface Game<Params, State, Move, Ui, DrawState> {
  // ... existing ...

  /** Compute a heuristic hint for the current state.
   * Returns a single move + human-readable explanation,
   * or an error. The move is NOT auto-applied. */
  hint?(state: State): HintResult<Move>;
}
```

## Midend

### New state

- `activeHint: ActiveHint<Move> | null` — initially null

### New public method

```typescript
hint(): string | undefined;
```

- Calls `this.game.hint(this.state)` if the game implements `hint()`
- If `ok: true`, stores the result as `activeHint`, calls `afterTransition()` (emits state change + status bar + redraw)
- If `ok: false`, returns the error string
- If the game doesn't implement `hint()`, returns "This game does not support hints"

### Hint clearing

`activeHint` is cleared when:
- `processInput` produces a real move (not UI_UPDATE)
- `undo()` or `redo()` is called
- `newGame()` or `restartGame()` is called

### Redraw call

The midend passes `activeHint` to the game's `redraw`:

```typescript
this.game.redraw(
  dr, ds, prev, state, dir, ui,
  animTime, flashTime,
  this.activeHint ?? undefined,
);
```

### Status bar

When `activeHint` is non-null, the midend appends the explanation to the game's status bar text, separated by a newline or " — " separator.

## Redraw signature

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

The `hint` parameter is optional and backward-compatible. Games that don't implement `hint()` never receive it.

## Sixteen hint implementation

### Heuristic

1. Find all tiles that are out of place
2. For each out-of-place tile, compute which single row/column slide moves it closer to its target column/row
3. Score each candidate move by: (tiles moved closer) - (tiles moved farther)
4. Pick the highest-scoring move
5. If no move improves the score, return `{ ok: false, error: "No helpful hint found" }`

### Explanation format

- Row slide: `"Slide row {r} {direction} — moves tile {n} closer to its target"`
- Column slide: `"Slide column {c} {direction} — moves tile {n} closer to its target"`

### Rendering

- Highlight the arrow corresponding to the hinted row/column slide (use COL_HIGHLIGHT or a new COL_HINT colour)
- The status bar shows the explanation (appended by the midend)

## UI

The puzzle page needs two buttons:
- **Solve** — existing behaviour (calls `midend.solve()`)
- **Hint** — new behaviour (calls `midend.hint()`)

The Hint button is only shown when the game implements `hint()`. This can be determined by checking `game.hint !== undefined`, or the midend can expose a `canHint: boolean` property.

## Testing

- Unit tests for `HintResult` type
- Midend integration tests: `hint()` stores active hint, clears on move/undo
- Sixteen hint tests: heuristic returns valid moves, explanations are human-readable
- Sixteen rendering tests: hint arrow is highlighted
