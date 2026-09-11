/** Cube parameters, state, and the game-description codec. */

import { parseDimensions } from "../../engine/params.ts";
import { enumGridSquares, type GridSquare, gridArea } from "./grid.ts";
import { alignPolyKeys, SOLIDS, SolidType } from "./solids.ts";

export interface CubeParams {
  /** A `SolidType`. */
  solid: number;
  /** Grid dimensions: width/height for the square grid, or the
   * hexagon/triangle side lengths for the triangular grid. */
  d1: number;
  d2: number;
}

/** A roll in one of the four orthogonal directions. Diagonal inputs on
 * triangular grids resolve to the equivalent orthogonal roll, so a stored
 * move is always one of these four (JSON-safe: the default codec suffices). */
export type CubeMove = { dir: "L" | "R" | "U" | "D" };

/** A key-point pair: indices into either a grid square's corners or the
 * solid's vertices. */
export type KeyPair = readonly [number, number];

export interface CubeState {
  readonly params: CubeParams;
  readonly solidIndex: number;
  /** The arena, derived from params; never changes, so clones share it. */
  readonly grid: GridSquare[];
  /** Paint per polyhedron face: 1 = blue, 0 = blank. */
  readonly faceColors: Int32Array;
  /** Paint per grid square: 1 = blue, 0 = blank. */
  readonly blue: Uint8Array;
  readonly current: number;
  /** Source/destination key points for the in-progress roll animation
   * (s*) and the resting position (d*); g = grid-square corner indices,
   * p = solid vertex indices. */
  readonly sgkey: KeyPair;
  readonly dgkey: KeyPair;
  readonly spkey: KeyPair;
  readonly dpkey: KeyPair;
  readonly previous: number;
  readonly angle: number;
  /** 0 = ongoing; else the move count at which the puzzle was solved. */
  readonly completed: number;
  readonly movecount: number;
}

// --- params ----------------------------------------------------------

export function defaultParams(): CubeParams {
  return { solid: SolidType.Cube, d1: 4, d2: 4 };
}

export function presets() {
  return {
    title: "Type",
    submenu: [
      { title: "Cube", params: { solid: SolidType.Cube, d1: 4, d2: 4 } },
      { title: "Tetrahedron", params: { solid: SolidType.Tetrahedron, d1: 1, d2: 2 } },
      { title: "Octahedron", params: { solid: SolidType.Octahedron, d1: 2, d2: 2 } },
      { title: "Icosahedron", params: { solid: SolidType.Icosahedron, d1: 3, d2: 3 } },
    ],
  };
}

const SOLID_LETTERS = "tcoi";

export function encodeParams(p: CubeParams, _full: boolean): string {
  return `${SOLID_LETTERS[p.solid]}${p.d1}x${p.d2}`;
}

/** An optional solid letter, then `WxH` (or `N` for both). */
export function decodeParams(s: string): CubeParams {
  const letter = SOLID_LETTERS.indexOf(s[0]);
  const dims = parseDimensions(s, letter >= 0 ? 1 : 0);
  return {
    solid: letter >= 0 ? letter : defaultParams().solid,
    d1: dims.w,
    d2: dims.h,
  };
}

export function validateParams(p: CubeParams, _full: boolean): string | null {
  if (p.solid < 0 || p.solid >= SOLIDS.length) return "Unrecognized solid type";
  if (p.d1 < 0 || p.d2 < 0) return "Grid dimensions may not be negative";

  const solid = SOLIDS[p.solid];
  if (solid.order === 4) {
    if (p.d1 <= 1 || p.d2 <= 1) return "Both grid dimensions must be greater than one";
  } else {
    if (p.d1 <= 0 && p.d2 <= 0)
      return "At least one grid dimension must be greater than zero";
  }

  // Enough squares in each equivalence class to host that class's faces?
  const nclasses = classCount(p.solid);
  const counts = new Array(nclasses).fill(0);
  for (const sq of enumGridSquares(p.solid, p.d1, p.d2)) {
    counts[squareClass(sq, nclasses)]++;
  }
  const facesPerClass = solid.nfaces / nclasses;
  for (let i = 0; i < nclasses; i++) {
    if (counts[i] < facesPerClass)
      return "Not enough grid space to place all blue faces";
  }

  if (gridArea(p.d1, p.d2, solid.order) < solid.nfaces + 1)
    return "Not enough space to place the solid on an empty square";

  return null;
}

/** How many equivalence classes the solid divides its grid into: the
 * tetrahedron has one per face (4, by `tetraClass`), the octahedron two
 * (by `flip`), the others one. Mirrors the `nclasses` logic in cube.c. */
export function classCount(solidIndex: number): number {
  if (solidIndex === SolidType.Tetrahedron) return 4;
  if (solidIndex === SolidType.Octahedron) return 2;
  return 1;
}

export function squareClass(sq: GridSquare, nclasses: number): number {
  if (nclasses === 4) return sq.tetraClass;
  if (nclasses === 2) return sq.flip ? 1 : 0;
  return 0;
}

// --- game description -------------------------------------------------

// A desc is the blue mask in hex, four squares per digit with the first
// square in the high bit, then a comma and the start square (cube.c's format).

const HEX = "0123456789ABCDEF";

export function validateDesc(p: CubeParams, desc: string): string | null {
  const area = gridArea(p.d1, p.d2, SOLIDS[p.solid].order);
  const hexlen = Math.floor((area + 3) / 4);
  const hex = desc.slice(0, hexlen);
  if (hex.length < hexlen || !/^[0-9A-Fa-f]*$/.test(hex))
    return "Not enough hex digits at start of string";
  if (desc[hexlen] !== ",") return "Expected ',' after hex digits";
  if (!/^[0-9]+$/.test(desc.slice(hexlen + 1)))
    return "Expected decimal integer after ','";
  return null;
}

/** `desc` has passed `validateDesc` (or came from `newDesc`). */
export function newState(p: CubeParams, desc: string): CubeState {
  const solid = SOLIDS[p.solid];
  const grid = enumGridSquares(p.solid, p.d1, p.d2);
  const nsquares = grid.length;

  const blue = new Uint8Array(nsquares);
  for (let i = 0; i < nsquares; i++)
    blue[i] = (Number.parseInt(desc[i >> 2], 16) >> (3 - (i & 3))) & 1;

  // validateDesc does not bound the start square; out of range means square 0.
  let current = Number.parseInt(desc.slice(desc.indexOf(",") + 1), 10);
  if (current >= nsquares) current = 0;

  // Seat the solid on its start square to get the resting key points.
  const pkey = alignPolyKeys(solid, grid[current]);
  if (!pkey) throw new Error("cube: failed to align solid on start square");
  const restKeys: KeyPair = [pkey[0], pkey[1]];

  return {
    params: p,
    solidIndex: p.solid,
    grid,
    faceColors: new Int32Array(solid.nfaces),
    blue,
    current,
    sgkey: [0, 1],
    dgkey: [0, 1],
    spkey: restKeys,
    dpkey: restKeys,
    previous: current,
    angle: 0,
    completed: 0,
    movecount: 0,
  };
}

/** Encode a blue mask + start square as a game description. */
export function encodeDesc(blue: Uint8Array, start: number): string {
  let out = "";
  for (let i = 0; i < blue.length; i += 4) {
    let digit = 0;
    for (let k = 0; k < 4; k++) if (blue[i + k]) digit |= 8 >> k;
    out += HEX[digit];
  }
  return `${out},${start}`;
}
