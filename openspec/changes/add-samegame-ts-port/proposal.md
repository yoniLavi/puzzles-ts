# Proposal: Port Same Game to TypeScript

**Status**: Proposed

## Why

Migration-order item 7 ("outward, simplest-first") continues. Nine games are
TS-ported (Flip, Galaxies, Pegs, Sixteen, Cube, Fifteen, Twiddle, Flood, Guess).
**Same Game** is port #10, chosen by the owner. At ~1690 lines it is among the
smallest remaining games, and crucially it has **no human solver** to port — the
generator never consults a solver, so it is the lowest *logic*-risk game left.
It is also a **fresh mechanic family** (group-clear + gravity), and it exercises
one engine surface no ported game has used in anger yet:

- a **live score in the status bar**. Same Game keeps a running score in its game
  state and narrates it (plus the current selection's potential points) in the
  status bar. The engine already supports this fully — `Game.wantsStatusbar` +
  `Game.statusbarText(state, ui)`, recomputed on every transition *and* on
  `UI_UPDATE` — so this needs **no engine change**, just a game that uses it. It
  validates the status-bar path against a game whose status text is genuinely
  dynamic (selection-driven), which the existing ports never required.

Same Game also has a **UI-carried selection** (the connected region the player
has picked, awaiting a confirming second click) that lives in the `game_ui`, not
the game state — the first port whose primary interaction is a two-click
select-then-remove gesture. The `Game` interface already models this
(`interpretMove` mutates `ui` and returns `UI_UPDATE` for selection changes;
`changedState` clears the selection on every real transition), so again no
engine change is required.

## What Changes

- Add `src/native/games/samegame/` implementing
  `Game<SamegameParams, SamegameState, SamegameMove, SamegameUi,
  SamegameDrawState>`: clear the grid by removing orthogonally-connected groups
  (size ≥ 2) of one colour; tiles above a cleared group fall, columns shuffle
  left; score each removal `(n − scoresub)²` (clamped at 0); win when the grid is
  empty.
- Port **both generators faithfully**: the guaranteed-soluble inverse-move
  generator (`gen_grid` — repeatedly insert a verified two-square blob so the
  computer's intended solution is exactly the minimum score) and the legacy
  not-guaranteed-soluble random generator (`gen_grid_random`, the `r` param
  suffix). The desc is the upstream comma-separated colour list.
- Implement the **two-click selection** UI in `SamegameUi` (select a connected
  region on first click → `UI_UPDATE`; confirm-remove on a second click on the
  selection → a `remove` move; right-click / `CURSOR_SELECT2` on the selection
  deselects), plus a keyboard cursor, and the **live score status bar**.
- Implement `redraw`: the recessed border, per-tile rendering with right/down/
  diagonal joins so a connected region paints as one block with no internal
  gaps, the selection outline + `TILE_HASSEL` cursor marker, the
  `COL_IMPOSSIBLE` "no moves left" recolour, and the complete/impossible flash.
- Register in the TS registry + `TS_PORTED_PUZZLE_IDS`; add the `samegame`
  param-mapping branch to `worker-adapter.ts`; parity-gated.
- Differential check (per Flood/Guess precedent): a transient
  `puzzles/auxiliary/samegame-trace.c` freezes a small C-reference snapshot; a
  **gated** `samegame-differential.test.ts` asserts the TS generator reproduces
  the C desc **byte-for-byte** for the same seed (proving `random.ts`
  bit-identical end-to-end through both generation algorithms). Same Game's
  generator consults no solver, so desc equality is the strongest meaningful bar
  — exactly Flip's CROSSES case.
- On owner acceptance: add `TS_PORTED` to the `samegame` `puzzle(...)` block in
  `puzzles/CMakeLists.txt`, delete `puzzles/samegame.c` +
  `puzzles/auxiliary/samegame-trace.c`; archive.

## Out of scope

- **No solver / `solve()`.** Upstream Same Game has none (`false, NULL`); the
  game is open-ended scoring, not a deduction with a unique answer. `canSolve`
  is false.
- **No `hint()`.** With no solver there is no principled "best next move" to
  narrate. (A greedy/lookahead Same Game hint is a conceivable future
  divergence, but it is a feature, not parity, and is deferred.)
- **No `findMistakes`.** No move is individually "wrong" — the only failure mode
  is reaching a no-moves-left dead end, which upstream treats as **rescuable by
  Undo** (`game_status` returns 0, not −1), i.e. a status-bar message, not a
  flaggable mistake or a lost game. `findMistakes` is absent and `status()`
  never returns `"lost"`.
- **No animation.** Upstream `game_anim_length` is 0; removals are instant. (The
  complete/impossible **flash** is kept.)
- **No solution playback.** The upstream TODO about step-by-step Solve replay is
  not implemented in C and is not ported.

## Impact

- New: `src/native/games/samegame/` (state, index, render, tests, fixtures);
  transient `puzzles/auxiliary/samegame-trace.c` + its `CMakeLists.txt` line.
- Modified: `src/native/games/index.ts` (import), `ts-ported-ids.ts` (+`samegame`),
  `src/native/engine/worker-adapter.ts` (param mapping).
- On acceptance: `puzzles/CMakeLists.txt` (`TS_PORTED`), deletion of
  `puzzles/samegame.c` + the trace harness.
- No `Game`-interface or `Midend` change. No new dependencies.
