/**
 * Inertia — types, codec and the slide rule.
 *
 * The board is a grid of five cell kinds; a single ball slides in one of
 * eight directions until something stops it, collecting gems and dying on
 * mines. The state is immutable: `executeMove` (in `index.ts`) builds a new
 * one, and a clone shares the installed route by reference (GC replaces
 * upstream's refcount on `struct soln`).
 */

import { parseDimensions } from "../../engine/params.ts";

// --- cells -----------------------------------------------------------

/** Cell kinds. The numeric values are ours; the desc characters below are
 * upstream's and are what a game ID carries. */
export const BLANK = 0;
export const GEM = 1;
export const MINE = 2;
export const STOP = 3;
export const WALL = 4;

export type Cell = typeof BLANK | typeof GEM | typeof MINE | typeof STOP | typeof WALL;

/** Desc characters, indexed by cell kind. `S` (start) appears only in a desc
 * — `newState` turns it into a `STOP` with the ball on it. */
const CELL_CHARS = "bgmsw";
const START_CHAR = "S";

function charToCell(c: string): Cell | null {
  const i = CELL_CHARS.indexOf(c);
  return i < 0 ? null : (i as Cell);
}

// --- directions ------------------------------------------------------

/** The eight directions, clockwise from north — upstream's `DX`/`DY` macros,
 * which do the same thing with bit arithmetic on the direction number. */
export const DIRECTIONS = 8;
export const DX = [0, 1, 1, 1, 0, -1, -1, -1] as const;
export const DY = [-1, -1, 0, 1, 1, 1, 0, -1] as const;

// --- params ----------------------------------------------------------

export interface InertiaParams {
  w: number;
  h: number;
}

export const PRESETS: readonly InertiaParams[] = [
  { w: 10, h: 8 },
  { w: 15, h: 12 },
  { w: 20, h: 16 },
];

export function defaultParams(): InertiaParams {
  return { w: 10, h: 8 };
}

export function encodeParams(p: InertiaParams): string {
  return `${p.w}x${p.h}`;
}

export function decodeParams(s: string): InertiaParams {
  const { w, h } = parseDimensions(s);
  return { w, h };
}

export function validateParams(p: InertiaParams): string | null {
  // Degenerate single-row/column grids are excluded: they could be generated
  // but would be extremely boring, and are slow to hit at random.
  if (p.w < 2 || p.h < 2) return "Width and height must both be at least two";
  if (!Number.isSafeInteger(p.w * p.h)) {
    return "Width times height must not be unreasonably large";
  }
  // The generator makes one gem per five squares and needs at least one; an
  // area-five grid is already excluded by the rule above, so six is the floor.
  if (p.w * p.h < 6) return "Grid area must be at least six squares";
  return null;
}

// --- moves and UI ----------------------------------------------------

export type InertiaMove =
  /** Slide the ball in `dir` (0..7). */
  | { type: "move"; dir: number }
  /** Install a solver-computed route, without moving the ball. */
  | { type: "route"; route: readonly number[] };

export interface InertiaUi {
  /** Running tally of self-inflicted deaths. Lives on the Ui (not the state)
   * so undo/redo cannot rewind or re-count it — see design D5. */
  deaths: number;
  /** Set by `interpretMove`, consumed by `changedState`: distinguishes "the
   * player just made this move" from a replay/undo/redo, so only a fresh
   * death is counted. */
  justMadeMove: boolean;
  /** True while the currently-animating move is the one that killed the ball
   * — the status bar hides that death from the tally until it has played out. */
  justDied: boolean;
  /** Duration of the move being animated, so `redraw` can turn `animTime`
   * into a fraction of the slide. */
  animLength: number;
  /** Which flash (death or win) is playing, as the render flag bits. */
  flashType: number;
}

// --- state -----------------------------------------------------------

export interface InertiaState {
  readonly params: InertiaParams;
  /** `w · h` cells, row-major. */
  readonly grid: Uint8Array;
  readonly px: number;
  readonly py: number;
  readonly gems: number;
  /** Squares traversed by the move that produced this state (drives the
   * slide animation). */
  readonly distanceMoved: number;
  readonly dead: boolean;
  /** The auto-solver has been used on this game. */
  readonly cheated: boolean;
  /** The installed route, as a direction sequence, or null. Frozen and shared
   * by reference across clones — nothing ever mutates it. */
  readonly route: readonly number[] | null;
  /** Index of the route's next step. */
  readonly routePos: number;
}

/** Read a cell, treating everything off the grid as a wall (upstream's `AT`). */
export function at(s: InertiaState, x: number, y: number): Cell {
  const { w, h } = s.params;
  if (x < 0 || x >= w || y < 0 || y >= h) return WALL;
  return s.grid[y * w + x] as Cell;
}

/** As `at`, over a bare grid (used by the solver and generator, which work on
 * grids that are not yet a state). */
export function atGrid(
  grid: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
): Cell {
  if (x < 0 || x >= w || y < 0 || y >= h) return WALL;
  return grid[y * w + x] as Cell;
}

export function cloneState(s: InertiaState): InertiaState {
  return {
    ...s,
    grid: new Uint8Array(s.grid),
    // `route` is frozen and shared by reference — no copy needed.
  };
}

// --- desc codec ------------------------------------------------------

export function validateDesc(p: InertiaParams, desc: string): string | null {
  const wh = p.w * p.h;
  let starts = 0;
  let gems = 0;

  for (let i = 0; i < wh; i++) {
    if (i >= desc.length) return "Not enough data to fill grid";
    const c = desc[i];
    if (c === START_CHAR) {
      starts++;
    } else if (charToCell(c) === null) {
      return "Unrecognised character in game description";
    } else if (c === CELL_CHARS[GEM]) {
      gems++;
    }
  }
  if (desc.length > wh) return "Too much data to fill grid";
  if (starts < 1) return "No starting square specified";
  if (starts > 1) return "More than one starting square specified";
  if (gems < 1) return "No gems specified";

  return null;
}

export function newState(p: InertiaParams, desc: string): InertiaState {
  const wh = p.w * p.h;
  const grid = new Uint8Array(wh);
  let px = -1;
  let py = -1;
  let gems = 0;

  for (let i = 0; i < wh; i++) {
    const c = desc[i];
    if (c === START_CHAR) {
      // The start square is a stop square with the ball standing on it.
      grid[i] = STOP;
      px = i % p.w;
      py = Math.floor(i / p.w);
    } else {
      const cell = charToCell(c);
      if (cell === null) throw new Error(`bad desc character ${c}`);
      grid[i] = cell;
      if (cell === GEM) gems++;
    }
  }

  return {
    params: p,
    grid,
    px,
    py,
    gems,
    distanceMoved: 0,
    dead: false,
    cheated: false,
    route: null,
    routePos: 0,
  };
}

/** Render a grid (with a `START` cell) as a desc string. Used by the generator. */
export function encodeGrid(grid: Uint8Array, startIndex: number): string {
  let out = "";
  for (let i = 0; i < grid.length; i++) {
    out += i === startIndex ? START_CHAR : CELL_CHARS[grid[i]];
  }
  return out;
}

// --- text format -----------------------------------------------------

export function textFormat(s: InertiaState): string {
  const { w, h } = s.params;
  const cw = 4;
  const ch = 2;
  const gw = cw * w + 2;
  const gh = ch * h + 1;
  const board: string[] = new Array(gw * gh).fill(" ");

  const put = (i: number, text: string): void => {
    for (let k = 0; k < text.length; k++) board[i + k] = text[k];
  };

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = r * ch * gw + cw * c;
      const centre = cell + (gw * ch) / 2 + cw / 2;
      switch (s.grid[r * w + c]) {
        case GEM:
          board[centre] = "o";
          break;
        case MINE:
          board[centre] = "M";
          break;
        case STOP:
          board[centre - 1] = "(";
          board[centre + 1] = ")";
          break;
        case WALL:
          put(centre - 1, "XXX");
          break;
      }

      if (r === s.py && c === s.px) {
        if (!s.dead) board[centre] = "@";
        else put(centre - 1, ":-(");
      }

      board[cell] = "+";
      for (let k = 1; k < cw; k++) board[cell + k] = "-";
      for (let k = 1; k < ch; k++) board[cell + k * gw] = "|";
    }
    for (let c = 0; c < ch; c++) {
      board[(r * ch + c) * gw + gw - 2] = c === 0 ? "+" : "|";
      board[(r * ch + c) * gw + gw - 1] = "\n";
    }
  }

  // The closing rule along the bottom, its corners, and the final newline.
  const len = gw * gh;
  for (let k = 0; k < gw - 2; k++) board[len - gw + k] = "-";
  for (let c = 0; c < w; c++) board[len - gw + cw * c] = "+";
  board[len - 2] = "+";
  board[len - 1] = "\n";

  return board.join("");
}
