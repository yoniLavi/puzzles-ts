/**
 * Light Up (Akari) state, params, and desc codec — port of the
 * corresponding parts of `lightup.c`.
 *
 * The board is two parallel typed arrays, as upstream: `flags` carries the
 * per-cell flag byte (black / numbered / bulb / impossible-mark, plus the
 * NUMBERUSED and MARK scratch bits that never appear in play states), and
 * `lights` carries a numbered black square's clue value, or the number of
 * bulbs lighting an open square.
 */

import { tierNames } from "../../engine/difficulty.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseLeadingInt } from "../../engine/params.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import {
  SYMM_MAX,
  SYMM_REF4,
  SYMM_ROT2,
  SYMM_ROT4,
} from "../../engine/symmetric-blacks.ts";
import type { GameStatus, Point } from "../../engine/types.ts";

// --- cell flags (upstream values) -------------------------------------------

export const F_BLACK = 1;
/** Black square: it has a clue number attached. */
export const F_NUMBERED = 2;
/** Solver scratch: this clue was useful for solving (generator stripping). */
export const F_NUMBERUSED = 4;
/** Open square: player's "no bulb here" mark. */
export const F_IMPOSSIBLE = 8;
/** Open square: player's bulb. */
export const F_LIGHT = 16;
/** Generator scratch (place_lights sweep). */
export const F_MARK = 32;

export const idx = (x: number, y: number, w: number): number => y * w + x;

// --- types ---------------------------------------------------------------------

export interface LightupParams {
  w: number;
  h: number;
  /** Percentage of black squares, 5–100. */
  blackpc: number;
  symm: number;
  difficulty: number;
}

export interface LightupState {
  w: number;
  h: number;
  /** Number of player bulbs on the board. */
  nlights: number;
  /** Clue value for numbered blacks; times-lit count for open squares. */
  lights: Int16Array;
  flags: Uint8Array;
  completed: boolean;
  cheated: boolean;
}

/** One toggle, exactly upstream's `L`/`I` move atoms (both are toggles;
 * placing either clears the other). */
export interface LightupOp {
  kind: "light" | "impossible";
  x: number;
  y: number;
}

/** A move is a list of toggles plus an optional solve flag (upstream's
 * `S;L…;I…` compound). A plain click is a single-op list. */
export interface LightupMove {
  solve?: boolean;
  ops: LightupOp[];
}

export interface LightupUi {
  cursor: GridCursor;
  /** Pref: draw the impossible-mark blob even on a lit square. */
  drawBlobsWhenLit: boolean;
}

// --- params ----------------------------------------------------------------------

const PRESETS: LightupParams[] = [
  { w: 7, h: 7, blackpc: 20, symm: SYMM_ROT4, difficulty: 0 },
  { w: 7, h: 7, blackpc: 20, symm: SYMM_ROT4, difficulty: 1 },
  { w: 7, h: 7, blackpc: 20, symm: SYMM_ROT4, difficulty: 2 },
  { w: 10, h: 10, blackpc: 20, symm: SYMM_ROT2, difficulty: 0 },
  { w: 10, h: 10, blackpc: 20, symm: SYMM_ROT2, difficulty: 1 },
  { w: 10, h: 10, blackpc: 20, symm: SYMM_ROT2, difficulty: 2 },
  { w: 14, h: 14, blackpc: 20, symm: SYMM_ROT2, difficulty: 0 },
  { w: 14, h: 14, blackpc: 20, symm: SYMM_ROT2, difficulty: 1 },
  { w: 14, h: 14, blackpc: 20, symm: SYMM_ROT2, difficulty: 2 },
];

// Difficulty 2 requires guess-and-backtrack by construction (the generator
// rejects boards solvable at the tier below), so it is named Unreasonable. The
// game's only tier list: the preset titles and `paramConfig` both read it.
export const DIFF_NAMES: readonly string[] = tierNames(3, { search: true });

export function defaultParams(): LightupParams {
  return { ...PRESETS[0] };
}

export function presets(): PresetMenu<LightupParams> {
  return {
    title: "Light Up",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${DIFF_NAMES[p.difficulty]}`,
      params: { ...p },
    })),
  };
}

export function decodeParams(s: string): LightupParams {
  const p = defaultParams();
  let i = 0;
  // Upstream's EATNUM: `atoi` from `start`, leaving `i` just past the digits.
  const eatNum = (start: number): number => {
    const r = parseLeadingInt(s, start);
    i = r.next;
    return r.value;
  };
  p.w = eatNum(0);
  if (s[i] === "x") p.h = eatNum(i + 1);
  if (s[i] === "b") p.blackpc = eatNum(i + 1);
  if (s[i] === "s") p.symm = eatNum(i + 1);
  else if (p.symm === SYMM_ROT4 && p.w !== p.h) {
    // A bare '18x10' must not keep the default's square-only 4-fold symmetry.
    p.symm = SYMM_ROT2;
  }
  p.difficulty = 0;
  // Old params: a bare 'r' meant the recursive (Unreasonable) solver.
  if (s[i] === "r") {
    p.difficulty = 2;
    i++;
  }
  if (s[i] === "d") p.difficulty = eatNum(i + 1);
  return p;
}

export function encodeParams(p: LightupParams, full: boolean): string {
  return full
    ? `${p.w}x${p.h}b${p.blackpc}s${p.symm}d${p.difficulty}`
    : `${p.w}x${p.h}`;
}

export function validateParams(p: LightupParams, full: boolean): string | null {
  if (p.w < 2 || p.h < 2) return "Width and height must be at least 2";
  if (p.w * p.h > 0x7fffffff)
    return "Width times height must not be unreasonably large";
  if (full) {
    if (p.blackpc < 5 || p.blackpc > 100)
      return "Percentage of black squares must be between 5% and 100%";
    if (p.w !== p.h && p.symm === SYMM_ROT4)
      return "4-fold symmetry is only available with square grids";
    if ((p.symm === SYMM_ROT4 || p.symm === SYMM_REF4) && p.w < 3 && p.h < 3)
      return "Width or height must be at least 3 for 4-way symmetry";
    if (p.symm < 0 || p.symm >= SYMM_MAX) return "Unknown symmetry type";
    if (p.difficulty < 0 || p.difficulty >= DIFF_NAMES.length)
      return "Unknown difficulty level";
  }
  return null;
}

// --- board helpers ------------------------------------------------------------------

/** The orthogonal in-bounds neighbors of (x, y), in upstream's
 * left/right/up/down order (order matters — solver scratch lists and
 * tie-breaks are built in this order). */
export function getSurrounds(w: number, h: number, ox: number, oy: number): Point[] {
  const out: Point[] = [];
  if (ox > 0) out.push({ x: ox - 1, y: oy });
  if (ox < w - 1) out.push({ x: ox + 1, y: oy });
  if (oy > 0) out.push({ x: ox, y: oy - 1 });
  if (oy < h - 1) out.push({ x: ox, y: oy + 1 });
  return out;
}

/**
 * Every cell a bulb at (ox, oy) would light — the run of open squares
 * along its row and column, stopped by black squares. Yields the row
 * cells left-to-right (origin excluded), then the column cells
 * top-to-bottom (origin included iff `includeOrigin`) — exactly
 * upstream's `list_lights` + `FOREACHLIT` order, which solver scratch
 * ordering (and so tie-breaking) depends on.
 */
export function* litCells(
  state: LightupState,
  ox: number,
  oy: number,
  includeOrigin: boolean,
): Generator<Point> {
  const { w, h, flags } = state;
  let minx = ox;
  let maxx = ox;
  let miny = oy;
  let maxy = oy;
  for (let x = ox - 1; x >= 0; x--) {
    if (flags[idx(x, oy, w)] & F_BLACK) break;
    minx = x;
  }
  for (let x = ox + 1; x < w; x++) {
    if (flags[idx(x, oy, w)] & F_BLACK) break;
    maxx = x;
  }
  for (let y = oy - 1; y >= 0; y--) {
    if (flags[idx(ox, y, w)] & F_BLACK) break;
    miny = y;
  }
  for (let y = oy + 1; y < h; y++) {
    if (flags[idx(ox, y, w)] & F_BLACK) break;
    maxy = y;
  }
  for (let x = minx; x <= maxx; x++) {
    if (x === ox) continue;
    yield { x, y: oy };
  }
  for (let y = miny; y <= maxy; y++) {
    if (!includeOrigin && y === oy) continue;
    yield { x: ox, y };
  }
}

/** Force the bulb at (ox, oy) to `on`, updating the lit counts of every
 * cell it lights. Mutates `state` (play states are cloned first). */
export function setLight(
  state: LightupState,
  ox: number,
  oy: number,
  on: boolean,
): void {
  const i = idx(ox, oy, state.w);
  if (state.flags[i] & F_BLACK) throw new Error("setLight on a black square");
  if (((state.flags[i] & F_LIGHT) !== 0) === on) return;
  const diff = on ? 1 : -1;
  state.flags[i] ^= F_LIGHT;
  state.nlights += diff;
  for (const { x, y } of litCells(state, ox, oy, true)) {
    state.lights[idx(x, y, state.w)] += diff;
  }
}

// --- completion ----------------------------------------------------------------------

/** True when every open square is lit. */
function gridLit({ flags, lights }: LightupState): boolean {
  for (let i = 0; i < flags.length; i++) {
    if (!(flags[i] & F_BLACK) && lights[i] === 0) return false;
  }
  return true;
}

/** True when any bulb is lit by another bulb. */
export function gridOverlap({ flags, lights }: LightupState): boolean {
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] & F_LIGHT && lights[i] > 1) return true;
  }
  return false;
}

/** Exactly `clue` bulbs around the numbered square at (x, y). */
function numberCorrect(state: LightupState, x: number, y: number): boolean {
  let n = 0;
  for (const pt of getSurrounds(state.w, state.h, x, y)) {
    if (state.flags[idx(pt.x, pt.y, state.w)] & F_LIGHT) n++;
  }
  return n === state.lights[idx(x, y, state.w)];
}

/** The display-error test for a clue: definitely too many bulbs, or too
 * few even if every plausible neighbor became one. */
export function numberWrong(state: LightupState, x: number, y: number): boolean {
  const clue = state.lights[idx(x, y, state.w)];
  let n = 0;
  let empty = 0;
  for (const pt of getSurrounds(state.w, state.h, x, y)) {
    const i = idx(pt.x, pt.y, state.w);
    if (state.flags[i] & F_LIGHT) {
      n++;
      continue;
    }
    if (state.flags[i] & F_BLACK) continue;
    if (state.flags[i] & F_IMPOSSIBLE) continue;
    if (state.lights[i] > 0) continue;
    empty++;
  }
  return n > clue || n + empty < clue;
}

/** True when all clue counts are exactly satisfied. */
function gridAddsup(state: LightupState): boolean {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const i = idx(x, y, state.w);
      if (!(state.flags[i] & F_NUMBERED)) continue;
      if (!numberCorrect(state, x, y)) return false;
    }
  }
  return true;
}

export function gridCorrect(state: LightupState): boolean {
  return gridLit(state) && !gridOverlap(state) && gridAddsup(state);
}

// --- state construction ----------------------------------------------------------------

export function emptyState(p: LightupParams): LightupState {
  return {
    w: p.w,
    h: p.h,
    nlights: 0,
    lights: new Int16Array(p.w * p.h),
    flags: new Uint8Array(p.w * p.h),
    completed: false,
    cheated: false,
  };
}

export function cloneState(s: LightupState): LightupState {
  return { ...s, lights: s.lights.slice(), flags: s.flags.slice() };
}

export function status(s: LightupState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- desc codec ---------------------------------------------------------------------------

const A = "a".charCodeAt(0);

/** Encode the black/numbered layout as upstream: row-major, `B` for an
 * unnumbered black, `0`–`4` for a numbered black, runs of open squares
 * compressed as `a`–`z`. */
export function encodeDesc(state: LightupState): string {
  const { w, h, flags, lights } = state;
  let desc = "";
  let run = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      if (flags[i] & F_BLACK) {
        if (run) {
          desc += String.fromCharCode(A - 1 + run);
          run = 0;
        }
        desc += flags[i] & F_NUMBERED ? String(lights[i]) : "B";
      } else {
        if (run === 26) {
          desc += String.fromCharCode(A - 1 + run);
          run = 0;
        }
        run++;
      }
    }
  }
  if (run) desc += String.fromCharCode(A - 1 + run);
  return desc;
}

export function validateDesc(p: LightupParams, desc: string): string | null {
  let j = 0;
  for (let i = 0; i < p.w * p.h; i++) {
    const c = desc[j++];
    if (c === undefined) return "Game description shorter than expected";
    if (c >= "a" && c <= "z") {
      i += c.charCodeAt(0) - A; // and the loop's i++ adds another one
    } else if (c !== "B" && !(c >= "0" && c <= "4")) {
      return "Game description contained unexpected character";
    }
  }
  if (j < desc.length) return "Game description longer than expected";
  return null;
}

export function newState(p: LightupParams, desc: string): LightupState {
  const state = emptyState(p);
  let run = 0; // open squares still owed by a run letter
  let j = 0;
  for (let i = 0; i < p.w * p.h; i++) {
    if (run > 0) {
      run--;
      continue;
    }
    const c = desc[j++] ?? "S";
    if (c >= "a" && c <= "z") {
      run = c.charCodeAt(0) - A; // this square is the run's first
    } else if (c >= "0" && c <= "4") {
      state.flags[i] |= F_NUMBERED | F_BLACK;
      state.lights[i] = Number(c);
    } else if (c === "B") {
      state.flags[i] |= F_BLACK;
    }
  }
  return state;
}

// --- text format -----------------------------------------------------------------------------

export function textFormat(state: LightupState): string {
  const { w, h, flags, lights } = state;
  const lines: string[] = [];
  const gridline = `+${"-+".repeat(w)}`;
  for (let y = 0; y < h; y++) {
    lines.push(gridline);
    let row = "";
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      let c = " ";
      if (flags[i] & F_BLACK) {
        c = flags[i] & F_NUMBERED ? String(lights[i]) : "#";
      } else if (flags[i] & F_LIGHT) {
        c = "L";
      } else if (flags[i] & F_IMPOSSIBLE) {
        c = "x";
      } else if (lights[i] > 0) {
        c = ".";
      }
      row += `|${c}`;
    }
    lines.push(`${row}|`);
  }
  lines.push(gridline);
  return `${lines.join("\n")}\n`;
}
