/**
 * Grid-square enumeration for Cube's two topologies, a faithful port of
 * `enum_grid_squares` in cube.c. The cube (face order 4) rolls on a
 * square grid; the tetra/octa/icosa (order 3) roll on a triangular grid
 * whose d1/d2 shape it into a hexagon (d1==d2), a triangle (d2==0), or a
 * general hexagon. Square order matters: the game description indexes
 * blue squares by enumeration order, so this must match C exactly.
 */

import { SOLIDS } from "./solids.ts";

/** Roll directions, matching the `enum` order in cube.c. */
export enum Direction {
  Left = 0,
  Right = 1,
  Up = 2,
  Down = 3,
  UpLeft = 4,
  UpRight = 5,
  DownLeft = 6,
  DownRight = 7,
}

export interface GridSquare {
  x: number;
  y: number;
  npoints: number;
  /** npoints * 2 polygon corner coordinates. */
  points: number[];
  /** 8 entries (indexed by Direction): bitmask of the corner points that
   * the polyhedron rolls over for that direction; 0 = no such move. */
  directions: number[];
  /** True for a down-pointing triangle (seats a reflected solid). */
  flip: boolean;
  /** Equivalence class for the tetrahedron's four faces. */
  tetraClass: number;
}

/** Total squares in the arena. Mirrors `grid_area`. */
export function gridArea(d1: number, d2: number, order: number): number {
  if (order === 4) return d1 * d2;
  return d1 * d1 + d2 * d2 + 4 * d1 * d2;
}

/**
 * Enumerate the arena's grid squares in canonical order. `solidIndex`
 * selects the topology via the solid's face order.
 */
export function enumGridSquares(
  solidIndex: number,
  d1: number,
  d2: number,
): GridSquare[] {
  const solid = SOLIDS[solidIndex];
  const out: GridSquare[] = [];

  if (solid.order === 4) {
    for (let y = 0; y < d2; y++) {
      for (let x = 0; x < d1; x++) {
        const directions = new Array(8).fill(0);
        directions[Direction.Left] = 0x03; // points 0,1
        directions[Direction.Right] = 0x0c; // points 2,3
        directions[Direction.Up] = 0x09; // points 0,3
        directions[Direction.Down] = 0x06; // points 1,2
        // No diagonals in a square.
        out.push({
          x,
          y,
          npoints: 4,
          points: [
            x - 0.5,
            y - 0.5,
            x - 0.5,
            y + 0.5,
            x + 0.5,
            y + 0.5,
            x + 0.5,
            y - 0.5,
          ],
          directions,
          flip: false,
          tetraClass: 0,
        });
      }
    }
    return out;
  }

  const theight = Math.sqrt(3) / 2.0;
  let firstix = -1;

  for (let row = 0; row < d1 + d2; row++) {
    let other: number;
    let rowlen: number;
    if (row < d2) {
      other = +1;
      rowlen = row + d1;
    } else {
      other = -1;
      rowlen = 2 * d2 + d1 - row;
    }

    // Down-pointing triangles.
    for (let i = 0; i < rowlen; i++) {
      let ix = 2 * i - (rowlen - 1);
      const x = ix * 0.5;
      const y = theight * row;

      const directions = new Array(8).fill(0);
      directions[Direction.Left] = 0x03; // 0,1
      directions[Direction.Right] = 0x06; // 1,2
      directions[Direction.Up] = 0x05; // 0,2
      directions[Direction.Down] = 0; // invalid
      // Both up-diagonals go up; the down-diagonals go left and right.
      directions[Direction.UpLeft] = directions[Direction.UpRight] =
        directions[Direction.Up];
      directions[Direction.DownLeft] = directions[Direction.Left];
      directions[Direction.DownRight] = directions[Direction.Right];

      if (firstix < 0) firstix = ix & 3;
      ix -= firstix;

      out.push({
        x,
        y: y + theight / 3,
        npoints: 3,
        points: [x - 0.5, y, x, y + theight, x + 0.5, y],
        directions,
        flip: true,
        tetraClass: ((row + (ix & 1)) & 2) ^ (ix & 3),
      });
    }

    // Up-pointing triangles.
    for (let i = 0; i < rowlen + other; i++) {
      let ix = 2 * i - (rowlen + other - 1);
      const x = ix * 0.5;
      const y = theight * row;

      const directions = new Array(8).fill(0);
      directions[Direction.Left] = 0x06; // 1,2
      directions[Direction.Right] = 0x03; // 0,1
      directions[Direction.Down] = 0x05; // 0,2
      directions[Direction.Up] = 0; // invalid
      // Both down-diagonals go down; the up-diagonals go left and right.
      directions[Direction.DownLeft] = directions[Direction.DownRight] =
        directions[Direction.Down];
      directions[Direction.UpLeft] = directions[Direction.Left];
      directions[Direction.UpRight] = directions[Direction.Right];

      if (firstix < 0) firstix = (ix - 1) & 3;
      ix -= firstix;

      out.push({
        x,
        y: y + (2 * theight) / 3,
        npoints: 3,
        points: [x + 0.5, y + theight, x, y, x - 0.5, y + theight],
        directions,
        flip: false,
        tetraClass: ((row + (ix & 1)) & 2) ^ (ix & 3),
      });
    }
  }

  return out;
}

/** Bounding box of the arena in grid units. Mirrors `find_bbox`. */
export interface Bbox {
  l: number;
  r: number;
  u: number;
  d: number;
}

export function findBbox(squares: GridSquare[]): Bbox {
  const bb: Bbox = {
    l: Number.POSITIVE_INFINITY,
    r: Number.NEGATIVE_INFINITY,
    u: Number.POSITIVE_INFINITY,
    d: Number.NEGATIVE_INFINITY,
  };
  for (const sq of squares) {
    for (let i = 0; i < sq.npoints; i++) {
      const px = sq.points[i * 2];
      const py = sq.points[i * 2 + 1];
      if (bb.l > px) bb.l = px;
      if (bb.r < px) bb.r = px;
      if (bb.u > py) bb.u = py;
      if (bb.d < py) bb.d = py;
    }
  }
  return bb;
}
