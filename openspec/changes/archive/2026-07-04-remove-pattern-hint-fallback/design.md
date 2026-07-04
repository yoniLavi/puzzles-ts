# Design — remove Pattern's generic hint fallback

## Context

This is the first Phase-3 flip enabled by `adopt-narratable-deduction-engine`
(archived 2026-07-03), whose design **D4** already reasoned this case through. This
document carries D4 forward as the change's own decision record; read D4 in the
archived change for the full argument.

## Decisions

- **Promote, don't reject (D4 recommended).** Keep every generated board and the
  byte-match differential intact; make the plan honest by narrating the leftover
  deduction as a real technique rather than removing the boards that need it.
- **The leftover *is* deduction, and it's already computed.** Pattern's `doRow`
  enumerates the ways *one line's* runs can sit and keeps the cells forced in
  **every** arrangement — single-constraint intersection, the same family as the
  overlap rung (which is the special case of a single run). It is **not**
  cross-line backtracking (Pattern's generator already rejects every board needing
  that). So the fix is a *framing/narration* change, not new solver machinery:
  rename the `forced` reason to an `intersection` technique and narrate the
  intersection honestly. `fallbackFiring` stays the mechanism.
- **Narration.** *"Whichever way this column's runs fit, these cells are always
  black."* Leads with the indication (the line + the "every arrangement agrees"
  spotting), concludes in the necessity voice. Avoid the bare "is" conclusion the
  §2.7 guard rejects; the current *"only one arrangement fits"* is both misleading
  (it's all-arrangements-agree, not one-arrangement) and guard-tripping — replace
  it outright.
- **Colour.** The intersection's forced cells are black/white forcings like every
  other technique → `COL_HINT`, no new legend entry.

## Why the residual measurement gates enrichment (not correctness)

With promote, the plan is **already complete and always explained** the moment the
bottom rung is named — the enrichment (edge/anchor, completion, gluing) buys only
*teaching elegance* (an overlap-style step reads better than a general-intersection
step). So task 1.1 measures the per-size fraction of steps that hit the bottom rung
and spends enrichment only where that fraction is high at a shipped size. This keeps
the change from ballooning into "reimplement every nonogram technique" when the data
may show the bottom rung is rare at the sizes Pattern actually ships.

## Alternatives considered

- **Reject at generation** — accept only boards the *elegant* techniques solve.
  Forfeits the byte-match differential (acceptable post-pivot — C is deleted) and
  retires `doRow`, but at 30×30 discards ~28% of boards and biases survivors toward
  regularity, trading a deductive bar for a teaching-elegance one. **Advised
  against** (D4); recorded as the road not taken. If implementation surfaces a
  reason to revisit (e.g. the intersection step reads badly even after enrichment),
  bring the measured cost back to the owner before switching strategies.

## Risks / Trade-offs

- **Intersection steps can be less glanceable than overlap steps** → mitigated by
  the enrichment in task 3 where the measurement says it's needed, and by the
  necessity-voice narration naming the line and the "every arrangement agrees"
  spotting.
- **Plan completeness** — the bottom rung is a subset of `doRow`, which is the
  per-line solver the generator gates on, so a board that generates is always
  completed by the plan; `hint-resume` remains the guard.

## Out of scope

- The audit-and-confirm pass over the threaded games (Range/Singles/Filling/Unruly/
  Latin family) — parent task 3.2, its own follow-up; expected already-compliant.
- Any generation / board-identity change (this change keeps generation untouched).
