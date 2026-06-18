/**
 * Filling (Fillomino) state, params, and desc codec — idiomatic TS port of
 * the state half of `filling.c`. Fill every cell with a number `n` so that
 * each maximal orthogonally-connected region of equal numbers contains
 * exactly `n` cells.
 *
 * A cell holds 0 (EMPTY) or 1..9. `clues[i] != 0` marks an immutable given
 * (shared by reference across a game's states, upstream's refcounted
 * `shared->clues`); a cell with `board[i] != 0` but `clues[i] == 0` is
 * player-filled. Region sizes never exceed 9 (the generator caps them).
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import { Dsf } from "../../engine/dsf.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions } from "../../engine/params.ts";

export const EMPTY = 0;

/** Orthogonal neighbour offsets (upstream `dx`/`dy`). */
export const DX = [-1, 1, 0, 0] as const;
export const DY = [0, 0, -1, 1] as const;

// --- types ---------------------------------------------------------------

export interface FillingParams {
  w: number;
  h: number;
}

export interface FillingState {
  readonly w: number;
  readonly h: number;
  /** Immutable clue grid (0 = unclued); shared by reference. */
  readonly clues: Uint8Array;
  /** Mutable player grid (0 = empty), cloned per move. */
  readonly board: Uint8Array;
  readonly completed: boolean;
  readonly cheated: boolean;
}

/** A `set` writes one value into every listed cell (upstream `"i,..._v"`);
 * a `solve` applies a full solution as a digit string (upstream `"s…"`). */
export type FillingMove =
  | { type: "set"; cells: number[]; value: number }
  | { type: "solve"; board: string };

export interface FillingUi {
  /** Currently-selected cell indices, or null for no selection. */
  sel: Set<number> | null;
  cx: number;
  cy: number;
  curVisible: boolean;
  keydragging: boolean;
}

/** A player-filled cell whose number contradicts the unique solution
 * (the mistake-checking divergence; surfaced by Check & Save). */
export interface FillingMistake {
  x: number;
  y: number;
}

// --- params --------------------------------------------------------------

const PRESETS: FillingParams[] = [
  { w: 9, h: 7 },
  { w: 13, h: 9 },
  { w: 17, h: 13 },
];

export function defaultParams(): FillingParams {
  return { ...PRESETS[1] };
}

export function presets(): PresetMenu<FillingParams> {
  return {
    title: "Size",
    submenu: PRESETS.map((p) => ({ title: `${p.w}x${p.h}`, params: { ...p } })),
  };
}

export function encodeParams(p: FillingParams, _full: boolean): string {
  return `${p.w}x${p.h}`;
}

export function decodeParams(s: string): FillingParams {
  const { w, h } = parseDimensions(s, 0);
  return { w, h };
}

export function validateParams(p: FillingParams, _full: boolean): string | null {
  if (p.w < 1) return "Width must be at least one";
  if (p.h < 1) return "Height must be at least one";
  if (p.w > Number.MAX_SAFE_INTEGER / p.h) {
    return "Width times height must not be unreasonably large";
  }
  return null;
}

// --- desc codec ----------------------------------------------------------
// Run-length: a lowercase letter 'a'..'z' advances past a run of 1..26 empty
// cells; a digit places a clue of that value. The decoded area is exactly w·h.

/** Greatest clue value upstream's `validate_desc` admits (`max(max(w,h),3)`);
 * actual clues never exceed 9, but we mirror the C bound faithfully. */
function maxClueValue(p: FillingParams): number {
  return Math.max(Math.max(p.w, p.h), 3);
}

export function validateDesc(p: FillingParams, desc: string): string | null {
  const sz = p.w * p.h;
  const m = maxClueValue(p);
  let area = 0;
  for (const ch of desc) {
    const code = ch.charCodeAt(0);
    if (ch >= "a" && ch <= "z") {
      area += code - 97 + 1;
    } else if (code >= 48 && code <= 48 + m) {
      area += 1;
    } else {
      return `Invalid character '${ch}' in game description`;
    }
    if (area > sz) return "Too much data to fit in grid";
  }
  return area < sz ? "Not enough data to fill grid" : null;
}

export function newState(p: FillingParams, desc: string): FillingState {
  const sz = p.w * p.h;
  const clues = new Uint8Array(sz); // all EMPTY
  let i = 0;
  for (const ch of desc) {
    const code = ch.charCodeAt(0);
    if (ch >= "a" && ch <= "z") {
      i += code - 97 + 1; // advance, leaving the empties as 0
    } else {
      clues[i++] = code - 48;
    }
  }
  return {
    w: p.w,
    h: p.h,
    clues,
    board: Uint8Array.from(clues),
    completed: false,
    cheated: false,
  };
}

/** Run-length encode a run of `run` empty cells (upstream `encode_run`). */
export function encodeRun(run: number): string {
  let s = "";
  let r = run;
  while (r > 26) {
    s += "z";
    r -= 26;
  }
  if (r > 0) s += String.fromCharCode(97 - 1 + r);
  return s;
}

// --- region DSF + completion --------------------------------------------

/** Disjoint-set of orthogonally-connected equal-valued cells. */
export function makeRegionDsf(board: ArrayLike<number>, w: number, h: number): Dsf {
  const dsf = new Dsf(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w && board[i] === board[i + 1]) dsf.merge(i, i + 1);
      if (y + 1 < h && board[i] === board[i + w]) dsf.merge(i, i + w);
    }
  }
  return dsf;
}

/** Complete iff every cell's value equals the size of its region. (Empty
 * cells have value 0 but region size ≥ 1, so any empty cell fails.) */
export function isComplete(board: ArrayLike<number>, w: number, h: number): boolean {
  const dsf = makeRegionDsf(board, w, h);
  const sz = w * h;
  for (let i = 0; i < sz; i++) if (board[i] !== dsf.size(i)) return false;
  return true;
}

// --- moves ---------------------------------------------------------------

export function cloneState(state: FillingState): FillingState {
  return { ...state, board: Uint8Array.from(state.board) };
}

export function executeMove(state: FillingState, move: FillingMove): FillingState {
  const { w, h } = state;
  const sz = w * h;

  if (move.type === "solve") {
    if (move.board.length !== sz) throw new Error("Bad solve board");
    const board = new Uint8Array(sz);
    for (let i = 0; i < sz; i++) {
      const v = move.board.charCodeAt(i) - 48;
      if (v < 0 || v > 9) throw new Error("Bad solve board");
      board[i] = v;
    }
    return { ...state, board, completed: true, cheated: true };
  }

  const { cells, value } = move;
  if (value < 0 || value > 9) throw new Error("Move value out of range");
  const next = cloneState(state);
  for (const c of cells) {
    if (c < 0 || c >= sz) throw new Error("Move cell out of bounds");
    next.board[c] = value;
  }
  if (!next.completed && isComplete(next.board, w, h)) {
    return { ...next, completed: true };
  }
  return next;
}

// --- status / text -------------------------------------------------------

export function status(state: FillingState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

/** Bordered ASCII grid (upstream `board_to_string`). */
export function textFormat(state: FillingState): string {
  const { w, h, board } = state;
  const sep = `+${"---+".repeat(w)}\n`;
  let out = sep;
  for (let y = 0; y < h; y++) {
    let row = "|";
    for (let x = 0; x < w; x++) {
      const v = board[y * w + x];
      row += v ? ` ${v} |` : "   |";
    }
    out += `${row}\n${sep}`;
  }
  return out;
}
