# adopt-shared-deduction-fixpoint — design

## D1: Adopt the loop, never the techniques

The module's header already states the boundary and it is the right one:

> The **techniques stay per-game** (a nonogram overlap is nothing like a sudoku
> hidden single); only this loop, the difficulty cap, the recorder-gated budget,
> and the grade bookkeeping live here.

Every temptation in this change is to creep past that line — two games' "find a
forced cell" rungs will look similar, and unifying them would contort both. The
standing guardrail applies verbatim: *game-specific logic is never contorted to
fit a contract*.

The practical test at each call site: after conversion, is the game's file
**shorter and unchanged in meaning**, or has a technique acquired a parameter it
only has because another game needed one? The second is the failure.

## D2: Complexity is the symptom, duplication is the disease

It would be possible to attack the 814 over-threshold functions directly —
extract helpers, flatten nesting, split long functions until the number falls.
That is the version of this work that produces an unreviewable diff and a
codebase nobody recognises, in exchange for a metric.

**The reason to prefer the shared-runner framing is that it has an independent
justification.** If adopting the runner also lowers complexity, good; if a
solver's complexity is unchanged because the loop was only 8 of its 300 lines,
that is a fine outcome and the adoption was still correct — the loop is now
maintained in one place, and the difficulty-cap bookkeeping is now the same
bookkeeping everywhere.

The corollary is a rule for the whole refactoring round: **do not refactor a
function because its complexity score is high.** Refactor it because something is
duplicated, wrong, or unclear, and let the score record what happened. The
reviewed cleanup plan reaches the same conclusion in its closing paragraph and
then spends four phases inviting the opposite.

## D3: The differential is a net here, not an oracle

`unify-border-grid-games` can claim its extraction is provably a no-op, because
input handling is downstream of generation. **This change has no such
property.** A solver's verdict on every intermediate board decides which boards
the generator accepts, so any change in the ladder's traversal order, its cap
semantics, or its outcome convention changes which boards exist.

That means the differentials here are doing their real job — catching a
behaviour change — rather than proving absence of one. Three consequences:

1. **One game at a time, each with its differential run before moving on.** A
   batch conversion followed by one test run cannot attribute a failure.
2. **A moved differential is a stop-and-diagnose, not a re-record.** It means the
   adoption is wrong *or* the hand-rolled loop was. Both are findings; neither is
   resolved by `vitest -u`. With no C build, a re-recorded fixture cannot be
   restored.
3. **The order should start with a game whose ladder is simplest**, to establish
   the conversion pattern where a failure is cheap to diagnose, exactly as the
   port order started with Flip.

## D4: The known no-go, and why writing it down matters

Loopy does not fit. `add-loopy-ts-port` established this and recorded that **two
separate handoffs had asserted it did** — its `(thresholdDiff, thresholdIndex)`
bookkeeping is not the shared runner's grade bookkeeping, and it decides which
puzzles exist.

The lesson generalises past Loopy: a solver whose loop *looks* like the shared
one can differ in the bookkeeping that the generator depends on, and the
resemblance is what makes the mistake attractive. So every no-go in this change
gets written down with its reason, and every *adoption* is verified by its
differential rather than by the loop looking right.

## D5: Hunt the Boats defect while in there

The Boats port found that **a solver may not be monotone in its difficulty cap**:
running the ladder capped at a lower tier solved boards the uncapped run could
not. It broke Check & Save on Easy boards and nothing caught it, because "solvable
at Easy" and "solvable at Hard" were both true statements about different code
paths.

Converting a solver to the shared runner puts a human inside its cap logic, which
is the cheapest opportunity this project will get to look for the same defect
elsewhere. So each conversion adds a property test: **for every difficulty cap
`d`, a board solvable at `d` is solvable at every cap above `d`.** That test is
worth keeping permanently regardless of whether the adoption goes ahead — it is a
statement about what a difficulty tier means, and it belongs to the game.

This also partly answers the released-oracle doctrine's demand to "say what
replaces the oracle": monotonicity in the cap is a property the byte-match never
checked and this change can.

## D6: Sequencing and stopping

After `establish-refactor-baseline` (for the ratchet) and
`unify-border-grid-games` (lower risk, establishes the extract-and-verify
rhythm). Before the three `add-*-difficulty-tiers` changes if possible, since
those invent new deduction rungs and would rather add them to a shared runner
than to a hand-rolled loop they then have to convert.

**This change is allowed to stop early.** If the audit finds that the majority of
the 29 candidates do not fit — different outcome conventions, cap semantics
entangled with generation, or searches misidentified as ladders by the grep
heuristic — then the correct outcome is a short adoption list, a long recorded
no-go list, and a note in the module header correcting its claim to be "the one
loop every logic game hand-rolled". A documented abstraction that turns out to
fit four games is a fact worth recording, not a failure to force.
