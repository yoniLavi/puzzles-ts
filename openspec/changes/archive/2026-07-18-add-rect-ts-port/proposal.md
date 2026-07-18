# Port Rectangles (rect.c) to native TypeScript

## Why

Rectangles is one of only four games left unported, and the **most unblocked**
of them: its C (`rect.c`, ~3000 lines) has *zero* non-random leaf dependencies
— no `grid.c`/`loopgen.c` (which block loopy/pearl), not even `dsf`/`findloop`
(which map needs). It needs only `random.ts`, which is already bit-identical.
That makes it the natural simplest-first pick.

The rule is elegantly self-contained: divide a `w × h` grid into rectangles so
that every rectangle contains exactly one numbered square and its area equals
that number. Boards are uniquely solvable (with the default `unique` param), so
the port ships `findMistakes` and Check & Save works. No
`midend_supersede_game_desc`, no editor-only move letters, no `qsort` near the
desc — a byte-match differential is feasible, since the generator is a pure
sequence of `random_upto` draws whose only gate is the same souped-up solver we
port.

## What Changes

- Add `src/native/games/rect/` implementing
  `Game<RectParams, RectState, RectMove, RectUi, RectDrawState, RectMistake>`:
  params `w`, `h`, `expandfactor` (float, default 0), `unique` (bool, default
  true); all 7 upstream presets (7×7 … 19×19).
- Port the **souped-up solver** (`rect_solver`): candidate-placement
  enumeration per rectangle, the overlaps/rectbyplace bookkeeping, and the
  deduction loop (sole-number-position, placement-intersection, rectangle- and
  square-focused elimination), plus the RNG-driven number-placement winnowing
  used during generation. Used three ways: generation uniqueness gate, `solve`,
  and `findMistakes`.
- Port the **generator** (`new_game_desc`): base-grid random rectangle tiling
  (`enum_rects` + `place_rect`), singleton removal (neighbour-extend or the
  3×3 fallback), the two-pass vertical-expand-and-transpose stretch to full
  size, the solver-gated number placement, and the run-length desc encoding.
  Byte-faithful RNG draw order (§4.4) so the desc is reproducible from the seed.
- Port the **win/highlight analysis** faithfully (`get_correct`): each cell is
  "correct" iff it belongs to a valid rectangle (all boundary edges present,
  none interior, exactly one number equal to area). Drawn as the grey
  `COL_CORRECT` fill, exactly as upstream; completion flash on solve.
- Ship **`findMistakes`** (boards are uniquely solvable; Check & Save depends
  on it): re-solve from the numbers to the unique solution's edges and flag
  every edge the player has drawn that the unique solution does not contain — a
  definite mistake. Degrades to "no mistakes" on a non-uniquely-solvable board.
- Model input idiomatically: left-drag draws a rectangle outline, right-drag
  erases interior edges; a click near an edge toggles that single edge; a
  half-grid keyboard cursor with press-to-drag. `coord_round`'s
  corner/centre/edge click allocation ported exactly. A drag/click that changes
  nothing produces no move (local no-op suppression — no state-string undo).
- Render to parity (NARROW_BORDERS: `BORDER = 1`): the grid, number text, the
  three edge colours (black line, red drag-draw, blue drag-erase), the computed
  corner pixels, the drag-preview overlay, the grey correct-rectangle fill, the
  cursor tile, and the completion flash — palette index-for-index with the C
  colour enum.
- Byte-match differential: transient `puzzles/auxiliary/rect-trace.c` records
  preset/seed → {desc, aux} fixtures; a committed gated test asserts `newDesc`
  reproduces them exactly.
- Register the game for owner smoke-testing (stage 1). On owner acceptance,
  flip `TS_PORTED`, delete `puzzles/rect.c` (and the trace harness), and
  archive this change (stage 2).

## Impact

- Affected specs: **new `rect` capability**. No `ts-engine` change (all needed
  hooks already exist).
- Affected code: `src/native/games/rect/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,rect-trace.c}` (transient
  trace harness), `puzzles/CMakeLists.txt` (`TS_PORTED` at stage 2),
  `puzzles/rect.c` (deleted at stage 2).
- No pencil-mark UX (no candidate notes in Rectangles). No keypad (upstream
  `game_request_keys` is NULL). No hint yet (the solver is a strong Palisade-bar
  candidate for a future `add-rect-hint`). No supersede, no printing, no editor
  letters (documented skips). No app-shell changes.
