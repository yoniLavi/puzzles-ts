# Design — Inertia's hint

## Context

Inertia is a movement game, not a deductive one. Its hint therefore belongs to the
**non-deductive family** (hint-authoring §6, Untangle's precedent: a hint may be a
*suggestion* rather than a proof) — but it has far more to say than Untangle did,
because every Inertia move has a concrete consequence the player can be taught.

The work was expected to be entirely in **what we say about each move** — the plan
being free, since `solveRoute` already returns a full direction sequence. That
turned out to be wrong, and D7 (below) is what replaced it. The narration work was
as expected; the planning was not.

## Decisions

### D1 — The hint must not set `cheated`. That is the whole point.

`Midend.solve` marks the game solved-with-help; `Midend.hint` does not. Inertia's
Solve *installs a route into the state* and sets `cheated`, so the status bar reads
"Auto-solver used." forever after. The hint path touches neither: no route
installed, no `cheated`, nothing serialised. If a future refactor is tempted to
implement `hint()` by reusing the solve *move*, that is the mistake this change
exists to avoid — the moves it suggests are ordinary `{type: "move"}` moves.

*Verified live:* auto-hint plays a whole board to a win and the status bar reads
**COMPLETED!**, not "Auto-solved."

### D2 — The subgoal is the gem, and it is held stable (the Fifteen lesson)

Split the plan into **legs**: a leg is the run of moves ending in the first move
that collects a gem. That gem is the leg's **subgoal**, and every step of the leg is
narrated against it.

Holding it *stable* is not a nicety. Fifteen's own code carries the scar
(`index.ts`: "we hold the goal at the running maximum until it is actually homed…
this keeps the banner from flip-flopping (e.g. 'tile 8' → 'tile 7' → 'tile 8')") —
the owner reported exactly that as a bug. So the subgoal is derived once per leg,
from the plan, and carried.

A slide often sweeps up several gems at once. The subgoal is the **last** gem along
the collecting move's path — the one the ball is really travelling for; the others
are narrated as swept up on the way.

### D3 — Three narration cases, and none of them may overclaim

Per move:

1. **Forced.** If every other direction the ball can set off in runs it onto a mine,
   that is a real necessity claim and gets one. Distinguish the *walls* case: a ball
   hemmed into a corridor must not be told "every other way runs you onto a mine"
   (hint-authoring §2.7 — sanity-read the narration at its degenerate extremes).
2. **Collecting.** Name what the slide wins and what stops it — a stop square, or
   the wall at the end. This teaches the rule beginners fight: you do not choose
   where you stop.
3. **Positioning.** The slide collects nothing, so say what it is *for*.

**Correction to the original design.** It claimed the positioning premise — "the
ball cannot reach the subgoal gem from where it stands" — was "true by
construction". It is not, and shipping it as written would have shipped a lie: a
plan may decline a one-slide grab it *could* take, because a gem is not one place
but up to eight (the ball arrives still moving and cannot turn, so *which side you
come at it from* decides where you fetch up). The premise is therefore **checked**
per step (`oneSlideGrab`), and the narration branches on the answer.

Two branches were added for the case where the grab does exist:

- **Stranding** (the best hint in the game): play the grab out, and if some gem is
  then provably unreachable (`unreachableGems` — see D6), say so. *"Sliding east
  would sweep it up right now — but you don't choose where you stop, and it leaves
  the ball where a gem can never be reached again."*
- **Otherwise**, say only what is true: the plan comes at the gem from another side.
  Claiming the grab is a trap without the proof would be exactly the overclaim
  hint-authoring §2.4 forbids.

A third correction: **"one more slide sweeps it up" is a promise about the plan's
own next move**, not about a slide existing. The first cut checked "does *some*
slide reach the gem from where this move lands?", and the plan then went elsewhere
— the hint contradicting itself one step later. Caught by printing a plan and
reading it, which is the cheapest possible test and should be the first one.

### D4 — The subgoal gem is marked, because Inertia's gems are anonymous

Fifteen can say "tile 8". Inertia's gems have no identity, so the board carries the
reference (hint-authoring §2.3): the subgoal gem is **ringed** in `COL_HINT_GOAL`
(violet), and the narration speaks of "the marked gem".

Roles and colours (hint-authoring §5.3 — a stable per-game colour *always* paired
with a non-colour cue):

| role | cue | colour |
| --- | --- | --- |
| the direction to play | arrow on the ball | `COL_HINT` (the route arrow's own colour: both mean "the solver says go this way") |
| the subgoal gem | ring | `COL_HINT_GOAL`, appended past the C enum (inertia's dark-mode `paletteOverrides` touch only index 6, so appending is safe) |

`COL_AIM` (the swipe arrow) is spoken for and takes precedence over both while a
swipe is being aimed — it is what the ball will actually do next.

**The ring is in the tile cache key** (`HINT_GOAL`, bit 0x400). `render.ts` warns in
its own header that the route arrow escapes the playbook §3.2 overlay-cache trap
*only because it rides the ball sprite* — a ring is drawn on a **tile**, so an
overlay outside the diff key would never paint and never erase. This is the Towers
mistake-overlay bug, and the design's colour table walked straight past it.

### D5 — `hintKeepTrack`, *not* the default `"off"`

The original design said no `hintKeepTrack`: a deviation should drop the plan and
recompute. The first half is right and is what `"off"` gives — but `midend.ts:416`
reads `this.game.hintKeepTrack?.(…) ?? "off"`, so **without** the hook every player
move drops the plan, including one that faithfully *follows* the hint. The next
hint then replans from scratch, and (see D7) a replan can reach for a different
gem: the subgoal flip-flop that D2 exists to prevent, coming back in through the
door D5 left open.

So Inertia implements it: a move in the step's direction is `"completed"` (a slide
is settled by its direction alone, so the resulting board is exactly what the plan
expects), anything else is `"off"`.

### D6 — Refusal, and the one thing Inertia can prove

`{ ok: false }` when the board is solved, and when the ball is dead — with the
honest answer, which is that the move to make is *undo*. (The dead check must come
first: `solveRoute` will happily route from a ball standing on a mine, because
`MoveGraph` never asks whether it is alive. Upstream's `solve_game` has the same
wart; Solve is left as it is.)

And one better refusal than "no route found": `unreachableGems` (new, in
`solver.ts`) builds the move graph from the ball and reports the gems no sequence of
moves so much as passes over. A non-empty answer is a **proof** the game is lost, so
the hint says so — *"The ball can no longer reach a gem — undo to a position where
it can."* It proves in one direction only (a reachable gem may still be
uncollectable in practice), which is exactly why it is sound to lean on: when it
speaks, it is right. It also powers the stranding narration in D3.

### D7 — The plan goes for the nearest safe gem, not the tour (**the load-bearing decision**)

The original design assumed the plan was free: take `solveRoute`'s route and narrate
it. `hint-resume.test.ts` — the cross-game guard that a hint must make progress from
*any* position — rejected that hint outright, and was right to:

```
0: at (6,2) gems=16 dir=SE  goal=27
1: at (7,3) gems=16 dir=N   goal=27
2: at (7,1) gems=15 dir=SW  goal=15
3: at (6,2) gems=15 dir=NE  goal=6     ← back where we started, going for a different gem
4: at (7,1) gems=15 dir=SW  goal=15
…for ever
```

`solveRoute` is a **heuristic** TSP. Two tours grown from adjacent positions can
disagree about which gem to fetch first, and each opens by walking to the other's
position. In the app the stored plan hides this while the player follows it — but a
plan is recomputed whenever they don't, and then the hint is telling them to
ping-pong. A plan-carrying hint does not save you: **the recompute must be
monotone.**

So a leg goes for the **nearest gem the ball can take without stranding itself**:

- *nearest* gives the monotonicity. Every move of a shortest walk to a gem shortens
  the distance to that gem by one, and that gem is still safe at the new position,
  so the distance to the nearest *safe* gem strictly falls every move. A gem is
  therefore collected within it, and the plan cannot cycle. (Breadth-first over the
  squares the ball can come to rest on; the board doesn't change under the search,
  because a leg collects nothing until its last move.)
- *safe* is the other half, and it is the game's own lesson: greedily grabbing the
  nearest gem is what a beginner does and it loses. Each candidate leg is played out
  and the rest of the board re-solved; a leg that strands the ball is rejected and
  the next-nearest tried. Where the near gems all strand (16 tried, then give up),
  the tour supplies the leg — its own route being the witness that the leg is safe.

**Measured, not assumed** (8 boards per preset): the greedy-safe plan is *shorter*
than the tour route on every preset (10×8: 210 vs 241 moves; 15×12: 527 vs 544;
20×16: 961 vs 989), and costs at worst 126ms on 20×16 — paid once, then the plan is
kept. So it is stable, safe, shorter, and more teachable, at no meaningful price.

**Why not simply fix the tour to stop coming home?** Because the tour's return
discipline is load-bearing, not waste. The game ends the moment the last gem is
collected, so the way home is never played — but ranking each gem by the cost of
getting out to it *and back* is what keeps a route continuable. A plain greedy walk
with no return requirement was tried and **strands itself on every board the
generator makes** (36 of 36, all three presets). That is the measurement that
justifies both leaving `solveRoute` alone and putting the safety check in `nextLeg`.

## Method note

Two of the three real bugs here were found by *printing a plan and reading it*, and
the third by a test that already existed. Neither needed a browser. The first
narration a plan produced contained a promise it broke one step later; the resume
guard caught the ping-pong the moment Inertia was added to its list. **Add the game
to `hint-resume.test.ts` first, and read one plan out loud, before polishing
anything.**
