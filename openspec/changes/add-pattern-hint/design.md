# Design — Pattern hint

Read [`docs/porting/hint-authoring.md`](../../../docs/porting/hint-authoring.md)
first; this records only the Pattern-specific decisions. Exemplars: Filling
(grouped multi-cell deduction, §5.5), Range (inline solver recorder), Palisade
(clue/region premise shading).

## D1 — Hint model: named line techniques, one firing = one multi-cell step

Pattern's deductions are per-line and force a *set* of cells at once, which is
exactly the Filling grouped-step model (§5.5). The line solver
(`doRow`/`doRecurse`) already computes a line's forced cells by intersecting all
legal run placements, but it returns them **without a reason**, which can't meet
the "teach the technique" bar (§2.2). So the hint decomposes the line deduction
into the recognisable named techniques, each producing a **single-colour** forced
set and a teachable narration:

| technique | forces | indication (lead) | why |
| --- | --- | --- | --- |
| **Overlap** | black | "clue run longer than its slack" | a run longer than the free play in its line must cover the middle cells no matter how it slides |
| **Completion** | white | "this line's clue total is all placed" | every black run is accounted for, so the rest of the line must be white |
| **Unreachable gap** | white | "a gap too small for any remaining run" | no remaining run fits the gap, so it must be white |
| **Edge / anchor extension** | black (+ bounding white) | "a black cell pinned against an edge / wall" | the touching run is anchored, extending it and walling its end |

Each firing → one `HintStep` whose `Move` is a single `fill` (or a small set of
fills) over that technique's forced cells, all highlighted as targets. A
**single-cell fallback** (run the existing line solver, take its first newly
forced cell) covers any cell no named technique grouped, so the plan always
*completes the board* (test: "every generated board's plan solves it"). Plan =
apply a firing, recompute on a working board, repeat — so each step's narration
and shaded line reflect the board as it fires (Range's per-step grid).

Open question for implementation: whether to keep each technique's forced set
**single-colour per step** (cleaner narration, more steps) or group a whole
line's mixed black/white forced cells into one step and narrate both (fewer
steps, denser). Default to single-colour-per-step for §1B glance-ability;
revisit if it feels too granular in dev.

## D2 — Recording mode in the solver (gated, byte-safe)

Thread an optional `record(cells, value, technique, premise)` callback through
the line solver, built **only on the hint path** and gated (`if (recorder)`), so
the generator's hot solve path is byte-for-byte unchanged — re-run the
`pattern-differential` byte-match to confirm (the §4.3 discipline; Range/Singles
precedent). `premise` carries the line index/orientation, its clue, and the
already-marked cells the deduction leans on.

## D3 — Colour legend (guide §5.3/§5.4)

Pattern has no pencil notes (§9 N/A) — it is a direct-deduction hint like
Range/Palisade. New row for the §5.3 table:

- **Forced cells** (black- or white-forced alike) → `COL_HINT`, highlight only,
  **never pre-filled** (§5.1) — the narration says black vs white. Equivalent
  forced moves share the colour (rule 3).
- **The clue + the line of sight** → `COL_HINT_CELL` shade (a *number*/region
  premise — shade, don't ring, §5.4), so the player sees which line and clue.
- **Constraining placed marks** → ringed: a cited **black** cell
  `COL_HINT_BLACKREF` (teal), a cited **white** cell `COL_HINT_WHITEREF`
  (violet) — the cross-game decided-colour legend; the fill must not hide the
  cell's own colour (§5.4). Pair every colour with a non-colour cue; no colour
  names in the narration.
- Fold the hint bits into the per-cell `Int32Array` cache (port playbook §3.2);
  the existing `K_MISTAKE`-style sidecar pattern extends to hint bits.

## D4 — Engine hooks

- `hint(state)`: refuse (`{ok:false}`) when solved or when `findMistakes` is
  non-empty (couples to the overlay + banner, §4); else the computed plan.
- `hintKeepTrack`: a multi-cell step is `"completed"` when the player fills the
  last forced cell with the right value, `"onTrack"` (shrink the step in place)
  on partial progress, `"off"` otherwise (§5.5). `hint` ignores `aux`/`ui`
  (deductive game, no preference affects it).
- `refreshHintStep`: **likely not needed** — Pattern has no note-clearing side
  effects (§7.3 is for candidate games); a player move either follows the step
  (handled by `hintKeepTrack`) or drops the plan. Implement only if a multi-cell
  step can be partially resolved by an *unrelated* move; decide in implementation.

## D5 — Narration house & voice
Deductive game → necessity voice (§2.1): "…so these must be black", "…so it must
stay white". Lead with the indication (§2.2), keep it terse (§2.5), re-read clue
phrasings at the degenerate extremes (§2.7 — a clue equal to the line length, a
zero-slack run).

## Out of scope
- No new difficulty tiers (Pattern ships sizes only; all are line-solvable).
- No pencil-note UX (Pattern has none).
