# Design: Adaptive mark-all (fill, then clean obvious)

## Decisions

### D1 — Trigger: fill the *note-less* cells, else clean (no "missing any candidate")

A press's branch is decided by whether any empty cell has **zero** pencil notes — NOT
"lacks any candidate." If some empty cell has no notes at all, the press **fills** every
note-less empty cell with all candidates `1..n` (today's behaviour — the button's namesake,
"show me everything"). Otherwise (every empty cell already carries notes) the press
**cleans**: strike each pencilled value that already sits as a *placed* value in one of that
cell's uniqueness regions. The "zero notes" trigger (rather than "missing any candidate") is
what makes the cleaned state stable — see D2.

### D2 — Idempotent, decided from the placed (non-pencil) grid; NO toggle (owner-confirmed 2026-06-28)

The owner is explicitly against a fill⇄clean toggle. Cleaning is therefore **idempotent**:
once the obvious candidates are gone, further presses are no-ops, and the board never
silently re-fills.

This falls straight out of D1's "zero notes" trigger without any new state: after a clean,
every empty cell still carries its non-obvious notes (≥ 1 on a mistake-free board), so no
cell is note-less → the next press takes the **clean** branch again → the obvious set is
already empty → empty `pencilStrike` → no-op. The result is a pure function of the placed
(non-pencil) values: the cleaned board is exactly "every empty cell noted with `{1..n}`
minus the values placed in its regions," and pressing repeatedly converges to and stays at
that state. "Obvious" is always judged against a *placed* value, never inferred from another
pencil mark, which is what keeps it placed-value-defined and idempotent.

**Mistaken-board guard:** if a cell's every candidate is region-eliminated (only possible on
an already-wrong board), the clean MUST NOT empty it — leave its last note. Otherwise that
cell would become note-less and the next press would re-fill, reintroducing oscillation on
exactly the pathological board. With the guard, idempotency holds unconditionally.

### D3 — Regions come from `extract-cell-region-helpers`

"Obvious" = a candidate equal to a placed value in one of the cell's uniqueness regions —
i.e. `findRegionDuplicate` generalised to *every* empty cell. Reuse that change's
`regionsOf(state, x, y)` so the cleanup, the hint basic-strike and the placement cull share
one region definition. Keen's regions are row+col only (cages aren't uniqueness regions);
get this wrong and the cleanup removes legal candidates.

### D4 — Deterministic via `pencilStrike`

The cleanup gathers the obvious marks across the board and emits one atomic `pencilStrike`
move (the existing hint move), with the marks computed at `interpretMove` time off the
current grid — the same "bake the decision into the move" rule as `set { autoElim }`, so
replay and undo are exact and `executeMove` stays pure. The fill path keeps emitting today's
fill-all move.

### D5 — Scope: row/col-uniqueness games only

Undead (monster placement, no row/col uniqueness) and any future non-Latin pencil game keep
fill-only. The adaptive behaviour is gated on the game supplying a `regionsOf` provider.

## Verification

- Tier-2.5 render/scenario or tier-1 move tests: from a fully-noted board, a mark-all press
  strikes exactly the region-duplicate candidates and nothing legal; on a partial board it
  fills. Keen: a cage-only duplicate (legal) is **not** struck. Undead: still fills.
- Determinism: replay the emitted `pencilStrike` reproduces the cleaned board.
