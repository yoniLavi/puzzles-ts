# Port Bridges (bridges.c) to native TypeScript

## Why

Bridges (Hashiwokakero) is the next port in the top-down migration: a beloved,
mid-large pure-logic puzzle (~3350 lines of C) with a graded, multi-stage
deductive solver and a unique solution — a strong fit for the fork's
`findMistakes` / Check-&-Save contract and an excellent future explained-hint
candidate (a separate change; its deductions — island-degree forcing, forced
last-bridge, no-premature-isolation — teach real technique). Its two
shared-library dependencies, `dsf` and `findloop`, are **already ported**
(`engine/dsf.ts`, `engine/findloop.ts`), so no leaf work is needed. No
`midend_supersede_game_desc`, no editor-only move letters, no undo-via-state-
string equality, no `qsort` anywhere, and the generator's only RNG draws are
`random_upto` (island placement + bridge growing) — so a **byte-match
differential** is feasible over the bit-identical RNG.

## What Changes

- Add `src/native/games/bridges/` implementing
  `Game<BridgesParams, BridgesState, BridgesMove, BridgesUi, BridgesDrawState, BridgesMistake>`:
  connect the numbered islands with horizontal/vertical bridges so each island
  carries exactly its number of bridge-ends, at most `maxb` (default 2) bridges
  join any pair, bridges never cross an island or another bridge, and all
  islands form one connected group. Params `w`, `h`, `maxb`, `islands`
  (%-of-squares density), `expansion` (%), `allowloops` (boolean), `difficulty`
  (Easy / Medium / Hard); all 9 upstream presets (7×7, 10×10, 15×15 × three
  difficulties).
- Port the **graded multi-stage solver** (`solve_sub` driving
  `solve_island_stage1/2/3`, `map_group`/`map_group_check`/`map_group_full`,
  `map_update_possibles`, `island_adjspace`/`island_countspaces`/
  `island_impossible`) faithfully with its exact deductive power per difficulty:
  Easy = stage 1 (fill forced bridges from an island's own count and available
  space); Medium adds stage 2 (per-direction min/max reasoning); Hard adds
  stage 3 (dsf subgroup / no-isolated-group and loop-avoidance deductions). The
  solver is purely deductive — no guess-and-verify recursion (upstream
  `solve_sub`'s `depth` is unused). Returns the impossible / not-solved verdict
  identical to the C.
- Port the **generator** (`new_game_desc`): place a random island, grow the map
  by repeatedly picking an island + direction and joining/expanding a new island
  (RNG draws: initial `x,y`; per-step island index, direction index, expansion
  rolls vs `expansion%`, new-island offset, join count) until the island-density
  target is met, then re-solve to derive clue numbers and reject boards not
  soluble at exactly the target difficulty (retry loop). Byte-match-critical
  (§4.3): every `random_upto` draw and the solver's verdict on each board must
  match C.
- Port the **live error / completion analysis**: `map_hasloops` (via the shared
  `findloop`) marks bridges that form a loop when `allowloops` is false;
  `island_impossible` marks an over-committed or unsatisfiable island;
  `map_check` / `game_status` decide the win (all islands satisfied, one
  connected group, no disallowed loop). Errored islands/bridges render red
  (`COL_WARNING`).
- Ship **`findMistakes`** (boards are uniquely solvable; Check & Save depends on
  it): re-solve from the island clues to the unique solution and flag every
  player-placed bridge that the unique solution contradicts (a bridge where the
  solution has none, or a count exceeding the solution's); a non-uniquely-
  solvable hand-typed board degrades to "no mistakes". Render flagged bridges
  with a distinct overlay in the diff key (§3.2), separate from the always-on
  live error red.
- Render to full parity: islands as circles with their count (red when
  impossible, grey ring cursor), 1- and 2-thick bridges (horizontal/vertical),
  the drag preview line, `MARK`/no-line marks (right-drag), the `COL_HINT`
  faint hint lines when the show-hints pref is on, the win flash, and the
  keyboard cursor. Web build has no `#ifdef`-gated geometry to special-case
  (grep clean). Palette index-for-index with the C enum
  (`BACKGROUND, FOREGROUND, HIGHLIGHT, LOWLIGHT, SELECTED, MARK, HINT, GRID,
  WARNING, CURSOR`); the fork mistake overlay appended past it.
- Port the input model (`interpret_move` + `update_drag_dst` + `finish_drag`):
  left-drag from an island along a row/column adds/increments a bridge to the
  next island (wrapping back to zero past `maxb`); right-drag toggles a
  no-line/mark on the spanned segment; cursor keys move a keyboard cursor and
  `CURSOR_SELECT` grabs/drops a drag; `G`/grid-cursor select. No editor letters.
- Preferences: the `show-hints` boolean (upstream `PREF_SHOW_HINTS`) via the
  `Game.prefs` hook — when on, faint hint lines show forced/forbidden bridges.
- Byte-match differential: transient `puzzles/auxiliary/bridges-trace.c` records
  preset/seed → desc fixtures across all difficulties + an `allowloops=0` case;
  a committed gated test asserts `newDesc` reproduces them exactly and the TS
  solver grades each C board at the recorded difficulty.
- Register the game for owner smoke-testing (stage 1). On owner acceptance, flip
  `TS_PORTED`, delete `puzzles/bridges.c` (and the trace harness), and archive
  this change (stage 2). `puzzles/dsf.c` and `puzzles/findloop.c` stay — both
  have other C consumers.

## Impact

- Affected specs: **new `bridges` capability**.
- Affected code: `src/native/games/bridges/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,bridges-trace.c}`
  (transient trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at stage 2),
  `puzzles/bridges.c` (deleted at stage 2).
- No keypad (upstream `game_request_keys` is NULL). No pencil-mark candidate UX
  (bridges has marks/no-lines, not a candidate grid). No supersede, no printing
  port, no editor letters (documented skips). No app-shell changes. The explained
  hint is a separate future change.
