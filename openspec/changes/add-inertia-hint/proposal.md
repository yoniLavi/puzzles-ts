# Add an explained hint to Inertia

## Why

Inertia shipped with no Hint button, on the argument (`add-inertia-ts-port` design
D3) that Solve already hands the player a step-by-step aid — it installs a route,
draws an arrow on the ball, and lets them walk it one press at a time — so a hint
would be the same thing under a second button. **The owner overruled that, and the
argument was wrong on two counts.**

1. **Solve is a commitment; a hint is a nudge.** Solve sets `cheated`: the status
   bar reads "Auto-solver used." for the rest of the game, and the game is recorded
   as solved-with-help. A player who wants one push out of a stuck position is
   specifically trying not to pay that price. "The aid already exists" is no answer
   when the aid costs the thing the player is avoiding.
2. **There is real *why* to narrate.** Inertia is not deductive, so the Palisade
   necessity bar cannot be met move-for-move — but every move has a concrete,
   teachable consequence, and the thing beginners get wrong is exactly what a hint
   can say out loud: *you do not choose where you stop*. A move can be genuinely
   forced (every other direction runs onto a mine); a move can name the gems it
   sweeps and the stop-square that catches it; and a move that collects nothing can
   name what it is *positioning for*.

That third case is the interesting one, and the owner's steer is to narrate it the
way **Fifteen and Sixteen** do: hold a **stable subgoal** and describe every move in
terms of the subgoal it serves ("Working on tile 8: slide tile 7 out of the way").
Inertia's subgoal is the gem the tour is going for.

## What Changes

- **`Game.hint()` for Inertia**, computing a plan from the existing `solveRoute`
  (both tours are already there — no new solver). The hint is **ephemeral and never
  sets `cheated`**; Solve keeps its current behaviour untouched. That difference is
  the reason the hint exists, and it is the one thing this change must not blur.
- **Subgoal-framed narration.** The plan's moves are grouped into **legs**, a leg
  being the run of moves that ends by collecting a gem. The gem that ends the leg is
  the **subgoal**, held stable across every move of it — Fifteen learned the hard way
  (its own comments say so) that re-deriving the goal per step makes the banner
  flip-flop and look like it lost the plot.
- **Three narration cases**, each making only a claim that is actually true:
  - **forced** — when every other direction the ball can set off in runs it onto a
    mine, say so: that *is* a necessity claim, and it is the skill the game punishes;
  - **collecting** — name what the slide sweeps up and what stops it;
  - **positioning** — the honest form for a move that collects nothing: *the ball
    cannot reach the subgoal gem from where it stands, and this move puts it
    somewhere it can*. Both halves are true by construction. It must **not** claim
    the move is the *only* way unless that has actually been verified
    (hint-authoring §2.4 — the premise must single out the conclusion).
- **Rendering**: the subgoal gem is marked so the narration can refer to it
  (Inertia's gems are anonymous — there is no "tile 8" to name, so the board must
  carry the reference), plus the direction arrow on the ball. Distinct roles get
  distinct colours, each paired with a non-colour cue (hint-authoring §5.3), and the
  aim arrow's `COL_AIM` and the route arrow's `COL_HINT` are already spoken for.
- **Delete `hint-authoring.md` §6.1** ("when a game should ship no hint at all"),
  written earlier this session with Inertia as its exemplar. With Inertia getting a
  hint it has no exemplar and states the opposite of the decision. *(Done in the same
  commit as this proposal.)*

## Impact

- Affected specs: `inertia`.
- Affected code: `src/native/games/inertia/{index,hint,render}.ts` (+ tests).
- Affected docs: `docs/porting/hint-authoring.md` (§6.1 removed; the subgoal pattern
  generalised once Inertia has implemented it).
- No change to Solve, the route aid, the generator, the solver or the differential.
