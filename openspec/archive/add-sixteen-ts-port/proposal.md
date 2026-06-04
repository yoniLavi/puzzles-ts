# Proposal: Port Sixteen to TypeScript

**Status**: Proposed

## Context

Three games are now TS-ported (Flip, Galaxies, Pegs) with C deleted. The porting pattern is validated. The next simplest unported game is sixteen (1225 C lines) — a sliding-tile puzzle on a toroidal grid.

## Why sixteen

- **Smallest remaining game** (1225 C lines, vs fifteen at 1275)
- **No leaf libs** — no dsf, tree234, findloop, etc.
- **No blitters** — simpler rendering than Galaxies/Pegs
- **No drag input** — cursor/keyboard only (like Flip)
- **Has animation** — move animation + completion flash, exercises the timer path
- **5 presets** — exercises the preset menu (was broken by the `full` encoding bug)
- **Simple solver** — no special-case logic (unlike fifteen's 3×2 corner solver)
- **Wraparound moves** — rows/columns wrap toroidally, a clean pattern to implement idiomatically

## Scope

Port `puzzles/sixteen.c` to `src/native/games/sixteen/` following the established pattern (Galaxies model). Register in the TS game registry. Delete `puzzles/sixteen.c` on owner acceptance.

## Out of scope

- No new cross-game features (quick-save, hints, etc.)
- No new shared helpers (sixteen uses none that aren't already in engine/)
