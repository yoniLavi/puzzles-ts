/**
 * Pearl (Masyu) state, params, direction algebra and the RLE desc codec —
 * the idiomatic-TS core of `pearl.c`. Draw one closed loop through grid
 * cells that turns a right angle at every black pearl (going straight on at
 * least one cell each side) and passes straight through every white pearl
 * (turning immediately before or after).
 *
 * State is immutable: `lines` / `marks` / `errors` are per-move copies; the
 * `clues` grid is shared frozen (upstream's ref-counted `shared_state`).
 */

// --- clue kinds (upstream NOCLUE / CORNER=black / STRAIGHT=white) ----------
export const NOCLUE = 0;
export const CORNER = 1; // black pearl
export const STRAIGHT = 2; // white pearl

// --- direction bits --------------------------------------------------------
export const R = 1;
export const U = 2;
export const L = 4;
export const D = 8;
export const BLANK = 0;

/** x-delta of a single direction bit (upstream `DX`). */
export function DX(d: number): number {
  return (d === R ? 1 : 0) - (d === L ? 1 : 0);
}
/** y-delta of a single direction bit (upstream `DY`; y grows downward). */
export function DY(d: number): number {
  return (d === D ? 1 : 0) - (d === U ? 1 : 0);
}
/** Opposite direction (upstream `F`). */
export function F(d: number): number {
  return ((d << 2) | (d >> 2)) & 0xf;
}
/** Clockwise-90 direction (upstream `C`). */
export function CW(d: number): number {
  return ((d << 3) | (d >> 1)) & 0xf;
}
/** Anticlockwise-90 direction (upstream `A`). */
export function ACW(d: number): number {
  return ((d << 1) | (d >> 3)) & 0xf;
}

// --- square-state bitmasks (1 << <pair of directions>) --------------------
export const bLR = 1 << (L | R);
export const bUD = 1 << (U | D);
export const bLU = 1 << (L | U);
export const bLD = 1 << (L | D);
export const bRU = 1 << (R | U);
export const bRD = 1 << (R | D);
export const bBLANK = 1 << BLANK;

// --- population count of the 4 direction bits -----------------------------
const NBITS_TABLE = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
/** Number of set direction bits in `l` (upstream `NBITS`). */
export function NBITS(l: number): number {
  return l < 0 || l > 15 ? 4 : NBITS_TABLE[l];
}

/** Error bit that flags a contradicted clue (upstream `ERROR_CLUE`), OR-ed
 * into `errors` alongside the four direction bits. */
export const ERROR_CLUE = 16;

// --- difficulty ------------------------------------------------------------
export const DIFF_EASY = 0;
export const DIFF_TRICKY = 1;
export const DIFF_COUNT = 2;
/** Full difficulty names for menu labels (upstream `pearl_diffnames`). */
export const DIFF_NAMES: readonly string[] = tierNames(2);
/** Encoding chars for the `d<char>` param suffix (upstream `pearl_diffchars`). */
export const DIFF_CHARS = "et";

// --- params ----------------------------------------------------------------
export interface PearlParams {
  w: number;
  h: number;
  difficulty: number;
  /** Allow an unsoluble board (upstream `nosolve`, default false). */
  nosolve: boolean;
}

const DEFAULT_PRESET = 3;
const PEARL_PRESETS: readonly PearlParams[] = [
  { w: 6, h: 6, difficulty: DIFF_EASY, nosolve: false },
  { w: 6, h: 6, difficulty: DIFF_TRICKY, nosolve: false },
  { w: 8, h: 8, difficulty: DIFF_EASY, nosolve: false },
  { w: 8, h: 8, difficulty: DIFF_TRICKY, nosolve: false },
  { w: 10, h: 10, difficulty: DIFF_EASY, nosolve: false },
  { w: 10, h: 10, difficulty: DIFF_TRICKY, nosolve: false },
  { w: 12, h: 8, difficulty: DIFF_EASY, nosolve: false },
  { w: 12, h: 8, difficulty: DIFF_TRICKY, nosolve: false },
];

export function defaultParams(): PearlParams {
  return { ...PEARL_PRESETS[DEFAULT_PRESET] };
}

import { tierNames } from "../../engine/difficulty.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { encodeRunLength, scanRunLength } from "../../engine/run-length.ts";

export function presets(): PresetMenu<PearlParams> {
  return {
    title: "Pearl",
    submenu: PEARL_PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${DIFF_NAMES[p.difficulty]}`,
      params: { ...p },
    })),
  };
}

export function decodeParams(s: string): PearlParams {
  const p: PearlParams = { w: 6, h: 6, difficulty: DIFF_EASY, nosolve: false };
  let i = 0;
  const readInt = (): number => {
    let n = 0;
    let any = false;
    while (i < s.length && s[i] >= "0" && s[i] <= "9") {
      n = n * 10 + (s.charCodeAt(i) - 48);
      i++;
      any = true;
    }
    return any ? n : 0;
  };
  p.w = p.h = readInt();
  if (s[i] === "x") {
    i++;
    p.h = readInt();
  }
  p.difficulty = DIFF_EASY;
  if (s[i] === "d") {
    i++;
    for (let d = 0; d < DIFF_COUNT; d++) if (s[i] === DIFF_CHARS[d]) p.difficulty = d;
    if (i < s.length) i++;
  }
  p.nosolve = false;
  if (s[i] === "n") {
    p.nosolve = true;
    i++;
  }
  return p;
}

export function encodeParams(p: PearlParams, full: boolean): string {
  let buf = `${p.w}x${p.h}`;
  if (full) buf += `d${DIFF_CHARS[p.difficulty]}${p.nosolve ? "n" : ""}`;
  return buf;
}

export function validateParams(p: PearlParams, _full: boolean): string | null {
  if (p.w < 5) return "Width must be at least five";
  if (p.h < 5) return "Height must be at least five";
  if (p.w > Math.floor(0x7fffffff / p.h))
    return "Width times height must not be unreasonably large";
  if (p.difficulty < 0 || p.difficulty >= DIFF_COUNT) return "Unknown difficulty level";
  if (p.difficulty >= DIFF_TRICKY && p.w + p.h < 11)
    return "Width or height must be at least six for Tricky";
  return null;
}

// --- desc codec ------------------------------------------------------------
/**
 * Run-length encode a clue grid: lowercase runs compress unclued cells, `B` is
 * a black pearl, `W` a white pearl.
 *
 * `keepTrailingBlanks` because {@link validateDesc} rejects a desc whose cells
 * do not add up to the whole grid ("string too short").
 *
 * Upstream grows a run by *incrementing the letter it already wrote*, starting
 * a fresh `a` once it reaches `z`. That is a third spelling of the same
 * grammar, not a different one: incrementing to `z` and restarting produces
 * exactly the 26-cell chunks {@link encodeRunLength} writes, which the frozen
 * differential checks byte for byte.
 */
export function encodeClues(clues: Uint8Array, sz: number): string {
  return encodeRunLength(
    sz,
    (i) => (clues[i] === NOCLUE ? null : clues[i] === CORNER ? "B" : "W"),
    { keepTrailingBlanks: true },
  );
}

export function validateDesc(p: PearlParams, desc: string): string | null {
  const total = p.w * p.h;
  let sizeSoFar = 0;
  for (const tok of scanRunLength(desc)) {
    if ("blanks" in tok) sizeSoFar += tok.blanks;
    else if (tok.value === "B" || tok.value === "W") sizeSoFar++;
    else return "unrecognized character in string";
  }
  if (sizeSoFar > total) return "string too long";
  if (sizeSoFar < total) return "string too short";
  return null;
}

// --- state -----------------------------------------------------------------
export interface PearlState {
  readonly w: number;
  readonly h: number;
  /** Immutable clue grid, shared by reference across states. */
  readonly clues: Uint8Array;
  /** Loop segments laid in each cell (R|U|L|D bits). */
  readonly lines: Uint8Array;
  /** No-line marks in each cell (R|U|L|D bits). */
  readonly marks: Uint8Array;
  /** Error flags per cell (R|U|L|D bits | ERROR_CLUE). */
  readonly errors: Uint8Array;
  readonly completed: boolean;
  readonly cheated: boolean;
}

export function newState(p: PearlParams, desc: string): PearlState {
  const sz = p.w * p.h;
  const clues = new Uint8Array(sz);
  let j = 0;
  for (const tok of scanRunLength(desc)) {
    // NOCLUE is 0, so a blank run just advances past cells already holding it.
    if ("blanks" in tok) j += tok.blanks;
    else if (tok.value === "B") clues[j++] = CORNER;
    else if (tok.value === "W") clues[j++] = STRAIGHT;
  }
  return {
    w: p.w,
    h: p.h,
    clues,
    lines: new Uint8Array(sz),
    marks: new Uint8Array(sz),
    errors: new Uint8Array(sz),
    completed: false,
    cheated: false,
  };
}

export function cloneState(s: PearlState): PearlState {
  return {
    w: s.w,
    h: s.h,
    clues: s.clues, // shared
    lines: s.lines.slice(),
    marks: s.marks.slice(),
    errors: s.errors.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

/** True iff `(x, y)` is on the grid (upstream `INGRID`). */
export function inGrid(s: { w: number; h: number }, x: number, y: number): boolean {
  return x >= 0 && x < s.w && y >= 0 && y < s.h;
}

import type { GridCursor } from "../../engine/pointer.ts";
import type { GameStatus } from "../../engine/types.ts";

export function status(s: PearlState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- moves -----------------------------------------------------------------
/** One edge/mark/solve/hint operation; a player action (drag, click, solve,
 * hint) commits an ordered list of these as a single move (upstream's
 * `;`-joined move tokens). */
export type PearlOp =
  | { kind: "line"; l: number; x: number; y: number } // 'L': lines |= l
  | { kind: "noline"; l: number; x: number; y: number } // 'N': lines &= ~l
  | { kind: "replace"; l: number; x: number; y: number } // 'R': lines = l, marks &= ~l
  | { kind: "flip"; l: number; x: number; y: number } // 'F': lines ^= l
  | { kind: "mark"; l: number; x: number; y: number } // 'M': marks ^= l
  | { kind: "solve" } // 'S'
  | { kind: "hint" }; // 'H': in-place autosolve

export interface PearlMove {
  ops: PearlOp[];
}

/** Transient interaction state (upstream `game_ui`). The drag path, keyboard
 * cursor, and the `appearance` preference (`guiStyle`). None of it is
 * serialized. */
export interface PearlUi {
  /** Drag path so far, as `y*w+x` coords (length w*h; only the first
   * `ndragcoords` entries are live). */
  dragcoords: number[];
  /** -1 = no drag; 0 = click, drag not yet confirmed; >0 = dragging. */
  ndragcoords: number;
  clickx: number;
  clicky: number;
  cursor: GridCursor;
  /** GUI_MASYU (0) or GUI_LOOPY (1); driven by the `appearance` pref. */
  guiStyle: number;
}

/** Text format for save/share (upstream `game_text_format`). */
export function textFormat(state: PearlState): string {
  const { w, h, clues, lines, marks } = state;
  const cw = 4;
  const ch = 2;
  const gw = cw * (w - 1) + 2;
  const gh = ch * (h - 1) + 1;
  const len = gw * gh;
  const board = new Array<string>(len).fill(" ");
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      const cell = r * ch * gw + c * cw;
      board[cell] = "+BW"[clues[i]];
      if (c < w - 1 && (lines[i] & R || lines[i + 1] & L))
        for (let k = 1; k < cw; k++) board[cell + k] = "-";
      if (r < h - 1 && (lines[i] & D || lines[i + w] & U))
        for (let k = 1; k < ch; k++) board[cell + k * gw] = "|";
      if (c < w - 1 && (marks[i] & R || marks[i + 1] & L))
        board[cell + (cw >> 1)] = "x";
      if (r < h - 1 && (marks[i] & D || marks[i + w] & U))
        board[cell + (ch >> 1) * gw] = "x";
    }
  }
  // Insert row terminators (newlines), then join.
  let out = "";
  for (let r = 0; r < h; r++) {
    const rows = r === h - 1 ? 1 : ch;
    for (let sub = 0; sub < rows; sub++) {
      const base = r * ch * gw + sub * gw;
      out += board.slice(base, base + gw - 1).join("");
      out += "\n";
    }
  }
  return out;
}
