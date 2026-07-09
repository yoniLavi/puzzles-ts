/**
 * dominosa — state, params, desc codec.
 *
 * A Dominosa board is an `(n+2) × (n+1)` grid of clue numbers (each `0…n`).
 * The player partitions it into 2×1 dominoes so the placed set is exactly the
 * `DCOUNT(n)` distinct number-pairs `0-0 … n-n`, one of each. `w·h = 2·DCOUNT`,
 * so a full cover uses every square.
 *
 * State layout mirrors upstream: the clue `numbers` are immutable once the game
 * is made (shared frozen across all states), while `grid` (each square → its
 * domino partner, or itself when unpaired) and `edges` (barrier annotations)
 * are cloned per move.
 */

import type { PresetMenu } from "../../engine/game.ts";

// --- combinatorial helpers (upstream TRI / DCOUNT / DINDEX macros) ----------

/** nth triangular number. */
export const TRI = (n: number): number => (n * (n + 1)) / 2;
/** Number of distinct dominoes for maximum face value `n`. */
export const DCOUNT = (n: number): number => TRI(n + 1);
/** Map an unordered number pair to its unique domino index (0 upward). */
export const DINDEX = (a: number, b: number): number =>
  TRI(Math.max(a, b)) + Math.min(a, b);

// --- barrier-edge bits (upstream EDGE_*) ------------------------------------

export const EDGE_L = 0x100;
export const EDGE_R = 0x200;
export const EDGE_T = 0x400;
export const EDGE_B = 0x800;

// --- difficulty -------------------------------------------------------------

export const DIFF_TRIVIAL = 0;
export const DIFF_BASIC = 1;
export const DIFF_HARD = 2;
export const DIFF_EXTREME = 3;
export const DIFF_AMBIGUOUS = 4;
export const DIFFCOUNT = 5;

/** Names in enum order (upstream `dominosa_diffnames`). */
export const DIFF_NAMES = ["Trivial", "Basic", "Hard", "Extreme", "Ambiguous"];
/** Encoding chars in enum order (upstream `dominosa_diffchars`). */
export const DIFF_CHARS = "tbhea";

// --- params -----------------------------------------------------------------

export interface DominosaParams {
  /** Maximum face number on a domino. */
  n: number;
  diff: number;
}

export function defaultParams(): DominosaParams {
  return { n: 6, diff: DIFF_BASIC };
}

const PRESETS: ReadonlyArray<readonly [number, number]> = [
  [3, DIFF_TRIVIAL],
  [4, DIFF_TRIVIAL],
  [5, DIFF_TRIVIAL],
  [6, DIFF_TRIVIAL],
  [4, DIFF_BASIC],
  [5, DIFF_BASIC],
  [6, DIFF_BASIC],
  [7, DIFF_BASIC],
  [8, DIFF_BASIC],
  [9, DIFF_BASIC],
  [6, DIFF_HARD],
  [6, DIFF_EXTREME],
];

export function presets(): PresetMenu<DominosaParams> {
  return {
    title: "Dominosa",
    submenu: PRESETS.map(([n, diff]) => ({
      title: `Order ${n}, ${DIFF_NAMES[diff]}`,
      params: { n, diff },
    })),
  };
}

export function encodeParams(p: DominosaParams, full: boolean): string {
  let s = `${p.n}`;
  if (full) s += `d${DIFF_CHARS[p.diff]}`;
  return s;
}

export function decodeParams(str: string): DominosaParams {
  let i = 0;
  let n = 0;
  let sawDigit = false;
  while (i < str.length && str[i] >= "0" && str[i] <= "9") {
    n = n * 10 + (str.charCodeAt(i) - 48);
    sawDigit = true;
    i++;
  }
  if (!sawDigit) n = 6;
  let diff = DIFF_BASIC;
  while (i < str.length) {
    const c = str[i++];
    if (c === "a") {
      // Legacy encoding from before the difficulty system.
      diff = DIFF_AMBIGUOUS;
    } else if (c === "d") {
      diff = DIFFCOUNT + 1; // ...which is invalid, unless a known char follows
      if (i < str.length) {
        const idx = DIFF_CHARS.indexOf(str[i]);
        if (idx >= 0) diff = idx;
        i++;
      }
    }
  }
  return { n, diff };
}

export function validateParams(p: DominosaParams, _full: boolean): string | null {
  if (p.n < 1) return "Maximum face number must be at least one";
  // Mirror upstream's overflow guard against a huge grid.
  const INT_MAX = 0x7fffffff;
  if (p.n > INT_MAX - 2 || p.n + 2 > Math.floor(INT_MAX / (p.n + 1)))
    return "Maximum face number must not be unreasonably large";
  if (p.diff >= DIFFCOUNT) return "Unknown difficulty rating";
  return null;
}

// --- desc codec -------------------------------------------------------------

/** Parse the row-major clue string into `wh` numbers. Shared by `newState`
 * and `validateDesc`; returns the numbers plus a per-character diagnostic. */
function parseNumbers(
  n: number,
  wh: number,
  desc: string,
): { numbers: Int32Array | null; error: string | null } {
  const numbers = new Int32Array(wh);
  let p = 0;
  let error: string | null = null;
  const fail = (msg: string) => {
    if (!error) error = msg;
  };
  for (let i = 0; i < wh; i++) {
    if (p >= desc.length) {
      fail("Game description is too short");
      break;
    }
    let j: number;
    const c = desc[p];
    if (c >= "0" && c <= "9") {
      j = desc.charCodeAt(p) - 48;
      p++;
    } else if (c === "[") {
      p++;
      let k = 0;
      let saw = false;
      while (p < desc.length && desc[p] >= "0" && desc[p] <= "9") {
        k = k * 10 + (desc.charCodeAt(p) - 48);
        saw = true;
        p++;
      }
      j = saw ? k : -1;
      if (desc[p] !== "]") fail("Missing ']' in game description");
      else p++;
    } else {
      j = -1;
      fail("Invalid syntax in game description");
    }
    if (j < 0 || j > n) fail("Number out of range in game description");
    numbers[i] = j;
  }
  if (p < desc.length) fail("Game description is too long");
  return { numbers: error ? null : numbers, error };
}

export function validateDesc(p: DominosaParams, desc: string): string | null {
  const n = p.n;
  const wh = (n + 2) * (n + 1);
  const { numbers, error } = parseNumbers(n, wh, desc);
  if (error || !numbers) return error ?? "Game description is invalid";
  // Number-balance check: every number 0..n must occur exactly n+2 times.
  const occ = new Int32Array(n + 1);
  for (let i = 0; i < wh; i++) occ[numbers[i]]++;
  for (let i = 0; i <= n; i++)
    if (occ[i] !== n + 2) return "Incorrect number balance in game description";
  return null;
}

/** Encode a numbers grid back to the desc string (bracket-escaping ≥10). */
export function encodeNumbers(numbers: Int32Array | number[]): string {
  let s = "";
  for (let i = 0; i < numbers.length; i++) {
    const k = numbers[i];
    s += k < 10 ? String(k) : `[${k}]`;
  }
  return s;
}

// --- state ------------------------------------------------------------------

export interface DominosaState {
  params: DominosaParams;
  w: number;
  h: number;
  /** Frozen clue numbers, `w·h`, shared across all states of this game. */
  numbers: Int32Array;
  /** Each square → its domino partner's index, or itself when unpaired. */
  grid: Int32Array;
  /** Barrier-edge bits (`EDGE_*`) per square. */
  edges: Int32Array;
  completed: boolean;
  cheated: boolean;
}

export function newState(p: DominosaParams, desc: string): DominosaState {
  const n = p.n;
  const w = n + 2;
  const h = n + 1;
  const wh = w * h;
  const { numbers, error } = parseNumbers(n, wh, desc);
  if (error || !numbers) throw new Error(`dominosa: bad desc: ${error}`);
  const grid = new Int32Array(wh);
  for (let i = 0; i < wh; i++) grid[i] = i;
  return {
    params: p,
    w,
    h,
    numbers,
    grid,
    edges: new Int32Array(wh),
    completed: false,
    cheated: false,
  };
}

export function cloneState(s: DominosaState): DominosaState {
  return {
    params: s.params,
    w: s.w,
    h: s.h,
    numbers: s.numbers, // frozen, shared
    grid: s.grid.slice(),
    edges: s.edges.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

export function status(s: DominosaState): "solved" | "ongoing" {
  return s.completed ? "solved" : "ongoing";
}

// --- move / ui / mistake types ----------------------------------------------

export type DominosaMove =
  | { type: "domino"; d1: number; d2: number }
  | { type: "edge"; d1: number; d2: number }
  | { type: "solve"; dominoes: ReadonlyArray<readonly [number, number]> };

export interface DominosaUi {
  /** Half-grid cursor position (`0…2w−2` × `0…2h−2`). */
  curX: number;
  curY: number;
  cursorVisible: boolean;
  /** The two value-highlight slots (a face number, or −1 for empty). */
  highlight1: number;
  highlight2: number;
}

/** A player-placed domino cell that contradicts the unique solution. */
export interface DominosaMistake {
  index: number;
}
