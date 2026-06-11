# Design: Port Cube to TypeScript

## Game overview

Cube rolls a regular polyhedron around a tiled arena. Some grid squares are
painted blue; the solid carries colour on the faces touching the grid. Rolling
the solid one square in a direction tips it onto a new face, swapping paint
between the square and the face that lands on it. The goal is to collect every
blue square's paint onto the solid's faces (square grid: paint all six cube
faces blue; other solids/grids similarly). Win is reported via the statusbar.

It is a *dexterity/route* puzzle: there is no solver, no hint, no
mistake-check, no text format (`thegame`: `solve = NULL`, `text_format =
NULL`, `wants_statusbar = true`, untimed).

## Key characteristics from C analysis

- **Solids** (`struct solid`): four constants — `s_tetrahedron`, `s_cube`,
  `s_octahedron`, `s_icosahedron` — each with `vertices[]` (3 floats per
  vertex), `faces[]` (`order` vertex indices per face), `normals[]`, an
  isometric `shear`, and a `border`. Enumerated `TETRAHEDRON, CUBE,
  OCTAHEDRON, ICOSAHEDRON`.
- **Params** (`game_params`): `solid` (0–3), `d1`, `d2`. For the square grid
  d1/d2 are width/height; otherwise the grid is a hexagon/triangle whose sides
  derive from d1/d2 (d1==d2 ⇒ regular hexagon, d2==0 ⇒ triangle). Encoded
  `<t|c|o|i><d1>x<d2>` (e.g. `c4x4`). Decode is lenient (leading solid letter
  optional; `x<d2>` optional, defaulting d2=d1).
- **Presets**: Cube `c4x4` (square), Tetrahedron `t1x2`, Octahedron `o2x2`,
  Icosahedron `i3x3` (the last three are triangular grids).
- **State** (`game_state`): the chosen `solid`, `facecolours[]` (paint per
  polyhedron face), a `bluemask` bitset over grid squares, `current` square
  index, the four key-point index pairs (`sgkey`/`dgkey` into the grid square,
  `spkey`/`dpkey` into the polyhedron) that encode orientation, `previous`
  square + `angle` for animation, `completed` (move count at win), `movecount`.
- **Grid enumeration** (`enum_grid_squares` + `egc_callback`): a single
  routine walks the arena and emits each `grid_square` (centre x/y, polygon
  points, edge `directions` bitmasks, `flip`, `tetra_class`) for the square,
  triangular, and hexagonal topologies. Used for area counting, classification,
  blue-square placement, bbox/sizing, and rendering.
- **Transforms**: `transform_poly` (rotate a solid's vertices/normals by a 3×3
  matrix via `MATMUL`), `align_poly` (seat the solid on a grid square matching
  two key points), `flip_poly`, `lowest_face` (which face currently rests on
  the grid). These implement the roll.
- **Move generation** (`new_game_desc`): place the solid at a random start
  square and paint a random set of blue squares (count from `grid_area`); no
  uniqueness solving. `find_move_dest` computes the destination square + key
  points for a rolling direction.
- **Input** (`interpret_move`): arrow keys and clicks map to one of
  LEFT/RIGHT/UP/DOWN (+ four diagonals for non-square grids) → a roll move.
- **Animation**: `game_anim_length` returns `ROLLTIME` (0.13 s); `redraw`
  interpolates the solid's orientation through `angle` from `previous` to
  `current`. There is **no win flash** — `game_flash_length` returns 0;
  completion is shown only in the status bar (`COMPLETED! Moves: N`).
- **Rendering** (`game_redraw`): **fully repaints every frame** (a background
  rect, then the grid squares blue/background, then the solid as filled
  polygons projected to 2-D with the isometric shear and back-face culling).
  There is **no per-tile cache** — the scene is a handful of polygons, so the
  `drawstate` holds only the grid scale + pixel origin. Colours: background,
  border, blue.

## TS architecture

Follow the Galaxies/Sixteen model — a small file set under
`src/native/games/cube/`:

```
src/native/games/cube/
├── index.ts          # Game glue + move logic + types + registerGame()
├── solids.ts         # The four solid constants + Solid type + transforms
│                     #   (transformPoly / alignPoly / flipPoly / lowestFace)
├── grid.ts           # Grid-square enumeration for the 3 topologies
├── state.ts          # CubeParams/State/Move types, encode/decode, completion
├── generator.ts      # newDesc: start placement + blue-square painting
├── render.ts         # Imperative redraw, DrawState, palette, projection, roll
├── cube.test.ts      # Behavioural tests
└── cube-differential.test.ts  # Gated diff vs frozen C reference
```

No `solver.ts` (no solver). No `dsf.ts` / leaf libs.

## Idiomatic TS choices

- **Solids as frozen typed structures**, vertices/faces/normals as
  `Float32Array`/`Int32Array`, shared and never mutated; transforms return a
  new oriented solid rather than mutating in place (no C `dup`/`free`).
- **`bluemask` as a `Uint32Array` bitset** (or a `boolean[]` if the square
  count is always small — decide in implementation; the C uses a 32-bit-word
  bitset). Cloned cheaply per `executeMove`.
- **Discriminated `CubeMove`**: `{ type: "roll", direction: Direction }` with a
  `Direction` enum, instead of C's integer direction codes and string moves.
- **`Direction` enum** (`Left/Right/Up/Down` + diagonals) instead of bare ints.
- **Grid enumeration as a generator** (`function* enumGridSquares(params):
  Iterable<GridSquare>`) rather than a callback + void-context, so counting,
  classification, placement, and rendering all just iterate.
- **Immutable `executeMove`** returning a new state; orientation key-points
  recomputed, never aliased.
- **Projection/shear math kept in `render.ts`** as pure functions over the
  oriented solid — the engine emits no pixels of its own (Flip doctrine).

## No render cache

Unlike Galaxies/Sixteen, cube has no per-tile cache to key: its scene is a
few dozen polygons and `game_redraw` repaints all of them every frame. The
standing "packed-bits-in-`Int32Array`" cache-key guidance therefore does not
apply here — there is nothing to cache. (The engine's no-pixels-of-its-own
doctrine still holds: cube fills its own background rect on every frame.)

## New shared helpers needed

None. `mkhighlight` (`engine/colour-mkhighlight.ts`) covers any
highlight/lowlight palette need; pointer constants live in `engine/pointer.ts`.
The 3-D transform helpers stay **local to cube** (design parallel to Galaxies'
local `dsf` until a second consumer appears) — extract only if a future solid
game (none queued) needs them.

## Differential check

Mirror Flip/Galaxies/Sixteen: a transient `puzzles/auxiliary/cube-trace.c`
generates a frozen reference snapshot into `__fixtures__/`, then is removed in
the same change. The **gated** `cube-differential.test.ts` asserts the TS
generator reproduces the C-recorded start square + blue-square set for the same
seed (proving `random.ts` end-to-end), and that rolling a recorded move
sequence lands the same orientation/paint state. An **advisory** live
`scripts/diff-cube.test.ts` is added per precedent. (If start/paint placement
diverges as expected for a non-deterministic path, fall back to asserting an
invariant — every generated board is winnable by *some* sequence — but the
expectation is exact reproduction since there's no rejection-sampling solver.)

## Risks / open questions

- **3-D transform fidelity is the whole ballgame.** `align_poly` /
  `transform_poly` / `lowest_face` encode the roll; an off-by-one in a face
  index or a transposed matrix silently corrupts which face paints which
  square. This is the first port where the hard part is geometry, not a
  solver — budget the differential check around orientation state, and lean on
  a dev-server roll-around-the-grid spot-check before claiming parity.
- **Three grid topologies in one enumerator.** Square is easy; the
  triangular/hexagonal layouts (Tetrahedron/Octahedron/Icosahedron presets)
  share `enum_grid_squares` with non-obvious geometry. Port the enumerator
  faithfully and test square + at least one triangular preset for correct
  square count and blue placement.
- **Floating-point projection.** The isometric shear and vertex projection use
  floats; rendering parity is a visual judgement (dev-server), with a tier-2
  recording-`GameDrawing` test pinning the *structure* of the draw calls
  (grid squares + solid polygons + flash), not exact pixel coordinates.
- **Diagonal moves on non-square grids.** Square grids use 4 directions;
  triangular/hex use up to 8. `interpret_move`'s direction mapping must be
  ported per-topology, not assumed 4-way.
