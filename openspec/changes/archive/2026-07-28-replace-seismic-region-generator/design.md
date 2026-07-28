# Design — replace-seismic-region-generator

## Context

Upstream's `seismic_gen_areas` is the whole problem, and it is worth being
precise about *why* it fails, because the failure mode dictates the fix.

The generator runs in two steps. First `seismic_gen_numbers` fills a complete,
legal solution over singleton regions (shuffle the cells, drop the lowest legal
number into each). Then `seismic_gen_areas` shuffles the list of borders and, for
each, merges the two regions it separates **iff they share no number** — and only
at the very end asks whether every region's number set equals `{1..k}` for its
size `k`. If any does not, the entire board (numbers and all) is thrown away and
the pipeline restarts.

The merge rule is the bug. "Share no number" is far weaker than the invariant the
result must satisfy: merging a `{1}` region with a `{3}` region is permitted and
produces a size-2 region holding `{1, 3}`, which needs `{1, 2}` and can never be
repaired — every later merge only adds more numbers. So the algorithm cheerfully
walks into dead states and finds out at the end. The chance that a random merge
order avoids *every* such trap across the whole grid is what collapses with size:

| cells        | 16   | 25    | 36      | 48       | 49        | 56 | 64 |
|--------------|------|-------|---------|----------|-----------|----|----|
| success rate | 1/22 | 1/191 | 1/4,167 | 1/66,667 | 1/200,000 | 0  | 0  |

Note the *shape* dependence too, which rules out the obvious cheap patches: 4×12
and 6×8 are both 48 cells, but 4×12 succeeded 3 times in 200,000 and 6×8 not at
all. The ceiling tracks cell count, and neither a width bound nor a height bound
expresses it — which is why the port bounded `w · h` instead.

**A local repair to the merge rule is not enough.** Tightening the condition to
"the union is downward-closed from 1" (i.e. `SA ∪ SB === {1..|SA|+|SB|}`) sounds
like it makes the invariant hold at every step, but it cannot: a singleton cell
holding a `3` has the set `{3}`, which is not downward-closed, so the invariant is
already false at initialisation. The numbers were chosen before the regions
existed, and *that* ordering is the real defect. Hence D1.

## Decisions

### D1 — Partition first, then fill: the numbers follow the regions

Invert the two steps.

1. **Partition** the grid into connected regions of sizes drawn from `1..maxSize`
   (`maxSize` = 5 in Tectonic, where every region is exactly 5; ≤ 9 in Seismic).
   This is an ordinary random connected partition and always succeeds — no
   number constraints are in play yet.
2. **Fill** the partition: assign each region's cells a bijection onto `1..k`,
   subject to the mode's keep-apart rule across region boundaries.

Step 2 is a constraint problem, and the port already contains the propagator for
it: **`solver.ts`'s `placeNumber` is exactly the propagation the fill needs** —
place `n` at a cell, strike `n` from the cells the keep-apart rule forbids it in,
and strike it from the rest of that cell's region. And `solverInit` already seeds
every cell's candidates to `areaBits(regionSize)`. So the fill is:

```
seed candidates from the partition
loop:
  pick the empty cell with the fewest candidates   (most-constrained-first)
  if it has none            -> backtrack
  try its candidates in random order, placing via placeNumber
```

with a bounded backtrack budget. This is a genuinely different algorithm from
upstream's, but it is *built from upstream's own propagation*, which is the point:
the rules it enforces are the ones the solver already agrees with, so a filled
board is valid by the same code that judges it.

**Why this terminates fast where the C does not.** Upstream discards a whole
board on the first bad merge; here a bad choice costs one backtrack. And the
structural dead-ends upstream falls into cannot arise at all, because the region
sizes are fixed before any number is placed — a region of size `k` is asking for
`1..k` from the start rather than discovering at the end that it holds `{1, 3}`.

**Open for the implementer to measure, not decide up front:** the size
distribution the partition draws from. Upstream's emergent distribution (from
merging) is not obviously the nicest to play, and it is now a free parameter. Pick
it by generating boards and looking at them, and record what was chosen and why —
this is display-adjacent taste, not fidelity, and there is no oracle for it.

**`divvyRectangle` (`engine/divvy.ts`) is NOT reusable here** — it partitions into
regions of *exactly* `k` cells (Palisade's rule), and Seismic needs a mix of sizes
`1..9`. Recording the no-go so it is not re-evaluated: reach for it only if the
implementation finds a way to express variable sizes through it, which looks
unlikely. A bespoke grower (seed a cell, accrete random adjacent free cells to the
drawn size, restart the region if it strands an unreachable pocket) is ~40 lines.

### D2 — Keep the clue-stripping and grading stages exactly as they are

`genClues` (strip a clue while the board still solves at the target difficulty)
and `genDiff` (accept only if soluble at `diff` and *not* at `diff − 1`) are
untouched, for three reasons: they are not the bottleneck (the fixture timings
show the cost is all in the retry loop above them), they are what makes the
output a puzzle rather than a filled grid, and they are the part of the pipeline
whose correctness the byte-match differential is still going to be checking (D3).

Consequence worth stating: **the difficulty curve may shift**, because these
stages now operate on boards drawn from a different distribution of region
layouts. That is expected and acceptable — the *definitions* of Easy and Hard are
unchanged (they are the solver's rungs, untouched), so a board graded Hard is
still exactly "needs the trial-placement deduction". Sanity-check the mix by
generating a sample at each preset and confirming both bands are populated and
neither becomes degenerate.

### D3 — Keep the byte-match oracle: upstream's grower survives behind a flag

The differential is what validates the solver, the codec and the clue-stripping
loop; giving it up to change the grower would be paying far too much. So take the
shape `add-spokes-ts-port` established:

- `newSeismicDesc` takes an options object with `upstreamRegionGrower?: boolean`.
- **Only `seismic-differential.test.ts` sets it.** All 28 frozen fixtures keep
  matching the C byte-for-byte, so every stage the flag does not cover keeps its
  oracle.
- The shipped path (flag off) is the new grower, covered by the property tests in
  D4 instead.
- **Plus a test asserting the flag actually changes the output** for some seed.
  Without it the oracle can silently decay into re-testing the shipped path — the
  failure mode the Spokes change called out explicitly.

The cost is carrying upstream's `genNumbers`/`genAreas` as dead-in-production
code. That is the deliberate trade, and it should be commented as such at both
definitions so a later reader does not "clean up" the unused branch and quietly
delete the oracle.

### D4 — What replaces the byte-match for the new grower

The byte-match was doing a lot of work implicitly. State the guarantees
explicitly and test them directly (property tests over a fixed seed sweep, so the
work and the verdict are identical every run — playbook §5.2):

- **Structural**: every region is connected; every region of size `k` holds
  exactly `{1..k}`; no region exceeds the mode's maximum.
- **Rules**: the mode's keep-apart rule holds across the whole filled solution
  (Seismic: two `Z`s at least `Z` cells apart on a row/column; Tectonic: no two
  equal numbers even diagonally adjacent).
- **Puzzle**: every generated description is uniquely soluble, at exactly the
  requested difficulty band (soluble at `diff`, not at `diff − 1`), and
  round-trips through the codec.
- **Determinism**: same seed ⇒ same description.

### D5 — Re-derive the size bound; do not just delete it

`MAX_CELLS = 49` exists because 56+ cells measurably never generated. If the new
grower reaches 10×10 and beyond, the bound must move — but **re-measure rather
than removing it on faith**. There may still be a ceiling (a very large board's
fill could backtrack heavily, or the *clue-stripping* stage's cost — `O(cells)`
solver runs, each `O(cells²)` — may become the new wall long before the grower
does). Whatever the measurement says, keep a bound there with its reason, or
state in the code why none is needed. The Custom dialog explaining a real limit
is strictly better than a board that takes a minute.

Also re-time the **presets** after the change: the whole point is that 7×7 stops
costing 12–28 s, so record the new numbers the way the port recorded the old ones.

## Risks

- **The fill can still fail** on an unlucky partition (a region shape that cannot
  be legally numbered given its neighbours). Expected and cheap — retry the fill,
  then re-partition, both bounded by `retryLimit` with a labelled error. Measure
  the rates; if a *particular* configuration proves systematically impossible
  rather than unlucky, that is a `validateParams` rejection, not a bigger retry
  budget (playbook §4).
- **Shared `#seed` game IDs change.** Called out in the proposal's Impact; a
  deliberate one-time break, and `:desc` IDs and saves are unaffected.
- **The difficulty mix may shift** (D2). Not a defect if both bands stay
  populated; check it rather than assuming.
- **Scope creep toward "fix the solver too".** Resist. The solver's strength
  defines the difficulty tiers and is validated by the surviving byte-match;
  changing both at once would leave neither attributable.

## Open questions for the owner

1. **Which sizes should become presets?** 10×10 is the author's stated target and
   the common Hakyuu size. Whether to add it in both modes, and whether to keep
   4×4 (which becomes near-instant and is arguably too small to be interesting),
   is a taste call best made against real generated boards. Recommendation: add
   10×10 in both modes and both difficulties, leave the existing twelve alone.

---

# Findings (implementation, 2026-07-28)

## F1 — The headline result: 7×7 went from 25 seconds to under 150 ms

The defect this change exists to fix is gone. Measured end-to-end on the same
box, same code path, before and after:

| configuration      | before   | after   |
|--------------------|----------|---------|
| Seismic 7×7 Easy   | 9,399 ms | 8 ms    |
| Seismic 7×7 Hard   | 24,906 ms| 108 ms  |
| Tectonic 7×7 Hard  | 7,337 ms | 234 ms  |
| Seismic 6×6 Hard   | 543 ms   | 22 ms   |

The 28-fixture byte-match differential still passes **unchanged**, because
upstream's stages are retained behind `upstreamRegionGrower` (D3 worked exactly
as designed).

## F2 — D1's open question, resolved by decoding the C's own boards

D1 left the region-size distribution deliberately open ("no oracle for it"). It
turned out there *is* a usable anchor: region layout is emergent in the C and so
unreadable from its source, but it is recoverable from the 28 frozen
descriptions. Decoding them gives upstream's realised distribution:

- **Seismic**: mean 2.62 — `1:28.4% 2:16.8% 3:27.7% 4:20.0% 5:5.8% 6:1.3%`,
  never above 6 despite numbers running to 9.
- **Tectonic**: mean 4.23 — `5:63.5%` dominant, with a small tail.

Shipped: `SEISMIC_REGION_SIZES = [2,3,3,4,4,5]` (draw mean 3.5, realised 3.56),
and Tectonic always aims at 5 (realised 4.56, `5:85.2%`). Aimed slightly larger
than upstream because the realised distribution comes out below the draw (regions
stop early when they run out of free neighbours), and deliberately *not* matched
exactly — upstream's 28% singletons are its least interesting cells, since a
size-1 region is forced to `1` and is therefore a free given.

## F3 — **D1's fill was too weak as designed; it needed the solver's Hard-rung test**

D1 specified "most-constrained-first, place via `placeNumber`, bounded
backtracking". Implemented literally, that thrashes: `placeNumber` only does
forward-checking, and Seismic's keep-apart rule lets a placement starve a
*distant* region of its last home for some number without touching any cell the
placement itself looks at. The search then discovers the dead end many levels
deeper.

The fix is to reuse **`solverAttempt`'s inner feasibility check** as the pruning
rule — after every placement, verify each region can still house every number it
owes. This is more of D1's own principle, not less: the fill is now built from
*two* pieces of the solver's propagation rather than one. It cut Seismic 5×14
from 2,731 ms to 211 ms and 7×7 Easy from 26 ms to 8 ms.

## F4 — **10×10 Seismic is NOT reachable. The proposal's central promise is not met.**

This is the one goal that failed, and it is worth recording precisely because the
proposal, the spec and `audit-author-known-issues` all lead with it ("10×10, the
size the puzzle is normally played at, is unreachable").

**It is still unreachable in Seismic mode.** Nine region-size distributions were
measured against 10×10, 100 partitions each, against the real fill:

| table                     | 10×10  | 12×12 | 14×14 | mean region |
|---------------------------|--------|-------|-------|-------------|
| shipped `[2,3,3,4,4,5]`   | 0/100  | 0/100 | 0/100 | 3.29        |
| upstream-ish `[1,1,2,3,3,4]` | 0/100 | 0/100 | 0/100 | 2.26      |
| `[1,1,2,2,3,4,5,6]`       | 1/100  | 0/100 | 0/100 | 2.79        |
| `[1,1,2,3,4,5,6,7,8]`     | 12/100 | 8/100 | 0/100 | 3.71        |
| `[3,4,5,6,7]`             | 34/100 | 2/100 | 0/100 | 4.45        |

The best result costs a mean region size of 4.45 against upstream's 2.62 —
visibly changing what the puzzle looks like at *every* size, for a configuration
that still collapses at 12×12 and costs 435 ms per attempt.

**Why, structurally.** Seismic's keep-apart rule scales with the *number's value*,
not the grid: an `n` bars the `n` cells either side on both axes. Board-wide
capacity for value `v` is ~`cells/(v+1)` in each of rows and columns, while demand
is `cells·P(size ≥ v)/meanSize`. **Both are linear in area, so the packing
difficulty does not ease off on a larger grid** — it sits near 80% of capacity at
every size, and rows and columns must be satisfied simultaneously.

Two corrections to intuitions held during implementation, both worth keeping:

1. **Smaller regions make it worse, not better.** Mean size 2.26 puts 44 `1`s on a
   10×10 against a hard ceiling of 50 (no two `1`s orthogonally adjacent) —
   *provably* infeasible, not merely hard. The timings show it: small-region
   tables fail in ~20 ms (the search **proves** UNSAT) while large-region tables
   fail in ~20 s (the search merely struggles).
2. **A low per-fill success rate is not itself a problem.** Seismic 7×7 fills only
   2 times in 60 yet generates end-to-end in ~40 ms, because an attempt costs
   ~1.4 ms. End-to-end time is the only honest measure; per-fill rates mislead.

**Lifting Seismic further needs a different fill algorithm** (conflict-directed
backjumping, or restarts with value-ordering), not a tuned constant. That is a
change of its own and was not attempted here.

## F5 — D5 resolved: the bound is per mode, and both halves moved

`MAX_CELLS = 49` became `MAX_CELLS_SEISMIC = 72` and `MAX_CELLS_TECTONIC = 100`,
each measured end-to-end rather than inferred. A single bound could not express
the result: the modes are limited by different mechanisms (Seismic by the
value-scaled keep-apart packing, Tectonic by the clue-stripping loop's
`O(cells)` solver runs at `O(cells²)` each — D5 anticipated exactly this).

| cells | Seismic Easy | Seismic Hard | Tectonic |
|-------|--------------|--------------|----------|
| 64    | 265 ms       | 1.4 s        | fast     |
| 72    | 5.4 s        | 1.7 s        | 0.13 s   |
| 80–84 | 1.3–6.9 s    | **fails**    | ~4.7 s   |
| 100   | fails        | fails        | 5.6 s    |
| 121   | fails        | fails        | 42 s     |

72 is the largest Seismic area where both difficulties generate; 100 is where
Tectonic's cost is still tolerable. **Tectonic 10×10 is therefore reachable and
shipped as a preset** — so the author's target size is met in one of the two
modes, which is the honest partial result.

Presets added: Seismic 8×8 (Easy + Hard), Tectonic 10×10 (Easy + Hard).

## F6 — Scope trimmed with the owner's agreement

Mid-implementation the owner offered to drop or simplify any part that proved
hard, since "we don't really have to fix every upstream issue now". The Seismic
10×10 goal (F4) is the part dropped. Everything else in the proposal landed: the
constructive generator, the preserved oracle, the property tests, the re-derived
bounds, and larger presets.
