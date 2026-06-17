/**
 * Cube: roll a regular polyhedron around a tiled arena, collecting paint
 * from the blue grid squares onto the solid's faces. Idiomatic TS port of
 * `puzzles/cube.c`.
 *
 * Cube is a route/dexterity puzzle: no solver, no hints, no
 * mistake-checking, no text format — just rolling. The hard part is the
 * 3-D geometry (in `solids.ts`) and the two grid topologies (`grid.ts`).
 * State carries only key-point indices + a roll angle + paint; the
 * transformed geometry is re-derived each frame in `render.ts`.
 */

import type { GameStatus, Point } from "../../../puzzle/types.ts";
import type { Game, UiUpdate } from "../../engine/game.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_UP,
  LEFT_BUTTON,
  MOD_MASK,
  MOD_NUM_KEYPAD,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newDesc } from "./generator.ts";
import { Direction } from "./grid.ts";
import {
  type CubeDrawState,
  colours,
  computeSize,
  newDrawState,
  PREFERRED_TILE_SIZE,
  ROLLTIME,
  redraw,
  setTileSize,
} from "./render.ts";
import { alignPolyKeys, lowestFace, SOLIDS, transformPoly } from "./solids.ts";
import {
  type CubeMove,
  type CubeParams,
  type CubeState,
  decodeParams,
  defaultParams,
  encodeParams,
  type KeyPair,
  newState,
  presets,
  validateDesc,
  validateParams,
} from "./state.ts";

/** Cube has no per-game UI state (upstream's `new_ui` returns NULL). */
export type CubeUi = Record<string, never>;

// --- shared move logic ------------------------------------------------

interface MoveDest {
  dest: number;
  skey: [number, number];
  dkey: [number, number];
}

/**
 * The destination square for rolling `direction` from `state.current`,
 * plus the key points (corner indices) shared between the source and
 * destination squares. `dest` is -1 if the move runs off the grid.
 * Mirrors `find_move_dest`.
 */
function findMoveDest(state: CubeState, direction: Direction): MoveDest {
  const sq = state.grid[state.current];
  const mask = sq.directions[direction];
  if (mask === 0) return { dest: -1, skey: [0, 0], dkey: [0, 0] };

  const points: number[] = [];
  const skey: number[] = [];
  for (let i = 0; i < sq.npoints; i++) {
    if (mask & (1 << i)) {
      points.push(sq.points[i * 2], sq.points[i * 2 + 1]);
      skey.push(i);
    }
  }

  for (let i = 0; i < state.grid.length; i++) {
    if (i === state.current) continue;
    const s2 = state.grid[i];
    const dkey: number[] = [];
    let match = 0;
    for (let j = 0; j < s2.npoints; j++) {
      let d = sqr(s2.points[j * 2] - points[0]) + sqr(s2.points[j * 2 + 1] - points[1]);
      if (d < 0.1) dkey[match++] = j;
      d = sqr(s2.points[j * 2] - points[2]) + sqr(s2.points[j * 2 + 1] - points[3]);
      if (d < 0.1) dkey[match++] = j;
    }
    if (match === 2) {
      return { dest: i, skey: [skey[0], skey[1]], dkey: [dkey[0], dkey[1]] };
    }
  }

  return { dest: -1, skey: [skey[0], skey[1]], dkey: [0, 0] };
}

const DIR_OF_CHAR: Record<CubeMove["dir"], Direction> = {
  L: Direction.Left,
  R: Direction.Right,
  U: Direction.Up,
  D: Direction.Down,
};

const CHAR_OF_DIR: Partial<Record<Direction, CubeMove["dir"]>> = {
  [Direction.Left]: "L",
  [Direction.Right]: "R",
  [Direction.Up]: "U",
  [Direction.Down]: "D",
};

export function executeMove(from: CubeState, move: CubeMove): CubeState {
  const direction = DIR_OF_CHAR[move.dir];
  const { dest, skey } = findMoveDest(from, direction);
  if (dest < 0) throw new Error("cube: illegal move");

  const solid = SOLIDS[from.solidIndex];
  const grid = from.grid;

  // The two source-square corners we roll over, as solid vertex indices.
  const allPkey = alignPolyKeys(solid, grid[from.current]);
  if (!allPkey) throw new Error("cube: source alignment failed");
  const pkey: [number, number] = [allPkey[skey[0]], allPkey[skey[1]]];

  // Roll angle: the dihedral angle between the two faces sharing that
  // edge — acos of the dot product of their normals.
  let angle = dihedralAngle(solid, pkey);

  // HACK (from cube.c): for the cube, both +angle and -angle align, so
  // disambiguate the UP roll by hand.
  if (solid.order === 4 && direction === Direction.Up) angle = -angle;

  // Roll, reflect onto the destination square, and check the result
  // seats correctly; if not, the rotation went the wrong way — flip the
  // sign and try once more (mirrors cube.c's try-both approach).
  let poly = transformPoly(solid, grid[from.current].flip, pkey[0], pkey[1], angle);
  flipInPlace(poly, grid[dest].flip);
  if (!alignPolyKeys(poly, grid[dest])) {
    angle = -angle;
    poly = transformPoly(solid, grid[from.current].flip, pkey[0], pkey[1], angle);
    flipInPlace(poly, grid[dest].flip);
    if (!alignPolyKeys(poly, grid[dest]))
      throw new Error("cube: could not seat solid after roll");
  }

  // Map the face permutation the roll induced: the rolled solid is
  // congruent to the original with faces permuted, so each original
  // face's colour follows the rolled face whose normal matches it.
  const faceColours = new Int32Array(solid.nfaces).fill(-1);
  for (let i = 0; i < solid.nfaces; i++) {
    for (let j = 0; j < poly.nfaces; j++) {
      let dist = 0;
      for (let k = 0; k < 3; k++)
        dist += sqr(poly.normals[j * 3 + k] - solid.normals[i * 3 + k]);
      if (dist < 0.1) faceColours[i] = from.faceColours[j];
    }
  }

  const blue = new Uint8Array(from.blue);
  let completed = from.completed;
  const movecount = from.movecount + 1;

  // Swap paint between the resting face and the landed-on square, unless
  // already complete (a finished solid may roll freely as a small reward).
  if (!completed) {
    const lf = lowestFace(solid);
    const tmp = faceColours[lf];
    faceColours[lf] = blue[dest];
    blue[dest] = tmp;

    let allBlue = 0;
    for (let i = 0; i < solid.nfaces; i++) if (faceColours[i]) allBlue++;
    if (allBlue === solid.nfaces) completed = movecount;
  }

  // Resting key points for the static (non-animated) display.
  const restKeys = alignPolyKeys(solid, grid[dest]);
  if (!restKeys) throw new Error("cube: rest alignment failed");

  return {
    ...from,
    current: dest,
    faceColours,
    blue,
    completed,
    movecount,
    dpkey: [restKeys[0], restKeys[1]] as KeyPair,
    dgkey: [0, 1] as KeyPair,
    spkey: pkey as KeyPair,
    sgkey: [skey[0], skey[1]] as KeyPair,
    previous: from.current,
    angle,
  };
}

/** Dihedral angle across the edge between solid vertices `pkey[0]` and
 * `pkey[1]`: acos of the dot product of the two faces sharing it. */
function dihedralAngle(
  solid: { nfaces: number; order: number; faces: number[]; normals: number[] },
  pkey: [number, number],
): number {
  const f: number[] = [];
  for (let i = 0; i < solid.nfaces; i++) {
    let match = 0;
    for (let j = 0; j < solid.order; j++) {
      const v = solid.faces[i * solid.order + j];
      if (v === pkey[0] || v === pkey[1]) match++;
    }
    if (match === 2) f.push(i);
  }
  let dp = 0;
  for (let i = 0; i < 3; i++)
    dp += solid.normals[f[0] * 3 + i] * solid.normals[f[1] * 3 + i];
  return Math.acos(clamp(dp, -1, 1));
}

function flipInPlace(
  poly: { nvertices: number; nfaces: number; vertices: number[]; normals: number[] },
  flip: boolean,
): void {
  if (!flip) return;
  for (let i = 0; i < poly.nvertices; i++) {
    poly.vertices[i * 3 + 0] *= -1;
    poly.vertices[i * 3 + 1] *= -1;
  }
  for (let i = 0; i < poly.nfaces; i++) {
    poly.normals[i * 3 + 0] *= -1;
    poly.normals[i * 3 + 1] *= -1;
  }
}

// --- input ------------------------------------------------------------

function newUi(_state: CubeState): CubeUi {
  return {};
}

function interpretMove(
  state: CubeState,
  _ui: CubeUi,
  ds: CubeDrawState | null,
  p: Point,
  rawButton: number,
): CubeMove | null | UiUpdate {
  const button = rawButton & (~MOD_MASK | MOD_NUM_KEYPAD);

  let direction: Direction;
  if (button === CURSOR_UP || button === (MOD_NUM_KEYPAD | 0x38))
    direction = Direction.Up;
  else if (button === CURSOR_DOWN || button === (MOD_NUM_KEYPAD | 0x32))
    direction = Direction.Down;
  else if (button === CURSOR_LEFT || button === (MOD_NUM_KEYPAD | 0x34))
    direction = Direction.Left;
  else if (button === CURSOR_RIGHT || button === (MOD_NUM_KEYPAD | 0x36))
    direction = Direction.Right;
  else if (button === (MOD_NUM_KEYPAD | 0x37)) direction = Direction.UpLeft;
  else if (button === (MOD_NUM_KEYPAD | 0x31)) direction = Direction.DownLeft;
  else if (button === (MOD_NUM_KEYPAD | 0x39)) direction = Direction.UpRight;
  else if (button === (MOD_NUM_KEYPAD | 0x33)) direction = Direction.DownRight;
  else if (button === LEFT_BUTTON) {
    const dir = directionFromClick(state, ds, p);
    if (dir === null) return null;
    direction = dir;
  } else return null;

  const sq = state.grid[state.current];
  const mask = sq.directions[direction];
  if (mask === 0) return null;

  // Translate a diagonal direction into the orthogonal one with the same
  // edge mask.
  if (direction > Direction.Down) {
    let found = -1;
    for (let i = Direction.Left; i <= Direction.Down; i++) {
      if (sq.directions[i] === mask) {
        found = i;
        break;
      }
    }
    if (found < 0) return null;
    direction = found;
  }

  if (findMoveDest(state, direction).dest < 0) return null;

  const ch = CHAR_OF_DIR[direction];
  return ch ? { dir: ch } : null;
}

/** Pick a roll direction from a left-click bearing relative to the
 * current square's centre. Mirrors the `LEFT_BUTTON` branch of
 * `interpret_move`. Returns null for a dead-centre click. */
function directionFromClick(
  state: CubeState,
  ds: CubeDrawState | null,
  p: Point,
): Direction | null {
  const gs = ds?.gridscale ?? PREFERRED_TILE_SIZE;
  const ox = ds?.ox ?? 0;
  const oy = ds?.oy ?? 0;
  const sq = state.grid[state.current];
  const cx = Math.trunc(sq.x * gs) + ox;
  const cy = Math.trunc(sq.y * gs) + oy;
  if (p.x === cx && p.y === cy) return null;

  const angle = Math.atan2(p.y - cy, p.x - cx);
  const PI = Math.PI;

  if (sq.npoints === 4) {
    // Square: quarters split at the 45° diagonals.
    if (Math.abs(angle) > (3 * PI) / 4) return Direction.Left;
    if (Math.abs(angle) < PI / 4) return Direction.Right;
    return angle > 0 ? Direction.Down : Direction.Up;
  }
  if (sq.directions[Direction.Up] === 0) {
    // Up-pointing triangle: three 120° arcs (no UP).
    if (angle < -PI / 2 || angle > (5 * PI) / 6) return Direction.Left;
    if (angle > PI / 6) return Direction.Down;
    return Direction.Right;
  }
  // Down-pointing triangle (no DOWN).
  if (angle > PI / 2 || angle < (-5 * PI) / 6) return Direction.Left;
  if (angle < -PI / 6) return Direction.Up;
  return Direction.Right;
}

// --- status bar -------------------------------------------------------

function statusbarText(state: CubeState): string {
  const prefix = state.completed ? "COMPLETED! " : "";
  const moves = state.completed || state.movecount;
  return `${prefix}Moves: ${moves}`;
}

function status(state: CubeState): GameStatus {
  return state.completed > 0 ? "solved" : "ongoing";
}

// --- helpers ----------------------------------------------------------

function sqr(x: number): number {
  return x * x;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// --- Game object ------------------------------------------------------

export const cubeGame: Game<CubeParams, CubeState, CubeMove, CubeUi, CubeDrawState> = {
  id: "cube",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: false,
  canFormatAsText: false,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  statusbarText,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => ROLLTIME,
  flashLength: () => 0,
};

registerGame(cubeGame);
