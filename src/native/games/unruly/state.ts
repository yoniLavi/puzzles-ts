/**
 * Unruly state, params, and desc codec — idiomatic TS port of the state
 * half of `unruly.c` (the binary puzzle Binairo / Tohu-wa-Vohu: fill a
 * grid with two colours so no row or column has a run of three equal
 * cells and each row/column holds equally many of each).
 *
 * Colour/value mapping is upstream's and worth stating once: a cell is
 * `EMPTY`, `ONE`, or `ZERO`, where **`ONE` renders dark ("black") and
 * `ZERO` renders light ("white")** (see `render.ts`).
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions } from "../../engine/params.ts";
import { validateCounts, validateRows } from "./solver.ts";

// --- cell values (upstream `enum { EMPTY, N_ONE, N_ZERO, BOGUS }`) -------
// BOGUS is solver-internal only (a temporary fill that doesn't perturb the
// running counts) and never appears in a real state; it lives in solver.ts.
export const EMPTY = 0;
export const ONE = 1;
export const ZERO = 2;
export type Cell = typeof EMPTY | typeof ONE | typeof ZERO;

// --- difficulty (upstream DIFFLIST: Trivial, Easy, Normal) ---------------
export const DIFF_TRIVIAL = 0;
export const DIFF_EASY = 1;
export const DIFF_NORMAL = 2;
export const DIFF_COUNT = 3;
export const DIFF_NAMES = ["Trivial", "Easy", "Normal"] as const;
export const DIFF_CHARS = "ten"; // ENCODE chars, indexed by difficulty

// --- types ---------------------------------------------------------------

export interface UnrulyParams {
  /** Full grid width (even, ≥ 6). */
  w2: number;
  /** Full grid height (even, ≥ 6). */
  h2: number;
  /** Forbid two identical rows / two identical columns. */
  unique: boolean;
  diff: number;
}

export interface UnrulyState {
  readonly w2: number;
  readonly h2: number;
  readonly unique: boolean;
  /** Per-cell value (EMPTY/ONE/ZERO), cloned per move. */
  readonly grid: Uint8Array;
  /** 1 where the cell is a fixed clue; shared by reference across a
   * game's states (upstream's refcounted `common->immutable`). */
  readonly immutable: Uint8Array;
  readonly completed: boolean;
  readonly cheated: boolean;
}

/** A `place` sets one non-immutable cell (upstream `P{c},{x},{y}`); a
 * `solve` applies a full solution grid as a string of `'0'`/`'1'`
 * (upstream `S…`), kept a string so the move is JSON-save-safe. */
export type UnrulyMove =
  | { type: "place"; x: number; y: number; value: Cell }
  | { type: "solve"; grid: string };

export interface UnrulyUi {
  cx: number;
  cy: number;
  cursor: boolean;
}

/** A player-placed cell whose colour contradicts the unique solution
 * (the mistake-checking divergence; surfaced by Check & Save). */
export interface UnrulyMistake {
  x: number;
  y: number;
}

// --- params --------------------------------------------------------------

const PRESETS: UnrulyParams[] = [
  { w2: 8, h2: 8, unique: false, diff: DIFF_TRIVIAL },
  { w2: 8, h2: 8, unique: false, diff: DIFF_EASY },
  { w2: 8, h2: 8, unique: false, diff: DIFF_NORMAL },
  { w2: 10, h2: 10, unique: false, diff: DIFF_EASY },
  { w2: 10, h2: 10, unique: false, diff: DIFF_NORMAL },
  { w2: 14, h2: 14, unique: false, diff: DIFF_EASY },
  { w2: 14, h2: 14, unique: false, diff: DIFF_NORMAL },
];

export function defaultParams(): UnrulyParams {
  return { ...PRESETS[0] };
}

export function presets(): PresetMenu<UnrulyParams> {
  return {
    title: "Size",
    submenu: PRESETS.map((p) => ({
      title: `${p.w2}x${p.h2} ${DIFF_NAMES[p.diff]}`,
      params: { ...p },
    })),
  };
}

export function encodeParams(p: UnrulyParams, full: boolean): string {
  let s = `${p.w2}x${p.h2}`;
  if (p.unique) s += "u";
  if (full) s += `d${DIFF_CHARS[p.diff] ?? "?"}`;
  return s;
}

export function decodeParams(s: string): UnrulyParams {
  const ret = defaultParams();
  ret.unique = false;
  const dims = parseDimensions(s, 0);
  ret.w2 = dims.w;
  ret.h2 = dims.h;
  let i = dims.next;
  if (s[i] === "u") {
    i++;
    ret.unique = true;
  }
  if (s[i] === "d") {
    i++;
    ret.diff = DIFF_COUNT + 1; // invalid until matched
    if (i < s.length) {
      const idx = DIFF_CHARS.indexOf(s[i]);
      if (idx >= 0) ret.diff = idx;
      i++;
    }
  }
  return ret;
}

// The nth element gives the count of distinct valid Unruly rows of length
// 2n (n ones, n zeros, no three-in-a-row), for as long as it fits a signed
// 32-bit int. In unique-rows mode a 2n-wide puzzle's height ≤ A177790[n]
// and vice versa. OEIS A177790.
const A177790 = [
  1, 2, 6, 14, 34, 84, 208, 518, 1296, 3254, 8196, 20700, 52404, 132942, 337878, 860142,
  2192902, 5598144, 14308378, 36610970, 93770358, 240390602, 616787116, 1583765724,
];

export function validateParams(p: UnrulyParams, _full: boolean): string | null {
  if (p.w2 & 1 || p.h2 & 1) return "Width and height must both be even";
  if (p.w2 < 6 || p.h2 < 6) return "Width and height must be at least 6";
  if (p.w2 > Number.MAX_SAFE_INTEGER / p.h2) {
    return "Width times height must not be unreasonably large";
  }
  if (p.unique) {
    if (p.w2 < 2 * A177790.length && p.h2 > A177790[p.w2 / 2]) {
      return "Puzzle is too tall for unique-rows mode";
    }
    if (p.h2 < 2 * A177790.length && p.w2 > A177790[p.h2 / 2]) {
      return "Puzzle is too long for unique-rows mode";
    }
  }
  if (p.diff >= DIFF_COUNT) return "Unknown difficulty rating";
  return null;
}

// --- desc codec ----------------------------------------------------------
// Run-length: a lowercase letter advances past a run of empties and places a
// ZERO clue, uppercase the same placing a ONE, `z`/`Z` advance 25 with no
// clue. The advanced positions sum to exactly `w2·h2 + 1`.

export function validateDesc(p: UnrulyParams, desc: string): string | null {
  const s = p.w2 * p.h2;
  let pos = 0;
  for (const ch of desc) {
    if (ch >= "a" && ch < "z") pos += 1 + (ch.charCodeAt(0) - 97);
    else if (ch >= "A" && ch < "Z") pos += 1 + (ch.charCodeAt(0) - 65);
    else if (ch === "z" || ch === "Z") pos += 25;
    else return "Description contains invalid characters";
  }
  if (pos < s + 1) return "Description too short";
  if (pos > s + 1) return "Description too long";
  return null;
}

export function newState(p: UnrulyParams, desc: string): UnrulyState {
  const s = p.w2 * p.h2;
  const grid = new Uint8Array(s); // all EMPTY
  const immutable = new Uint8Array(s);
  let pos = 0;
  for (const ch of desc) {
    const code = ch.charCodeAt(0);
    if (ch >= "a" && ch < "z") {
      pos += code - 97;
      if (pos < s) {
        grid[pos] = ZERO;
        immutable[pos] = 1;
      }
      pos++;
    } else if (ch >= "A" && ch < "Z") {
      pos += code - 65;
      if (pos < s) {
        grid[pos] = ONE;
        immutable[pos] = 1;
      }
      pos++;
    } else {
      // 'z' / 'Z': advance 25, place nothing.
      pos += 25;
    }
  }
  return {
    w2: p.w2,
    h2: p.h2,
    unique: p.unique,
    grid,
    immutable,
    completed: false,
    cheated: false,
  };
}

/** Encode a filled-or-partial grid as upstream's run-length desc (a ZERO
 * or end-of-grid closes a run as `a`+run, a ONE as `A`+run, with `z`/`Z`
 * emitted for runs over 24). */
export function encodeGrid(grid: Uint8Array, s: number): string {
  let out = "";
  let run = 0;
  for (let i = 0; i <= s; i++) {
    if (i === s || grid[i] === ZERO) {
      while (run > 24) {
        out += "z";
        run -= 25;
      }
      out += String.fromCharCode(97 + run);
      run = 0;
    } else if (grid[i] === ONE) {
      while (run > 24) {
        out += "Z";
        run -= 25;
      }
      out += String.fromCharCode(65 + run);
      run = 0;
    } else {
      run++;
    }
  }
  return out;
}

// --- moves ---------------------------------------------------------------

export function cloneState(state: UnrulyState): UnrulyState {
  return { ...state, grid: Uint8Array.from(state.grid) };
}

/** Is the board complete? Balanced counts and no rule violation. */
export function isComplete(state: UnrulyState): boolean {
  return validateCounts(state, null) === 0 && validateRows(state, null) === 0;
}

export function executeMove(state: UnrulyState, move: UnrulyMove): UnrulyState {
  const { w2, h2 } = state;
  const s = w2 * h2;

  if (move.type === "solve") {
    if (move.grid.length !== s) throw new Error("Bad solve grid");
    const grid = new Uint8Array(s);
    for (let i = 0; i < s; i++) {
      const c = move.grid[i];
      if (c !== "0" && c !== "1") throw new Error("Bad solve grid");
      grid[i] = c === "1" ? ONE : ZERO;
    }
    return { ...state, grid, completed: true, cheated: true };
  }

  const { x, y, value } = move;
  if (x < 0 || x >= w2 || y < 0 || y >= h2) throw new Error("Move out of bounds");
  const i = y * w2 + x;
  if (state.immutable[i]) throw new Error("Cannot edit an immutable cell");

  const next = cloneState(state);
  next.grid[i] = value;
  if (!next.completed && isComplete(next)) {
    return { ...next, completed: true };
  }
  return next;
}

// --- status / text -------------------------------------------------------

export function status(state: UnrulyState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

export function textFormat(state: UnrulyState): string {
  const { w2, h2, grid } = state;
  const lines: string[] = [];
  for (let y = 0; y < h2; y++) {
    let row = "";
    for (let x = 0; x < w2; x++) {
      const c = grid[y * w2 + x];
      row += `${c === ONE ? "1" : c === ZERO ? "0" : "."} `;
    }
    lines.push(row);
  }
  return `${lines.join("\n")}\n`;
}
