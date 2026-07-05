# Port Magnets (magnets.c) to native TypeScript

## Why

Magnets is the next game (#29) in the top-down migration: a mid-size
pure-logic puzzle (~2700 lines of C) with a graded deductive solver and a
unique solution — a strong fit for the fork's `findMistakes` / Check-&-Save
contract and a future explained-hint candidate (a separate change). Its only
shared-library dependency (`domino_layout`, `laydomino.c`) is not yet ported;
it is a small, generic 2×1 domino-layout leaf that the future Dominosa port
will also want, so it lands in `engine/`. No `midend_supersede_game_desc`, no
editor-only move letters, no undo-via-state-string equality, and no `qsort`
near the desc — so a **byte-match differential** is feasible (the generator's
only RNG draws are `shuffle`/`random_upto` in `domino_layout` and
`lay_dominoes`, plus the strip-clues shuffle, all reproducible over the
bit-identical RNG).

## What Changes

- Port `domino_layout` (`laydomino.c`) to `src/native/engine/laydomino.ts`
  as a shared leaf (idiomatic typed-array TS, RNG-faithful: the `shuffle` of
  the placement list and the per-BFS-node `shuffle` of neighbour directions
  must reproduce C's draws). Add a tier-1 test.
- Add `src/native/games/magnets/` implementing
  `Game<MagnetsParams, MagnetsState, MagnetsMove, MagnetsUi, MagnetsDrawState, MagnetsMistake>`:
  fill a grid of dominoes so each domino is either a magnet (one `+` end and
  one `-` end) or neutral, no two orthogonally-adjacent cells share a
  polarity, and each row/column contains its `+` and `-` clue counts. Some
  dominoes are fixed singleton (permanently neutral) squares. Params `w`,
  `h`, `diff` (Easy/Tricky), `stripclues` (boolean); all 8 upstream presets.
- Port the **graded solver** (`solve_state`) faithfully with its exact
  deductive power at each difficulty (Easy: force-by-flags, neither-tile,
  row/col count-full, odd-length-section; Tricky adds advanced-full,
  single-neutral, count-dominoes-neutral/non-neutral), returning the
  impossible / ambiguous / solved (−1 / 0 / 1) verdict identical to C.
- Port the **generator** (`new_game_desc`): `domino_layout` then
  `lay_dominoes` (lay a few neutral dominoes, then prefer magnets, solving as
  we go), derive the row/column counts, and reject boards not soluble at
  exactly the target difficulty; when `stripclues` is set, remove clues in a
  shuffled order while the board stays uniquely solvable. Byte-match-critical
  (§4.3–4.4): every RNG draw and the solver's verdict on each intermediate
  board must match C.
- Port the **live error / completion analysis** (`check_completion`): red
  `GS_ERROR` on two touching identical terminals, over-committed row/column
  clue counts turning red, and the completion test.
- Ship **`findMistakes`** (boards are uniquely solvable; Check & Save depends
  on it): re-solve from the dominoes + row/column counts and flag every
  placed cell that contradicts the unique solution (a `+`/`−`/neutral where
  the solution differs; a non-uniquely-solvable hand-typed board degrades to
  "no mistakes").
- Render to full parity: the rounded-corner dominoes (borrowed from
  dominosa's tile drawing), `+`/`−` symbols, neutral cross, blue not-neutral
  `?`, singleton black squares, the `+`/`−` counts on all four borders (top =
  column `+`, bottom = column `−`, left = row `+`, right = row `−`) with the
  corner `+`/`−` symbols, the click-to-grey "clue done" toggle (`COL_DONE`),
  red over/under-committed counts, keyboard cursor, and the win flash.
  Web build's `NARROW_BORDERS` geometry (`BORDER = 0`). Palette
  index-for-index with the C enum; the fork mistake overlay appended past it.
- Port the input model: left-click / `CURSOR_SELECT` cycles a domino cell
  empty→`+`→`−`→empty (magnet cycle); right-click / `CURSOR_SELECT2` cycles a
  domino cell empty→neutral→not-neutral→empty; left-click a border clue
  toggles its "done" grey; keyboard cursor.
- Byte-match differential: transient `puzzles/auxiliary/magnets-trace.c`
  records preset/seed → desc fixtures (including a `stripclues` case); a
  committed gated test asserts `newDesc` reproduces them exactly plus the TS
  solver grades each C board at the recorded difficulty.
- Register the game for owner smoke-testing (stage 1). On owner acceptance,
  flip `TS_PORTED`, delete `puzzles/magnets.c` (and the trace harness), and
  archive this change (stage 2). `puzzles/laydomino.c` stays — its
  `domino_layout` still has a C consumer (`dominosa.c`, unported).

## Impact

- Affected specs: **new `magnets` capability**; a note in `repo-layout` for
  the new shared `engine/laydomino.ts` leaf.
- Affected code: `src/native/engine/laydomino.ts` (new),
  `src/native/games/magnets/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,magnets-trace.c}`
  (transient trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at stage
  2), `puzzles/magnets.c` (deleted at stage 2).
- No pencil-mark candidate UX (the not-neutral `?` is a per-domino flag, not
  a candidate grid). No keypad (upstream `game_request_keys` is NULL). No
  supersede, no printing port, no editor letters (documented skips). No
  app-shell changes.
