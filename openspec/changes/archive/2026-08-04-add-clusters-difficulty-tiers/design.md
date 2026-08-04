# add-clusters-difficulty-tiers — design

## D1: Both tiers bind, and the proposal's premise survived measurement

The proposal's claim is that Clusters already implements two deduction levels and
offers neither. That is true, but it is only half of what had to be checked: the
sister change `grade-difficulty-tiers-honestly` found **two tiers in the
collection with no boards at all**, so "the solver has two rungs" does not imply
"there are two tiers".

Measured before writing any code — 100 boards per size from the shipped
generator, asking of each whether the single-cell rule alone finishes it:

| Size | Needs no lookahead | Needs the lookahead | Generation today: med / p95 / max |
|---|---|---|---|
| 7×7 | 64% | **36%** | 39 ms / 161 ms / 1.7 s |
| 8×8 | 55% | **45%** | 148 ms / 1.6 s / 3.4 s |
| 9×9 | 50% | **50%** | 329 ms / 3.1 s / 7.1 s |
| 10×10 | 46% | **54%** | 1.2 s / 13.1 s / 25.0 s |

Both tiers are dense at every offered size, so neither is refused and neither is
rare enough to need special handling. The split also says what the setting was
worth *before*: a player asking for a Clusters board got a coin-flip between the
two, which is precisely the defect `grade-difficulty-tiers-honestly` describes —
here in its purest form, since the tier was not merely unbinding but absent.

## D2: Easy / Tricky, and why an old game ID reads as Easy

**Names.** Four other two-tier games in the collection — magnets, pearl, singles,
tents — name exactly this pair **Easy / Tricky**, and in every one of them the
harder tier is "assume something and look one step ahead", which is what
`solverRecurse` does. The encode chars are `"et"`, as in all four. Upstream has
no naming here to preserve.

**The default.** The spec delta asked for "the tier that reproduces the behaviour
Clusters shipped before". Strictly, *neither tier does*: the old gate accepted the
**union** of both, so its boards were a 46–64% mixture. Easy is the honest
resolution — it is the majority tier at every size the game offers, it is the
collection's default convention, and it is the tier a returning player is most
likely to recognise. Note that the choice cannot change any *existing* board: a
shared game ID carries its own description, and the tier only decides what the
next *generation* produces.

## D3: The cheap rung first — the same verdict for less work

The obvious honest gate is "solve at the requested tier, then solve at one below
and reject on success". Clusters can do better, because its tiers are nested
rungs of one fixpoint rather than two solvers:

```
easy = solveGame(grid, 0)          // on the grid itself, not a copy
Easy   : accept iff easy === COMPLETE
Tricky : reject if easy === COMPLETE ("too easy"); else solve at 1
```

One solver run in the common case instead of two, and the expensive rung is never
run on a board the cheap one already finished — which is 46–64% of candidates.

**Why running level 0 first costs the level-1 solve nothing.** `solveGame(…, 1)`
begins with the level-0 fixpoint anyway, and the deduction is confluent: a refuted
colouring stays refuted as more cells fill in, because the three error conditions
are monotone (solver.ts states this; the hint planner already relies on it). So
`solveGame(g,0)` followed by `solveGame(g,1)` reaches the identical grid as
`solveGame(g,1)` alone.

**The probe does not run on a copy, and that is deliberate.** The cross-game rule
from `grade-difficulty-tiers-honestly` is that a tier probe must not run on
*contaminated* state — the Ascent defect, where a retained solver scratch made the
probe answer a question about the previous candidate. Here the "probe" is the
first rung of this candidate's own solve, on this candidate's own grid, and its
result is consumed immediately. There is no scratch to retain and nothing carried
between candidates except what the pre-existing algorithm already carried.

## D4: A rejected Tricky candidate must be perturbed, or the generator spins

This is the one genuinely new hazard, and it is invisible until the *second*
acceptance test exists.

The retry loop is not "generate a fresh board each time": the grid **persists**
between attempts, and step 1 re-randomises only the cells that are still blank —
so a failed attempt keeps whatever the solver managed to deduce. That is upstream's
behaviour and it is why the loop converges.

A Tricky rejection is the first rejection that can happen to a **completed** grid.
A completed grid has no blank cells, so: step 1 changes nothing (and draws no
randomness), step 2 finds no isolated cell in a solved board, step 3 re-derives
the identical clue set (a cell with exactly one same-colour neighbour is exactly a
dot), step 4 prunes identically — and the solver returns the same verdict. The
loop would be a fixed point consuming no entropy: an infinite hang, not a slow
generator.

**Clearing the grid breaks the fixed point and is the wrong break.** Any
perturbation works; the question is what it costs. This retry loop is a
*hill-climb*, not independent sampling — a failed attempt keeps the cells the
solver proved and re-rolls only the rest, so consecutive candidates converge. A
`fill(0)` throws the whole climb away and buys a fresh one on *every* too-easy
candidate, which is roughly half of them. **Flipping one random cell** breaks the
fixed point just as surely — it draws randomness, so no two consecutive attempts
can be identical — while keeping the climb, and it is what ships.

Measured, 50 seeds per cell (median / p90 / max, ms):

| Size | Flip one cell | Clear the grid |
|---|---|---|
| 7×7 | **66** / 494 / 1076 | 316 / 1812 / 2482 |
| 8×8 | **191** / 1189 / 3733 | 1256 / 6753 / 20684 |
| 9×9 | **595** / 3498 / 5829 | did not finish 50 seeds in 8 minutes |
| 10×10 | **1360** / 6356 / 10907 | not measured — 9×9 settled it |

The perturbation is the only place the tiers touch the candidate *stream* at all:
steps 1–4 are untouched, and the tier otherwise only decides which candidates are
kept.

### What this cost overall: less than nothing

The comparison a player actually feels is against the generator as it shipped,
not against a hypothetical:

| Size | Easy (new) | Tricky (new) | Pre-tier generator |
|---|---|---|---|
| 7×7 | 2 / 33 / 221 | 66 / 494 / 1076 | 39 / 161 / 1705 |
| 8×8 | 6 / 70 / 143 | 191 / 1189 / 3733 | 148 / 1611 / 3373 |
| 9×9 | 18 / 469 / 1101 | 595 / 3498 / 5829 | 329 / 3054 / 7102 |
| 10×10 | **18** / 270 / 832 | 1360 / 6356 / **10907** | 1171 / 13122 / **25040** |

At 10×10 — the worst case, and the one that matters — **Tricky is cheaper than
the game already was**: the same median, and a worst case cut from 25.0 s to
10.9 s. Easy is 65× faster there. Both come from D3's ordering: the expensive
lookahead rung is now skipped entirely on the ~50% of candidates the cheap rung
finishes, which the single old gate ran it on regardless.

So no preset is dropped and no tier is rationed. The retry bound (D5) is far from
any of this — every offered configuration converges in about a second of
attempts, while the bound only fires where no board exists at all.

## D5: The bound the game never had

Clusters' generation loop was **unbounded** — `MAX_ATTEMPTS = 100` was only the
`force` cadence, and nothing counted attempts. That was survivable only because a
single gate whose rejection always leaves progress behind cannot reject for ever;
adding a second acceptance test removes that accident, so the loop now takes a
`retryLimit` like the collection's other 25 generators. A synchronous generator
that cannot succeed owns its thread outright — see `engine/retry-limit.ts`.

The bound is doing real work rather than sitting unreachable: it is what turns
"Tricky at 2×2" from a hang into an error, which is how the size floor below was
measured in the first place.

## D6: Tricky is refused below twelve squares — and area is not the rule

Tricky needs a board the single-cell rule cannot finish, and a small grid has
nowhere to hide a deduction that deep. Measured by running the real gate over
every shape from 1×2 to 6×9, ten seeds each, every seed free to spend the whole
10,000-attempt budget:

| Shapes | Tricky boards found |
|---|---|
| 2×2, 2×3, 2×4, **2×5**, **3×3** | **none** — every seed exhausted the budget |
| **2×6**, **3×4** and every larger shape | all ten seeds |
| 1×5, 1×6, 1×12, **1×20** | **none**, at any length |

**The first guess was wrong, and guessing is the point.** This section originally
read "below 25 squares (5×5)", from the intuition that a deep deduction needs
room. The sweep says 4×4 binds, and then that 3×4 and 2×6 bind while 2×5 and 3×3
do not — so the boundary is twelve squares, less than half the guess, and a
threshold set by intuition would have refused seven working board shapes.

**Area alone is still not the rule.** A 1×N strip never binds *however long*: a
cell in a one-wide board has at most two neighbours, so the single-cell rule
settles it immediately or not at all and there is no chain for the lookahead to
follow. 1×20 has 20 squares and no Tricky puzzle. The condition is therefore
`min(w,h) ≥ 2 && w·h ≥ 12`, and both halves are load-bearing.

Refusal is `full`-only, so a saved game or a game ID carrying its own description
still loads at any size. This is the collection's rule for a tier with no boards
(`grade-difficulty-tiers-honestly` D3: refuse, never silently downgrade), and the
same shape Loopy uses for Penrose kite/dart at width 3.

## D7: A pre-existing hang, surfaced by the bound and fixed here

The sweep above also asked the prior question — which boards admit *any* Clusters
puzzle — and found two that do not: **1×2 and 2×2** (with 2×1). Both pass
upstream's `area ≥ 2` check, so both were reachable: `/clusters?type=2x2`
validated, and then generated for ever. Not slowly — *for ever*, because the
generator had no retry bound (D5) and no colouring of those boards survives to a
clue set. Every other shape up to 4×7 generates on every seed.

It is fixed in the same place the tier floor is, as `max(w, h) ≥ 3` — which is
exactly the complement of those two shapes and refuses nothing else. This is not
tier work and would have been out of scope, except that D5 converts the symptom
from a hang into a thrown `RetryLimitExceeded`: shipping a legal parameter set
that can only throw is not an improvement worth having, and the measurement that
establishes the tier floor answers this question in the same run.

## D8: The differential keeps the oracle, by the Spokes shape

`ClustersGenerateOptions.upstreamLooseGate` reproduces the pre-tier gate exactly —
one solve at the deeper rung, accept on completion — and is set in
`clusters-differential.test.ts` and nowhere else. The frozen C fixtures therefore
still byte-match, so the assertion that validates the generator, the solver's
exact deductive power and the run-length codec together is intact; nothing was
re-founded or re-recorded (which, post-`retire-c-engine`, would be impossible).

The oracle's blind spot is stated where it lives: the `if (loose)` branch and the
tier arithmetic under it. That is covered instead by the two tier properties (an
Easy board falls to level 0; a Tricky board does not and falls to level 1) and by
a test asserting the flag still reproduces the *defect* — over fixed seeds the
loose gate hands out boards needing no lookahead, and the honest gate never does.
A flag that had silently become equivalent to the honest path would pass a
byte-match test against nothing.
