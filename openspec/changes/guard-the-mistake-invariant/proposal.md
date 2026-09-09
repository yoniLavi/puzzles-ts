# guard-the-mistake-invariant

**Readiness: ready.** The population is measured, the marginal value is sized,
and there is no design decision left in it.

Realizes: `docs/framework-rdd/guarantees.md` § "What every game gets asserted,
per capability" — the *Invariants / mistakes* row, first clause. Found while
answering "what is left of the vision" (2026-09-09).

## The finding

**Nothing cross-game asserts that a correct board has no mistakes**, and for
eighteen games nothing asserts it at all.

`findMistakes` is a whole solve followed by a diff, in 36 of the 39 games that
offer it. Two things must therefore be true of every one of them, and neither is
checked:

- a **freshly dealt** board has no mistakes — the player has entered nothing, so
  nothing can diverge from the solution;
- a **solved** board has no mistakes — every cell now equals the solution.

**Twenty-one of the thirty-nine already have the first half indirectly**, and it
is worth saying exactly how, because it is why this guard is smaller than the
row implies: their `hint()` consumes `findMistakes` (through `candidateHint` or
`commonHintRefusal`), so a `findMistakes` that flagged a clean board would make
the hint refuse with `FIX_MISTAKES_FIRST` — and `hint-resume.test.ts`'s walk,
which requires the hint to reach a solved board, would fail.

**Eighteen games have no such coverage, and fifteen of those are hintless** —
abcd, ascent, bridges, magnets, map, mathrax, mosaic, pearl, rect, rome,
seismic, separate, signpost, tents, tracks, plus bricks, clusters and salad
whose hints do not route through the shared refusal. For those fifteen there is
nothing anywhere: `findMistakes` runs, and no test has ever asked it a question
whose answer it could get wrong.

**And the solved-board half is uncovered for all thirty-nine.** A hint walk
stops at solved; it never asks what `findMistakes` says once it gets there.

## Why it is worth its runtime

The bar is what this catches in a refactor that no cheaper test would. The
answer is concrete and this repo has paid it once: **Undead's `solveAtCap` ran
arc-consistency unbounded where its generator bounded it at three passes**, so a
rule with two spellings and nothing making them meet stood while every Undead
test passed (`assert-that-tiers-bind`, 2026-09-08). `findMistakes` is a *second*
consumer of every one of these solvers, wired by hand, and the wiring is exactly
where that class lives — a solver called with the wrong cap, the wrong clue
array, or a predicate that reads the player's notes when it should read only
their placements.

Measured cost: **3.1 s for all 39 games** on the smallest preset with a solve
each. Widening to every leaf preset is priced in `tasks.md` before it is chosen —
the tier axis is where a mis-capped solver would actually show, so a
smallest-preset-only slice would reinstate exactly the blindness
`refuse-honestly-at-every-tier` removed.

## What it is not

**Not the whole row.** `guarantees.md` also wants *a seeded wrong board →
non-empty*, *overlay clears on next transition*, and *refusal couples to the
banner*. The first stays per-game for the reason
`mistake-overlay-coverage.test.ts` already records — reaching a mistaken board
takes a game-specific move — and this change does not pretend otherwise. Stating
the covered direction and naming the uncovered one is the point.

**Not a new invariant.** Every game already intends this; the change is that
something checks.

## Impact

- Affected specs: none.
- Affected code: one new cross-game guard under `src/engine/`.
