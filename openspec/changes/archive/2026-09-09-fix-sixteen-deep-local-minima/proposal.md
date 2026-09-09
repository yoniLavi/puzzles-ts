# fix-sixteen-deep-local-minima

**The change was scoped as a decision and turned out to be a measurement.** It
was written as a fork — make Sixteen's hint *complete*, or make it *honest* —
with the first ruled research-shaped and the second the owner's to word. Both
halves shipped, and the reason the first was affordable is that the premise
underneath the fork was wrong: the problem was never that the search could not
reach far enough.

## Why

`fix-sixteen-endgame-stranding` removed the stranding class **nine** moves from
finished — one or two pairs of tiles in each other's cells. Deeper ones
remained. Playing 5×5 in the browser and following hints, the board reached this
position at move 33 and the hint gave up:

```
 1  2  3  4  5
 6  8  7  9 10
15 12 13 14 11
16 17 19 18 20
22 21 23 24 25
```

Four swapped pairs, eight tiles out of place, every slide making the picture
worse. Checked directly rather than read off a browser: `hint()` refused on it
in 3.2 s, having run the deep search and failed.

**And the refusal was not true.** `NO_MOVE_WORTH_MAKING` — "No move here would
get you closer." — says something about the *board*. On that board plenty of
moves got the player closer; the hint merely could not find one. That is the
hint quality bar's first rule broken by a shared constant, on a player who had
followed thirty-three hints to arrive there.

## What was wrong with the framing

The proposal priced two answers and ruled both out: a bigger search (each ply
costs ~40×, thirteen is unreachable) and a constructive solver (a commutator is
not monotone per move, so `hint-resume.test.ts` walks it into the middle of a
maneuver and abandons it). Both of those hold. What neither of them questioned
is **the measure the search is steered by**.

The heuristic is "total distance the tiles must travel". It is blind to a
*tangle* — a non-trivial cycle of the permutation — pricing two tiles in each
other's cells at the two squares it looks like when they are nine moves apart.
So a tangled board is a strict local minimum, and the fallback search cannot
climb out of one however long it is given. Counting the tangles costs one O(n)
pass and the same 6000-node fallback then walks straight out.

**The named board now solves in sixteen recomputed hints.** So do boards of
three and five tangles. The one- and two-tangle endgames are untouched, and
still get the deep search's complete nine-move plans.

## What it cost to get right, which is the part worth reading

- **A last-resort second measure ping-pongs.** The first arrangement kept the
  travel measure and reached for the tangle-aware one only where travel was
  helpless. Consecutive recomputes then steered by *different* measures: out of
  the tangle, back into it, 400 moves without solving. `docs/games/hints.md`
  § "Recompute-stable plans" now carries this one level down — the measure has
  to be as stable as the plan.
- **Sharpening a measure moves every gate that reads it.** The deep search is
  gated on "the fallback found nothing better than standing still", which is a
  statement about the measure. Sharpen it everywhere and that gate stops
  opening: the 5×4 one-pair board dropped from a complete nine-move plan to a
  five-move partial one — a regression inside a change meant to be pure gain. So
  tangles are priced only past the two the exact searches can unwind themselves,
  and every board they own is measured exactly as before.
- **An obvious test board was unsolvable.** Three swapped pairs on a 5×5 is an
  *odd* permutation, and every slide on an odd-sided square board is even — so
  it is unreachable, and it convicted the hint of a defect it did not have. Two
  of the boards measured here were built that way before it was noticed.

## The framework half, which is the durable part

**The collection's strongest hint guarantee is not attainable by a game that
searches, and nothing said so.** `hint-resume.test.ts` asserts a hint never
gives up on a solvable board. A deductive game can meet it — its deduction is
complete for the tier, or the tier's name promises search. A searching game has
a **reach**, and past it the only honest answer is "I did not find one".

So the collection gains `SEARCH_OUT_OF_REACH`, and the walk gains an exemption
for exactly the games that plan by searching — **derived from their own source**
(they call the shared slide planner), with a per-member ledger, never a roster.
Netslide gets the same wording on the same code path: it has not been seen
refusing, but the sentence has to be true if it ever does.

The wording deliberately does not name Auto-solve, which is *continuous
hinting* and would refuse for the same reason the hint just did. It names
`Show solution…`.

## What Changes

- Sixteen's hint measure counts tangles past the two the exact searches reach.
- `SEARCH_OUT_OF_REACH` replaces `NO_MOVE_WORTH_MAKING` in Sixteen and Netslide;
  the constant's own doc says which remaining callers may keep the old one and
  why (they are constructions that cannot come back empty).
- `hint-resume.test.ts` accepts it from the derived searching games, and rejects
  anything else from them.
- `help/features.md` § Hints teaches three refusals rather than two.

## Impact

- Affected specs: `sixteen`, `ts-engine`.
- Affected code: `src/games/sixteen/index.ts`, `src/games/netslide/hint.ts`,
  `src/engine/hint-refusal.ts`, `src/engine/hint-resume.test.ts`,
  `src/engine/hint-refusal.test.ts`, `help/features.md`,
  `docs/games/hints.md`.
- Owner acceptance: the refusal wording is player-facing.
