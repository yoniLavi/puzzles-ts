# Proposal: add-pegs-ts-port

## Why

Port #3 in the top-down TS migration. Pegs is the simplest remaining game (no solver, no Latin dependency, no 3D geometry) and validates the shared helpers extracted in `extract-shared-helpers`:

- **`mkhighlightBackground`**: Pegs uses `game_mkhighlight` for its colour palette — the second consumer of the extracted helper.
- **`pointer.ts` drag constants**: Pegs is the first drag-and-hold game (`LEFT_BUTTON` → `LEFT_DRAG` → `LEFT_RELEASE`), validating the pointer module's drag path that Flip (click-only) and Galaxies (right-drag) don't exercise.
- **`SortedMultiset`**: Pegs' RANDOM generator uses `tree234` with two ordered indexes (by-move, by-cost), same pattern as Flip's RANDOM generator. Local copy, not promoted.

## Scope

- Full `Game` implementation for Pegs (params, state, move, UI, draw state, render, generator)
- Three board types: Cross, Octagon, Random
- Drag-to-move input (LEFT_BUTTON/DRAG/RELEASE) + keyboard cursor with jump-select
- Per-tile render cache with blitter-based drag sprite
- Win flash (2 × FLASH_FRAME = 0.26s)
- Text format output
- Gated differential test against frozen C reference
- Advisory live differential script
- C deletion (`puzzles/pegs.c`) on owner-acceptance

## Out of scope

- Solver (Pegs has none upstream)
- `midend_supersede_game_desc` (Pegs doesn't use it)
- Scene-graph rendering (withdrawn direction)
- Promoting SortedMultiset to engine (second consumer is still local)
