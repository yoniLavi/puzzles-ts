# extend-grid-tilings

## Why

Loopy is the **last unported game** — the only remaining `puzzle(...)` in
`puzzles/CMakeLists.txt` without `TS_PORTED`. Porting it retires the C engine
entirely, because every other remaining `.c` file is either Loopy's own
dependency subtree (`grid.c`, `loopgen.c`, `penrose.c`, `hat.c`, `spectre.c`,
`tree234.c`) or already orphaned.

Loopy is grid-generic: essentially all of its geometry lives in `grid.c`, and
its presets span **all 18 tilings**. `src/native/engine/grid.ts` today ships only
the square tiling — Pearl needed nothing else, and the `grid` spec says so
explicitly ("the other tilings and the floating-point helpers … are out of scope
until a later consumer needs them"). Loopy is that consumer.

This is the **first of three sequenced changes** delivering Loopy:

1. **`extend-grid-tilings`** (this change) — everything *periodic and
   deterministic*: the 13 remaining periodic tilings, `gridComputeSize` for
   them, plus the two geometry helpers Loopy's input and clue-placement paths
   need (`gridNearestEdge`, `gridFindIncentre`). No RNG, no grid descs.
2. **`add-aperiodic-tilings`** — everything *aperiodic*: `penrose.ts`,
   `hat.ts`, `spectre.ts`, their four `grid.ts` generators, the RNG-bearing
   `gridNewDesc`/`gridValidateDesc` round-trip, and `gridTrimVigorously`
   (called only by these four).
3. **`add-loopy-ts-port`** — the game itself, then stage-2 C deletion.

Splitting here is not arbitrary: the boundary is exactly the RNG boundary. This
change is fully deterministic and byte-checkable from `(type, width, height)`
alone, so it can be differential-tested standalone against the C with no seed
plumbing. Change 2 is where randomness, descs and the aperiodic tables enter.

## What Changes

- **13 periodic tiling generators** added to `src/native/engine/grid.ts`:
  honeycomb, triangular, snub-square, Cairo, great-hexagonal, Kagome,
  octagonal, kites, floret, dodecagonal, great-dodecagonal,
  great-great-dodecagonal, compass-dodecagonal. All are pure-integer,
  RNG-free, and follow one shared shape (emit K faces per cell at integer
  offsets from a cell origin, dedup corner dots, `makeConsistent`).
- **`gridComputeSize(type, width, height)`** — the static
  `(tileSize, xExtent, yExtent)` triple for the 14 periodic types. Pure
  integer; the app sizes its canvas from it. Aperiodic types land in change 2.
- **`gridNearestEdge(grid, x, y)`** — the input hit-test. Loopy has no keyboard
  and no drag, so this is the *entire* input path.
- **`gridFindIncentre(face)`** — the largest inscribed circle's centre, where
  clue digits are drawn. Lazy and cached per face, display-only.
- **`gridValidateParams`** — the per-type maximum-size overflow guards.
- A **differential check** against a new `puzzles/auxiliary/grid-trace.c`
  harness, asserting the TS grids reproduce the C dots, edges, faces and
  incidence exactly, per tiling and per size.

Explicitly **not** in this change: the four aperiodic tilings, `gridNewDesc`,
`gridValidateDesc`, `gridTrimVigorously`, and Loopy itself.

## Impact

- Affected specs: `grid` (one requirement MODIFIED to drop its square-only
  scope caveat; four ADDED).
- Affected code: `src/native/engine/grid.ts` (extended), new
  `src/native/engine/grid.test.ts` and `grid-differential.test.ts`, new
  `puzzles/auxiliary/grid-trace.c` + its `cliprogram()` line.
- No game behaviour changes — no game consumes the new tilings until change 3.
  `gridNewSquare` and `makeConsistent` are untouched, so Pearl's byte-match
  differential stays green (that is this change's regression bar).
- `puzzles/grid.c` is **not** deleted here; it is Loopy's dependency until
  change 3's stage 2.
