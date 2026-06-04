# Design: Port Sixteen to TypeScript

## Game overview

Sixteen is a sliding-tile puzzle on a toroidal grid. You rotate an entire row or column by one position (wrapping around). The goal is to arrange numbered tiles 1..n in order. Clicking arrows around the border slides the adjacent row/column; keyboard cursor + arrow keys also work.

## Key characteristics from C analysis

- **Params**: `w`, `h`, `movetarget` (shuffle move count; 0 = random permutation)
- **State**: `w`, `h`, `n`, `tiles[]` (1-indexed, 0 = empty), `completed`, `usedSolve`, `moveCount`, `moveTarget`, `lastMovementSense`
- **UI**: cursor position (`curX`, `curY`), `curVisible`, `curMode` (unlocked/lock_tile/lock_position)
- **Move format**: `"R{row},{delta}"` or `"C{col},{delta}"` for row/column slide, `"S"` for solve
- **Generator**: Two paths — `movetarget > 0` shuffles by making random moves (with anti-cancellation); `movetarget == 0` places a random permutation with parity correction
- **Solver**: Trivial — just returns `"S"` (replaces grid with solved state). Not a real solver.
- **Animation**: `ANIM_TIME = 0.13s`, tiles slide from old position to new. Wraparound tiles draw at both positions during animation.
- **Flash**: `2 * FLASH_FRAME` on completion (if not solved)
- **Rendering**: Per-tile cache with highlight/lowlight 3D effect, numbered tiles, arrows around border, cursor-highlighted arrow
- **Colours**: 4 colours — background, text, highlight, lowlight (uses `mkhighlightBackground`)
- **No blitters, no drag input, no leaf libs**

## TS architecture

Follow the Galaxies model:

```
src/native/games/sixteen/
├── index.ts          # Game glue + move logic + types + registerGame()
├── state.ts          # State type, encode/decode, completion check
├── generator.ts     # Board generation (two paths + parity)
├── render.ts         # Imperative redraw, DrawState, colour palette, per-tile cache
├── sixteen.test.ts   # Behavioural tests
└── sixteen-differential.test.ts  # Gated diff vs frozen C reference
```

No `solver.ts` — the "solver" is trivial (just returns solved state). No `dsf.ts` — no leaf libs needed.

## Idiomatic TS choices

- **`tiles: Int32Array`** instead of `int*` — natural for a flat grid of small integers
- **Discriminated union for moves**: `{ type: "slide", axis: "row"|"column", index: number, delta: number }` and `{ type: "solve" }` instead of string parsing
- **`CursorMode` enum** instead of C's `enum cursor_mode`
- **Immutable `executeMove`** — returns new state, never mutates
- **`permParity` as a standalone function** — clean, testable
- **No `lastMovementSense` as state** — the animation direction can be derived from the move itself during rendering

## New shared helpers needed

- `mkhighlightBackground` — already in `engine/colour-mkhighlight.ts` (2nd consumer after Galaxies)
- No new helpers needed

## Risks / open questions

- **Wraparound animation**: The C code draws tiles at two positions during animation when they wrap around the grid edge. This is the trickiest rendering logic. Need to verify it works correctly in the TS port.
- **Cursor lock modes**: Three cursor modes (unlocked, lock_tile, lock_position) with keyboard shortcuts. The C code's `interpret_move` is complex. Need to port carefully.
- **`movetarget` as a param**: This is unusual — it's a shuffle count that affects generation, not gameplay. The C code includes it in the encoded params (even with `full=false`). Need to preserve this.
