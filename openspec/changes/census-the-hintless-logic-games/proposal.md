# census-the-hintless-logic-games

## Why

**A bespoke-loop obligation came out vacuous, and pulling on it found a much
bigger gap than the one game it was about.**
`re-derive-the-fixpoint-no-gos` recorded, per game, the three obligations a
bespoke deduction loop owes — and had to mark Loopy's narratability obligation
**unmet rather than satisfied**, because Loopy ships no `hint()` at all: there is
no hint projection for its accepted boards to be walkable by.

Checking whether that was peculiar to Loopy says it is not. A grep for game
directories holding a `solver.ts` but absent from `testing/hint-games.ts`
returns **19**:

```
abcd ascent bridges loopy magnets map mathrax mines mosaic net
pearl rect rome seismic separate signpost slide tents tracks
```

**That number is a grep heuristic and must not be carried into this change as a
finding.** It certainly over-counts: several of those "solvers" are searches or
movement planners rather than deduction ladders (`map`, `mines`, `net`,
`signpost`, `slide` at least), and the collection has been burned by exactly
this before — `adopt-shared-deduction-fixpoint` opened with "~29 candidates" and
its first task recorded that the figure "does not survive verification". So
establishing the real list is the **first task of this change, not an assumption
of it.**

**Why it matters beyond tidiness.** Explained hints are one of the four
deliberate divergences this fork exists for (AGENTS.md, "Goal"), the
`ts-engine` Hint System requirement already says a displayed hint must always
name a technique, and the framework vision states the bar as *"every game has a
full explained hint, by construction — nothing may ship hintless"*
(`docs/framework-rdd/README.md`). A dozen-odd deductive games with a working
solver and no hint is the largest single distance between the collection and
that bar, and until it is measured nobody can say whether it is a dozen or three.

## What Changes

- **Establish the real list.** For every game with a solver and no `hint()`,
  classify what its solver *is*: a deduction ladder (a hint is a projection of
  work that already exists), a search (a hint would need a narratable ladder
  built first — the `Unreasonable`-tier question), or a movement/objective
  planner (the Inertia bar, not the Palisade bar). Key on the **shape** of the
  solver, not on the file name — AGENTS.md, "a scan that keys on a name finds
  only the games that were named that way".
- **Say what each one costs**, roughly, from the classification: a game whose
  ladder already narrates each firing is a small change; a game whose generator
  accepts boards its techniques cannot explain needs the
  narratable-deduction policy applied first, which may move its boards.
- **Propose an order**, cheapest-and-most-played first, as separate changes.
  This change does **not** implement any hint.
- **Close the vacuous obligation honestly**: either Loopy gets a hint (its own
  change) or the obligations table keeps saying "unmet", and the `ts-engine`
  requirement that a bespoke loop's obligations be recorded per game keeps that
  visible rather than letting it read as satisfied.

Explicitly not in this change: writing any `hint()`, changing any generator, or
deciding that a game *should* stay hintless — the last of those is
player-visible and the owner's call, and this change exists to put a measured
list in front of it.

## Impact

- Affected specs: none until the census is in; the deliverable is an `audit.md`
  plus scaffolded per-game changes.
- Affected code: none.
- **Owner decision this sets up**: whether "nothing ships hintless" is a bar
  this collection adopts now, later, or with named exemptions. That is a
  product call, not an implementation detail, which is why the census comes
  before any proposal to do the work.
