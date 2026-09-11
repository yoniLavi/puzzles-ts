/**
 * Range (Kurodoko / Kuromasu) state, params, and desc codec — port of
 * the corresponding parts of `range.c`.
 *
 * The whole board lives in one signed `Int8Array` `grid`, as upstream's
 * `puzzle_size *grid`: a positive value is an immutable clue number, and the
 * three non-clue cell states are the sentinels `BLACK = -2`, `WHITE = -1`
 * (the player's "dot" pencil mark), and `EMPTY = 0` (undecided). Clue cells
 * are identified by `grid[i] > 0` and are never written by a move.
 */

import { assertNever } from "../../engine/assert-never.ts";
import type { ParamConfigItem, PresetMenu } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import { dims, paramsCodec } from "../../engine/params-codec.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import type { GameStatus } from "../../engine/types.ts";

// --- cells -----------------------------------------------------------------

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

export interface Cell {
  r: number;
  c: number;
}

export interface RangeState {
  w: number;
  h: number;
  /** Clue (> 0) / BLACK / WHITE / EMPTY per cell, row-major. */
  grid: Int8Array;
  cheated: boolean;
  completed: boolean;
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
  /** Range speaks `(r, c)` everywhere else — its grid is row-major and its
   * `idx`/`outOfBounds` take the row first. The cursor is the collection's
   * `(x, y)`, so `cursor.x` is this game's `c` and `cursor.y` its `r`. */
  cursor: GridCursor;
}

export function cellValueToGrid(v: RangeCellValue): number {
  if (v === "black") return BLACK;
  if (v === "white") return WHITE;
  if (v === "empty") return EMPTY;
  return assertNever(v, "range: cellValueToGrid");
}

export function gridValueToCell(v: number): RangeCellValue {
  return v === BLACK ? "black" : v === WHITE ? "white" : "empty";
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

/** The "Custom type…" form, and the field list the codec below encodes. */
export const paramConfig: ParamConfigItem<RangeParams>[] =
  dimensionParamConfig<RangeParams>();

/** `WxH`, with upstream's square fallback: a bare `W` is a W×W board. */
export const { encodeParams, decodeParams } = paramsCodec(defaultParams, [
  dims(paramConfig),
]);

// signed char max — the upstream `puzzle_size` overflow guard for `w + h`.
const SCHAR_MAX = 127;

export function validateParams(p: RangeParams, full: boolean): string | null {
  const { w, h } = p;
  if (w < 1) return "Width is less than 1";
  if (h < 1) return "Height is less than 1";
  if (w > SCHAR_MAX - (h - 1)) return "Width plus height is too big";
  if (full && w <= 2 && h <= 2) return `Can't create ${w}x${h} puzzles`;
  return null;
}

// --- desc codec ------------------------------------------------------------

const A = "a".charCodeAt(0);

/** One desc token: a letter is a run of that many blanks (`a` = 1 … `z` =
 * 26), a digit run is one clue, and any other single character is `_` (which
 * separates two adjacent clues) or garbage. */
const DESC_TOKEN = /([a-z])|([1-9]\d*)|./gs;

/** Encode a clue grid (clue cells > 0, blanks 0) into upstream's run-length
 * desc, as `newdesc_encode_game_description` writes it. */
export function encodeDesc(area: number, grid: Int8Array | number[]): string {
  let desc = "";
  let run = 0;
  for (let i = 0; i <= area; i++) {
    const n = i < area ? grid[i] : -1; // -1 flushes the final run
    if (n === 0) {
      run++;
      continue;
    }
    if (run > 0) {
      for (; run > 26; run -= 26) desc += "z";
      desc += String.fromCharCode(A - 1 + run);
      run = 0;
    } else if (n > 0 && desc.length > 0) {
      desc += "_"; // so two adjacent clues don't merge into one number
    }
    if (n > 0) desc += String(n);
  }
  return desc;
}

export function validateDesc(p: RangeParams, desc: string): string | null {
  const n = p.w * p.h;
  const maxClue = p.w + p.h - 1;
  let squares = 0;
  for (const [token, blanks, clue] of desc.matchAll(DESC_TOKEN)) {
    if (token === ",") break;
    if (blanks) {
      squares += blanks.charCodeAt(0) - A + 1;
    } else if (clue) {
      if (Number(clue) > maxClue) return "Out-of-range number in game description";
      squares++;
    } else if (token !== "_") {
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
  for (const [, blanks, clue] of desc.matchAll(DESC_TOKEN)) {
    if (i >= n) break;
    if (blanks) i += blanks.charCodeAt(0) - A + 1;
    else if (clue) grid[i++] = Number(clue);
  }
  return { w: p.w, h: p.h, grid, cheated: false, completed: false };
}

export function cloneState(s: RangeState): RangeState {
  return { ...s, grid: s.grid.slice() };
}

export function status(s: RangeState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- text format -----------------------------------------------------------

const MARK_GLYPH: Record<number, string> = { [BLACK]: "#", [WHITE]: ".", [EMPTY]: " " };

export function textFormat(s: RangeState): string {
  const { w, h, grid } = s;
  let cw = 0; // every cell is as wide as the widest clue
  for (const v of grid) if (v > 0) cw = Math.max(cw, String(v).length);
  const gridline = `+${`${"-".repeat(cw)}+`.repeat(w)}`;

  const lines: string[] = [];
  for (let r = 0; r < h; r++) {
    const cells = Array.from({ length: w }, (_, c) => {
      const v = grid[idx(r, c, w)];
      return v > 0 ? String(v).padStart(cw) : MARK_GLYPH[v].repeat(cw);
    });
    lines.push(gridline, `|${cells.join("|")}|`);
  }
  lines.push(gridline);
  return `${lines.join("\n")}\n`;
}
