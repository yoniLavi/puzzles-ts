# Change: audit which tiers actually require guessing, and name them honestly

## Why

**The collection promises that only an "Unreasonable" tier may require
guessing, and nobody has checked which tiers do.**

The rule, in the owner's words (2026-08-11): *if it requires **guessing**
rather than **checking**, it is Unreasonable* — with one exception, a
contradiction the player can see from a particular placement **without
thinking more steps ahead**, which is plain deduction and belongs at any tier.
`solver-and-generator.md` carries it, and `hints.md` carries the operational
test from the Sticks work: does the rejected trial **propagate** before the
oracle is asked?

Two things make this worth a change rather than a note:

1. **The policy document said the opposite in one place.** It described
   *single-level forcing* — fix a candidate, run pure propagation, take the
   contradiction — as deduction, "how the Latin family's `Extreme` tier
   works". By the propagation test that is guessing, and `Extreme` is not a
   name allowed to require it. The sentence has been corrected
   (`add-galaxies-hint`), but the games it described have not been read.
2. **It has already been wrong once, in the direction that matters.** Galaxies
   shipped a hint rung that hypothesised a cell's dot and ran the whole
   deduction fixpoint from it. It was sound, it was narrated, and it was
   removed on owner acceptance: a search result is not a technique a player
   can learn. The same shape may be sitting under a tier name that promises
   the opposite.

Five games ship both an `Extreme` and an `Unreasonable` tier (Towers, Keen,
Unequal, Solo, Group), which is a coherent design *if* `Extreme` is checking
and `Unreasonable` is guessing. Whether that is what the code does is the
question.

## What Changes

- **Classify every rung that reaches a conclusion via a trial**, across the
  Latin family (`engine/latin.ts` `forcing`, and each game's own hard rungs)
  and the other games the policy names (Spokes' Tricky/Hard look-ahead,
  Bricks' and Boats' validator trials, Sticks' single check, Undead's Tricky
  forcing). Three shapes, and only the first and third have been ruled on:
  - **immediate check** — place, ask once, no propagation (Sticks);
  - **chain-following** — an implication chain several links long, without
    running the solver (`latin.ts`'s forcing chains look like this);
  - **solve-from-hypothesis** — run the fixpoint and take what breaks
    (Galaxies', now removed).
  The middle shape is genuinely undecided and is the one this change has to
  settle: is following a two-candidate chain "thinking more steps ahead"?
- **Fix whatever the classification says is mis-named**, per game, with the
  owner's rule as the criterion: rename or reclassify the tier, or restructure
  the rung so it stops guessing. Renaming a tier is player-visible and changes
  preset titles, so each is an owner call rather than a sweep.
- **Give the rule a guard.** Today it is prose in two documents and one
  per-game test (`galaxies-hint.test.ts`). Whatever form survives the audit
  should be checkable — at minimum, a game whose hint narrates a trial should
  have to declare it.

## Impact

- Affected specs: `ts-engine` (the hint system's guess-free requirement gains
  the propagation test); per-game specs for any tier that is renamed.
- Affected code: potentially `engine/latin.ts` and the hard-tier rungs of the
  Latin games, Spokes, Bricks, Boats, Undead — **read before edited**; this
  change opens with an audit and may conclude that nothing needs to move.
- **A rename changes preset titles and difficulty labels**, not game IDs (the
  encoded difficulty character is unaffected), so saved games and shared links
  survive it.
