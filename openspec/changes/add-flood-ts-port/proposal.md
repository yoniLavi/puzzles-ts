# Proposal: Port Flood to TypeScript

**Status**: Proposed (stub — scaffolded ahead of implementation; not started)

## Why

Migration-order item 7 ("outward, simplest-first") continues. Seven games are
TS-ported (Flip, Galaxies, Pegs, Sixteen, Cube, Fifteen, Twiddle). **Flood** is
the next simplest-first pick: at ~1400 lines it is the smallest remaining game,
and it is a **fresh mechanic family** (colour flood-fill, not grid permutation),
which broadens coverage. It also exercises two things no ported game has yet:

- a **genuine lose condition** (exceed the move limit) — the engine's
  `GameStatus` already supports `"lost"` (the WASM games emit it via
  `STATUS_LOST`), so this needs no engine change, just `status()` returning it;
- a **real solver** (upstream's depth-3 look-ahead heuristic) that both sets the
  par at generation time and maps cleanly onto our `hint()` plan system — Flood
  upstream literally ships a "follow the solver's moves" feature, which our hint
  plans reframe idiomatically.

## What Changes

- Add `src/native/games/flood/` implementing
  `Game<FloodParams, FloodState, FloodMove, FloodUi, FloodDrawState>` — flood-fill
  the top-left corner by picking a colour; win when the whole grid is one colour
  within the move limit, lose when the limit is reached first.
- Port the heuristic solver (`search` boundary-distance BFS + `choosemove`
  depth-3 look-ahead) faithfully; it backs the generator (par = solver moves +
  leniency), `hint()`, and `solve()`.
- Implement `hint()` (the solver's whole move plan, highlighting the squares the
  next fill absorbs — upstream's `SOLNNEXT`) + `hintKeepTrack`, and `solve()`
  (snap-to-solved by running the solver and applying all fills).
- Register in the TS registry + `TS_PORTED_PUZZLE_IDS`; parity-gated.
- On owner acceptance: `TS_PORTED` in CMake + delete `puzzles/flood.c`; archive.

## Out of scope

- **No `findMistakes`.** No move is individually "wrong"; the failure mode is
  running out of moves, which is the `"lost"` status, not a flaggable mistake.
- **No upstream stored-solution machinery** (`soln`/`solnpos`/refcounts,
  `CURSOR_SELECT2` to advance the path). Our engine's `hint()` plan + auto-play
  supersede it; dropping it is the idiomatic simplification.
- **No print support** (deleted at fork).

## Impact

- **Affected specs:** new `flood` capability. (Likely none on `ts-engine` — the
  `"lost"` status already exists; confirm during implementation.)
- **Affected code:** new `src/native/games/flood/`; one import line in
  `src/native/games/index.ts`; one entry in `ts-ported-ids.ts`; (on owner
  acceptance) `TS_PORTED` in `puzzles/CMakeLists.txt` + deletion of
  `puzzles/flood.c`.
