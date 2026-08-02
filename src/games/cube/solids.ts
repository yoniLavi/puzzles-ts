/**
 * The four regular solids Cube can roll, and the 3-D transforms that
 * roll them. Faithful port of the geometry in `puzzles/cube.c`: vertices
 * (3 floats each), faces (`order` vertex indices each), per-face outward
 * normals, an isometric `shear` for nice 2-D projection, and the `border`
 * margin each needs around the arena.
 *
 * A `Solid` is immutable reference data; the transforms return a fresh
 * oriented copy (GC instead of C's dup/free). The grid topology is tied
 * to the solid: a face order of 4 (only the cube) means a square grid;
 * order 3 (tetra/octa/icosa) means a triangular grid.
 */

export interface Solid {
  nvertices: number;
  /** nvertices * 3 coordinates. */
  vertices: number[];
  /** Vertices per face (cube: 4; the others: 3). */
  order: number;
  nfaces: number;
  /** nfaces * order vertex indices. */
  faces: number[];
  /** nfaces * 3 normal vector components. */
  normals: number[];
  shear: number;
  border: number;
}

/** Solid identity, matching the `enum` order in cube.c (and the encoded
 * param letters "tcoi"). */
export enum SolidType {
  Tetrahedron = 0,
  Cube = 1,
  Octahedron = 2,
  Icosahedron = 3,
}

const TETRAHEDRON: Solid = {
  nvertices: 4,
  vertices: [
    0.0, -0.57735026919, -0.20412414523, -0.5, 0.28867513459, -0.20412414523, 0.0, -0.0,
    0.6123724357, 0.5, 0.28867513459, -0.20412414523,
  ],
  order: 3,
  nfaces: 4,
  faces: [0, 2, 1, 3, 1, 2, 2, 0, 3, 1, 3, 0],
  normals: [
    -0.816496580928, -0.471404520791, 0.333333333334, 0.0, 0.942809041583,
    0.333333333333, 0.816496580928, -0.471404520791, 0.333333333334, 0.0, 0.0, -1.0,
  ],
  shear: 0.0,
  border: 0.3,
};

const CUBE: Solid = {
  nvertices: 8,
  vertices: [
    -0.5, -0.5, -0.5, -0.5, -0.5, +0.5, -0.5, +0.5, -0.5, -0.5, +0.5, +0.5, +0.5, -0.5,
    -0.5, +0.5, -0.5, +0.5, +0.5, +0.5, -0.5, +0.5, +0.5, +0.5,
  ],
  order: 4,
  nfaces: 6,
  faces: [0, 1, 3, 2, 1, 5, 7, 3, 5, 4, 6, 7, 4, 0, 2, 6, 0, 4, 5, 1, 3, 7, 6, 2],
  normals: [
    -1.0, 0.0, 0.0, 0.0, 0.0, +1.0, +1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, -1.0, 0.0, 0.0,
    +1.0, 0.0,
  ],
  shear: 0.3,
  border: 0.5,
};

const OCTAHEDRON: Solid = {
  nvertices: 6,
  vertices: [
    -0.5, -0.28867513459472505, 0.4082482904638664, 0.5, 0.28867513459472505,
    -0.4082482904638664, -0.5, 0.28867513459472505, -0.4082482904638664, 0.5,
    -0.28867513459472505, 0.4082482904638664, 0.0, -0.57735026918945009,
    -0.4082482904638664, 0.0, 0.57735026918945009, 0.4082482904638664,
  ],
  order: 3,
  nfaces: 8,
  faces: [4, 0, 2, 0, 5, 2, 0, 4, 3, 5, 0, 3, 1, 4, 2, 5, 1, 2, 4, 1, 3, 1, 5, 3],
  normals: [
    -0.816496580928, -0.471404520791, -0.333333333334, -0.816496580928, 0.471404520791,
    0.333333333334, 0.0, -0.942809041583, 0.333333333333, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0,
    0.0, 0.942809041583, -0.333333333333, 0.816496580928, -0.471404520791,
    -0.333333333334, 0.816496580928, 0.471404520791, 0.333333333334,
  ],
  shear: 0.0,
  border: 0.5,
};

const ICOSAHEDRON: Solid = {
  nvertices: 12,
  vertices: [
    0.0, 0.57735026919, 0.75576131408, 0.0, -0.93417235896, 0.17841104489, 0.0,
    0.93417235896, -0.17841104489, 0.0, -0.57735026919, -0.75576131408, -0.5,
    -0.28867513459, 0.75576131408, -0.5, 0.28867513459, -0.75576131408, 0.5,
    -0.28867513459, 0.75576131408, 0.5, 0.28867513459, -0.75576131408, -0.80901699437,
    0.46708617948, 0.17841104489, 0.80901699437, 0.46708617948, 0.17841104489,
    -0.80901699437, -0.46708617948, -0.17841104489, 0.80901699437, -0.46708617948,
    -0.17841104489,
  ],
  order: 3,
  nfaces: 20,
  faces: [
    8, 0, 2, 0, 9, 2, 1, 10, 3, 11, 1, 3, 0, 4, 6, 4, 1, 6, 5, 2, 7, 3, 5, 7, 4, 8, 10,
    8, 5, 10, 9, 6, 11, 7, 9, 11, 0, 8, 4, 9, 0, 6, 10, 1, 4, 1, 11, 6, 8, 2, 5, 2, 9,
    7, 3, 10, 5, 11, 3, 7,
  ],
  normals: [
    -0.356822089773, 0.87267799625, 0.333333333333, 0.356822089773, 0.87267799625,
    0.333333333333, -0.356822089773, -0.87267799625, -0.333333333333, 0.356822089773,
    -0.87267799625, -0.333333333333, -0.0, 0.0, 1.0, 0.0, -0.666666666667,
    0.745355992501, 0.0, 0.666666666667, -0.745355992501, 0.0, 0.0, -1.0,
    -0.934172358963, -0.12732200375, 0.333333333333, -0.934172358963, 0.12732200375,
    -0.333333333333, 0.934172358963, -0.12732200375, 0.333333333333, 0.934172358963,
    0.12732200375, -0.333333333333, -0.57735026919, 0.333333333334, 0.745355992501,
    0.57735026919, 0.333333333334, 0.745355992501, -0.57735026919, -0.745355992501,
    0.333333333334, 0.57735026919, -0.745355992501, 0.333333333334, -0.57735026919,
    0.745355992501, -0.333333333334, 0.57735026919, 0.745355992501, -0.333333333334,
    -0.57735026919, -0.333333333334, -0.745355992501, 0.57735026919, -0.333333333334,
    -0.745355992501,
  ],
  shear: 0.0,
  border: 0.8,
};

/** Indexed by `SolidType`. */
export const SOLIDS: readonly Solid[] = [TETRAHEDRON, CUBE, OCTAHEDRON, ICOSAHEDRON];

const APPROXEQ_TOL = 0.1;

export function approxEq(x: number, y: number): boolean {
  return (x - y) * (x - y) < APPROXEQ_TOL;
}

/**
 * `out = M * v`, where the 9-element `m` is column-major exactly as in
 * cube.c's MATMUL: row 0 is (m[0], m[3], m[6]), row 1 (m[1], m[4],
 * m[7]), row 2 (m[2], m[5], m[8]). `out` and `v` may alias.
 */
function matmul(out: number[], base: number, m: number[], v: number[], vBase: number) {
  const xx = v[vBase];
  const yy = v[vBase + 1];
  const zz = v[vBase + 2];
  out[base] = m[0] * xx + m[3] * yy + m[6] * zz;
  out[base + 1] = m[1] * xx + m[4] * yy + m[7] * zz;
  out[base + 2] = m[2] * xx + m[5] * yy + m[8] * zz;
}

/** Shallow-clone a solid's mutable geometry (vertices + normals) so the
 * transform routines can work in place without touching the reference
 * constants. faces/order/shear/border are shared (never mutated). */
function cloneGeometry(solid: Solid): Solid {
  return {
    nvertices: solid.nvertices,
    vertices: solid.vertices.slice(),
    order: solid.order,
    nfaces: solid.nfaces,
    faces: solid.faces,
    normals: solid.normals.slice(),
    shear: solid.shear,
    border: solid.border,
  };
}

/** Negate the x and y of every vertex and normal (a reflection used to
 * seat the solid on a flipped — down-pointing — triangular square). */
export function flipPoly(solid: Solid, flip: boolean): void {
  if (!flip) return;
  for (let i = 0; i < solid.nvertices; i++) {
    solid.vertices[i * 3 + 0] *= -1;
    solid.vertices[i * 3 + 1] *= -1;
  }
  for (let i = 0; i < solid.nfaces; i++) {
    solid.normals[i * 3 + 0] *= -1;
    solid.normals[i * 3 + 1] *= -1;
  }
}

/**
 * Roll a fresh copy of `solid` through `angle` about the edge between
 * vertices `key0` and `key1`: rotate that edge to horizontal (Z-axis
 * rotation), tilt about the X-axis by `angle`, then rotate back.
 * Mirrors `transform_poly` in cube.c.
 */
export function transformPoly(
  solid: Solid,
  flip: boolean,
  key0: number,
  key1: number,
  angle: number,
): Solid {
  const ret = cloneGeometry(solid);
  flipPoly(ret, flip);

  const vx = ret.vertices[key1 * 3 + 0] - ret.vertices[key0 * 3 + 0];
  const vy = ret.vertices[key1 * 3 + 1] - ret.vertices[key0 * 3 + 1];

  // Column-major, matching cube.c's index assignments.
  const vmatrix = [vx, -vy, 0, vy, vx, 0, 0, 0, 1];

  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  const amatrix = [1, 0, 0, 0, ax, -ay, 0, ay, ax];

  // vmatrix2 is vmatrix with the rotation 2x2 transposed (the inverse
  // of the horizontal-alignment rotation).
  const vmatrix2 = vmatrix.slice();
  vmatrix2[1] = vy;
  vmatrix2[3] = -vy;

  for (let i = 0; i < ret.nvertices; i++) {
    matmul(ret.vertices, 3 * i, vmatrix, ret.vertices, 3 * i);
    matmul(ret.vertices, 3 * i, amatrix, ret.vertices, 3 * i);
    matmul(ret.vertices, 3 * i, vmatrix2, ret.vertices, 3 * i);
  }
  for (let i = 0; i < ret.nfaces; i++) {
    matmul(ret.normals, 3 * i, vmatrix, ret.normals, 3 * i);
    matmul(ret.normals, 3 * i, amatrix, ret.normals, 3 * i);
    matmul(ret.normals, 3 * i, vmatrix2, ret.normals, 3 * i);
  }

  return ret;
}

/**
 * Seat the solid on a grid square: for each of the square's corner
 * points, find the single solid vertex sitting at that (x, y) (relative
 * to the square centre) with z at the solid's lowest level. Returns the
 * matched vertex indices (one per square corner), or `null` if any
 * corner fails to match exactly one vertex. Mirrors `align_poly`.
 */
export function alignPolyKeys(
  solid: Solid,
  sq: { x: number; y: number; npoints: number; points: number[]; flip: boolean },
): number[] | null {
  const flip = sq.flip ? -1 : +1;

  let zmin = 0.0;
  for (let i = 0; i < solid.nvertices; i++) {
    if (zmin > solid.vertices[i * 3 + 2]) zmin = solid.vertices[i * 3 + 2];
  }

  const pkey: number[] = new Array(sq.npoints);
  for (let j = 0; j < sq.npoints; j++) {
    let matches = 0;
    let index = -1;
    for (let i = 0; i < solid.nvertices; i++) {
      let dist = 0;
      dist += sqr(solid.vertices[i * 3 + 0] * flip - sq.points[j * 2 + 0] + sq.x);
      dist += sqr(solid.vertices[i * 3 + 1] * flip - sq.points[j * 2 + 1] + sq.y);
      dist += sqr(solid.vertices[i * 3 + 2] - zmin);
      if (dist < 0.1) {
        matches++;
        index = i;
      }
    }
    if (matches !== 1 || index < 0) return null;
    pkey[j] = index;
  }

  return pkey;
}

/** The face resting on the grid: the one whose vertices have the lowest
 * total z. Mirrors `lowest_face`. */
export function lowestFace(solid: Solid): number {
  let best = 0;
  let zmin = 0.0;
  for (let i = 0; i < solid.nfaces; i++) {
    let z = 0;
    for (let j = 0; j < solid.order; j++) {
      const f = solid.faces[i * solid.order + j];
      z += solid.vertices[f * 3 + 2];
    }
    if (i === 0 || zmin > z) {
      zmin = z;
      best = i;
    }
  }
  return best;
}

function sqr(x: number): number {
  return x * x;
}
