/**
 * Palisade — state, params, desc codec, completion test.
 *
 * Clues count the walls around a cell; the player draws walls so the
 * grid divides into connected regions of exactly `k` cells, each clue
 * equal to its cell's wall count. The substance (solver, generator) is
 * in `solver.ts`/`divvy.ts`; this module owns the data model.
 *
 * Border encoding is upstream's `borderflag` byte kept verbatim (the
 * Mosaic precedent): per cell, low nibble bits 0..3 are walls on the
 * U/R/D/L edges, high nibble bits 4..7 are "no-wall" marks. An edge is
 * three-valued (wall / no-wall-mark / unknown) and shared between the
 * two cells it separates, so every edit records both sides.
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import { Dsf } from "../../engine/dsf.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseLeadingInt } from "../../engine/params.ts";

// --- border-flag constants ------------------------------------------------

export const BORDER_U = 1;
export const BORDER_R = 2;
export const BORDER_D = 4;
export const BORDER_L = 8;
export const BORDER_MASK = BORDER_U | BORDER_R | BORDER_D | BORDER_L;

/** A wall on edge `dir` (0=U,1=R,2=D,3=L). */
export const BORDER = (dir: number): number => 1 << dir;
/** The "no-wall" mark for a wall bit (high nibble). */
export const DISABLED = (border: number): number => border << 4;
/** Opposite direction (U↔D, R↔L). */
export const FLIP = (dir: number): number => dir ^ 2;

/** Clue sentinel: no clue shown in this cell. */
export const EMPTY = -1;

export const DX = [0, +1, 0, -1] as const;
export const DY = [-1, 0, +1, 0] as const;

const BITCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;
/** Number of walls enabled in a border byte. */
export function bitcount(flags: number): number {
  return BITCOUNT[flags & BORDER_MASK];
}

export function outOfBounds(x: number, y: number, w: number, h: number): boolean {
  return x < 0 || x >= w || y < 0 || y >= h;
}

// --- types ----------------------------------------------------------------

export interface PalisadeParams {
  w: number;
  h: number;
  k: number;
}

export interface PalisadeState {
  w: number;
  h: number;
  k: number;
  /** length w·h, `EMPTY` or 0..4. Shared (frozen) across cloned states. */
  clues: Int8Array;
  /** length w·h, the `borderflag` byte per cell. */
  borders: Uint8Array;
  completed: boolean;
  cheated: boolean;
}

export type PalisadeMove =
  | { type: "edges"; edits: ReadonlyArray<{ x: number; y: number; flag: number }> }
  | { type: "solve"; borders: number[] };

export interface PalisadeUi {
  /** Half-grid cursor coordinates: (0,0) is the top-left grid corner,
   * (1,1) the centre of the top-left cell; odd/even distinguishes
   * centre/edge/corner. Range [1, 2w-1] × [1, 2h-1]. */
  x: number;
  y: number;
  show: boolean;
}

export interface PalisadeMistake {
  x: number;
  y: number;
  /** Direction (0=U,1=R,2=D,3=L) of the offending edge. */
  dir: number;
}

// --- params ---------------------------------------------------------------

const PRESETS: PalisadeParams[] = [
  { w: 5, h: 5, k: 5 },
  { w: 8, h: 6, k: 6 },
  { w: 10, h: 8, k: 8 },
  { w: 15, h: 12, k: 10 },
];

export function defaultParams(): PalisadeParams {
  return { ...PRESETS[0] };
}

export function presets(): PresetMenu<PalisadeParams> {
  return {
    title: "Size",
    submenu: PRESETS.map((p) => ({
      title: `${p.w} x ${p.h}, regions of size ${p.k}`,
      params: { ...p },
    })),
  };
}

export function encodeParams(p: PalisadeParams, _full: boolean): string {
  return `${p.w}x${p.h}n${p.k}`;
}

export function decodeParams(s: string): PalisadeParams {
  // Upstream: w = h = k = atoi(s); then optional `x<h>` and `n<k>`.
  const first = parseLeadingInt(s, 0);
  const p: PalisadeParams = { w: first.value, h: first.value, k: first.value };
  let i = first.next;
  if (s[i] === "x") {
    const hh = parseLeadingInt(s, i + 1);
    p.h = hh.value;
    i = hh.next;
  }
  if (s[i] === "n") {
    p.k = parseLeadingInt(s, i + 1).value;
  }
  return p;
}

export function validateParams(p: PalisadeParams, full: boolean): string | null {
  const { w, h, k } = p;
  if (k < 1) return "Region size must be at least one";
  if (w < 1) return "Width must be at least one";
  if (h < 1) return "Height must be at least one";
  // Width times height must not be unreasonably large.
  if (w > 0x7fffffff / h) return "Width times height must not be unreasonably large";
  const wh = w * h;
  if (wh % k) return "Region size must divide grid area";
  if (!full) return null;
  if (k === wh) return "Region size must be less than the grid area";
  if (k === 2 && w !== 1 && h !== 1)
    return "Region size can't be two unless width or height is one";
  return null;
}

// --- borders --------------------------------------------------------------

/** A fresh border byte array with only the grid-rim walls set. */
export function initBorders(w: number, h: number): Uint8Array {
  const borders = new Uint8Array(w * h);
  const wh = w * h;
  for (let c = 0; c < w; c++) {
    borders[c] |= BORDER_U;
    borders[wh - 1 - c] |= BORDER_D;
  }
  for (let r = 0; r < h; r++) {
    borders[r * w] |= BORDER_L;
    borders[wh - 1 - r * w] |= BORDER_R;
  }
  return borders;
}

/**
 * Connected components along `borders`. `black=true`: merge across an
 * edge with no wall (the regions the walls divide the grid into).
 * `black=false`: merge across an edge explicitly marked no-wall (the
 * "definitely one region" components used for error highlighting).
 */
export function buildDsf(
  w: number,
  h: number,
  borders: Uint8Array,
  black: boolean,
): Dsf {
  const dsf = new Dsf(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (
        x + 1 < w &&
        (black ? !(borders[i] & BORDER_R) : borders[i] & DISABLED(BORDER_R))
      )
        dsf.merge(i, i + 1);
      if (
        y + 1 < h &&
        (black ? !(borders[i] & BORDER_D) : borders[i] & DISABLED(BORDER_D))
      )
        dsf.merge(i, i + w);
    }
  }
  return dsf;
}

/**
 * A state is solved iff the walls divide the grid into components every
 * of size `k`, every clue equals its wall count, and no wall lies
 * within a single component (no stray border).
 */
export function isSolved(
  w: number,
  h: number,
  k: number,
  clues: Int8Array,
  borders: Uint8Array,
): boolean {
  const wh = w * h;
  const dsf = buildDsf(w, h, borders, true);

  for (let i = 0; i < wh; i++) {
    if (dsf.size(i) !== k) return false;
    if (clues[i] === EMPTY) continue;
    if (clues[i] !== bitcount(borders[i])) return false;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w && borders[i] & BORDER_R && dsf.equivalent(i, i + 1)) return false;
      if (y + 1 < h && borders[i] & BORDER_D && dsf.equivalent(i, i + w)) return false;
    }
  }
  return true;
}

// --- desc codec -----------------------------------------------------------

const A = "a".charCodeAt(0);

/** Run-length encode the clue grid: digit per clue, letter run per
 * clueless gap (trailing gap dropped). */
export function encodeDesc(clues: Int8Array, wh: number): string {
  let out = "";
  let run = 0;
  for (let i = 0; i < wh; i++) {
    if (clues[i] !== EMPTY) {
      while (run) {
        while (run > 26) {
          out += "z";
          run -= 26;
        }
        out += String.fromCharCode(A - 1 + run);
        run = 0;
      }
      out += String(clues[i]);
    } else run++;
  }
  return out;
}

export function validateDesc(p: PalisadeParams, desc: string): string | null {
  const wh = p.w * p.h;
  let squares = 0;
  for (const ch of desc) {
    if (ch >= "a" && ch <= "z") {
      squares += ch.charCodeAt(0) - A + 1;
    } else if (ch >= "0" && ch <= "9") {
      if (ch > "4") return `Invalid (too large) number: '${ch}'`;
      squares++;
    } else {
      return `Invalid character in data: '${ch}'`;
    }
  }
  if (squares > wh) return "Data describes too many squares";
  return null;
}

export function newState(p: PalisadeParams, desc: string): PalisadeState {
  const { w, h, k } = p;
  const wh = w * h;
  const clues = new Int8Array(wh).fill(EMPTY);
  let i = 0;
  for (const ch of desc) {
    if (ch >= "0" && ch <= "9") {
      clues[i++] = ch.charCodeAt(0) - 48;
    } else if (ch >= "a" && ch <= "z") {
      i += ch.charCodeAt(0) - A + 1;
    }
  }
  return {
    w,
    h,
    k,
    clues,
    borders: initBorders(w, h),
    completed: k === wh,
    cheated: false,
  };
}

export function cloneState(state: PalisadeState): PalisadeState {
  return {
    w: state.w,
    h: state.h,
    k: state.k,
    clues: state.clues, // shared, frozen
    borders: state.borders.slice(),
    completed: state.completed,
    cheated: state.cheated,
  };
}

// --- move execution -------------------------------------------------------

export function executeMove(state: PalisadeState, move: PalisadeMove): PalisadeState {
  const { w, h, k } = state;
  const wh = w * h;
  const ret = cloneState(state);

  if (move.type === "solve") {
    if (move.borders.length !== wh) throw new Error("palisade: bad solve move");
    ret.borders = Uint8Array.from(move.borders);
    ret.cheated = true;
    ret.completed = true;
    return ret;
  }

  for (const { x, y, flag } of move.edits) {
    if (outOfBounds(x, y, w, h)) throw new Error("palisade: move out of bounds");
    for (let dir = 0; dir < 4; dir++) {
      // No toggling the walls of the grid rim.
      if (flag & BORDER(dir) && outOfBounds(x + DX[dir], y + DY[dir], w, h))
        throw new Error("palisade: cannot toggle grid-rim wall");
    }
    ret.borders[y * w + x] ^= flag;
  }

  if (!ret.completed) ret.completed = isSolved(w, h, k, ret.clues, ret.borders);
  return ret;
}

export function status(state: PalisadeState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

// --- text format ----------------------------------------------------------

export function textFormat(state: PalisadeState): string {
  const { w, h, clues, borders } = state;
  const cw = 4;
  const ch = 2;
  const gw = cw * w + 2;
  const gh = ch * h + 1;
  const len = gw * gh;
  const board = new Array<string>(len).fill(" ");

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = r * ch * gw + cw * c;
      const center = cell + (gw * ch) / 2 + cw / 2;
      const i = r * w + c;
      const clue = clues[i];

      if (clue !== EMPTY) board[center] = String(clue);
      board[cell] = "+";

      if (borders[i] & BORDER_U) {
        for (let j = 1; j < cw; j++) board[cell + j] = "-";
      } else if (borders[i] & DISABLED(BORDER_U)) {
        board[cell + cw / 2] = "x";
      }

      if (borders[i] & BORDER_L) board[cell + gw] = "|";
      else if (borders[i] & DISABLED(BORDER_L)) board[cell + gw] = "x";
    }
    for (let c = 0; c < ch; c++) {
      board[(r * ch + c) * gw + gw - 2] = c ? "|" : "+";
      board[(r * ch + c) * gw + gw - 1] = "\n";
    }
  }
  // Bottom rim: copy the first row's '+'/'-' pattern.
  for (let j = 0; j < gw; j++) board[len - gw + j] = board[j];
  return board.join("");
}
