# parallelize-ci-test-workers — tasks

- [x] 1. Measure the hypothesis before acting on it: 4 vs 6 workers over the
      whole suite, **in both orders**, to exclude the settling-box confound.
      Result: 6 wins by 21–31% when the suite runs alone.
- [x] 2. Report the refutation rather than shipping the request on a premise the
      measurement had just falsified.
- [x] 3. Owner supplied the missing variable — ~4 repos in flight — which makes
      the isolated benchmark the wrong scenario. Local share is now
      `floor(cores / 4)`, with the divisor recorded as a dated environmental
      fact rather than a tuning constant.
- [x] 4. CI gets the whole machine, and reads `CI` itself instead of relying on
      an override nobody sets.
- [x] 5. Record the disagreeing benchmark **in the config**, so the next person
      with the "six is faster" reading knows it was weighed, not missed.
- [x] 6. Gate green.

## Not done

- **No memory-derived cap** (`totalmem / N`). It was drafted and dropped: on this
  box it produces the same number as the repo-share division, and it would be a
  second, differently-wrong model of the same constraint. The thing that
  actually varies is how many checkouts are open, and that is what the divisor
  now says.
- **No sweep** for the local optimum under four-way contention. It would need
  four suites running concurrently to be meaningful, which is a much larger
  experiment than the setting warrants, on a machine that is already thrashing.
  `VITEST_MAX_WORKERS` is the escape hatch if the number ever feels wrong.
