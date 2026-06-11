/**
 * Cube parameters, state, and the game-description codec. Faithful port
 * of the corresponding pieces of cube.c, but idiomatic: immutable state,
 * a `Uint8Array` blue mask (one byte per square) rather than a packed
 * bitset, typed key-point pairs, and GC instead of dup/free.
 */

import { parseLeadingInt } from "../../engine/params.ts";
import { enumGridSquares, type GridSquare, gridArea } from "./grid.ts";
import { alignPolyKeys, SOLIDS, type Solid, SolidType } from "./solids.ts";

export interface CubeParams {
  /** A `SolidType`. */
  solid: number;
  /** Grid dimensions: width/height for the square grid, or the
   * hexagon/triangle side lengths for the triangular grid. */
  d1: number;
  d2: number;
}

/** A roll in one of the four orthogonal directions. Diagonal inputs on
 * triangular grids are resolved to the equivalent orthogonal roll before
 * a move is produced, so a stored/serialised move is always one of these
 * four — JSON-safe, so the default move codec suffices. */
export type CubeMove = { dir: "L" | "R" | "U" | "D" };

/** A key-point pair: indices into either a grid square's corners or the
 * solid's vertices. */
export type KeyPair = readonly [number, number];

export interface CubeState {
  readonly params: CubeParams;
  readonly solidIndex: number;
  /** The arena, derived from params; shared by reference across clones
   * (it never changes for a given params, like C's refcounted grid). */
  readonly grid: GridSquare[];
  /** Paint per polyhedron face: 1 = blue, 0 = blank. */
  readonly faceColours: Int32Array;
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

interface Preset {
  name: string;
  params: CubeParams;
}

const PRESETS: Preset[] = [
  { name: "Cube", params: { solid: SolidType.Cube, d1: 4, d2: 4 } },
  { name: "Tetrahedron", params: { solid: SolidType.Tetrahedron, d1: 1, d2: 2 } },
  { name: "Octahedron", params: { solid: SolidType.Octahedron, d1: 2, d2: 2 } },
  { name: "Icosahedron", params: { solid: SolidType.Icosahedron, d1: 3, d2: 3 } },
];

export function presets() {
  return {
    title: "Type",
    submenu: PRESETS.map((p) => ({ title: p.name, params: p.params })),
  };
}

const SOLID_LETTERS = "tcoi";

export function encodeParams(p: CubeParams, _full: boolean): string {
  return `${SOLID_LETTERS[p.solid]}${p.d1}x${p.d2}`;
}

export function decodeParams(s: string): CubeParams {
  const ret = defaultParams();
  let i = 0;
  const letter = SOLID_LETTERS.indexOf(s[0]);
  if (letter >= 0) {
    ret.solid = letter;
    i = 1;
  }
  // Leading integer (shared engine helper, atoi-like); the `next` index
  // lets us look for the optional `x<d2>` separator after d1.
  const d1 = parseLeadingInt(s, i);
  ret.d1 = ret.d2 = d1.value;
  i = d1.next;
  if (s[i] === "x") {
    ret.d2 = parseLeadingInt(s, i + 1).value;
  }
  return ret;
}

export function validateParams(p: CubeParams, _full: boolean): string | null {
  if (p.solid < 0 || p.solid >= SOLIDS.length) return "Unrecognised solid type";
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

const HEX = "0123456789ABCDEF";

export function validateDesc(p: CubeParams, desc: string): string | null {
  const area = gridArea(p.d1, p.d2, SOLIDS[p.solid].order);
  const hexlen = Math.floor((area + 3) / 4);
  for (let j = 0; j < hexlen; j++) {
    const c = desc[j];
    if (c >= "0" && c <= "9") continue;
    if (c >= "A" && c <= "F") continue;
    if (c >= "a" && c <= "f") continue;
    return "Not enough hex digits at start of string";
  }
  if (desc[hexlen] !== ",") return "Expected ',' after hex digits";
  let i = hexlen + 1;
  if (i >= desc.length) return "Expected decimal integer after ','";
  for (; i < desc.length; i++) {
    if (desc[i] < "0" || desc[i] > "9") return "Expected decimal integer after ','";
  }
  return null;
}

function hexValue(c: string): number {
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "F") return c.charCodeAt(0) - 55;
  if (c >= "a" && c <= "f") return c.charCodeAt(0) - 87;
  return -1;
}

export function newState(p: CubeParams, desc: string): CubeState {
  const solid: Solid = SOLIDS[p.solid];
  const grid = enumGridSquares(p.solid, p.d1, p.d2);
  const nsquares = grid.length;

  const faceColours = new Int32Array(solid.nfaces);
  const blue = new Uint8Array(nsquares);

  // Parse the hex blue mask (4 squares per nibble, MSB first).
  let pos = 0;
  let j = 8;
  let v = 0;
  for (let i = 0; i < nsquares; i++) {
    if (j === 8) {
      const hv = hexValue(desc[pos++] ?? "");
      if (hv < 0) break;
      v = hv;
    }
    if (v & j) blue[i] = 1;
    j >>= 1;
    if (j === 0) j = 8;
  }

  // The start square follows the comma.
  let p2 = pos;
  if (desc[p2] === ",") p2++;
  let current = Number.parseInt(desc.slice(p2), 10);
  if (!Number.isFinite(current) || current < 0 || current >= nsquares) current = 0;

  // Seat the solid on its start square to get the resting key points.
  const pkey = alignPolyKeys(solid, grid[current]);
  if (!pkey) throw new Error("cube: failed to align solid on start square");

  const dpkey: KeyPair = [pkey[0], pkey[1]];
  const spkey: KeyPair = [pkey[0], pkey[1]];
  const dgkey: KeyPair = [0, 1];
  const sgkey: KeyPair = [0, 1];

  return {
    params: p,
    solidIndex: p.solid,
    grid,
    faceColours,
    blue,
    current,
    sgkey,
    dgkey,
    spkey,
    dpkey,
    previous: current,
    angle: 0,
    completed: 0,
    movecount: 0,
  };
}

/** Encode a blue mask + start square as a game description (the hex
 * format cube.c uses). Shared by `newDesc`. */
export function encodeDesc(blue: Uint8Array, start: number): string {
  let out = "";
  let j = 0;
  let k = 8;
  for (let i = 0; i < blue.length; i++) {
    if (blue[i]) j |= k;
    k >>= 1;
    if (!k) {
      out += HEX[j];
      k = 8;
      j = 0;
    }
  }
  if (k !== 8) out += HEX[j];
  return `${out},${start}`;
}

export { gridArea };
