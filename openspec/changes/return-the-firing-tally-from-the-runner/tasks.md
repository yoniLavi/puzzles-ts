# return-the-firing-tally-from-the-runner — tasks

- [ ] 1.1 Decide the opt-in shape in `design.md` — a `countFirings` flag or a
      caller-supplied sink — honoring the runner's existing rule that the
      generator path allocates nothing.
- [ ] 1.2 Return the tally from `runDeductionFixpoint`; reuse the `firings` map
      it already keeps for budget attribution rather than adding a second one.
- [ ] 1.3 Teach `ladder-equivalence.ts` to read the tally, and drop `viaRunner`'s
      `onFiring` parameter from its spec.
- [ ] 1.4 Delete the seam and the six-line wrapper from all seven adopters:
      tracks, seismic, subsets, rome, ascent, galaxies, bridges.
- [ ] 1.5 Every ladder-equivalence test and every frozen differential unchanged.
      **The census must still name the same two unreached rungs** — Tracks'
      `check-single` and Rome's `naked-pairs`. A tally that quietly stopped
      counting would empty those ledgers and read as progress.
- [ ] 1.6 Prove it can fail: neuter one rung and confirm the census goes red, as
      the seams' version did.

## Findings

_(none yet — not started)_
