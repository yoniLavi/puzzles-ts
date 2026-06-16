/**
 * Range (Kurodoko / Kuromasu) state, params, and desc codec — port of
 * the corresponding parts of `range.c`.
 *
 * The whole board lives in one signed `Int8Array` `grid`, exactly as
 * upstream's `puzzle_size *grid`: a positive value is an immutable clue
 * number, and the three non-clue cell states are the sentinels
 * `BLACK = -2`, `WHITE = -1` (the player's "dot" pencil mark), and
 * `EMPTY = 0` (undecided). Clue cells are identified by `grid[i] > 0`
 * and are never written by a move.
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import type { PresetMenu } from "../../engine/game.ts";

// --- cell sentinels --------------------------------------------------------

export const BLACK = -2;
export const WHITE = -1;
export const EMPTY = 0;

export const idx = (r: number, c: number, w: number): number => r * w + c;
export const outOfBounds = (r: number, c: number, w: number, h: number): boolean =>
  r < 0 || r >= h || c < 0 || c >= w;

// --- types -----------------------------------------------------------------

export interface RangeParams {
  w: number;
  h: number;
}

export interface RangeState {
  w: number;
  h: number;
  /** Clue (> 0) / BLACK / WHITE / EMPTY per cell, row-major. */
  grid: Int8Array;
  hasCheated: boolean;
  wasSolved: boolean;
}

export type RangeCellValue = "black" | "white" | "empty";

/** A move is a list of cell-sets plus an optional solve flag (upstream's
 * `S` prefix, which marks the state cheated + solved). Covers a single
 * click, the shift-cursor double-dot, and the whole Solve sequence. */
export interface RangeMove {
  solve?: boolean;
  sets: { r: number; c: number; value: RangeCellValue }[];
}

export interface RangeUi {
  /** Cursor position. */
  r: number;
  c: number;
  cursorShow: boolean;
}

export function cellValueToGrid(v: RangeCellValue): number {
  return v === "black" ? BLACK : v === "white" ? WHITE : EMPTY;
}

// --- params ----------------------------------------------------------------

const PRESETS: RangeParams[] = [
  { w: 9, h: 6 },
  { w: 12, h: 8 },
  { w: 13, h: 9 },
  { w: 16, h: 11 },
];

export function defaultParams(): RangeParams {
  return { ...PRESETS[0] };
}

export function presets(): PresetMenu<RangeParams> {
  return {
    title: "Range",
    submenu: PRESETS.map((p) => ({ title: `${p.w} x ${p.h}`, params: { ...p } })),
  };
}

export function encodeParams(p: RangeParams, _full: boolean): string {
  return `${p.w}x${p.h}`;
}

export function decodeParams(s: string): RangeParams {
  // Lenient, matching upstream `decode_params`: a leading integer is the
  // width (and default height); an `x<int>` overrides the height.
  const m = /^(\d+)(?:x(\d+))?/.exec(s);
  const w = m ? Number.parseInt(m[1], 10) : PRESETS[0].w;
  const h = m?.[2] !== undefined ? Number.parseInt(m[2], 10) : w;
  return { w, h };
}

// signed char max — the upstream `puzzle_size` overflow guard for `w + h`.
const SCHAR_MAX = 127;

export function validateParams(p: RangeParams, full: boolean): string | null {
  const { w, h } = p;
  if (w < 1) return "Width is less than 1";
  if (h < 1) return "Height is less than 1";
  if (w > SCHAR_MAX - (h - 1)) return "Width plus height is too big";
  if (w * h < 1) return "Size is less than 1";
  if (full) {
    if (w === 2 && h === 2) return "Can't create 2x2 puzzles";
    if (w === 1 && h === 2) return "Can't create 1x2 puzzles";
    if (w === 2 && h === 1) return "Can't create 2x1 puzzles";
    if (w === 1 && h === 1) return "Can't create 1x1 puzzles";
  }
  return null;
}

// --- desc codec ------------------------------------------------------------

const A = "a".charCodeAt(0);

/** Encode a clue grid (clue cells > 0, every other cell treated as a
 * blank run) into the run-length desc, byte-for-byte as upstream's
 * `newdesc_encode_game_description`. */
export function encodeDesc(area: number, grid: Int8Array | number[]): string {
  let desc = "";
  let run = 0;
  for (let i = 0; i <= area; i++) {
    const n = i < area ? grid[i] : -1;
    if (n === 0) {
      run++;
    } else {
      if (run > 0) {
        while (run > 0) {
          const amt = run > 26 ? 26 : run;
          desc += String.fromCharCode(A - 1 + amt);
          run -= amt;
        }
      } else if (desc.length > 0 && n > 0) {
        // Separator so two adjacent clues (or a clue after another clue)
        // don't merge into one number.
        desc += "_";
      }
      if (n > 0) desc += String(n);
      run = 0;
    }
  }
  return desc;
}

export function validateDesc(p: RangeParams, desc: string): string | null {
  const n = p.w * p.h;
  const range = p.w + p.h - 1; // maximum cell value
  let squares = 0;
  let i = 0;
  while (i < desc.length && desc[i] !== ",") {
    const ch = desc[i];
    const code = desc.charCodeAt(i);
    if (ch >= "a" && ch <= "z") {
      squares += code - A + 1;
      i++;
    } else if (ch === "_") {
      i++;
    } else if (ch >= "1" && ch <= "9") {
      const m = /^\d+/.exec(desc.slice(i));
      const val = m ? Number.parseInt(m[0], 10) : 0;
      if (val < 1 || val > range) return "Out-of-range number in game description";
      squares++;
      i += m ? m[0].length : 1;
    } else {
      return "Invalid character in game description";
    }
  }
  if (squares < n) return "Not enough data to fill grid";
  if (squares > n) return "Too much data to fit in grid";
  return null;
}

export function newState(p: RangeParams, desc: string): RangeState {
  const n = p.w * p.h;
  const grid = new Int8Array(n); // all EMPTY (0)
  let i = 0;
  let j = 0;
  while (i < n && j < desc.length) {
    const ch = desc[j];
    if (ch >= "a" && ch <= "z") {
      let squares = desc.charCodeAt(j) - A + 1;
      while (squares-- > 0) grid[i++] = 0;
      j++;
    } else if (ch === "_") {
      j++;
    } else if (ch >= "1" && ch <= "9") {
      const m = /^\d+/.exec(desc.slice(j));
      const val = m ? Number.parseInt(m[0], 10) : 0;
      grid[i++] = val;
      j += m ? m[0].length : 1;
    } else {
      j++;
    }
  }
  return { w: p.w, h: p.h, grid, hasCheated: false, wasSolved: false };
}

export function cloneState(s: RangeState): RangeState {
  return { ...s, grid: s.grid.slice() };
}

export function status(s: RangeState): GameStatus {
  return s.wasSolved ? "solved" : "ongoing";
}

// --- text format -----------------------------------------------------------

export function textFormat(s: RangeState): string {
  const { w, h, grid } = s;
  let cellsize = 0;
  for (let c = 0; c < w; c++) {
    for (let r = 0; r < h; r++) {
      let k = grid[idx(r, c, w)];
      let d = 0;
      for (; k > 0; k = Math.floor(k / 10)) d++;
      cellsize = Math.max(cellsize, d);
    }
  }
  cellsize++;

  const gridline = `+${`${"-".repeat(cellsize - 1)}+`.repeat(w)}`;

  const lines: string[] = [];
  for (let r = 0; r < h; r++) {
    lines.push(gridline);
    let row = "";
    for (let c = 0; c < w; c++) {
      const v = grid[idx(r, c, w)];
      let cellStr: string;
      if (v === BLACK) cellStr = "#".repeat(cellsize - 1);
      else if (v === WHITE) cellStr = ".".repeat(cellsize - 1);
      else if (v === EMPTY) cellStr = " ".repeat(cellsize - 1);
      else cellStr = String(v).padStart(cellsize - 1, " ");
      row += `|${cellStr}`;
    }
    row += "|";
    lines.push(row);
  }
  lines.push(gridline);
  return `${lines.join("\n")}\n`;
}
