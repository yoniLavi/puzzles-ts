# fix-sixteen-endgame-stranding

**Readiness: characterized, not designed.** The defect is measured to the move
and the failure is understood exactly. What is *not* settled is the fix, and the
two candidates are both real projects. Read "Why brute force is out" before
proposing a bigger budget — that has been measured and it does not work.

## Why

**Sixteen's hint strands the player four tiles from a finished 5×5, in about one
game in five.** Walking 16 seeds of the 5×5 preset one freshly-recomputed hint at
a time, 13 reach the solved board and **3 stop dead** — every one of them at
`outOfPlace = 4`, every one of them the two-swapped-pairs shape, with the hint
saying:

> No move here would get you closer.

on a board that is perfectly solvable. The player has followed 32 to 35 hints,
watched the board come down from 24 tiles out of place to 4, and is then told
there is nothing to do.

**This is not the cycle that `fix-sixteen-hint-recompute-stability` fixed**, and
it is not new. The old code stranded on the same boards with the same refusal; it
simply cycled elsewhere and never reached them. Fixing the cycle is what made
this reachable, and therefore visible.

## What it actually is

A two-swapped-pairs board — say tiles 3 and 8 wanting each other's cells in one
column, and 19 and 20 in one row — reads as four cells from finished and is
**exactly nine moves** from it. That is measured, not estimated: an exact
bidirectional search with a 24 M-state budget returns a 9-move plan for the
stranded board from seed `hr-d`.

Nine is one move past what the search can reach. Scrambling a solved 5×5 by
*k* random slides and asking for an exact plan:

| scramble | exact search reaches | cost |
| --- | --- | --- |
| 4–8 moves | every time | < 0.5 s |
| 9 moves | 2 of 4 | ~0.5 s |
| 10 moves | 3 of 4, none longer than 8 | ~0.5 s |

Every plan it ever returns is 8 moves or shorter. The heuristic cannot help: the
board is a strict local minimum of the travel measure, which is the whole reason
the exact search exists.

## Why brute force is out

The obvious response is a bigger budget. It was measured, and it fails on two
counts at once:

| depth | budget | result | time |
| --- | --- | --- | --- |
| 9 | 6 M | no | 2.3 s |
| 9 | 10 M | no | 4.5 s |
| 9 | 14 M | no | 5.9 s |
| 9 | 18 M | no | 8.8 s |
| 9 | 24 M | **9-move plan** | 10.0 s |

So crossing distance 9 costs 18–24 M states — roughly **10 s and the better part
of a gigabyte** — against 2.5 M and 0.5 s for distance 8. That is already too
much for a browser worker on a phone. Worse, the budget is spent *in full* on
every board the search cannot reach, so raising it would put those ten seconds on
**every hint of every far board**, to rescue one board in five games. The branch
factor is 40 at 5×5 and each extra ply costs about 40×; there is no budget that
buys distance 10.

**The fix has to be structure, not search.**

**Seen in the app, not only in a walk.** Dealing a 5×5 in the browser and
pressing Hint until it stops: 30 moves, down to tiles 3↔4 swapped in the top row
and 25↔20 swapped in the last column, and then "No move here would get you
closer." in the sidebar. The next board dealt solved in 41.

## Three candidates

None is small, and choosing between them is the first task.

1. **A pattern database.** A 4-tile PDB over a 5×5 board is 25·24·23·22 ≈ 304 k
   entries — a second of BFS and a few hundred KB. Slides act on tile *positions*,
   so a pattern's transition is well defined, which is what makes this legal here.
   It gives the forward A\* a genuinely admissible heuristic in place of
   `travel/10`, which is what makes the current forward search useless. Cheap to
   build, and it may not be strong enough on its own — worth measuring the reach
   it buys before committing.
2. **A constructive endgame.** Place tiles by commutator, the way a person solves
   this puzzle. Longer plans than shortest, but *always available*, monotone by
   construction (the potential is how far through the algorithm the board is), and
   **narratable** — which is the hint quality bar's real interest here. A hint
   that says "this pair is swapped; here is the maneuver that swaps a pair" is
   worth more to a player than a shortest 9-move plan they cannot see the shape
   of.

3. **Keep the search, spend memory instead of having none.** What actually rules
   out distance 9 is *memory*, not time: 24 M stored states is most of a
   gigabyte, and 10 s is merely unpleasant. But the two halves of a
   bidirectional search are not symmetric in what they cost. The **backward**
   half is identical for every hint of a given board size — four plies from the
   finished board, about 1.25 M states, ~40 MB — while the **forward** half is
   what has to reach five plies and is what blows the budget.

   So store the backward half and run the forward half as an iterative-deepening
   DFS, which uses memory proportional to its *depth* rather than its breadth:
   walk five plies, probing each leaf against the stored backward set. Rough
   arithmetic puts it at tens of millions of leaf probes — call it 5–8 s — in
   about 40 MB. It reaches distance 9 without the gigabyte, and it is a change
   to `slide-planner.ts` alone.

   Unmeasured, and the arithmetic is a sketch: the leaf count has not been
   counted, only estimated from the stored forward frontier. **Measure it before
   choosing it.**

Candidate 2 is the better *hint* and the largest job. Candidate 1 is the
smallest and leaves the hint saying what it says today. Candidate 3 is the most
direct — it makes the existing search reach one ply further — and is the one to
price first, because if it works the other two are unnecessary.

## What Changes

- Sixteen's hint reaches a solved board from every position it can reach, on
  every preset — the guarantee `hint-resume.test.ts` already asserts, extended to
  the boards that currently escape it because no seed in the gate slice lands on
  one.
- Whatever is built is shared through `slide-planner.ts` if it generalizes to
  Netslide, and stays in `src/games/sixteen/` if it does not. Netslide has not
  been measured for the same stranding — its win condition is weaker (any powered
  arrangement finishes it) and its branch factor is far smaller, so it may not
  have the shape at all. **Measure it before assuming either way.**

## Impact

- Affected specs: `sixteen`, and `ts-engine` if the mechanism is shared.
- Affected code: `src/games/sixteen/`, possibly `src/engine/slide-planner.ts`.
- **A guard has to come with it**, and the current one would not have found this:
  the gate slice walks one seed per preset, and 13 of 16 seeds pass. A stranding
  that happens on a fifth of boards needs a sweep over seeds, run in the slow
  tier, asserting the walk arrives — cheap to write, and it is what turned this
  from a hunch into the table above.
- Owner acceptance: **yes.** It changes what a hint says on a board that ships,
  and candidate 2 changes what it teaches.
