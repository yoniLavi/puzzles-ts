/**
 * Types and pure state helpers for Unequal — the state/codec parts of
 * `unequal.c`.
 *
 * A board is an `order × order` Latin square of numbers `1..order`. Between some
 * pairs of orthogonally adjacent cells sit *clues*: in **Unequal** mode a
 * greater-than sign (`a > b`), in **Adjacent** mode a bar meaning the two numbers
 * differ by exactly 1 (and the absence of a bar means they do not). Each cell
 * holds an optional given number (`immutable`, shared by reference) and the
 * player's working number (`grid`) or pencil-mark bitmap (`pencil`). The
 * adjacency clues live in `clueFlags` (immutable); the player can grey out a clue
 * they have used (the `spent` flags, mutable).
 */

// --- difficulty ------------------------------------------------------------

export type Difficulty = "trivial" | "easy" | "tricky" | "extreme" | "recursive";

export const DIFF_LATIN = 0;
export const DIFF_EASY = 1;
export const DIFF_SET = 2;
export const DIFF_EXTREME = 3;
export const DIFF_RECURSIVE = 4;
export const DIFF_COUNT = 5;

// unequal_diffchars / unequal_diffnames, indexed by level.
const DIFF_CHARS = "tekxr";
const DIFF_NAMES = ["Trivial", "Easy", "Tricky", "Extreme", "Recursive"];
const DIFFS: Difficulty[] = ["trivial", "easy", "tricky", "extreme", "recursive"];

export function diffToLevel(d: Difficulty): number {
  const i = DIFFS.indexOf(d);
  return i < 0 ? DIFF_EASY : i;
}
export function diffFromLevel(level: number): Difficulty {
  return DIFFS[level] ?? "easy";
}
export function diffChar(d: Difficulty): string {
  return DIFF_CHARS[diffToLevel(d)];
}
export function diffName(d: Difficulty): string {
  return DIFF_NAMES[diffToLevel(d)];
}

// --- mode ------------------------------------------------------------------

export type Mode = "unequal" | "adjacent";

// --- flag bits (upstream F_*) ----------------------------------------------

export const F_ADJ_UP = 2;
export const F_ADJ_RIGHT = 4;
export const F_ADJ_DOWN = 8;
export const F_ADJ_LEFT = 16;
export const F_ERROR = 32;
export const F_ERROR_UP = 64;
export const F_ERROR_RIGHT = 128;
export const F_ERROR_DOWN = 256;
export const F_ERROR_LEFT = 512;
export const F_SPENT_UP = 1024;
export const F_SPENT_RIGHT = 2048;
export const F_SPENT_DOWN = 4096;
export const F_SPENT_LEFT = 8192;

export const F_ADJ_MASK = F_ADJ_UP | F_ADJ_RIGHT | F_ADJ_DOWN | F_ADJ_LEFT;
export const F_ERROR_MASK =
  F_ERROR | F_ERROR_UP | F_ERROR_RIGHT | F_ERROR_DOWN | F_ERROR_LEFT;
export const F_SPENT_MASK = F_SPENT_UP | F_SPENT_RIGHT | F_SPENT_DOWN | F_SPENT_LEFT;

/** `ADJ_TO_SPENT(F_ADJ_*) = F_ADJ_* << 9`. */
export function adjToSpent(f: number): number {
  return f << 9;
}

/**
 * The four orthogonal directions, in upstream `adjthan[]` order (up, right,
 * down, left). `f` is the clue flag toward the neighbour; `fo` the reciprocal
 * flag on the neighbour; `fe` the error flag; `dx`/`dy` the step; `c` the
 * Unequal glyph, `ac` the Adjacent glyph (text format).
 */
export const ADJTHAN: ReadonlyArray<{
  f: number;
  fo: number;
  fe: number;
  dx: number;
  dy: number;
  c: string;
  ac: string;
}> = [
  { f: F_ADJ_UP, fo: F_ADJ_DOWN, fe: F_ERROR_UP, dx: 0, dy: -1, c: "^", ac: "-" },
  { f: F_ADJ_RIGHT, fo: F_ADJ_LEFT, fe: F_ERROR_RIGHT, dx: 1, dy: 0, c: ">", ac: "|" },
  { f: F_ADJ_DOWN, fo: F_ADJ_UP, fe: F_ERROR_DOWN, dx: 0, dy: 1, c: "v", ac: "-" },
  { f: F_ADJ_LEFT, fo: F_ADJ_RIGHT, fe: F_ERROR_LEFT, dx: -1, dy: 0, c: "<", ac: "|" },
];

// --- params ----------------------------------------------------------------

export interface UnequalParams {
  order: number;
  mode: Mode;
  diff: Difficulty;
}

/** Upstream `unequal_presets`. */
export const PRESETS: UnequalParams[] = [
  { order: 4, mode: "unequal", diff: "easy" },
  { order: 5, mode: "unequal", diff: "easy" },
  { order: 5, mode: "unequal", diff: "tricky" },
  { order: 5, mode: "adjacent", diff: "tricky" },
  { order: 5, mode: "unequal", diff: "extreme" },
  { order: 6, mode: "unequal", diff: "easy" },
  { order: 6, mode: "unequal", diff: "tricky" },
  { order: 6, mode: "adjacent", diff: "tricky" },
  { order: 6, mode: "unequal", diff: "extreme" },
  { order: 7, mode: "unequal", diff: "tricky" },
  { order: 7, mode: "adjacent", diff: "tricky" },
  { order: 7, mode: "unequal", diff: "extreme" },
];

export function defaultParams(): UnequalParams {
  return { ...PRESETS[0] };
}

export function encodeParams(p: UnequalParams, full: boolean): string {
  let s = String(p.order);
  if (p.mode === "adjacent") s += "a";
  if (full) s += `d${diffChar(p.diff)}`;
  return s;
}

export function decodeParams(s: string): UnequalParams {
  const p = defaultParams();
  let i = 0;
  let digits = "";
  while (i < s.length && s[i] >= "0" && s[i] <= "9") digits += s[i++];
  if (digits) p.order = Number.parseInt(digits, 10);

  p.mode = "unequal";
  if (s[i] === "a") {
    i++;
    p.mode = "adjacent";
  }

  if (s[i] === "d") {
    i++;
    const idx = DIFF_CHARS.indexOf(s[i] ?? "");
    p.diff = idx >= 0 ? diffFromLevel(idx) : "easy";
  }
  return p;
}

export function validateParams(p: UnequalParams, _full: boolean): string | null {
  if (p.order < 3 || p.order > 32) return "Order must be between 3 and 32";
  if (diffToLevel(p.diff) >= DIFF_COUNT) return "Unknown difficulty rating";
  if (p.order < 5 && p.mode === "adjacent" && diffToLevel(p.diff) >= DIFF_SET)
    return "Order must be at least 5 for Adjacent puzzles of this difficulty.";
  return null;
}

// --- number <-> character (n2c / c2n) --------------------------------------

/** Render number `n` (1..order) as its display character. `0` → space. */
export function n2c(n: number, order: number): string {
  if (n === 0) return " ";
  if (order < 10) {
    if (n < 10) return String.fromCharCode(48 + n);
  } else {
    if (n < 11) return String.fromCharCode(48 + n - 1);
    const m = n - 11;
    if (m <= 26) return String.fromCharCode(65 + m);
  }
  return "?";
}

/** Parse a key/character to a number, or `-1` if not a digit. `' '`/backspace →
 * 0. Mirrors upstream `c2n` (includes keypresses for `interpretMove`). */
export function c2n(c: number, order: number): number {
  if (c < 0 || c > 0xff) return -1;
  if (c === 32 || c === 8) return 0; // space / backspace
  if (order < 10) {
    if (c >= 48 && c <= 57) return c - 48;
  } else {
    if (c >= 48 && c <= 57) return c - 48 + 1;
    if (c >= 65 && c <= 90) return c - 65 + 11;
    if (c >= 97 && c <= 122) return c - 97 + 11;
  }
  return -1;
}

// --- state -----------------------------------------------------------------

export interface UnequalState {
  order: number;
  mode: Mode;
  diff: Difficulty;
  /** `order²` given numbers (0 = blank); immutable, shared by reference. */
  immutable: Int8Array;
  /** `order²` adjacency clue flags (`F_ADJ_*`); immutable, shared by reference. */
  clueFlags: Int32Array;
  /** `order²` working numbers (0 = blank); cloned per move. */
  grid: Int8Array;
  /** `order²` pencil-mark bitmaps (bit `1<<n` = mark `n`); cloned per move. */
  pencil: Int32Array;
  /** `order²` struck-clue ("spent") flags (`F_SPENT_*`); cloned per move. */
  spent: Int32Array;
  completed: boolean;
  cheated: boolean;
}

export function cloneState(s: UnequalState): UnequalState {
  return {
    order: s.order,
    mode: s.mode,
    diff: s.diff,
    immutable: s.immutable, // immutable, shared
    clueFlags: s.clueFlags, // immutable, shared
    grid: s.grid.slice(),
    pencil: s.pencil.slice(),
    spent: s.spent.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

// --- moves -----------------------------------------------------------------

export type UnequalMove =
  /** Enter (or pencil-toggle) number `n` at `(x, y)`; `n = 0` clears.
   * `autoElim` (auto-pencil mode, baked at move-creation time off the Ui
   * preference for deterministic replay) additionally strikes `n` from the
   * pencil marks of every other cell in the same row and column on a real
   * placement. */
  | {
      type: "set";
      x: number;
      y: number;
      n: number;
      pencil: boolean;
      autoElim?: boolean;
    }
  /** Toggle the struck-through ("spent") state of the clue at `(x, y)` in the
   * given direction (`flag` is the `F_SPENT_*` bit). */
  | { type: "spent"; x: number; y: number; flag: number }
  /** Fill in every pencil mark everywhere (the `M` key / fill-all button). */
  | { type: "pencilAll" }
  /** Strike (clear) the listed pencil candidates atomically — a hint's
   * single-firing elimination. Idempotent and resume-safe. */
  | { type: "pencilStrike"; marks: { x: number; y: number; n: number }[] }
  /** Auto-solve to the given full grid. */
  | { type: "solve"; grid: number[] };

// --- ui --------------------------------------------------------------------

export interface UnequalUi {
  hx: number;
  hy: number;
  hpencil: boolean;
  hshow: boolean;
  hcursor: boolean;
  /** Preference (default off): keep the mouse highlight after a pencil change. */
  pencilKeepHighlight: boolean;
  /** Preference (default on): right-click toggles a *sticky* pencil mode. */
  pencilSticky: boolean;
  /** Preference (default on): placing a number strikes it from the pencil marks
   * of every other cell in its row and column. */
  autoPencil: boolean;
}

export function newUi(_state: UnequalState): UnequalUi {
  return {
    hx: 0,
    hy: 0,
    hpencil: false,
    hshow: false,
    hcursor: false,
    pencilKeepHighlight: false,
    pencilSticky: true,
    // Default off (owner, 2026-06-29): placing a digit no longer auto-strikes its
    // row/column notes. Notes clear only via the mark-all button or a hint; opt
    // back in through the "auto-pencil" pref.
    autoPencil: false,
  };
}

// --- desc codec ------------------------------------------------------------

/** Parse the per-cell desc into `(numbers, flags)`, or throw with a reason. */
function parseDesc(
  order: number,
  desc: string,
): { nums: Int8Array; flags: Int32Array } {
  const o = order;
  const a = o * o;
  const nums = new Int8Array(a);
  const flags = new Int32Array(a);
  let i = 0; // cell index
  let p = 0; // string index

  while (p < desc.length) {
    while (p < desc.length && desc[p] >= "a" && desc[p] <= "z") {
      i += desc.charCodeAt(p) - 97 + 1;
      p++;
    }
    if (i >= a) throw new Error("Too much data to fill grid");
    if (p >= desc.length || desc[p] < "0" || desc[p] > "9")
      throw new Error("Expecting number in game description");
    let num = "";
    while (p < desc.length && desc[p] >= "0" && desc[p] <= "9") num += desc[p++];
    const n = Number.parseInt(num, 10);
    if (n < 0 || n > o) throw new Error("Out-of-range number in game description");
    nums[i] = n;

    while (p < desc.length && "URDL".includes(desc[p])) {
      switch (desc[p]) {
        case "U":
          flags[i] |= F_ADJ_UP;
          break;
        case "R":
          flags[i] |= F_ADJ_RIGHT;
          break;
        case "D":
          flags[i] |= F_ADJ_DOWN;
          break;
        case "L":
          flags[i] |= F_ADJ_LEFT;
          break;
      }
      p++;
    }
    i++;
    if (i < a && desc[p] !== ",") throw new Error("Missing separator");
    if (desc[p] === ",") p++;
  }
  if (i < a) throw new Error("Not enough data to fill grid");
  return { nums, flags };
}

/** Cross-check the adjacency flags: a flag must not point off the grid, and the
 * reciprocal-flag rule depends on mode. */
function checkFlags(order: number, mode: Mode, flags: Int32Array): string | null {
  const o = order;
  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      for (let n = 0; n < 4; n++) {
        if (flags[y * o + x] & ADJTHAN[n].f) {
          const nx = x + ADJTHAN[n].dx;
          const ny = y + ADJTHAN[n].dy;
          if (nx < 0 || ny < 0 || nx >= o || ny >= o) return "Flags go off grid";
          if (mode === "adjacent") {
            if (!(flags[ny * o + nx] & ADJTHAN[n].fo))
              return "Flags contradicting each other";
          } else {
            if (flags[ny * o + nx] & ADJTHAN[n].fo)
              return "Flags contradicting each other";
          }
        }
      }
    }
  }
  return null;
}

export function validateDesc(p: UnequalParams, desc: string): string | null {
  let parsed: { nums: Int8Array; flags: Int32Array };
  try {
    parsed = parseDesc(p.order, desc);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return checkFlags(p.order, p.mode, parsed.flags);
}

export function newState(p: UnequalParams, desc: string): UnequalState {
  const o = p.order;
  const a = o * o;
  const { nums, flags } = parseDesc(o, desc);

  const immutable = new Int8Array(a);
  const grid = new Int8Array(a);
  for (let i = 0; i < a; i++) {
    if (nums[i] !== 0) {
      immutable[i] = nums[i];
      grid[i] = nums[i];
    }
  }

  return {
    order: o,
    mode: p.mode,
    diff: p.diff,
    immutable,
    clueFlags: flags,
    grid,
    pencil: new Int32Array(a),
    spent: new Int32Array(a),
    completed: false,
    cheated: false,
  };
}

// --- error checking (check_complete / check_num_error / check_num_adj) ------

/**
 * Check the grid for completion and (optionally) mark errors into `errFlags`
 * (an `order²` array of `F_ERROR | F_ERROR_*` bits per cell). Returns:
 *   `-1` wrong · `0` incomplete · `1` complete and correct.
 * Faithful to `check_complete` + `check_num_error` + `check_num_adj`.
 */
export function checkComplete(state: UnequalState, errFlags?: Int32Array): number {
  const o = state.order;
  const grid = state.grid;
  let ret = 1;

  if (errFlags) errFlags.fill(0);

  for (let x = 0; x < o; x++) {
    for (let y = 0; y < o; y++) {
      const i = y * o + x;
      const val = grid[i];
      if (val === 0) {
        ret = 0;
        continue;
      }

      // check_num_error: duplicates in the same row / column.
      let dup = false;
      for (let yy = 0; yy < o; yy++) if (yy !== y && grid[yy * o + x] === val) dup = true;
      for (let xx = 0; xx < o; xx++) if (xx !== x && grid[y * o + xx] === val) dup = true;
      if (dup) {
        ret = -1;
        if (errFlags) errFlags[i] |= F_ERROR;
      }

      // check_num_adj: clue violations toward filled neighbours.
      const f = state.clueFlags[i];
      for (let d = 0; d < 4; d++) {
        const nx = x + ADJTHAN[d].dx;
        const ny = y + ADJTHAN[d].dy;
        if (nx < 0 || nx >= o || ny < 0 || ny >= o) continue;
        const dn = grid[ny * o + nx];
        if (dn === 0) continue;
        const adj = (f & ADJTHAN[d].f) !== 0;
        if (state.mode === "adjacent") {
          const gd = Math.abs(val - dn);
          if ((adj && gd !== 1) || (!adj && gd === 1)) {
            ret = -1;
            if (errFlags) errFlags[i] |= ADJTHAN[d].fe;
          }
        } else {
          if (adj && val <= dn) {
            ret = -1;
            if (errFlags) errFlags[i] |= ADJTHAN[d].fe;
          }
        }
      }
    }
  }

  return ret;
}

// --- status / text ---------------------------------------------------------

export function status(s: UnequalState): "solved" | "ongoing" {
  return s.completed ? "solved" : "ongoing";
}

/** ASCII grid with inter-cell clue glyphs, matching `game_text_format`. */
export function textFormat(s: UnequalState): string {
  const o = s.order;
  const grid = s.grid;
  const flags = s.clueFlags;
  let out = "";

  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      const n = grid[y * o + x];
      out += n > 0 ? n2c(n, o) : ".";
      if (x < o - 1) {
        if (s.mode === "adjacent") {
          out += flags[y * o + x] & F_ADJ_RIGHT ? "|" : " ";
        } else if (flags[y * o + x] & F_ADJ_RIGHT) out += ">";
        else if (flags[y * o + x + 1] & F_ADJ_LEFT) out += "<";
        else out += " ";
      }
    }
    out += "\n";

    if (y < o - 1) {
      for (let x = 0; x < o; x++) {
        if (s.mode === "adjacent") {
          out += flags[y * o + x] & F_ADJ_DOWN ? "-" : " ";
        } else if (flags[y * o + x] & F_ADJ_DOWN) out += "v";
        else if (flags[(y + 1) * o + x] & F_ADJ_UP) out += "^";
        else out += " ";
        if (x < o - 1) out += " ";
      }
      out += "\n";
    }
  }

  return out;
}
