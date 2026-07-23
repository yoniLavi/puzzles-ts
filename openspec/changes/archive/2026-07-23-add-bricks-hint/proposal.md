# add-bricks-hint

## Why

Bricks shipped its native-TS port (`add-bricks-ts-port`) **without** an explained
hint — per the standing rule that a Palisade-grade `hint()` is always its own
change. Bricks is a genuine deductive puzzle: its solver forces a cell's colour by
*contradiction* (colouring it one way breaks a concrete masonry rule — three in a
row, a brick left unsupported, a clue's neighbour count), which is exactly the kind
of reasoning an explained hint should teach. So it is a strong candidate to meet the
hint quality bar — every forced move has a crisp, narratable *why*.

This change adds `Game.hint()` / `Game.hintKeepTrack()` to Bricks, turning the
existing contradiction solver into a **second projection of one deduction engine**
(solver + hint), narrating each forced move by the rule its opposite colouring would
violate.

## What Changes

- **A recording deduction pass in `solver.ts`** — `deduceBricksPlan(grid, w, h)`
  reruns the contradiction deduction one cell at a time (Easy single-cell tier
  preferred, the recursive lookahead tier only at a stall), emitting an ordered
  list of forced moves each tagged with *which cell*, *which colour it is forced
  to*, and *the reason the opposite colour is impossible* — the concrete rule
  (three-in-a-row / a brick with no support beneath / an over- or under-filled
  clue) plus the evidence cells. The generator/solve path keeps using the
  non-recording `solveGame` unchanged, so the byte-match differential is untouched.
- **`hint()` / `hintKeepTrack()` in `index.ts`** — build a narrated `HintResult`:
  one journey per forced cell (each Bricks deduction forces exactly one cell, so
  there are no multi-leg journeys), the forced cell rendered as the `COL_HINT`
  target, the evidence cells ringed, and prose that states premise → contradiction
  → conclusion in the necessity voice. Refuse on a solved board, on a
  rule-violating board (`findMistakes().length > 0`, with the standard banner), and
  on a board whose marks contradict the unique solution without yet breaking a
  local rule (a wrong-but-legal mark — say a placed cell must be wrong rather than
  deduce onward from a doomed position).
- **Hint rendering in `render.ts`** — a `COL_HINT` target fill + a `COL_HINT_CELL`
  evidence ring, folded into the per-tile cache key (§3.2) so the overlay paints and
  clears like any other, guarded by the cross-game `hint-overlay.test.ts`.
- **The recursive (lookahead) tier** — when a cell is forced only by the
  `solverRecurse` rung, narrate it honestly as a proof by contradiction: the
  hypothesis (this cell shaded/clear), and the contradiction the forced
  consequences reach, with the cell(s) where the board breaks ringed. Design D3
  fixes the exact shape and whether the forced consequences are also shown.

Explicitly **not** in this change:

- **No new difficulty tiers / generator change.** Bricks is already guess-free at
  every tier (design D3 of the port), and generation gates every board on the same
  solver the hint replays, so every shipped board is crackable by the narratable
  deduction with no un-narrated fallback.

## Impact

- Affected specs: `bricks` (ADD a hint requirement).
- Affected code: `src/native/games/bricks/{solver,index,render}.ts` + tests
  (`bricks-hint.test.ts`, a render-scenario hint frame).
- No engine changes: the hint hooks, `ActiveHint` lifecycle, auto-hint pacing and
  overlay rendering all already exist; Bricks is a new *implementer*, not a new
  mechanism.
- Parity-gated like a port: owner acceptance before archive.
