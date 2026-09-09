# defer-the-sixteen-deep-search-walks

Follow-on to `retire-tests-that-do-not-earn-their-runtime`, which measured the
suite and then **declined** this cut. The owner overruled the decline, on
grounds the audit could not supply.

## Why

The audit left `sixteen.test.ts` the single most expensive file in the
collection — **109 s CPU**, ~15% of all vitest CPU — and recorded a decline: its
two deep-search walks are the deterministic regression evidence for a defect
fixed the day before, and the audit had just made the file the sole gate cover
for Sixteen at 5×5.

**What the audit was missing is not a measurement.** It is whether the Sixteen
hint is still under development. Owner, 2026-09-09:

> "I don't understand why we need that overlong Sixteen test on every precommit,
> especially now that we spent several sessions working on it and testing it
> extensively, and I don't expect to work on it further."

That is the input the bar actually needs. "What would this catch in a refactor
that no cheaper test would" presumes a refactor is coming; where the code is
settled, the same evidence is worth having **on demand** rather than on every
commit. It is not a weaker standard, it is the standard with its premise
supplied.

## What changes

Two `it` → `itSlow` in `sixteen.test.ts` — the boards that walk a pathological
5×5 to solved, recomputing a full exact search after every move:

- `finds the way home from the tangled boards the searches cannot reach`
- `finds the way home from the swapped-pair endgames that used to strand it`

Together **73% of the file**. Deferred, not deleted:
`npm run test:slow -- src/games/sixteen`.

## What the gate keeps, and what it gives up

**Keeps — real 5×5 hint coverage, on every commit.** `solves the two-swap 5x5
endgame that previously halted auto-hint` drives a board only the exact
bidirectional search can cross, and `recomputing after every move still lands on
the same board, one move nearer` walks that same board with a fresh search per
move, which is the recompute-stability property. Seconds, not minutes.

**Gives up — the tangle measure specifically.** `TANGLE_COST` is priced only
above `TANGLES_IN_REACH` (2), and the boards the gate retains sit at or below
it. **Verified both ways rather than reasoned about**, with `TANGLE_COST` zeroed:

| | result |
| --- | --- |
| gate (`vitest run`) | **57 passed, 2 skipped — green** |
| slow (`PUZZLES_SLOW_TESTS=1`) | **red**, on "four tangles — the board the hint refused on" |

So the loss is real and bounded to one term of one game's heuristic, and it is
recorded at the site, in `hint-resume.test.ts`'s `SEARCH_REACH` ledger (whose
sentence this change had to correct — the audit's commit had claimed those walks
as gate cover), and here.

## Impact

- **Measured**: `sixteen.test.ts` 109.0 s → **20.8 s CPU** (−81%). With the
  audit's own −120.6 s, the running total is **−208.8 s** against a before-suite
  of 836.4 s — **about −25%**.
- Affected specs: none. `build-pipeline`'s deferral rules already govern this;
  the change is an application of them, not an extension. Its `Purpose` section,
  still the archiver's `TBD` placeholder from `remove-docker-emcc-build`, is
  written properly here as a tidy the audit noticed and surfaced.
- Affected code: one test file, one ledger sentence in another. **No production
  code.**
- Owner acceptance: the directive above *is* the authorization.
