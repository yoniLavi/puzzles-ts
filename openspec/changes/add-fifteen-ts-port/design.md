## Context

Fifteen is the classic 15-puzzle: an `w×h` grid of numbered tiles with one
empty gap; sliding a line of tiles toward the gap is one "click", counted as
one move per tile shifted. It is the simplest remaining upstream game and a
near-sibling of the already-ported Sixteen, so this design records only what
differs from the Sixteen template and the few non-obvious decisions.

## Goals / Non-Goals

- **Goals:** faithful gameplay parity with `fifteen.c` (generation, slide
  semantics, animation, flash, status bar, click + keyboard input), a working
  `solve()` and `hint()`, idiomatic immutable TS, behavioural + render tests,
  parity-gated registration.
- **Non-Goals:** byte-identical board corpus (advisory differential only, like
  Cube), the arrow-semantics preference UI, multi-step hint plans, mistake
  checking, print.

## Decisions

### D1 — Move model: gap-destination + solve

`FifteenMove = { type: "move"; x: number; y: number } | { type: "solve" }`.
The `"move"` carries the *destination gap cell* (upstream `"M x,y"`):
`executeMove` finds the unit step from the old gap toward `(x,y)` and shifts
every tile on that line one cell toward the old gap, incrementing `moveCount`
once per shifted tile, then re-checks completion. `"solve"` (upstream `"S"`)
snaps to the solved grid. Moves are plain JSON-safe data, so the default move
codec suffices (no `serialiseMove`).

### D2 — No separate cursor state; the gap *is* the cursor

Unlike Sixteen (which has a free-floating cursor, lock modes, and a select
step), Fifteen's arrow keys act on the gap directly and *immediately* produce a
slide — there is no cursor-visible toggle or selection. So `FifteenUi` carries
only `invertCursor` (the arrow-semantics flag, see D3), defaulting `false`. No
cursor highlight is rendered (upstream's `game_redraw` draws none; the gap is
the keyboard focus via `game_get_cursor_location`).

### D3 — Arrow semantics: ship upstream default, omit the preference

Upstream maps an arrow key to "move a tile in that direction" by default
(`flip_cursor` of the pressed direction → the gap moves the opposite way, so
the tile on that side slides in). `FIFTEEN_INVERT_CURSOR` flips this to "move
the gap in the arrow direction". The TS engine has no preferences hook, so we
hard-code the default (`invertCursor = false`) and drop the toggle. Documented
divergence; trivially restored when a prefs hook exists.

### D4 — Hint: one greedy step per request, no plan tracking

`hint()` runs a faithful port of `compute_hint` (the greedy human solver: fill
the shorter of "top row L→R" / "left column T→B", moving the next tile toward
its home via `next_move`, with a hard-coded shortest-move `next_move_3x2` table
for the 3×2 end-of-row/column corner) to get the single next gap-move, and
returns a **one-step plan**: `{ move: {type:"move", x, y}, explanation:
"Slide tile N", highlights }`. No `hintKeepTrack` — once the player moves, the
displayed hint clears and the next request recomputes from the new position.
This matches upstream's one-move-per-`h` behaviour exactly and avoids the
full-plan narration/tracking Sixteen needed. The greedy solver is also the
basis of a behavioural test: from any solvable board, repeatedly applying the
hinted move reaches the solved state within the upstream `5·n³` bound.

### D5 — `solve()` snaps to solved (upstream semantics)

`solve()` returns `{type:"solve"}`; `executeMove` replaces the grid with the
solved permutation (`tiles[i] = (i+1) % n`, gap at `n−1`), sets
`usedSolve = true` (which suppresses the completion flash and switches the
status bar to "Moves since auto-solve: k"). This is upstream's behaviour: Solve
is "reset to a clean solved board to practise manoeuvres", not a replay of the
player's optimal path.

### D6 — Generator: faithful parity-corrected placement

Port `new_game_desc`: place all tiles except the last two at random
(`randomUpto`), then choose the last two so the whole permutation's parity
matches the required parity (chessboard parity of the gap cell ⊕ parity of
`n`), rejecting an already-solved layout. `random.ts` is bit-identical, so the
same seed reproduces C's board; correctness is locally testable (every
generated board satisfies `PARITY_S == perm_parity`, i.e. is solvable), so the
differential check is **advisory/deferred** (like Cube — no solver or
uniqueness loop to stress).

### D7 — Rendering: two-pass slide animation + per-tile cache

Port `game_redraw`: a one-time recessed bevelled border, then per-tile drawing
in two passes so a whole sliding line animates cleanly — pass 0 blanks the
cells vacated by moving tiles, pass 1 draws each moving tile interpolated one
cell from its old position toward the gap. Keep the upstream `ds.tiles` +
`ds.bgcolour` per-tile cache (redraw a tile only when it changed, is animating,
or the flash background changed). Bevelled tiles, centred number, completion
flash (`2 · FLASH_FRAME`, genuine completion only). Cache key is plain
`Int32Array` of tile values (per the documented "no `BigInt64Array`" guidance).

### D8 — File layout

- `state.ts` — params, state, `FifteenMove`, params/desc codecs, the
  parity-corrected generator, `textFormat`, completion + parity helpers.
- `solver.ts` — `computeHint` + `nextMove` + `nextMove3x2` (the hard-coded
  120-byte endgame table). Extracted because the table + branchy `next_move`
  warrant their own module and own focused test.
- `index.ts` — `Game` glue, `interpretMove`, `executeMove`, `redraw`, the
  `hint()` wrapper around `computeHint`, and `registerGame`.

Mirrors Sixteen's `index.ts` + `state.ts` split with the solver pulled out.

## Risks / Trade-offs

- **`next_move` / `next_move_3x2` fidelity.** The greedy solver is the one
  genuinely intricate piece (hard-coded table, many branches, axis-flipping
  recursion for the last column). Mitigation: copy the 120-byte table verbatim,
  port `next_move` branch-for-branch, and gate it with a solver test that
  drives random solvable boards to completion within `5·n³` moves — the same
  invariant upstream's `STANDALONE_SOLVER` asserts.
- **Animation direction on multi-cell slides.** Each tile moves exactly one
  cell per slide, so interpolation is simpler than Sixteen's toroidal wrap;
  the risk is low. A render test asserts a mid-animation frame draws moving
  tiles at interpolated coordinates.

## Migration Plan

Per the standard parity-gated split: implement + test + register + dev-verify;
flip `TS_PORTED` in CMake and delete `fifteen.c` only on owner acceptance; then
archive. The empty-registry / C-fallback path covers Fifteen until acceptance.

## Open Questions

- None blocking. (If the owner later wants the arrow-semantics preference, it
  rides on a future engine prefs hook, not this change.)
