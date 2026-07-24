# Design — add-spokes-hint

## Context

Spokes' solver (`spokes/solver.ts`) is already a fixpoint over four rungs plus a
validator, and every rung reaches its conclusion by a stateable argument, not by
search. That is the whole precondition for a Palisade-grade hint: the engine that
proves a move can also *say* why (the `ts-engine` narratable-deduction doctrine —
solver and hint are two projections of one engine, never two implementations).

The rungs, in the order `spokesSolve` runs them:

| rung | what it concludes | why |
| --- | --- | --- |
| `spokesSolverOnes` | mark the spoke between two clue-`1` hubs | joining them satisfies both and seals them off as a closed pair of two, stranding everything else |
| `spokesSolverFull` | draw every remaining spoke of a hub, **or** mark every remaining spoke | `available − marked == clue` (nowhere else left to put them) / `lines == clue` (no room for more) |
| `spokesSolverDiagonal` | mark a diagonal | its crossing partner is already a line, and two diagonals cannot cross |
| `spokesSolverAttempt` | set one spoke | the opposite value provably drives `spokesValidate` to `invalid` |

`spokesValidate` is the oracle underneath all of them: per-hub line and mark
counts, no crossing lines, and — via the `dsf` — no group of hubs sealed off from
the rest. That connectivity clause is what gives the two-ones rule and most of the
look-ahead contradictions their bite, and it is the part of Spokes a new player
routinely fails to see. A hint that teaches it is worth more than one that teaches
counting.

The engine side needs nothing new: hooks, `ActiveHint` lifecycle, `continuesPrevious`
journeys, auto-hint pacing and overlay clearing all already exist. Spokes is a new
*implementer*.

## Decisions

### D1 — The hint replays the solver from the player's board, one **firing** at a time

`deduceSpokesPlan(board)` clones the player's current board and walks the same
rungs in the same order as `spokesSolve`, but returns one *firing* at a time — a
firing being one rung reaching one conclusion — with the spokes it forces, the
rung that forced them, and its evidence. It then applies that firing and repeats.

Rung order is preserved, so the cheapest, most teachable deduction is always
offered before the look-ahead, and the plan is **recompute-stable** (quality bar
rule 5) for free: it is a deterministic function of the board, so a hint
recomputed after the player follows a step simply continues where the last one
left off. There is no heuristic to oscillate, unlike Inertia.

The plan is capped at `HINT_PLAN_MAX` firings; the look-ahead rung is expensive
(a sub-solve per candidate spoke) and a player rarely follows more than a few
steps before diverging. Hitting the cap just ends the plan; the next request
computes the next batch.

### D2 — One firing is one journey (quality bar rules 2 and 3)

`spokesSolverFull` on a saturated hub forces **every** remaining spoke of that hub
in one stroke — that is a single deduction, and it must read as a single hint.
It is emitted as one multi-leg journey: the first leg carries the full narration,
the rest are flagged `continuesPrevious` so the midend keeps them displayed and
auto-play runs them back-to-back as one hint.

All legs of a firing render in the **same** colour, because they share a fate.
Giving the "first" spoke a distinct colour would read as "this one is special",
which is precisely the misleading signal bar rule 3 exists to forbid.

The two-ones and crossing-diagonal rungs each force exactly one spoke, so their
journeys are single-leg.

### D3 — Narration: state the premise, then the impossibility, then the conclusion

Every sentence a hint utters is a claim, and each of these is checked in code
before it is uttered (quality bar rule 5).

- **Saturation** — *"This hub needs 4 lines and has exactly 4 spokes left that
  could carry one. There is nowhere else to put them, so every one of them is a
  line."* Evidence: the hub, and the spokes being drawn.
- **Exhaustion** — *"This hub already has all 3 of the lines it needs, so no
  other spoke here can carry one — rule them all out."* Evidence: the hub, and
  its existing lines.
- **Crossing diagonal** — *"A line already runs corner-to-corner through this
  square, and two diagonals cannot cross. So this diagonal is ruled out."*
  Evidence: the crossing line.
- **Two ones** — *"Both of these hubs need exactly one line. If that line joined
  them to each other, both would be finished and the pair would be sealed off
  from the rest of the board — and every hub has to end up in one connected
  group. So they cannot be joined to each other."* Evidence: both hubs. This is
  the rung most worth teaching, and its narration must name the connectivity rule
  explicitly, not just assert the mark.
- **Contradiction look-ahead** — *"Suppose this spoke were a line. Then this hub
  would be finished, ruling out its other spokes, and that would seal these hubs
  off from the rest of the board. That is impossible, so the spoke is ruled out."*
  Evidence: the hypothesis spoke plus the cells where the board breaks. **Open
  question (D3a):** how much of the forced consequence chain to show — naming just
  the final contradiction risks a non-sequitur (the Palisade `equivalentEdges`
  failure mode), while replaying every intermediate step is unreadable. Decide by
  reading real generated boards, not in the abstract; the test for "enough" is
  that the conclusion follows from the stated premises alone.

### D4 — Refuse rather than deduce from a doomed board

Refuse, with a banner, when:

- the board is **solved** — "This board is already solved.";
- `findMistakes()` is non-empty — the standard "fix the highlighted mistakes
  first" banner, since Check & Save already paints them;
- the board is live-invalid in the way the renderer already shows (an over-filled
  hub, or a group sealed off) — same treatment: the player must undo, not be
  handed a "forced" move that only follows from their own error;
- no rung fires. On a shipped board past the guards above this should be
  unreachable, since generation gates every board on this very solver; if it ever
  happens it is a bug, and refusing honestly beats inventing a step.

### D5 — Rendering: the hint paints a spoke, and must invalidate its corner

The hint overlay is a `COL_HINT` spoke (drawn like a line, at hint colour) plus a
`COL_HINT_CELL` ring on the evidence hubs, folded into the per-hub cache key —
otherwise it will not paint on a hub nothing else changed (playbook §3.2).

**Spokes-specific trap:** a diagonal is drawn as two halves by the two hubs it
joins, and the four-cell corner square it passes through belongs to the separate
corner pass (see the `render.ts` header). A diagonal *hint* spoke therefore has to
invalidate its corner entry as well, exactly as the mistake overlay does with
`CORNER_WRONG` — otherwise the hint paints with a hole in the middle. Reuse that
mechanism rather than inventing a second one.

## Open questions

- **D3a** — the depth of the contradiction narration (above). Settle it against
  real boards during implementation and record the answer here.
- Whether the look-ahead rung is common enough on Tricky/Hard boards to be worth
  its narration budget, or whether the earlier rungs carry nearly every hint in
  practice. Measure before investing in the elaborate version.
