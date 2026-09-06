/**
 * Pegs' data model: the grid vocabulary, params and presets, the desc codec's
 * validation half, and the state/ui constructors.
 *
 * The grid cell values live here rather than in `render.ts`, where they sat
 * briefly while Pegs had no `state.ts`: `render.ts` must import no *value* from
 * `index.ts` or the two form a runtime import cycle
 * (`module-layering.test.ts`). With a state module they simply belong here, and
 * both of the others import them from it.
 */

import { rejectMove } from "../../engine/assert-never.ts";
import { parseDimensions } from "../../engine/params.ts";
import { type GridCursor, newCursor } from "../../engine/pointer.ts";
import type { GameStatus } from "../../engine/types.ts";

// --- grid cell values ------------------------------------------------

export const GRID_HOLE = 0;
export const GRID_PEG = 1;
export const GRID_OBST = 2;

// --- board types -----------------------------------------------------

export const TYPE_CROSS = 0;
export const TYPE_OCTAGON = 1;
export const TYPE_RANDOM = 2;

const BOARD_TYPE_NAMES = ["Cross", "Octagon", "Random"] as const;
const BOARD_TYPE_LOWER = ["cross", "octagon", "random"] as const;

// --- types -----------------------------------------------------------

export interface PegsParams {
  w: number;
  h: number;
  type: number; // TYPE_CROSS | TYPE_OCTAGON | TYPE_RANDOM
}

export interface PegsState {
  w: number;
  h: number;
  completed: boolean;
  /** Flat Uint8Array grid: GRID_HOLE | GRID_PEG | GRID_OBST. */
  grid: Uint8Array;
}

export type PegsMove = { type: "jump"; sx: number; sy: number; tx: number; ty: number };

export interface PegsUi {
  dragging: boolean;
  /** Grid coords of drag start cell. */
  sx: number;
  sy: number;
  /** Pixel coords of current drag position. */
  dx: number;
  dy: number;
  /** Keyboard cursor position. */
  cursor: GridCursor;
  /** When true, next cursor-move attempts a jump. */
  curJumping: boolean;
}

// --- presets ---------------------------------------------------------

const PEGS_PRESETS: PegsParams[] = [
  { w: 5, h: 7, type: TYPE_CROSS },
  { w: 7, h: 7, type: TYPE_CROSS },
  { w: 5, h: 9, type: TYPE_CROSS },
  { w: 7, h: 9, type: TYPE_CROSS },
  { w: 9, h: 9, type: TYPE_CROSS },
  { w: 7, h: 7, type: TYPE_OCTAGON },
  { w: 5, h: 5, type: TYPE_RANDOM },
  { w: 7, h: 7, type: TYPE_RANDOM },
  { w: 9, h: 9, type: TYPE_RANDOM },
];

// --- params ----------------------------------------------------------

export function defaultParams(): PegsParams {
  return { w: 7, h: 7, type: TYPE_CROSS };
}

export function presets() {
  return {
    title: "Type",
    submenu: PEGS_PRESETS.map((p) => {
      let name = BOARD_TYPE_NAMES[p.type];
      if (p.type === TYPE_CROSS || p.type === TYPE_RANDOM) {
        name += ` ${p.w}×${p.h}`;
      }
      return { title: name, params: p };
    }),
  };
}

export function encodeParams(p: PegsParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += BOARD_TYPE_LOWER[p.type];
  return s;
}

export function decodeParams(s: string): PegsParams {
  // `WxH`-or-square dimension prefix via the shared engine helper; the
  // old `indexOf("x")` + slice mis-sliced a bare square form ("7" → w=7,
  // h=undefined). `next` is the index of the trailing board-type word.
  const { w, h, next } = parseDimensions(s, 0);
  const rest = s.slice(next);
  let type = TYPE_CROSS;
  for (let i = 0; i < BOARD_TYPE_LOWER.length; i++) {
    if (rest === BOARD_TYPE_LOWER[i]) {
      type = i;
      break;
    }
  }
  return { w, h, type };
}

export function validateParams(p: PegsParams, full: boolean): string | null {
  if (full && (p.w <= 3 || p.h <= 3)) {
    return "Width and height must both be greater than three";
  }
  if (p.w < 1 || p.h < 1) {
    return "Width and height must both be at least one";
  }
  if (p.w > 10000 / p.h) {
    return "Width times height must not be unreasonably large";
  }
  if (full && p.type === TYPE_CROSS) {
    const valid =
      (p.w === 9 && p.h === 5) ||
      (p.w === 5 && p.h === 9) ||
      (p.w === 9 && p.h === 9) ||
      (p.w === 7 && p.h === 5) ||
      (p.w === 5 && p.h === 7) ||
      (p.w === 9 && p.h === 7) ||
      (p.w === 7 && p.h === 9) ||
      (p.w === 7 && p.h === 7);
    if (!valid) {
      return "This board type is only supported at 5×7, 5×9, 7×7, 7×9, and 9×9";
    }
  }
  if (full && p.type === TYPE_OCTAGON) {
    if (p.w !== 7 || p.h !== 7) {
      return "This board type is only supported at 7×7";
    }
  }
  return null;
}
// --- validateDesc ----------------------------------------------------

export function validateDesc(p: PegsParams, desc: string): string | null {
  const len = p.w * p.h;
  if (desc.length !== len) return "Game description is wrong length";
  let nPeg = 0;
  let nHole = 0;
  for (let i = 0; i < len; i++) {
    const ch = desc[i];
    if (ch !== "P" && ch !== "H" && ch !== "O") {
      return "Invalid character in game description";
    }
    if (ch === "P") nPeg++;
    if (ch === "H") nHole++;
  }
  if (nPeg < 2) return "Too few pegs in game description";
  if (nHole < 1) return "Too few holes in game description";
  return null;
}

// --- state -----------------------------------------------------------

export function newState(p: PegsParams, desc: string): PegsState {
  const grid = new Uint8Array(p.w * p.h);
  for (let i = 0; i < desc.length; i++) {
    grid[i] = desc[i] === "P" ? GRID_PEG : desc[i] === "H" ? GRID_HOLE : GRID_OBST;
  }
  return { w: p.w, h: p.h, completed: false, grid };
}

export function newUi(state: PegsState): PegsUi {
  // Place cursor on the first peg or hole.
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const v = state.grid[y * state.w + x];
      if (v === GRID_PEG || v === GRID_HOLE) {
        return {
          dragging: false,
          sx: 0,
          sy: 0,
          dx: 0,
          dy: 0,
          cursor: newCursor(x, y),
          curJumping: false,
        };
      }
    }
  }
  // Should never happen (valid desc always has pegs/holes).
  return {
    dragging: false,
    sx: 0,
    sy: 0,
    dx: 0,
    dy: 0,
    cursor: newCursor(),
    curJumping: false,
  };
}
// --- status ----------------------------------------------------------

export function status(s: PegsState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- text format -----------------------------------------------------

export function textFormat(s: PegsState): string {
  const { w, h } = s;
  let ret = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = s.grid[y * w + x];
      ret += v === GRID_HOLE ? "-" : v === GRID_PEG ? "*" : " ";
    }
    if (y < h - 1) ret += "\n";
  }
  return ret;
}

// --- move serialization ----------------------------------------------

export function serializeMove(m: PegsMove): unknown {
  return `${m.sx},${m.sy}-${m.tx},${m.ty}`;
}

export function deserializeMove(raw: unknown): PegsMove {
  const s = String(raw);
  const match = s.match(/^(-?\d+),(-?\d+)-(-?\d+),(-?\d+)$/);
  // Pegs is the one game that parses its moves at the save boundary, so this is
  // where a foreign move is caught — before `executeMove` ever sees it. Same
  // message shape as every other game's refusal, and `raw` rather than `s`,
  // which renders an object as the useless "[object Object]".
  if (!match) rejectMove(raw, "pegs: deserializeMove");
  return {
    type: "jump",
    sx: Number.parseInt(match[1], 10),
    sy: Number.parseInt(match[2], 10),
    tx: Number.parseInt(match[3], 10),
    ty: Number.parseInt(match[4], 10),
  };
}
