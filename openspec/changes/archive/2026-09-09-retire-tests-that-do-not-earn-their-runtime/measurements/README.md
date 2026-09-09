# Measurement snapshot — 2026-09-09

Raw output, filed under the change rather than at the repo root: it measures a
tree that has since moved, and a snapshot left loose reads as current
(`docs/games/testing.md` § "Metrics and instruments").

**The box was not idle.** Other users' jobs held the load average between 40 and
198 for the whole session, on 8 logical cores. That is why the wall-clock files
below are labeled as a *ranking* instrument and the CPU file is the one quoted.

| file | what it is | trust it for |
| --- | --- | --- |
| `2026-09-09-wall-ranking.txt` | summed per-test wall duration, top 40 of 301 files | **locating** cost only — inflated 1.6–5.2× and unevenly |
| `2026-09-09-by-category.txt` | the same, aggregated: differential vs engine vs per-game | shares, not seconds |
| `2026-09-09-per-game.txt` | the same, attributed to the game each cross-game guard case names | shares, not seconds |
| `2026-09-09-cpu-per-file.txt` | `/usr/bin/time` `user + sys` per file, one `vitest run` each | **the real figures** |

## Reading the CPU file

It was captured in one pass while the work was in progress, so it mixes two
states and the order matters:

- The **first two rows** (`hint-resume`, `hint-quality`) are the **before**
  numbers — 149.5 s and 61.8 s. Both files were changed after they were
  measured; re-measured by the identical method they are 49.3 s and 41.4 s.
- Every **other per-file row** is unaffected — those files were not touched.
- The **`SUITE` row at the end is the *after* total**, 715.8 s CPU, because the
  whole-suite run happened last, on the edited tree.

The derived before-total is therefore 715.8 + 120.6 = **836.4 s**, and
`findings.md` §4 says why that addition is sound rather than a second run.

## Reproducing it

```sh
# ranking (wall — locating only)
npx vitest run --passWithNoTests --reporter=json --outputFile=/tmp/suite.json

# the honest per-file figure
/usr/bin/time -p npx vitest run --passWithNoTests <file>   # read user + sys

# the whole suite
/usr/bin/time -p npx vitest run --passWithNoTests
```

The three `.mjs` distillers that produced the wall files are not committed:
they are a `for` loop over `testResults[].assertionResults[].duration`, summed
by file, by category, and by the game id each cross-game guard case names in its
`it` title. `findings.md` §2 states the join key, which is the only part worth
keeping.
