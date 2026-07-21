# add-ascent-ts-port

## Why

**Ascent (Hidoku / Hidato) is one of the 13 third-party `puzzles/unreleased/`
games we are porting to native TypeScript.** It is a fully-implemented, playable
logic puzzle: fill a grid so the numbers 1..n form a single path, each number
orthogonally or diagonally adjacent to its successor. Unlike Tatham's
`unfinished/` experiments, it already ships as a C/WASM catalog game with a real
generator, a **pure-deduction solver graded across four difficulty tiers**, and a
unique solution — so it is a genuine logic puzzle that earns `findMistakes` and,
later, an explained hint.

Porting it removes another C/WASM game on the road to retiring the engine, and
its five grid modes (Rectangle, Rectangle-no-diagonals, Hexagon, Honeycomb and
the arrow-clue **Edges** variant) exercise geometry and a bipartite-matching leaf
this collection already has in TypeScript.

## What Changes

- **`src/native/games/ascent/`** — the game, following the established multi-file
  port shape (`params` / `state` / `solver` / `generator` / `render` / `index`,
  plus a small `moves.ts` if the path-drawing renderer needs shared helpers).
- **The desc codec**: the run-length number/blank/wall encoding (decimal number
  runs, `a`–`z` blank runs, `A`–`Z` wall runs, `_` separator), with `NUMBER_EDGE`
  arrow clues for Edges mode, and grid padding per mode (`ascent_grid_size`).
- **The four-tier deductive solver** (Easy / Normal / Tricky / Hard) as a
  fixpoint of deduction rules — **no guessing at any tier**, consistent with the
  guess-free-generation policy — reusing the shared `matching` leaf for the Edges
  generator.
- **The generator**: a backbite Hamiltonian-path builder, then solver-gated
  number removal (`ascent_remove_numbers`) or bipartite-matching arrow placement
  (`ascent_add_edges`), with a retry-until-soluble loop.
- **The input model**: click-a-number-then-an-adjacent-cell, click-empty-then-
  type-a-number, free-form path drawing, and Edges-mode drag-from-arrow — modelled
  as a discriminated move union, not upstream's `P`/`L`/`D`/`C`/`S` move string.
- **`findMistakes`** — Ascent has a unique solution, so it re-solves and flags
  placed numbers that contradict it (design D6). This is the deliberate-
  divergence product value; upstream only flags duplicate numbers / invalid path
  segments in-play.
- **A byte-match differential** against a new `puzzles/auxiliary/ascent-trace.c`,
  validating generator + solver + codec together over the bit-identical
  `random.ts`.
- **Registration** in `ts-ported-ids.ts` + `games/index.ts` (stage 1).
- **Stage 2, on owner acceptance**: add `TS_PORTED` to the `puzzle(ascent …)`
  entry in `puzzles/unreleased/CMakeLists.txt`, delete `puzzles/unreleased/
  ascent.c`, and rebuild.

Explicitly **not** in this change:

- **An explained hint** — Ascent is deductive and a strong hint candidate, but the
  hint is always its own change (every prior port), authored to the Palisade bar.

## Impact

- Affected specs: new `ascent` capability.
- Affected code: new `src/native/games/ascent/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/ascent-trace.c`.
- Stage 2 flips `puzzle(ascent …)` in `puzzles/unreleased/CMakeLists.txt` to
  `TS_PORTED` and deletes `puzzles/unreleased/ascent.c`.
- No icon work: `src/assets/icons/ascent-{64,128}d8.png` already exist, so the
  `puzzle-icons` obligation is already met.
