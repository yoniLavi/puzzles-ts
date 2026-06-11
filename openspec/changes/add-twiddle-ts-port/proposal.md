# Proposal: Port Twiddle to TypeScript (+ fold in geometry/cursor helper extraction)

**Status**: Proposed

## Context

Six games are now TS-ported (Flip, Galaxies, Pegs, Sixteen, Cube, Fifteen — all
at owner-confirmed parity with their C deleted). The porting pattern — `Game`
interface impl in `src/native/games/<id>/`, runtime registry, parity-gated
registration, per-game C deletion on owner acceptance — is well-trodden.
Migration-order item 7 ("outward, simplest-first") is the active phase, and the
owner has chosen **Twiddle** as port #7, with a small **shared-helper
extraction** folded into the front of the change (validated by Twiddle as its
first consumer rather than abstracted ahead of use).

## Why Twiddle

- **Genuinely simplest-tier** (`twiddle.c` ~1320 lines, the smallest real game
  left). State is a flat grid of numbered tiles; "solved" = ascending order;
  `solve()` simply snaps to solved (no human solver). Low porting risk.
- **Same bevelled-tile / grid family as Sixteen and Fifteen**, so the palette
  (`mkhighlight`), per-tile cache, completion flash, status bar, and pointer
  constants all reuse established shapes. The one genuinely novel rendering
  piece is the **subsquare rotation animation** (rotate an n×n block 90°, with
  the tile bevel edges recolouring through the turn) — self-contained and
  well-isolated in upstream's `game_redraw`.
- **A natural first consumer for the geometry + cursor helpers.** Twiddle is a
  grid game with a keyboard cursor *and* pixel↔cell mapping, so it exercises
  both extracted helpers, proving them by real use.

## Why fold in the helper extraction now

At six ports the repeated patterns are demonstrably real, not coincidental.
Two are clean, low-risk extractions in the same vein as the accepted
`extract-shared-helpers` change (mkhighlight, dsf, pointer constants,
`parseLeadingInt`) — **not** a new architectural direction:

1. **Grid-coordinate helpers** `coord`/`fromCoord`. Fifteen
   (`fifteen/index.ts:67`), Sixteen (`sixteen/index.ts:416`), and Pegs
   (`pegs/index.ts:766`) each carry a near-identical private copy; Flip and
   Galaxies inline the same math. Every `fromCoord` copy carries the C
   `(pixel − border + k·ts)/ts − k` integer-truncation idiom — that dance only
   emulates floor under C's truncating division; in TS `Math.floor((pixel −
   border)/ts)` is correct for all inputs including border clicks. Extracting
   lets us write it correctly **once** and delete the copied C-ism.
2. **Cursor button→delta** `cursorDelta(button)`. Every game re-rolls
   `if (button === CURSOR_UP) dy = −1; …` (Flip:553, Pegs:613/629, Sixteen:400,
   Fifteen:171, Galaxies:435). The atom worth sharing is just the button→unit
   delta; per-game clamping/validation stays local.

Folding the extraction in (rather than a standalone pre-port refactor) keeps the
helpers validated by an immediate consumer. The existing games' private copies
are migrated onto the helpers in the same change so the duplication is actually
removed, not merely supplemented — this is a pure refactor covered by each
game's existing tests.

## Why also delete `puzzles/sixteen.c`

Sixteen shipped at owner-confirmed parity (2026-06-04) and is marked
`TS_PORTED` in CMake, so `sixteen.c` is uncompiled dead reference — yet the
file is still present though both AGENTS.md and the archived
`add-sixteen-ts-port` change state it was deleted. Its only mentions are
comments in `misc.c:392` and `netslide.c:568`. Remove it to bring the tree in
line with the per-game-C-deletion rule and its own spec.

## Scope

- Port `puzzles/twiddle.c` to `src/native/games/twiddle/` (Sixteen/Fifteen
  model): `Game` impl, params (`w`, `h`, `n`, `rowsonly`, `orientable`,
  `movetarget`) with the 8 upstream presets and lenient decode, the
  scramble-by-random-moves generator (with the anti-undo/anti-repeat
  `prevmoves` logic), `do_rotate` block rotation + completion check, orientable
  orientation tracking, click + cursor-key + select + corner/keypad-shortcut
  input, `solve()` (snap-to-solved), the rotation animation with per-edge bevel
  recolouring, completion flash, and status bar (moves / target / since
  auto-solve). Register in the TS registry; add to `TS_PORTED_PUZZLE_IDS`.
- Extract `coord`/`fromCoord` into `src/native/engine/geometry.ts` and
  `cursorDelta` into `src/native/engine/pointer.ts`; have Twiddle consume them
  and migrate the existing games' private copies onto them.
- Add `TS_PORTED` to the CMake catalog and delete `puzzles/twiddle.c` **on
  owner-accepted parity** (rendering + animation + input, not a green suite
  alone). Delete the dead `puzzles/sixteen.c` in the same housekeeping step.

## Out of scope

- **No `findMistakes` hook.** Every reachable Twiddle position is legal (a
  permutation puzzle), so there is no notion of a mistake — `findMistakes` is
  correctly absent and Check-&-Save degrades to plain Quick-save, as for
  Sixteen/Fifteen.
- **No `hint()`.** Upstream has no human solver for Twiddle (`solve_game` just
  snaps), and a subsquare-rotation god's-algorithm planner is a separate, hard
  effort. Hints are omitted (a documented divergence from Sixteen/Fifteen,
  justified by the absence of any faithful human solver to narrate; recoverable
  if a planner is ever built).
- **No preferences UI** (the engine has no prefs hook yet). Twiddle has no
  per-user preferences upstream beyond params, so nothing is dropped here.
- **No refactor of per-game animation/flash/cache shapes** beyond the two
  named helper atoms. Those "duplications" are one-liners over genuinely
  per-game logic; abstracting them is explicitly declined (the scene-graph
  lesson).
- **No print support** (deleted at fork; a cross-game concern).
- **No byte-identical board corpus.** Differential check is advisory/deferred
  (like Cube/Fifteen) — the generator is a `random_upto` walk over the already
  bit-identical `random.ts` with no uniqueness loop to stress.

## Impact

- **Affected specs:** new `twiddle` capability; `ts-engine` (two ADDED
  helper requirements).
- **Affected code:** new `src/native/games/twiddle/`; new
  `src/native/engine/geometry.ts` + additions to `pointer.ts`; refactor of
  `coord`/`fromCoord`/cursor-delta call sites in `flip`, `galaxies`, `pegs`,
  `sixteen`, `fifteen`; one import line in `src/native/games/index.ts`; one
  entry in `ts-ported-ids.ts`; (on owner acceptance) `TS_PORTED` in
  `puzzles/CMakeLists.txt`, deletion of `puzzles/twiddle.c` and the dead
  `puzzles/sixteen.c`.
