## Context

The Hint System (`ts-engine` spec) already established the pattern for a
UI-only, ephemeral, game-computed overlay that the midend stores, passes
to `redraw`, narrates in the status bar, and clears on the next
transition. Mistake-checking is the same shape with a simpler lifecycle
(no plan, no step advancing — just "here are the wrong cells, shown
until you move"). Reusing that pattern keeps the engine coherent.

Galaxies' unique solution is fully recoverable: `solverState(clearedCopy,
Unreasonable)` associates every tile with its dot (the generator
guarantees unique solvability at the puzzle's difficulty). So "the
solution" needs no stored aux — it is recomputed on demand from the
dots, which are immutable clues.

## Goals / Non-Goals

- Goals: a reusable `findMistakes` engine hook with hint-like
  ephemerality; correct, unambiguous Galaxies mistake detection;
  a count the app shell (and later the Check-&-Save button) can act on.
- Non-Goals: the quick-save slot and the combined Check-&-Save button
  (next change); mistake detection for games whose every state is legal
  (Flip/Pegs/Sixteen — they simply omit the hook); "hint at the *first*
  mistake" or auto-fixing.

## Decisions

- **`findMistakes(state) → highlights`, ephemeral in the midend.** The
  game returns its own highlight list (typed via an optional 6th `Game`
  generic defaulting to `unknown`, so no existing port's `Game<…>`
  annotation changes). The midend stores it as `activeMistakes`, passes
  it to `redraw` (a new optional trailing param, like `hint`), and clears
  it on the same events that clear a hint. Count = list length.
- **Surface returns a count, displays as a side effect.** `findMistakes():
  number` mirrors `hint(): string | undefined` (compute + display + a
  return value). The count is what the shell narrates and what
  Check-&-Save will branch on. C/WASM games return 0.
- **`canFindMistakes` static flag**, like `canHint`/`canSolve`, gates the
  button. Absent hook ⇒ false ⇒ no button, no behaviour change.
- **Galaxies mistakes = contradiction with the recomputed partition.**
  Solve a cleared copy; build `soldot[tile]`. Flag tile T iff the player
  has associated T (`F_TILE_ASSOC`) to a dot ≠ `soldot[T]`; flag interior
  edge E (between t1,t2) iff the player set it (`F_EDGE_SET`) but
  `soldot[t1] === soldot[t2]` (a wall inside a single region). Unassoc'd
  tiles and unset edges are *incomplete*, not mistakes.
- **Indeterminate solve ⇒ no mistakes flagged.** If the cleared-copy
  solve does not yield a unique solution (only possible for a
  hand-entered non-unique board via Enter-ID, never a generated one),
  return empty — we cannot *prove* any cell wrong, so we flag nothing.
  Documented limitation; acceptable for the "save only when provably
  clean" contract (we never block on an unprovable board).
- **Highlight renders like the hint overlay**, until the next move. A
  red `COL_MISTAKE` outline for wrong-association tiles (a `DRAW_MISTAKE`
  flag folded into the packed 30-bit cache key at bit 30); a red stroke
  on wrong walls. The wall colour cannot fit the packed key (it is full),
  so a per-tile **wrong-edge mask** rides in a new `Int32Array` sidecar
  (mirroring the existing `dx`/`dy` sidecars) and is compared as an extra
  cache-miss condition, so a red wall appears and clears in lockstep with
  the overlay lifecycle.
- **Wall detection was wrongly deferred and is now in-scope.** The first
  cut of this change shipped associations-only, reasoning walls were a
  "secondary play surface." Owner testing disproved that: a wall-only
  board (no arrows) saved as clean. Wall detection is essential and folded
  back in here rather than split to a follow-up (the change is unaccepted;
  a separate change could not `MODIFY` a requirement not yet in the base
  spec anyway).

## Risks / Trade-offs

- Recomputing the solve on each check is O(solve) — fine (Galaxies solves
  in well under a frame for preset sizes; it is the same solver the
  statusbar difficulty diagnosis already runs).
- The 6th `Game` generic is defaulted, so it is invisible to existing
  ports; only Galaxies opts in. Verified by `tsc` across all four ports.

## Open Questions

- Whether to also narrate *why* a specific cell is wrong (e.g. "this tile
  can't reach its dot"). Out of scope here; the count + highlight is the
  v1. Galaxies' solver has the deductions to do this later if wanted.
