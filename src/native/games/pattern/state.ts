/**
 * Pattern (Nonograms) state, params, and desc codec — idiomatic TS port of
 * the state half of `pattern.c`. Reconstruct a black/white grid from the
 * run-length clues listed for every row and column.
 *
 * Cell values are upstream's: a cell is `GRID_UNKNOWN` (undecided),
 * `GRID_FULL` (black) or `GRID_EMPTY` (white/background). The immutable
 * clue arrays live on a frozen `common` object shared by reference across
 * a game's states (upstream's refcounted `game_state_common`); only the
 * `grid` plus `completed`/`cheated` clone per move.
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions } from "../../engine/params.ts";

// --- cell values (upstream #defines) -------------------------------------
export const GRID_EMPTY = 0;
export const GRID_FULL = 1;
export const GRID_UNKNOWN = 2;
export type GridVal = typeof GRID_EMPTY | typeof GRID_FULL | typeof GRID_UNKNOWN;

// --- types ---------------------------------------------------------------

export interface PatternParams {
  w: number;
  h: number;
}

/** The immutable, shared part of a Pattern game (upstream
 * `game_state_common`): board size, the per-line run-length clues, the
 * immutable pre-filled squares (only an externally-supplied picture desc
 * carries any), and the chosen clue font size. */
export interface PatternCommon {
  readonly w: number;
  readonly h: number;
  /** Run-length clues per line: indices `0..w-1` are columns (top clues),
   * `w..w+h-1` are rows (left clues). An empty line is an empty array. */
  readonly clues: readonly (readonly number[])[];
  /** 1 where a cell is a fixed clue square. All-zero for our generator. */
  readonly immutable: Uint8Array;
  /** Clue font size — large iff every column clue is a single digit and
   * row clues aren't too dense (upstream `FS_LARGE`/`FS_SMALL`). */
  readonly fontLarge: boolean;
}

export interface PatternState {
  readonly common: PatternCommon;
  /** Per-cell value (GRID_*), cloned per move. */
  readonly grid: Uint8Array;
  readonly completed: boolean;
  readonly cheated: boolean;
}

/** A `fill` sets a rectangle of non-immutable cells to one value (upstream
 * `F`/`E`/`U x,y,w,h`); a `fillCells` sets an arbitrary *set* of cells to one
 * value (the hint's grouped-deduction move — one firing forces a set of cells
 * that need not be a rectangle, so it can't ride `fill`); a `solve` applies a
 * full solution grid as a string of `'0'`/`'1'` (upstream `S…`), kept a string
 * so the move is save-safe. */
export type PatternMove =
  | {
      type: "fill";
      value: GridVal;
      x: number;
      y: number;
      w: number;
      h: number;
      /** When true, paint only cells currently `GRID_UNKNOWN` — a drag-paint
       * across the board never rewrites a mark the player already placed
       * (the common nonogram QoL). Single-cell actions leave it unset and
       * overwrite, so a deliberate click can still change a mark. */
      onlyBlank?: boolean;
    }
  | { type: "fillCells"; value: GridVal; cells: number[] }
  | { type: "solve"; grid: string };

/** Persisted UI (not history): the in-progress drag and the keyboard
 * cursor. `drag`/`release` hold the active drag's button codes; `state` is
 * the value the drag is painting. */
export interface PatternUi {
  dragging: boolean;
  dragStartX: number;
  dragStartY: number;
  dragEndX: number;
  dragEndY: number;
  drag: number;
  release: number;
  state: GridVal;
  curX: number;
  curY: number;
  curVisible: boolean;
}

/** A player-marked cell whose `Full`/`Empty` value contradicts the unique
 * solution (the mistake-checking divergence; surfaced by Check & Save). */
export interface PatternMistake {
  x: number;
  y: number;
}

// --- params --------------------------------------------------------------

const PRESETS: PatternParams[] = [
  { w: 10, h: 10 },
  { w: 15, h: 15 },
  { w: 20, h: 20 },
  { w: 25, h: 25 },
  { w: 30, h: 30 },
];

export function defaultParams(): PatternParams {
  return { w: 15, h: 15 };
}

export function presets(): PresetMenu<PatternParams> {
  return {
    title: "Pattern",
    submenu: PRESETS.map((p) => ({ title: `${p.w}x${p.h}`, params: { ...p } })),
  };
}

export function encodeParams(p: PatternParams, _full: boolean): string {
  return `${p.w}x${p.h}`;
}

export function decodeParams(s: string): PatternParams {
  const { w, h } = parseDimensions(s);
  return { w, h };
}

export function validateParams(p: PatternParams, _full: boolean): string | null {
  if (p.w <= 0 || p.h <= 0) return "Width and height must both be at least one";
  if (p.w > Number.MAX_SAFE_INTEGER / p.h) {
    return "Width times height must not be unreasonably large";
  }
  return null;
}

// --- desc codec ----------------------------------------------------------
// Desc: `w` column clue lines then `h` row clue lines, slash-separated;
// each line a `.`-separated list of positive run lengths (empty line = an
// empty section). An OPTIONAL `,`-suffix encodes pre-filled immutable clue
// squares (run-length alphabet) — produced only by upstream's picture
// generator, never our `generate_soluble`, but parsed so such IDs round-trip.

const isDigit = (ch: string): boolean => ch >= "0" && ch <= "9";

export function validateDesc(p: PatternParams, desc: string): string | null {
  const nlines = p.w + p.h;
  let pos = 0; // index into desc
  for (let i = 0; i < nlines; i++) {
    let rowspace = (i < p.w ? p.h : p.w) + 1;
    if (pos < desc.length && isDigit(desc[pos])) {
      // A run of `.`-separated integers, terminated by `/`, `,` or EOF.
      let sep: string;
      do {
        const start = pos;
        while (pos < desc.length && isDigit(desc[pos])) pos++;
        const n = Number.parseInt(desc.slice(start, pos), 10);
        if (n <= 0) return "all clues must be positive";
        if (n > 0x7fffffff - 1) return "at least one clue is grossly excessive";
        rowspace -= n + 1;
        if (rowspace < 0) {
          return i < p.w
            ? "at least one column contains more numbers than will fit"
            : "at least one row contains more numbers than will fit";
        }
        sep = desc[pos] ?? "\0";
        pos++; // consume the separator (the `do…while (desc[pos++] === '.')`)
      } while (sep === ".");
    } else {
      pos++; // expect a slash immediately
    }

    const last = desc[pos - 1] ?? "\0";
    if (last === "/") {
      if (i + 1 === nlines) return "too many row/column specifications";
    } else if (last === "\0" || last === ",") {
      if (i + 1 < nlines) return "too few row/column specifications";
    } else {
      return "unrecognised character in game specification";
    }
  }

  if ((desc[pos - 1] ?? "\0") === ",") {
    // Optional clue-squares section.
    let i = 0;
    while (i < p.w * p.h) {
      const c = desc[pos++];
      if (c === undefined) return "too little data in clue-squares section";
      const lower = c.toLowerCase();
      if (lower >= "a" && lower <= "z") {
        const len = lower.charCodeAt(0) - 97;
        i += len;
        if (len < 25 && i < p.w * p.h) i++;
        if (i > p.w * p.h) return "too much data in clue-squares section";
      } else {
        return "unrecognised character in clue-squares section";
      }
    }
    if (pos < desc.length) return "too much data in clue-squares section";
  }

  return null;
}

export function newState(p: PatternParams, desc: string): PatternState {
  const { w, h } = p;
  const nlines = w + h;
  const clues: number[][] = [];
  const immutable = new Uint8Array(w * h);
  const grid = new Uint8Array(w * h).fill(GRID_UNKNOWN);

  let pos = 0;
  for (let i = 0; i < nlines; i++) {
    const line: number[] = [];
    if (pos < desc.length && isDigit(desc[pos])) {
      let sep: string;
      do {
        const start = pos;
        while (pos < desc.length && isDigit(desc[pos])) pos++;
        line.push(Number.parseInt(desc.slice(start, pos), 10));
        sep = desc[pos] ?? "\0";
        pos++;
      } while (sep === ".");
    } else {
      pos++; // slash
    }
    clues.push(line);
  }

  if ((desc[pos - 1] ?? "\0") === ",") {
    let i = 0;
    while (i < w * h) {
      const c = desc[pos++];
      if (c === undefined) break;
      const full = c >= "A" && c <= "Z";
      const len = c.toLowerCase().charCodeAt(0) - 97;
      i += len;
      if (len < 25 && i < w * h) {
        grid[i] = full ? GRID_FULL : GRID_EMPTY;
        immutable[i] = 1;
        i++;
      }
    }
  }

  const fontLarge = chooseFontLarge(w, h, clues);
  const common: PatternCommon = { w, h, clues, immutable, fontLarge };
  return { common, grid, completed: false, cheated: false };
}

/** Upstream's font-size heuristic: switch to the small font if any column
 * clue is multi-digit, or if any column has so many row clues they would
 * not fit the top border at the large size. */
function chooseFontLarge(
  w: number,
  _h: number,
  clues: readonly (readonly number[])[],
): boolean {
  for (let i = 0; i < w; i++) {
    for (const n of clues[i]) if (n >= 10) return false;
  }
  const tlborder = Math.floor(w / 5) + 2;
  for (let i = w; i < clues.length; i++) {
    if (clues[i].length * 3 - 2 > tlborder * 2) return false;
  }
  return true;
}

/** Re-encode per-line clues as the slash/dot desc (no clue-squares suffix —
 * our boards have none). Used by the generator and the round-trip test. */
export function encodeClues(clues: readonly (readonly number[])[]): string {
  return clues.map((line) => line.join(".")).join("/");
}

// --- moves / completion --------------------------------------------------

export function clonePatternState(s: PatternState): PatternState {
  return { ...s, grid: Uint8Array.from(s.grid) };
}

/** Run lengths of `GRID_FULL` cells along a line, or `null` if any cell is
 * still `GRID_UNKNOWN` (upstream `compute_rowdata` returning -1). */
export function computeRuns(
  grid: Uint8Array,
  start: number,
  len: number,
  step: number,
): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    if (grid[start + i * step] === GRID_FULL) {
      let runlen = 1;
      while (i + runlen < len && grid[start + (i + runlen) * step] === GRID_FULL) {
        runlen++;
      }
      out.push(runlen);
      i += runlen;
    }
    if (i < len && grid[start + i * step] === GRID_UNKNOWN) return null;
  }
  return out;
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Has the player's grid reproduced every clue exactly? */
export function isComplete(state: PatternState): boolean {
  const { w, h, clues } = state.common;
  const { grid } = state;
  for (let i = 0; i < w; i++) {
    const runs = computeRuns(grid, i, h, w);
    if (!runs || !arraysEqual(runs, clues[i])) return false;
  }
  for (let i = 0; i < h; i++) {
    const runs = computeRuns(grid, i * w, w, 1);
    if (!runs || !arraysEqual(runs, clues[w + i])) return false;
  }
  return true;
}

export function executeMove(state: PatternState, move: PatternMove): PatternState {
  const { w, h } = state.common;
  const s = w * h;

  if (move.type === "solve") {
    if (move.grid.length !== s) throw new Error("Bad solve grid");
    const grid = new Uint8Array(s);
    for (let i = 0; i < s; i++) {
      const c = move.grid[i];
      if (c !== "0" && c !== "1") throw new Error("Bad solve grid");
      grid[i] = c === "1" ? GRID_FULL : GRID_EMPTY;
    }
    return { ...state, grid, completed: true, cheated: true };
  }

  if (move.type === "fillCells") {
    const next = clonePatternState(state);
    for (const i of move.cells) {
      if (i < 0 || i >= s) throw new Error("Move out of bounds");
      if (next.common.immutable[i]) continue;
      next.grid[i] = move.value;
    }
    if (!next.completed && isComplete(next)) {
      return { ...next, completed: true };
    }
    return next;
  }

  const { value, x, y } = move;
  const rw = move.w;
  const rh = move.h;
  if (x < 0 || y < 0 || rw < 0 || rh < 0 || x + rw > w || y + rh > h) {
    throw new Error("Move out of bounds");
  }

  const next = clonePatternState(state);
  for (let yy = y; yy < y + rh; yy++) {
    for (let xx = x; xx < x + rw; xx++) {
      const i = yy * w + xx;
      if (next.common.immutable[i]) continue;
      if (move.onlyBlank && next.grid[i] !== GRID_UNKNOWN) continue;
      next.grid[i] = value;
    }
  }
  if (!next.completed && isComplete(next)) {
    return { ...next, completed: true };
  }
  return next;
}

// --- status / text -------------------------------------------------------

export function status(state: PatternState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

/** A compact ASCII rendering: clue gutters plus the marked grid. */
export function textFormat(state: PatternState): string {
  const { w, h, clues } = state.common;
  const { grid } = state;
  const colClues = clues.slice(0, w);
  const rowClues = clues.slice(w);

  const topGap = Math.max(0, ...colClues.map((c) => c.length));
  const rowClueStrs = rowClues.map((c) => c.join(" "));
  const leftGap = Math.max(0, ...rowClueStrs.map((s) => s.length));
  const pad = (n: number) => " ".repeat(Math.max(0, n));

  const lines: string[] = [];
  // Column-clue header rows, bottom-aligned.
  for (let r = 0; r < topGap; r++) {
    let line = pad(leftGap);
    for (let x = 0; x < w; x++) {
      const c = colClues[x];
      const idx = r - (topGap - c.length);
      line += idx >= 0 ? String(c[idx]).padStart(2) : "  ";
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  // Grid rows with left clues.
  for (let y = 0; y < h; y++) {
    let line = rowClueStrs[y].padStart(leftGap);
    for (let x = 0; x < w; x++) {
      const v = grid[y * w + x];
      line += v === GRID_FULL ? " #" : v === GRID_EMPTY ? " ." : " ?";
    }
    lines.push(line);
  }
  return `${lines.join("\n")}\n`;
}
