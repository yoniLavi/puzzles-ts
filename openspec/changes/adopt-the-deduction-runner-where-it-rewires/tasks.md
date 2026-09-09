# adopt-the-deduction-runner-where-it-rewires — tasks

Seven games, one commit each, the same three checks every time. The order is by
how exactly each already writes the runner's shape, so the exemplar is the
easiest and the argument gets harder as it goes — if the bar is going to break,
it should break where the reasoning is visible rather than on game seven.

## 1. Tracks — the exemplar

- [ ] 1.1 Read `tracksSolve`'s eight rungs and their tiers; write them as
      `{ id, tier, run }` declarations, ids stable and greppable.
- [ ] 1.2 Confirm the grade means the same thing. Tracks bumps `maxDiff` only
      inside a fired branch, so *highest tier that fired* and its own number
      coincide — state that at the site rather than assuming it.
- [ ] 1.3 `tracks-differential.test.ts` byte-unchanged, and the whole Tracks
      suite green. **A moved fixture ends the adoption; it is never re-recorded.**
- [ ] 1.4 Prove the wiring is live, not decorative: break one rung's tier and
      watch the differential go red, then restore. A rewiring nobody has seen
      fail is a rewiring nobody has seen work.

## 2. The remaining six

Same three checks each. Recorded here rather than in six change directories
because the reasoning is genuinely identical — the condition `AGENTS.md` sets
for bundling.

- [ ] 2.1 **Seismic** (3 rungs). Its `diff = Math.max(diff, DIFF_HARD)` sits
      *before* the only Hard technique, so it reads as "deepest tier reached";
      show that not firing there ends the solve, which makes the two gradings
      the same number.
- [ ] 2.2 **Subsets** (5 rungs) — cap already passed *into* a technique
      (`applyArrowsAdvanced(..., maxdiff >= DIFF_TRICKY)`), which is the
      guards-itself convention rather than a new runner option.
- [ ] 2.3 **Rome** (7 rungs) — carries its own iteration guard; check it against
      the shared step budget rather than keeping both.
- [ ] 2.4 **Ascent** (9 rungs) — takes a cap and returns no grade, so only the
      solve projection is in scope; `solverOverlap` is conditionally available
      (`diff >= HARD || mode === MODE_EDGES`) and guards itself.
- [ ] 2.5 **Galaxies** (4 rungs, one tier) — already threads a `SolverRecorder`
      for its hint. Adoption must not lose a word of that hint's narration;
      if the shared recorder cannot carry it, **Galaxies stays out** and the
      reason is recorded. (`AGENTS.md`: an exemplar hint never loses a word to
      an abstraction.)
- [ ] 2.6 **Bridges** (3 stages) — stages sweep all islands before restarting,
      which is the runner's contract at the *ladder* level but worth confirming
      does not change order within a stage.

## 3. Report

- [ ] 3.1 Update `docs/games/solver-and-generator.md` § "The deduction fixpoint"
      with the new call-site count and any game that fell out with its reason.
- [ ] 3.2 Update `deduction-fixpoint.ts`'s header: it records the hatch cases,
      and the population it is measured against has changed.
- [ ] 3.3 State the *hint* result, which is the point: after adoption, what does
      it cost to give one of the five hintless adopters a hint? If the answer is
      "the same as before", say so plainly — that is the measurement that closes
      `docs/framework-rdd/` for good.

## Findings

_(none yet — not started)_
