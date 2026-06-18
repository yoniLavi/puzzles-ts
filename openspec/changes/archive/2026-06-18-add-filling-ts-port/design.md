# Design: Filling (Fillomino) TS port

## Long-tail-risk pre-flight (all clear)

Read `puzzles/filling.c` against the playbook's checklist:

- **`midend_supersede_game_desc`** — not used. Filling never rewrites its desc.
- **Undo via state-string equality** — not used. No-op suppression is local and
  decidable: `interpret_move` only emits a move for cells whose value actually
  changes; we return `null`/`UI_UPDATE` otherwise. Completion is a pure
  function of the board (every cell's value equals its region size).
- **`#ifdef EDITOR` move letters** — none.
- **`printing.c`** — Filling has a `game_print`, but printing has no TS
  replacement fork-wide and is out of scope for every port so far. Not ported.

## Cell semantics

A cell holds `0` (EMPTY) or `1..9`. The puzzle's numbers never exceed 9 because
the generator caps region sizes at `maxsize = min(max(max(w,h),3), 9)` (the
`max(...,3)` is the documented `w=h=2` special case — a 2×2 board needs a region
of size 3). `clues[i] != 0` marks an immutable given; a cell with `board[i] != 0`
but `clues[i] == 0` is player-filled (rendered green). `board` is the mutable
player grid (cloned per move as a `Uint8Array`); `clues` is immutable and shared
by reference across a game's states (upstream's refcounted `shared->clues`).

## Move model

Upstream `interpret_move` emits `"i1,i2,..._v"` — set every listed cell to value
`v` (0 clears). We model this as a discriminated union:

```
FillingMove =
  | { type: "set"; cells: number[]; value: number }   // multi-cell fill
  | { type: "solve"; board: string }                  // digits, one per cell
```

`cells`/`board` are JSON-safe so the default move serialisation round-trips.
`executeMove` clones the board, writes `value` into each listed cell (validating
bounds and `0 ≤ value ≤ 9`), and recomputes completion via a fresh region DSF.

## Selection UI (the fiddly part, ported faithfully)

The `Ui` carries `{ sel: Set<number> | null, cx, cy, curVisible, keydragging }`
(upstream `sel`/`cur_x`/`cur_y`/`cur_visible`/`keydragging`). `interpretMove`:

- **Left-click** clears the selection then (if in-grid and not a clue) selects
  the clicked cell; **left-drag** extends the selection. `curVisible = false`.
  → `UI_UPDATE`.
- **Cursor move** shows the cursor and moves it (clamped, no wrap); if
  `keydragging`, also selects the new cell. → `UI_UPDATE`.
- **CURSOR_SELECT** toggles `keydragging` (reveals the cursor first if hidden);
  entering drag mode selects the current cell. → `UI_UPDATE`.
- **CURSOR_SELECT2** toggles selection of the current cell; if the selection
  becomes empty it is dropped. → `UI_UPDATE`.
- **Esc** clears the selection. → `UI_UPDATE`.
- **A digit `0`–`9`** (backspace ≡ `0`) sets value `v`; rejected (`null`) if
  `v > (w==2&&h==2 ? 3 : max(w,h))`. The targets are the selection, or — with no
  selection — the cursor cell if visible. Clue cells and cells already holding
  `v` are skipped. If any cell would change, emit a `set` move; the midend's
  `changedState` clears the selection (upstream `game_changed_state`). With no
  resulting change the selection is still cleared (→ `UI_UPDATE`) or nothing
  happens (→ `null`).

Because `changedState` clears `sel`/`keydragging` after every real move, the
selection never persists across a fill — matching upstream. The midend already
calls `changedState` on every transition; we implement it to null the selection.

## Solver shape (confluent ⇒ idiomatic, not a transliteration)

Every deduction only fills an empty cell with a *forced* value, so the solver is
**confluent**: the final filled set is independent of the order techniques fire.
We therefore port the four techniques idiomatically (a `FillingSolver` class
owning a mutable `Int32Array` working board, a `Dsf` of filled equal-valued
regions, and an `nempty` counter) and iterate to fixpoint, without mirroring C's
`connected[]` cyclic-linked-list iteration order. The verdict (fully solved vs
stuck) the generator's minimisation depends on is identical to C's because both
reach the same fixpoint.

The four techniques (`filling.c` `learn_*`):

1. **blocked-expansion** — for each incomplete region, collect its empty
   neighbours into which growth keeps `expandsize ≤ value`; if exactly one such
   cell exists, fill it (the region's only legal growth).
2. **expand-or-one** — for each empty cell: if a neighbouring incomplete region
   *must* include it to reach capacity (`!checkCapacity(region, blocked=cell)`),
   fill it with that region's value; else if the cell has no empty neighbour and
   no neighbour's value can legally extend into it, it must be its own size-1
   region → fill `1`.
3. **critical-square** — for each region with slack `s = value − size > 0` and
   each empty cell within Manhattan distance `s` of the region, if the region
   can't reach its size without that cell (`!checkCapacity`), fill it.
4. **bitmap deduction** — build a per-cell bitmap of still-possible numbers:
   start all-of-1..9, clear a filled cell's number from its neighbours, winnow
   connected components too small to host a brand-new n-region, then BFS out
   from existing n-regions to re-admit reachable cells; any cell left with a
   single possible number is filled. This is the technique that infers *ghost
   regions* (a region with no clued cell).

Helpers ported: `expandsize(cell, n)` (size if `cell` joined value-`n` regions,
adjacent roots deduped), `checkCapacity(cell, blocked?)` (flood from a filled
cell over empty/same-value cells, treating an optional cell as a wall, returns
whether the region can still reach its number). The flood uses an explicit
visited array — no negative-sentinel board mutation (the C `flood_count`
idiom) — which is cleaner and avoids the `SENTINEL` collision dance.

`solve(board)` returns `{ solved, board }`; `solve_game`/`findMistakes`/the
generator all call it.

## Generator shape (byte-faithful to C)

`makeBoard` mirrors `make_board` exactly so the RNG draw sequence matches:
`board = [0..sz)`, then at `retry:` shuffle it and union-merge: for each cell in
shuffled order, if it conflicts with an equal-size neighbour region, merge with
the smallest neighbour region that wouldn't overflow `maxsize`, **gated by
`randomUpto(rs, 10)`** (the 90%-accept draw is taken only when
`neighbour_size < min`, short-circuit order preserved); if a conflict can't be
fixed, `goto retry`. The per-cell `shuffle(directions, 4)` happens for *every*
cell each pass (3 RNG draws each), as in C. Then `board[i] = region size` and
`mergeOnes` absorbs every size-1 region into a non-maxsize neighbour.

`minimizeClueSet` mirrors `minimize_clue_set`: its only RNG is **one**
`shuffle(shuf, sz)`. The region partition is computed once from the full board;
we then walk `shuf` in order, and the first time we meet each region try
blanking the whole region (kept only if `solve` still solves), then walk `shuf`
again blanking individual cells. Order and grouping match C, so the surviving
clue set — and thus the encoded desc — is byte-identical.

`newDesc` run-length-encodes the survivors (`encodeRun`: `'z'` per 26, then
`'a'-1+run`; digit `value+'0'`).

## Render shape

Per-tile `Int32Array` cache keyed on `(value | flags << 4)` (upstream's
`ds->v`/`ds->flags`). Flags: the eight border bits (U/D/L/R + four corners),
`HIGH_BG` (selected), `CORRECT_BG` (region size == value), `ERROR_BG` (size >
value, or a fully-boxed-in incomplete region), `USER_COL` (player-filled →
green digit), `CURSOR_SQ`. Borders between two cells are drawn when the cells
differ **and** (both are filled, or either's region is complete/overfull) —
exactly upstream's `draw_grid`. The error overlay is recomputed each frame from
a fresh region DSF (live error display, like Range/Mosaic/Unruly).

The engine paints no pixels of its own: the `!ds.started` branch draws the black
grid frame (`COL_GRID`) and each cell fills its own background. Palette mirrors
the C enum index-for-index (`0 BACKGROUND, 1 GRID(=CLUE black), 2 HIGHLIGHT
0.7·bg, 3 CORRECT 0.9·bg, 4 ERROR (1, .85·bg.g, .85·bg.b), 5 USER (0, .6·bg.g,
0), 6 CURSOR 0.5·bg`); `COL_BACKGROUND` is the frontend default background, as
in C (Filling has no near-white tiles, so no `mkhighlightSpecific` is needed).
Completion flash (`FLASH_TIME = 0.4s`) clears the background flags in the first
and last thirds, matching `game_redraw`'s `flashy`.

## Cache-key bit budget

`value` (4 bits) + 13 flag bits = 17 bits, well under 31. `Int32Array`, never
`BigInt`, per the playbook. No sidecar array needed.

## findMistakes (deliberate divergence)

Re-solve from the immutable `clues` to the unique solution; every player-filled
cell (`board[i] != 0`) whose number differs from the solution is a `Mistake`
(`{ x, y }`). Returns `[]` when the clues aren't uniquely solvable (a loaded
`:desc`), faithful to "no detectable mistakes". Rendered with a distinct inset
error outline via a packed cache bit, like Unruly's mistake overlay.
