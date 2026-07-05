# Design — add-signpost-ts-port

## D1: No new engine leaf — `dsf` is the only dependency

Signpost's state binds cells into regions with a disjoint-set forest and
reads `dsf_size` for region ordering. `src/native/engine/dsf.ts` already
provides this (`Dsf` — union-by-size, tie → second merge arg, matching
`dsf.c`). Signpost needs no `findloop` (it detects loops structurally via
the `next`/`prev` link invariants and `dsf_equivalent`, not Tarjan), no
`combi`, no `matching`, no `latin`. So this change adds **zero** engine
leaves and **zero** `ts-engine` requirements — a first for a logic-game
port since Galaxies, and part of why it is the straightforward pick.

## D2: Move / state model

`SignpostState` (immutable, cloned per move) holds `params`; `n = w*h`;
`dirs` (`Int8Array`, one of 0–7 per cell — the arrow, from the desc and
never changed by play); `nums` (`Int32Array`, the *derived* sequence number
per cell, 0 = none, recomputed by `updateNumbers`); `flags`
(`Uint8Array` — `IMMUTABLE | ERROR` per cell); `next`/`prev` (`Int32Array`,
−1 = absent — the player's chain links); a `Dsf` binding linked cells into
regions; `numsi` (`Int32Array` of length `n+1` — inverse of `nums`, −1 =
absent). The `dirs` and immutable `nums`/`flags` come from the shared frozen
desc parse; play mutates only `next`/`prev` (and the derived `nums`, `dsf`,
`numsi`, `flags & ERROR`). `cloneState` deep-copies the typed arrays and the
`Dsf` (cheap — no per-cell objects, no `free`).

Moves are a discriminated union mirroring the C move grammar:

- `{ type: "link", fromX, fromY, toX, toY }` — the C `"L%d,%d-%d,%d"`
  (connect `from`'s `next` to `to`); breaks any existing links the connect
  supersedes, exactly as `execute_move`.
- `{ type: "unlinkNext", x, y }` — the C `"C%d,%d"` (drag a "from" cell off
  the grid: sever its outgoing link).
- `{ type: "unlinkPrev", x, y }` — the C `"X%d,%d"` (sever incoming link).
- `{ type: "solve", dirs, nums, flags }` — the C `"S…"` full-desc solve
  applied atomically, setting `usedSolve`.

`interpretMove` returns `null` for out-of-grid mouse-downs and
`UI_UPDATE` for pure cursor / drag-tracking / no-op releases (C's
`MOVE_UI_UPDATE`), so those create no history entry. Validity is gated by an
`isValidMove` port (`ispointing` along the arrow, not same-region — that
would loop, number-adjacency where both ends are real numbers, and the
"can't move from the final / to the first immutable number" rules).

## D3: Region numbering + colouring (the fiddly part)

The visual identity of a partial chain is a coloured number gradient, and
matching it byte-for-byte on render is the main porting effort. Upstream
`update_numbers` walks the `next`/`prev` forest, and `head_number` /
`connect_numbers` assign each region a "colour group" and a starting offset
via `COLOUR(a) = a / (n+1)` and `START(c) = c*(n+1)` arithmetic, with a
documented four-case rule for how colours survive a merge (larger region
keeps its colour; blank-onto-numbered inherits; two-blank picks the lowest
unused group). The TS port replicates this arithmetic and the case order
exactly — the render reads `nums[i]` and its `COLOUR`/offset to pick one of
`NBACKGROUNDS = 16` background shades and the arrow mid/dim colour. Getting
the case order wrong yields a *playable* but *wrong-coloured* board, which
would fail owner acceptance — so this is covered by a tier-2.5 render
scenario asserting region colours after a sequence of links, not just by
"does it play."

## D4: findMistakes semantics

Boards this fork generates are uniquely solvable by the solver.
`findMistakes(state)` re-solves a copy carrying only the immutable clues; if
that yields a complete unique chain, flag every cell whose player `next`
link disagrees with the solution's `next` (`kind: "link"`). Cells with no
outgoing player link are never mistakes. If the board is not uniquely
solvable (a hand-typed desc), return `[]` — the same graceful degradation as
Galaxies/Slant. This is distinct from the live `FLAG_ERROR` overlay (D5):
errors flag *locally inconsistent* links (loops, number clashes);
`findMistakes` flags links that are locally fine but globally wrong, which is
what Check & Save must refuse a save on.

## D5: Live errors and completion (`check_completion`)

`executeMove` recomputes `flags & ERROR` and the `completed` latch exactly
as C's `check_completion`: a link is an error if it joins non-consecutive
immutable numbers, if a region carries two immutable numbers that don't
match its offset (`head_number` sets `impossible`), or if the chain is
otherwise contradictory; `completed` latches true when a single region of
size `n` covers `1 … n` with no errors. The `impossible` flag is carried on
state as upstream (a structurally broken chain the solver hit). Completion
suppresses the drag UI (`game_changed_state`).

## D6: Rendering

Direct port of the C per-tile drawstate. The drawstate keeps a per-cell
packed `Int32Array` (arrow dir, region colour index, number, immutable /
error / cursor / drag-origin / flash bits — all well under 31 bits) diffed
against the last-drawn copy (the playbook cache-key pattern; the whole word
is rebuilt each frame from state + ui + the findMistakes overlay, so every
overlay is in the diff key by construction — no sidecar). The **drag sprite**
uses a blitter (`blitter_new`/`save`/`load`/`free`), exactly as the Pegs
port already does — save the background under the sprite, draw the dragged
arrow following the pointer, restore on the next frame. Palette
index-for-index with the C enum: `COL_BACKGROUND, COL_HIGHLIGHT,
COL_LOWLIGHT, COL_GRID, COL_CURSOR, COL_ERROR, COL_DRAG_ORIGIN, COL_ARROW,
COL_ARROW_BG_DIM, COL_NUMBER, COL_NUMBER_SET, COL_NUMBER_SET_MID`, then the
four 16-entry ramps `COL_B0` (backgrounds), `COL_M0` (mid arrow), `COL_D0`
(dim arrow), `COL_X0` — generated by the same HSV sweep as
`game_colours`. The **win flash** is the C spin: cells rotate their arrows,
`FLASH_SPIN = 0.7`; the two pref modes are unidirectional vs meshing-gears
(alternate cells spin opposite ways). `anim_length` for a normal move
follows upstream (arrows don't animate between moves; only the flash spins).
The engine paints nothing; the `!ds.started` branch fills the background.

## D7: Params UI

`describeParams` emits the exact keys the `augmentation.ts` template reads:
`width`, `height`, and the `forceCornerStart` boolean. `paramConfig` mirrors
`game_configure`: `dimensionParamConfig()` (Width / Height strings) plus a
`C_BOOLEAN` "Start and end in corners", validated by `validateParams`
(min size, not 1×1). Decode keeps upstream leniency: `NxM`, square `N`,
trailing `c` for corner start. `augmentation.test.ts` guards that the
template has no unsubstituted `{field}`.

## D8: Byte-match differential

`new_game_desc` is deterministic given the seed: `new_game_fill` calls
`random_upto` per walk step (and re-rolls head/tail with `random_upto`),
`new_game_strip` calls `shuffle` on the index array then runs the solver in
a loop. No `qsort`, no wall clock, no impl-defined tie order (unlike
Undead). The TS port reproduces the C desc byte-for-byte for the same seed;
the differential asserts it via `describeDescDifferential` across all 6
presets plus non-preset sizes. This requires the TS `random_upto`/`shuffle`
call sequence to match C exactly — the `new_game_fill` head-then-tail
alternation and the `cell_adj` enumeration order are byte-load-bearing and
must be ported verbatim in control-flow shape (idiomatic *data structures*,
identical *RNG call order*).

## D9: Documented skips

- **No keypad** — upstream `game_request_keys` is NULL.
- **No `needsRightButton`** — the right button is a reverse-drag
  convenience (drag a chain's *incoming* link); the game is fully playable
  with the left button. (Revisit if owner wants the touch affordance —
  same pending app-shell item as Pattern/Unruly.)
- **No difficulty tiers** — Signpost has none (only `force_corner_start`).
- **No printing** (deleted at fork), **no supersede**, **no editor
  letters**, **no `current_key_label`** — same skips as every prior port.
- **`H`/`h` "hint" move** — commented out in upstream `interpret_move`; not
  ported. An explained hint is a separate future change (D-note: the single
  forced-link deduction is a clean hint candidate).
