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

import { digitValue, isDigit, parseLeadingInt } from "../../engine/decimal.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { atof, formatG } from "../../engine/params.ts";
import type { GridCursor, GridDrag } from "../../engine/pointer.ts";

export interface RectParams {
  w: number;
  h: number;
  /** C `float`: base grid is generated at `size / (1 + expandfactor)` then
   * stretched. Default 0 (all presets). A byte-match float hazard, so encoded
   * `%g` and decoded `atof`. */
  expandfactor: number;
  /** Generate a uniquely-solvable board (default) vs. any placement. */
  unique: boolean;
}

/** A player action; upstream's move strings `R x,y,w,h` / `E x,y,w,h` /
 * `H x,y` / `V x,y` / `S…`. */
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
   * Recomputed after every move; drives the gray fill + completion. */
  readonly correct: Uint8Array;
}

/** Persisted cursor/drag UI (not history). Mirrors upstream `game_ui`. */
export interface RectUi {
  /** The drag's anchor and current position, in **half-grid** coordinates
   * (0..2w, 0..2h) — Rect's own space, because its rectangles are edge-aligned.
   * `GridDrag` has no opinion about the unit. */
  drag: GridDrag;
  /** Set once a drag has moved off its start point (so a returning drag is
   * still a drag, not a click). Distinct from `drag.live`: a press is live
   * immediately, but has not yet *dragged*, which is what keeps a bare click on
   * an edge from committing a 1×1 rectangle. */
  dragged: boolean;
  /** True while erasing interior edges (right-drag). */
  erasing: boolean;
  /** The current drag box, cell coords, or -1. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cursor: GridCursor;
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

/** A flagged edge that the unique solution does not contain. */
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
    while (i < s.length && (s[i] === "." || isDigit(s[i]))) i++;
    // Stored as a C `float`, so round to single precision.
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
          const gap = Math.min(run, 26);
          out += String.fromCharCode(CODE_A - 1 + gap);
          run -= gap;
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
    } else if (digitValue(c) >= 1) {
      squares++;
      i = parseLeadingInt(desc, i).next;
    } else if (c !== "_") {
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
      idx += c.charCodeAt(0) - CODE_A + 1; // the grid starts zeroed
    } else if (digitValue(c) >= 1) {
      const n = parseLeadingInt(desc, i - 1);
      grid[idx++] = n.value;
      i = n.next;
    }
  }
  return grid;
}
