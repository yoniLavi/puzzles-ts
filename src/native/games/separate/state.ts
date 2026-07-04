/**
 * Separate ("Block Puzzle") — state, params, desc codec, completion test.
 *
 * Every cell holds one of `k` letters (each occurring `w·h/k` times); the
 * player draws walls so the grid divides into connected `k`-ominoes, each
 * containing exactly one of each letter. Upstream (`separate.c`) only ever
 * wrote the solver/generator — the whole frontend is ours. We adopt Palisade's
 * mature wall model wholesale, since the task (partition the grid by drawing
 * walls) is identical; the difference is the cell content (a letter, not a
 * wall-count clue) and the win condition (one of each letter per region).
 *
 * Border encoding is Palisade's `borderflag` byte, kept verbatim: per cell, low
 * nibble bits 0..3 are walls on the U/R/D/L edges, high nibble bits 4..7 are
 * "no-wall" marks. An edge is three-valued (wall / no-wall-mark / unknown) and
 * shared between the two cells it separates, so every edit records both sides.
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import { Dsf } from "../../engine/dsf.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions, parseLeadingInt } from "../../engine/params.ts";

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

export const DX = [0, +1, 0, -1] as const;
export const DY = [-1, 0, +1, 0] as const;

export function outOfBounds(x: number, y: number, w: number, h: number): boolean {
  return x < 0 || x >= w || y < 0 || y >= h;
}

// --- types ----------------------------------------------------------------

export interface SeparateParams {
  w: number;
  h: number;
  k: number;
}

export interface SeparateState {
  w: number;
  h: number;
  k: number;
  /** length w·h, letter index 0..k-1 per cell. Shared (frozen) across clones. */
  letters: Uint8Array;
  /** length w·h, the `borderflag` byte per cell. */
  borders: Uint8Array;
  completed: boolean;
  cheated: boolean;
}

export type SeparateMove =
  | { type: "edges"; edits: ReadonlyArray<{ x: number; y: number; flag: number }> }
  | { type: "solve"; borders: number[] };

export interface SeparateUi {
  /** Half-grid cursor coordinates (Palisade's scheme): (0,0) is the top-left
   * grid corner, (1,1) the centre of the top-left cell; odd/even distinguishes
   * centre/edge/corner. Range [1, 2w-1] × [1, 2h-1]. */
  x: number;
  y: number;
  show: boolean;
}

export interface SeparateMistake {
  x: number;
  y: number;
  /** Direction (0=U,1=R,2=D,3=L) of the offending edge. */
  dir: number;
}

// --- params ---------------------------------------------------------------

const PRESETS: SeparateParams[] = [
  { w: 4, h: 4, k: 4 },
  { w: 5, h: 5, k: 5 },
  { w: 6, h: 6, k: 4 },
  { w: 6, h: 6, k: 6 },
];

export function defaultParams(): SeparateParams {
  return { ...PRESETS[1] };
}

export function presets(): PresetMenu<SeparateParams> {
  return {
    title: "Size",
    submenu: PRESETS.map((p) => ({
      title: `${p.w} x ${p.h}, ${p.k} letters`,
      params: { ...p },
    })),
  };
}

export function encodeParams(p: SeparateParams, _full: boolean): string {
  return `${p.w}x${p.h}n${p.k}`;
}

export function decodeParams(s: string): SeparateParams {
  // Upstream: w = h = k = atoi(s); then optional `x<h>` and `n<k>`. The square
  // fallback (no `x`) also seeds k = w.
  const { w, h, next } = parseDimensions(s);
  const p: SeparateParams = { w, h, k: w };
  if (s[next] === "n") {
    p.k = parseLeadingInt(s, next + 1).value;
  }
  return p;
}

export function validateParams(p: SeparateParams, full: boolean): string | null {
  const { w, h, k } = p;
  if (w < 1) return "Width must be at least one";
  if (h < 1) return "Height must be at least one";
  if (k < 1) return "Number of letters must be at least one";
  // Width times height must not be unreasonably large.
  if (w > 0x7fffffff / h) return "Width times height must not be unreasonably large";
  const wh = w * h;
  if (wh % k) return "Number of letters must divide the grid area";
  if (!full) return null;
  if (k > 26) return "Number of letters must be at most 26";
  if (k === wh) return "Number of letters must be less than the grid area";
  if (k === 1) return "Number of letters must be at least two";
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
 * Connected components along `borders`. `black=true`: merge across an edge with
 * no wall (the regions the walls divide the grid into). `black=false`: merge
 * across an edge explicitly marked no-wall (the "definitely one region"
 * components used for live error highlighting).
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
 * A state is solved iff the walls divide the grid into components each of size
 * `k`, each containing every letter exactly once, and no wall lies within a
 * single component (no stray border). Size `k` + `k` letters present ⟺ one of
 * each, so a per-region letter-seen bitmap suffices.
 */
export function isSolved(
  w: number,
  h: number,
  k: number,
  letters: Uint8Array,
  borders: Uint8Array,
): boolean {
  const wh = w * h;
  const dsf = buildDsf(w, h, borders, true);

  // Per-canonical-root letter bitmap; a repeated letter fails immediately.
  const seen = new Map<number, number>();
  for (let i = 0; i < wh; i++) {
    const root = dsf.canonify(i);
    if (dsf.size(root) !== k) return false;
    const bit = 1 << letters[i];
    const cur = seen.get(root) ?? 0;
    if (cur & bit) return false; // duplicate letter in this region
    seen.set(root, cur | bit);
  }

  // No wall interior to a region.
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

const A = "A".charCodeAt(0);

/** The desc is simply the `w·h` letters, each `A + letters[i]`. */
export function encodeDesc(letters: Uint8Array, wh: number): string {
  let out = "";
  for (let i = 0; i < wh; i++) out += String.fromCharCode(A + letters[i]);
  return out;
}

export function validateDesc(p: SeparateParams, desc: string): string | null {
  const wh = p.w * p.h;
  if (desc.length !== wh) return "Description is the wrong length";
  for (const ch of desc) {
    const v = ch.charCodeAt(0) - A;
    if (v < 0 || v >= p.k) return `Invalid character in data: '${ch}'`;
  }
  return null;
}

export function newState(p: SeparateParams, desc: string): SeparateState {
  const { w, h, k } = p;
  const wh = w * h;
  const letters = new Uint8Array(wh);
  for (let i = 0; i < wh && i < desc.length; i++) {
    letters[i] = desc.charCodeAt(i) - A;
  }
  return {
    w,
    h,
    k,
    letters,
    borders: initBorders(w, h),
    completed: false,
    cheated: false,
  };
}

export function cloneState(state: SeparateState): SeparateState {
  return {
    w: state.w,
    h: state.h,
    k: state.k,
    letters: state.letters, // shared, frozen
    borders: state.borders.slice(),
    completed: state.completed,
    cheated: state.cheated,
  };
}

// --- move execution -------------------------------------------------------

export function executeMove(state: SeparateState, move: SeparateMove): SeparateState {
  const { w, h, k } = state;
  const wh = w * h;
  const ret = cloneState(state);

  if (move.type === "solve") {
    if (move.borders.length !== wh) throw new Error("separate: bad solve move");
    ret.borders = Uint8Array.from(move.borders);
    ret.cheated = true;
    ret.completed = true;
    return ret;
  }

  for (const { x, y, flag } of move.edits) {
    if (outOfBounds(x, y, w, h)) throw new Error("separate: move out of bounds");
    for (let dir = 0; dir < 4; dir++) {
      // No toggling the walls of the grid rim.
      if (flag & BORDER(dir) && outOfBounds(x + DX[dir], y + DY[dir], w, h))
        throw new Error("separate: cannot toggle grid-rim wall");
    }
    ret.borders[y * w + x] ^= flag;
  }

  // Recompute completion every move (Palisade's deliberate divergence): breaking
  // a solved board reverts to unsolved so a later genuine re-completion is a real
  // transition the win flash can fire on. `cheated` stays sticky.
  ret.completed = isSolved(w, h, k, ret.letters, ret.borders);
  return ret;
}

export function status(state: SeparateState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

// --- text format ----------------------------------------------------------

export function textFormat(state: SeparateState): string {
  const { w, h, letters, borders } = state;
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

      board[center] = String.fromCharCode(A + letters[i]);
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
