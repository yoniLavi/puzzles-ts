import { parseDimensions } from "../../engine/params.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import type { GameStatus } from "../../engine/types.ts";
import { choosemove, completed, fill, SolverScratch } from "./solver.ts";

// --- constants --------------------------------------------------------

/** The flood-fill anchor: the top-left corner (upstream `FILLX`/`FILLY`). */
export const FILLX = 0;
export const FILLY = 0;

/** Upper limit on colors, from the count of distinct RGB values
 * upstream defines (`MAXCOLORS`). */
export const MAXCOLORS = 10;

// --- types ------------------------------------------------------------

export interface FloodParams {
  w: number;
  h: number;
  colors: number;
  /** Extra moves permitted above the solver's move count. */
  leniency: number;
}

export interface FloodState {
  readonly w: number;
  readonly h: number;
  /** Number of distinct colors in play (cells hold `0..colors-1`). */
  readonly colors: number;
  /** Color per cell in row-major order. Below `MAXCOLORS`, so each is one
   * digit in the desc and the text format. */
  readonly grid: Uint8Array;
  readonly moves: number;
  readonly movelimit: number;
  readonly completed: boolean;
  /** Set when the auto-solver was used (drives the status-bar prefix). */
  readonly cheated: boolean;
}

/** A fill picks a color for the corner region; a solve snaps to the
 * solved board. Both are plain JSON-safe data, so the default move codec
 * suffices. Upstream's stored solution path (`soln`, which Solve set and
 * the secondary select stepped through) is dropped: the hint plan
 * replaces it. */
export type FloodMove = { type: "fill"; color: number } | { type: "solve" };

export interface FloodUi {
  cursor: GridCursor;
}

// --- params -----------------------------------------------------------

export function defaultParams(): FloodParams {
  return { w: 12, h: 12, colors: 6, leniency: 5 };
}

export function encodeParams(p: FloodParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += `c${p.colors}m${p.leniency}`;
  return s;
}

export function decodeParams(s: string): FloodParams {
  // Upstream's format: `WxH` (a bare `W` is square), then `c<colors>` and
  // `m<leniency>` anywhere in the remainder, each read with `atoi`.
  const ret = defaultParams();
  const dims = parseDimensions(s);
  ret.w = dims.w;
  ret.h = dims.h;
  let i = dims.next;
  while (i < s.length) {
    if (s[i] === "c") {
      i++;
      ret.colors = Number.parseInt(s.slice(i), 10) || 0;
      while (i < s.length && isDigit(s[i])) i++;
    } else if (s[i] === "m") {
      i++;
      ret.leniency = Number.parseInt(s.slice(i), 10) || 0;
      while (i < s.length && isDigit(s[i])) i++;
    } else {
      i++;
    }
  }
  return ret;
}

export function validateParams(p: FloodParams, _full: boolean): string | null {
  if (p.w * p.h < 2) return "Grid must contain at least two squares";
  if (p.w < 1 || p.h < 1) return "Width and height must be at least one";
  if (p.colors < 3 || p.colors > MAXCOLORS)
    return `Must have between 3 and ${MAXCOLORS} colors`;
  if (p.leniency < 0) return "Leniency must be non-negative";
  return null;
}

// --- presets ----------------------------------------------------------

export function presets() {
  const p = (
    w: number,
    h: number,
    colors: number,
    leniency: number,
    title: string,
  ) => ({ title, params: { w, h, colors, leniency } });
  return {
    title: "Type",
    submenu: [
      p(12, 12, 6, 5, "12x12 Easy"),
      p(12, 12, 6, 2, "12x12 Medium"),
      p(12, 12, 6, 0, "12x12 Hard"),
      p(16, 16, 6, 2, "16x16 Medium"),
      p(16, 16, 6, 0, "16x16 Hard"),
      p(12, 12, 3, 0, "12x12, 3 colors"),
      p(12, 12, 4, 0, "12x12, 4 colors"),
    ],
  };
}

// --- color-character codec -------------------------------------------

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/** Decode a grid-description character to a color, or `-1` if invalid.
 * Upstream's `validate_desc` reads `A`-`Z` as 10-35, so a letter is out of
 * range rather than a bad character. */
export function decodeColorChar(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 90) return 10 + (code - 65);
  return -1;
}

// --- desc -------------------------------------------------------------

export function validateDesc(p: FloodParams, desc: string): string | null {
  const wh = p.w * p.h;
  for (let i = 0; i < wh; i++) {
    const ch = desc[i];
    if (ch === undefined) return "Not enough data in grid description";
    const c = decodeColorChar(ch);
    if (c < 0) return "Bad character in grid description";
    if (c >= MAXCOLORS) return "Color out of range in grid description";
  }
  if (desc[wh] !== ",") return "Expected ',' after grid description";
  if (!/^\d*$/.test(desc.slice(wh + 1)))
    return "Badly formatted move limit after grid description";
  return null;
}

export function newState(p: FloodParams, desc: string): FloodState {
  const wh = p.w * p.h;
  const grid = new Uint8Array(wh);
  let colors = 0;
  for (let i = 0; i < wh; i++) {
    const c = decodeColorChar(desc[i]);
    grid[i] = c;
    if (c >= colors) colors = c + 1;
  }
  // desc[wh] is ',' — the move limit follows.
  const movelimit = Number.parseInt(desc.slice(wh + 1), 10) || 0;
  return {
    w: p.w,
    h: p.h,
    colors,
    grid,
    moves: 0,
    movelimit,
    completed: false,
    cheated: false,
  };
}

// --- status -----------------------------------------------------------

/** Upstream's `game_status`: completing within the limit wins; reaching the
 * limit otherwise loses, even if a later fill completes the grid. */
export function status(state: FloodState): GameStatus {
  if (state.completed && state.moves <= state.movelimit) return "solved";
  if (state.moves >= state.movelimit) return "lost";
  return "ongoing";
}

// --- text format ------------------------------------------------------

export function textFormat(state: FloodState): string {
  const { w, h, grid } = state;
  let text = "";
  for (let y = 0; y < h; y++) text += `${grid.subarray(y * w, (y + 1) * w).join("")}\n`;
  return text;
}

// --- generator --------------------------------------------------------

/** Upstream's `new_game_desc`: invent a random grid (re-rolling an
 * already-complete one), run the heuristic solver to count the moves it
 * needs, and set the move limit to that count plus the leniency. The
 * differential checks both halves: the grid reproduces from `random.ts`,
 * the limit only if the solver makes C's choices. */
export function newDesc(p: FloodParams, rng: RandomState): { desc: string } {
  const { w, h, colors, leniency } = p;
  const wh = w * h;
  const scratch = new SolverScratch(w, h);

  const grid = new Uint8Array(wh);
  do {
    for (let i = 0; i < wh; i++) grid[i] = randomUpto(rng, colors);
  } while (completed(grid));

  // Run the solver on a copy, counting its moves.
  const work = Uint8Array.from(grid);
  let moves = 0;
  while (!completed(work)) {
    const move = choosemove(w, h, work, FILLX, FILLY, colors, scratch);
    fill(w, h, work, FILLX, FILLY, move, scratch.queue0);
    moves++;
  }
  return { desc: `${grid.join("")},${moves + leniency}` };
}
