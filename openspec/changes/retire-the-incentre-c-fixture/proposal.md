# retire-the-incentre-c-fixture

**Scaffolded, not implemented.** Scoped from a survey run at the owner's request
after `probe-shared-hint-machinery`, which noticed that `grid-incentre.test.ts`
reads a frozen C capture while not being named a differential.

## Why

The survey's headline is the opposite of what prompted it, and is worth stating
first so nobody re-runs it: **there is no C reliance anywhere in this repo.** No
`.c`, `.h`, `.but`, `CMakeLists.txt` or `.cmake` exists outside the two
deliberate reading copies in `add-{path,numgame}-ts-port/reference/`; no npm
script, vite plugin or test touches a C toolchain; `npm install` is still the
whole setup. What exists is **frozen JSON captured from C before it was
deleted** — data, not dependency — and the 50 per-game differentials that read
it are the refactoring net the current phase explicitly depends on
(`AGENTS.md`, migration order step 2). Retiring them is not proposed here and
should not be proposed casually.

One fixture is different, and it is the one that prompted the question.

`src/engine/grid/__fixtures__/grid-incentre-c-reference.json` (36 KB, 44 grids,
1,864 faces, 14 tilings) does **not** record something underivable. It records
where *another implementation* put a clue digit, and `grid-incentre.test.ts`
uses it as a **relative quality bar**: "the circle the TS point admits is within
1 unit of the circle the C point admits". Three things follow.

1. **It is display-only.** `gridFindIncentre` decides where a digit is drawn and
   reaches no description, generator or solver — outside byte-parity scope by
   this project's own rule, which the test file says itself.
2. **The bar is relative, so it cannot catch a shared error.** If both
   implementations place a digit badly, the test is green. That is the whole
   difference between measuring against a peer and measuring against the truth.
3. **The truth is now cheap to compute.** `probe-shared-hint-machinery` added
   `bestByBruteForce` to `grid-geometry.test.ts`: the best inscribed radius over
   the integer lattice, owing nothing to the implementation. It is a *strictly
   stronger* yardstick, and it caught two real gaps the C comparison had not
   (a mis-measured distance-to-edge, and a missing arm of the candidate
   enumeration).

So this fixture is the one case where dropping a C capture **increases** the
guarantee rather than spending it.

## What Changes

- Replace the C comparison in `grid-incentre.test.ts` with the brute-force
  yardstick applied to the same real tiling faces, and delete
  `grid-incentre-c-reference.json`.
- Delete the fixture's dead skip scaffold (it exists for "a tiling whose TS
  generator has not landed yet"; all eighteen landed with Loopy).
- Keep the face-count check by re-founding it on the grid itself rather than on
  the fixture's array length — `grid-differential.test.ts` already asserts face
  counts far more strongly, so this is about not silently losing a check.
- Record the survey verdict for every other C-recorded fixture in `design.md`,
  and add the `repo-layout` rule that separates the two kinds.

## What this is deliberately not

**Not a sweep of the other 50 fixtures.** They record what cannot be derived —
which boards a solver-gated generator produces, which is a fact about upstream's
algorithm and has no closed form to check against. `AGENTS.md` is explicit that
they are the net for the refactoring phase now in progress, and the byte-parity
release of 2026-08-01 kept them deliberately (Spokes is the worked example of
diverging *and* retaining the differential).

**Not a change to `random/corpus.json`.** The bit-identical RNG is kept on
purpose so shared game IDs reproduce across builds.

**Not a rewrite of provenance comments.** 153 files name a `puzzles/*.c` they
were ported from. Upstream still exists and the derivation is still true;
`retire-c-era-leftovers` already drew that line ("can a reader act on this
sentence?") and it does not need redrawing.

## Impact

- Affected specs: `repo-layout` — one added requirement distinguishing a fixture
  that records the underivable from one standing in for a yardstick.
- Affected code: `src/engine/grid/grid-incentre.test.ts`,
  `src/engine/grid/__fixtures__/grid-incentre-c-reference.json` (deleted),
  possibly a shared helper if the yardstick is worth hoisting out of
  `grid-geometry.test.ts`.
- Risk: the full-resolution sweep is ~8.3 M lattice points across the 1,864
  faces (measured), which is seconds, not milliseconds. The change must pick a
  cheaper strategy or gate it; see `design.md` D2.
