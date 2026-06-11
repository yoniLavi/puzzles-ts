# Proposal: Port Flood to TypeScript

**Status**: Implemented, parity-gated (registered + dev-verified; owner
acceptance pending → then flip `TS_PORTED`, delete `flood.c`, archive)

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

- **Affected specs:** new `flood` capability. Confirmed **no** `ts-engine`
  change — the `"lost"` status already exists and flows through the midend and
  app shell unchanged (dev-verified: the "Out of moves" lost-state dialog fires
  on the TS path exactly as for a WASM game — design D6).
- **Affected code:** new `src/native/games/flood/`; one import line in
  `src/native/games/index.ts`; one entry in `ts-ported-ids.ts`; one transient
  harness `puzzles/auxiliary/flood-trace.c` + its `CMakeLists.txt` line + the
  frozen fixture; **plus a `flood` branch in `worker-adapter.ts`
  `decodeCustomParams`** (newly discovered: without it the type-summary
  template's `{colours}`/`{extra-moves-permitted}` placeholders rendered as raw
  tokens on the TS path — every other ported game with non-`w`/`h` params has
  the same branch); (on owner acceptance) `TS_PORTED` in `puzzles/CMakeLists.txt`
  + deletion of `puzzles/flood.c` and `flood-trace.c`.

### Implementation notes

- **`status()` follows `flood.c` exactly, not design D6's wording.** Upstream
  `game_status` returns defeat once `moves >= movelimit` *regardless of
  `complete`* — so completing the grid one move over the limit is still a loss.
  D6's prose ("complete takes priority") was imprecise; the port mirrors the C,
  and `statusbarText` mirrors the C status string (`COMPLETED!` / `FAILED!` /
  `Auto-solved` / `Auto-solver used.`). Solve-snaps suppress the flash and the
  common case (Solve from a fresh board) stays within the limit → `solved` →
  `solved-with-help` → "Auto-solved".
- **Known pre-existing limitation (not introduced here, shared with WASM):**
  the top-bar type summary derives from `currentParams`, which is the game-id's
  *short* params form (`WxH`); flood's `encode_params(full=false)` omits
  colours/leniency on both the TS and WASM paths, so a non-default-colour board
  shows the default "6 colours, 5 extra moves". Surfaced for a possible separate
  cross-cutting fix; out of scope for this port.
