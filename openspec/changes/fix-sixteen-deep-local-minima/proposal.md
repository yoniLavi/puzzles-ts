# fix-sixteen-deep-local-minima

**Readiness: the problem is understood and the two obvious answers are both
ruled out by measurement.** This is not a "turn the budget up" change, and it is
not a "write a proper solver" change either — the second was tried on paper and
fails for a reason worth reading before proposing it again. What it needs first
is a decision about whether Sixteen's hint should be *complete* or *honest*.

## Why

`fix-sixteen-endgame-stranding` removed the stranding class that sat **nine**
moves from finished — one or two pairs of tiles in each other's cells, which
accounted for 5 of 40 walked 5×5 games and 12 of 40 walked 5×4 ones. It did that
by reaching one ply further than the state-bounded search could.

**Deeper local minima remain.** Playing 5×5 in the browser and following hints,
the board reached this position at move 33 and the hint gave up:

```
 1  2  3  4  5
 6  8  7  9 10
15 12 13 14 11
16 17 19 18 20
22 21 23 24 25
```

**Four** swapped pairs — eight tiles out of place, every slide making the picture
worse, and far beyond nine moves from home. Checked directly, not inferred from
the browser: `hint()` refuses on it in 3.2 s, having run the deep search and
failed.

**And the refusal it gives is not true.** `NO_MOVE_WORTH_MAKING` says "No move
here would get you closer." On that board plenty of moves get you closer — the
hint simply cannot find one. That is the hint quality bar's first rule ("claim
only what you have checked") broken by a shared constant, which makes it a
question about the constant as much as about Sixteen.

## Why the obvious answers do not work

- **A bigger search.** Each extra ply costs about 40× at this board size. Nine
  moves already needs a kept 835 k-board database and a five-ply walk (~4 s);
  thirteen is out of reach by any arrangement of the same machinery.
- **A constructive solver** — place tiles by commutator, the way a person solves
  it. This is the natural answer and it **cannot be used as a hint here**:
  `hint-resume.test.ts` applies only a plan's *first* move and recomputes, so a
  maneuver whose potential falls only at the *end* of it is walked into the
  middle and abandoned, and the next recompute starts a different maneuver from a
  worse board. Only mechanisms that are monotone **per move** survive that walk,
  and a commutator is not.

That leaves a real question rather than an implementation task.

## Two directions, and they are not the same kind of thing

1. **Make it complete.** Find a potential that falls on every single move and is
   computable — a pattern database strong enough to drive IDA\* to the true
   shortest path at distance 13+, or some other per-move-monotone measure. This
   is a research-shaped task with no guarantee of success, and the branching
   factor is 40.
2. **Make it honest.** Accept that the hint has a reach, and say so when it is
   exceeded: a refusal that tells the player the truth ("I can't see a way home
   from here") and points at Auto-solve, instead of a sentence that is false.
   Cheap, and strictly better than what ships today.

**These are not alternatives so much as an order.** (2) is worth doing whether or
not (1) is ever attempted, and it is the part with player-facing wording in it,
which makes it the owner's call.

## The framework question underneath it

**The collection's strongest hint guarantee may not be attainable by a
search-driven game, and nothing currently says so.** `hint-resume.test.ts`
asserts that a hint never gives up on a solvable board, and treats a refusal from
an untiered game as a failure. A *deductive* game can meet that: its deduction is
either complete for the tier or the tier is honest about permitting search — and
the walk already accepts `DEDUCTION_EXHAUSTED` on exactly those tiers, with one
wording, which is the shape of an honest exemption.

A game that *searches* has a **reach** instead, and past it there is no honest
answer but "I could not find one". Sixteen passes the walk today because the
sampled seeds avoid the deep minima; a new seed could turn it red at any time,
and that would be the guard reporting the truth rather than a regression.

So the question is not only "how deep can Sixteen search" but **what the
guarantee means for a game that searches** — and if the answer is that such a
game may refuse when out of reach, then it needs the same treatment the tiered
exemption got: one wording, and a way for the guard to tell an honest
out-of-reach refusal from a broken hint. Deriving that from what the game already
*is* rather than from a roster is the part worth thinking about, and
`AGENTS.md` § "A game joins a shared mechanic by *having* it" is the constraint.

## What Changes

- Decide whether Sixteen's hint is to be complete or bounded-and-honest.
- If bounded: a wording that is true when a search-driven hint runs out of reach,
  and the question of whether `NO_MOVE_WORTH_MAKING` should be split — it
  currently serves both "nothing here is worth doing" and "I could not find
  anything", which are different claims.
- If complete: a mechanism that is monotone per move, measured against the
  boards this change names.

## Impact

- Affected specs: `sixteen`, and `ts-engine` if the refusal vocabulary changes
  (that constant is shared, and its doc comment reasons about what a game may
  legitimately differ on).
- Affected code: `src/games/sixteen/`, `src/engine/hint-refusal.ts`.
- **Do not re-measure from scratch**: `fix-sixteen-endgame-stranding`'s tasks
  carry the reach, cost and shape numbers, and the board above is a fixed
  reproduction.
- Owner acceptance: **yes**, twice over — a player reads the wording, and the
  completeness question is a scope decision.
