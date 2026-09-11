/**
 * Unruly state, params and desc codec: the state half of `unruly.c`.
 *
 * A cell is `EMPTY`, `ONE` or `ZERO`, and as upstream, **`ONE` renders dark
 * ("black") and `ZERO` renders light ("white")** (see `render.ts`).
 */

import { assertNever } from "../../engine/assert-never.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions } from "../../engine/params.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import type { GameStatus } from "../../engine/types.ts";
import {
  type Cell,
  DIFF_CHARS,
  DIFF_COUNT,
  DIFF_EASY,
  DIFF_NAMES,
  DIFF_NORMAL,
  DIFF_TRIVIAL,
  ONE,
  ZERO,
} from "./constants.ts";
import { isComplete } from "./solver.ts";

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
  cursor: GridCursor;
}

/** A player-placed cell whose color contradicts the unique solution
 * (surfaced by Check & Save). */
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
  const dims = parseDimensions(s, 0);
  const ret = { ...defaultParams(), w2: dims.w, h2: dims.h };
  let i = dims.next;
  if (s[i] === "u") {
    ret.unique = true;
    i++;
  }
  if (s[i] === "d") {
    // A missing or unknown letter leaves a difficulty validateParams rejects.
    const idx = i + 1 < s.length ? DIFF_CHARS.indexOf(s[i + 1]) : -1;
    ret.diff = idx >= 0 ? idx : DIFF_COUNT + 1;
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
    const zero = ch >= "a" && ch < "z";
    if (zero || (ch >= "A" && ch < "Z")) {
      pos += ch.charCodeAt(0) - (zero ? 97 : 65);
      if (pos < s) {
        grid[pos] = zero ? ZERO : ONE;
        immutable[pos] = 1;
      }
      pos++;
    } else {
      pos += 25; // `z` / `Z`
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

/** Encode a filled-or-partial grid as the run-length desc above. The end of
 * the grid closes the last run as a ZERO would, which is the `+ 1`. */
export function encodeGrid(grid: Uint8Array, s: number): string {
  let out = "";
  let run = 0;
  for (let i = 0; i <= s; i++) {
    const v = i === s ? ZERO : grid[i];
    if (v !== ZERO && v !== ONE) {
      run++;
      continue;
    }
    const base = v === ONE ? 65 : 97; // "A" / "a"; base + 25 is "Z" / "z"
    for (; run > 24; run -= 25) out += String.fromCharCode(base + 25);
    out += String.fromCharCode(base + run);
    run = 0;
  }
  return out;
}

// --- moves ---------------------------------------------------------------

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
  if (move.type !== "place") return assertNever(move, "unruly: executeMove");

  const { x, y, value } = move;
  if (x < 0 || x >= w2 || y < 0 || y >= h2) throw new Error("Move out of bounds");
  const i = y * w2 + x;
  if (state.immutable[i]) throw new Error("Cannot edit an immutable cell");

  const next = { ...state, grid: Uint8Array.from(state.grid) };
  next.grid[i] = value;
  if (!next.completed && isComplete(next)) return { ...next, completed: true };
  return next;
}

// --- status / text -------------------------------------------------------

export function status(state: UnrulyState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

export function textFormat(state: UnrulyState): string {
  const { w2, h2, grid } = state;
  let out = "";
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      const c = grid[y * w2 + x];
      out += `${c === ONE ? "1" : c === ZERO ? "0" : "."} `;
    }
    out += "\n";
  }
  return out;
}
