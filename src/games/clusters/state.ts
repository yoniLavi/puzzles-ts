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

import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions } from "../../engine/params.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import type { GameStatus } from "../../engine/types.ts";

// --- difficulty -------------------------------------------------------------

/** Solvable by the single-cell proof by contradiction alone. */
export const DIFF_EASY = 0;
/** Needs the one-level hypothetical: assume a colour, follow the forced
 * consequences, and find the contradiction there. */
export const DIFF_TRICKY = 1;
export const DIFFCOUNT = 2;

/** Both tiers were already implemented — as `solverTry` and `solverRecurse` —
 * and neither was offered: the generator gated every board on the deeper rung.
 * The names follow the collection's two-tier convention (magnets, pearl,
 * singles and tents all name exactly this pair Easy/Tricky, and in each the
 * harder tier is likewise "one hypothetical deep"), not upstream's, which has
 * none here. */
export const DIFF_NAMES = ["Easy", "Tricky"] as const;

/** Difficulty encode chars for the `d<char>` param suffix, index = tier — the
 * same `"et"` the other two-tier games use. */
const DIFF_CHARS = "et";

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
  /** {@link DIFF_EASY} or {@link DIFF_TRICKY}. */
  diff: number;
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
  cursor: GridCursor;
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
  { w: 7, h: 7, diff: DIFF_EASY },
  { w: 7, h: 7, diff: DIFF_TRICKY },
  { w: 8, h: 8, diff: DIFF_EASY },
  { w: 8, h: 8, diff: DIFF_TRICKY },
  { w: 9, h: 9, diff: DIFF_EASY },
  { w: 9, h: 9, diff: DIFF_TRICKY },
  { w: 10, h: 10, diff: DIFF_EASY },
  { w: 10, h: 10, diff: DIFF_TRICKY },
];

export function defaultParams(): ClustersParams {
  return { ...PRESETS[0] };
}

export function presets(): PresetMenu<ClustersParams> {
  return {
    title: "Clusters",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${DIFF_NAMES[p.diff]}`,
      params: { ...p },
    })),
  };
}

export function encodeParams(p: ClustersParams, full: boolean): string {
  return full ? `${p.w}x${p.h}d${DIFF_CHARS[p.diff] ?? "?"}` : `${p.w}x${p.h}`;
}

export function decodeParams(s: string): ClustersParams {
  // Lenient, matching upstream `decode_params`: a leading integer is the
  // width (and default height); an `x<int>` overrides the height; an optional
  // `d<char>` selects the tier. A game ID from before the tiers existed has no
  // `d`, so it lands on the default — see `defaultParams`.
  const { w, h, next } = parseDimensions(s);
  const p: ClustersParams = { w, h, diff: DIFF_EASY };
  if (s[next] === "d" && next + 1 < s.length) {
    // An unrecognised char leaves the tier out of range so `validateParams`
    // rejects it, rather than silently playing some other difficulty.
    const idx = DIFF_CHARS.indexOf(s[next + 1]);
    p.diff = idx === -1 ? DIFFCOUNT : idx;
  }
  return p;
}

/**
 * The smallest board on which a Tricky puzzle exists: **twelve squares, and at
 * least two wide**.
 *
 * Tricky demands a board the single-cell rule cannot finish, and a small grid has
 * nowhere to hide a deduction that deep. Measured by running the real gate over
 * every shape from 1×2 to 6×9, ten seeds each, with each seed free to spend the
 * generator's whole 10,000-attempt budget: **every** shape of twelve squares or
 * more bound the tier on all ten seeds, and **no** shape below it bound on any —
 * 2×5 and 3×3 never, 2×6 and 3×4 always.
 *
 * Area alone is not the rule, which is why both halves are stated. A 1×N strip
 * never binds *at any length* — 1×20 failed all five seeds — because a cell in a
 * one-wide board has at most two neighbours, so the single-cell rule decides it
 * immediately or not at all, and there is no chain for the lookahead to follow.
 *
 * Refusing is the collection's rule for a tier with no boards
 * (`grade-difficulty-tiers-honestly`): silently handing back an Easy board is the
 * same defect as a tier that does not bind, and an honest gate with nothing to
 * find would spin until its retry budget ran out.
 */
const MIN_TRICKY_AREA = 12;

export function validateParams(p: ClustersParams, full: boolean): string | null {
  // Upstream order: too-large before too-small.
  if (p.w * p.h >= 10000) return "Puzzle is too large";
  if (p.w * p.h < 2) return "Puzzle is too small";
  // 1x2 and 2x2 pass upstream's area check and have no puzzle whatever the
  // difficulty: every colouring of them either leaves a cell touching none of
  // its own colour (which the generator flips away) or reduces to clues that
  // prune to nothing. Measured — those two shapes, alone among every shape up to
  // 4x7, never produced a board in 10,000 attempts; `max(w,h) >= 3` is exactly
  // their complement. Before the retry bound existed this hung the worker for
  // ever rather than reporting anything.
  if (Math.max(p.w, p.h) < 3) return "Width or height must be at least three";
  if (p.diff >= DIFFCOUNT) return "Unknown difficulty rating";
  // Generation only: a saved game or a game ID carrying its own description
  // still loads at any size, because `full` is false there.
  if (
    full &&
    p.diff > DIFF_EASY &&
    (Math.min(p.w, p.h) < 2 || p.w * p.h < MIN_TRICKY_AREA)
  ) {
    return "Tricky needs a board of at least 12 squares, at least two wide";
  }
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
