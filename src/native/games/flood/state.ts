import { type RandomState, randomUpto } from "../../random/index.ts";
import type { GameStatus } from "../../../puzzle/types.ts";
import { parseDimensions } from "../../engine/params.ts";
import { choosemove, completed, fill, SolverScratch } from "./solver.ts";

// --- constants --------------------------------------------------------

/** The flood-fill anchor: the top-left corner (upstream `FILLX`/`FILLY`). */
export const FILLX = 0;
export const FILLY = 0;

/** Upper limit on colours, from the count of distinct RGB values
 * upstream defines (`MAXCOLOURS`). */
export const MAXCOLOURS = 10;

// --- types ------------------------------------------------------------

export interface FloodParams {
  w: number;
  h: number;
  colours: number;
  /** Extra moves permitted above the solver's move count. */
  leniency: number;
}

export interface FloodState {
  readonly w: number;
  readonly h: number;
  /** Number of distinct colours in play (cells hold `0..colours-1`). */
  readonly colours: number;
  /** Colour per cell in row-major order. */
  readonly grid: Uint8Array;
  readonly moves: number;
  readonly movelimit: number;
  readonly complete: boolean;
  /** Set when the auto-solver was used (drives the status-bar prefix). */
  readonly cheated: boolean;
}

/** A fill picks a colour for the corner region; a solve snaps to the
 * solved board. Both are plain JSON-safe data → the default move codec
 * suffices. Upstream's stored-solution path machinery (`soln`) is
 * dropped — our engine's `hint()` plan replaces it (design D2). */
export type FloodMove = { type: "fill"; colour: number } | { type: "solve" };

export interface FloodUi {
  cursorVisible: boolean;
  cx: number;
  cy: number;
}

// --- params -----------------------------------------------------------

export function defaultParams(): FloodParams {
  return { w: 12, h: 12, colours: 6, leniency: 5 };
}

export function encodeParams(p: FloodParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += `c${p.colours}m${p.leniency}`;
  return s;
}

export function decodeParams(s: string): FloodParams {
  // Upstream: w = h = atoi(s); then if 'x' follows the leading digits,
  // h = atoi(after-x). Then scan for 'c<colours>' / 'm<leniency>'
  // anywhere in the remainder. A bare "W" yields a square W×W board.
  const ret = defaultParams();
  const dims = parseDimensions(s);
  ret.w = dims.w;
  ret.h = dims.h;
  let i = dims.next;
  while (i < s.length) {
    if (s[i] === "c") {
      i++;
      ret.colours = Number.parseInt(s.slice(i), 10) || 0;
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
  if (p.colours < 3 || p.colours > MAXCOLOURS)
    return `Must have between 3 and ${MAXCOLOURS} colours`;
  if (p.leniency < 0) return "Leniency must be non-negative";
  return null;
}

// --- presets ----------------------------------------------------------

export function presets() {
  const p = (
    w: number,
    h: number,
    colours: number,
    leniency: number,
    title: string,
  ) => ({ title, params: { w, h, colours, leniency } });
  return {
    title: "Type",
    submenu: [
      p(12, 12, 6, 5, "12x12 Easy"),
      p(12, 12, 6, 2, "12x12 Medium"),
      p(12, 12, 6, 0, "12x12 Hard"),
      p(16, 16, 6, 2, "16x16 Medium"),
      p(16, 16, 6, 0, "16x16 Hard"),
      p(12, 12, 3, 0, "12x12, 3 colours"),
      p(12, 12, 4, 0, "12x12, 4 colours"),
    ],
  };
}

// --- colour-character codec -------------------------------------------

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/** Encode a colour as its grid-description character, mirroring
 * upstream `(colour > 9 ? 'A' : '0') + colour`. In practice colours are
 * `0..9` (at most `MAXCOLOURS-1`), so the `A`-branch is unreachable, but
 * we mirror it for fidelity. */
export function encodeColourChar(colour: number): string {
  return String.fromCharCode((colour > 9 ? 65 : 48) + colour);
}

/** Decode a grid-description character to a colour, or `-1` if invalid.
 * `'0'..'9'` → `0..9`; `'A'..'Z'` → `10..35` (upstream `validate_desc`). */
export function decodeColourChar(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 90) return 10 + (code - 65);
  return -1;
}

// --- desc -------------------------------------------------------------

export function validateDesc(p: FloodParams, desc: string): string | null {
  const wh = p.w * p.h;
  let i = 0;
  for (; i < wh; i++) {
    const ch = desc[i];
    if (ch === undefined) return "Not enough data in grid description";
    const c = decodeColourChar(ch);
    if (c < 0) return "Bad character in grid description";
    if (c >= MAXCOLOURS) return "Colour out of range in grid description";
  }
  if (desc[i] !== ",") return "Expected ',' after grid description";
  i++;
  const rest = desc.slice(i);
  if (!/^\d*$/.test(rest)) return "Badly formatted move limit after grid description";
  return null;
}

export function newState(p: FloodParams, desc: string): FloodState {
  const wh = p.w * p.h;
  const grid = new Uint8Array(wh);
  let colours = 0;
  for (let i = 0; i < wh; i++) {
    const c = decodeColourChar(desc[i]);
    grid[i] = c;
    if (c >= colours) colours = c + 1;
  }
  // desc[wh] is ',' — the move limit follows.
  const movelimit = Number.parseInt(desc.slice(wh + 1), 10) || 0;
  return {
    w: p.w,
    h: p.h,
    colours,
    grid,
    moves: 0,
    movelimit,
    complete: false,
    cheated: false,
  };
}

// --- status -----------------------------------------------------------

/** Faithful port of upstream `game_status`: victory only within the
 * limit; defeat once the move count reaches the limit (whether or not
 * the grid is one colour — completing *over* the limit is still a
 * defeat, exactly as upstream); else ongoing. */
export function status(state: FloodState): GameStatus {
  if (state.complete && state.moves <= state.movelimit) return "solved";
  if (state.moves >= state.movelimit) return "lost";
  return "ongoing";
}

// --- text format ------------------------------------------------------

export function textFormat(state: FloodState): string {
  const { w, h, grid } = state;
  const lines: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) row += encodeColourChar(grid[y * w + x]);
    lines.push(row);
  }
  return `${lines.join("\n")}\n`;
}

// --- generator --------------------------------------------------------

/** Faithful port of upstream `new_game_desc`: invent a random grid
 * (re-rolling an already-complete one), run the heuristic solver to
 * count the moves it needs, and set the move limit to that count plus
 * the leniency. The grid reproduces bit-for-bit from `random.ts`; the
 * limit reproduces only if the TS solver makes the same choices as C
 * (see design D-RISK / the differential test). */
export function newDesc(p: FloodParams, rng: RandomState): { desc: string } {
  const { w, h, colours, leniency } = p;
  const wh = w * h;
  const scratch = new SolverScratch(w, h);

  const grid = new Uint8Array(wh);
  do {
    for (let i = 0; i < wh; i++) grid[i] = randomUpto(rng, colours);
  } while (completed(grid));

  // Run the solver on a copy, counting its moves.
  const work = Uint8Array.from(grid);
  let moves = 0;
  while (!completed(work)) {
    const move = choosemove(w, h, work, FILLX, FILLY, colours, scratch);
    fill(w, h, work, FILLX, FILLY, move, scratch.queue0);
    moves++;
  }
  moves += leniency;

  let desc = "";
  for (let i = 0; i < wh; i++) desc += encodeColourChar(grid[i]);
  desc += `,${moves}`;
  return { desc };
}
