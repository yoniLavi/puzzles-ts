# Proposal: Port Fifteen to TypeScript

**Status**: Proposed

## Context

Five games are now TS-ported (Flip, Galaxies, Pegs, Sixteen at owner-confirmed
parity with their C deleted; Cube registered + dev-verified, owner-acceptance
pending). The porting pattern — `Game` interface impl in
`src/native/games/<id>/`, runtime registry, parity-gated registration, per-game
C deletion on owner acceptance — is well-trodden. Migration-order item 7
("outward, simplest-first") is the active phase, and the owner has chosen
**Fifteen** as port #6.

## Why Fifteen

- **The simplest remaining game** (`fifteen.c` ~1272 lines) and the canonical
  sliding-block puzzle — high product-recognition value for low porting risk.
- **Direct sibling of the already-ported Sixteen.** The bevelled-tile
  rendering, recessed border, two-pass slide animation, completion flash,
  status-bar text, and parity-corrected random generator all reuse Sixteen's
  established shapes (and the shared `mkhighlight` palette + pointer
  constants). The differences are local and well-understood: Fifteen has a
  *gap* (tile 0) and slides a whole line of tiles into it, rather than
  Sixteen's gapless toroidal row/column rotation.
- **Ships a clean greedy human solver** (`compute_hint`: fill the
  top row / left column tile-by-tile, with a hard-coded shortest-path table
  for each 3×2 end-of-row corner). That gives the cross-game `hint()` hook a
  faithful implementation almost for free, and validates the hint system on a
  second, structurally different game.

## Scope

Port `puzzles/fifteen.c` to `src/native/games/fifteen/` following the
established pattern (Sixteen model): `Game` impl, parity-corrected generator,
gap-slide move logic, the greedy `compute_hint` solver, slide animation, win
flash, click + keyboard input, per-tile rendering, status bar. Wire
`solve()` (snap-to-solved), `hint()` (one greedy step per request), and
`textFormat`. Register in the TS game registry. Add `TS_PORTED` to the CMake
catalog and delete `puzzles/fifteen.c` **on owner-accepted parity** (rendering
+ animation + input, not a green suite alone — per the
parity-gated-registration doctrine).

## Out of scope

- **No `findMistakes` hook.** Every reachable Fifteen position is legal (it is a
  permutation puzzle with no "wrong" intermediate state), so there is no notion
  of a mistake to flag — `findMistakes` is correctly absent and the combined
  Check-&-Save control degrades to plain Quick-save, exactly as for Sixteen.
- **No arrow-semantics preference UI.** Upstream's `FIFTEEN_INVERT_CURSOR`
  preference (arrow points the way the *gap* moves vs. the way a *tile* moves)
  is a per-user config item; the TS engine has no preferences hook yet, so we
  ship upstream's default ("the arrow moves a tile") and omit the toggle. A
  documented divergence, recoverable when a prefs hook lands.
- **No multi-step hint plan / `hintKeepTrack`.** Fifteen's natural hint
  granularity is one gap-move at a time (`compute_hint` is inherently
  incremental); a single-step plan recomputed per request matches upstream's
  one-move-per-`h`-press behaviour without the narration/tracking machinery
  Sixteen needed for its full-slide planner.
- **No new shared engine helpers** beyond what already exists. If the greedy
  solver turns out reusable it can be extracted later; Fifteen is its only
  consumer today.
- **No print support** (deleted at fork; a cross-game concern).

## Impact

- **Affected specs:** new `fifteen` capability.
- **Affected code:** new `src/native/games/fifteen/`; one import line in
  `src/native/games/index.ts`; one entry in
  `src/native/games/ts-ported-ids.ts`; (on owner acceptance) `TS_PORTED` in
  `puzzles/CMakeLists.txt` and deletion of `puzzles/fifteen.c`.
