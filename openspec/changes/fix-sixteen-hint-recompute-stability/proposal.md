# fix-sixteen-hint-recompute-stability

**Readiness: ready.** The defect is deterministic, reproduced twice, and
characterized down to its period. It is a known failure mode with a known fix
shape; what remains is doing it.

## Why

**Sixteen's hint never solves a 5×5 board.** Found by the slow tier of
`hint-resume.test.ts` the day it was widened to every preset
(`refuse-honestly-at-every-tier`, 2026-09-08):

```
sixteen: following hints one move at a time always reaches solved
  Error: sixteen-5×5-hr-a: did not converge within 800 moves (loop?)
```

Deterministic, fixed seed, reproduced in two independent runs. Seed-specific: a
different seed walks 5×5 in about 7 s.

**It is a ping-pong, and the numbers say so exactly.** Tracing tiles-out-of-place
per move on the failing board:

```
first 30: 24 24 24 24 23 23 21 19 18 19 19 20 19 19 20 19 16 17 19 18 17 18 18 17 17 16 17 16 15 13
last  60: 7 4 6 6 7 4 6 6 7 4 6 6 7 4 6 6 7 4 6 6 7 4 6 6 …
```

The opening half works — 24 down to 13, then on to 4. Then it locks into a
**period-4 oscillation, 7 → 4 → 6 → 6 → 7 → …, forever.** It reaches four tiles
from solved and walks away from it, repeatedly.

**Two hypotheses died on the way to that**, and both are worth recording because
each was plausible from the code alone:

- *"The exact bidirectional fallback never arms."* Sixteen enables it only at
  `outOfPlace <= 8`, and 5×5 has 25 tiles — so a plateau above the threshold
  would leave the forward search alone with `maxStates: 4000`. **False**: the
  trace reaches 4. The fallback arms and is *part of the oscillation*.
- *"It is a cycle."* The walk's own error says `(loop?)`. **Also false, in the
  sense that matters**: a state-repeat probe over 900 moves found **no repeated
  board**. The *potential* cycles while the board does not, which is why nothing
  simpler than this trace would have shown it.

## What it actually is

**The recompute-stability defect the collection has already paid for once.**
`docs/games/hints.md` § "Recompute-stable plans" records it from Inertia: *a plan
is recomputed whenever the player goes their own way, and Inertia's first cut
sent the ball north-east, then — one move later, from a freshly-grown heuristic
tour — south-west, for ever. The fix is a monotone potential, never
"cache the plan", which only hides it.*

Sixteen is that, at a larger board size. Its hint computes a plan up to 10 plies
deep and the walk — like a player going their own way — applies the first move
and asks again. The fresh search from the new state finds a *different* plan
that partly undoes the last one. The code comment at the `exactSearch` site even
names the mechanism it is relying on to avoid this — *"paid once for the whole
endgame thanks to plan-carrying"* — which is exactly the assumption
`hint-resume.test.ts` exists to refuse, because plan-carrying is the path a
player who follows every hint takes and not the path anyone else does.

**So the fix is not a bigger budget.** A deeper search or a wider `maxStates`
would move the oscillation, not remove it: nothing in the current design makes
the second plan agree with the first about *where it is going*. What is missing
is a subgoal that survives recomputation — the monotone potential Inertia
adopted.

## What Changes

- **Sixteen's hint holds a recompute-stable subgoal**, so a plan computed one
  move later pursues the same thing. The shape is Inertia's, not a cache.
- **The cross-game guard gains the property**, rather than only catching its
  symptom: `hint-resume.test.ts` proves *a* plan finishes, and
  `docs/framework-rdd/guarantees.md`'s planner row asks for the stronger check —
  drive every planner one step forward and assert the subgoal is unchanged. That
  is a second change if it grows; it is named here so the connection is not lost.
- **`walkedPresets`' untiered blind spot is closed** — see below. It must land
  *with* the fix, not before, because widening the slice turns the gate red on
  the very defect being fixed.

## The guard that found this could not have found it cheaply — and that is a defect of mine

`hint-resume.test.ts`'s gate slice keys on
`contract?.tierOf(params) ?? "untiered"`. For a **tiered** game that is right:
one preset per tier. For an **untiered** game every preset collapses to the one
key `"untiered"`, so the slice walks exactly the first — which is precisely the
first-preset blindness the widening existed to remove, reinstated for every
untiered game.

Sixteen is untiered and has five presets; the gate walks 3×3, and 3×3 is fine
(7 moves). The defect lives at 5×5 and only the slow tier reaches it.

**The slice must cover the axis a game actually varies**: tier where there is
one, and size where there is not. Taking the first *and last* preset for an
untiered game is the cheap honest approximation — presets are conventionally
ordered smallest-first, a convention the repo already relies on — and it costs
one extra walk per untiered game.

## Impact

- Affected specs: `sixteen`, and `ts-engine` if the subgoal-stability guard
  generalizes.
- Affected code: `src/games/sixteen/index.ts` (the hint), possibly
  `src/engine/slide-planner.ts` (shared with Netslide — **check Netslide for the
  same shape before changing it**, and do not fix one by breaking the other),
  and `src/engine/hint-resume.test.ts` for the slice.
- **Netslide is the other consumer of the shared planner and was not measured
  here.** Its presets all walked green, but that proves the symptom absent, not
  the property present. Say which you checked.
- Owner acceptance: **yes.** This is a hint a player follows, on a board size
  that ships, and the fix changes which moves it suggests.
