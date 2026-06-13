# Proposal: Port Palisade to TypeScript

**Status**: Proposed

## Context

Twelve games are TS-ported and owner-accepted (Flip, Galaxies, Pegs, Sixteen,
Cube, Fifteen, Flood, Twiddle, Guess, Samegame, Blackbox, Mosaic).
Migration-order item 7 ("outward, simplest-first") is the active phase.
**Palisade** (Nikoli's "Five Cells") is the next port.

## Why Palisade

- **Small game, self-contained logic** (`palisade.c` ~1588 lines). Clue numbers
  count the walls around each cell; the player draws walls so the grid divides
  into connected regions of exactly `k` cells, each cell's wall count matching
  its clue.
- **It exercises a genuinely new shape** — edge/border state (not cell state),
  shared between two adjacent cells, with a three-way per-edge value
  (wall / no-wall-mark / unknown). Establishes the border-toggle pattern for
  future loop/region games (Loopy, Tracks, Slant).
- **It pulls in one substantial leaf — `divvy.c`** (`divvy_rectangle`: randomly
  divide a rectangle into equal-size polyominoes). Ported idiomatically and
  kept local to Palisade per the lazy-leaf rule (Solo is its only other
  upstream consumer and is unported). Promotes two methods onto the shared
  `Dsf` (`size`, `equivalent`).

## Scope

- Port `puzzles/palisade.c` to `src/native/games/palisade/`:
  - **`state.ts`** — `PalisadeParams` (`w`, `h`, `k`) with the 4 upstream
    presets (5×5n5, 8×6n6, 10×8n8, 15×12n10), the `WxHnK` params codec,
    `validateParams` (k divides w·h, k<w·h, the k=2 corridor rule); the
    run-length clue desc codec (digit `0`–`4` = clue, letters = empty runs);
    `borders: Uint8Array` per-cell bitmask (low nibble = walls present, high
    nibble = no-wall marks — the upstream `borderflag` encoding kept verbatim);
    `init_borders` (the grid rim), `newState`, `cloneState`, `executeMove`
    (`edges`/`solve` discriminated union), `status`, `textFormat`,
    `isSolved` (DSF region-size + clue + no-stray-border check).
  - **`divvy.ts`** — idiomatic port of `divvy.c`: `addRemCommon`,
    `divvyRectangleAttempt`, and the `divvyRectangle` retry loop, over the
    shared `Dsf` + `shuffle` + `randomUpto`. Local leaf (lazy port, until Solo
    becomes a second consumer).
  - **`solver.ts`** — the six deductions (`connectedCluesVersusRegionSize`,
    `numberExhausted`, `notTooBig`, `notTooSmall`, `noDanglingEdges`,
    `equivalentEdges`) over a `SolverCtx` (params/clues/borders/dsf), the
    fixpoint loop, and `solve` returning solved-or-not; plus the generator
    (`newDesc`: divvy → derive clues → strip clues while still uniquely
    solvable).
  - **`index.ts`** — the `Game` object: `interpretMove` (click the nearest edge
    to toggle wall ↔ unknown; right-click toggles no-wall-mark ↔ unknown; the
    half-grid keyboard cursor + select), emitting the paired two-sided edge
    edit; `executeMove`; `solve` (run the solver from the rim, emit the border
    set); `findMistakes` (re-solve to the unique solution; flag every player
    wall the solution lacks and every no-wall mark the solution contradicts);
    `statusbarText` ("Region size: k").
  - **`render.ts`** — `colours` (background/flash/grid-black/line-maybe-yellow/
    line-no/error-red), `computeSize` (margin = ts/2), `setTileSize`,
    `newDrawState` (per-cell `Int32Array` flag cache, the documented
    no-BigInt pattern), `redraw` (first-draw grid dots + status; per-tile
    diffed `drawTile` with the four border rects, clue text, the live error
    highlighting computed from black/yellow border DSFs, the half-grid
    cursor box), `flashLength` (0.7s on solve).
- **Promote `Dsf.size(i)` and `Dsf.equivalent(a, b)`** onto
  `src/native/engine/dsf.ts` (the solver, `isSolved`, `divvy`, and `redraw`
  all need them). Pure additions; existing Galaxies/Pegs use unaffected.
- Add `palisade` to `worker-adapter.decodeCustomParams` via `describeParams`
  returning `width`/`height`/`region-size` (matching the existing
  `augmentation.ts` palisade `configFormatter`).
- Behavioural tests (params/desc codecs, divvy validity, solver deductions,
  `isSolved`, generator solvability across presets, move execution incl. the
  two-sided edge toggle and rim-protection, status, `textFormat`) and a tier-2
  render-ops test (border-error red rect emitted for an over-large region).
- Register in the TS registry (`index.ts` barrel) and add `palisade` to
  `TS_PORTED_PUZZLE_IDS`.
- On **owner-accepted** parity (rendering + input, not a green suite alone):
  add `TS_PORTED` to the CMake catalog and delete `puzzles/palisade.c`. Until
  then, `palisade.c` stays and the C build remains the fallback.

## Out of scope

- **The two upstream preferences** (`cursor-mode` half/full, and
  `clear-complete-regions`). The TS `Game` interface has no prefs hook yet, so
  the port hard-codes the modern defaults (half-grid cursor;
  no auto-clearing of completed-region edges) — a faithful render of upstream's
  default behaviour. Revisit if/when the engine grows a preferences contract.
- **No `hint()`.** The deductive solver could narrate hints; deferred, like
  Mosaic's.
- **No byte-identical board corpus.** Generation reuses bit-identical
  `random.ts`, but `divvy`'s search order is not asserted byte-for-byte against
  C; boards differ for the same seed while remaining valid and uniquely
  solvable. Differential check advisory/deferred (Cube/Fifteen/Mosaic
  precedent).
- **No print support** (deleted at fork; a cross-game concern).

## Impact

- **Affected specs:** new `palisade` capability; `ts-engine` MODIFIED (the
  `Dsf` helper gains `size`/`equivalent`).
- **Affected code:** new `src/native/games/palisade/`; two added methods on
  `src/native/engine/dsf.ts`; one import line in `src/native/games/index.ts`;
  one entry in `ts-ported-ids.ts`; (on owner acceptance) `TS_PORTED` in
  `puzzles/CMakeLists.txt` and deletion of `puzzles/palisade.c`.
