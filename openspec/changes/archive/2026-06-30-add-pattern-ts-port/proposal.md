# Port Pattern (Nonograms) to native TypeScript

## Why

Pattern (Nonograms / Picross) is the next game in the top-down migration: an
iconic, product-valuable puzzle that is fully self-contained — a plain square
grid, no exotic leaf libraries (`grid.c`/`loopgen`/`findloop`/`combi`), no
`midend_supersede_game_desc`, no editor-only move letters. It follows the
established self-contained-game port pattern (Galaxies/Unruly exemplars) with no
new engine doctrine, so it can land quickly while delivering a recognisable
headline game. Its per-line deductive solver is a strong future explained-hint
candidate (a separate change, per the hint-authoring guide).

## What Changes

- Add `src/native/games/pattern/` implementing
  `Game<PatternParams, PatternState, PatternMove, PatternUi, PatternDrawState>`:
  the nonogram on a `w × h` grid with per-row/column run-length clues, 3-state
  cells (unknown / full / empty), drag-to-fill rectangle moves, and keyboard
  cursor input.
- Port the per-line nonogram **solver** (`solve_puzzle`) and the **solver-gated
  generator** (`generate_soluble` — generate a random grid, then require it to
  be uniquely line-solvable). Because the generator's published clue set is
  decided by the solver's verdict, a **byte-match differential** (§4.4) requires
  the TS solver to reach C's exact verdict on every board.
- Ship **`findMistakes`** (Pattern is uniquely solvable, so Check & Save depends
  on it) — flag every player-marked cell that contradicts the unique solution.
- Render the board to full parity: clue numbers (with the `check_errors`
  red-clue overlay when a completed line's runs contradict its clue),
  drag-rectangle preview, cursor, win flash.
- Register the game for owner smoke-testing (stage 1). On owner acceptance, flip
  `TS_PORTED`, delete `puzzles/pattern.c`, and archive this change (stage 2).

## Impact

- Affected specs: **new `pattern` capability**.
- Affected code: `src/native/games/pattern/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,pattern-trace.c}` (transient
  C trace harness for the differential fixture), `puzzles/CMakeLists.txt`
  (`TS_PORTED` at stage 2), `puzzles/pattern.c` (deleted at stage 2).
- No pencil-mark UX (3-state cell, not candidate notes). No supersede, no
  printing (documented skips). No app-shell changes.
