# adopt-the-deduction-runner-where-it-rewires — tasks

Seven games, one commit each, the same three checks every time. The order is by
how exactly each already writes the runner's shape, so the exemplar is the
easiest and the argument gets harder as it goes — if the bar is going to break,
it should break where the reasoning is visible rather than on game seven.

## 1. Tracks — the exemplar

- [x] 1.1 The eight rungs declared as `{ id, tier, run }`, ids stable and
      greppable, in `tracksLadder`.
- [x] 1.2 Grade confirmed to mean the same number: `maxDiff` was bumped only
      inside a fired branch, so it already meant *highest tier that fired*.
      Recorded at the site, with the contrast to Boats' "deepest tier reached".
- [x] 1.3 `tracks-differential.test.ts` byte-unchanged and the whole Tracks suite
      green.
- [x] 1.4 **Proved the wiring is live** — and this is where the change earned its
      keep. See § Findings: the differential *does* catch a mis-declared tier
      (eight cases red), but **cannot catch a deleted rung**, because one rung
      fires nowhere. So the adoption is proved by a new equivalence test rather
      than by the fixtures alone.
- [x] 1.5 `tracks-ladder.test.ts`: the old loop kept as `tracksSolveLegacy`, and
      the two required to agree on verdict, grade **and final board state**, over
      20 boards × 3 caps, with a firing census asserted against a named
      shortfall.

## 2. The remaining six

Same checks each, **plus 1.5** — the equivalence oracle is now part of the bar,
because Tracks showed a byte-match differential can pass over a rewiring it
cannot see.

- [ ] 2.1 **Seismic** (3 rungs). Its `diff = Math.max(diff, DIFF_HARD)` sits
      *before* the only Hard technique, so it reads as "deepest tier reached";
      show that not firing there ends the solve, which makes the two gradings
      the same number.
- [ ] 2.2 **Subsets** (5 rungs) — cap already passed *into* a rung
      (`applyArrowsAdvanced(..., maxdiff >= DIFF_TRICKY)`), which is the
      guards-itself convention rather than a new runner option.
- [ ] 2.3 **Rome** (7 rungs) — carries its own iteration guard; check it against
      the shared step budget rather than keeping both.
- [ ] 2.4 **Ascent** (9 rungs) — takes a cap and returns no grade, so only the
      solve projection is in scope; `solverOverlap` is conditionally available
      (`diff >= HARD || mode === MODE_EDGES`) and guards itself.
- [ ] 2.5 **Galaxies** (4 rungs, one tier) — already threads a `SolverRecorder`
      for its hint. Adoption must not lose a word of that hint's narration; if
      the shared recorder cannot carry it, **Galaxies stays out** and the reason
      is recorded.
- [ ] 2.6 **Bridges** (3 stages) — stages sweep all islands before restarting,
      which is the runner's contract at the *ladder* level but worth confirming
      does not change order within a stage.

## 3. Report

- [ ] 3.1 Update `docs/games/solver-and-generator.md` § "The deduction fixpoint"
      with the new call-site count and any game that fell out with its reason.
- [ ] 3.2 Update `deduction-fixpoint.ts`'s header — it lists its call sites by
      name and the list has changed.
- [ ] 3.3 State the *hint* result, which is the point: after adoption, what does
      it cost to give one of the five hintless adopters a hint?

## Findings

### Tracks adopted, and the fixtures could not certify it

The rewiring is exact: 20 generated boards × 3 caps, and the runner-driven
ladder agrees with the hand-written loop on verdict, grade **and every bit of
the final board**. That is a stronger statement than the differential makes,
which compares a generated desc against a C recording and never looks at the
solver's working state.

**The differential is not weak — it has one blind rung, and so does everything
else.** Asked to fail, it does: mis-declare `check-neighbors-both-ways` as
Tricky and eight of its cases go red immediately. But **delete `check-single`
entirely — from the new ladder or the old loop — and all 39 Tracks tests stay
green.**

The reason is not the tests. **That rung fires nowhere.** Measured over 324
solves spanning 36 shape/tier/single-ones combinations: `update-flags` 6275,
`count-clues` 1673, `check-neighbors` 501, `check-loop` 329, `check-loose-ends`
78, `check-neighbors-both-ways` 35, `check-bridge-parity` 20 — and
`check-single` **zero**.

**Checked against the C before drawing any conclusion**, because "an unreachable
deduction" is exactly the kind of finding that turns out to be a porting bug.
`tracks.c`'s `solve_check_single_sub` is reproduced line for line, both guards
included (`ctrack != target-1`, `nperp > 0 || n1edge != 1`). It is upstream's
narrowest rule — a line with one square left to fill and nowhere perpendicular
to run — and the boards this generator produces never reach it. Recorded in
`tracks-ladder.test.ts`'s `UNREACHED` as a live shortfall with its reason, not
as an exemption.

### What this changes about the bar for the remaining six

The proposal's rule 2 was *every frozen fixture byte-unchanged*. Tracks shows
that is **necessary and not sufficient**: a fixture corpus certifies only the
rungs it fires, and it cannot tell you which those are. So each remaining
adoption ships its own equivalence test against the legacy loop, with a firing
census. That is one extra file per game and it is the difference between
proving the rewiring and hoping.

### A smaller thing worth carrying

`tracksSolve` gained an optional `onFiring` callback purely as a test seam. It is
three lines and no work when absent, but it is per-game surface added for a
test — and `runDeductionFixpoint` already counts firings internally for its
budget attribution. **If a second game wants the same census, return the tally
from the runner instead** and delete both seams. Not done here because this
change's own first rule is that the runner's contract does not move.
