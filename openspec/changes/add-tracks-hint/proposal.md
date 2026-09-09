# add-tracks-hint

**Readiness: ready.** The ladder is declared and certified, the generator gates
on it, the board model is understood, and there is no contract to choose — the
hint is written against today's machinery, deliberately.

Realizes: `docs/framework-rdd/README.md` § "Where this stands" — this is the
**measurement the deduction end reports on**, and the last unanswered question
in the framework vision. Corpus and order from
`characterize-the-hint-assessment-corpus` (2026-09-09).

## Why Tracks, and why now

Tracks is the assessment corpus's top pick on four counts, all of them measured
rather than argued:

- **Its ladder is declared and certified.** Eight rungs on
  `runDeductionFixpoint` since `adopt-the-deduction-runner-where-it-rewires`,
  with a `tracks-ladder.test.ts` firing census proving which of them the corpus
  reaches — and naming the one it cannot.
- **Its generator gates on that ladder.** `addClues` lays clues only while
  `tracksSolve(scratch, diff)` still finishes the board, and rejects a board the
  runner grades below the target tier. So every published Tracks board is
  explainable by the eight rungs, and **no board moves** for this change.
- **It has a frozen differential**, so a hint that accidentally reaches into the
  generator path fails loudly.
- **It is hintless**, which is the whole point: re-reading a game that already
  has a hint tests nothing, because that hint was written against today's
  machinery.

## What this measures, stated as a falsifier before the work starts

`docs/framework-rdd/deduction.md` and
`adopt-the-deduction-runner-where-it-rewires` both say the runner *"is what
carries the recorder"* — the "one engine, two projections" that is supposed to
turn a solver into a narratable hint cheaply. **That sentence has never been
tested, and this change is the test.**

The control is measured and sitting in git.
[`characterize-the-hint-assessment-corpus`'s `audit.md`](../archive/2026-09-09-characterize-the-hint-assessment-corpus/audit.md)
§2.2: **Galaxies** is the
same solver class (A1), and it received its hint on 2026-08-11, four weeks
*before* it was wired to the runner. It cost **+1,138 lines of game code**, of
which:

| | lines |
| --- | --- |
| `hint.ts` — narration and plan mechanics | +457 |
| **`solver.ts` — the recording projection** | **+387** |
| `render.ts` — the overlay | +192 |
| `index.ts` — wiring | +102 |

Only the **+387** is a number adoption could plausibly move; the framework has
never claimed the other three rows. So:

> **The falsifier: if Tracks needs a comparable second walk over its own ladder
> to record what fired and why, then `runDeductionFixpoint` bought the wiring
> guarantee (which is real — Undead and Solo) and nothing else, the "carries the
> recorder" sentence is wrong in three documents, and `docs/framework-rdd/`
> closes on its own arithmetic the way `presentation.md` did.**

Reporting the number honestly is a deliverable of this change, in the same terms:
game production lines, of which how many are the recording projection. A result
that closes the vision is as good an outcome as one that vindicates it, and it is
the more likely of the two — the runner's own header says its `run` returns a
`number` and that it is *"oblivious"* to what a firing recorded.

## The obstacle this will hit, named in advance

**The runner reports that a rung fired, not what it did.** `DeductionTechnique.run`
returns a signed count; the `onFiring?: (id: string) => void` seam that all seven
adopters carry reports the rung's **id**, and exists for
`ladder-equivalence.ts`'s census, not for a hint. (`return-the-firing-tally-from-the-runner`
folds that seam into the runner — still id-level.)

The tree's three most recent deductive hints — Clusters, Subsets, Undead — each
answered this with a **parallel recorder**: a second implementation of the same
deductions. Two reasons are tangled in their headers and **only one survives
`AGENTS.md`**:

- *"the byte-match differential surface never calls any of this"* — the weaker
  half. `AGENTS.md` § "Byte-parity was a tool" released it.
- *"the generator only needs **that** a coloring is refuted; the hint also needs
  **why**"*, at which cell, on which premise, **and in a different order** —
  Clusters restarts its scan after each firing so one deduction is one plan step.
  That is a real design difference and it is not going away.

**Filling is the one counter-example in the tree**: an optional `FillingRecorder`
threaded into the solver and built only on the hint path, so the generator path
allocates nothing. Whether that shape generalizes to a rung-declaring game is
the question this change actually settles.

## What is deliberately not decided here

**No contract is chosen in advance.** `docs/framework-rdd/deduction.md`'s
`find`/`apply`/`narrate` technique split is still fiction and still owes an
answer to *what it buys beyond the hint walk* — which already fails when a
technique fires without narrating, and which `refuse-honestly-at-every-tier`
widened from one preset to all of them. So the hint is written against today's
machinery and **what it costs is the evidence**. If a contract suggests itself
while writing it, that is a finding for a later change, not a prerequisite.

## The hint itself

The bar is `AGENTS.md` § "Hint quality bar" — Palisade-grade: explain *why* the
move is forced, one deduction firing = one multi-leg journey, equivalent moves
share a color, claim only what is checked.

Seven rungs need narration; `check-single` needs none:

| rung | tier |
| --- | --- |
| `update-flags` | Easy |
| `count-clues` | Easy |
| `check-loop` | Easy |
| ~~`check-single`~~ | Tricky — **never fires** |
| `check-loose-ends` | Tricky |
| `check-neighbors` | Tricky |
| `check-neighbors-both-ways` | Hard |
| `check-bridge-parity` | Hard |

`check-single` fired **zero times across 324 solves** (36 shape/tier/single-ones
combinations, every other rung firing; the next-rarest fires 20 times), and was
checked line-for-line against `tracks.c`'s `solve_check_single_sub` — so it is
upstream's narrowest rule reaching no board this generator produces, not a port
defect. A hint cannot narrate a deduction that never happens; **do not spend a
sentence on it, and do not "fix" it.**

## Impact

- Affected specs: `tracks` — the hint is a player-visible capability and gets a
  requirement.
- Affected code: `src/games/tracks/` (a `hint()`, its recording path, its
  overlay), and possibly `src/engine/` — **and how much of the latter is part of
  the measurement**, since the last four deductive hints added zero engine lines.
- **Enrollment is automatic**: declaring `hint()` enrolls Tracks in all six
  cross-game hint guards through `engine/testing/hint-games.ts`, which derives
  its population from the registry. Nothing is added to a list.
- Frozen differential must stay byte-unchanged. A moved fixture means the hint
  path reached the generator path.
- Player-visible, so it is **owner-accepted**, not self-archived: run the app.
