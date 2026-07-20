# Design — add-slide-ts-port

## Context

Slide (Klotski) is one of upstream's `puzzles/unfinished/` experiments, but —
unlike the truly stubbed ones — it is a **finished, playable game** gated only
by `PUZZLES_ENABLE_UNFINISHED`. Its `interpret_move`, `execute_move`,
`game_redraw`, generator and solver are all real; the FIXMEs are generator
variety and graphics polish. So this is closer to an ordinary port than to the
"finish the frontend" work `separate` needs (playbook §1.1) — the frontend
exists and is good; the job is to port it idiomatically and decide catalog
inclusion.

The whole design turns on one insight the C header states: **two blocks of the
same shape are indistinguishable, so a board has a *canonical* byte encoding**
(anchor / main-anchor / distance-back-link / empty / wall per square), and the
solver is a plain BFS over those canonical layouts. Everything below follows
from that.

**Long-tail risk checklist (playbook §1) — clean.** Slide's `set_public_desc` is
`NULL` and it does not supersede its desc; it compares no stringified state for
undo (move-counting is local, D4); it has no `#ifdef EDITOR` move letters; and
`game_print` is an empty stub, so it makes no print promise. None of the
long-tail traps bite.

## Decisions

### D1 — Replace `tree234` with a keyed visited set + an array queue, not `SortedMultiset`

`solve_board` (`slide.c:412`) uses `tree234` in **two distinct roles** in one
function:

- `sorted` — the set of already-seen boards, with comparator `boardcmp` =
  `memcmp(a->data, b->data, w*h)`. This is used purely for **deduplication by
  exact board bytes**; the ordering is incidental (it exists only so the tree can
  find duplicates), never read out in order.
- `queue` — created with a **`NULL` comparator** and driven by `addpos234` /
  `delpos234(queue, 0)`. A `NULL` comparator means it is *not* an ordered set at
  all; it is an index-addressed list used as a **FIFO queue** (pop position 0).

So the idiomatic replacement is two ordinary structures, and neither is
`SortedMultiset`:

- **Visited set**: a `Set<string>` (or `Map<string, BoardNode>`) keyed by the
  canonical board encoding rendered to a compact string. BFS parent-pointers for
  solution reconstruction hang off the node stored in a `Map`. Dedup is exact-byte
  equality — precisely what `boardcmp` gives — so this is behaviour-identical.
- **Queue**: a plain array with a head index (or a small ring), popped from the
  front. `delpos234(queue, 0)` is `shift()`; the shortest-path property comes from
  FIFO order, which the array preserves.

This is *not* a byte-match-sensitive choice the way a `SortedMultiset` comparator
is (playbook §2.1): the solver's output — the minimum move count and the
reconstructed path — depends only on BFS order and exact dedup, both of which the
array+set reproduce. The `tree234`'s internal ordering never influences which
board is expanded next (the queue is FIFO, not sorted) nor the result. Record
that reasoning in `solver.ts` so a future reader does not "restore fidelity" by
porting `tree234`.

**Key encoding.** The canonical bytes are 0–255 per square; a `String.fromCharCode`
over the `Uint8Array` (or a `TextDecoder`-free join) gives a stable, cheap key.
The board is small (§Risks), so a per-node full-board key is acceptable; do not
prematurely hash.

### D2 — Slide is a movement puzzle: no guess-free obligation, no `findMistakes`

Slide is a **reachability/movement** puzzle, not a deductive one. Consequences,
each a deliberate scoping call:

- **No guess-free-generation obligation.** That policy binds logic puzzles
  (`feedback_guess_free_generation`); movement games (Sixteen, Fifteen, Netslide,
  Pegs) are explicitly exempt. Slide's "solver" is a shortest-path BFS, not a
  deduction ladder, and has **no difficulty tiers** — `maxmoves` bounds solution
  length, it does not grade technique.
- **No `findMistakes` / no Check-&-Save hard-block.** Slide has no notion of a
  wrong-but-legal state: *every* reachable board is legal, the player is simply
  closer to or further from the exit. There is nothing to flag as a mistake, so
  `findMistakes` is correctly omitted — exactly as the permutation games do
  (playbook §3.5: "a permutation puzzle with no notion of a wrong-but-legal state
  correctly omits it"). Check & Save degrades to a plain Quick-save, which is
  correct here.
- **The differential bar is byte-match-on-desc + solvability** (playbook treats
  Sixteen/Netslide this way): same seed → same board, and the TS solver agrees
  with the C on the minimum move count. That single pair of assertions validates
  the generator, the codec and the solver together (D6).

### D3 — There is no slide animation; correct the brief

The task brief assumed Slide "animates sliding blocks". It does **not**:
`game_anim_length` returns `0.0F` (`slide.c:2271-2275`). The visual feedback for a
move is entirely in `game_redraw`:

- while dragging, the picked-up piece is drawn **following the pointer** (lit up,
  `FG_DRAGGING`) and a **landing shadow** (`FG_SHADOW`) is drawn at the snapped
  reachable cell where it will come to rest;
- when a stored Solve path exists, the next piece to move is highlighted
  (`FG_SOLVEPIECE`);
- on completion, a three-interval **flash** plays (`FLASH_TIME = 3 ×
  FLASH_INTERVAL = 0.3 s`), the only thing `game_flash_length` returns non-zero
  for.

So `render.ts` needs: the per-tile piece rendering with light/shadow bevels, the
drag-follow + landing-shadow overlay driven off the ephemeral drag `Ui` (D5), the
solve-piece highlight, and the completion flash. It needs **no** interpolation
path and no `anim_length`. This is a display concern and outside byte-parity
scope; match the *look* (bevelled pieces, a visible landing shadow), not the
pixels, and prefer clean code (playbook §3.2 doctrine — the game fills its own
background, the engine paints no pixels of its own).

### D4 — Move model: a discriminated union, with the stored-solution machinery on state

Per the D5-of-Loopy precedent (and Pearl/Tracks/Map), model the move as a
discriminated union, not upstream's `"M%d-%d"` / `"S…"` move string:

```ts
type SlideMove =
  | { kind: "move"; from: number; to: number }   // anchor index from → to
  | { kind: "solve"; moves: ReadonlyArray<[number, number]> };
```

`interpretMove` builds these directly; `executeMove` applies them via a ported
`movePiece` (the linked-list walk of `slide.c:1423`). Two pieces of genuine
gameplay logic ride along and must be ported (they are *not* animation or
display):

- **The stored solution + spacebar stepping.** `solve()` returns a `{ kind:
  "solve", moves }`; `executeMove` records `soln` + `soln_index` **on the
  immutable state** (carried through `cloneState`, refcount-free in TS). Spacebar
  then emits the next `{ kind: "move" }` from that path, and `executeMove` advances
  `soln_index`, dropping the stored path if the player strays from it or finishes
  it (`slide.c:1548-1575`). This is Slide's built-in "watch the solution" feature
  and is part of the game, so it is ported, not dropped.
- **The move-counting quirks** (`slide.c:1527-1546`). Dragging the *same* piece
  again does not increment the counter; dragging it back to where it started
  *decrements* it (a multi-nudge slide counts as one move). This lives in
  `lastmoved` / `lastmoved_pos` on the state. It is independent of the engine's
  own undo stack — it governs the **displayed move count** (statusbar, D8), which
  is the metric `maxmoves`/`minmoves` are about — so it is ported faithfully.

### D5 — Input: drag with a reachability BFS on the ephemeral `Ui`

Slide's input is a three-phase drag, all of it on the `Ui` (ephemeral, not
serialised — mirrors upstream's `game_ui`), never on the state:

1. **Grab** (`LEFT_BUTTON` on a block): find the block's anchor, then BFS out from
   it to compute the **set of cells the block's anchor can be dragged to**
   (`ui.reachable`), respecting walls, other blocks and forcefields (only the main
   block may pass a forcefield). Emit `UI_UPDATE`.
2. **Follow** (`LEFT_DRAG`): convert the pointer to a target cell, then spiral
   outward by Manhattan distance to the **nearest reachable** cell and set
   `ui.dragCurrpos`. Emit `UI_UPDATE`.
3. **Release** (`LEFT_RELEASE`): if the anchor actually moved, emit
   `{ kind: "move", from: dragAnchor, to: dragCurrpos }`; otherwise `UI_UPDATE`.
   Clear the drag state.

Coordinate conversion uses the shared `fromCoord` (playbook §2.3): the pointer can
arrive fractional under `devicePixelRatio`, so round to an integer cell at the
boundary; Slide stores **cell indices**, never pixel coordinates, so this is the
only rounding needed. `BORDER = 0` (D7), so `fromCoord` is a plain floor.

The reachable-set BFS and the release-move helper are shared between
`interpretMove` and `render.ts` (the renderer draws the landing shadow at
`dragCurrpos`). If `render` importing them from `index` would form a cycle, split
them into `moves.ts` (playbook §3.2, the Signpost precedent).

### D6 — Generator: fixed main piece + fixed target, byte-match portable

`generate_board` (`slide.c:643`) is byte-match portable and is ported faithfully,
FIXMEs and all:

1. Fill the interior with singleton anchors inside a wall border.
2. Place the **main piece and the target at fixed positions** — upstream's FIXMEs
   say "vary this" but it does not, so the port matches the *current* behaviour
   (playbook rule 3: a weaker/less-varied generator is the curve upstream shipped,
   not a defect to fix). The main is a 2×2 near the top-left; the target and its
   two forcefield cells sit near the bottom-right.
3. Remove singletons in a fixed scan order until the board is soluble
   (`solve_board` gated by `movelimit`).
4. Build the list of inter-block edges, **`shuffle` it once** (the sole RNG draw
   after board setup), then walk it trying to merge the blocks either side of each
   edge, keeping a merge only if the board stays soluble; a `tried_merge[wh*wh]`
   matrix (a `Uint8Array`, small — §Risks) avoids re-attempting a pair.

The RNG surface is exactly the one `shuffle(list)`; `solve_board` is
deterministic. So the desc is a pure function of the seed and reproduces
byte-for-byte (D6 differential). Port the `tried_merge` matrix and the
dsf-canonical propagation (`slide.c:816-823`) verbatim — the merge decisions gate
solubility and therefore the desc.

The desc codec (`new_game_desc` / `validate_desc` / `new_game`) is the run-length
block encoding: `d<dist>` per distance square, an `f` prefix for a forcefield
cell, `a`/`m`/`e`/`w` (+ optional count) for anchor/main/empty/wall runs, then
`,tx,ty,minmoves`. `minmoves` is optional on read. Port it exactly; it is
byte-match surface.

### D7 — `BORDER = 0` under `NARROW_BORDERS`

`slide.c:1227-1231` compiles `BORDER = 0` when `NARROW_BORDERS` is defined, else
`TILESIZE/2`. `cmake/platforms/webapp.cmake` defines `NARROW_BORDERS` (the same
fact Loopy's D6a and the playbook §3.2 rely on), so this fork's build shows the
**zero-border** geometry. Port that arm: `computeSize` is `w*TILESIZE` by
`h*TILESIZE`, and `fromCoord`/`coord` use no border offset. Checked, not assumed,
because both arms are in the source.

### D8 — Statusbar: move count and minimum

Slide sets `wants_statusbar` and shows the move count against the generator's
`minmoves` ("N moves; target M"). Resolve during implementation the cheapest way
the engine already supports: if the `Midend` surfaces a status string the app
renders, feed it there; if not, decide whether the move count is worth a small
engine addition or is deferred to a follow-up (movement games like Sixteen
already display a move count — reuse whatever they use). Record which way it went;
do not invent a new statusbar mechanism for one game without checking what exists.

### D9 — Catalog inclusion is the owner's call (the one real open question)

Slide is an **unfinished upstream experiment**. The port makes it *runnable*, but
whether it becomes a **shipped catalog puzzle** (stage 2: the CMakeLists move +
`TS_PORTED` + C deletion) is a product decision, not a technical one.

**Recommendation: ship it.** It is complete and playable, its two icons already
exist in `src/assets/icons/`, and the owner has signalled appetite for finishing
the unfinished experiments (`separate`). Shipping it is consistent with "deliberate
divergence beyond upstream's feature set is the point of the fork."

**But it is flagged, not assumed.** If the owner would rather keep Slide out of
the catalog (e.g. until the generator variety FIXMEs are addressed), stage 1
still stands: the game is registered and TS-served, smoke-testable, with the
catalog move held. The two-stage parity gate already separates "registered and
verifiable" from "shipped in the catalog", so this decision rides that seam
cleanly.

A second, smaller open question for the owner: **which presets to ship.** Upstream
offers `7×6 max 25`, `7×6 no limit`, `8×6 no limit`. The move-limit presets make
generation slower (upstream notes this) but produce tighter puzzles. Default to
porting all three; the owner may trim.

## Risks

- **Solver memory/time.** The BFS visits every reachable canonical board, storing
  each as a full-board key. Upstream bounds practical board size by solver runtime
  alone (`MAXWID` is 251 in theory, unusable in practice); `validate_params`
  enforces only `w ≥ 5, h ≥ 4, w ≤ 251`. Keep the ported solver's per-node key
  compact and its queue an array (D1); do not add a difficulty knob. A pathological
  Custom size can be slow — that is upstream's behaviour, not a port regression.
- **The generator can be slow with a move limit.** Upstream's own TODO notes the
  move limit makes generation *slower*. This is inherent (each merge attempt runs a
  full BFS); it is not a bug to fix, and the differential must budget time
  accordingly rather than assume sub-second generation.
- **First movement port with a free-form drag + landing shadow.** The renderer is
  more involved than Sixteen's row-slide. Ship a tier-2.5 render-scenario test for
  the grab / drag-follow / landing-shadow / completion-flash frames.
- **Catalog decision (D9) is genuinely open** and gates stage 2. Stage 1 does not
  depend on it.

## Open questions for the owner

1. **Catalog inclusion (D9).** Ship Slide as a catalog puzzle now, or register it
   TS-served but hold the catalog move? (Recommendation: ship it.)
2. **Presets (D9).** Keep all three upstream presets including the move-limited
   one, or trim?
</content>
