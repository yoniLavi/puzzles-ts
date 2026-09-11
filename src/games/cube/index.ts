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

import { rejectMove } from "../../engine/assert-never.ts";
import type { Game, UiUpdate } from "../../engine/game.ts";
import { parseConfigInt } from "../../engine/params.ts";
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
import type { GameStatus, Point } from "../../engine/types.ts";
import { newDesc } from "./generator.ts";
import { Direction } from "./grid.ts";
import {
  type CubeDrawState,
  colors,
  computeSize,
  newDrawState,
  PREFERRED_TILE_SIZE,
  ROLLTIME,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  alignPolyKeys,
  flipPoly,
  lowestFace,
  SOLIDS,
  type Solid,
  sqr,
  transformPoly,
} from "./solids.ts";
import {
  type CubeMove,
  type CubeParams,
  type CubeState,
  decodeParams,
  defaultParams,
  encodeParams,
  newState,
  presets,
  validateDesc,
  validateParams,
} from "./state.ts";

/** Cube has no per-game UI state (upstream's `new_ui` returns NULL). */
export type CubeUi = Record<string, never>;

// --- shared move logic ------------------------------------------------

/**
 * The square that rolling `direction` from `state.current` lands on, and
 * `skey`, the two corners of the current square the solid rolls over; null
 * if the roll runs off the grid. Mirrors `find_move_dest`.
 */
function findMoveDest(
  state: CubeState,
  direction: Direction,
): { dest: number; skey: [number, number] } | null {
  const sq = state.grid[state.current];
  const mask = sq.directions[direction];
  if (mask === 0) return null;

  const skey: number[] = [];
  for (let i = 0; i < sq.npoints; i++) if (mask & (1 << i)) skey.push(i);
  const near = (s2: typeof sq, j: number, k: number) =>
    sqr(s2.points[j * 2] - sq.points[k * 2]) +
      sqr(s2.points[j * 2 + 1] - sq.points[k * 2 + 1]) <
    0.1;

  // The destination is the other square sharing both rolled-over corners.
  for (let i = 0; i < state.grid.length; i++) {
    if (i === state.current) continue;
    const s2 = state.grid[i];
    let match = 0;
    for (let j = 0; j < s2.npoints; j++) {
      if (near(s2, j, skey[0])) match++;
      if (near(s2, j, skey[1])) match++;
    }
    if (match === 2) return { dest: i, skey: [skey[0], skey[1]] };
  }
  return null;
}

/** Move letters, indexed by the orthogonal `Direction`s. */
const DIR_CHARS: readonly CubeMove["dir"][] = ["L", "R", "U", "D"];

export function executeMove(from: CubeState, move: CubeMove): CubeState {
  // Cube's move has no discriminant to narrow to `never`, so check the one
  // field the dispatch reads: an unknown letter from another build must be
  // rejected as unrecognized, not reported as a roll into a wall.
  const direction: Direction = DIR_CHARS.indexOf(move.dir);
  if (direction < 0) rejectMove(move, "cube: executeMove");

  const roll = findMoveDest(from, direction);
  if (!roll) throw new Error("cube: illegal move");
  const { dest, skey } = roll;

  const solid = SOLIDS[from.solidIndex];
  const grid = from.grid;

  // The two source-square corners we roll over, as solid vertex indices.
  const allPkey = alignPolyKeys(solid, grid[from.current]);
  if (!allPkey) throw new Error("cube: source alignment failed");
  const pkey: [number, number] = [allPkey[skey[0]], allPkey[skey[1]]];

  let angle = dihedralAngle(solid, pkey);

  // HACK (from cube.c): for the cube, both +angle and -angle align, so
  // disambiguate the UP roll by hand.
  if (solid.order === 4 && direction === Direction.Up) angle = -angle;

  // Roll, reflect onto the destination square, and check the result
  // seats correctly; if not, the rotation went the wrong way — flip the
  // sign and try once more (mirrors cube.c's try-both approach).
  let poly = transformPoly(solid, grid[from.current].flip, pkey[0], pkey[1], angle);
  flipPoly(poly, grid[dest].flip);
  if (!alignPolyKeys(poly, grid[dest])) {
    angle = -angle;
    poly = transformPoly(solid, grid[from.current].flip, pkey[0], pkey[1], angle);
    flipPoly(poly, grid[dest].flip);
    if (!alignPolyKeys(poly, grid[dest]))
      throw new Error("cube: could not seat solid after roll");
  }

  // Map the face permutation the roll induced: the rolled solid is
  // congruent to the original with faces permuted, so each original
  // face's color follows the rolled face whose normal matches it.
  const faceColors = new Int32Array(solid.nfaces).fill(-1);
  for (let i = 0; i < solid.nfaces; i++) {
    for (let j = 0; j < poly.nfaces; j++) {
      let dist = 0;
      for (let k = 0; k < 3; k++)
        dist += sqr(poly.normals[j * 3 + k] - solid.normals[i * 3 + k]);
      if (dist < 0.1) faceColors[i] = from.faceColors[j];
    }
  }

  const blue = new Uint8Array(from.blue);
  let completed = from.completed;
  const movecount = from.movecount + 1;

  // Swap paint between the resting face and the landed-on square, unless
  // already complete (a finished solid may roll freely as a small reward).
  if (!completed) {
    const lf = lowestFace(solid);
    [faceColors[lf], blue[dest]] = [blue[dest], faceColors[lf]];
    if (faceColors.every((c) => c)) completed = movecount;
  }

  // Resting key points for the static (non-animated) display.
  const restKeys = alignPolyKeys(solid, grid[dest]);
  if (!restKeys) throw new Error("cube: rest alignment failed");

  return {
    ...from,
    current: dest,
    faceColors,
    blue,
    completed,
    movecount,
    dpkey: [restKeys[0], restKeys[1]],
    dgkey: [0, 1],
    spkey: pkey,
    sgkey: skey,
    previous: from.current,
    angle,
  };
}

/** Dihedral angle across the edge between solid vertices `pkey[0]` and
 * `pkey[1]`: acos of the dot product of the two faces sharing it. */
function dihedralAngle(solid: Solid, pkey: [number, number]): number {
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
  return Math.acos(Math.min(1, Math.max(-1, dp)));
}

// --- input ------------------------------------------------------------

function newUi(_state: CubeState): CubeUi {
  return {};
}

function interpretMove(
  state: CubeState,
  _ui: CubeUi,
  ds: CubeDrawState,
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

  if (!findMoveDest(state, direction)) return null;
  return { dir: DIR_CHARS[direction] };
}

/** Pick a roll direction from a left-click bearing relative to the
 * current square's center. Mirrors the `LEFT_BUTTON` branch of
 * `interpret_move`. Returns null for a dead-center click. */
function directionFromClick(
  state: CubeState,
  ds: CubeDrawState,
  p: Point,
): Direction | null {
  const sq = state.grid[state.current];
  const cx = Math.trunc(sq.x * ds.gridscale) + ds.ox;
  const cy = Math.trunc(sq.y * ds.gridscale) + ds.oy;
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

// --- Game object ------------------------------------------------------

export const cubeGame: Game<CubeParams, CubeState, CubeMove, CubeUi, CubeDrawState> = {
  id: "cube",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: false,
  canFormatAsText: false,
  // Rolling the cube is the only gesture; the secondary button has no meaning,
  // so a touch player's held press must not be promoted into one.
  ignoresSecondaryButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    {
      kw: "type-of-solid",
      name: "Type of solid",
      type: "choices",
      choices: ["Tetrahedron", "Cube", "Octahedron", "Icosahedron"],
      get: (p) => p.solid,
      set: (p, v) => {
        p.solid = v;
      },
    },
    {
      kw: "width-top",
      name: "Width / top",
      type: "string",
      get: (p) => String(p.d1),
      set: (p, v) => {
        p.d1 = parseConfigInt(v);
      },
    },
    {
      kw: "height-bottom",
      name: "Height / bottom",
      type: "string",
      get: (p) => String(p.d2),
      set: (p, v) => {
        p.d2 = parseConfigInt(v);
      },
    },
  ],
  // Keys match the `cube` template in augmentation.ts; `type-of-solid` is the
  // zero-based SolidType index.
  describeParams: (p) => ({
    "type-of-solid": p.solid,
    "width-top": p.d1,
    "height-bottom": p.d2,
  }),

  newDesc,
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  statusbarText,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => ROLLTIME,
  flashLength: () => 0,
};

registerGame(cubeGame);
