# add-tracks-hint — tasks

Scaffolded by `characterize-the-hint-assessment-corpus` (2026-09-09). Not
started. Read [`docs/games/hints.md`](../../../docs/games/hints.md) first — it is
the procedure; `AGENTS.md` § "Hint quality bar" is the bar.

## 0. Take the baseline before writing a line

- [ ] 0.1 Re-read
      [`archive/2026-09-09-characterize-the-hint-assessment-corpus/audit.md`](../archive/2026-09-09-characterize-the-hint-assessment-corpus/audit.md)
      §2.2. The
      control is Galaxies: **+1,138 game lines, of which +387 is the recording
      projection**. That is the number this change is measured against.
- [ ] 0.2 Record the starting line counts of `src/games/tracks/*.ts` so the
      final figure is a measurement rather than a recollection.

## 1. The recording projection — the part that is the measurement

- [ ] 1.1 Decide how a firing reports **what** it did, not merely that it did.
      Two shapes exist in the tree: Filling's optional recorder threaded into the
      solver (the generator path allocating nothing), and Clusters/Subsets/Undead's
      parallel recorder. **Try the threaded shape first**, because that is the
      one the framework's claim depends on; fall back with a stated reason.
- [ ] 1.2 The generator path must be **byte-identical**. `tracks-differential.test.ts`
      is the proof, and a moved fixture means the hint reached the generator.
- [ ] 1.3 Run from the **player's current marks**, not from a reset board — a
      hint continues from where the player is.
- [ ] 1.4 Confirm the ladder order the hint walks is the order it should
      *teach*. Clusters deliberately diverged (restart the scan after each
      firing; take the shortest forcing chain); Tracks may or may not need to.
      Say which, and why.

## 2. Narration — seven rungs, and not the eighth

- [ ] 2.1 One sentence per rung explaining **why the move is forced**, from
      premises the sentence itself states. `update-flags`, `count-clues`,
      `check-loop`, `check-loose-ends`, `check-neighbors`,
      `check-neighbors-both-ways`, `check-bridge-parity`.
- [ ] 2.2 **Nothing for `check-single`** — it fires on no board this generator
      produces (324 solves, zero firings; verified line-for-line against
      `tracks.c`). Do not narrate it and do not "fix" it.
- [ ] 2.3 One firing = one multi-leg journey (`continuesPrevious`), equivalent
      moves share a color, no em dashes in narration
      (`retire-the-em-dash-from-hint-narration`).
- [ ] 2.4 Claim only what is checked. Every sentence a hint utters is a claim.

## 3. The overlay

- [ ] 3.1 Tracks marks **edges**, and the prediction is that this is cheap:
      `hint-mark.ts`'s bands are cell-*border* marks and Palisade already marks
      an edge by banding both cells that share it. If Tracks cannot reuse them,
      **that is a finding about the shared mark vocabulary** (24 of 30 hinting
      games depend on it) and belongs in `docs/games/hints.md`.
- [ ] 3.2 Ship a tier-2.5 render scenario (`renderScenario` + targeted op
      assertions + a snapshot), per `AGENTS.md` § "Test discipline".

## 4. Report the number — this is a deliverable, not a postscript

- [ ] 4.1 Game production lines added, **split out: how many are the recording
      projection**. Compare against Galaxies' +1,138 / +387.
- [ ] 4.2 Engine lines added. The last four deductive hints added zero; a
      non-zero figure here is a finding either way.
- [ ] 4.3 Answer the falsifier in the proposal, in one paragraph, **whichever
      way it goes**. A result that closes `docs/framework-rdd/` is as good an
      outcome as one that vindicates it, and per the repo-layout spec the verdict
      is marked in place at the claim it corrects — `deduction.md`'s banner and
      `README.md` § "Where this stands".
- [ ] 4.4 **Write the spec delta and delete `.openspec.yaml`'s `skip_specs`.**
      A `tracks` requirement for the hint, with scenarios naming the deductions
      it actually narrates. The marker is deliberately temporary and says so; a
      change that archives still carrying it has skipped a deliverable.
- [ ] 4.5 Keep `docs/games/hints.md` current in this same change — that is part
      of "done", not a chore. Anything the guide did not tell you, or got wrong
      by omission, goes back into it.

## 5. Acceptance

- [ ] 5.1 **Run the app.** A green suite is not a rendered frame, and a hint is
      wording a player reads. Owner-accepted, not self-archived.
- [ ] 5.2 Update `help/games/tracks.md` if the hint changes what a player can do.
- [ ] 5.3 `openspec validate --all --strict`, then the gate.
