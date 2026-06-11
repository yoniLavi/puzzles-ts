# Tasks: Cube TS Port

## Phase 1: Scaffold
- [x] Create `src/native/games/cube/` directory structure
- [x] Implement `solids.ts` — the four solid constants (vertices/faces/normals/shear/border), `Solid` type, and `transformPoly`/`alignPolyKeys`/`flipPoly`/`lowestFace`
- [x] Implement `grid.ts` — `enumGridSquares(solidIndex, d1, d2)` covering the square and triangular topologies; `GridSquare` type; `gridArea`; `findBbox`
- [x] Implement `state.ts` — `CubeParams`, `CubeState`, `CubeMove`, `KeyPair`; encode/decode params (`<t|c|o|i><d1>x<d2>`, lenient decode); desc codec; `newState`; `validateParams`/`validateDesc`
- [x] Implement `generator.ts` — `newDesc`: balanced random blue-square painting + non-blue start square (exact `random_upto` sequence)
- [x] Implement `index.ts` — `Game` glue, `interpretMove` (keys + keypad diagonals + click→roll, per-topology), `executeMove` (roll: key-points + face permutation + paint swap, immutable), `findMoveDest`, presets, `registerGame()`
- [x] Register in `src/native/games/index.ts`
- [x] Add `cube` to `TS_PORTED_PUZZLE_IDS` (badge list; matches the registry)
- [ ] Add `TS_PORTED` for cube to `puzzles/CMakeLists.txt` — **deferred to owner acceptance** (keeps cube.c building as the fallback while smoke-testing)

## Phase 2: Behavioural tests
- [x] `cube.test.ts` — params round-trip + lenient decode, presets, generation (blue count, parseability), paint-conservation invariant, full face permutation, immutability, roll reversibility, BFS-to-a-real-win (completion), Game capability flags, direction masks
- [x] `cube-midend.test.ts` — real `Midend` lifecycle: forced redraw paints, cursor-key roll increments the status bar, undo/redo restore the move count

## Phase 3: Rendering
- [x] Implement `render.ts` — `DrawState`, colour palette (background/border/blue), full-repaint of grid squares + isometric solid projection with back-face culling, roll-angle interpolation animation, `computeSize`/`setTileSize` from the arena bbox. (No win flash — upstream's `flash_length` is 0; no per-tile cache — cube fully repaints each frame.)
- [x] `cube-render.test.ts` (tier 2) — recording `GameDrawing`: background fill + one polygon per grid square (blue in `COL_BLUE`) + culled solid faces + update; mid-roll animation draws the solid

## Phase 4: Differential testing — **deferred follow-up (advisory, non-gating)**
- [ ] Optional: transient `puzzles/auxiliary/cube-trace.c` → `__fixtures__/cube-c-reference.json`; gated `cube-differential.test.ts` (TS generator reproduces C start square + blue set for the same seed). Lower value than for solver games: cube has no solver/uniqueness loop, just a short `random_upto` sequence over a known-bit-identical `random.ts`, already covered indirectly by the random + flip/galaxies differentials. Revisit if shared-game-ID parity for cube is wanted.

## Phase 5: Validation & parity
- [x] Full pre-commit gate green (`tsc -b --noEmit` → biome → vitest 700 → vite build)
- [x] Dev-server smoke test (Playwright on the square Cube preset): isometric 3-D cube + grid + blue squares render, arrow-key and click rolls animate, paint transfers square↔face, move counter advances, undo/redo reverse the roll **and** the paint swap, 0 console errors, TS badge shown
- [ ] Smoke-test a triangular preset (Tetrahedron/Octahedron/Icosahedron) in dev — diagonal rolls + flipped-triangle seating
- [ ] Owner acceptance testing (rendering + animation + input parity across all four presets — not a green suite alone)
- [ ] On owner acceptance: add `TS_PORTED` in CMake, delete `puzzles/cube.c`, capture the two per-puzzle icon PNGs if not already present
- [ ] Archive the change (tasks current, spec deltas applied) together with the implementation commit
