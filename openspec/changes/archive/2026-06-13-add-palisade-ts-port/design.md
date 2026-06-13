# Design: Port Palisade to TypeScript

## D1 — Border state: keep the `borderflag` byte encoding

Each cell carries a one-byte flag (`borders: Uint8Array`, length `w·h`):

- low nibble bits 0–3 = a **wall** is drawn on the U/R/D/L edge
  (`BORDER_U=1`, `BORDER_R=2`, `BORDER_D=4`, `BORDER_L=8`);
- high nibble bits 4–7 = a **no-wall mark** (the yellow ✗ "definitely no wall
  here") on that edge (`DISABLED(b) = b << 4`).

An edge is therefore three-valued — wall / no-wall-mark / unknown — exactly
upstream's `borderflag`. The encoding is kept verbatim (not renamed to objects)
because `interpretMove`/`executeMove` toggle individual bits, `isSolved` and
the renderer read them bitwise, and `bitcount[flags & BORDER_MASK]` is the
clue-satisfaction count. This is the Mosaic precedent ("renaming the bits buys
nothing; the constants are exported and named").

**Shared edges.** A wall between cells `i` and `j=i+dir` is stored on *both*
cells (`borders[i]` bit `dir`, `borders[j]` bit `FLIP(dir)`). Every edit toggles
both sides; `interpretMove` emits a two-entry edit list, and `executeMove`
applies each. `init_borders` sets the grid rim walls on the outer cells (these
are never toggleable — see D3).

## D2 — Moves as a discriminated union

```ts
type PalisadeMove =
  | { type: "edges"; edits: ReadonlyArray<{ x: number; y: number; flag: number }> }
  | { type: "solve"; borders: number[] };
```

- `edges` — XOR each `flag` into `borders[y*w+x]`. Upstream's `F x,y,flag`
  segments; an edit list (rather than a single edit) keeps the move general,
  though `interpretMove` always emits exactly the two sides of one edge.
  `executeMove` rejects (throws) an edit that would toggle a wall bit pointing
  off the grid — upstream's "No toggling the borders of the grid!" guard.
- `solve` — the full computed border array as a plain `number[]` (JSON-safe →
  default move codec, no custom `serialiseMove`). `executeMove` replaces
  `borders` and sets `completed = cheated = true`.

`executeMove` recomputes `completed` via `isSolved` after an `edges` move
(unless already completed) — upstream's per-move check.

## D3 — Solver: faithful DSF deductions; the six rules ported as-is

The solver is the substance. It operates on a `SolverCtx`
(`{ params, clues, borders, dsf }`) with the upstream edge primitives expressed
as small helpers:

- `connect(i, j)` → `dsf.merge`; `connected(i, j, dir)` → `dsf.equivalent`
  (computing `j` from `dir` when asked);
- `disconnect(i, j, dir)` → set the wall bit on both sides;
- `disconnected` → wall bit set; `maybe` → neither connected nor walled
  (ordering matters: `disconnected` is bounds-safe, `connected` is not — kept).

The six deductions port one-to-one (each documented inline against the C):
`connectedCluesVersusRegionSize` (idempotent, run once),
`numberExhausted`, `notTooBig`, `notTooSmall`, `noDanglingEdges`,
`equivalentEdges`, looped to fixpoint. `solver(...)` returns `isSolved(...)`.

`isSolved` builds the black-border DSF (regions cut by walls), checks every
region has size `k` and every clue equals its wall count, then a no-stray-border
pass (a wall whose two sides are still in the same black-border component is a
cheat). Used by `executeMove`, the generator, and the Solve command.

**`Dsf` additions.** The solver/`isSolved`/`divvy`/`redraw` need `dsf_size` and
`dsf_equivalent`, which the engine `Dsf` lacks. Add `size(i): number`
(size of `i`'s class, read at the canonical root) and
`equivalent(a, b): boolean`. Pure additions — the existing
`reinit`/`canonify`/`merge` and Galaxies/Pegs callers are untouched. (`Dsf`
already tracks `size` internally for union-by-size; `size(i)` just exposes the
root's value.)

## D4 — `divvy_rectangle` as a local idiomatic leaf

`divvy.c` (the equal-polyomino partitioner) ports to
`src/native/games/palisade/divvy.ts`, **local to Palisade** per the lazy-leaf
rule — Solo is its only other upstream consumer and is unported; promote to
`engine/` only when Solo lands.

The port keeps the algorithm faithfully (the `addRemCommon` 8-neighbour
simple-connectivity test; the per-iteration addable/removable scan; the BFS
square-stealing chain) over the shared `Dsf`, `shuffle`, and `randomUpto`.
Idiomatic TS shape: typed arrays for `own`/`sizes`/`addable`/`removable`,
discriminated return (`Dsf` on success, `null` on a failed attempt), and the
`divvyRectangle` retry loop. The `DIVVY_DIAGNOSTICS` prints are dropped; the
final cross-check `tmpdsf` verification is kept as a cheap dev assertion (it
guards the BFS invariant the comments rely on).

## D5 — Cursor + preferences: modern defaults only

Upstream exposes two preferences (`cursor-mode` half/full-grid;
`clear-complete-regions`). The TS `Game` interface has no prefs hook, so the
port hard-codes the modern defaults: the half-grid cursor (`ui.x/ui.y` in
`[1, 2w-1] × [1, 2h-1]`, where odd/even coordinates distinguish
centre/edge/corner) with the standard select behaviour, and no auto-clearing
of completed-region edges. This is a faithful render of upstream's
out-of-the-box behaviour; the legacy full-grid cursor and edge-clearing are a
documented, deliberate omission, recoverable when the engine grows a
preferences contract. (`Ui` therefore carries just `{ x, y, show }`.)

## D6 — Two complementary error signals: live render errors + `findMistakes`

Palisade has **two** error signals, which the port keeps distinct:

1. **Live render errors** (upstream) — a wall reddened when its region is too
   large, too small, or the wall dangles inside a single region — computed in
   `game_redraw` from the *current* borders (two DSFs: black-border regions and
   yellow/no-wall regions), independent of the unique solution. This is part of
   rendering and ports inside `redraw`; it fires continuously as you play.

2. **`findMistakes`** (our divergence) — a one-shot solution-contradiction check
   driving Check-&-Save: re-solve the clue set from the bare rim
   (`solver(...)` produces the unique solution borders for a generated board),
   then flag every edge where the player drew a wall the solution lacks, or set
   a no-wall mark where the solution has a wall. Returns
   `PalisadeMistake = { x, y, dir }` per offending directed edge (both shared
   sides are wrong symmetrically, so both surface). The midend's ephemeral
   overlay passes these to `redraw`, which folds them into the per-tile error
   bits so they redden exactly like live errors (same `COL_ERROR`); they clear
   on the next transition. If the solver can't uniquely solve the clue set
   (e.g. a hand-built non-generated board), `findMistakes` returns empty —
   "can't determine", never a false positive.

The `Game` is therefore generic over a sixth `PalisadeMistake` type.

## D7 — Rendering: per-tile `Int32Array` cache, the no-BigInt pattern

`newDrawState` allocates a `w·h` `Int32Array` flag cache initialised to `~0`
(force first paint). `redraw` packs each tile's draw-relevant state — the eight
border bits, the four `BORDER_ERROR` bits, `F_ERROR_CLUE`, `F_FLASH`, and the
9-bit `CONTAINS_CURSOR` mask — into one int and diffs against the cache, exactly
the Galaxies/Mosaic packed-bits pattern (the queued "no `BigInt64Array`" note).
First draw paints the grid-corner dots and the background; the engine emits no
pixels of its own (the Flip doctrine), so the per-tile background fill sits
behind a `ds.started` guard.
