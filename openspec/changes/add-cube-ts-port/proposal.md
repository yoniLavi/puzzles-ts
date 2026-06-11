# Proposal: Port Cube to TypeScript

**Status**: Proposed

## Context

Four games are now TS-ported and at owner-confirmed parity with their C
deleted (Flip, Galaxies, Pegs, Sixteen). The porting pattern — `Game`
interface impl in `src/native/games/<id>/`, runtime registry, parity-gated
registration, per-game C deletion on owner acceptance — is well-trodden.
Migration-order item 7 ("outward, simplest-first") is the active phase, and
the owner has chosen **Cube** as port #5.

## Why Cube

- **One of the original pattern-establishing simplest games** (Cube/Flip/Pegs
  in the `ts-migration` summary) — a natural next step now that the harder
  Galaxies/Sixteen ports are done.
- **No solver, no hints, no mistake-check, no text format.** Cube is a
  *route/dexterity* puzzle, not a deductive one (`thegame` has `solve = NULL`,
  `text_format = NULL`). That removes the single most error-prone subsystem a
  port usually carries.
- **No leaf libraries** — no dsf, tree234, findloop, combi.
- **Exercises a genuinely new axis: 3-D geometry.** Four polyhedra
  (tetrahedron, cube, octahedron, icosahedron) roll across the grid, carrying
  painted faces; the orientation is tracked as vertex/face key-points and a
  roll angle, animated over `ROLLTIME` (0.13 s). This is the first port whose
  difficulty is rendering/transform math rather than a solver — a useful
  stress on the imperative `redraw` contract.
- **Three grid topologies** (square, triangular, hexagonal) enumerated by the
  `enum_grid_squares` callback — the second new axis.

## Scope

Port `puzzles/cube.c` (~1787 lines) to `src/native/games/cube/` following the
established pattern (Galaxies/Sixteen model): `Game` impl, the four solids and
their transforms, the grid-square enumerator for the three topologies, rolling
animation, win flash, keyboard + click-to-roll input, per-square rendering.
Register in the TS game registry. Add `TS_PORTED` to the CMake catalog. Delete
`puzzles/cube.c` **on owner-accepted parity** (rendering + animation + input,
not a green suite alone — per the parity-gated-registration doctrine).

## Out of scope

- No solver, hint, or `findMistakes` hooks — Cube has no deductive solution to
  explain, and upstream ships none.
- No quick-save-specific work — the existing combined Check-&-Save control
  already degrades to plain Quick-save for games without `canFindMistakes`.
- No new shared engine helpers beyond what already exists (`mkhighlight`,
  pointer constants). If the 3-D transform math turns out to be reusable by a
  future game it can be extracted later; Cube is its only consumer today.
- No print support (deleted at fork; a cross-game concern).
