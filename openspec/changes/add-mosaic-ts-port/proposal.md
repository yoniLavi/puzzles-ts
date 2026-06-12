# Proposal: Port Mosaic to TypeScript

**Status**: Proposed

## Context

Eleven games are TS-ported and owner-accepted (Flip, Galaxies, Pegs, Sixteen,
Cube, Fifteen, Flood, Twiddle, Guess, Samegame, Blackbox). Migration-order
item 7 ("outward, simplest-first") is the active phase. **Mosaic** is the next
genuinely-simplest port.

## Why Mosaic

- **Simplest-tier remaining** (`mosaic.c` ~1637 lines; the only smaller game,
  Palisade at ~1588, drags in a `divvy.c` leaf port — Mosaic's sole
  dependencies are `puzzles.h` and `random_*`, both already TS).
- **The substance is one small deductive solver** (`solve_cell`: a clue is
  satisfied → blank the rest; a clue needs all remaining → mark the rest;
  contradiction detection) reused three ways: generation feasibility
  (`solve_check`), clue minimisation (`hide_clues`), and the Solve command
  (`solve_game_actual`). It ports cleanly to idiomatic TS with behavioural
  tests standing in for a corpus.
- **It reuses an already-ported helper and promotes another.** The generator
  needs upstream `shuffle()`; Galaxies carries a local Fisher-Yates over
  `RandomState`. By the established second-consumer rule (`SortedMultiset`,
  `Dsf`, `obfuscate`), this change **promotes `shuffle` to
  `src/native/engine/shuffle.ts`** and points both games at it.
- **It deepens cross-game feature coverage cheaply.** Mosaic's
  deduction-solvable boards have a unique solution the solver computes, so
  `findMistakes()` (cells contradicting the solution) costs ~20 lines on top
  of the Solve path — Check-&-Save works fully, matching the owner's
  expectation that most games carry it.

## Scope

- Port `puzzles/mosaic.c` to `src/native/games/mosaic/`:
  - **`state.ts`** — `MosaicParams` (`width`, `height`, `aggressive`) with the
    6 upstream presets (3/5/10/15/25 aggressive, 50 not), `WxH[h<0|1>]`
    params codec, `validateParams` (min 3×3, max 10000 tiles); the run-length
    desc codec (digit = shown clue, letter `a`-`z` = 1-26 hidden cells);
    `newState` with a frozen clue board shared across states (upstream's
    refcounted `board_state`); cell-state flags (`UNMARKED`/`MARKED`/`BLANK` +
    `SOLVED`/`ERROR` overlays); `executeMove` helpers
    (`updateBoardStateAround`, full-board clue recount); `status`;
    `textFormat`.
  - **`solver.ts`** — `solveCell` (the per-clue deduction with
    contradiction detection), `solveCheck` (desc-side feasibility with
    rng-shuffled clue order + `needed` tracking), `hideClues` (aggressive
    minimisation with revert-on-unsolvable), `solveGameActual` (board-side
    solve for the Solve command and `findMistakes`), and the generator
    (`generateImage` via `randomBits`, `populateCell` with the
    edge/corner full-cell rules, `startPointCheck`, `newDesc`).
  - **`index.ts`** — the `Game` object: `interpretMove` (click toggles
    1 step, right-click 2 steps; straight-line drag/release painting with
    `lastState` carried in the Ui; keyboard cursor + select/select2),
    `executeMove` (`toggle`/`paint`/`solve` discriminated union), `solve`
    (hex-packed solution bitmap, as upstream), `findMistakes` (cells whose
    mark contradicts the deduced solution), `statusbarText` ("Clues left: N" /
    "COMPLETED!" / "Auto solved").
  - **`render.ts`** — `colours` (teal unmarked, near-black marked, light-grey
    blank, red error text, grey solved text, pink cursor), `computeSize`
    (margin = ts/2), `setTileSize`, `newDrawState` ((w+1)×(h+1) `Int32Array`
    cell cache, the documented no-BigInt pattern), `redraw` (per-cell diffed
    `drawCell` with grid lines, cursor edges, clue text; completion flash
    XORing marked/blank in the first/last third of 0.5s; mistake-overlay
    outline), `flashLength`.
- **Promote `shuffle` to `src/native/engine/shuffle.ts`** and repoint
  Galaxies' generator. Pure code move; covered by existing Galaxies tests.
- Add the `mosaic` branch to `worker-adapter.decodeCustomParams` mapping
  `width`/`height`/`aggressive` → the `width`/`height`/`aggressive-generation`
  type-summary keys (`aggressive-generation` as a real boolean — the
  augmentation formatter compares it to a computed boolean default).
- Behavioural tests (params/desc codecs, generator validity + solvability,
  solver deductions + contradiction, move execution incl. drag painting and
  solved/error clue marking, status mapping, `findMistakes`) and a tier-2
  render-ops test.
- Register in the TS registry (`index.ts` barrel) and add `mosaic` to
  `TS_PORTED_PUZZLE_IDS`.
- On **owner-accepted** parity (rendering + input, not a green suite alone):
  add `TS_PORTED` to the CMake catalog and delete `puzzles/mosaic.c`. Until
  then, `mosaic.c` stays and the C build remains the fallback.

## Out of scope

- **No `hint()`.** The deductive solver could narrate hints ("clue N is
  satisfied; blank its neighbours") but the plan-carrying shape needs design
  (a deduction marks a 3×3 neighbourhood, not a single move). Deferred as a
  natural follow-up, like Galaxies' association aid.
- **No byte-identical board corpus.** Generation reuses bit-identical
  `random.ts`, but `solve_check`'s clue-visit order (upstream builds a
  reversed linked list before shuffling) is not replicated byte-for-byte;
  boards differ from C's for the same seed while remaining valid and
  deduction-solvable. Differential check is advisory/deferred
  (Cube/Fifteen/Blackbox precedent).
- **No print support** (deleted at fork; a cross-game concern).

## Impact

- **Affected specs:** new `mosaic` capability.
- **Affected code:** new `src/native/games/mosaic/`; new
  `src/native/engine/shuffle.ts` (Galaxies' generator repointed); one branch
  in `src/native/engine/worker-adapter.ts`; one import line in
  `src/native/games/index.ts`; one entry in `ts-ported-ids.ts`; (on owner
  acceptance) `TS_PORTED` in `puzzles/CMakeLists.txt` and deletion of
  `puzzles/mosaic.c`.
