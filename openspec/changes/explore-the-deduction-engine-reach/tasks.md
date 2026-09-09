# explore-the-deduction-engine-reach — tasks

## 0. The sweep

- [x] 0.1 Classify all 30 off-engine solvers by the runner's own criterion.
- [x] 0.2 Separate "does not fit" from "is not deductive".
- [x] 0.3 For each adoptable game, say what adoption buys and costs.
- [x] 0.4 Measure the bookkeeping the runner would own, per game, with a median.
- [x] 0.5 Check what already ships.
- [x] 0.6 Apply the falsifier.
- [ ] 0.7 The narrower alternative — see § Findings; it is `adopt-the-deduction-
      runner-where-it-rewires`, not yet scaffolded.

## 1. Report

- [ ] 1.1 Findings written below.
- [ ] 1.2 Update `docs/framework-rdd/deduction.md` in place with the verdict.
- [ ] 1.3 Say in the README whether the vision has now reported in full.

## 2. Next

- [ ] 2.1 Scaffold the adoption change the sweep found, and rewrite or withdraw
      this one.

## Findings

### The baseline, corrected twice

**16 of the 46 games with a `solver.ts` use a shared deduction organ**
(`runDeductionFixpoint`, `latin.ts`, `candidate-hint.ts`); **30 do not.**

Both earlier figures in this session were wrong, and in the same way. A plain
grep put the count at 21, because it matched **comments**: Loopy's and Boats'
solver headers explain at length why those games do *not* use the runner, and
Seismic mentions `candidate-hint.ts` in a note about `adaptiveMarkAll`. A second
pass keyed on import paths put it at 19, because Ascent and Tents import
`matching` — a bipartite-matching utility that merely lives in `latin.ts`. Only
a **comment-stripped scan for the identifiers that are actually called** gives
16, which is what `enrollment.ts` does and what an ad-hoc grep does not.

**Two of the 30 carry a recorded reason** (Loopy, Boats). The other **28 have
never been asked the question.**

### 0.1 / 0.2 — the classification, by reading all 30 drivers

| Class | n | Games |
| --- | --- | --- |
| **A1 — fits, and its techniques are already separate functions** | **7** | tracks, rome, seismic, ascent, subsets, galaxies, bridges |
| **A2 — fits, but its techniques are written inline** | 3 | dominosa, map, separate |
| **B — sweeps every technique before restarting** | 6 | abcd, palisade, pearl, range, slant, tents |
| **C — one or two rungs; nothing to share** | 4 | signpost, sticks, mosaic, bricks |
| **D — earned hatch: names a promise it must break** | 3 | boats, loopy, lightup |
| **E — not a deduction ladder at all** | 7 | mines, net, rect + the planners fifteen, flood, inertia, slide |

**A1 is the finding.** Tracks is the clearest: eight named techniques, each
written `if (diff >= TIER && technique(b)) { maxDiff = Math.max(maxDiff, TIER);
continue; }`. That is `runDeductionFixpoint`'s signature transcribed by hand,
and Tracks ships **no hint**. Rome, Seismic, Ascent, Subsets, Galaxies and
Bridges are the same shape with different technique counts.

**B is the class the precedent warns about.** These sweep every technique in a
pass and restart only when the whole pass changed something, so adoption changes
deduction *order* — and each of them is a solver-gated generator whose desc
depends on this solver's verdict on every intermediate board. Slant says so in
its header in as many words. Adoption there is a re-recording of every fixture,
which is the one thing `re-derive-the-fixpoint-no-gos` refused to do.

**C is worth stating because it is an argument against reach for its own sake.**
Signpost has one rule, Sticks has one, Mosaic has one, Bricks has a deduction and
a recursion. The runner's own objection to Lightup applies: *a one-rung ladder
has no tier, no cap and nothing to restart.*

**D was re-derived, not carried forward, and all three survive.** Boats' reason
is the sharpest in the tree and worth quoting because it is the model: latching
optimization flags, a `diff` running-maximum that a technique *reads* (a cheap
rung switches itself off once a harder one has fired), and a grade that means
"deepest tier the loop had to reach" rather than "highest tier that fired".

### 0.4 — the number

For the seven A1 games, the driver — the loop, the tier gating, the grade
bookkeeping and the restarts, excluding every technique body — is:

| game | driver lines |
| --- | --- |
| tracks | 32 |
| bridges | 29 |
| galaxies | 27 |
| rome | 21 |
| ascent | 21 |
| subsets | 15 |
| seismic | 13 |

**Median 21.** Adoption replaces those with a declaration array of roughly three
lines per technique, so the net removal is on the order of **15 lines per game,
~110 across the seven**.

### 0.5 — what already ships

`latin.ts` (11 games), `candidate-hint.ts` (10) and `note-taking-cell.ts` (12)
between them **are** `deduction.md`'s CandidateBoard and LatinBoard substrates,
under other names. The row-4 lesson holds a fourth time: the substrate the
document proposes is largely on disk.

### 0.6 — the falsifier, and why obeying it literally would be wrong

The falsifier this change wrote for itself was: *fewer than a third of the
deductive off-engine games can adopt, **or** the per-game bookkeeping median is
under ~40 lines, **or** adoption would move any game's grading.*

- Clause 1 **does not fire**: 10 of 23 deductive off-engine games fit (43%).
- Clause 2 **fires**: the median is 21.
- Clause 3 is per-game and unresolved; the precedent says it *can* be byte-clean
  — Singles, Clusters and Spokes all adopted with every fixture unchanged.

**Clause 2 fires, and it is the wrong clause.** It was written by analogy with
`explore-the-tile-loop-inversion`, which was withdrawn on a line count — but
lines were the *presentation* end's whole argument, and they have never been
this end's. `deduction.md` says so itself: *"The framework does not make the
logic easier … it makes the wiring impossible to get wrong."*

**And the wiring argument now has evidence the tile loop's never had.** Two
instances of exactly the drift it predicts, both found in the last four days,
neither by a framework:

- **Undead** (`assert-that-tiers-bind`, 2026-09-08): `solveAtCap` ran
  arc-consistency unbounded where the generator bounded it at three passes, so
  every Normal board graded as Easy-solvable with the whole suite green.
- **Solo** (`fix-solo-solve-from-aux`, 2026-09-09): `solve` and `findMistakes`
  are two hand-wired consumers of one solver, and `solve` corrupted every
  generated board for sixteen presets while every test passed.

Neither would have existed with one engine and derived projections. That is a
correctness case, and it is the case this end always made.

**So the honest verdict is neither "withdrawn" nor "promoted": it is rescope.**

### Verdict — rescope to A1, and judge it on hints rather than on lines

Adopt the runner in the **seven A1 games**, one change per game or small family,
each with the same bar `re-derive-the-fixpoint-no-gos` used: *no new option on
the runner, and every frozen fixture byte-unchanged.* A game that needs either
stays where it is.

**Judge the result by what it costs to add a hint, not by lines removed.** Five
of the seven are hintless (tracks, rome, seismic, ascent, bridges — plus map and
separate in A2), and they are exactly
`characterize-the-hint-assessment-corpus`'s corpus: a game with a working solver
and no hint is the shape that tests a target contract. The runner carries the
recorder, so adoption is what makes those hints cheap — and if it does not, that
is the measurement that closes this end for good.

**Start with Tracks.** It is the most exact transcription of the runner's own
shape in the collection, it is hintless, and it has a frozen differential to
prove the adoption changed nothing.

### 0.7 — the narrower alternative

There is none this time, and that is itself a result: every previous exploration
in this vision found a mechanic-keyed module hiding behind a declaration. This
one found the opposite — the shared thing already exists, is already correct, and
simply has not been wired to two thirds of its population.
