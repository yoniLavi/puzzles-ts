# add-tracks-hint — the measurement

Taken 2026-09-10, against the falsifier this change's `proposal.md` stated
before the work started. Line counts are raw `git diff --numstat` on production
files, which is how the control in
[`characterize-the-hint-assessment-corpus`'s `audit.md`](../archive/2026-09-09-characterize-the-hint-assessment-corpus/audit.md)
§2.2 was taken — checked, because a code-only count would have made this
number 373 and the comparison meaningless.

## 1. The number

| row | Tracks | Galaxies (control) |
| --- | --- | --- |
| `hint.ts` (new) — narration and plan mechanics | +345 | +457 |
| **the recording projection** — `solver.ts` +500 / −19, `state.ts` +36 | **+536 / −19** | **+387 / −29** |
| `render.ts` — the overlay | +220 / −19 | +192 / −26 |
| `index.ts` — wiring | +31 / −1 | +102 / −1 |
| **game total** | **+1,132 / −39** | **+1,138 / −56** |
| **engine** | **0** | +3 |

`state.ts`'s +36 is counted in the recording-projection row because that is what
it is: the `TracksRecorder` interface and the optional `rec` field on `Board`.
It lives there only because `Board` does.

**Normalized per narratable premise** — a rougher unit, and offered as a ratio
taken under comparable conditions rather than as a figure: Tracks records **12**
distinct premises in 536 lines (≈45 each), Galaxies **7** in 387 (≈55 each).

## 2. The verdict: the falsifier fires, and the reason is worth more than the answer

**On its stated terms it fires.** The proposal asked whether an A1 game hinted
*after* adoption would still need "a comparable second walk over its own ladder".
The recording projection came in at **+536 against the control's +387** — 38%
larger raw, ~18% smaller per premise. Adoption moved the number the vision was
costed on **in the wrong direction**, and nowhere near enough in either direction
for the difference to be the point.

**But there was no second walk, and that part is unambiguous.** Tracks' hint runs
the *same eight `DeductionTechnique` objects* the generator runs, in the same
array, through one `runDeductionFixpoint` call. Not one rung is reimplemented.
Clusters, Subsets and Undead each wrote a parallel recorder; Tracks did not need
to, and **two hooks the runner already had did the whole job**:

- **`settled`** — documented as broader than "solved". `() => b.impossible ||
  rec.ops.length > 0` means *stop, this pass has a firing to narrate*, which is
  the same kind of reason Undead's contradiction and Spokes' spent budget are.
- **`beforeTechnique`** — `latinSolverTop` bumps a group id here; Tracks clears
  the standing reason, which is what makes "a rung that declares no reason
  narrates nothing" a checked property rather than a hope.

Zero engine lines. So the *wiring* claim is real, and stronger here than the
tree had yet shown.

**What it bought off the cost is nothing, and that is structural rather than
incidental.** The loop was never the expensive part. It is about ten lines, and
it was already shared before this change. What a recording projection actually
costs is three things a loop cannot supply:

1. **The *why*, one variant per premise, built where the premise is checked.**
   Only the code that decided a deduction fires knows which of its guards did it
   (`docs/games/hints.md` § "The premise must single out the conclusion" — the
   Crossing lesson, arrived at again here).
2. **The evidence each reason carries, captured in-rung.** A rung can destroy its
   own premise: `looseEndSpans` cites a line's *unfinished* squares and then
   finishes one, so a snapshot taken after the firing shades a different set than
   the sentence counts.
3. **A per-premise early return, gated on the recorder.** This is the one that
   the runner *structurally* cannot help with, and it is finding §3.

So the sentence *"the runner is what carries the recorder"* is wrong in the
three documents that repeat it, and the correction is not "it does not":

> The runner carries the **loop** — the ordered pass, the tier cap, the restart
> rule, the grade, the budget and the non-termination attribution. The recorder
> is per-game, and its cost is proportional to **the number of distinct premises
> a game's rungs hold**, not to the number of rungs, and not to anything the loop
> knows about.

## 3. The finding the vision should act on: a rung is not a premise

**Tracks has 8 rungs and 12 narratable premises, and the mismatch is not a
rounding error.** `update-flags` is a single `DeductionTechnique` holding *five*
separate local rules — three teachable, two that only restate what the board
already draws. `count-clues` holds two. `check-loop` holds three. `check-loose-ends`
holds two. `check-neighbors` holds three.

That has a consequence the framework work should take seriously:

- **The runner's granularity is the *grading* granularity.** A tier is a property
  of a rung, so `DeductionTechnique` is the right unit for `maxTier` and for the
  grade. A hint's unit is the premise, which is strictly finer.
- **A rung that scans the whole grid fires many independent deductions per
  `run()`.** Left alone, all of them land in one hint step — the exact "one group
  must cover exactly one firing" defect `docs/games/hints.md` records from
  Towers. The fix is upstream's own: return at the first premise, gated on the
  recorder so the generator path stays byte-identical. That gate appears **nine
  times** in `tracks/solver.ts` and is a good share of the 536.
- **So `docs/framework-rdd/deduction.md`'s `find`/`apply`/`narrate` split would
  not have helped.** It splits at the rung, and the narration splits *below* the
  rung. A contract that made `find` return one firing would either force
  `update-flags` to become five techniques — changing what a tier means, and the
  grade with it — or leave the per-premise return exactly where it is now.

**If there is a framework move here, that is where it is**: a way to say "this
rung holds several premises, grade them together and narrate them apart". Nothing
in this change needed one badly enough to design it, which is the honest report;
it is now the second game to want it (Towers was the first, and paid for it with
a bug).

## 4. Two smaller measurements

**The ladder's unreachable arms go one level below `check-single`.** Measured
over 119 boards — every shape, tier and `singleOnes` setting, 10,356 firings —
three *narratable arms* fire on no board this generator produces, and the
runner's own tally on the recorder-free generator path agrees. They are ledgered
in `tracks-hint.test.ts`, kept (the deductions are upstream's and byte-matched),
and covered by direct `narrate` unit tests, which is the only instrument that can
read a sentence no board produces. That is `tracks-ladder.test.ts`'s `unreached`
ledger applied one level finer, and it is a pattern the next hint should copy:
**a corpus census over reasons, with a ledger for what it cannot reach.**

**Two of `update-flags`' five rules are player-invisible and are deliberately not
narrated.** *"A square with a track side is a track square"* changes nothing on
screen at all (`s2dFlags` already derives it from the edge count), and *"a blocked
square's four sides are blocked"* adds four edge crosses around a square already
showing its own cross. Both run; neither claims a reason; a `silent` tally on the
recorder counts what they change, and `tracks-hint.test.ts` asserts the tally's
keys are exactly `["update-flags"]` — which is also what would catch
`check-single` if it ever started firing. This is
`docs/games/hints.md` § "Hint the move that advances the goal" (Spokes' "drop the
useless-but-forced move") reaching a second game.
