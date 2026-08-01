# right-size-the-test-gate

## Why

**The porting job the heaviest tests were built for is over, and their cost is
now paid on every commit for confidence the gate does not need.**

Measured (`/tmp` run, 250 files, 1,178 s of test time):

- **5 files are 66% of all test time**; the top 3 are 56%.
- Worse, the cost is not breadth — **about 10 individual tests are ~54% of the
  whole suite**. One `spokes-hint` property test is **238 s** (20% of everything);
  three `seismic-differential` 7×7 fixtures are **272 s**; one `bricks` 12×8
  fixture is **100 s**.

Two distinct kinds of waste, and they want different treatments:

1. **Over-scanned property tests.** The spokes one walks **180 generated boards**
   (60 seeds × 3 difficulties) to assert an invariant of the deduction rules —
   "a rule-out always helps a hub that still needs lines". A violation of that
   would be *systematic*, not a one-in-a-hundred-boards fluke, so boards 30–180
   are buying almost nothing. Same shape in `boats-hint` and `netslide-hint`,
   where narration tests re-search many seeds to *find* a firing of each kind.

2. **Large-board differential fixtures that duplicate configuration coverage.**
   This is the sharper one. Seismic's four 7×7 fixtures cover mode 0/1 ×
   difficulty 0/1 — **every one of which is already covered** by its 4×4, 5×5 and
   6×6 fixtures. Bricks' 12×8 d2 duplicates a difficulty three smaller boards
   already carry. What the big boards add is *size*, not *configuration*: the
   same code paths, more iterations.

**The differentials remain the refactoring net; this change does not weaken what
they cover.** A refactor that changes a solver's verdict still changes a desc,
and every mode/difficulty/grid-type combination is still checked on every commit.
What moves off the per-commit path is only the largest board of each such family.

## What Changes

- **A shared `slow` mechanism** in `engine/testing/` — `describeDescDifferential`
  gains a `slow` option, plus `describeSlow`/`itSlow` for the non-differential
  heavy cases. Slow tests are skipped unless `PUZZLES_SLOW_TESTS=1`.
- **`npm run test:slow`** runs the whole suite *including* them. It is the
  once-per-refactoring-round check, alongside `npm run metrics` and `npm run diff`
  — **not** a thing that quietly never runs.
- **Right-size the over-scanned property tests** by cutting seed counts where the
  marginal board buys nothing, and say in each what the number is for.
- **Verify every touched test still discriminates**, by breaking the code it
  covers and watching it fail. A cheaper test that no longer catches anything is
  the failure mode this change could most easily cause.

## Impact

- Affected specs: `build-pipeline` (the gate's cost, and what the gate is *for*).
- Affected code: `engine/testing/differential.ts`, a new slow-test helper, and
  the handful of test files named above. **No production code changes.**
- **The risk is real and it is one-directional**: every change here removes
  checking from the commit path. So each is justified individually, the
  configuration coverage that remains is stated, and nothing is deleted outright
  — the slow cases still run, on demand, and the reduced ones keep their
  property. A count that drops must still be a count that catches.
