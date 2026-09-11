/**
 * Pegs' data model: the grid vocabulary, params and presets, the desc codec's
 * validation half, and the state/ui constructors.
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

/** Indexed by board type. */
export const BOARD_TYPE_NAMES = ["Cross", "Octagon", "Random"] as const;
/** The params string's board-type words. */
const BOARD_TYPE_LOWER = BOARD_TYPE_NAMES.map((name) => name.toLowerCase());

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
      // Octagon comes in one size only, so its title names none.
      const name = BOARD_TYPE_NAMES[p.type];
      const title = p.type === TYPE_OCTAGON ? name : `${name} ${p.w}×${p.h}`;
      return { title, params: p };
    }),
  };
}

export function encodeParams(p: PegsParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += BOARD_TYPE_LOWER[p.type];
  return s;
}

export function decodeParams(s: string): PegsParams {
  // `next` indexes the board-type word after the dimensions.
  const { w, h, next } = parseDimensions(s, 0);
  const type = BOARD_TYPE_LOWER.indexOf(s.slice(next));
  return { w, h, type: type < 0 ? TYPE_CROSS : type };
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
    const side = (n: number) => n === 5 || n === 7 || n === 9;
    if (!side(p.w) || !side(p.h) || (p.w === 5 && p.h === 5)) {
      return "This board type is only supported at 5×7, 5×9, 7×7, 7×9, and 9×9";
    }
  }
  if (full && p.type === TYPE_OCTAGON && (p.w !== 7 || p.h !== 7)) {
    return "This board type is only supported at 7×7";
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
  // The cursor starts on the first playable cell, which a valid desc has.
  const first = state.grid.findIndex((v) => v !== GRID_OBST);
  const i = Math.max(0, first);
  return {
    dragging: false,
    sx: 0,
    sy: 0,
    dx: 0,
    dy: 0,
    cursor: newCursor(i % state.w, Math.floor(i / state.w)),
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
  // Pegs parses its moves at the save boundary, so a foreign move is caught
  // here, before `executeMove` sees it. `raw` rather than `s`, which renders
  // an object as the useless "[object Object]".
  if (!match) rejectMove(raw, "pegs: deserializeMove");
  return {
    type: "jump",
    sx: Number.parseInt(match[1], 10),
    sy: Number.parseInt(match[2], 10),
    tx: Number.parseInt(match[3], 10),
    ty: Number.parseInt(match[4], 10),
  };
}
