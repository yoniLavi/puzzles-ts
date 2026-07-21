# add-clusters-ts-port

## Why

**Clusters is a small, finished, unique-solution logic puzzle** from the
x-sheep/puzzles-unreleased collection: fill a grid with red and blue tiles so
that every tile touches at least one same-colour neighbour, and the "dead-end"
tiles (touching exactly one same-colour neighbour) are all given as dots. It
already ships as a C/WASM catalog game; this change ports it to native TS as one
of the 13 third-party puzzles being migrated.

It is a natural, low-risk port: ~1,170 lines, **self-contained** (its
`CMakeLists` entry has no `solver(...)` line — no `dsf`/`latin`/`grid`/`tree234`
leaf dependency), a contradiction-based solver that gates a solver-driven
generator, and a plain run-length codec. That combination gives the strongest
verification available — one **byte-match differential** validates generator,
solver and codec together over the bit-identical `random.ts`. It also carries
the collection's paint-and-drag input model and a built-in rule-violation
checker, so it ships `findMistakes`.

## What Changes

- **`src/native/games/clusters/`** — the game, following the established
  multi-file port shape (`state` / `solver` / `generator` / `render` / `index`).
- **The desc codec** — the run-length encoding of *given dot tiles only*
  (lowercase = red dot, uppercase = blue dot, `z`/`Z` = a 25-cell skip), with
  validation that the accumulated position lands exactly at `w*h + 1`.
- **The contradiction solver** — `clusters_validate` (complete / unfinished /
  invalid with per-cell error flags), the single-cell forced-colour rule, and
  the depth-1 lookahead, ported idiomatically; it is what the generator gates on.
- **The solver-gated generator** — random two-colour fill, flip isolated cells,
  reduce to dot clues, prune adjacent dot pairs, re-solve; loop until the board
  is uniquely completable. Byte-match reproducible from a seed.
- **Paint-and-drag input** — left-click/-drag places blue, right-click/-drag
  places red (each cycling to clear), plus a keyboard cursor with
  Enter/Space/`0`/`1`/`2`/backspace and shift/ctrl-arrow painting. No animation
  beyond a completion flash.
- **`findMistakes`** — Clusters is a unique-solution logic puzzle with a
  built-in rule checker, so it ships the hook (design D5).
- **A byte-match differential** against a new
  `puzzles/auxiliary/clusters-trace.c`, asserting the TS `newDesc` reproduces the
  C desc byte-for-byte across every preset and a size sweep.
- **Stage 2, on owner acceptance**: add `TS_PORTED` to the `puzzle(clusters …)`
  entry in `puzzles/unreleased/CMakeLists.txt`, delete
  `puzzles/unreleased/clusters.c`, and rebuild.

Explicitly **not** in this change:

- **An explained hint** — a Palisade-grade `hint()` is always its own change,
  per every prior port. Clusters is a candidate (it has a real solver), but not
  here.

## Impact

- Affected specs: new `clusters` capability.
- Affected code: new `src/native/games/clusters/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/clusters-trace.c`.
- Stage 2 flips `TS_PORTED` and deletes `puzzles/unreleased/clusters.c`; the
  C/WASM build remains the in-app fallback through stage 1.
- No icon work: `src/assets/icons/clusters-{64,128}d8.png` already exist, so the
  `puzzle-icons` obligation is already met.
