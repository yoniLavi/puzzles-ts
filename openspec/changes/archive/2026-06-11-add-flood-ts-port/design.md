## Context

Flood (`puzzles/flood.c`, ~1400 lines): a `w×h` grid of coloured squares. The
top-left square (`FILLX=0, FILLY=0`) anchors a "controlled region" of
same-coloured connected squares. Each move picks a colour; the controlled region
becomes that colour and absorbs any newly-adjacent same-colour squares (a
flood-fill from the corner). Win when the whole grid is one colour within
`movelimit` moves; **lose** when `moves` reaches `movelimit` before completing.

This design is scaffolded from a full read of `flood.c` ahead of implementation.
It records the decisions; the next session implements against it.

## Goals / Non-Goals

- **Goals:** faithful gameplay (generation incl. par-setting, fill semantics,
  win/lose, two flash types, separator-bordered rendering, click + keyboard),
  the solver, a `hint()` that follows the solver, a snap `solve()`, idiomatic
  immutable TS, behavioural + render tests, parity-gated registration.
- **Non-Goals:** `findMistakes`; upstream's stored-soln machinery; print; a
  byte-identical board corpus beyond the optional differential (but see D-RISK on
  solver parity — Flood's par depends on the solver, so its differential matters
  more than the permutation games').

## Decisions

### D1 — Move model: fill + solve

`FloodMove = { type: "fill"; colour: number } | { type: "solve" }`. A fill is
legal only when `colour` differs from the current corner colour and the game
isn't complete (upstream `M{colour}`). `solve` snaps (upstream `S...`, but see
D5). Plain JSON-safe data → default move codec.

### D2 — State: drop upstream's stored-solution machinery

`FloodState`: `grid: Uint8Array` (colour per cell), `w`, `h`, `colours`,
`moves`, `movelimit`, `complete`, `cheated`. **Omit** upstream's
`soln`/`solnpos`/`refcount` — that is upstream's pre-hint-system way of letting
you step through the solver; our engine's `hint()` plan (D4) replaces it
entirely. This is a real idiomatic simplification, not a feature cut.

### D3 — Solver: faithful port of `search` + `choosemove`

Port `solver.ts`:
- `fill(grid, colour)` — flood-fill the corner region to `colour` (BFS).
- `completed(grid)` — all cells equal.
- `search(grid)` — boundary-distance BFS from the corner: each cell's "distance"
  is the number of fills needed to absorb it (same-colour neighbours are
  distance-0 hops, colour changes cost 1). Returns `{ dist: max distance,
  number: count of squares at that max, control: size of the distance-0 set }`.
- `choosemove(grid, maxcolours)` — try every colour, simulate the fill,
  `RECURSION_DEPTH = 3` look-ahead, score each by `search` and pick the move
  minimising `(dist, then number, then -control)`; a winning move short-circuits.
  Port `choosemove_recurse` branch-for-branch (the depth-3 recursion + the
  win-short-circuit that records the depth so higher levels prefer faster wins).

The solver is heuristic (not optimal) but is exactly what upstream uses; it must
match C's choices for par/ID reproducibility (see D-RISK).

### D4 — `hint()`: the solver's whole plan; `hintKeepTrack`

`hint()` runs the solver from the current grid, collecting the full move
sequence, and returns it as a multi-step plan: each step `{ move:
{type:"fill",colour}, explanation: "Fill with <colourname>", highlights: <the
squares this fill will absorb> }`. The highlight is upstream's `SOLNNEXT` set
(the squares of the target colour adjacent to the controlled region — computed
by filling to the target then re-filling in a sentinel colour, per
`game_redraw`'s soln block). `hintKeepTrack`: a player fill whose colour equals
the current step's colour advances the plan (`"completed"`); any other fill is
`"off"` (drop, recompute next request). This carries the full plan like
Sixteen/Fifteen so the hint banner persists through auto-hint.

### D5 — `solve()`: snap-to-solved

`solve()` returns `{ type: "solve" }`. `executeMove` for solve runs the solver
from the current grid, applies every fill in sequence, and returns the completed
grid with `cheated = true` and `moves` advanced by the solver's count. (Upstream
stores a path instead; we snap, consistent with the other ports' Solve and with
our separate `hint()` providing the step-by-step experience.) Edge: if the
solver's count pushes `moves > movelimit`, the result is still `complete`;
`status()` (D6) reports `"solved"` because complete takes priority — confirm the
status precedence matches upstream `game_status` (which checks `complete &&
moves <= movelimit` first, then `moves >= movelimit`). A cheated win is shown as
"Auto-solved" in the status bar.

### D6 — `status()` and the lose condition (no engine change)

`status()`: `"solved"` when `complete && moves <= movelimit`; `"lost"` when
`moves >= movelimit && !complete`; else `"ongoing"`. The engine `GameStatus`
union already includes `"lost"` and the WASM games already emit it
(`webapp.cpp` `STATUS_LOST`), so the midend passes it through unchanged.
**Verify during implementation** that the app shell's lost-state UX (status
chrome, stopping input) behaves the same on the TS path as it does for a WASM
game that loses — this is the one thing to smoke-test that the other ports
didn't exercise.

### D7 — No `findMistakes`

Every fill is a legal move; the only failure is exhausting the move budget,
which is the `"lost"` terminal status, not a per-cell mistake to highlight.
Check-&-Save degrades to plain Quick-save (as for the permutation games).

### D8 — Rendering

Port `game_redraw`/`draw_tile`:
- Coloured tiles (`COL_1..COL_10`), with black **separator** edges/corners drawn
  between cells of differing colour (the `BORDER_L/R/U/D` + `CORNER_*` flags) and
  a separator frame around the playfield. One-time recessed bevel border (the
  fifteen-style recessed rect).
- Cursor: a `draw_rect_outline` inset square at the cursor cell.
- Hint: the `SOLNNEXT` squares drawn with a small centre circle in the separator
  colour.
- **Victory flash:** a rainbow radiating from the corner (`flashframe -
  (|x-FILLX| + |y-FILLY|)` indexes the colour). **Defeat flash:** the whole board
  blinks to the separator colour for 3 frames (`BADFLASH`). Derive the flash
  *type* from the state's status in `redraw` (victory if `complete`, defeat if
  `"lost"`) rather than storing it in the UI — our engine has no
  flashLength-time UI mutation hook and the status fully determines it.
- No move animation (`animLength` 0). Per-tile cache keyed by the packed tile
  flags in an `Int32Array` (colour `<< COLOUR_SHIFT` | border/corner/cursor/
  flash/solnnext bits — the documented "no BigInt" cache pattern).

### D9 — Colours

`NCOLOURS = 14`: `COL_BACKGROUND`, `COL_SEPARATOR` (black), `COL_1..COL_10` (the
ten fixed RGB values from `game_colours`), `COL_HIGHLIGHT`, `COL_LOWLIGHT`.
`mkhighlight(defaultBackground)` supplies background/highlight/lowlight; the ten
play colours and the black separator are literals.

### D10 — File layout

- `state.ts` — params (`w`,`h`,`colours`,`leniency`), state, `FloodMove`,
  params/desc codecs (`WxH` + `c{n}m{lenient}`; desc = colour chars `0-9A-Z` +
  `,{movelimit}`), `validateDesc`, the generator (`newDesc`: random grid →
  solver to count moves → `movelimit = moves + leniency`), `fill`, `completed`,
  `textFormat`.
- `solver.ts` — `search` + `choosemove`(+`_recurse`) + the depth-3 scratch.
- `render.ts` — `redraw`, separator/cursor/solnnext/flash drawing, the tile-flag
  cache, `colours`, `computeSize`.
- `index.ts` — `Game` glue, `interpretMove` (click/cursor-select fill at a
  different-colour cell; cursor move), `executeMove`, `hint`, `solve`, `status`,
  `statusbarText`, `registerGame`.

## Risks / Trade-offs

### D-RISK — Solver parity matters more here (par/ID reproducibility)

Flood's `movelimit` = `solver_move_count + leniency`. The grid itself is a plain
`random_upto` sequence (reproduces bit-for-bit via `random.ts`), but the **par
depends on the solver's exact choices**. So a seed reproduces the same *grid*
regardless, but the same *move limit* only if the TS solver makes the same
choices as C. This is a stronger differential concern than the permutation games
(whose generators don't depend on a solver). **Decision for implementation:**
port `choosemove`/`search` branch-for-branch (including tie-break order:
`dist`, then `number`, then `control`, then first-colour-wins), and add a
*tightened* differential check (the `ts-migration` "brutal uniqueness" exception)
asserting the TS solver's move count equals C's for N seeds — not just "every
board is solvable". A transient `puzzles/auxiliary/flood-trace.c` emits the
reference, like the other ports.

### Other

- **Lose-state UX on the TS path** — verify the app handles `"lost"` from a TS
  game identically to a WASM game (D6); the one untested-by-prior-ports path.
- **Solver performance** — depth-3 over up to 10 colours on a 16×16 grid, run to
  completion at generation time. C is fast; TS should be too, but keep the inner
  loops typed-array-tight (no per-cell allocation) and confirm generation of the
  largest preset is snappy.

## Migration Plan

Standard parity-gated split: implement + test + register + dev-verify (incl. the
lose-state UX check) → owner acceptance → flip `TS_PORTED` + delete `flood.c` →
archive. Empty-registry / C-fallback covers Flood until acceptance.

## Open Questions

- None blocking. The `"lost"`-status engine support is confirmed present; the
  only verification deferred to implementation is the app's lost-state UX on the
  TS path (D6) and the solver-parity differential bar (D-RISK).
