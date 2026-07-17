/**
 * Tents state, params, and desc codec — idiomatic TS port of the state half
 * of `tents.c` (place tents next to trees so each row/column tent count
 * matches its edge clue, no two tents are even diagonally adjacent, and the
 * trees and tents admit a one-to-one orthogonal-adjacency matching).
 *
 * Grid conventions (upstream's): `w`/`h` are the grid dimensions; a cell is
 * one of BLANK / TREE / TENT / NONTENT (MAGIC is a solver-only sentinel).
 * Trees are fixed givens; the player marks squares tent / non-tent / blank.
 * `numbers` holds the `w + h` edge clues — columns `0..w-1` then rows
 * `0..h-1` — shared (frozen) across a game's states.
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { matching } from "../../engine/latin.ts";
import { parseDimensions } from "../../engine/params.ts";

// --- cell values (upstream enum BLANK, TREE, TENT, NONTENT, MAGIC) ---------
export const BLANK = 0;
export const TREE = 1;
export const TENT = 2;
export const NONTENT = 3;
export const MAGIC = 4;

// --- difficulty (upstream DIFFLIST: Easy, Tricky) -------------------------
export const DIFF_EASY = 0;
export const DIFF_TRICKY = 1;
export const DIFF_COUNT = 2;
export const DIFF_NAMES = ["Easy", "Tricky"] as const;
export const DIFF_CHARS = "et"; // ENCODE chars, indexed by difficulty

// --- link directions (upstream N,U,L,R,D) ---------------------------------
// The solver walks orthogonal neighbours in this fixed order; the generator
// and completion check reuse dx/dy so byte-order-sensitive loops match.
export const N = 0;
export const U = 1;
export const L = 2;
export const R = 3;
export const D = 4;
export const MAXDIR = 5;
export const DX = (d: number): number => (d === R ? 1 : 0) - (d === L ? 1 : 0);
export const DY = (d: number): number => (d === D ? 1 : 0) - (d === U ? 1 : 0);
export const FLIP = (d: number): number => U + D - d; // opposite direction

// --- types ---------------------------------------------------------------

export interface TentsParams {
  w: number;
  h: number;
  diff: number;
}

export interface TentsState {
  readonly w: number;
  readonly h: number;
  /** `w + h` edge clues (columns then rows); shared by reference. */
  readonly numbers: Int32Array;
  /** Per-cell BLANK/TREE/TENT/NONTENT, cloned per move. */
  readonly grid: Int8Array;
  readonly completed: boolean;
  readonly usedSolve: boolean;
}

/** A `cells` batch is the C `B`/`T`/`N` compound (one gesture's edits);
 * `solve` is the `S;T…` compound as the list of tent cell indices. Both are
 * JSON-save-safe. */
export type TentsMove =
  | { type: "cells"; cells: readonly { x: number; y: number; v: number }[] }
  | { type: "solve"; tents: readonly number[] };

export interface TentsUi {
  /** Drag start / end coords, `-1` when idle (upstream game_ui). */
  dsx: number;
  dsy: number;
  dex: number;
  dey: number;
  /** `-1` for no drag, else the button code that started it. */
  dragButton: number;
  /** False once the drag has left the window (cancels on release). */
  dragOk: boolean;
  cx: number;
  cy: number;
  cursorVisible: boolean;
}

/** A placed square that contradicts the unique solution (surfaced by Check &
 * Save). `kind` records whether the player put a tent where none belongs or a
 * non-tent where a tent belongs — both render identically. */
export interface TentsMistake {
  x: number;
  y: number;
  kind: "tent" | "nontent";
}

// --- params --------------------------------------------------------------

const PRESETS: TentsParams[] = [
  { w: 8, h: 8, diff: DIFF_EASY },
  { w: 8, h: 8, diff: DIFF_TRICKY },
  { w: 10, h: 10, diff: DIFF_EASY },
  { w: 10, h: 10, diff: DIFF_TRICKY },
  { w: 15, h: 15, diff: DIFF_EASY },
  { w: 15, h: 15, diff: DIFF_TRICKY },
];

export function defaultParams(): TentsParams {
  return { w: 8, h: 8, diff: DIFF_EASY };
}

export function presets(): PresetMenu<TentsParams> {
  return {
    title: "Size",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${DIFF_NAMES[p.diff]}`,
      params: { ...p },
    })),
  };
}

export function encodeParams(p: TentsParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += `d${DIFF_CHARS[p.diff] ?? "?"}`;
  return s;
}

export function decodeParams(s: string): TentsParams {
  const ret = defaultParams();
  const dims = parseDimensions(s, 0);
  ret.w = dims.w;
  ret.h = dims.h;
  let i = dims.next;
  if (s[i] === "d") {
    i++;
    // Upstream leniency: an unknown difficulty char leaves the default.
    if (i < s.length) {
      const idx = DIFF_CHARS.indexOf(s[i]);
      if (idx >= 0) ret.diff = idx;
      i++;
    }
  }
  return ret;
}

export function validateParams(p: TentsParams, _full: boolean): string | null {
  // Generating anything under 4x4 runs into trouble of one kind or another.
  if (p.w < 4 || p.h < 4) return "Width and height must both be at least four";
  if (p.w > Number.MAX_SAFE_INTEGER / p.h) {
    return "Width times height must not be unreasonably large";
  }
  if (p.diff < 0 || p.diff >= DIFF_COUNT) return "Unknown difficulty rating";
  return null;
}

// --- desc codec ----------------------------------------------------------
// Grid part: a run-length code over the cells reading only tree positions —
// `_` a tree with no preceding blanks, `a`–`y` 1–25 blanks then a tree, `z` a
// run of 25 blanks, terminated by a tree-past-the-end marker. Then the `w + h`
// edge numbers each preceded by a comma. `!`/`-` (pre-placed tent/non-tent)
// are accepted on decode for completeness but our generator never emits them.

/** Encode a tree grid + numbers as the upstream desc (byte-faithful). */
export function encodeDesc(
  w: number,
  h: number,
  grid: Int8Array,
  numbers: Int32Array,
): string {
  let out = "";
  let j = 0;
  for (let i = 0; i <= w * h; i++) {
    const c = i < w * h ? grid[i] === TREE : true;
    if (c) {
      out += j === 0 ? "_" : String.fromCharCode(j - 1 + 97);
      j = 0;
    } else {
      j++;
      while (j > 25) {
        out += "z";
        j -= 25;
      }
    }
  }
  for (let i = 0; i < w + h; i++) out += `,${numbers[i]}`;
  return out;
}

export function validateDesc(p: TentsParams, desc: string): string | null {
  const { w, h } = p;
  let area = 0;
  let i = 0;
  for (; i < desc.length && desc[i] !== ","; i++) {
    const ch = desc[i];
    if (ch === "_") area++;
    else if (ch >= "a" && ch < "z") area += ch.charCodeAt(0) - 97 + 2;
    else if (ch === "z") area += 25;
    else if (ch === "!" || ch === "-") {
      if (area === 0 || area > w * h) return "Tent or non-tent placed off the grid";
    } else return "Invalid character in grid specification";
  }
  if (area < w * h + 1) return "Not enough data to fill grid";
  if (area > w * h + 1) return "Too much data to fill grid";

  for (let k = 0; k < w + h; k++) {
    if (i >= desc.length) return "Not enough numbers given after grid specification";
    if (desc[i] !== ",") return "Invalid character in number list";
    i++;
    while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") i++;
  }
  if (i < desc.length) return "Unexpected additional data at end of game description";
  return null;
}

/** Parse a desc into a fresh tree grid + numbers array. */
export function decodeDesc(
  p: TentsParams,
  desc: string,
): { grid: Int8Array; numbers: Int32Array } {
  const { w, h } = p;
  const grid = new Int8Array(w * h).fill(BLANK);
  const numbers = new Int32Array(w + h);
  let i = 0;
  let pos = 0;
  for (; i < desc.length && desc[i] !== ","; i++) {
    const ch = desc[i];
    let run: number;
    let type = TREE;
    if (ch === "_") run = 0;
    else if (ch >= "a" && ch < "z") run = ch.charCodeAt(0) - 96;
    else if (ch === "z") {
      run = 25;
      type = BLANK;
    } else {
      // '!' or '-' — set the previous square (run = -1)
      run = -1;
      type = ch === "!" ? TENT : NONTENT;
    }
    pos += run;
    if (pos === w * h) break; // terminal tree-past-the-end
    if (type !== BLANK) grid[pos++] = type;
  }
  // Numbers.
  for (let k = 0; k < w + h; k++) {
    while (i < desc.length && desc[i] !== ",") i++;
    i++; // skip the comma
    let n = 0;
    while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") {
      n = n * 10 + (desc.charCodeAt(i) - 48);
      i++;
    }
    numbers[k] = n;
  }
  return { grid, numbers };
}

export function newState(p: TentsParams, desc: string): TentsState {
  const { grid, numbers } = decodeDesc(p, desc);
  return { w: p.w, h: p.h, numbers, grid, completed: false, usedSolve: false };
}

// --- completion check (upstream execute_move tail) ------------------------

/** True iff the trees and tents in `grid` admit a perfect one-to-one
 * orthogonal-adjacency matching (upstream's `matching(m, m, …, NULL)`: left =
 * trees, right = adjacent tents; count == m ⇒ a perfect matching). Neighbour
 * order U,L,R,D exactly as upstream. */
function tentsTreesMatch(w: number, h: number, grid: Int8Array): boolean {
  const gridids = new Int32Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) if (grid[i] === TENT) gridids[i] = n++;
  const nTents = n;
  n = 0;
  for (let i = 0; i < w * h; i++) if (grid[i] === TREE) gridids[i] = n++;
  const m = n;
  if (nTents !== m) return false;

  const adjlists: number[][] = [];
  const adjsizes: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] !== TREE) continue;
      const treeid = gridids[y * w + x];
      const list: number[] = [];
      for (let d = 1; d < MAXDIR; d++) {
        const x2 = x + DX(d);
        const y2 = y + DY(d);
        if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h && grid[y2 * w + x2] === TENT) {
          list.push(gridids[y2 * w + x2]);
        }
      }
      adjlists[treeid] = list;
      adjsizes[treeid] = list.length;
    }
  }
  const ltoR = matching(m, m, adjlists, adjsizes); // rs omitted ⇒ deterministic
  let count = 0;
  for (let i = 0; i < m; i++) if (ltoR[i] !== -1) count++;
  return count === m;
}

/** Upstream `execute_move`'s completion test: right number of tents, every
 * edge number met, no two tents adjacent (orthogonally or diagonally), and a
 * valid tree↔tent matching. */
export function checkCompletion(
  w: number,
  h: number,
  grid: Int8Array,
  numbers: Int32Array,
): boolean {
  let nTents = 0;
  let nTrees = 0;
  for (let i = 0; i < w * h; i++) {
    if (grid[i] === TENT) nTents++;
    else if (grid[i] === TREE) nTrees++;
  }
  if (nTents !== nTrees) return false;

  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (grid[y * w + x] === TENT) n++;
    if (numbers[x] !== n) return false;
  }
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (grid[y * w + x] === TENT) n++;
    if (numbers[w + y] !== n) return false;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = grid[y * w + x] === TENT;
      if (x + 1 < w && t && grid[y * w + x + 1] === TENT) return false;
      if (y + 1 < h && t && grid[(y + 1) * w + x] === TENT) return false;
      if (x + 1 < w && y + 1 < h) {
        if (t && grid[(y + 1) * w + (x + 1)] === TENT) return false;
        if (grid[(y + 1) * w + x] === TENT && grid[y * w + (x + 1)] === TENT) {
          return false;
        }
      }
    }
  }

  return tentsTreesMatch(w, h, grid);
}

// --- moves ---------------------------------------------------------------

export function executeMove(state: TentsState, move: TentsMove): TentsState {
  const { w, h } = state;
  const grid = Int8Array.from(state.grid);
  let usedSolve = state.usedSolve;

  if (move.type === "solve") {
    usedSolve = true;
    for (let i = 0; i < w * h; i++) if (grid[i] !== TREE) grid[i] = NONTENT;
    for (const idx of move.tents) {
      if (idx < 0 || idx >= w * h || grid[idx] === TREE)
        throw new Error("Bad solve move");
      grid[idx] = TENT;
    }
  } else {
    for (const { x, y, v } of move.cells) {
      if (x < 0 || x >= w || y < 0 || y >= h) throw new Error("Move out of bounds");
      if (grid[y * w + x] === TREE) throw new Error("Cannot modify a tree");
      grid[y * w + x] = v;
    }
  }

  const completed = state.completed || checkCompletion(w, h, grid, state.numbers);
  return { ...state, grid, completed, usedSolve };
}

// --- status / text -------------------------------------------------------

export function status(state: TentsState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

/** Upstream `game_text_format`: a box-drawn grid with `//\` tents, `T` trees,
 * `.` blanks, and the edge numbers along the bottom and right. */
export function textFormat(state: TentsState): string {
  const { w, h, grid, numbers } = state;
  const cw = 4;
  const ch = 2;
  const gw = (w + 1) * cw + 2;
  const gh = (h + 1) * ch + 1;
  const len = gw * gh;
  const board = new Array<string>(len).fill(" ");
  const put = (idx: number, s: string) => {
    for (let k = 0; k < s.length; k++) board[idx + k] = s[k];
  };

  for (let r = 0; r <= h; r++) {
    for (let c = 0; c <= w; c++) {
      const cell = r * ch * gw + cw * c;
      const center = cell + (gw * ch) / 2 + cw / 2;
      const i = r * w + c;
      let n = 1000;
      if (r === h && c === w) {
        // NOP
      } else if (c === w) n = numbers[w + r];
      else if (r === h) n = numbers[c];
      else {
        switch (grid[i]) {
          case BLANK:
            board[center] = ".";
            break;
          case TREE:
            board[center] = "T";
            break;
          case TENT:
            put(center - 1, "//\\");
            break;
        }
      }
      if (n < 100) {
        board[center] = String(n % 10);
        if (n >= 10) board[center - 1] = String(Math.floor(n / 10));
      }
      board[cell] = "+";
      for (let k = 1; k < cw; k++) board[cell + k] = "-";
      for (let k = 1; k < ch; k++) board[cell + k * gw] = "|";
    }
    for (let c = 0; c < ch; c++) {
      board[(r * ch + c) * gw + gw - 2] = c === 0 ? "+" : r < h ? "|" : " ";
      board[(r * ch + c) * gw + gw - 1] = "\n";
    }
  }
  for (let k = 0; k < gw - 2 - cw; k++) board[len - gw + k] = "-";
  for (let c = 0; c <= w; c++) board[len - gw + cw * c] = "+";

  return board.join("");
}
