# Make three checks that exist actually catch something

## Why

`archive/2026-09-12-tidy-the-code-after-the-port` removed 11,330 lines of dead
comments, dead exports and dead citations by hand, one agent per directory.
Nothing stops it accumulating again, and three mechanisms that would are already
in the tree, each catching nothing:

**1. The citation guard scans the wrong population.** `change-citations.mjs`
carries `const SCANNED = /^(docs\/.*\.md|AGENTS\.md)$/`, so a change id written
in a source comment is invisible to it. The pass deleted hundreds of those by
hand. Measured today, **23** unresolvable design tags and numeric section
references survive in `src/`, five of them inside Mines test titles, where
renaming orphans a snapshot key.

The live requirement sets the bar for widening a scan: the specs were excluded
"on a measurement, not on a principle", and "a scan SHALL be widened only where
the same measurement comes back the other way". So this change **takes that
measurement for `src/` first** and widens only if it comes back the other way.

**2. knip is installed and wired to nothing.** It is a devDependency at
`^6.31.0` and no script runs it. Run by hand today it reports **zero** unused
exports, which is the good state the pass just produced by hand: four dead
accessors in Guess, a dead re-export in Cube, four in Crossing, Fifteen's
`parityS`, Mosaic's two constants, and more. Wiring it in costs nothing now and
keeps that at zero.

**3. The complexity rule is configured never to fire.**
`noExcessiveCognitiveComplexity` is set to `maxAllowedComplexity: 150`, where
biome's default is 15. The distribution over the whole tree:

| threshold | diagnostics | distinct sites | non-test sites |
| --- | --- | --- | --- |
| 25 | 467 | many | many |
| 50 | 152 | 20 | 14 |
| 100 | 26 | 12 | 12 |

At 50 with tests excluded it names **14** sites, and every one is in
`engine/grid/` or `divvy.ts`. That is a usable signal pointing at one subsystem,
not a nag spread over 57 games.

## What changes

- `change-citations.mjs` gains `src/**/*.ts` if the measurement supports it, with
  the same ledger and vacuity floors it already carries.
- A gate step runs knip, scoped to unused exports and types.
- `noExcessiveCognitiveComplexity` moves to a threshold taken from the
  distribution above, with test files excluded, and the sites it then names are
  either simplified or recorded as accepted.

## What this is not

Not a license to delete the 14 complex functions. Grid geometry is branchy
because the geometry is. The rule's value is that a *new* function of that size
has to be argued for, not that the existing ones are defects.
