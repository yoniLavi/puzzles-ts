import { digitValue, isDigit, parseLeadingInt } from "../../engine/decimal.ts";
import { tierNames } from "../../engine/difficulty.ts";
import type { ParamConfigItem } from "../../engine/game.ts";
import { parseConfigInt } from "../../engine/params.ts";
import { choice, paramsCodec, size } from "../../engine/params-codec.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { newCursor } from "../../engine/pointer.ts";
import type { Point } from "../../engine/types.ts";

/**
 * Types and pure state helpers for Towers (Skyscrapers) — the state/codec
 * parts of `towers.c`.
 *
 * A board is a `w × w` Latin square of tower heights `1..w`. Each cell holds
 * an optional given height (`immutable`, shared by reference) and the player's
 * working height (`grid`) or pencil-mark bitmap (`pencil`). Around the grid sit
 * `4w` edge clues (top row, bottom row, left column, right column), each the
 * count of towers visible from that edge — a taller tower hides every shorter
 * one behind it.
 */

// --- difficulty ------------------------------------------------------------

/** The tiers in level order, so a tier's index is its level. */
const DIFFS = ["easy", "hard", "extreme", "unreasonable"] as const;
export type Difficulty = (typeof DIFFS)[number];

export const DIFF_EASY = 0;
export const DIFF_HARD = 1;
export const DIFF_EXTREME = 2;
export const DIFF_UNREASONABLE = 3;

const DIFF_CHARS = "ehxu"; // towers_diffchars, indexed by level
const DIFF_NAMES = tierNames(4, { search: true });

export function diffToLevel(d: Difficulty): number {
  return Math.max(DIFF_EASY, DIFFS.indexOf(d));
}
export function diffFromLevel(level: number): Difficulty {
  return DIFFS[level] ?? "easy";
}
export function diffName(d: Difficulty): string {
  return DIFF_NAMES[diffToLevel(d)];
}

// --- params ----------------------------------------------------------------

export interface TowersParams {
  w: number;
  diff: Difficulty;
}

export function defaultParams(): TowersParams {
  return { w: 5, diff: "easy" };
}

/** The "Custom type…" form, and the field list the codec below encodes. A
 * Towers board is square, so its size is one untagged leading integer. */
export const paramConfig: ParamConfigItem<TowersParams>[] = [
  {
    kw: "grid-size",
    name: "Grid size",
    type: "string",
    get: (p) => String(p.w),
    set: (p, v) => {
      p.w = parseConfigInt(v);
    },
  },
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

/** The order, plus the generator-only difficulty letter. An unknown letter
 * leaves the default tier. */
export const { encodeParams, decodeParams } = paramsCodec(defaultParams, [
  size(paramConfig, "grid-size"),
  choice(paramConfig, "d", "difficulty", DIFF_CHARS, { full: true }),
]);

export function validateParams(p: TowersParams, _full: boolean): string | null {
  if (p.w < 3 || p.w > 9) return "Grid size must be between 3 and 9";
  return null;
}

// --- clue geometry (STARTSTEP / CLUEPOS / clue_index / is_clue) ------------

/**
 * The `w` grid cells along edge-clue `index`'s line, nearest the clue first.
 * `index` runs top row (`0..w-1`), bottom row (`w..2w-1`), left column
 * (`2w..3w-1`), right column (`3w..4w-1`).
 */
export function lineCells(index: number, w: number): Point[] {
  const out: Point[] = [];
  if (index < w) {
    const x = index;
    for (let j = 0; j < w; j++) out.push({ x, y: j });
  } else if (index < 2 * w) {
    const x = index - w;
    for (let j = 0; j < w; j++) out.push({ x, y: w - 1 - j });
  } else if (index < 3 * w) {
    const y = index - 2 * w;
    for (let j = 0; j < w; j++) out.push({ x: j, y });
  } else {
    const y = index - 3 * w;
    for (let j = 0; j < w; j++) out.push({ x: w - 1 - j, y });
  }
  return out;
}

/** Border coordinate (x or y may be `-1` or `w`) of edge-clue `index`. */
export function cluePos(index: number, w: number): Point {
  if (index < w) return { x: index, y: -1 };
  if (index < 2 * w) return { x: index - w, y: w };
  if (index < 3 * w) return { x: -1, y: index - 2 * w };
  return { x: w, y: index - 3 * w };
}

/** Inverse of {@link cluePos}: the clue index of a border coordinate, or `-1`
 * when `(x, y)` is not a border cell. */
export function clueIndex(x: number, y: number, w: number): number {
  if (x === -1 || x === w) return w * (x === -1 ? 2 : 3) + y;
  if (y === -1 || y === w) return (y === -1 ? 0 : w) + x;
  return -1;
}

/** True iff `(x, y)` is a border position holding a (nonzero) clue. */
export function isClue(state: TowersState, x: number, y: number): boolean {
  const w = state.w;
  if (
    ((x === -1 || x === w) && y >= 0 && y < w) ||
    ((y === -1 || y === w) && x >= 0 && x < w)
  ) {
    return state.clues[clueIndex(x, y, w)] !== 0;
  }
  return false;
}

// --- state -----------------------------------------------------------------

export interface TowersState {
  w: number;
  diff: Difficulty;
  /** `4w` edge clues (0 = none); immutable, shared by reference. */
  clues: Int32Array;
  /** `w²` given heights (0 = blank); immutable, shared by reference. */
  immutable: Int8Array;
  /** `w²` working heights (0 = blank); cloned per move. */
  grid: Int8Array;
  /** `w²` pencil-mark bitmaps (bit `1<<n` = mark `n`); cloned per move. */
  pencil: Int32Array;
  /** `4w` clue struck-through flags; cloned per move. */
  cluesDone: Uint8Array;
  completed: boolean;
  cheated: boolean;
}

export function cloneState(s: TowersState): TowersState {
  return {
    w: s.w,
    diff: s.diff,
    clues: s.clues, // immutable, shared
    immutable: s.immutable, // immutable, shared
    grid: s.grid.slice(),
    pencil: s.pencil.slice(),
    cluesDone: s.cluesDone.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

// --- moves -----------------------------------------------------------------

export type TowersMove =
  /** Enter (or pencil-toggle) height `n` at `(x, y)`; `n = 0` clears.
   * `autoElim` (auto-pencil mode, decided at move-creation time off the Ui
   * preference, so replay is deterministic) additionally strikes height `n`
   * from the pencil marks of every other cell in the same row and column when
   * this is a real placement. */
  | {
      type: "set";
      x: number;
      y: number;
      n: number;
      pencil: boolean;
      autoElim?: boolean;
    }
  /** Toggle the struck-through state of edge-clue `index`. */
  | { type: "clueDone"; index: number }
  /** Fill every candidate into each empty, note-less cell (the `M` key /
   * fill-all button). */
  | { type: "pencilAll" }
  /** Strike (clear) the listed pencil candidates atomically — a hint's
   * single-firing elimination. Clearing an absent candidate is a no-op, so this
   * is idempotent and resume-safe (unlike a `set` pencil toggle). */
  | { type: "pencilStrike"; marks: { x: number; y: number; n: number }[] }
  /** Auto-solve to the given full grid. */
  | { type: "solve"; grid: number[] };

// --- ui --------------------------------------------------------------------

export interface TowersUi {
  cursor: GridCursor;
  pencilMode: boolean;
  cursorFromKeyboard: boolean;
  /** Preference: 3D tower rendering (vs flat 2D digits). Default on. */
  threeD: boolean;
  /** Preference: keep the mouse highlight after a pencil-mark change. */
  pencilKeepHighlight: boolean;
  /** Preference (default on): right-click toggles a *sticky* pencil mode —
   * once on, left-clicks keep entering pencil marks until right-clicked again
   * (mobile-style), instead of every left-click reverting to real entry. */
  pencilSticky: boolean;
  /** Preference (default off, so notes clear only via mark-all or a hint):
   * when you place a tower, immediately strike that height from the pencil
   * marks of every other cell in its row and column. When on, hints also skip
   * teaching those trivial eliminations and lean on the placement instead. */
  autoPencil: boolean;
}

export function newUi(_state: TowersState): TowersUi {
  return {
    cursor: newCursor(),
    pencilMode: false,
    cursorFromKeyboard: false,
    threeD: true,
    pencilKeepHighlight: true,
    pencilSticky: true,
    autoPencil: false,
  };
}

// --- desc codec ------------------------------------------------------------

export function validateDesc(p: TowersParams, desc: string): string | null {
  const w = p.w;
  const a = w * w;
  let i = 0; // string index
  for (let c = 0; c < 4 * w; c++) {
    if (i >= desc.length) return "Too few clues for grid size";
    if (c > 0) {
      if (desc[i] !== "/") return "Expected slashes between clues";
      i++;
    }
    if (i < desc.length && isDigit(desc[i])) {
      const { value: clue, next } = parseLeadingInt(desc, i);
      i = next;
      if (clue <= 0 || clue > w) return "Clue number out of range";
    }
  }
  if (desc[i] === "/") return "Too many clues for grid size";

  if (desc[i] === ",") {
    let squares = 0;
    i++;
    while (i < desc.length) {
      const ch = desc[i++];
      if (ch >= "a" && ch <= "z") {
        squares += ch.charCodeAt(0) - 97 + 1;
      } else if (ch === "_") {
        // separator, no cell
      } else if (digitValue(ch) >= 1) {
        const { value: val, next } = parseLeadingInt(desc, i - 1);
        i = next;
        if (val < 1 || val > w) return "Out-of-range number in grid description";
        squares++;
      } else {
        return "Invalid character in game description";
      }
    }
    if (squares < a) return "Not enough data to fill grid";
    if (squares > a) return "Too much data to fit in grid";
  }

  if (i < desc.length) return "Rubbish at end of game description";
  return null;
}

export function newState(p: TowersParams, desc: string): TowersState {
  const w = p.w;
  const a = w * w;
  const clues = new Int32Array(4 * w);
  const immutable = new Int8Array(a);
  const grid = new Int8Array(a);

  let i = 0;
  for (let c = 0; c < 4 * w; c++) {
    if (c > 0) i++; // skip '/'
    if (i < desc.length && isDigit(desc[i])) {
      const { value, next } = parseLeadingInt(desc, i);
      clues[c] = value;
      i = next;
    }
  }

  if (desc[i] === ",") {
    let pos = 0;
    i++;
    while (i < desc.length) {
      const ch = desc[i++];
      if (ch >= "a" && ch <= "z") {
        pos += ch.charCodeAt(0) - 97 + 1;
      } else if (ch === "_") {
        // separator
      } else if (digitValue(ch) >= 1) {
        const { value: val, next } = parseLeadingInt(desc, i - 1);
        i = next;
        grid[pos] = val;
        immutable[pos] = val;
        pos++;
      }
    }
  }

  return {
    w,
    diff: p.diff,
    clues,
    immutable,
    grid,
    pencil: new Int32Array(a),
    cluesDone: new Uint8Array(4 * w),
    completed: false,
    cheated: false,
  };
}

// --- error checking (check_errors) -----------------------------------------

/**
 * Mark every cell/clue that is currently in error. When `errors` (a `(w+2)²`
 * array, the clue ring + play area) is provided it is filled in; either way
 * the function returns whether any error exists. A full, valid grid has no
 * errors — the completion test (`!checkErrors`) relies on that.
 */
export function checkErrors(state: TowersState, errors?: Uint8Array): boolean {
  const w = state.w;
  const W = w + 2;
  const clues = state.clues;
  const grid = state.grid;
  let errs = false;

  if (errors) errors.fill(0);

  const full = (1 << (w + 1)) - (1 << 1); // bits 1..w set

  // Row duplicates.
  for (let y = 0; y < w; y++) {
    let mask = 0;
    let errmask = 0;
    for (let x = 0; x < w; x++) {
      const bit = 1 << grid[y * w + x];
      errmask |= mask & bit;
      mask |= bit;
    }
    if (mask !== full) {
      errs = true;
      errmask &= ~1;
      if (errors) {
        for (let x = 0; x < w; x++) {
          if (errmask & (1 << grid[y * w + x])) errors[(y + 1) * W + (x + 1)] = 1;
        }
      }
    }
  }

  // Column duplicates.
  for (let x = 0; x < w; x++) {
    let mask = 0;
    let errmask = 0;
    for (let y = 0; y < w; y++) {
      const bit = 1 << grid[y * w + x];
      errmask |= mask & bit;
      mask |= bit;
    }
    if (mask !== full) {
      errs = true;
      errmask &= ~1;
      if (errors) {
        for (let y = 0; y < w; y++) {
          if (errmask & (1 << grid[y * w + x])) errors[(y + 1) * W + (x + 1)] = 1;
        }
      }
    }
  }

  // Clue visibility violations.
  for (let i = 0; i < 4 * w; i++) {
    if (!clues[i]) continue;
    const cells = lineCells(i, w);
    let best = 0;
    let n = 0;
    for (let j = 0; j < w; j++) {
      const number = grid[cells[j].y * w + cells[j].x];
      if (!number) break; // can't tell what happens next
      if (number > best) {
        best = number;
        n++;
      }
    }
    if (n > clues[i] || (best === w && n < clues[i]) || (best < w && n === clues[i])) {
      if (errors) {
        const { x, y } = cluePos(i, w);
        errors[(y + 1) * W + (x + 1)] = 1;
      }
      errs = true;
    }
  }

  return errs;
}

// --- status / text ---------------------------------------------------------

export function status(s: TowersState): "solved" | "ongoing" {
  return s.completed ? "solved" : "ongoing";
}

/** ASCII grid with the four clue rims, matching `game_text_format`. */
export function textFormat(s: TowersState): string {
  const w = s.w;
  const clues = s.clues;
  const grid = s.grid;
  const ch = (n: number): string => (n ? String(n) : " ");
  let out = "";

  // Top clue row.
  out += "  ";
  for (let x = 0; x < w; x++) out += ` ${ch(clues[x])}`;
  out += "\n\n";

  // Main grid.
  for (let y = 0; y < w; y++) {
    out += ch(clues[y + 2 * w]);
    out += " ";
    for (let x = 0; x < w; x++) out += ` ${ch(grid[y * w + x])}`;
    out += "  ";
    out += ch(clues[y + 3 * w]);
    out += "\n";
  }

  // Bottom clue row.
  out += "\n  ";
  for (let x = 0; x < w; x++) out += ` ${ch(clues[x + w])}`;
  out += "\n";

  return out;
}
