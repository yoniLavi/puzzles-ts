# Finish and port Separate (Block Puzzle) to native TypeScript

## Why

`separate` (Nikoli's "Block Puzzle") is upstream's **unfinished** puzzle: only
its solver/generator were ever written — the whole frontend (`new_game`,
`interpret_move`, `execute_move`, `game_redraw`, UI, colours) is `FIXME` stubs,
the game state doesn't even store the grid, and it's gated behind
`PUZZLES_ENABLE_UNFINISHED` so it ships to nobody. It is also the **last C
consumer of `divvy.c`** (`divvy_rectangle`), which is why `divvy.c` could not be
deleted when Solo shipped (Solo has its own `divvy.ts`).

This change does two things at once: **finishes** Separate into a real, playable,
user-visible game, and **unblocks the deletion of `divvy.c`**. The game is a
grid-partition puzzle — partition an `m × n` grid of letters into disjoint
`k`-ominoes, each containing exactly one of each of the `k` letters — which maps
cleanly onto the **Palisade** interaction model (draw walls to divide the grid
into regions) that this fork already ships with a full wall-drawing UI, render
pipeline, and hint system. Its two DSF-based solver deductions ("two adjacent
squares sharing a letter can't be in one region"; "an undersized chain with only
one way to extend must take it") are strong Palisade-grade explained-hint
material — deferred to a follow-up `add-separate-hint` change per convention.

## What Changes

- **Promote `divvy` to a shared engine leaf.** Move the byte-match-faithful
  `divvy_rectangle` port to `src/native/engine/divvy.ts` (Separate is its 3rd TS
  consumer, after Solo and Palisade — the playbook's "second consumer ⇒ promote"
  rule was already overdue). Repoint `solo/`, `palisade/`, and the new
  `separate/` at it; delete the two local copies.
- **Add `src/native/games/separate/`** implementing
  `Game<SeparateParams, SeparateState, SeparateMove, SeparateUi, SeparateDrawState>`:
  the letters grid + a Palisade-style three-valued wall model (wall / no-wall
  mark / unknown), edge-nearest-click input with a half-grid keyboard cursor,
  win when every wall-bounded region is a `k`-omino holding one of each letter.
- **Port the DSF solver** (`solver_attempt`: the disconnect-on-shared-letter and
  forced-single-extension deductions run to a fixpoint) to produce the unique
  partition — used by `solve()` and `findMistakes`.
- **Port the generator** (`generate`: `divvyRectangle` for a random `k`-omino
  partition, then the fill-letters-and-re-solve retry loop with generator
  lock-back) over the bit-identical `random.ts`.
- **Ship `findMistakes`** (Separate is uniquely solvable, so Check & Save depends
  on it) — re-solve to the unique partition and flag every player wall / no-wall
  mark that contradicts it.
- **Render to full parity**: letters in cells, three-valued walls, live error
  highlighting (a region that is over-size or holds a duplicate letter), cursor,
  win flash.
- **Completed-region highlight (both Separate *and* Palisade)**: shade a
  wall-bounded region with the shared neutral-grey completed-region colour
  (Rectangles' `COL_CORRECT` convention, factored into `engine/colour-mkhighlight`)
  once it is a complete, correct region (right size + correct content + no interior
  wall), the same local-correctness feedback Galaxies/Rectangles give. Added to
  Palisade too since it shares the wall model and the owner asked for both.
- **Make it user-visible**: move `puzzle(separate …)` out of
  `unfinished/CMakeLists.txt` into the main catalog with `TS_PORTED`; add the two
  per-puzzle icon PNGs. Register for owner smoke-testing (stage 1).
- **On owner acceptance (stage 2)**: delete `puzzles/unfinished/separate.c` and,
  now that its last C consumer is gone, **delete `divvy.c`** (+ `divvy-test.c`,
  the `divvy_rectangle` declaration in `puzzles.h`, the `divvy.c` entry in
  `core_obj`); archive this change.

## Impact

- Affected specs: **new `separate` capability**; **`palisade`** (adds the
  completed-region highlight). (The `divvy` promotion to `engine/` follows the
  already-documented "second consumer ⇒ promote" playbook convention and needs no
  spec change.)
- Affected code: `src/native/engine/divvy.ts` (new, promoted),
  `src/native/games/{solo,palisade}/divvy.ts` (deleted, repointed),
  `src/native/games/separate/` (new),
  `src/native/games/ts-ported-ids.ts` + `src/native/games/index.ts`
  (registration), `src/assets/icons/separate-{64,128}d8.png` (new),
  `puzzles/auxiliary/{CMakeLists.txt,separate-trace.c}` (transient C trace
  harness for the differential fixture), `puzzles/CMakeLists.txt` (catalog entry
  + `TS_PORTED`, `divvy.c` dropped from `core_obj` at stage 2),
  `puzzles/unfinished/CMakeLists.txt` (`separate` entry removed),
  `puzzles/unfinished/separate.c` + `puzzles/divvy.c` + `puzzles/auxiliary/divvy-test.c`
  (deleted at stage 2), `puzzles/puzzles.h` (`divvy_rectangle` decl removed).
- No supersede, no printing, no editor move-letters (documented skips). Explained
  hint deferred to `add-separate-hint`. No app-shell changes.
