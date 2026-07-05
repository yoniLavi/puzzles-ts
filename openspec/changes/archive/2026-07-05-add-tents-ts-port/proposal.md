# Port Tents (tents.c) to native TypeScript

## Why

Tents is the owner-chosen next game (#27) in the top-down migration: a
mid-size pure-logic puzzle (~2770 lines of C) with a clean deductive solver
and a unique solution — a strong fit for the fork's `findMistakes` /
Check-&-Save contract and a future explained-hint candidate (a separate
change). Its only shared-library dependencies already exist in the engine:
the bipartite matching (`matching.c`, already ported to `engine/latin.ts` for
the Latin family) and `dsf` (`engine/dsf.ts`). No `midend_supersede_game_desc`,
no editor-only move letters, no undo-via-state-string equality, and no `qsort`
near the desc — so a **byte-match differential** is feasible (the generator's
only RNG draws are `random_upto` for tent placement plus the matching library's
own draws, both reproducible).

## What Changes

- Add `src/native/games/tents/` implementing
  `Game<TentsParams, TentsState, TentsMove, TentsUi, TentsDrawState, TentsMistake>`:
  place tents next to trees so each row/column tent count matches its edge
  clue, no two tents are even diagonally adjacent, and the trees and tents
  admit a one-to-one adjacency matching. Params `w`, `h`, `diff`
  (Easy/Tricky); all 6 upstream presets.
- Port the **solver** (`tents_solve`): tent↔tree link deduction, non-tent
  marking (no adjacent unmatched tree; diagonally adjacent to a tent), the
  tree single-candidate deduction (plus the Tricky diagonal-pair
  elimination), and the row/column combination-enumeration pass that finds
  squares invariant across all valid tent placements (with the Tricky
  adjacent-row influence). Returns the upstream 0/1/2 verdict.
- Port the **generator** (`new_game_desc`): place `w*h/5` tents at random
  non-adjacent squares, place trees via the bipartite `matching`, reject
  empty rows/columns, derive the edge numbers, and solver-gate on
  *exactly* the target difficulty (solve at `diff` succeeds, at `diff-1`
  fails). Byte-match-critical (§4.4): the TS matching must reproduce C's
  RNG draws.
- Port the **live error / completion analysis** faithfully: `find_errors`
  (adjacency-violation diamonds, over/under-committed edge numbers in red,
  and the tent/tree over-commitment red highlighting via two `dsf`
  connected-component passes), and the completion check (`execute_move`'s
  count/clue/adjacency tests plus the bipartite-matching existence check).
- Make the shared `engine/latin.ts` `matching()` accept an **optional**
  `rs` (guarding the `shuffle`/`random_upto` draw sites exactly as
  `matching.c`'s `if (rs)`), so the completion-check existence query
  (`rs = NULL` upstream) can reuse it. Backward-compatible — every current
  caller passes `rs`.
- Ship **`findMistakes`** (boards are uniquely solvable; Check & Save
  depends on it): re-solve from the trees + edge numbers and flag every
  placed tent that the unique solution says is not a tent, and every
  non-tent the solution says is a tent (blanks are never mistakes; a
  non-uniquely-solvable hand-typed board degrades to "no mistakes").
- Render to full parity: grass-filled non-blank tiles, drawn trees (trunk +
  leaf circles) and tents (triangle), the edge numbers on the bottom/right
  border, red error highlighting (error trunk/leaf/tent, adjacency
  diamonds with exclamation marks, red numbers), keyboard cursor, and the
  3-phase win flash — palette index-for-index with the C enum (tents has a
  dark-mode `paletteOverrides` on COL_GRASS), the fork mistake overlay
  appended past it. Web build's `NARROW_BORDERS` geometry (numbers only on
  the bottom/right, thin top-left border).
- Port the drag-based input model: left-click blank→tent / clears non-blank;
  right-click blank→non-tent / clears non-blank; right-drag paints blanks to
  non-tents along one row/column; the drag preview + `find_errors` dsx
  transform for live feedback; keyboard cursor with `T`/`N`/`B` and
  select/select2.
- Byte-match differential: transient `puzzles/auxiliary/tents-trace.c`
  records preset/seed → desc fixtures; a committed gated test asserts
  `newDesc` reproduces them exactly plus the TS solver grades each C board
  at the recorded difficulty.
- Register the game for owner smoke-testing (stage 1). On owner acceptance,
  flip `TS_PORTED`, delete `puzzles/tents.c` (and the trace harness), and
  archive this change (stage 2). `puzzles/matching.c` stays — it still has
  C consumers among unported games; `puzzles/dsf.c` likewise.

## Impact

- Affected specs: **new `tents` capability**.
- Affected code: `src/native/games/tents/` (new),
  `src/native/engine/latin.ts` (`matching()` `rs` made optional),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,tents-trace.c}`
  (transient trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` + drop
  `solver(tents)` at stage 2), `puzzles/tents.c` (deleted at stage 2).
- No pencil-mark UX (no candidate notes in Tents). No keypad (upstream
  `game_request_keys` is NULL). No supersede, no printing, no editor
  letters (documented skips). Stylus loop input is N/A (the TS engine
  delivers no `MOD_STYLUS`); documented. No app-shell changes.
