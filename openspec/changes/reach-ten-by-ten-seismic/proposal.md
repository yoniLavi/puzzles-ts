# reach-ten-by-ten-seismic

## Why

**Seismic still cannot generate the size the puzzle is normally played at**, and
that is the half of its author's complaint that is still open.
`puzzles/unreleased/docs/seismic.md` read:

> *"This puzzle is playable on lower sizes, but has a near-zero chance of
> generating sizes higher than 7x7. The generator step that creates randomly
> filled regions needs to be completely replaced with a different approach."*

and the `.c` added the size that matters: *"10x10 is a common size for Hakyuu
puzzles."*

`replace-seismic-region-generator` (archived 2026-07-28) fixed the headline
defect — **7×7 went from 24.9 s to 108 ms**, with the 28-fixture byte-match
oracle intact — and then measured the rest honestly and stopped. Nine region-size
distributions were tried against 10×10; the best managed 34 fills per 100
partitions, and only by pushing mean region size to 4.45 against upstream's 2.62,
i.e. by changing what a Seismic board looks like at every size. Small-region
distributions are *provably* infeasible there: mean size 2.26 puts 44 `1`s on a
10×10 against a hard ceiling of 50, since no two `1`s may be orthogonally
adjacent. The shipped bound is `MAX_CELLS = 64`, so **10×10 is offered in neither
mode**.

The reason is structural, not a tuning miss: Seismic's keep-apart rule scales
with the number's *value*, so packing stays near capacity at every board size.
Lifting it needs a different fill algorithm and a faster clue-stripping stage —
which is a project, and is why it was dropped from that change by owner agreement
rather than attempted inside it.

## What Changes

- **Replace the region fill with a construction that cannot fail**, rather than a
  generate-and-reject loop: build regions that hold `1..k` by construction (a
  constraint-guided partition, or a repair pass that fixes an infeasible region
  instead of discarding the whole partition), so success stops being a lottery
  whose odds fall with area.
- **Make clue-stripping scale with it.** The archived measurements name the
  stripping stage as the second cost at 10×10; a fill that succeeds is not enough
  if stripping then dominates.
- **Raise `MAX_CELLS` to what the new algorithm actually reaches**, measured, in
  both Seismic and Tectonic modes — and keep it a bound, not an aspiration.
- **Accept the loss of the byte-match oracle on the generator path, deliberately
  and recorded.** Changing the fill changes every board; the differential has to
  be re-founded on solvability and uniqueness of the boards produced, plus the
  solver's own unchanged fixtures. This is the trade `feedback_byte_parity_scope`
  allows: byte-parity is a tool, and here it is being spent to buy the size the
  puzzle is played at.

## Impact

- Affected specs: `seismic` (the generation bound, and the parity basis).
- Affected code: `src/native/games/seismic/{generator,state}.ts` and its
  differential fixtures.
- Every generated Seismic board changes. Existing game IDs that carry a
  description still load; a bare `params#seed` produces a different board.
