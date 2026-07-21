# add-bricks-ts-port

## Why

**Bricks (Tawamurenga) is a complete, shipping third-party logic puzzle** — one of
the 13 games this fork bundles from the x-sheep/puzzles-unreleased collection. It
already runs in the catalog as C/WASM. Shade cells in a hexagonal grid so every
shaded cell is supported by a shaded cell below it, no three shade in a horizontal
line, and each number equals its count of shaded neighbours.

Porting it to native TypeScript retires another C game on the way to deleting the
WASM engine, and it is a **uniquely-solvable deductive puzzle** — so it lands with
`findMistakes` (Check & Save) and becomes a candidate for a later explained hint.
Its solver, generator and codec are all real C, so a **byte-match differential**
validates the whole port at once over the bit-identical `random.ts`. The one
genuinely new thing it introduces is a small bespoke **hexagonal grid geometry**
(a bounds-masked parallelogram with a fixed six-neighbour table), which no shared
`grid.ts` tiling is needed for.

## What Changes

- **`src/native/games/bricks/`** — the game, following the established multi-file
  port shape (`state` / `solver` / `generator` / `render` / `index`, plus a small
  `moves.ts` if the drag/paint helpers are shared with `render`).
- **The hex geometry, done bespoke** — `params.w`/`h` are the user-friendly size;
  the stored grid is wider (`w + ⌈h/2⌉ − 1`) with `F_BOUND` padding forming the
  hexagon, and neighbours come from a fixed six-step table. No `grid.ts` dependency
  (design D2).
- **The contradiction-based solver** — `Easy`/`Normal`/`Tricky` tiers built from
  the three validity checks (no-three-in-a-row, gravity/support, neighbour counts),
  with bounded lookahead for the harder tiers (design D3). All tiers are
  pure-deduction (guess-free); there is no guessing tier.
- **The generator** — fill respecting gravity + run limits, number the grid, remove
  numbers while the puzzle stays uniquely solvable at the target difficulty, with a
  minimum-shaded and minimum-difficulty gate. Byte-match portable (design D4).
- **The desc codec** — numbers as decimal digits (`_`-separated when adjacent),
  playable cells as run-length `a`–`z`, bounds derived from geometry not encoded
  (design D5).
- **Paint input** — click/drag to cycle a cell shade→unshade→empty (and the
  right-button reverse), plus a hex-aware keyboard cursor. Moves are a discriminated
  union, not upstream's `A%d;`/`S…` strings (design D6).
- **`findMistakes`** — bricks is uniquely solvable and its validity checks already
  localise every rule violation, so it ships the hook and Check & Save hard-blocks
  on it (design D7).
- **A byte-match differential** against a new `puzzles/auxiliary/bricks-trace.c`,
  covering every preset and a size sweep.
- **Stage 2, on owner acceptance**: add `TS_PORTED` to the `puzzle(bricks …)` entry
  in `puzzles/unreleased/CMakeLists.txt`, delete `puzzles/unreleased/bricks.c`, and
  rebuild.

Explicitly **not** in this change:

- **An explained hint** — bricks is deductive and a strong hint candidate, but an
  explained `hint()` is always its own change (playbook §1), per every prior port.
- **Printing** — `printing.c` was deleted at fork; bricks makes no new print
  promise (design context).

## Impact

- Affected specs: new `bricks` capability.
- Affected code: new `src/native/games/bricks/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/bricks-trace.c`.
- Stage 2 flips bricks to `TS_PORTED` and deletes `puzzles/unreleased/bricks.c`.
- No icon work: `src/assets/icons/bricks-{64,128}d8.png` already exist, so the
  `puzzle-icons` obligation is already met.
