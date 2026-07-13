# Design — add-netslide-ts-port

## Context

Netslide (Richard Boulton's cross between Net and Sixteen) is a `w × h` grid of
Net wire tiles. A tile's wires are a 4-bit mask (`R=1, U=2, L=4, D=8`). The
solved grid is a spanning tree rooted at the centre tile, so every tile is
connected to the centre; the generator then **slides** rows and columns
toroidally to scramble it, and the player slides them back. The centre row and
column are un-slidable (otherwise the centre tile itself would move and the
puzzle would be trivial to think about); moves are made by clicking arrows in
the border gutter outside the grid.

There is no solver: `solve_game` replays the generator's saved unshuffled grid
from `aux`.

## Decisions

### D1 — `tree234` maps onto the existing `SortedMultiset`; no new leaf library

The generator uses `tree234` in three places, and all three only need
"a sorted set with indexed access": `add234` (insert), `del234` (remove by
value), `delpos234` (remove by index — the RNG-driven pick), `count234`
(size), and `find234` (membership). `engine/sorted-multiset.ts` already
provides exactly this (`add` / `delete` / `removeAt` / `size`), was written
against upstream's `tree234` semantics, and is already the second-consumer
promotion from Flip + Pegs. So Netslide is a third consumer and needs **no new
leaf port** — the comparator is upstream's `xyd_cmp` (lexicographic on
`x`, then `y`, then `direction`), and the RNG draw sequence is unchanged.

This matters for byte-match (§D6): the set's *iteration order* is what
`random_upto(rs, count) → delpos234(i)` indexes into, so the comparator must
be exactly `xyd_cmp`. It is.

`find234`-then-`del234` collapses to a bare `delete(...)` — `SortedMultiset.delete`
is already a no-op when the element is absent, which is the same behaviour as
C's `if (xydp) del234(...)`.

### D2 — `c2pos`/`c2diff`/`pos2c` stay **game-local**

These three `misc.c` helpers implement the cursor that walks the ring of border
arrows (top row left-to-right, right column downwards, bottom row
right-to-left, left column upwards — a single cyclic coordinate of length
`2(w+h)`), plus the awkward corner turns. Grepping the whole C tree,
**netslide is their only consumer** — Sixteen has its own cursor model. The
playbook's rule is "promote to `engine/` when a *second* consumer appears", so
they live in `netslide/state.ts` for now. If Net (which has a similar border
cursor) is ported later and wants them, that is the promotion trigger.

The ring cursor additionally skips the centre row/column, since those cannot be
slid — upstream's `do { … } while (cur_x == cx || cur_y == cy)` loop, ported
as-is. (It terminates because the ring always contains at least one slidable
position for any legal `w, h ≥ 2`.)

### D3 — No `findMistakes` (and that is correct, not a gap)

Netslide is a **permutation puzzle**: every reachable board is legal, and the
solution is reachable from *any* board by sliding. There is no
"wrong-but-legal" state, so there is nothing for `findMistakes` to flag. Per
the playbook §3.5 carve-out ("a permutation puzzle with no notion of a
wrong-but-legal state correctly omits it"), the hook is absent and the app's
Check & Save control degrades to a plain Quick-save — the same behaviour
Sixteen, Fifteen and Twiddle already ship.

### D4 — Port the `NARROW_BORDERS` geometry variant

`cmake/platforms/webapp.cmake` defines `NARROW_BORDERS`, so the build the
browser actually shows uses

```
BORDER = 3 * TILE_SIZE / 4 + 1     /* arrow and gutter */
```

not the `#else` full-tile border. Parity is with what the C **web** build
displayed, so the port takes the narrow variant (playbook §3.2 — the lesson
Slant paid for). `TILE_BORDER = 1`, `WINDOW_OFFSET = 0`, preferred tile size
48.

Note the arrows are drawn on a full-tile-sized footprint that therefore
*overhangs* the narrow border slightly; that is exactly what the C web build
does, and it looks right.

### D5 — `computeActive` is order-independent; use a plain queue

Upstream floods outward from the centre using a `tree234` as its worklist and
pops with `delpos234(todo, 0)` — i.e. it visits in *sorted* order, not FIFO.
That is incidental: the result is a reachability **set**, and a flood fill's
reachable set does not depend on visit order. `computeActive` also never feeds
the desc, so it is outside the byte-match surface entirely. Ported as an
idiomatic array-as-queue.

Two upstream details are kept verbatim because they *are* semantics:

- The `moving_row` / `moving_col` arguments blank out a row/column that is
  mid-slide, so the powered highlight doesn't appear to leap across a line
  that is currently in motion.
- The guard is `x2 != moving_col && y2 != moving_row` — it tests the
  **destination** tile only, not the source. Faithfully preserved.

### D6 — Byte-match differential is feasible; take it

The desc is a pure function of `(params, seed)`: the generator's only
non-determinism is `random_upto`, and `random.ts` is bit-identical to
`random.c`. There is no `qsort` (the Undead §4.8 problem), and the only ordered
structure is the `xyd_cmp` sorted set reproduced exactly by D1. So the port
asserts `newDesc(params, randomNew(seed)).desc === fixture.desc` via
`describeDescDifferential`, over all 9 presets plus a couple of non-preset
shapes (wrapping on/off, a fractional barrier probability, an explicit
`movetarget`).

Three RNG-order details the port must get exactly right, in this sequence:

1. The spanning-tree growth loop (`random_upto(rs, count)` → `removeAt`).
2. The shuffle. Note its loop `for (i = 0; i < moves; /* incremented
   conditionally */)` — a rejected move (one that would undo the previous move,
   or repeat so often it becomes a shorter move the other way) **still consumed
   its RNG draws** and then `continue`s *without* incrementing `i`. Reproduce
   the draws and the rejection, not a cleaned-up version.
3. The barrier placement, which happens **after** the shuffle (upstream is
   explicit that this is deliberate: it means changing the barrier rate on the
   same seed keeps the same shuffled grid, and raising it yields a *superset*
   of the previous barriers).

### D7 — Right button is real input; do not fold it onto left

Playbook §3.8c warns that a touch long-press is delivered as `RIGHT_BUTTON`,
which breaks press-and-drag gestures — and the fix for a game with no secondary
action is to fold right onto left. **Netslide is not such a game**: the right
button reverses the slide direction (click an arrow with the right button and
the row slides the *other* way). It has no drag gesture at all, so the
long-press-for-secondary affordance is not a trap here, it is a feature — a
touch player long-presses an arrow to slide it backwards. Keep both buttons.

`MOD_STYLUS` needs no handling: the midend strips it (§3.8b), and
`engine/touch-input.test.ts` sweeps every registered game to prove it.

### D8 — Move encoding: a discriminated union, not the C move string

Upstream's moves are `"R<row>,<dir>"` / `"C<col>,<dir>"` / `"S<hexgrid>"`.
The port uses

```ts
type NetslideMove =
  | { type: "slide"; axis: "row" | "col"; index: number; dir: 1 | -1 }
  | { type: "solve"; tiles: readonly number[] };
```

so the type-checker covers the cases and `executeMove` needs no `sscanf`. The
move is structured-clone-safe, so the default save codec applies (no
`serialiseMove`).

`d` in the C move is a signed distance and `execute_move` validates
`|d| ≤ width/height`, but `interpret_move` only ever emits `±1` — the wider
range is dead. The port narrows it to `±1` (a single slide step), which is what
the game can actually produce, and keeps `executeMove` total.

### D9 — Barriers are immutable and shared across states

Barriers (and their corner-joining flags) are computed once in `newState` from
the desc and the wrapping flag, and never change. So the state holds a single
**frozen, shared** `Uint8Array` for barriers, cloned by reference on every
move — only `tiles` (the wire grid) is actually copied. This is the shared
frozen-matrix pattern Flip established.

### D10 — `%g` / `atof` for the float barrier probability

`encode_params` writes the barrier probability with `%g` and `decode_params`
reads it back with `atof`. `%g` is not `String(x)` — it is 6 significant digits
with trailing zeros stripped, falling back to exponential form outside
`[1e-4, 1e6)`. Since the desc-affecting quantity is
`floor(barrierProbability × candidateCount)`, an encode/decode round-trip that
changed the value would change the board. A small `formatG` helper in
`state.ts` reproduces C's `%g` for the range params can hold (`0 ≤ p ≤ 1`), and
decode uses `Number.parseFloat` with C `atof`'s "parse a leading prefix, else
0" semantics.

## Deliberate skips (stated, per playbook §1)

- **No hint** — a separate change, as with Sixteen. Netslide is non-deductive;
  the Inertia precedent (find the one thing the game can *prove* and lead with
  it) is the shape a future `add-netslide-hint` should take, not a
  "slide row 3" restatement of the move.
- **No `textFormat`** — upstream sets `can_format_as_text_now = false`.
- **No preferences** — upstream has no `get_prefs`/`set_prefs`.
- **No keypad** — upstream `game_request_keys` is NULL.
- **No supersede, no editor letters, no printing.**
- **Direct drag-to-slide** (the deliberate divergence Sixteen gained in
  `add-sixteen-drag-to-slide`) is *not* in this change. It is a natural
  follow-up and would be a good one, but the base port stays faithful first so
  the parity gate has an unambiguous subject.
