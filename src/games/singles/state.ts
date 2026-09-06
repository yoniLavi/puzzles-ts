import { c2n, DESC_ALPHABET_SIZE, n2c } from "../../engine/desc-alphabet.ts";
import { tierNames } from "../../engine/difficulty.ts";
import type { ParamConfigItem } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import { choice, dims, paramsCodec } from "../../engine/params-codec.ts";
import type { GridCursor } from "../../engine/pointer.ts";
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
export const DIFF_NAMES = tierNames(2);

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
  cheated: boolean;
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
  cursor: GridCursor;
  showBlackNums: boolean;
}

// --- params codec ----------------------------------------------------------

export function defaultParams(): SinglesParams {
  return { w: 5, h: 5, diff: "easy" };
}

/** The "Custom type…" form, and the field list the codec below encodes. The
 * difficulty accessors convert to and from this game's string tier union, so
 * the codec never has to know how a tier is represented. */
export const paramConfig: ParamConfigItem<SinglesParams>[] = [
  ...dimensionParamConfig<SinglesParams>(),
  {
    kw: "difficulty",
    name: "Difficulty",
    type: "choices",
    choices: [...DIFF_NAMES],
    get: (p) => diffToLevel(p.diff),
    set: (p, v) => {
      p.diff = diffFromLevel(v);
    },
  },
];

/** `WxH`, plus the generator-only difficulty letter. An unknown letter leaves
 * the default tier. */
export const { encodeParams, decodeParams } = paramsCodec(defaultParams, [
  dims(paramConfig),
  choice(paramConfig, "d", "difficulty", DIFF_CHARS, { full: true }),
]);

/**
 * The largest grid whose numbers the desc alphabet can write.
 *
 * A cell holds `1..max(w, h)` and the alphabet's 62 slots run `0..61`, so the
 * largest number expressible is 61 — **one less than upstream's bound**, which
 * is `10+26+26` written out. At exactly 62 the encoder walked off the end of
 * `A`–`Z` into `[`, which `c2n` reads back as `-1` and `validateDesc` then
 * rejects: a 62×62 board generated a description the game refused to load. The
 * bound is derived from the alphabet now, so it cannot drift from it again.
 */
const MAX_DIM = DESC_ALPHABET_SIZE - 1;

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
    cheated: false,
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
    cheated: s.cheated,
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
