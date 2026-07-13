# Design — Inertia's hint

## Context

Inertia is a movement game, not a deductive one. Its hint therefore belongs to the
**non-deductive family** (hint-authoring §6, Untangle's precedent: a hint may be a
*suggestion* rather than a proof) — but it has far more to say than Untangle did,
because every Inertia move has a concrete consequence the player can be taught.

The plan itself is free: `solveRoute` already returns a full direction sequence from
the ball's current position, and already grows two tours and keeps the shorter. The
work here is entirely in **what we say about each move**, and in making the hint a
genuinely different product from Solve.

## Decisions

### D1 — The hint must not set `cheated`. That is the whole point.

`Midend.solve` marks the game solved-with-help; `Midend.hint` does not. Inertia's
Solve *installs a route into the state* and sets `cheated`, so the status bar reads
"Auto-solver used." forever after. The hint path must touch neither: no route
installed, no `cheated`, nothing serialised. If a future refactor is tempted to
implement `hint()` by reusing the solve *move*, that is the mistake this change
exists to avoid — the plan is computed from `solveRoute` directly, and the moves it
suggests are ordinary `{type: "move"}` moves.

### D2 — The subgoal is the gem, and it is held stable (the Fifteen lesson)

Split the route into **legs**: a leg is the run of moves ending in the first move
that collects a gem. That gem is the leg's **subgoal**, and every step of the leg is
narrated against it.

Holding it *stable* is not a nicety. Fifteen's own code carries the scar
(`index.ts`: "we hold the goal at the running maximum until it is actually homed…
this keeps the banner from flip-flopping (e.g. 'tile 8' → 'tile 7' → 'tile 8') through
the end-of-line corner dance") — the owner reported exactly that as a bug. Re-deriving
the subgoal per step would do the same here, because the tour wanders: the nearest
gem to the *ball* changes as it moves, while the gem the tour is *going for* does not.
So the subgoal is derived once per leg, from the plan, and carried.

A slide often sweeps up several gems at once. The leg's subgoal is the gem that
*ends* the leg; incidental gems collected on the way are narrated as a bonus, not as
a change of goal.

### D3 — Three narration cases, and none of them may overclaim

Per move, in priority order:

1. **Forced.** Enumerate the eight directions from the ball's square. If every legal
   direction other than this one runs the ball onto a mine, this is a real necessity
   claim and gets one: *"Every other way you can set off from here runs you onto a
   mine."* Cheap to compute (`slideTo` already returns -1 for a fatal move).
2. **Collecting.** The slide picks up at least one gem: name what it wins and what
   stops it — *"Slide south-east: you sweep up both gems on the way, and the
   stop-square at the end catches you."* This teaches the rule beginners fight, which
   is that you do not choose where you stop.
3. **Positioning.** The slide collects nothing. The honest claim, both halves true by
   construction: *the ball cannot reach the subgoal gem from where it stands, and
   this move puts it somewhere it can.* It must **not** say "the only way" — that is
   a stronger claim than we have checked, and hint-authoring §2.4 (the premise must
   single out the conclusion) and §2.6 (conclude with the action the move actually
   makes, never a stronger one) both forbid it. If a cheap verification of uniqueness
   turns out to be available, it may be added later, with the narration strengthened
   *then*.

### D4 — The subgoal gem must be marked, because Inertia's gems are anonymous

Fifteen can say "tile 8". Inertia's gems have no identity, so the narration cannot
refer to one in words — the board has to carry the reference
(hint-authoring §2.3: refer to a square by what it shows, never a bare pronoun; when
it shows nothing nameable, mark it). The subgoal gem is therefore ringed, and the
narration speaks of "the marked gem".

Roles and colours (hint-authoring §5.3 — a stable per-game colour *always* paired
with a non-colour cue):

| role | cue | colour |
| --- | --- | --- |
| the direction to play | arrow on the ball | `COL_HINT` (already exists — the route arrow) |
| the subgoal gem | ring | new, to be chosen |
| gems this slide sweeps up on the way | (decide during implementation — a second ring risks reading as a second goal) | — |

`COL_AIM` (the swipe arrow) is spoken for and must not be reused.

### D5 — `hintKeepTrack: "off"`

A deviation should drop the plan and recompute, exactly as the route aid already
re-solves when the player wanders off it. The plan's later moves were computed for a
ball that went where it was told; nothing about them survives it going elsewhere.

### D6 — Refusal

`{ ok: false }` when the board is solved, and when `solveRoute` reports the position
unsolvable (a gem became unreachable, or the ball is dead). Inertia has no
`findMistakes`, so the refusal→mistake-overlay coupling (hint-authoring §4) does not
apply — the banner carries the refusal on its own. A dead ball should say so plainly:
the move to make is *undo*, and the hint should say that rather than shrug.

## Open questions for implementation

- Whether a leg with several gems in one slide reads better as one step or as a
  grouped multi-leg journey (`continuesPrevious`). Start with Fifteen's shape (one
  move per step, stable prefix) and revisit if it reads badly.
- Whether the *path* the ball will travel should be shown (a faint trail), or whether
  the arrow plus the marked gem is enough. Cheap to try; decide by looking at it.
