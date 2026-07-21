/**
 * Clusters state, params, move/ui types, and the desc codec — port of the
 * corresponding parts of `puzzles/unreleased/clusters.c`.
 *
 * The board is one `Uint8Array` `grid` of the C flag byte per cell, exactly
 * as upstream's `char *grid`: a cell holds `F_COLOR_0` (red) or `F_COLOR_1`
 * (blue) or 0 (empty), OR-ed with `F_SINGLE` when it is a *given* dot clue.
 * The transient `F_ERROR` / `F_CURSOR` render flags upstream stores in the
 * grid are deliberately kept out of persisted state — every read masks
 * `COLMASK`/`F_SINGLE`, and errors are recomputed on demand (see solver.ts)
 * so the given bytes stay byte-match-clean for the desc encoder.
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions } from "../../engine/params.ts";

// --- cell flag bits (upstream) ---------------------------------------------

export const F_COLOR_0 = 0x01; // red
export const F_COLOR_1 = 0x02; // blue
export const F_SINGLE = 0x04; // a "dot": touches exactly one same-colour cell
/** Transient rule-violation bit. Upstream `clusters_validate` mutates this
 * into the grid; the solver/generator reproduce that (it is byte-match
 * critical — see solver.ts), but persisted play state stays free of it. */
export const F_ERROR = 0x08;
export const COLMASK = F_COLOR_0 | F_COLOR_1;

/** The colour part of a move edit / solve cell: 0 empty, `F_COLOR_0` red,
 * `F_COLOR_1` blue — the same byte value the grid stores (givens excepted,
 * which additionally carry `F_SINGLE`). */
export type ClustersFill = 0 | typeof F_COLOR_0 | typeof F_COLOR_1;

// --- types -----------------------------------------------------------------

export interface ClustersParams {
  w: number;
  h: number;
}

export interface ClustersState {
  w: number;
  h: number;
  /** Flag byte per cell, row-major. */
  grid: Uint8Array;
  completed: boolean;
  cheated: boolean;
}

/**
 * A move is either a *paint* — a list of cell edits committed together (one
 * click, one keyboard place, or a whole accreting drag) — or a *solve* — the
 * full-grid solution fill. Upstream serialises these as an `A%d;B%d;C%d;…`
 * string / an `S`-prefixed grid string; the discriminated union is the
 * idiomatic-TS equivalent (Loopy D5 / Pearl / Sokoban convention).
 */
export type ClustersMove =
  | { kind: "paint"; cells: ReadonlyArray<{ index: number; fill: ClustersFill }> }
  | { kind: "solve"; fills: ReadonlyArray<ClustersFill> };

export interface ClustersUi {
  /** Keyboard cursor. */
  cx: number;
  cy: number;
  cursor: boolean;
  /** The accreting paint drag (the shared accreting-drag model, also used by
   * bricks/sticks). `dragType` is `-1` when no drag is active, else the
   * {@link ClustersFill} being painted; `drag` accretes the cell indices the
   * pointer has passed over, previewed by the renderer and committed as one
   * `paint` move on release. Ephemeral — never in persisted state. */
  dragType: number;
  drag: number[];
}

// --- params ----------------------------------------------------------------

const PRESETS: ClustersParams[] = [
  { w: 7, h: 7 },
  { w: 8, h: 8 },
  { w: 9, h: 9 },
  { w: 10, h: 10 },
];

export function defaultParams(): ClustersParams {
  return { ...PRESETS[0] };
}

export function presets(): PresetMenu<ClustersParams> {
  return {
    title: "Clusters",
    submenu: PRESETS.map((p) => ({ title: `${p.w}x${p.h}`, params: { ...p } })),
  };
}

export function encodeParams(p: ClustersParams, _full: boolean): string {
  return `${p.w}x${p.h}`;
}

export function decodeParams(s: string): ClustersParams {
  // Lenient, matching upstream `decode_params`: a leading integer is the
  // width (and default height); an `x<int>` overrides the height.
  const { w, h } = parseDimensions(s);
  return { w, h };
}

export function validateParams(p: ClustersParams, _full: boolean): string | null {
  // Upstream order: too-large before too-small.
  if (p.w * p.h >= 10000) return "Puzzle is too large";
  if (p.w * p.h < 2) return "Puzzle is too small";
  return null;
}

// --- desc codec (byte-match surface, upstream new_game_desc/new_game) -------

const CODE_a = "a".charCodeAt(0);
const CODE_A = "A".charCodeAt(0);

/**
 * Run-length encode the *given dot clues* of a finished grid, byte-for-byte
 * as upstream `new_game_desc`'s encode loop: walk positions `0..s` (inclusive
 * — the trailing `+1` terminator), tracking a run of non-given cells; at each
 * red dot emit `a+run` (chaining `z`=skip-25 for runs > 24), at each blue dot
 * `A+run` (chaining `Z`), and at the terminator flush the final run as a
 * lowercase char. Lowercase = red, uppercase = blue (the colour asymmetry to
 * preserve). Only `F_COLOR_x|F_SINGLE` cells are dots.
 */
export function encodeDesc(grid: Uint8Array, w: number, h: number): string {
  const s = w * h;
  let out = "";
  let run = 0;
  for (let i = 0; i <= s; i++) {
    if (i === s || grid[i] === (F_COLOR_0 | F_SINGLE)) {
      while (run > 24) {
        out += "z";
        run -= 25;
      }
      out += String.fromCharCode(CODE_a + run);
      run = 0;
    } else if (grid[i] === (F_COLOR_1 | F_SINGLE)) {
      while (run > 24) {
        out += "Z";
        run -= 25;
      }
      out += String.fromCharCode(CODE_A + run);
      run = 0;
    } else {
      run++;
    }
  }
  return out;
}

export function validateDesc(p: ClustersParams, desc: string): string | null {
  const s = p.w * p.h;
  let pos = 0;
  for (const ch of desc) {
    if (ch >= "a" && ch < "z") pos += 1 + (ch.charCodeAt(0) - CODE_a);
    else if (ch >= "A" && ch < "Z") pos += 1 + (ch.charCodeAt(0) - CODE_A);
    else if (ch === "z" || ch === "Z") pos += 25;
    else return "Description contains invalid characters";
  }
  if (pos < s + 1) return "Description too short";
  if (pos > s + 1) return "Description too long";
  return null;
}

export function newState(p: ClustersParams, desc: string): ClustersState {
  const { w, h } = p;
  const s = w * h;
  const grid = new Uint8Array(s);
  let pos = 0;
  for (const ch of desc) {
    if (ch >= "a" && ch < "z") {
      pos += ch.charCodeAt(0) - CODE_a;
      if (pos < s) grid[pos] = F_COLOR_0 | F_SINGLE;
      pos++;
    } else if (ch >= "A" && ch < "Z") {
      pos += ch.charCodeAt(0) - CODE_A;
      if (pos < s) grid[pos] = F_COLOR_1 | F_SINGLE;
      pos++;
    } else if (ch === "z" || ch === "Z") {
      pos += 25;
    }
    // validateDesc has already rejected any other character.
  }
  return { w, h, grid, completed: false, cheated: false };
}

export function cloneState(s: ClustersState): ClustersState {
  return { ...s, grid: s.grid.slice() };
}

export function status(s: ClustersState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- text format (upstream game_text_format) -------------------------------

export function textFormat(s: ClustersState): string {
  const { w, h, grid } = s;
  let out = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = grid[y * w + x];
      const base = c & F_COLOR_0 ? "r" : c & F_COLOR_1 ? "b" : ".";
      // Uppercase for a given dot (never on an empty cell — givens are coloured).
      out += `${c & F_SINGLE ? base.toUpperCase() : base} `;
    }
    out += "\n";
  }
  return out;
}
