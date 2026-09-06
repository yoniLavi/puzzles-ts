/**
 * Palisade — state, params, desc codec, completion test.
 *
 * Clues count the walls around a cell; the player draws walls so the
 * grid divides into connected regions of exactly `k` cells, each clue
 * equal to its cell's wall count. The substance (solver, generator) is
 * in `solver.ts`/`divvy.ts`; this module owns the data model.
 *
 * Border encoding is upstream's `borderflag` byte kept verbatim (the
 * Mosaic precedent): per cell, low nibble bits 0..3 are walls on the
 * U/R/D/L edges, high nibble bits 4..7 are "no-wall" marks. An edge is
 * three-valued (wall / no-wall-mark / unknown) and shared between the
 * two cells it separates, so every edit records both sides.
 */

import { assertNever } from "../../engine/assert-never.ts";
import type { ParamConfigItem, PresetMenu } from "../../engine/game.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import { dims, num, paramsCodec } from "../../engine/params-codec.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { encodeRunLength, scanRunLength } from "../../engine/run-length.ts";
import type { GameStatus } from "../../engine/types.ts";

// The edge bit encoding, direction tables and bounds test are shared with the
// other border-marking region game and live in `engine/border-grid.ts`. Each
// module here imports them from there directly rather than through this file —
// a pass-through re-export is a second name for one thing, and jscpd scored the
// two games' identical re-export lists as duplication in their own right.

import {
  BORDER,
  BORDER_D,
  BORDER_L,
  BORDER_MASK,
  BORDER_R,
  BORDER_U,
  buildDsf,
  DISABLED,
  DX,
  DY,
  initBorders,
  outOfBounds,
} from "../../engine/border-grid.ts";

/** Clue sentinel: no clue shown in this cell. */
export const EMPTY = -1;

const BITCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;
/** Number of walls enabled in a border byte. */
export function bitcount(flags: number): number {
  return BITCOUNT[flags & BORDER_MASK];
}

// --- types ----------------------------------------------------------------

export interface PalisadeParams {
  w: number;
  h: number;
  k: number;
}

export interface PalisadeState {
  w: number;
  h: number;
  k: number;
  /** length w·h, `EMPTY` or 0..4. Shared (frozen) across cloned states. */
  clues: Int8Array;
  /** length w·h, the `borderflag` byte per cell. */
  borders: Uint8Array;
  completed: boolean;
  cheated: boolean;
}

export type PalisadeMove =
  | { type: "edges"; edits: ReadonlyArray<{ x: number; y: number; flag: number }> }
  | { type: "solve"; borders: number[] };

export interface PalisadeUi {
  /** Half-grid cursor coordinates: (0,0) is the top-left grid corner,
   * (1,1) the center of the top-left cell; odd/even distinguishes
   * center/edge/corner. Range [1, 2w-1] × [1, 2h-1]. */
  cursor: GridCursor;
}

export interface PalisadeMistake {
  x: number;
  y: number;
  /** Direction (0=U,1=R,2=D,3=L) of the offending edge. */
  dir: number;
}

/** A displayed hint step's highlight: the edge the player should set
 * (`(x,y)` + `dir`, `kind` = wall to draw / no-wall to mark), the cells
 * the explanation references (clue pair / the region — shaded), and any
 * sibling edges it names ("these two edges" — highlighted alongside the
 * primary). */
export interface PalisadeHint {
  x: number;
  y: number;
  dir: number;
  kind: "wall" | "nowall";
  cells?: ReadonlyArray<{ x: number; y: number }>;
  edges?: ReadonlyArray<{ x: number; y: number; dir: number }>;
}

// --- params ---------------------------------------------------------------

const PRESETS: PalisadeParams[] = [
  { w: 5, h: 5, k: 5 },
  { w: 8, h: 6, k: 6 },
  { w: 10, h: 8, k: 8 },
  { w: 15, h: 12, k: 10 },
];

export function defaultParams(): PalisadeParams {
  return { ...PRESETS[0] };
}

export function presets(): PresetMenu<PalisadeParams> {
  return {
    title: "Size",
    submenu: PRESETS.map((p) => ({
      title: `${p.w} x ${p.h}, regions of size ${p.k}`,
      params: { ...p },
    })),
  };
}

/** The "Custom type…" form, and the field list the codec below encodes. */
export const paramConfig: ParamConfigItem<PalisadeParams>[] = [
  ...dimensionParamConfig<PalisadeParams>(),
  {
    kw: "region-size",
    name: "Region size",
    type: "string",
    get: (p) => String(p.k),
    set: (p, v) => {
      p.k = parseConfigInt(v);
    },
  },
];

/** Upstream: `w = h = k = atoi(s)`, then optional `x<h>` and `n<k>` — so the
 * square fallback (no `x`) also seeds the region size from the width. */
export const { encodeParams, decodeParams } = paramsCodec(defaultParams, [
  dims(paramConfig),
  num(paramConfig, "n", "region-size", {
    whenAbsent: (p) => {
      p.k = p.w;
    },
  }),
]);

export function validateParams(p: PalisadeParams, full: boolean): string | null {
  const { w, h, k } = p;
  if (k < 1) return "Region size must be at least one";
  if (w < 1) return "Width must be at least one";
  if (h < 1) return "Height must be at least one";
  // Width times height must not be unreasonably large.
  if (w > 0x7fffffff / h) return "Width times height must not be unreasonably large";
  const wh = w * h;
  if (wh % k) return "Region size must divide grid area";
  if (!full) return null;
  if (k === wh) return "Region size must be less than the grid area";
  if (k === 2 && w !== 1 && h !== 1)
    return "Region size can't be two unless width or height is one";
  return null;
}

// --- borders --------------------------------------------------------------

/**
 * A state is solved iff the walls divide the grid into components every
 * of size `k`, every clue equals its wall count, and no wall lies
 * within a single component (no stray border).
 */
export function isSolved(
  w: number,
  h: number,
  k: number,
  clues: Int8Array,
  borders: Uint8Array,
): boolean {
  const wh = w * h;
  const dsf = buildDsf(w, h, borders, true);

  for (let i = 0; i < wh; i++) {
    if (dsf.size(i) !== k) return false;
    if (clues[i] === EMPTY) continue;
    if (clues[i] !== bitcount(borders[i])) return false;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w && borders[i] & BORDER_R && dsf.equivalent(i, i + 1)) return false;
      if (y + 1 < h && borders[i] & BORDER_D && dsf.equivalent(i, i + w)) return false;
    }
  }
  return true;
}

// --- desc codec -----------------------------------------------------------

/** Run-length encode the clue grid: digit per clue, letter run per
 * clueless gap (trailing gap dropped). */
export function encodeDesc(clues: Int8Array, wh: number): string {
  return encodeRunLength(wh, (i) => (clues[i] === EMPTY ? null : String(clues[i])));
}

export function validateDesc(p: PalisadeParams, desc: string): string | null {
  const wh = p.w * p.h;
  let squares = 0;
  for (const tok of scanRunLength(desc)) {
    if ("blanks" in tok) {
      squares += tok.blanks;
    } else if (tok.value >= "0" && tok.value <= "9") {
      if (tok.value > "4") return `Invalid (too large) number: '${tok.value}'`;
      squares++;
    } else {
      return `Invalid character in data: '${tok.value}'`;
    }
  }
  if (squares > wh) return "Data describes too many squares";
  return null;
}

export function newState(p: PalisadeParams, desc: string): PalisadeState {
  const { w, h, k } = p;
  const wh = w * h;
  const clues = new Int8Array(wh).fill(EMPTY);
  let i = 0;
  for (const tok of scanRunLength(desc)) {
    if ("blanks" in tok) i += tok.blanks;
    else if (tok.value >= "0" && tok.value <= "9")
      clues[i++] = tok.value.charCodeAt(0) - 48;
  }
  return {
    w,
    h,
    k,
    clues,
    borders: initBorders(w, h),
    completed: k === wh,
    cheated: false,
  };
}

export function cloneState(state: PalisadeState): PalisadeState {
  return {
    w: state.w,
    h: state.h,
    k: state.k,
    clues: state.clues, // shared, frozen
    borders: state.borders.slice(),
    completed: state.completed,
    cheated: state.cheated,
  };
}

// --- move execution -------------------------------------------------------

export function executeMove(state: PalisadeState, move: PalisadeMove): PalisadeState {
  const { w, h, k } = state;
  const wh = w * h;
  const ret = cloneState(state);

  if (move.type === "solve") {
    if (move.borders.length !== wh) throw new Error("palisade: bad solve move");
    ret.borders = Uint8Array.from(move.borders);
    ret.cheated = true;
    ret.completed = true;
    return ret;
  }
  if (move.type !== "edges") return assertNever(move, "palisade: executeMove");

  for (const { x, y, flag } of move.edits) {
    if (outOfBounds(x, y, w, h)) throw new Error("palisade: move out of bounds");
    for (let dir = 0; dir < 4; dir++) {
      // No toggling the walls of the grid rim.
      if (flag & BORDER(dir) && outOfBounds(x + DX[dir], y + DY[dir], w, h))
        throw new Error("palisade: cannot toggle grid-rim wall");
    }
    ret.borders[y * w + x] ^= flag;
  }

  // Recompute completion every move (deliberate divergence from upstream's
  // sticky `if (!completed)` guard): breaking a solved board reverts to
  // unsolved, so a later genuine re-completion is a real transition the win
  // flash can fire on — even after a Solve. `cheated` stays sticky (it's the
  // permanent "you peeked" record the status bar reads); only the flash gate
  // distinguishes a player completion from the Solve command (see
  // `flashLength` in index.ts).
  ret.completed = isSolved(w, h, k, ret.clues, ret.borders);
  return ret;
}

export function status(state: PalisadeState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

// --- text format ----------------------------------------------------------

export function textFormat(state: PalisadeState): string {
  const { w, h, clues, borders } = state;
  const cw = 4;
  const ch = 2;
  const gw = cw * w + 2;
  const gh = ch * h + 1;
  const len = gw * gh;
  const board = new Array<string>(len).fill(" ");

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = r * ch * gw + cw * c;
      const center = cell + (gw * ch) / 2 + cw / 2;
      const i = r * w + c;
      const clue = clues[i];

      if (clue !== EMPTY) board[center] = String(clue);
      board[cell] = "+";

      if (borders[i] & BORDER_U) {
        for (let j = 1; j < cw; j++) board[cell + j] = "-";
      } else if (borders[i] & DISABLED(BORDER_U)) {
        board[cell + cw / 2] = "x";
      }

      if (borders[i] & BORDER_L) board[cell + gw] = "|";
      else if (borders[i] & DISABLED(BORDER_L)) board[cell + gw] = "x";
    }
    for (let c = 0; c < ch; c++) {
      board[(r * ch + c) * gw + gw - 2] = c ? "|" : "+";
      board[(r * ch + c) * gw + gw - 1] = "\n";
    }
  }
  // Bottom rim: copy the first row's '+'/'-' pattern.
  for (let j = 0; j < gw; j++) board[len - gw + j] = board[j];
  return board.join("");
}
