# Design — add-bricks-hint

## Context

Bricks' solver (`bricks/solver.ts`) is a pure contradiction solver:
`bricksValidate` is the oracle (COMPLETE / UNFINISHED / INVALID with localised
`FE_*` error flags), and `solveGame` drives two rungs to a fixpoint —
`solverTry` (Easy: tentatively set a cell to one colour; if the board is
INVALID, the cell is forced the other way) and `solverRecurse` (Normal/Tricky:
the same, but "does this lead to a contradiction?" is decided by a bounded
recursive solve). Every forced move is *proved* by a concrete rule violation, so
the solver already holds everything an explained hint needs — the hint is a
second projection of the same engine (the `ts-engine` narratable-deduction
doctrine). The engine's hint machinery (hooks, `ActiveHint` lifecycle, auto-hint
pacing, overlay rendering) already exists; Bricks is a new *implementer*.

## Decisions

### D1 — The hint replays the solver, one cell per step, from the player's board

`deduceBricksPlan(grid, w, h)` works on a clone of the **player's current board**
and finds the next forced cell exactly as `solverTry`/`solverRecurse` do, but
returns *one* forced cell at a time with its reason, applies it, and repeats —
so the plan is an ordered list of single-cell steps in deduction order. Easy
(single-cell) contradictions are searched first and only a stall falls to the
recursive rung, so simpler deductions are taught first and the recursive tier is
rare. The scan order is the solver's deterministic cell order, so the plan is
**recompute-stable** (bar rule 5): a hint recomputed after the player follows a
step continues where the previous plan left off. Each Bricks deduction forces
exactly one cell, so there are **no multi-leg journeys** — one deduction = one
step, none `continuesPrevious` (bar rule 2 is satisfied trivially).

To bound worst-case cost the plan is capped at `HINT_PLAN_MAX` steps
(the recursive rung is O(cells) sub-solves per stall); the player rarely follows
more than a few before diverging, and a recompute yields the next batch. The cap
is logged only in the sense that the plan simply ends — a fresh hint request
continues.

### D2 — Refuse rather than deduce from a doomed board (bar rule 5)

A hint is refused, with a banner, when:

- the board is already **solved** ("This board is already solved.");
- the board has a **rule violation** (`findMistakes().length > 0`) — the
  standard "fix the highlighted mistakes first" banner, since the live/Check &
  Save overlay already marks them;
- the board's marks **contradict the unique solution** without yet breaking a
  local rule (a wrong-but-legal shade/clear). This is the case Bricks'
  rule-validator `findMistakes` cannot see (design D7 of the port), so the hint
  re-solves the clues to the unique solution and compares the player's placed
  cells; on a mismatch it refuses ("A placed cell doesn't match the solution —
  undo and rethink; a hint can't help from a wrong position."). This is the
  honesty guarantee: never narrate a "forced" move that only follows from the
  player's own error.

Once past these guards the board is a consistent subset of the unique solution,
so every forced move the plan emits is provably correct.

### D3 — Narration: the Easy tier names the rule; the recursive tier is a proof by contradiction

The reason for an Easy forced cell is read straight off the `FE_*` flags of the
rejected trial (the one colour that made the board INVALID):

- **three-in-a-row** (`FE_LINE_*` around the target): *"Shading this cell would
  put three shaded bricks in a row — and no row may have three. So it must stay
  clear."* Evidence = the two already-shaded cells that complete the row.
- **unsupported** (`FE_ERROR` on the target itself, a shaded cell): *"Shading
  this cell would leave it with no shaded brick beneath it to rest on. So it must
  stay clear."* Evidence = the two cells below-left/below.
- **over-count** (`FE_ERROR` on a clue neighbour of a shade trial): *"Shading
  this cell would give the clue N here more than N shaded neighbours. So it must
  stay clear."* Evidence = the clue.
- **strand-support** (`FE_ERROR` on a shaded cell above + `FE_TOPLEFT/RIGHT` on
  an unshade trial's target): *"The shaded brick above rests only on this cell —
  clearing it would leave that brick unsupported. So it must be shaded."*
  Evidence = the stranded brick above.
- **under-count** (`FE_ERROR` on a clue neighbour of an unshade trial): *"The
  clue N here still needs more shaded neighbours and this is one of the last
  cells that can supply one — clearing it would make N unreachable. So it must be
  shaded."* Evidence = the clue.

When a trial fires more than one rule, a fixed priority (three → gravity →
count) picks the clearest to narrate.

The **recursive** tier narrates as an honest proof by contradiction: *"Suppose
this cell were shaded. Following the forced consequences leads to a contradiction
[ringed]. So it must stay clear."* (and the mirror for a forced shade). The
contradiction cells are the `FE_*`-flagged cells of the sub-solve's final INVALID
state, ringed as evidence. **v1 does not render the full propagation chain** (the
intermediate forced cells) — only the hypothesis target and the contradiction it
reaches; this still states premise → contradiction → conclusion (meeting "explain
why, not just what"), and showing the whole chain (cf. `add-clusters-hint`) is a
deliberate later enrichment, recorded here rather than silently omitted. The
Easy tier carries the great majority of steps, so the recursive narration is
occasional.

### D4 — Rendering: `COL_HINT` target fill + `COL_HINT_CELL` evidence ring, in the cache key

Two palette entries are appended after the port's `COL_CURSOR` (index-for-index
stability preserved): `COL_HINT` (blue) and `COL_HINT_CELL` (light blue),
matching the cross-game convention (Singles/Clusters). The hint step's
`highlights` carry the target index (drawn as a `COL_HINT` fill — the target is
an empty cell, so nothing is occluded) and the evidence indices (drawn as an
inset `COL_HINT_CELL` ring so a shaded/clued evidence cell keeps its content).
The forced colour is **not** pre-placed — the highlight says *act here*, the
narration says *which action* (owner convention). The per-cell hint role is
folded into the render cache word (a new bit field above the existing
error/cursor/flash bits) so the overlay repaints and clears exactly like the
mistake overlay (§3.2); the cross-game `hint-overlay.test.ts` guards that a hint
frame repaints an already-warm drawstate.

### D5 — `hintKeepTrack`

A move completes the current step when it paints the target cell to the hinted
colour (`"completed"`); any other move is `"off"` (the plan drops and the next
request recomputes). Bricks steps are single-cell, so there is no partial-subset
`"onTrack"` case to handle.

## Risks

- **Recursive-tier cost.** The lookahead rung runs O(cells) sub-solves per stall;
  the plan cap (D1) bounds it, and Easy deductions dominate. A `bricks-hint.test.ts`
  timing sanity check on the largest preset keeps it honest.
- **Wrong-but-legal refusal wording.** The refusal must not imply a *rule* was
  broken (it wasn't) — it says a placed cell disagrees with the solution. Tested.
- **Byte-match safety.** The recording pass is hint-only; `solveGame` and the
  generator are untouched, so `bricks-differential.test.ts` stays green (it does,
  and is re-run).

## Open questions for the owner

None blocking. The one deliberate scope choice is D3's recursive-tier narration
(hypothesis + contradiction location, not the full propagation chain) — flagged
for enrichment if the owner wants the Clusters-grade chain display on acceptance.
