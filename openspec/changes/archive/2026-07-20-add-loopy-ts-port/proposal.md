# add-loopy-ts-port

## Why

**Loopy is the last unported game.** It is the only remaining `puzzle(...)` in
`puzzles/CMakeLists.txt` without `TS_PORTED`, and every other `.c` still in the
tree is either its dependency subtree or already orphaned. Landing it retires
the C engine as a *runtime* — no game is served by WASM any more — and unblocks
the follow-up `retire-c-engine` change that removes the build machinery itself.

This is **change 3 of 3**. Changes 1 (`extend-grid-tilings`) and 2
(`add-aperiodic-tilings`) delivered the geometry Loopy is built on: `grid.ts`
now covers all 18 tilings, with `gridNewDesc`/`gridValidateDesc`,
`gridTrimVigorously`, `gridNearestEdge` and `gridFindIncentre`. `loopgen.ts`
landed with Pearl. **Nothing Loopy needs is missing** — this change is the game
itself.

It is also the payoff for those two changes. Neither had a user-visible surface,
and both were accepted on the explicit basis that there was nothing to
acceptance-test; their handoffs both say **the first real acceptance test of the
tilings is Loopy**. If a tiling is subtly wrong, it surfaces here.

## What Changes

- **`src/native/games/loopy/`** — the game, following the established
  multi-file port shape (`state` / `solver` / `generator` / `render` / `index`,
  split further if a file outgrows navigability).
- **All 18 grid types**, with Loopy's own grid enum and its mapping onto
  `grid.ts`'s `GRIDGEN_LIST` ordering. **Both orderings must survive**: Loopy's
  is frozen into saved game IDs, and upstream comments at length that nothing
  may be inserted except at the end.
- **The graded solver** — four deduction rungs run to a fixpoint, over the
  shared `runDeductionFixpoint` runner. Loopy is a strong Palisade-bar
  candidate for a later `add-loopy-hint`, but **no hint ships here** (separate
  change, per the established pattern).
- **The solver-gated generator** over `generateLoop`, with a bounded retry for
  the degenerate-patch case (see below).
- **Mouse-only input** via `gridNearestEdge`, plus the `autofollow` preference.
- **Rendering** for every tiling, with clue text placed by `gridFindIncentre`.
- **A byte-match differential** against a new `puzzles/auxiliary/loopy-trace.c`,
  covering all 18 grid types across difficulties.
- **Stage 2, on owner acceptance**: flip `TS_PORTED`, delete `puzzles/loopy.c`
  and its now-unused subtree (`grid.c`, `loopgen.c`, `penrose.c`,
  `penrose-legacy.c`, `hat.c`, `spectre.c`, `tree234.c`, `grid-trace.c` and the
  aperiodic table dumper), and rebuild.

Explicitly **not** in this change:

- **The explained hint** — its own change, per every prior port.
- **`retire-c-engine`** — the orphaned leaves, `webapp.cpp`, the Emscripten
  build, the worker's WASM path and the `USE_TS_LEAVES` machinery. Owner-chosen
  as a separate change; it is an architectural change deserving its own design.

## The one decided-in-advance question: degenerate Penrose patches

`add-aperiodic-tilings` found an **upstream crash reachable from Loopy's UI**: a
small Penrose patch can come out empty (the seed triangle lands outside the
bounding box, so the BFS never runs), and upstream then aborts in `dsf_new(0)`.
It is **seed-dependent, not size-dependent** — the same `(type, w, h)` succeeds
or aborts depending on the draw — and `loopy.c:713-717` accepts 3×3 for both
Penrose variants. The geometry layer now raises `GridTrimmedAwayError` there
rather than aborting; this change decides what Loopy does with it.

**Decision: catch it and retry with a fresh grid description, bounded by
`retryLimit`. Do not raise the minimum sizes.** Full reasoning in `design.md`
D1; the short version is that it is better for the game, costs nothing in
fidelity, and is what this repo already does elsewhere.

## Impact

- Affected specs: new `loopy` capability; `ts-migration` (the collection reaches
  full TS coverage).
- Affected code: new `src/native/games/loopy/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/loopy-trace.c`.
- Stage 2 deletes ~14,300 lines of C — the largest single deletion in the
  migration, and the one that ends it.
- No icon work: `src/assets/icons/loopy-{64,128}d8.png` already exist from the
  WASM era, so the `puzzle-icons` obligation is already met.
