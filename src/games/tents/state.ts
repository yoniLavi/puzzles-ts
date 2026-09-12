/**
 * Tents state, params, and desc codec — the state half of `tents.c` (place
 * tents next to trees so each row/column tent count matches its edge clue, no
 * two tents are even diagonally adjacent, and the trees and tents admit a
 * one-to-one orthogonal-adjacency matching).
 *
 * A cell is BLANK / TREE / TENT / NONTENT (MAGIC is a solver-only sentinel).
 * Trees are fixed givens; the player marks squares tent / non-tent / blank.
 * `numbers` holds the `w + h` edge clues — columns `0..w-1` then rows
 * `0..h-1` — shared (frozen) across a game's states.
 */

import { assertNever } from "../../engine/assert-never.ts";
import { tierNames } from "../../engine/difficulty.ts";
import type { ParamConfigItem, PresetMenu } from "../../engine/game.ts";
import { matching } from "../../engine/latin.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import { choice, dims, paramsCodec } from "../../engine/params-codec.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import type { GameStatus } from "../../engine/types.ts";

// --- cell values (upstream enum BLANK, TREE, TENT, NONTENT, MAGIC) ---------
export const BLANK = 0;
export const TREE = 1;
export const TENT = 2;
export const NONTENT = 3;
export const MAGIC = 4;

// --- difficulty (constants named for upstream's tiers; players see DIFF_NAMES)
export const DIFF_EASY = 0;
export const DIFF_TRICKY = 1;
export const DIFF_COUNT = 2;
const DIFF_NAMES: readonly string[] = tierNames(2);
const DIFF_CHARS = "et"; // ENCODE chars, indexed by difficulty

// --- link directions (upstream N,U,L,R,D; N is "no link") ------------------
// The solver walks orthogonal neighbors in this fixed order; the generator
// and completion check reuse dx/dy so byte-order-sensitive loops match.
export const N = 0;
const U = 1;
const L = 2;
const R = 3;
const D = 4;
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
  readonly cheated: boolean;
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
  cursor: GridCursor;
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

/** The "Custom type…" form, and the field list the codec below encodes. */
export const paramConfig: ParamConfigItem<TentsParams>[] = [
  ...dimensionParamConfig<TentsParams>(),
  {
    kw: "difficulty",
    name: "Difficulty",
    type: "choices",
    choices: [...DIFF_NAMES],
    get: (p) => p.diff,
    set: (p, v) => {
      p.diff = v;
    },
  },
];

/** `WxH`, plus the generator-only difficulty letter. An unrecognized letter
 * leaves the default, which is upstream's leniency. */
export const { encodeParams, decodeParams } = paramsCodec(defaultParams, [
  dims(paramConfig),
  choice(paramConfig, "d", "difficulty", DIFF_CHARS, { full: true }),
]);

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
    if (i === w * h || grid[i] === TREE) {
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

/** Parse a validated desc into a fresh tree grid + numbers array. */
export function decodeDesc(
  p: TentsParams,
  desc: string,
): { grid: Int8Array; numbers: Int32Array } {
  const { w, h } = p;
  const grid = new Int8Array(w * h);
  let pos = 0;
  for (let i = 0; i < desc.length && desc[i] !== ","; i++) {
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
  // The grid part holds no comma, so the numbers are everything after the first.
  const numbers = Int32Array.from(desc.slice(desc.indexOf(",") + 1).split(","), Number);
  return { grid, numbers };
}

export function newState(p: TentsParams, desc: string): TentsState {
  const { grid, numbers } = decodeDesc(p, desc);
  return { w: p.w, h: p.h, numbers, grid, completed: false, cheated: false };
}

// --- completion check (upstream execute_move tail) ------------------------

/** Upstream `execute_move`'s completion test: every edge number met, no two
 * tents adjacent (orthogonally or diagonally), and a one-to-one matching of
 * trees to orthogonally adjacent tents. */
export function checkCompletion(
  w: number,
  h: number,
  grid: Int8Array,
  numbers: Int32Array,
): boolean {
  // Tents and trees are numbered separately, in reading order, for the matching.
  const ids = new Int32Array(w * h);
  const counts = new Int32Array(w + h);
  let nTents = 0;
  let nTrees = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === TREE) ids[y * w + x] = nTrees++;
      if (grid[y * w + x] !== TENT) continue;
      ids[y * w + x] = nTents++;
      counts[x]++;
      counts[w + y]++;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x2 = x + dx;
          const y2 = y + dy;
          if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h && grid[y2 * w + x2] === TENT) {
            return false;
          }
        }
      }
    }
  }
  if (nTents !== nTrees) return false;
  for (let i = 0; i < w + h; i++) if (counts[i] !== numbers[i]) return false;

  const adjlists: number[][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] !== TREE) continue;
      const list: number[] = [];
      for (let d = 1; d < MAXDIR; d++) {
        const x2 = x + DX(d);
        const y2 = y + DY(d);
        if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h && grid[y2 * w + x2] === TENT) {
          list.push(ids[y2 * w + x2]);
        }
      }
      adjlists.push(list);
    }
  }
  // No `rs`: upstream's deterministic existence check.
  const ltoR = matching(
    nTrees,
    nTrees,
    adjlists,
    adjlists.map((l) => l.length),
  );
  return !ltoR.includes(-1);
}

// --- moves ---------------------------------------------------------------

export function executeMove(state: TentsState, move: TentsMove): TentsState {
  const { w, h } = state;
  const grid = Int8Array.from(state.grid);
  let cheated = state.cheated;

  if (move.type === "solve") {
    cheated = true;
    for (let i = 0; i < w * h; i++) if (grid[i] !== TREE) grid[i] = NONTENT;
    for (const idx of move.tents) {
      if (idx < 0 || idx >= w * h || grid[idx] === TREE)
        throw new Error("Bad solve move");
      grid[idx] = TENT;
    }
  } else if (move.type === "cells") {
    for (const { x, y, v } of move.cells) {
      if (x < 0 || x >= w || y < 0 || y >= h) throw new Error("Move out of bounds");
      if (grid[y * w + x] === TREE) throw new Error("Cannot modify a tree");
      grid[y * w + x] = v;
    }
  } else {
    return assertNever(move, "tents: executeMove");
  }

  const completed = state.completed || checkCompletion(w, h, grid, state.numbers);
  return { ...state, grid, completed, cheated };
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

  for (let r = 0; r <= h; r++) {
    for (let c = 0; c <= w; c++) {
      const cell = r * ch * gw + cw * c;
      const center = cell + (gw * ch) / 2 + cw / 2;
      let n = 1000;
      if (r < h && c < w) {
        const v = grid[r * w + c];
        if (v === BLANK) board[center] = ".";
        else if (v === TREE) board[center] = "T";
        else if (v === TENT) board.splice(center - 1, 3, ..."//\\");
      } else if (c < w) n = numbers[c];
      else if (r < h) n = numbers[w + r];
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
