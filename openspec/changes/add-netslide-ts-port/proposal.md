# Port Netslide (netslide.c) to native TypeScript

## Why

Netslide is the easiest remaining game by a wide margin, and it is unblocked
today. At **1893 lines** it is the smallest unported `.c` (the next is rect at
3029, then pearl 3062, tracks 3163, net 3361, mines 3457, map 3478, loopy 3921).
Its **only** leaf dependency is `tree234`, for which
[`engine/sorted-multiset.ts`](../../../src/native/engine/sorted-multiset.ts)
is already a drop-in (`add234`/`del234`/`delpos234`/`index234` →
`add`/`delete`/`removeAt`/`get`). It has **no solver at all** — `solve_game`
replays the generator's `aux` — and its core mechanic, toroidal row/column
sliding with a slide animation, is exactly the pattern **Sixteen** established.

It also clears the long-tail-risk checklist outright: no
`midend_supersede_game_desc` (unlike Net and Mines, both still blocked on that
hook), no `#ifdef EDITOR` move letters, no printing, and no `qsort` anywhere
near the desc — so a **byte-match differential** is feasible.

Netslide is "Net crossed with Sixteen": the board is a Net wiring grid, but
instead of rotating a tile you slide a whole row or column, wrapping around.
The centre row and column cannot be slid, which is what makes it a puzzle.

## What Changes

- Add `src/native/games/netslide/` implementing
  `Game<NetslideParams, NetslideState, NetslideMove, NetslideUi,
  NetslideDrawState>`: slide rows/columns of a `w × h` Net grid (wires
  encoded as R/U/L/D bits) until every tile is connected to the powered
  centre. Params `w`, `h`, `wrapping`, `barrierProbability`, `movetarget`;
  all 9 upstream presets (3×3 / 4×4 / 5×5 × easy/medium/hard).
- Port the **generator**: the spanning-tree grid construction (grow out from
  the centre, picking uniformly from a sorted set of frontier
  `(x, y, direction)` possibilities, suppressing full-cross tiles and closed
  loops), the shuffle (random slides that decline to undo the previous move or
  to repeat past the point of being a shorter move the other way), and the
  post-shuffle barrier placement (deliberately *after* the shuffle so raising
  the barrier rate on the same seed yields a superset of the same barriers).
  There is **no solver** — the unshuffled grid is saved as `aux` and `solve()`
  replays it, faithful to upstream.
- Port `compute_active`: the flood fill from the centre that powers connected
  wires, drives the win check, and (as a deliberate render nicety upstream
  already has) treats a mid-slide row/column as unpowered so "current" doesn't
  appear to jump across a moving line.
- Render to full parity: wire tiles with powered/unpowered colouring, endpoint
  and centre boxes, the barrier walls with their corner-joining flags, the
  border slide arrows, the slide animation (including the wrapped tile drawn
  off-grid), and the distance-from-centre completion flash. Palette
  index-for-index with the C enum.
- Port the **border ring cursor** (upstream's `c2pos`/`c2diff`/`pos2c` from
  `misc.c` — netslide is their only consumer in the whole C tree, so they stay
  game-local rather than being promoted to `engine/`), including the skip over
  the un-slidable centre row/column.
- Ship `statusbarText` (moves, target, active count) via the existing
  `Game.statusbarText` hook.
- **Port the `NARROW_BORDERS` variant** of the geometry — `webapp.cmake`
  defines it, so the browser build's border is `3·TS/4 + 1`, not a full tile
  (playbook §3.2, the Slant lesson).
- Byte-match differential: a transient `puzzles/auxiliary/netslide-trace.c`
  records preset/seed → desc fixtures; a committed gated test asserts
  `newDesc` reproduces them exactly.
- Register the game for owner smoke-testing (stage 1). On owner acceptance,
  flip `TS_PORTED`, delete `puzzles/netslide.c` (and the trace harness), and
  archive this change (stage 2).

## Impact

- Affected specs: **new `netslide` capability**.
- Affected code: `src/native/games/netslide/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,netslide-trace.c}`
  (transient trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at
  stage 2), `puzzles/netslide.c` (deleted at stage 2).
- **No `findMistakes`**: every reachable board is legal (it is a permutation
  puzzle — any state can still be slid to the solution), so there is no
  wrong-but-legal state to flag. Check & Save correctly degrades to a plain
  quick-save, exactly as it does for Sixteen/Fifteen/Twiddle
  (playbook §3.5's explicit carve-out).
- No pencil marks, no keypad (upstream `game_request_keys` is NULL), no
  preferences (upstream has none), no supersede, no editor letters.
- `puzzles/tree234.c` stays — it still has C consumers (net, mines, loopy).
- No app-shell changes.
- An explained `hint()` is deliberately **out of scope** — a separate change,
  as it was for Sixteen.
