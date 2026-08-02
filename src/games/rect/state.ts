/**
 * Types and pure state helpers for Rectangles (`rect.c`).
 *
 * The board is a `w × h` grid of numbers (0 = empty) which the player divides
 * into rectangles by drawing edges. Two edge grids, kept verbatim from
 * upstream:
 *  - `vedge(x,y)` — a vertical edge on the **left** of cell `(x,y)` (between
 *    `x-1` and `x`); meaningful for `x ∈ [1, w-1]`.
 *  - `hedge(x,y)` — a horizontal edge on the **top** of cell `(x,y)` (between
 *    `y-1` and `y`); meaningful for `y ∈ [1, h-1]`.
 * Edge values are 0 (none) or 1 (a wall). The render also uses 2/3 for the
 * transient drag preview, but those never live in state.
 */

import type { PresetMenu } from "../../engine/game.ts";
import { atof, formatG, parseLeadingInt } from "../../engine/params.ts";

export interface RectParams {
  w: number;
  h: number;
  /** C `float`: base grid is generated at `size / (1 + expandfactor)` then
   * stretched. Default 0 (all presets). A byte-match float hazard — encoded
   * `%g`, decoded `atof` (see design D5). */
  expandfactor: number;
  /** Generate a uniquely-solvable board (default) vs. any placement. */
  unique: boolean;
}

/** A player action. Discriminated union in place of C's move strings
 * `R x,y,w,h` / `E x,y,w,h` / `H x,y` / `V x,y` / `S…` (design D2). */
export type RectMove =
  | { type: "rect"; erasing: boolean; x: number; y: number; w: number; h: number }
  | { type: "edge"; edge: "h" | "v"; x: number; y: number }
  /** The full solution edges (from `solve`/`aux`), applied wholesale. The two
   * strings are `'0'`/`'1'` bit runs in upstream's `S` order (vedge for x≥1
   * row-major, then hedge for y≥1 row-major). */
  | { type: "solve"; vedge: string; hedge: string };

export interface RectState {
  readonly w: number;
  readonly h: number;
  /** The numbers, row-major (`0` = empty). Immutable after `newState`. */
  readonly grid: Int32Array;
  /** Vertical edges (left side of each cell), `w*h`, value 0/1. */
  readonly vedge: Uint8Array;
  /** Horizontal edges (top of each cell), `w*h`, value 0/1. */
  readonly hedge: Uint8Array;
  readonly completed: boolean;
  readonly cheated: boolean;
  /** Per-cell correctness overlay (1 = part of a valid rectangle), `w*h`.
   * Recomputed after every move; drives the grey fill + completion. */
  readonly correct: Uint8Array;
}

/** Persisted cursor/drag UI (not history). Mirrors upstream `game_ui`. */
export interface RectUi {
  /** -1,-1 means no drag in progress. Half-grid coords (0..2w, 0..2h). */
  dragStartX: number;
  dragStartY: number;
  dragEndX: number;
  dragEndY: number;
  /** Set once a drag has moved off its start point (so a returning drag is
   * still a drag, not a click). */
  dragged: boolean;
  /** True while erasing interior edges (right-drag). */
  erasing: boolean;
  /** The current drag box, cell coords, or -1. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cursorX: number;
  cursorY: number;
  cursorVisible: boolean;
  cursorDragging: boolean;
}

export interface RectDrawState {
  started: boolean;
  tileSize: number;
  w: number;
  h: number;
  /** Per-cell packed cache word (see render.ts). `-1` = force repaint. */
  visible: Int32Array;
}

/** A flagged edge that the unique solution does not contain (design D4). */
export interface RectMistake {
  edge: "h" | "v";
  x: number;
  y: number;
}

/* ----------------------------------------------------------------------
 * Params.
 */

export function defaultParams(): RectParams {
  return { w: 7, h: 7, expandfactor: 0, unique: true };
}

const PRESET_SIZES = [7, 9, 11, 13, 15, 17, 19];

export function presets(): PresetMenu<RectParams> {
  return {
    title: "Rectangles",
    submenu: PRESET_SIZES.map((n) => ({
      title: `${n}x${n}`,
      params: { w: n, h: n, expandfactor: 0, unique: true },
    })),
  };
}

export function encodeParams(p: RectParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full && p.expandfactor) s += `e${formatG(p.expandfactor)}`;
  if (full && !p.unique) s += "a";
  return s;
}

export function decodeParams(s: string): RectParams {
  const p = defaultParams();
  const w = parseLeadingInt(s, 0);
  p.w = p.h = w.value;
  let i = w.next;
  if (s[i] === "x") {
    const h = parseLeadingInt(s, i + 1);
    p.h = h.value;
    i = h.next;
  }
  if (s[i] === "e") {
    i++;
    const start = i;
    while (i < s.length && (s[i] === "." || (s[i] >= "0" && s[i] <= "9"))) i++;
    // Stored as a C `float`, so round to single precision (design D5).
    p.expandfactor = Math.fround(atof(s.slice(start, i)));
  }
  if (s[i] === "a") {
    p.unique = false;
  }
  return p;
}

export function validateParams(p: RectParams, _full: boolean): string | null {
  if (p.w <= 0 || p.h <= 0) return "Width and height must both be greater than zero";
  if (p.w > 1_000_000 / p.h) return "Width times height must not be unreasonably large";
  if (p.w * p.h < 2) return "Grid area must be greater than one";
  if (p.expandfactor < 0) return "Expansion factor may not be negative";
  return null;
}

/* ----------------------------------------------------------------------
 * Description codec (run-length: a–z gaps, `_` separators, decimal numbers).
 */

const CODE_A = "a".charCodeAt(0);
const CODE_Z = "z".charCodeAt(0);

/** Encode a numbers array (row-major, 0 = empty) into the upstream desc. */
export function encodeNumbers(numbers: ArrayLike<number>, area: number): string {
  let out = "";
  let run = 0;
  for (let i = 0; i <= area; i++) {
    const n = i < area ? numbers[i] : -1;
    if (n === 0) {
      run++;
    } else {
      if (run) {
        while (run > 0) {
          let c = CODE_A - 1 + run;
          if (run > 26) c = CODE_Z;
          out += String.fromCharCode(c);
          run -= c - (CODE_A - 1);
        }
      } else if (out.length > 0 && n > 0) {
        // No unnecessary `_` before a number at the very top-left.
        out += "_";
      }
      if (n > 0) out += String(n);
      run = 0;
    }
  }
  return out;
}

export function validateDesc(p: RectParams, desc: string): string | null {
  const area = p.w * p.h;
  let squares = 0;
  let i = 0;
  while (i < desc.length) {
    const c = desc[i++];
    if (c >= "a" && c <= "z") {
      squares += c.charCodeAt(0) - CODE_A + 1;
    } else if (c === "_") {
      // nothing
    } else if (c > "0" && c <= "9") {
      squares++;
      while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") i++;
    } else {
      return "Invalid character in game description";
    }
  }
  if (squares < area) return "Not enough data to fill grid";
  if (squares > area) return "Too much data to fit in grid";
  return null;
}

/** Parse a desc into the row-major numbers array (0 = empty). */
export function decodeNumbers(desc: string, area: number): Int32Array {
  const grid = new Int32Array(area);
  let idx = 0;
  let i = 0;
  while (i < desc.length) {
    const c = desc[i++];
    if (c >= "a" && c <= "z") {
      let run = c.charCodeAt(0) - CODE_A + 1;
      while (run-- > 0) grid[idx++] = 0;
    } else if (c === "_") {
      // nothing
    } else if (c > "0" && c <= "9") {
      const start = i - 1;
      while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") i++;
      grid[idx++] = Number.parseInt(desc.slice(start, i), 10);
    }
  }
  return grid;
}
