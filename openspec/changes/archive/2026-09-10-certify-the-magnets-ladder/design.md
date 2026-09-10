# certify-the-magnets-ladder — findings

The proposal was right that there was no design decision. There were two
findings, and both belong to the next reader of a ladder test.

## D1. `neither` is dead as a deduction — in the C too

The census fired every rung but `neither`, in both ladders, over 40 clued and
120 unnumbered solves. Read against `magnets.c` before writing the ledger, as
task 3.1 requires:

- `solve_neither` tests "both ends of a domino NOT-positive (or both
  NOT-negative)". The port is line for line.
- The only writer of a NOT bit is `solve_unflag`, and it always writes the
  **pair**: NOT-`which` on one end, NOT-*opposite* on the other, because a
  domino's poles are opposite. Also line for line.
- So an end that is NOT-positive has a partner that is NOT-negative; a partner
  that is *also* NOT-positive therefore carries both bits — which is
  `solve_force`'s test, one rung earlier. Every board `neither` would deduce
  on, `force` has already deduced on and restarted the ladder.

The rung is not deleted, because it keeps one role the census cannot see: a
`−1` on an end carrying all three NOT bits, which `force` matches nothing
against. Whether the generator ever reaches that is unmeasured, and a rung that
might turn an "impossible" into an "ambiguous" is a rung the byte-match
depends on. The ledger entry records both halves.

**The general lesson**: an `unreached` entry can be *structural* rather than a
corpus shortfall, and the harness's "empty is the goal" is then not a target
but a diagnosis — the C carries the same dead rung.

## D2. Fifteen boards certified the ladder and not its tiers

The first corpus (5 shapes × 3 seeds) passed every equivalence check, and then
**stayed green with `advancedfull` mis-tiered to Easy** — while the frozen
differential caught the same plant on one fixture in twenty. A mis-tiered rung
shows only at a cap that excludes it, on a board where it is the first rung of
its tier to fire from the lower tier's stall; none of the nine Tricky boards in
the corpus were such a board.

Widening to 8 shapes × 8 seeds makes all four Tricky rungs' plants red
(`advancedfull` 8 boards, `nonneutral` 40, the two counting rungs 12 each) at
a cost of ~0.35 s. The test file's comment carries the number and the reason.

**The general lesson**: task 4.2's "mis-declare a tier, it must go red" is the
one check that sizes the corpus, and it has to be run *per Tricky rung* — the
cap walk (task 2.3) is the mechanism, but only a plant tells you whether the
boards reach it. Tracks' entry in the harness header recorded the same shape
for rung deletion; this is the tier-side twin.
