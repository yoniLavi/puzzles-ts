# Spec: Sixteen TS Engine Port

## Types

```typescript
interface SixteenParams {
  w: number;
  h: number;
  movetarget: number; // 0 = random permutation, >0 = shuffle count
}

interface SixteenState {
  w: number;
  h: number;
  n: number;
  tiles: Int32Array; // 1-indexed tile values, 0 = empty (not used in sixteen)
  completed: number; // 0 = ongoing, >0 = move count at completion
  usedSolve: boolean;
  moveCount: number;
  moveTarget: number;
  lastMovementSense: number; // dx+dy of last move, for animation direction
}

type SixteenMove =
  | { type: "slide"; axis: "row" | "column"; index: number; delta: number }
  | { type: "solve" };

enum CursorMode { Unlocked, LockTile, LockPosition }

interface SixteenUi {
  curX: number;
  curY: number;
  curVisible: boolean;
  curMode: CursorMode;
}
```

## Game interface methods

### Params
- `defaultParams()`: `{ w: 4, h: 4, movetarget: 0 }`
- `encodeParams(p, full)`: `"WxH"` or `"WxHmM"` if movetarget > 0 (movetarget is always encoded, matching C)
- `decodeParams(s)`: parse `WxH[mM]`
- `validateParams(p, full)`: w >= 2, h >= 2, movetarget >= 0
- `presets()`: 5 presets (3×3, 4×3, 4×4, 5×4, 5×5)

### State
- `newDesc(params, rng)`: Two generation paths (see Generator below)
- `validateDesc(params, desc)`: comma-separated integers 1..n, each used exactly once
- `newState(params, desc)`: parse desc into Int32Array
- `executeMove(state, move)`: immutable, returns new state
- `serialiseMove(move)` / `deserialiseMove(raw)`: discriminated union ↔ string

### Move logic
- Row slide: shift all tiles in row `r` by `delta` positions (wrapping)
- Column slide: shift all tiles in column `c` by `delta` positions (wrapping)
- Solve: replace grid with 1,2,...,n

### Completion
- `completed > 0` when all tiles[i] === i+1
- `status(state)`: "solved" if completed > 0, "ongoing" otherwise

### Generator
Two paths:
1. **movetarget > 0**: Start from solved state, make `movetarget` random row/column slides. Anti-cancellation: avoid directly undoing previous move or repeating so many times it becomes fewer moves in the opposite direction.
2. **movetarget == 0**: Place a random permutation. If both w and h are odd, apply parity correction to the last two tiles.

### Rendering
- 4 colours: background, text, highlight, lowlight
- Uses `mkhighlightBackground` from `engine/colour-mkhighlight.ts`
- Per-tile cache: only redraw tiles that changed or are animating
- 3D tile effect: highlight triangle top-left, lowlight triangle bottom-right
- Arrows around border for click targets
- Cursor: highlighted arrow at current cursor position
- Animation: tiles slide from old position to new; wraparound tiles draw at both positions
- Flash: alternating highlight/lowlight background on completion

### Input
- **Mouse**: LEFT_BUTTON / RIGHT_BUTTON on border arrows → slide row/column
- **Keyboard**: cursor movement + CURSOR_SELECT (lock tile) / CURSOR_SELECT2 (lock position)
- **No drag input**

## Registration

- `registerGame("sixteen", sixteenGame)` in `src/native/games/index.ts`
- `TS_PORTED` in `puzzles/CMakeLists.txt`
- Delete `puzzles/sixteen.c` on owner acceptance

## Testing

- Behavioural tests: params, desc, state, moves, completion, generator, presets, colours, text format
- Midend integration tests: lifecycle, keyboard input, undo, newGame
- Differential test: frozen C reference snapshots
