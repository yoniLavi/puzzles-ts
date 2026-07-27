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
