/**
 * Types and pure state helpers for Singles (Hitori) — port of the
 * state/codec parts of `singles.c`.
 *
 * Each cell carries an immutable number (`nums`, 1..max(w,h)) and a
 * mutable `flags` bitmask (black / circle / error / solver-scratch). A
 * correctly completed board: no number repeats among the white (non-black)
 * cells of any row or column, no two black cells are orthogonally
 * adjacent, and the white cells form one connected region.
 */

/** Difficulty: upstream DIFF_EASY / DIFF_TRICKY. */
export type Difficulty = "easy" | "tricky";

/** Numeric difficulty levels, mirroring the C `enum`. `ANY` is the
 * "return whatever the solver reaches" level used by Solve / findMistakes. */
export const DIFF_EASY = 0;
export const DIFF_TRICKY = 1;
export const DIFF_MAX = 2;
export const DIFF_ANY = 3;

const DIFF_CHARS = "ek"; // singles_diffchars, indexed by level
const DIFF_NAMES = ["Easy", "Tricky"];

export function diffToLevel(d: Difficulty): number {
  return d === "tricky" ? DIFF_TRICKY : DIFF_EASY;
}
export function diffFromLevel(level: number): Difficulty {
  return level === DIFF_TRICKY ? "tricky" : "easy";
}
export function diffChar(d: Difficulty): string {
  return DIFF_CHARS[diffToLevel(d)];
}
export function diffName(d: Difficulty): string {
  return DIFF_NAMES[diffToLevel(d)];
}

// Cell flag bits (upstream F_*).
export const F_BLACK = 0x1;
export const F_CIRCLE = 0x2;
export const F_ERROR = 0x4;
export const F_SCRATCH = 0x8;

export interface SinglesParams {
  w: number;
  h: number;
  diff: Difficulty;
}

export interface SinglesState {
  w: number;
  h: number;
  /** w*h. */
  n: number;
  /** max(w, h) — the number alphabet size. */
  o: number;
  completed: boolean;
  usedSolve: boolean;
  impossible: boolean;
  /** Immutable per-cell numbers, shared by reference across states. */
  nums: Int8Array;
  /** Mutable per-cell flags, cloned per move. */
  flags: Uint8Array;
}

/** A single cell edit: black, circle (white mark), or empty. */
export type CellValue = "black" | "circle" | "empty";

export interface SinglesMove {
  sets: { x: number; y: number; value: CellValue }[];
  /** Set when this move is the Solve auto-fill. */
  solve?: boolean;
}

export interface SinglesUi {
  cx: number;
  cy: number;
  cshow: boolean;
  showBlackNums: boolean;
}

// --- number <-> character codec (upstream n2c / c2n) -----------------------

export function n2c(num: number): string {
  if (num < 10) return String.fromCharCode(48 + num); // '0'..'9'
  if (num < 10 + 26) return String.fromCharCode(97 + num - 10); // 'a'..'z'
  return String.fromCharCode(65 + num - 10 - 26); // 'A'..'Z'
}

export function c2n(c: string): number {
  const code = c.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 122) return code - 97 + 10;
  if (code >= 65 && code <= 90) return code - 65 + 10 + 26;
  return -1;
}

// --- params codec ----------------------------------------------------------

export function defaultParams(): SinglesParams {
  return { w: 5, h: 5, diff: "easy" };
}

export function encodeParams(p: SinglesParams, full: boolean): string {
  return full ? `${p.w}x${p.h}d${diffChar(p.diff)}` : `${p.w}x${p.h}`;
}

export function decodeParams(s: string): SinglesParams {
  const p = defaultParams();
  let i = 0;
  let digits = "";
  while (i < s.length && s[i] >= "0" && s[i] <= "9") digits += s[i++];
  p.w = p.h = digits ? Number.parseInt(digits, 10) : p.w;
  if (s[i] === "x") {
    i++;
    digits = "";
    while (i < s.length && s[i] >= "0" && s[i] <= "9") digits += s[i++];
    if (digits) p.h = Number.parseInt(digits, 10);
  }
  if (s[i] === "d") {
    i++;
    const idx = DIFF_CHARS.indexOf(s[i] ?? "");
    p.diff = idx >= 0 ? diffFromLevel(idx) : p.diff;
  }
  return p;
}

const MAX_DIM = 10 + 26 + 26;

export function validateParams(p: SinglesParams, _full: boolean): string | null {
  if (p.w < 2 || p.h < 2) return "Width and height must be at least two";
  if (p.w > MAX_DIM || p.h > MAX_DIM) return "Puzzle is too large";
  return null;
}

// --- state construction ----------------------------------------------------

export function makeState(w: number, h: number, nums: Int8Array): SinglesState {
  return {
    w,
    h,
    n: w * h,
    o: Math.max(w, h),
    completed: false,
    usedSolve: false,
    impossible: false,
    nums,
    flags: new Uint8Array(w * h),
  };
}

export function cloneState(s: SinglesState): SinglesState {
  return {
    w: s.w,
    h: s.h,
    n: s.n,
    o: s.o,
    completed: s.completed,
    usedSolve: s.usedSolve,
    impossible: s.impossible,
    nums: s.nums, // immutable, shared
    flags: s.flags.slice(),
  };
}

// --- desc codec ------------------------------------------------------------

export function validateDesc(p: SinglesParams, desc: string): string | null {
  const n = p.w * p.h;
  const o = Math.max(p.w, p.h);
  if (desc.length !== n) return "Game description is wrong length";
  for (let i = 0; i < n; i++) {
    const num = c2n(desc[i]);
    if (num <= 0 || num > o) return "Game description contains unexpected characters";
  }
  return null;
}

export function newState(p: SinglesParams, desc: string): SinglesState {
  const n = p.w * p.h;
  const nums = new Int8Array(n);
  for (let i = 0; i < n; i++) nums[i] = c2n(desc[i]);
  return makeState(p.w, p.h, nums);
}

export function encodeDesc(s: SinglesState): string {
  let out = "";
  for (let i = 0; i < s.n; i++) out += n2c(s.nums[i]);
  return out;
}

export function status(s: SinglesState): "solved" | "ongoing" {
  return s.completed ? "solved" : "ongoing";
}

// --- text format (upstream game_text_format) -------------------------------

export function textFormat(s: SinglesState): string {
  let out = "";
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      if (x > 0) out += " ";
      out += s.flags[i] & F_BLACK ? "*" : n2c(s.nums[i]);
    }
    out += "\n";
    for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      if (x > 0) out += " ";
      out += s.flags[i] & F_CIRCLE ? "~" : " ";
    }
    out += "\n";
  }
  return out;
}
