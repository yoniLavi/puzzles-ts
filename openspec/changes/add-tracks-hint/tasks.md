# add-tracks-hint — tasks

Read [`docs/games/hints.md`](../../../docs/games/hints.md) first — it is the
procedure; `AGENTS.md` § "Hint quality bar" is the bar. The measurement this
change exists to take is [`findings.md`](./findings.md).

## 0. Take the baseline before writing a line

- [x] 0.1 Re-read
      [`archive/2026-09-09-characterize-the-hint-assessment-corpus/audit.md`](../archive/2026-09-09-characterize-the-hint-assessment-corpus/audit.md)
      §2.2. Control: Galaxies, **+1,138 game lines, of which +387 is the
      recording projection**. Also checked *how* it was counted — raw
      `git diff --numstat` on production files, not code-only, which is what
      made the comparison in `findings.md` §1 valid rather than a factor of 1.4
      out.
- [x] 0.2 Baseline recorded: `generator` 235, `index` 386, `moves` 183,
      `render` 625, `solver` 697, `state` 660 = **2,786 production lines**.

## 1. The recording projection — the part that is the measurement

- [x] 1.1 **Threaded, as the task asked**, and it fits: every one of the eight
      rungs changes the board through `setSflag` / `setEflag` and nothing else,
      so the *what* of a firing costs two `if (b.rec)` pushes. The recorder rides
      on `Board` because the board *is* Tracks' solver state (the Singles
      precedent). No fallback was needed. What the *runner* supplied on top is
      the single-firing driver, out of `settled` and `beforeTechnique` — see
      `findings.md` §2.
- [x] 1.2 Generator path byte-identical; `tracks-differential.test.ts` passes
      unedited. Every reason is built behind `const rec = b.rec; if (rec)`,
      because a reason carries evidence and some of it costs a full-board scan.
- [x] 1.3 Runs from the player's current marks (`stateToBoard(state)`), capped at
      the board's own tier rather than `DIFF_COUNT` — that is the tier the
      generator certified, and every rung is monotone in what is already marked.
- [x] 1.4 **Ladder order kept, and the reason is that Tracks is not Spokes.**
      Spokes reorders because its rule-outs are busywork beside its connections;
      in Tracks, blocking a side *is* how a player narrows the board, and the
      order is the tier order, so reordering would also decouple the plan from
      the grade. What was taken from Spokes instead is the other half of that
      section: **three of `update-flags`' five rules advance nothing the board
      does not already show, and are applied without being shown**
      (`findings.md` §4). This first said two; the owner's playtest found the
      third, and `show-only-informative-hint-steps` moved the filter into the
      shared plan loop.

## 2. Narration — seven rungs, and not the eighth

- [x] 2.1 One sentence per **premise**, which turned out to be twelve rather than
      seven: a rung holds several teachable rules (`findings.md` §3).
- [x] 2.2 Nothing for `check-single`. It stays in the hint's ladder and declares
      no reason, so a firing of it would be hidden; `tracks-hint.test.ts` holds
      every reason-less firing to being evident, which its real conclusions are
      not, so it cannot start firing unnoticed. (This first used a silent-rung
      tally; `show-only-informative-hint-steps` replaced it.)
- [x] 2.3 One firing = one step, with a multi-op move where one premise forces
      several squares (the Filling shape), and `hintKeepTrack` shrinking the step
      in place as the player places them one at a time. No em-dashes.
- [x] 2.4 Claims checked: every narration's counts are read off the firing's own
      evidence, and `tracks-hint.test.ts` asserts the picture holds exactly the
      number the sentence states for the clue-is-met and parity steps.
      Degenerate extremes (a clue of 0 and of 1, a full-width line, a parity
      block with nothing marked) are read directly through `narrate`.

## 3. The overlay

- [x] 3.1 **The prediction was half right, and the other half is a finding.**
      `hint-mark.ts`'s bands took the ring and the evidence contour with no
      change at all (`outer: 0, inner: gridLineAll` — the band sits on the grid
      line, so the cell's own repaint undoes it). What they could not carry is a
      mark on *one named side*: Tracks decides squares and sides separately and
      needs three distinguishable action shapes, so the sides are drawn in the
      game's own vocabulary recolored (rail stubs / edge cross), per
      § "Echo the move's shape in the hint color". That is the Spokes answer, not
      a gap in the shared vocabulary, and it is written up in
      `docs/games/hints.md`.
- [x] 3.2 Tier-2.5 scenarios in `tracks-render-scenario.test.ts`: a hint frame
      paints in both hint colors and no hint mark is cell-sized in both
      directions, plus a snapshot; and a step that counts with a clue recolors
      exactly that clue's digit.

## 4. Report the number — a deliverable, not a postscript

- [x] 4.1 / 4.2 [`findings.md`](./findings.md) §1: **+1,132 game lines, of which
      +536 is the recording projection**, against the control's +1,138 / +387.
      **Engine lines: 0** (one cross-game test constant bumped as Tracks enrolled).
- [x] 4.3 Answered in `findings.md` §2 and marked in place at both claims —
      `docs/framework-rdd/deduction.md`'s banner and `README.md`
      § "Where this stands". Short form: the falsifier fires on cost and fails on
      wiring. There was **no second walk** (same eight technique objects, one
      `runDeductionFixpoint` call, zero engine lines), and it bought nothing off
      the number, because the loop was never the expensive part.
- [x] 4.4 Spec delta written (`specs/tracks/spec.md`, two `ADDED` requirements);
      `.openspec.yaml` and its `skip_specs` marker deleted.
- [x] 4.5 `docs/games/hints.md` updated in this change: the `settled` /
      `beforeTechnique` single-firing driver, § "A rung is not a premise, so
      return per premise", and § "Census the reasons, not only the rungs".

## 5. Acceptance

- [x] 5.1 Ran the app (Chrome, `playwright-cli`). Checked the opening
      `bothSidesLeft` frame and a `clueExact` frame several steps in: the clue
      digit recolors in the margin, the two already-empty squares outline as one
      contour matching the "only 2 squares" the sentence counts, the four forced
      squares ring, and the narration reads correctly in the panel.
- [x] 5.2 `help/games/tracks.md` gains a **Hints** section: the three action
      shapes, the evidence marks, and the recolored clue.
- [x] 5.3 `openspec validate --all --strict`, then the gate.
