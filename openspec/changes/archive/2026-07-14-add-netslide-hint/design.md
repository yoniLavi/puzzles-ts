# Design — add-netslide-hint

## Context

Netslide is a sliding-permutation puzzle: the board is a grid of Net wire pieces,
you slide whole rows and columns (toroidally, one step at a time), and you win
when every piece is connected to the powered centre. It has **no solver** — the
generator saves the unshuffled grid as `aux` and `solve` replays it.

So a hint has to *plan*: find a short sequence of slides from here to a finished
board, and explain each one. That is structurally the problem Sixteen already
solves, with three differences that are the substance of this change:

| | Sixteen | Netslide |
| --- | --- | --- |
| Piece identity | every tile is a distinct number, so its home is *given* | pieces are wire masks, and **many are identical** — the home assignment must be *chosen* |
| Slidable lines | every row and column | every row and column **except the centre ones** |
| Slide distance | any distance in one move ("full slide") | **±1 only** |
| Goal | each tile at its numbered home | every piece powered from the centre |

## Decisions

### D1 — The hint plans against `aux`, and refuses honestly without it

The target board is the generator's unshuffled grid (`aux`), which the midend
already passes to `hint(state, aux, ui)` — the same value it passes to `solve`.
Where there is no `aux` (a `params:desc` id, or a loaded save), the hint returns
`{ ok: false, error: "Solution not known for this puzzle" }`, exactly as `solve`
does today. That is faithful, honest, and consistent: a player who cannot Solve a
board cannot Hint it either, and the two fail with the same sentence.

**Rejected: reconstruct the target from the board.** In principle the finished
grid is recoverable without `aux` — the pieces must form a spanning tree rooted at
the immovable centre, and the barriers were chosen never to cross a solution wire,
so they constrain it heavily. But that is a genuine jigsaw/constraint solve, it is
a *new solver* for a game upstream deliberately gave none, and it would be the
largest part of this change by far while being invisible to the player in the
common case (a freshly generated game always has its `aux`). If loaded-save hints
are later wanted, this is the thing to build, and it should be its own change.

**Reachability is not a worry.** Slides are invertible and the board was produced
*from* `aux` by legal slides, so `aux` is always reachable from the current
position. The plan always exists; the only question is whether the search finds a
short one (D4).

### D2 — ~~Reduce Netslide to Sixteen by *choosing* a home for each piece~~ — **REVISED IN IMPLEMENTATION**

> **Superseded.** The original decision below was implemented, measured, and found
> to be the cause of two distinct defects. What shipped instead is D2′. The
> original is kept because the *reason* it fails is the interesting part, and the
> next sliding game will be tempted by it too.

**Original decision.** Sixteen's planner works because each tile knows where it
belongs. Netslide's pieces are wire masks with duplicates, so "where does this
piece belong?" has many answers. Resolve it *up front*: compute a
**mask-respecting assignment** of pieces to target cells minimising total toroidal
distance, and hand the planner labelled pieces each with a home cell — exactly
Sixteen's problem.

**Why it fails.** The assignment is only the cheapest one *for the board it was
computed on*. The search then wanders away from that board, and the further it
goes, the more some *other* assignment would have cost less — so the frozen one
starts scoring moves that visibly make the picture worse as *progress*. Measured
on the 5×5 presets, a plan would take the wrong-cell count from 16 to 17 and keep
going. The same mismatch corrupts the *narration*: the slide that actually
finishes the board delivers tiles to mask-compatible cells the assignment had not
picked, so the hint described the winning move as **"(setting up)"**.

### D2′ — Search the board the player sees, and read the homes off the plan

Two changes, each removing a thing rather than adding one:

- **The distance measure is recomputed against the board in front of it.**
  `travelToFinish` is the min-cost matching *of the current board* — the least
  total distance its tiles must travel to show `aux`, given that identical wires
  are interchangeable. It is a pure function of the board, so it means the same
  thing at every node and, crucially, **the same thing on every recompute**. That
  is where recompute-stability actually comes from (D5), not from freezing a
  choice. The matching is per mask group (tiny) and allocation-free, so paying it
  per node is affordable.
- **The planner works in board space, not label space.** It is handed the wire
  masks and the finished grid, and has no notion of *which* identical tile is
  which. This is not only simpler; it is *necessary*. All slides on an odd-width
  torus are odd-length cycles, hence even permutations, so on 3×3 and 5×5 the
  reachable arrangements sit inside the alternating group — and a labelled target
  chosen by a matching can easily be an **odd permutation away from anything the
  board can reach**. Aimed at such a target, the exact search would explore a coset
  it can never meet while the finished *picture* was two moves away.
- **Each tile's home is read off the plan.** Simulate the plan; a tile's
  destination is where it ends up. True by construction, and it agrees with the
  picture. A tile "belongs" at its destination only if the finished board wants its
  wires there — a partial plan can park a tile somewhere merely useful, and the
  narration says "(setting up)" for that, not "where it belongs".

**The goal test stays `isComplete`, not `equals(aux)`** (unchanged from the
original). Any arrangement that powers every tile wins, and the player may reach
one that isn't `aux`; the hint must recognise a won board however it got there, or
it will keep issuing moves after the game is over.

### D3 — Extract `engine/slide-planner.ts`; Sixteen is its first consumer

> **Outcome (task 1.4 decision checkpoint): the extraction was kept, and it came
> out *smaller* than planned.** The escape hatch was not needed. The parameters
> the original design listed — `homes`, the goal test, the heuristic's scaling —
> collapsed once D2′ moved the search into board space: the planner is now handed
> a board, a finished board, a move list and a `heuristic(board)` callback, and
> owns the A\*, the no-progress gate, the exact bidirectional search and the
> partial-plan behaviour. No labels, no home assignment, no piece-class
> projection. Sixteen's own hint got *shorter* (its heuristic is five lines), and
> its 72 tests and render snapshot pass unchanged with no `-u`.

This is the abstraction the owner asked for, and it is worth doing because
Sixteen's planner is *already* written against an `Int32Array` of values and
toroidal slides — the game-specific parts are small and identifiable:

**Moves into the engine** (unchanged in behaviour):
- the bucket-queue A* forward search with its lazy node allocation;
- the **no-progress gate** — engage the exact search only at a strict local
  minimum, the fix that took mid-game hints from ~3s to ~0.2s;
- the **exact bidirectional BFS** fallback for local-minimum endgames (two swapped
  pairs) that the heuristic cannot see past;
- the **partial-plan** behaviour — a search that improved on the start but didn't
  reach the goal returns the path to its best node, and the next request
  recomputes;
- the toroidal distance / slide-application primitives.

**Stays per-game** (the parameters):
- `legalMoves(state)` — Sixteen: every line, any distance. Netslide: every line
  *but the centre row and centre column*, distance ±1 only.
- `homes: Int32Array` — Sixteen: the tile's own number. Netslide: D2's assignment.
- `goalReached(pieces)` — Sixteen: every tile home. Netslide: `isComplete`.
- the heuristic's scaling, since a Netslide slide moves a line by one step while a
  Sixteen slide can move it any distance; the admissible divisor differs.
- all narration and rendering.

**The escape hatch.** The extraction is worth doing only if it stays *legible*. If
parameterising the planner turns it into a callback thicket — in particular if the
heuristic scaling and the move generator cannot be cleanly separated — then
**abandon the extraction**, keep Sixteen exactly as it is, give Netslide its own
planner, and share only `hint-vocab.ts`. That is a worse outcome but not a bad
one, and it is much better than a bad abstraction that makes two games hard to
change. Decide this *after* the first honest attempt, and record which way it
went.

**Sixteen must not regress.** The refactor is behaviour-preserving by
construction. It is guarded by Sixteen's existing hint tests, its render snapshot,
`hint-resume.test.ts`, and its `__lastHintEngagedFallback()` diagnostic — which
exists precisely to assert the no-progress gate still gates (and is a
load-independent proxy, per playbook §5.2, never an elapsed-time assertion).

### D4 — Search feasibility is the main technical risk — **it bit, and the design's own answer was right**

Netslide slides only **±1**, so plans are longer and the search deeper than
anything the planner had faced. The design said: *"if the forward search turns out
to be too weak on 5×5 to make useful progress, that is a finding, not a failure —
the answer is a better heuristic, not a bigger budget."* That is exactly what
happened, and exactly what worked. Recorded because the measurements are the
argument (24 boards: every preset × 8 seeds, hint recomputed after **every** move):

| | boards finished | worst single hint |
| --- | --- | --- |
| frozen assignment (original D2), 12k budget | 21/24 — 2 refused mid-game, 1 looped | 5.2 s |
| ditto, bigger budget / tuned heuristic divisor | *still looped* — every setting looped on some board | — |
| board-derived matching (D2′) + shortest-path endgame (D5′) | **24/24** | **0.98 s** |

Two things the tuning attempts taught, both worth the ink:

- **A bigger budget did not help, and tuning was whack-a-mole.** Raising
  `maxStates` from 12k to 40k, or the heuristic divisor from 1 to 3, fixed one
  board and broke another. That is the signature of a *misaligned* heuristic, not
  an underpowered one — and it is the cue to go back to what the number *means*.
- **A partial plan is still a fine outcome** (unchanged from the original). The
  5×5 plans routinely run out before the finish; the player ends up closer and the
  next request recomputes. That was never the problem — the problem was what the
  plans did while they were running.

Heavy tests are seed-deterministic with explicit timeouts and never assert elapsed
time (playbook §5.2).

### D5 — Recompute-stability is a hard requirement, not a nicety — **and it is bought structurally, not by freezing a choice**

This is the Inertia lesson, and Netslide is more exposed to it: a plan is
recomputed whenever the player goes their own way, so a hint that sends the player
one way and then, one move later, the other, for ever, is worse than no hint at
all. Netslide did exactly that. The failure, once the walk was actually
instrumented, was **not** the ping-pong Inertia suffered but something the
don't-undo-the-last-move guard cannot see:

```
40: wrong=6  -> row0-
41: wrong=8  -> row0-
42: wrong=6  -> row0-
43: wrong=8  -> row0-
44: wrong=7  -> row0-     <- row 0 is 5 wide: five slides = the identity
```

Five slides of the same row, each separately scoring as progress, and the board is
back exactly where it started. Banning the *inverse* of the player's last move —
which the hint does — cannot catch a cycle of length five.

**D5′ — what actually shipped.** Two structural guarantees, no caching:

- **The distance measure is a pure function of the board** (D2′), so it cannot
  flip between recomputes. Nothing is frozen; nothing needs to be.
- **The endgame is planned by an exact bidirectional search whose result is a
  *shortest* path** (`exactSearch: { when: "first" }`). Follow the first move of a
  shortest plan and the true distance to the finish drops by exactly one — so a
  hint recomputed after every move walks a strictly decreasing non-negative
  integer and *must* arrive. This is the monotone potential §6.3 of the hint guide
  demands, and it is the only thing that provably rules out a cycle of any length.

  Two details are load-bearing and were each got wrong first:
  1. **The search must return a genuinely shortest path.** The inherited
     implementation answered on the *first* meet it stumbled across mid-level, which
     can be one move too long — and a plan one move too long has no monotonicity at
     all. It now finishes the level and takes the cheapest meet.
  2. **There must be no cheap "are we close enough to bother?" gate in front of
     it.** The guarantee needs a gate that, once open, stays open, and the search
     *is* that gate: from a board one move nearer the frontiers meet sooner, so a
     search that succeeded once succeeds every time after. A proxy for closeness
     (how much of the picture is still wrong) *flickers* — a shortest route to the
     finish happily makes the picture look worse on the way — and a flickering gate
     hands the board back to the wandering heuristic mid-descent. Gating on
     wrong-cell count made things measurably **worse** (11 failures, up from 1).

- The narration still holds a **stable subgoal** across the legs of a journey and
  marks it on the board, since Netslide, like Inertia, has no name for the thing it
  is working on.
- **Never "cache the plan" to paper over instability** (unchanged) — that hides the
  bug rather than fixing it.
- Netslide joins **`hint-resume.test.ts`**, plus a game-local walk over the largest
  preset that recomputes after every move and asserts no board is ever revisited.

### D6 — Narration: lead with what is provable, then home-vs-helper

Per the hint quality bar, every sentence is a claim, and a hint that only says
*what* to do fails the bar. Netslide's narration has real content:

- **The provable fact, and the game's actual insight:** the centre tile can never
  move — the row and the column through it are both frozen — so the network is
  built *around* it. A corollary worth saying when it bites: a piece in the centre
  row can only be moved by sliding its column (and vice versa), so it has a single
  degree of freedom and is the hardest kind of piece to place.
- **Home vs helper:** narrate each move by the consequence it actually has —
  "this puts the corner piece in its final place" versus "this brings it into the
  column that can drop it home" (the latter using the existing shared
  `HINT_SETTING_UP` / `workingOn` vocabulary that Fifteen and Sixteen already
  share). This is the upgrade `AGENTS.md` flags as aspirational for
  Fifteen/Sixteen; doing it here in the shared vocabulary makes lifting those two
  a much smaller job later — but that lift is **not** in this change's scope.
- **One journey, one hint:** a subgoal that needs a row slide and then a column
  slide is one multi-leg journey (`continuesPrevious`), not two hints.
- **Claim only what is checked.** Do not say a piece "can't be reached any other
  way" or "must go here" unless the code has verified it. Netslide's target is one
  valid solution, not necessarily the only one (D2), so the narration says "this
  piece belongs here", never "this is the only place it can go".

### D7 — Rendering

Follow Sixteen's hint visuals, which the bar already settled: the piece being
placed highlighted in `COL_HINT`, its destination cell bordered, the slide arrow
to press drawn in `COL_HINT`, and the *ultimate* destination previewed distinctly
from an intermediate leg. Netslide's palette is index-for-index with the C enum,
so hint colours are **appended past it** (the game has no dark-mode
`paletteOverrides`, so appended indices are safe — playbook §3.3). The hint
overlay must be in the render cache's diff key or it will silently fail to repaint
(playbook §3.2, the bug Towers shipped).
