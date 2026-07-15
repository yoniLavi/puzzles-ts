# Port Tracks (tracks.c) to native TypeScript

## Why

Tracks (Train Tracks) is the strongest next game in the top-down migration:
a mid-size pure-logic puzzle (~3160 lines of C) whose only leaf dependencies
— `dsf` and `findloop` — are **already** ported as shared engine helpers, so
it is unblocked today (unlike loopy/pearl, which need `grid.c` + `loopgen.c`).
Its graded deductive solver (clue counting, loose-end / single-track
reasoning, neighbour parity, and a bridge-parity argument over `findloop`)
makes it a strong future explained-hint candidate — a separate change. No
`midend_supersede_game_desc`, no editor-only move letters, no `qsort` near the
desc (byte-match differential is feasible).

## What Changes

- Add `src/native/games/tracks/` implementing
  `Game<TracksParams, TracksState, TracksMove, TracksUi, TracksDrawState,
  TracksMistake>`: lay a single train track from an entrance on the left edge
  to an exit on the bottom edge of a `w × h` grid, using only straight and
  curved rails that never cross or loop, so every row/column clue counts the
  number of track-bearing cells in it. Params `w`, `h`, `diff`
  (Easy/Tricky/Hard) and `single_ones` (disallow consecutive 1-clues); all 12
  upstream presets.
- Port the **solver** (`tracks_solve`): the Easy rung (edge/square flag
  propagation, row/column count deductions, immediate loop avoidance over a
  `Dsf`), the Tricky rung (single-track and loose-end reasoning, one-way
  neighbour deduction), and the Hard rung (two-way neighbour deduction and the
  bridge-parity argument over the shared `findLoops` bridge finder). The
  generator (`new_game_desc` → `lay_path` + `add_clues`) is **solver-gated**:
  the TS solver must reach C's verdict on every intermediate board (§4.4 of
  the playbook), so the desc is byte-reproducible from the seed.
- Port the **live error/completion analysis** faithfully (`check_completion`):
  cells with >2 track edges, loop cells (via `findLoops`), off-path track
  cells once a complete A→B path exists, and row/column clue-count errors —
  drawn as the always-on red overlay, exactly as upstream.
- Ship **`findMistakes`** (boards are uniquely solvable; Check & Save depends
  on it): re-solve from the clues and flag every square/edge the player has
  marked that contradicts the unique solution.
- Model input idiomatically: left-drag paints track along a straight
  row/column, right-drag paints "no track"; a click near a cell centre toggles
  the square, near an edge toggles that edge; a half-grid keyboard cursor
  toggles squares (centre) and edges. A drag or click that changes nothing
  produces no move (local no-op suppression — no state-string undo).
- Render to full parity (NARROW_BORDERS: zero gutter, a one-tile margin for
  clue numbers and the A/B entrance/exit labels): straight rails with
  sleepers, curved rails, no-track crosses, the blue/light-blue drag preview,
  row/column clue numbers (red on error), and the track-following completion
  flash — palette index-for-index with the C colour enum.
- Byte-match differential: transient `puzzles/auxiliary/tracks-trace.c` records
  preset/seed → desc fixtures; a committed gated test asserts `newDesc`
  reproduces them exactly and that the TS solver grades each C board at the
  recorded difficulty.
- Register the game for owner smoke-testing (stage 1). On owner acceptance,
  flip `TS_PORTED`, delete `puzzles/tracks.c` (and the trace harness), and
  archive this change (stage 2). `puzzles/dsf.c` and `puzzles/findloop.c` stay
  — both still have C consumers.

## Impact

- Affected specs: **new `tracks` capability**. No `ts-engine` change (`dsf`
  and `findloop` already exist as shared helpers).
- Affected code: `src/native/games/tracks/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,tracks-trace.c}`
  (transient trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at stage 2),
  `puzzles/tracks.c` (deleted at stage 2).
- No pencil-mark UX (no candidate notes in Tracks). No keypad (upstream
  `game_request_keys` is NULL). No supersede, no printing, no editor letters
  (documented skips). No app-shell changes.
