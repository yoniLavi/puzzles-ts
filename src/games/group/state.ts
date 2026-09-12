/**
 * Types and pure state helpers for Group — the state/codec/error-checking parts
 * of `puzzles/unfinished/group.c`.
 *
 * A board is a `w × w` Cayley table of a group: a Latin square (each element
 * `1..w` once per row and column) that is additionally **associative**
 * (`(ab)c = a(bc)`), from which the group identity and inverses follow (the
 * proof is in {@link checkErrors}). The player fills the table; a few cells are
 * given (`immutable`, shared by reference). Each empty cell may instead hold a
 * bitmap of pencil marks.
 *
 * Two Group-specific display concepts live in the state, not just the Ui,
 * because they are undoable player actions: `sequence` is the order the `w`
 * elements are shown in (draggable, to group a subgroup and its cosets), and
 * `dividers` are thick subgroup-boundary lines the player drops between
 * elements.
 *
 * The grid desc is **decimal** (element values run 1..26), unlike most Latin
 * games; the display letters (`toChar`) appear only on screen and in the
 * solution `aux` string, never in the desc.
 */

import { digitValue, parseLeadingInt } from "../../engine/decimal.ts";
import { tierNames } from "../../engine/difficulty.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { newCursor } from "../../engine/pointer.ts";
import type { GameStatus, Point } from "../../engine/types.ts";

// --- difficulty ------------------------------------------------------------
// Upstream DIFFLIST order: Trivial, Normal, Hard, Extreme, Unreasonable. The
// player sees the collection's tier names instead, so `DIFF_HARD` reads
// "Tricky" and `DIFF_EXTREME` "Hard".

export const DIFF_TRIVIAL = 0;
export const DIFF_NORMAL = 1;
export const DIFF_HARD = 2;
export const DIFF_EXTREME = 3;
export const DIFF_UNREASONABLE = 4;
const DIFF_COUNT = 5;

/** `group_diffchars` — the per-level encode character. */
const DIFF_CHARS = "tnhxu";
/** The per-level display title. */
export const DIFF_NAMES = tierNames(5, { search: true });

// --- element numbering / character mapping (E_TO_FRONT / E_FROM_FRONT) ------
// In identity mode the elements read e,a,b,c,d,f,g,... (the identity pulled to
// the front); otherwise a,b,c,d,e,... in order. The remap touches only elements
// <= 5, and only the *display* — the grid desc is decimal-internal.

/** Display index → internal element (`E_TO_FRONT`). */
function eToFront(c: number, id: boolean): number {
  return id && c <= 5 ? (c % 5) + 1 : c;
}
/** Internal element → display index (`E_FROM_FRONT`). */
function eFromFront(c: number, id: boolean): number {
  return id && c <= 5 ? ((c + 3) % 5) + 1 : c;
}

/** Is `ch` (a char code) an ASCII letter? (`ISCHAR`) */
export function isChar(ch: number): boolean {
  return (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122);
}
/** Char code → internal element `1..w` (`FROMCHAR`). Uppercases, takes the
 * 1-based letter index, then maps through {@link eToFront}. */
export function fromChar(ch: number, id: boolean): number {
  const letter = (ch - 64) & ~0x20; // ('A'-1) = 64; clear the lowercase bit
  return eToFront(letter, id);
}
/** Internal element `1..w` → its lowercase display char (`TOCHAR`). */
export function toChar(n: number, id: boolean): string {
  return String.fromCharCode(eFromFront(n, id) + 96); // 'a'-1 = 96
}

// --- params ----------------------------------------------------------------

export interface GroupParams {
  w: number;
  /** Difficulty level (`DIFF_*`). */
  diff: number;
  /** "Show identity": when false the identity is hidden and elements read
   * a,b,c,... in order. */
  id: boolean;
}

/** Upstream `group_presets`. */
export const PRESETS: readonly GroupParams[] = [
  { w: 6, diff: DIFF_NORMAL, id: true },
  { w: 6, diff: DIFF_NORMAL, id: false },
  { w: 8, diff: DIFF_NORMAL, id: true },
  { w: 8, diff: DIFF_NORMAL, id: false },
  { w: 8, diff: DIFF_HARD, id: true },
  { w: 8, diff: DIFF_HARD, id: false },
  { w: 12, diff: DIFF_NORMAL, id: true },
];

export function defaultParams(): GroupParams {
  return { w: 6, diff: DIFF_NORMAL, id: true };
}

export function presetName(p: GroupParams): string {
  return `${p.w}x${p.w} ${DIFF_NAMES[p.diff]}${p.id ? "" : ", identity hidden"}`;
}

export function encodeParams(p: GroupParams, full: boolean): string {
  let s = String(p.w);
  if (full) s += `d${DIFF_CHARS[p.diff]}`;
  if (!p.id) s += "i";
  return s;
}

export function decodeParams(s: string): GroupParams {
  const w = parseLeadingInt(s, 0);
  let i = w.next;
  // decode_params resets diff/id to their defaults up front, then scans flags.
  const p: GroupParams = {
    w: w.value,
    diff: DIFF_NORMAL,
    id: true,
  };
  while (i < s.length) {
    if (s[i] === "d") {
      i++;
      p.diff = DIFF_COUNT + 1; // ...which is invalid, until a known char is seen
      if (i < s.length) {
        for (let d = 0; d < DIFF_COUNT; d++) if (s[i] === DIFF_CHARS[d]) p.diff = d;
        i++;
      }
    } else if (s[i] === "i") {
      p.id = false;
      i++;
    } else {
      i++; // unrecognized character
    }
  }
  return p;
}

export function validateParams(p: GroupParams, _full: boolean): string | null {
  if (p.w < 3 || p.w > 26) return "Grid size must be between 3 and 26";
  if (p.diff >= DIFF_COUNT) return "Unknown difficulty rating";
  if (!p.id && p.diff === DIFF_TRIVIAL) {
    // Identityless puzzles always have two entirely-blank rows and columns, and
    // no Latin-square deduction can distinguish them — so an Easy (Latin-only)
    // puzzle can't hide its identity.
    return "Trivial puzzles must have an identity";
  }
  if (!p.id && p.w === 3) {
    // 3x3 puzzles can never be harder than Easy (every 3x3 Latin square is
    // already a valid group table, so group deductions rule nothing out), and —
    // as above — Easy puzzles can't lack an identity.
    return "3x3 puzzles must have an identity";
  }
  return null;
}

// --- move model --------------------------------------------------------------

export type GroupMove =
  /** Fill (or clear, `n = 0`) the listed cells with element `n`. A diagonal
   * multifill carries several cells; a single entry carries one. */
  | { type: "set"; cells: readonly Point[]; n: number }
  /** Toggle pencil mark `n` on the listed cells. */
  | { type: "pencil"; cells: readonly Point[]; n: number }
  /** Auto-solve to the given full grid (element per cell, 1-based). */
  | { type: "solve"; grid: readonly number[] }
  /** Reorder: move element `num` to display position `pos` (upstream `D`). */
  | { type: "reorder"; num: number; pos: number }
  /** Toggle a divider to the right of element `i` (between `i` and `j`)
   * (upstream `V`). */
  | { type: "divider"; i: number; j: number }
  /** Pencil in every candidate in each empty cell — the "fill all pencil marks"
   * action ('M'). Upstream has it only as a standalone-solver diagnostic; here
   * it is a play move: the populate step the explained hint teaches, and the
   * manual action a player follows it with (the hint's elimination steps need
   * notes to cross out). */
  | { type: "pencilAll" }
  /** Strike the listed pencil marks — the atomic form the hint's elimination
   * steps and the "clear obvious candidates" cleanup emit. */
  | { type: "pencilStrike"; marks: readonly { x: number; y: number; n: number }[] };

/** A cell whose filled value contradicts the unique solution (Check & Save). */
export type GroupMistake = Point;

// --- state -----------------------------------------------------------------

export interface GroupState {
  w: number;
  diff: number;
  id: boolean;
  /** `w²` working grid (0 = blank), cloned per move. */
  grid: Uint8Array;
  /** `w²` pencil bitmaps (bit `1<<n` = mark `n`), cloned per move. */
  pencil: Int32Array;
  /** `w²` given mask (nonzero = given), immutable, shared by reference. */
  immutable: Uint8Array;
  /** `w` display order of the elements, cloned per move. */
  sequence: Uint8Array;
  /** `w`; `dividers[i]` = the element that must be immediately right of `i` for
   * a divider to show there, or -1 for none. Cloned per move. */
  dividers: Int32Array;
  completed: boolean;
  cheated: boolean;
}

export function cloneState(s: GroupState): GroupState {
  return {
    w: s.w,
    diff: s.diff,
    id: s.id,
    grid: s.grid.slice(),
    pencil: s.pencil.slice(),
    immutable: s.immutable, // shared
    sequence: s.sequence.slice(),
    dividers: s.dividers.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

// --- ui --------------------------------------------------------------------

export interface GroupUi {
  /** Primary highlighted square, through `sequence`; shown iff `visible`. */
  cursor: GridCursor;
  /** The cursor position *before* mapping through `sequence`. */
  ohx: number;
  ohy: number;
  /** Diagonal multifill run starting at `ohx,ohy`: for `0<=i<odn`, the square is
   * `sequence[ohx+i·odx], sequence[ohy+i·ody]`. */
  odx: number;
  ody: number;
  odn: number;
  /** The current highlight is a pencil-mark highlight (vs a real one). */
  pencilMode: boolean;
  /** Whether the highlight is a keyboard cursor (survives keypresses, allowed
   * on immutable squares). */
  cursorFromKeyboard: boolean;
  /** Header drag in progress: 0 none, 1 row, 2 column. */
  drag: number;
  dragnum: number;
  dragpos: number;
  edgepos: number;
  /** Preference (default off): keep the mouse highlight after a pencil change. */
  pencilKeepHighlight: boolean;
}

export function newUi(_state: GroupState): GroupUi {
  return {
    cursor: newCursor(),
    ohx: 0,
    ohy: 0,
    odx: 0,
    ody: 0,
    odn: 0,
    pencilMode: false,
    cursorFromKeyboard: false,
    drag: 0,
    dragnum: 0,
    dragpos: 0,
    edgepos: 0,
    pencilKeepHighlight: true,
  };
}

// --- desc codec (decimal clues + a-z blank runs; `add-group-ts-port` D10) ---

/** Encode a full grid to the run-length desc (`encode_grid`): decimal element
 * numbers, `a`–`z` for runs of 1–26 blanks, `_` to separate a number from
 * adjacent content, with the "no `_` at the very corners" nicety and the
 * `run > 26` split. */
export function encodeGrid(grid: Uint8Array, area: number): string {
  let out = "";
  let run = 0;
  for (let i = 0; i <= area; i++) {
    const n = i < area ? grid[i] : -1;
    if (!n) {
      run++;
    } else {
      if (run) {
        while (run > 0) {
          const len = Math.min(run, 26); // 'a'..'z' = runs of 1..26
          out += String.fromCharCode(96 + len);
          run -= len;
        }
      } else if (out.length > 0 && n > 0) {
        // No unnecessary '_' before a number in the very top-left/bottom-right.
        out += "_";
      }
      if (n > 0) out += String(n);
      run = 0;
    }
  }
  return out;
}

/** Parse the desc into `grid` in place (`spec_to_grid`), throwing on
 * malformed input. */
function specToGrid(desc: string, grid: Uint8Array, area: number): void {
  let i = 0;
  let p = 0;
  while (p < desc.length && desc[p] !== ",") {
    const ch = desc[p];
    if (ch >= "a" && ch <= "z") {
      let run = desc.charCodeAt(p) - 97 + 1;
      p++;
      if (i + run > area) throw new Error("Too much data to fit in grid");
      while (run-- > 0) grid[i++] = 0;
    } else if (ch === "_") {
      p++;
    } else if (digitValue(ch) >= 1) {
      const num = parseLeadingInt(desc, p);
      p = num.next;
      if (i >= area) throw new Error("Too much data to fit in grid");
      grid[i++] = num.value;
    } else {
      throw new Error("Invalid character in game description");
    }
  }
}

/** Validate a grid desc without building the grid (`validate_grid_desc`):
 * distinguishes "not enough data" from "too much". `range` = `w`, `area` = `w²`. */
function validateGridDesc(desc: string, range: number, area: number): string | null {
  let squares = 0;
  let p = 0;
  while (p < desc.length && desc[p] !== ",") {
    const ch = desc[p];
    if (ch >= "a" && ch <= "z") {
      squares += desc.charCodeAt(p) - 97 + 1;
      p++;
    } else if (ch === "_") {
      p++;
    } else if (digitValue(ch) >= 1) {
      const num = parseLeadingInt(desc, p);
      p = num.next;
      const val = num.value;
      if (val < 1 || val > range) return "Out-of-range number in game description";
      squares++;
    } else {
      return "Invalid character in game description";
    }
  }
  if (squares < area) return "Not enough data to fill grid";
  if (squares > area) return "Too much data to fit in grid";
  return null;
}

export function validateDesc(p: GroupParams, desc: string): string | null {
  return validateGridDesc(desc, p.w, p.w * p.w);
}

export function newState(p: GroupParams, desc: string): GroupState {
  const w = p.w;
  const a = w * w;
  const grid = new Uint8Array(a);
  specToGrid(desc, grid, a);

  const immutable = new Uint8Array(a);
  for (let i = 0; i < a; i++) if (grid[i] !== 0) immutable[i] = 1;

  const sequence = new Uint8Array(w);
  const dividers = new Int32Array(w);
  for (let i = 0; i < w; i++) {
    sequence[i] = i;
    dividers[i] = -1;
  }

  return {
    w,
    diff: p.diff,
    id: p.id,
    grid,
    pencil: new Int32Array(a),
    immutable,
    sequence,
    dividers,
    completed: false,
    cheated: false,
  };
}

// --- error checking (check_errors) -----------------------------------------
// Per-cell error bits, packed to fit a signed Int32:
//   EF_LATIN (bit 30)   — cell's digit duplicates within its row or column.
//   EF_LEFT  (bits 0-14) — three 5-bit digits (a,b,c) of a failed (ab)c on this
//                          cell (the "(ab)c" side of an associativity failure).
//   EF_RIGHT (bits 15-29) — the same triple on the "a(bc)" side.

export const EF_DIGIT_SHIFT = 5;
export const EF_DIGIT_MASK = (1 << EF_DIGIT_SHIFT) - 1;
export const EF_LEFT_SHIFT = 0;
export const EF_RIGHT_SHIFT = 3 * EF_DIGIT_SHIFT;
export const EF_LEFT_MASK = (1 << (3 * EF_DIGIT_SHIFT)) - 1;
export const EF_RIGHT_MASK = EF_LEFT_MASK << EF_RIGHT_SHIFT;
export const EF_LATIN = 1 << (6 * EF_DIGIT_SHIFT);

/**
 * Compute the render-time error overlay for the *current* grid: Latin-square
 * duplicates and associativity failures, packed per cell into `errors` (an
 * `w²` Int32Array), and return whether any error fired. This is
 * self-consistency ("is the board a valid group table so far?"), distinct from
 * mistake-checking against the unique solution.
 *
 * It suffices to check Latin-square-hood and associativity: all other group
 * axioms follow (identity and inverses are derivable — see the C proof).
 */
export function checkErrors(state: GroupState, errors?: Int32Array): boolean {
  const w = state.w;
  const grid = state.grid;
  let errs = false;

  if (errors) errors.fill(0);

  // Latin check, rows then columns: cell k of line l is at l·lineStep + k·cellStep.
  for (const [lineStep, cellStep] of [
    [w, 1],
    [1, w],
  ] as const) {
    for (let l = 0; l < w; l++) {
      let mask = 0;
      let errmask = 0;
      for (let k = 0; k < w; k++) {
        const bit = 1 << grid[l * lineStep + k * cellStep];
        errmask |= mask & bit;
        mask |= bit;
      }
      if (mask !== (1 << (w + 1)) - (1 << 1)) {
        errs = true;
        errmask &= ~1;
        if (errors) {
          for (let k = 0; k < w; k++) {
            const i = l * lineStep + k * cellStep;
            if (errmask & (1 << grid[i])) errors[i] |= EF_LATIN;
          }
        }
      }
    }
  }

  // Associativity check: (ab)c must equal a(bc) wherever all four are known.
  for (let i = 1; i < w; i++)
    for (let j = 1; j < w; j++)
      for (let k = 1; k < w; k++) {
        const ab = grid[i * w + j];
        const bc = grid[j * w + k];
        if (!ab || !bc) continue;
        const left = (ab - 1) * w + k; // the (ab)c cell
        const right = i * w + (bc - 1); // the a(bc) cell
        if (!grid[left] || !grid[right] || grid[left] === grid[right]) continue;
        errs = true;
        // Skip if either slot is already used, so one square shows one error.
        if (
          errors &&
          !(errors[left] & EF_LEFT_MASK) &&
          !(errors[right] & EF_RIGHT_MASK)
        ) {
          let err = i + 1;
          err = (err << EF_DIGIT_SHIFT) | (j + 1);
          err = (err << EF_DIGIT_SHIFT) | (k + 1);
          errors[left] |= err << EF_LEFT_SHIFT;
          errors[right] |= err << EF_RIGHT_SHIFT;
        }
      }

  return errs;
}

/** Write `seq` into `out` with element `num` moved to display position `pos`:
 * a row/column reorder, and the live preview of one being dragged. */
export function moveInSequence(
  seq: Uint8Array,
  num: number,
  pos: number,
  out: Uint8Array,
): void {
  for (let i = 0, j = 0; i < seq.length; i++) {
    if (i === pos) {
      out[i] = num;
    } else {
      if (seq[j] === num) j++;
      out[i] = seq[j++];
    }
  }
}

// --- status / text ---------------------------------------------------------

export function status(s: GroupState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

/** ASCII grid of display chars (`.` for blank), matching `game_text_format`. */
export function textFormat(s: GroupState): string {
  const w = s.w;
  let out = "";
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const d = s.grid[y * w + x];
      out += d === 0 ? "." : toChar(d, s.id);
      out += x === w - 1 ? "\n" : " ";
    }
  }
  return out;
}
