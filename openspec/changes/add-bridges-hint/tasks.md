# add-bridges-hint — tasks

Read [`docs/games/hints.md`](../../../docs/games/hints.md) first — it is the
procedure; `AGENTS.md` § "Hint quality bar" is the bar. The measurement this
change exists to take is [`findings.md`](./findings.md).

## 0. Take the baseline before writing a line

- [x] 0.1 Control recorded from
      [`archive/2026-09-09-characterize-the-hint-assessment-corpus/audit.md`](../archive/2026-09-09-characterize-the-hint-assessment-corpus/audit.md)
      §2.2 and `add-tracks-hint`'s `findings.md` §1, taken the same way (raw
      `git diff --numstat` on production files, **not** code-only). Bridges'
      narration row is `hint.ts` + `hint-text.ts` together, because Tracks' was
      measured before `extract-hint-strings` split the second file out.
- [x] 0.2 Baseline: `generator` 173, `index` 642, `render` 689, `solver` 538,
      `state` 690 = **2,732 production lines**.

## 1. The recording projection

- [x] 1.1 Threaded, on the same three `DeductionTechnique` objects through one
      `runDeductionFixpoint` call. `settled` and `beforeTechnique` supply the
      single-firing driver, exactly as in Tracks. The recorder rides on the
      `Solver` rather than the state, because `solveJoin` is the Solver's and
      the stage-3 *trials* must not record.
- [x] 1.2 Generator path byte-identical: `bridges-differential.test.ts` and
      `bridges-ladder.test.ts` pass **unedited**. Every reason built behind
      `if (rec)`, because a group's membership costs a walk of the island list.
- [x] 1.3 Resumes from the player's bridges, capped at the board's own tier,
      and seeds the marks a from-scratch solve would hold at those bridges —
      stage 1 derives them itself, but only when its sweep reaches the island,
      which from empty is always early enough and from a half-built board is
      not. Annotations are kept rather than cleared, so a wrong one is a
      contradiction the hint reports honestly rather than one it hides.
- [x] 1.4 Per-premise early return at **two** levels: the sweep stops at the
      first island that moved, and stage 2 and stage 3 each return at the first
      of their two rules that fired. Three rungs, nine distinct rules
      (`findings.md` §3).

## 2. Narration

- [x] 2.1 Seven sentences in `hint-text.ts`, values arriving as the board means
      them. Necessity voice, indication first, ≤120 characters, no em-dash;
      `hint-quality.test.ts` passes.
- [x] 2.2 Stage 3's block carries **which** validator refused, read while the
      trial still stands: a finished group sealed off, or a named island left
      short. Rolling the trial back destroys both answers.
- [x] 2.3 One firing = one step, with a multi-span move where one premise forces
      several bridges (380 of 1,349 steps). `hintKeepTrack` shrinks in place,
      accepts a span from either end (a drag runs from whichever island the
      player starts at) and treats a count moving *toward* the step's as
      progress, because one drag adds one bridge rather than the whole count.
- [x] 2.4 Degenerate extremes read directly through `narrate`/`say`: a clue of
      1 and of 16, an island with one neighbor and with four, `elsewhere` of 0,
      1 and 2, a group of 2, and both arms of the starved-island sentence.
- [x] 2.5 Census over the reason kinds as a total `Record`, with the one arm no
      shipped preset can reach ledgered — and the ledger's *reason* asserted
      (every preset allows loops) rather than the arm's absence.

## 3. The overlay — the change's stated falsifier

- [x] 3.1 Answered, and more sharply than predicted: **nothing** of
      `hint-mark.ts` transfers, because an island is not a cell either (its
      circle is wider than its tile). Written into `docs/games/hints.md`
      § "Shade vs ring", § "The element-type color legend" (a new row and the
      names-it rule) and § "A rung is not a premise". `findings.md` §2.
- [x] 3.2 A second `Int32Array` in the same island/line layout the packed
      descriptor uses, compared in the same per-tile diff test.
      `hint-overlay.test.ts` passes.
- [x] 3.3 `bridges-render-scenario.test.ts`: the action color on a bridge, on a
      rim and on a digit; no hint rect tile-sized in both directions; the cited
      islands outlined; a raised span keeping its existing bar in board ink;
      snapshots.

## 4. Wire it up

- [x] 4.1 `hint` + `hintKeepTrack` on the game object, refusals through
      `commonHintRefusal`, and `CONTRADICTION_UNLOCALIZED` for the board whose
      *annotation* is what is wrong — `findMistakes` reads bridges only, so
      there would be no highlight for `FIX_MISTAKES_FIRST` to promise.
- [x] 4.2 All six cross-game guards green. Enrollment is derived, so the only
      edit anywhere else is `hint-mark.test.ts`'s checked-game count, 28 → 29 —
      and renaming the `COL_HINT` that guard keys on, which Bridges already
      owned for something else (`findings.md` §2a).

## 5. Report the numbers

- [x] 5.1 [`findings.md`](./findings.md): **+1,157 / −68 game production lines,
      of which +377 / −9 is the recording projection**, against Tracks'
      +1,132 / +536 and Galaxies' +1,138 / +387. **Engine lines: 0.** Three
      rungs, seven narrated premises, and a per-premise cost within a tenth of
      Tracks' on a ladder 2.7× coarser.

## 6. Acceptance

- [x] 6.1 Ran the app in Chrome (`playwright-cli`) and read real plans: the
      opening `exactSpace` frame, an `everyNeighbor` frame with both neighbors
      outlined, and a `wouldSealGroup` frame with the blue crosses. The last one
      **changed the code**: the sentence counts "these 2 islands" and the first
      cut marked one of them as the focus and one as evidence, so it pointed at
      one mark of each color.
- [x] 6.2 `help/games/bridges.md` gains a Hints section naming the three marks.
- [x] 6.3 `openspec validate --all --strict`, then the gate.
