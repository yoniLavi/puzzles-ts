# Design: Same Game TS port

## Context

Same Game is the simplest remaining game by porting risk: no solver, no
animation, a comma-separated-colours desc. The only genuinely intricate piece is
the guaranteed-soluble generator (`gen_grid`), which builds a board by playing
the game *backwards* — repeatedly inserting a two-square blob and verifying that
removing it would reproduce the previous grid. The rest is a thin selection UI, a
gravity/compaction step, and a score.

This design records the decisions that are non-obvious; everything else follows
the established port pattern (immutable state, GC not dup/free, discriminated
moves, packed-bits `Int32Array` render cache, gated frozen-snapshot differential
test).

## Decisions

### D1 — State shape: a flat colour grid + score + two flags

`SamegameState = { w, h, ncols, scoresub, tiles: readonly number[], score,
complete, impossible }`. `tiles[y*w+x]` is the colour (0 = empty, 1..ncols).
Mirrors C's `game_state` exactly. `tiles` is a frozen plain array (the grid is
small; a typed array buys nothing over the differential-checked clone, and a
plain array serialises directly through the default move/save codec). `score`,
`complete`, `impossible` are recomputed by `executeMove`, never mutated.

`scoresub` and `ncols` live in the state (copied from params at `newState`),
because the score formula and the redraw both need them and the state is what
flows to `executeMove`/`statusbarText`/`redraw`.

### D2 — Selection lives in the Ui, not the State (upstream `game_ui`)

`SamegameUi = { selected: boolean[]; nselected: number; xsel, ysel: number;
displaySel: boolean }`. `selected[i]` marks tiles in the currently-picked region.

This is the crux of the two-click interaction and is exactly upstream's split:

- **First click on a removable tile** (part of a same-colour group of size ≥ 2):
  `interpretMove` clears any prior selection, flood-selects the connected
  same-colour region into `ui.selected`, sets `ui.nselected`, and returns
  `UI_UPDATE` (redraw + status-bar update, no history entry).
- **Second click on a selected tile**: `interpretMove` emits the `remove` move
  carrying the selected indices, and clears the selection.
- **Right-click / `CURSOR_SELECT2` on a selected tile**: clear selection
  (`UI_UPDATE`).
- **Click on a 0 tile or a lone tile**: no selection (returns `null` for empty;
  a lone tile cannot form a group so selection collapses).

The midend already (a) passes `this.ui` to `interpretMove` and lets the game
mutate it in place, (b) recomputes the status bar on the `UI_UPDATE` path, and
(c) calls `changedState(ui, old, new)` after every *real* transition (move/undo/
redo/restart/new-game) but never on `UI_UPDATE`. So `changedState` clears the
selection (upstream `game_changed_state` → `sel_clear`) and nothing else is
needed. **No engine change.**

Rationale for keeping selection in the Ui (vs folding it into state): it must
*not* be an undoable history entry — selecting a group then changing your mind is
not a move — and it must reset across undo/redo, which is precisely
`game_ui` + `game_changed_state` semantics. Guess established the
mutate-ui-in-`interpretMove` pattern; Same Game reuses it.

### D3 — The `remove` move carries explicit indices

`SamegameMove = { type: "remove"; tiles: number[] }` — the sorted list of grid
indices being cleared (upstream's `M12,13,18,...` string). Carrying the indices
(rather than re-deriving the region from a click point in `executeMove`) keeps
`executeMove` pure and independent of the Ui, and makes the move
self-describing for the save file (default JSON codec, no custom
serialise/deserialise). `executeMove` validates each index in range, zeroes
those tiles, adds `npoints(scoresub, n)` to the score, runs the
gravity/compaction (`sg_snuggle`), and recomputes complete/impossible
(`sg_check`).

`executeMove` does **not** re-verify that the indices form a single connected
same-colour region of size ≥ 2: upstream's `execute_move` doesn't either (it
trusts the move string and only range-checks). The connectivity invariant is
enforced at `interpretMove` time. A hand-crafted illegal move string could score
oddly, but that is upstream-faithful and not reachable through the UI; the save
codec round-trips our own moves.

### D4 — Score formula and status bar

`npoints(scoresub, n) = max(0, n − scoresub)²`, `scoresub ∈ {1, 2}`
(`(n−1)²` or `(n−2)²`). `statusbarText(state, ui)` reproduces upstream's
`game_redraw` status string exactly:

- complete → `"COMPLETE! Score: N"`
- impossible → `"Cannot move! Score: N"`
- selection active → `"Score: N  Selected: K (P)"` where `P = npoints(scoresub,
  K)`
- otherwise → `"Score: N"`

`wantsStatusbar = true`. Because the selection branch depends on `ui.nselected`,
the status text is recomputed on `UI_UPDATE` — which the midend already does.

### D5 — Gravity + compaction (`sg_snuggle`)

Two passes, faithful to C: (1) within each column, let non-empty tiles fall to
the bottom (repeatedly swap an empty cell with the non-empty cell above it until
stable); (2) shuffle whole columns left so empty columns collect on the right.
Implemented on a mutable copy inside `executeMove`, then frozen into the new
state. Straightforward; called out only because the column-compaction is easy to
get subtly wrong (it operates on whole columns, not individual tiles).

### D6 — Generators ported faithfully; desc is the differential anchor

Both generators are ported line-for-line in intent (idiomatic TS, not a
control-flow transliteration), because the desc must be **byte-identical to C**
for a fixed seed — that is the entire differential check, and Same Game's
generator consults no solver, so the grid *is* the whole desc (cf. Flip CROSSES,
Flood's "grid + par" but here there is no par). The soluble generator
(`gen_grid`) is the intricate one:

- seed the bottom row/column with 2 or 3 squares of one colour (parity of `w*h`);
- repeatedly: build the list of legal insertion points (within columns + new
  columns), shuffle it via `random_upto`, and try each until one yields a
  *verified* inverse move — pick a colour distinct from neighbours, extend the
  blob left/right/up (vertical added twice to debias), reject placements that
  create odd-area sub-regions that can't be completed, then verify that removing
  the new blob reproduces the prior grid and that the blob is a single connected
  component (BFS);
- stop when no insertion point remains; retry the whole board if any cell is
  still empty.

Every `random_upto` call must occur in the same order as C, including the
shuffle-and-consume of the insertion list and the neighbour-colour exclusion, or
the desc diverges. The gated differential test is what proves this.

`gen_grid_random` (the `r` legacy path) is trivial: place two of each colour at
random empty cells, then fill the rest at random.

### D7 — Rendering: joins so a region paints seamlessly

`redraw` mirrors `game_redraw`: a one-time recessed-border polygon pair, then
per-tile draw with `JOINRIGHT`/`JOINDOWN`/`JOINDIAG` flags so that a tile the
same colour as its right/down/diagonal neighbour fills the inter-tile gap,
making a connected region read as one solid block. Selected tiles draw with a
`COL_SEL` (white) outer border and the colour inner; an impossible board recolours
inners to `COL_IMPOSSIBLE` (black) within a coloured outer; the keyboard cursor
draws a `TILE_HASSEL` inset square. The per-tile render cache key packs colour +
the join/select/impossible/hassel flags into an `Int32Array` (the
packed-bits-in-`Int32Array` pattern, **not** `BigInt64Array`, per the standing
guidance). Flash: `flashLength` returns `2 * FLASH_FRAME` on a newly
complete-or-impossible transition; `redraw` alternates the background between
`COL_HIGHLIGHT`/`COL_LOWLIGHT` per frame.

### D8 — `status()` is solved-or-ongoing; "impossible" is not "lost"

`status(state) = state.complete ? "solved" : "ongoing"`. Upstream `game_status`
returns +1 for complete and 0 otherwise, explicitly *not* −1 for a no-moves
dead-end ("assumed to be rescuable by Undo"). So Same Game never reports
`"lost"`, and the impossible state is surfaced only through the status bar and
the `COL_IMPOSSIBLE` recolour. This is why `findMistakes` is absent (D in
proposal): impossibility is a position, not a flaggable error.

### D9 — Omitted upstream frontend-only helpers

`current_key_label` and `game_get_cursor_location` are upstream frontend
adapters, not part of the TS `Game` contract (same call as Guess D10/Flood); both
are omitted. The keyboard cursor still works via `interpretMove`'s cursor-move
and cursor-select handling.

## Risks

- **R1 — Generator RNG fidelity.** The soluble generator makes many `random_upto`
  calls in a precise order; a single divergence breaks desc equality. Mitigation:
  the gated differential test over several presets × seeds, byte-for-byte, is the
  acceptance bar for the generator. If a preset proves flaky to reproduce, narrow
  the snapshot to the reproducible seeds and log it — never loosen the comparison
  silently.
- **R2 — Status-bar recompute on UI_UPDATE.** Confirmed already wired
  (`midend.ts` `processInput` → `afterTransition` → `emitStatusBar`, and the
  `UI_UPDATE` branch calls `afterTransition`). A midend test asserts the status
  text updates on a selection-only `UI_UPDATE`.
