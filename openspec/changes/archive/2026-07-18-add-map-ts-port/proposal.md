# Port Map (map.c) to native TypeScript

## Why

Map is one of the last unported games and is **self-contained + unblocked**: its
C (`map.c`, ~3478 lines) needs only `random.ts` (already bit-identical) and a
plain union-find (`dsf`, already a shared engine helper), used in exactly one
place (region numbering during desc decode). No `grid.c`/`loopgen.c` (which
still block loopy/pearl).

The rule is the classic four-colour puzzle: colour every region of a map so no
two adjacent regions share a colour, given some regions pre-coloured as clues.
Boards are uniquely solvable (the generator gates on `map_solver` returning a
single solution), so the port ships `findMistakes` and Check & Save works. No
`midend_supersede_game_desc`, no editor-only move letters, no `qsort` near the
desc — a byte-match differential is feasible: the generator is a pure sequence
of `random_upto`/`shuffle` draws whose only data-dependent gate is the same
solver we port.

## What Changes

- Add `src/native/games/map/` implementing
  `Game<MapParams, MapState, MapMove, MapUi, MapDrawState, MapMistake>`: params
  `w`, `h`, `n` (regions), `diff` (Easy/Normal/Hard/Unreasonable); all 6
  upstream landscape presets (20×15/30 Easy…Unreasonable, 30×25/75
  Normal/Hard). `encodeParams` `{w}x{h}n{n}` with a full-form `d{char}`
  difficulty suffix; lenient `decodeParams` (optional `xH`, `nN`, `dX`; tolerate
  a `.` in the region count for old IDs).
- Port the **solver** (`map_solver`) with its full graded deductive power:
  EASY single-possible-colour placement, NORMAL adjacent-pair colour exclusion,
  HARD forcing-chain BFS, and RECURSE guess-and-verify recursion — returning the
  three-valued 0/1/2 (impossible / unique / ambiguous-or-stuck). Used four ways:
  generation uniqueness gate, difficulty grading, `solve`, and `findMistakes`.
- Port the **generator** (`new_game_desc`): voronoi-style region growth
  (`genmap` over a cumulative-frequency table + `extend_options` perimeter
  weights), graph construction (`gengraph`), recursive four-colouring
  (`fourcolour`), solver-gated clue reduction (never removing the last region of
  a colour), and the difficulty-floor retry loop. Byte-faithful RNG draw order
  (§4.3) so the desc + aux reproduce from the seed.
- Port the **desc codec**: the two-part run-length encoding (edge list — runs of
  edge/non-edge across horizontal-then-vertical edges, Slant-like with the `z`
  no-switch special case; then a comma; then clue colours 0–3 interspersed with
  blank-run letters). `validateDesc` mirrors `parse_edge_list` + the clue-count
  check. `newState` rebuilds regions via a union-find over non-edges, builds the
  4-quadrant diagonal-split map, runs the desc-seeded diagonal-smoothing pass,
  and computes canonical edge/region label points (float geometry, display-only).
- Model input idiomatically: press picks up a region's colour (or its pencil
  marks on a blank region) into a floating drag blob; release drops it onto the
  region under the pointer. Right-drag from a colour to a blank toggles a single
  pencil bit; a keyboard cursor picks/drops via select. The `region_from_coords`
  quadrant hit-test (which of a diagonally-split cell's two regions a click
  lands in) is ported exactly. A drop that changes nothing produces no move
  (local no-op suppression — no state-string undo).
- Render to parity (NARROW_BORDERS: `BORDER = 0`): region fills, the diagonal
  second-region triangle, pencil-mark stipples in their 4×4 skip-the-seam
  layout, grid lines on region boundaries, red error diamonds where two adjacent
  coloured regions clash, optional region numbers, and the floating drag/cursor
  blob (a blitter drag sprite). The three completion-flash styles (cyclic / each
  to white / all to white) and `flashLength`. Palette index-for-index with the
  upstream colour enum.
- Ship the three upstream **preferences** via the `prefs` hook: victory-flash
  effect (choices), number-regions (boolean), stipple display style (choices) —
  all stored on the `Ui`, defaults from `newUi`. The `l`/`L` key still toggles
  numbers in play.
- Ship **`findMistakes`** (boards are uniquely solvable; Check & Save depends on
  it): re-solve from the immutable clues to the unique solution and flag every
  region whose player colour differs (a definite mistake). Degrades to "no
  mistakes" on a non-uniquely-solvable board.
- Byte-match differential: transient `puzzles/auxiliary/map-trace.c` records
  preset/seed → {desc, aux} fixtures; a committed gated test asserts `newDesc`
  reproduces them exactly and the TS solver grades each board at the C-recorded
  difficulty.
- Register the game for owner smoke-testing (stage 1). On owner acceptance,
  flip `TS_PORTED`, delete `puzzles/map.c` (and the trace harness), and archive
  this change (stage 2).

## Impact

- Affected specs: **new `map` capability**. No `ts-engine` change (every hook
  Map needs — `prefs`, `findMistakes`, blitter drawing, the drag `Ui` — already
  exists).
- Affected code: `src/native/games/map/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,map-trace.c}` (transient
  trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at stage 2),
  `puzzles/map.c` (deleted at stage 2). Icons already committed from the WASM
  era.
- No hint yet (the graded deductive solver is a strong Palisade-bar candidate for
  a future `add-map-hint`). No supersede, no printing, no editor letters, no
  keypad (`game_request_keys` is NULL upstream) — documented skips. No app-shell
  changes.
