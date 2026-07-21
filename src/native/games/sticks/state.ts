/**
 * Sticks (Tatebo-Yokobo) state, params, move/ui types, and the desc codec —
 * port of the corresponding parts of `puzzles/unreleased/sticks.c`.
 *
 * The board is a `Uint8Array` `grid` of the C flag byte per cell (`F_HOR` /
 * `F_VER` / `F_BLOCK`) plus a parallel `Int16Array` `numbers` of clue values
 * (`-1` = none). Black cells and clue numbers are fixed puzzle data decoded
 * from the desc; only the line bits on white cells are player state. The
 * transient `F_ERROR` / `F_CURSOR` bits upstream mixes into the grid are kept
 * out of persisted state — live errors are recomputed on demand (solver.ts)
 * and the cursor is drawn from the `Ui`.
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { SYMM_MAX, SYMM_ROT2, SYMM_ROT4 } from "../../engine/symmetric-blacks.ts";

// --- cell flag bits (upstream values) ---------------------------------------

export const F_HOR = 0x01;
export const F_VER = 0x02;
export const F_BLOCK = 0x04;

// --- types ------------------------------------------------------------------

export interface SticksParams {
  w: number;
  h: number;
  /** Percentage of black squares (5..100). */
  blackpc: number;
  /** One of the shared `SYMM_*` constants (engine/symmetric-blacks.ts). */
  symm: number;
}

export interface SticksState {
  w: number;
  h: number;
  /** Flag byte per cell, row-major (`F_HOR` / `F_VER` / `F_BLOCK`). */
  grid: Uint8Array;
  /** Clue number per cell, `-1` for none — fixed puzzle data. */
  numbers: Int16Array;
  completed: boolean;
  cheated: boolean;
}

/** What a single cell edit sets the cell to. */
export type SticksLine = "hor" | "ver" | "none";

/**
 * A move is either a *set* — a batch of per-cell line settings committed
 * together (one click, one keyboard place, or a whole drag; upstream's
 * `A%d;B%d;C%d;…` string) — or a *solve* — the full-grid solution fill
 * (upstream's `S` string, one entry per cell; black cells' entries ignored).
 */
export type SticksMove =
  | { kind: "set"; changes: ReadonlyArray<{ index: number; line: SticksLine }> }
  | { kind: "solve"; grid: ReadonlyArray<SticksLine> };

/** The drag state machine phases (upstream `DRAG_*`). */
export type SticksDragType = "none" | "start" | "line" | "clear";

export interface SticksUi {
  /** Keyboard cursor. */
  cx: number;
  cy: number;
  cursor: boolean;
  /** Bounding box of the pointer positions seen since the drag last
   * committed a cell — the axis test that decides the drag orientation. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  dragType: SticksDragType;
  /** Accreted cell indices of the in-flight drag, previewed by the
   * renderer and committed as one `set` move on release. */
  drag: number[];
  /** Per-`drag`-entry tile value being previewed (`F_HOR`/`F_VER`/0). */
  dragMove: number[];
}

/** A white cell whose placed line contradicts the unique solution. */
export interface SticksMistake {
  index: number;
}

// --- params -----------------------------------------------------------------

const PRESETS: SticksParams[] = [
  { w: 7, h: 7, blackpc: 20, symm: SYMM_ROT2 },
  { w: 10, h: 10, blackpc: 20, symm: SYMM_ROT2 },
];

export function defaultParams(): SticksParams {
  return { ...PRESETS[0] };
}

export function presets(): PresetMenu<SticksParams> {
  return {
    title: "Sticks",
    submenu: PRESETS.map((p) => ({ title: `${p.w}x${p.h}`, params: { ...p } })),
  };
}

export function encodeParams(p: SticksParams, full: boolean): string {
  return full ? `${p.w}x${p.h}b${p.blackpc}s${p.symm}` : `${p.w}x${p.h}`;
}

/** atoi at `s[pos]`: parse a leading run of digits, 0 when there are none. */
function eatNum(s: string, pos: number): { value: number; next: number } {
  let next = pos;
  while (next < s.length && s[next] >= "0" && s[next] <= "9") next++;
  return { value: next > pos ? Number.parseInt(s.slice(pos, next), 10) : 0, next };
}

export function decodeParams(s: string): SticksParams {
  // Lenient, matching upstream decode_params (which mutates a copy of the
  // current params; a fresh decode starts from the default preset).
  const p = defaultParams();
  let r = eatNum(s, 0);
  p.w = r.value;
  let pos = r.next;
  p.h = p.w;
  if (s[pos] === "x") {
    r = eatNum(s, pos + 1);
    p.h = r.value;
    pos = r.next;
  }
  if (s[pos] === "b") {
    r = eatNum(s, pos + 1);
    p.blackpc = r.value;
    pos = r.next;
  }
  if (s[pos] === "s") {
    r = eatNum(s, pos + 1);
    p.symm = r.value;
  } else if (p.symm === SYMM_ROT4 && p.w !== p.h) {
    // Cope with user input such as '18x10' by ensuring symmetry is not
    // selected by default to be incompatible with dimensions (upstream).
    p.symm = SYMM_ROT2;
  }
  return p;
}

export function validateParams(p: SticksParams, full: boolean): string | null {
  if (p.w < 2 || p.h < 2) return "Width and height must be at least 2";
  if (full) {
    if (p.blackpc < 5 || p.blackpc > 100)
      return "Percentage of black squares must be between 5% and 100%";
    if (p.w !== p.h && p.symm === SYMM_ROT4)
      return "4-fold symmetry is only available with square grids";
    if (p.symm < 0 || p.symm >= SYMM_MAX) return "Unknown symmetry type";
  }
  return null;
}

// --- desc codec (byte-match surface, upstream new_game_desc/new_game) -------

const CODE_a = "a".charCodeAt(0);

const isDigit = (c: string | undefined): boolean =>
  c !== undefined && c >= "0" && c <= "9";

/**
 * Validate the run-length desc, faithful to upstream `validate_desc`'s
 * position count: lowercase letters advance by `(c - 'a') + 1` (`z` = 26),
 * `B` is a black cell (advancing only when no clue digit follows — a
 * `B<digits>` pair shares one cell), a digit run is an inline clue on the
 * current cell, and `_` is an inert separator.
 */
export function validateDesc(p: SticksParams, desc: string): string | null {
  const s = p.w * p.h;
  let pos = 0;
  let i = 0;
  while (i < desc.length) {
    const c = desc[i];
    if (c >= "a" && c <= "z") {
      pos += c.charCodeAt(0) - CODE_a + 1;
    } else if (c === "B") {
      if (!isDigit(desc[i + 1])) pos++;
    } else if (isDigit(c)) {
      while (i < desc.length && isDigit(desc[i])) i++;
      pos++;
      continue;
    } else if (c !== "_") {
      return "Description contains invalid characters";
    }
    i++;
  }
  if (pos < s) return "Description is too short";
  if (pos > s) return "Description is too long";
  return null;
}

/** Decode a validated desc into a fresh state (upstream `new_game`). */
export function newState(p: SticksParams, desc: string): SticksState {
  const { w, h } = p;
  const grid = new Uint8Array(w * h);
  const numbers = new Int16Array(w * h).fill(-1);
  let pos = 0;
  let i = 0;
  while (i < desc.length) {
    const c = desc[i];
    if (c >= "a" && c < "z") {
      pos += c.charCodeAt(0) - CODE_a + 1;
    } else if (c === "z") {
      pos += 26;
    } else if (c === "B") {
      grid[pos] = F_BLOCK;
      if (!isDigit(desc[i + 1])) pos++;
    } else if (isDigit(c)) {
      let j = i;
      while (j < desc.length && isDigit(desc[j])) j++;
      numbers[pos] = Number.parseInt(desc.slice(i, j), 10);
      pos++;
      i = j;
      continue;
    }
    // '_' (and anything else validateDesc would have rejected) is inert.
    i++;
  }
  return { w, h, grid, numbers, completed: false, cheated: false };
}

/**
 * Encode a generated board's blacks + clues as a desc — the exact inverse of
 * {@link newState} and byte-for-byte upstream `new_game_desc`'s encode loop:
 * runs of plain blank cells become lowercase letters (chaining `z` for runs
 * over 26), `_` separates a clue-bearing white cell from a directly preceding
 * emitted cell, `B` marks a black cell, digits are the current cell's clue.
 */
export function encodeDesc(
  grid: Uint8Array,
  numbers: Int16Array,
  w: number,
  h: number,
): string {
  let out = "";
  let run = 0;
  for (let i = 0; i < w * h; i++) {
    if (numbers[i] !== -1 || grid[i] & F_BLOCK) {
      if (run) {
        while (run > 26) {
          out += "z";
          run -= 26;
        }
        out += String.fromCharCode(CODE_a + run - 1);
        run = 0;
      } else if (i !== 0 && !(grid[i] & F_BLOCK)) {
        out += "_";
      }
      if (grid[i] & F_BLOCK) out += "B";
      if (numbers[i] !== -1) out += String(numbers[i]);
    } else {
      run++;
    }
  }
  if (run) {
    while (run > 26) {
      out += "z";
      run -= 26;
    }
    out += String.fromCharCode(CODE_a + run - 1);
  }
  return out;
}

export function cloneState(s: SticksState): SticksState {
  return { ...s, grid: s.grid.slice(), numbers: s.numbers.slice() };
}

export function status(s: SticksState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- text format (upstream game_text_format) --------------------------------

export function textFormat(s: SticksState): string {
  const { w, h, grid } = s;
  let out = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = grid[y * w + x];
      out += tile & F_HOR ? "-" : tile & F_VER ? "|" : tile & F_BLOCK ? "#" : ".";
      out += x !== w - 1 ? " " : "\n";
    }
  }
  return out;
}
