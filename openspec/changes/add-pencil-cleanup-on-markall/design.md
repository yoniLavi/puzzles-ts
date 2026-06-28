# Design: Adaptive mark-all (fill, then clean obvious)

## Decisions

### D1 — Trigger: fill if anything is missing, else clean

A press computes the fill set first. If any empty cell lacks any candidate, the press
**fills** (today's behaviour) — so the first press on a fresh/partial board always fills,
and the player sees the full candidate grid. If every empty cell is already fully noted,
the press **cleans**: strike each pencilled value that already sits as a placed value in
one of that cell's uniqueness regions. This makes "fill then a second press cleans" fall
out naturally without a separate mode flag.

### D2 — Oscillation: cleaning is terminal for that press cycle (OPEN — owner to confirm)

After a clean, some cells no longer carry the full candidate set, so by D1 the *next* press
would fill again — a fill⇄clean toggle. Two options, to confirm with the owner during
implementation:

- **(a) Toggle (simplest, matches D1 literally):** press 3 re-fills, press 4 re-cleans.
  Predictable but a stray double-click "undoes" the cleanup.
- **(b) Idempotent clean:** once cleaned, further presses re-clean (no-op) until the player
  changes the board; never silently re-fills. Needs a way to tell "fully noted minus
  obvious" from "partially noted by the player," which is not locally decidable — likely a
  transient Ui bit (not serialised), which adds state.

**Recommendation: (a) toggle** — no new state, and the player can always re-fill; the
hint/auto-pencil paths already cover teaching. Decide before implementing; D1 is unaffected
either way.

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
