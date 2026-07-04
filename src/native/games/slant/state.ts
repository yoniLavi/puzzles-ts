/**
 * Slant state, params, and desc codec — idiomatic TS port of the state half
 * of `slant.c` (the Nikoli puzzle Gokigen Naname: fill every square of a
 * grid with a `/` or `\` diagonal so each numbered vertex clue counts its
 * incident diagonals and no closed loop forms).
 *
 * Grid conventions (upstream's, kept throughout this port): `w`/`h` are the
 * dimensions of the grid of *squares*; `W = w+1`/`H = h+1` those of the grid
 * of *points* (vertices), where clues live. A solution cell is `+1` for a
 * forward slash `/`, `-1` for a backslash `\`, `0` for blank.
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import { Dsf } from "../../engine/dsf.ts";
import { findLoops } from "../../engine/findloop.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions } from "../../engine/params.ts";

// --- difficulty (upstream DIFFLIST: Easy, Hard) ---------------------------
export const DIFF_EASY = 0;
export const DIFF_HARD = 1;
export const DIFF_COUNT = 2;
export const DIFF_NAMES = ["Easy", "Hard"] as const;
export const DIFF_CHARS = "eh"; // ENCODE chars, indexed by difficulty

// --- types ---------------------------------------------------------------

export interface SlantParams {
  w: number;
  h: number;
  diff: number;
}

/** A slash value: −1 `\`, 0 blank, +1 `/`. */
export type Slash = -1 | 0 | 1;

export interface SlantState {
  readonly w: number;
  readonly h: number;
  /** Vertex clues over the `(w+1)×(h+1)` point grid, −1 for none; shared by
   * reference across a game's states (upstream's refcounted `game_clues`). */
  readonly clues: Int8Array;
  /** Per-square slash (−1/0/+1), cloned per move. */
  readonly soln: Int8Array;
  /** Per-square: this diagonal lies on a closed loop (upstream ERR_SQUARE). */
  readonly loopErrors: Uint8Array;
  /** Per-vertex: this clue is over-committed or unsatisfiable (ERR_VERTEX). */
  readonly vertexErrors: Uint8Array;
  /** Per-square: this diagonal is connected to the border (BORDER_EDGE) —
   * not an error; the fade-grounded pref renders it dimmed. */
  readonly grounded: Uint8Array;
  readonly completed: boolean;
  readonly usedSolve: boolean;
}

/** A `set` writes one square (the C `\`/`/`/`C` move letters); a `solve`
 * applies a full solution as a string of `'\'`/`'/'` per square (the C `S…`
 * compound), kept a string so the move is JSON-save-safe. */
export type SlantMove =
  | { type: "set"; x: number; y: number; v: Slash }
  | { type: "solve"; grid: string };

export interface SlantUi {
  cx: number;
  cy: number;
  cursorVisible: boolean;
  /** Pref: swap which click direction cycles `\`-first vs `/`-first. */
  swapButtons: boolean;
  /** Pref: dim diagonals connected to the border (they can never loop). */
  fadeGrounded: boolean;
}

/** A placed diagonal that contradicts the unique solution (the
 * mistake-checking divergence; surfaced by Check & Save). */
export interface SlantMistake {
  x: number;
  y: number;
}

// --- params --------------------------------------------------------------

const PRESETS: SlantParams[] = [
  { w: 5, h: 5, diff: DIFF_EASY },
  { w: 5, h: 5, diff: DIFF_HARD },
  { w: 8, h: 8, diff: DIFF_EASY },
  { w: 8, h: 8, diff: DIFF_HARD },
  { w: 12, h: 10, diff: DIFF_EASY },
  { w: 12, h: 10, diff: DIFF_HARD },
];

export function defaultParams(): SlantParams {
  return { w: 8, h: 8, diff: DIFF_EASY };
}

export function presets(): PresetMenu<SlantParams> {
  return {
    title: "Size",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${DIFF_NAMES[p.diff]}`,
      params: { ...p },
    })),
  };
}

export function encodeParams(p: SlantParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += `d${DIFF_CHARS[p.diff] ?? "?"}`;
  return s;
}

export function decodeParams(s: string): SlantParams {
  const ret = defaultParams();
  const dims = parseDimensions(s, 0);
  ret.w = dims.w;
  ret.h = dims.h;
  let i = dims.next;
  if (s[i] === "d") {
    i++;
    // Upstream leniency: an unknown difficulty char leaves the default.
    if (i < s.length) {
      const idx = DIFF_CHARS.indexOf(s[i]);
      if (idx >= 0) ret.diff = idx;
      i++;
    }
  }
  return ret;
}

export function validateParams(p: SlantParams, _full: boolean): string | null {
  // Grids of dimension 1 can't be made Hard, so upstream forbids them.
  if (p.w < 2 || p.h < 2) return "Width and height must both be at least two";
  if (p.w > Number.MAX_SAFE_INTEGER / p.h) {
    return "Width times height must not be unreasonably large";
  }
  if (p.diff < 0 || p.diff >= DIFF_COUNT) return "Unknown difficulty rating";
  return null;
}

// --- desc codec ----------------------------------------------------------
// Run-length over the (w+1)×(h+1) vertex grid, row-major: a digit 0–4 is a
// clue, a letter a–z skips a run of 1–26 clueless vertices (chunks of 'z'
// for longer runs).

export function validateDesc(p: SlantParams, desc: string): string | null {
  const area = (p.w + 1) * (p.h + 1);
  let squares = 0;
  for (const ch of desc) {
    if (ch >= "a" && ch <= "z") squares += ch.charCodeAt(0) - 96;
    else if (ch >= "0" && ch <= "4") squares++;
    else return "Invalid character in game description";
  }
  if (squares < area) return "Not enough data to fill grid";
  if (squares > area) return "Too much data to fit in grid";
  return null;
}

/** Parse a desc into the shared vertex-clue array (−1 = no clue). */
export function decodeClues(p: SlantParams, desc: string): Int8Array {
  const clues = new Int8Array((p.w + 1) * (p.h + 1)).fill(-1);
  let pos = 0;
  for (const ch of desc) {
    if (ch >= "a" && ch <= "z") pos += ch.charCodeAt(0) - 96;
    else clues[pos++] = ch.charCodeAt(0) - 48;
  }
  return clues;
}

/** Encode a vertex-clue array as the upstream run-length desc. */
export function encodeClues(clues: Int8Array): string {
  let out = "";
  let run = 0;
  const flushRun = () => {
    while (run > 0) {
      // 'a'−1+run, capped at 'z' (a chunk of 26), exactly upstream.
      const chunk = Math.min(run, 26);
      out += String.fromCharCode(96 + chunk);
      run -= chunk;
    }
  };
  for (const clue of clues) {
    if (clue === -1) {
      run++;
    } else {
      flushRun();
      out += String.fromCharCode(48 + clue);
    }
  }
  flushRun();
  return out;
}

export function newState(p: SlantParams, desc: string): SlantState {
  const { w, h } = p;
  const W = w + 1;
  const H = h + 1;
  return {
    w,
    h,
    clues: decodeClues(p, desc),
    soln: new Int8Array(w * h),
    loopErrors: new Uint8Array(w * h),
    vertexErrors: new Uint8Array(W * H),
    grounded: new Uint8Array(w * h),
    completed: false,
    usedSolve: false,
  };
}

// --- error / completion analysis (upstream check_completion) --------------

/**
 * Current degree of a vertex: the number of placed diagonals meeting it.
 * With `anti`, returns 4 minus the number of placed diagonals *avoiding* it
 * (i.e. the maximum degree it could still reach) — yes, 4 even on a border
 * vertex, faithful to upstream.
 */
export function vertexDegree(
  w: number,
  h: number,
  soln: Int8Array,
  x: number,
  y: number,
  anti: boolean,
): number {
  const a = anti ? 1 : 0;
  let ret = 0;
  if (x > 0 && y > 0 && soln[(y - 1) * w + (x - 1)] - a < 0) ret++;
  if (x > 0 && y < h && soln[y * w + (x - 1)] + a > 0) ret++;
  if (x < w && y > 0 && soln[(y - 1) * w + x] + a > 0) ret++;
  if (x < w && y < h && soln[y * w + x] - a < 0) ret++;
  return anti ? 4 - ret : ret;
}

export interface SlantErrors {
  loopErrors: Uint8Array;
  vertexErrors: Uint8Array;
  grounded: Uint8Array;
  complete: boolean;
}

/** Recompute the full error overlay + completion verdict for a board. */
export function computeErrors(
  w: number,
  h: number,
  clues: Int8Array,
  soln: Int8Array,
): SlantErrors {
  const W = w + 1;
  const H = h + 1;
  const loopErrors = new Uint8Array(w * h);
  const vertexErrors = new Uint8Array(W * H);
  const grounded = new Uint8Array(w * h);
  let err = false;

  // Grounded (border-connected) components: a diagonal in the border's
  // vertex component can never be part of a loop.
  {
    const connected = new Dsf(W * H);
    for (let x = 0; x <= w; x++) {
      connected.merge(x, 0);
      connected.merge(h * W + x, 0);
    }
    for (let y = 0; y <= h; y++) {
      connected.merge(y * W, 0);
      connected.merge(y * W + w, 0);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = soln[y * w + x];
        if (s === -1) connected.merge(y * W + x, (y + 1) * W + (x + 1));
        else if (s === 1) connected.merge(y * W + (x + 1), (y + 1) * W + x);
      }
    }
    const rootNW = connected.canonify(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = soln[y * w + x];
        if (s !== 0 && connected.canonify(y * W + x + (s === 1 ? 1 : 0)) === rootNW) {
          grounded[y * w + x] = 1;
        }
      }
    }
  }

  // Loops: a diagonal lying on a graph loop is an error.
  {
    const result = findLoops(W * H, function* (vertex) {
      const x = vertex % W;
      const y = Math.floor(vertex / W);
      if (x < w && y < h && soln[y * w + x] < 0) yield (y + 1) * W + (x + 1);
      if (x > 0 && y > 0 && soln[(y - 1) * w + (x - 1)] < 0)
        yield (y - 1) * W + (x - 1);
      if (x > 0 && y < h && soln[y * w + (x - 1)] > 0) yield (y + 1) * W + (x - 1);
      if (x < w && y > 0 && soln[(y - 1) * w + x] > 0) yield (y - 1) * W + (x + 1);
    });
    if (result.anyLoop) err = true;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = soln[y * w + x];
        if (s === 0) continue;
        const u = s > 0 ? y * W + (x + 1) : (y + 1) * W + (x + 1);
        const v = s > 0 ? (y + 1) * W + x : y * W + x;
        if (result.isLoopEdge(u, v)) loopErrors[y * w + x] = 1;
      }
    }
  }

  // Clue vertices: too many connections, or too many avoidances to ever
  // reach the clue, are both errors.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = clues[y * W + x];
      if (c < 0) continue;
      if (
        vertexDegree(w, h, soln, x, y, false) > c ||
        vertexDegree(w, h, soln, x, y, true) > 4 - c
      ) {
        vertexErrors[y * W + x] = 1;
        err = true;
      }
    }
  }

  const complete = !err && !soln.includes(0);
  return { loopErrors, vertexErrors, grounded, complete };
}

// --- moves ---------------------------------------------------------------

export function executeMove(state: SlantState, move: SlantMove): SlantState {
  const { w, h } = state;
  const soln = Int8Array.from(state.soln);
  let usedSolve = state.usedSolve;

  if (move.type === "solve") {
    if (move.grid.length !== w * h) throw new Error("Bad solve grid");
    for (let i = 0; i < w * h; i++) {
      const c = move.grid[i];
      if (c !== "\\" && c !== "/") throw new Error("Bad solve grid");
      soln[i] = c === "\\" ? -1 : 1;
    }
    usedSolve = true;
  } else {
    const { x, y, v } = move;
    if (x < 0 || x >= w || y < 0 || y >= h) throw new Error("Move out of bounds");
    soln[y * w + x] = v;
  }

  // Always re-run the completion check — it also recomputes the error
  // overlays. The completed flag latches, as upstream.
  const errors = computeErrors(w, h, state.clues, soln);
  return {
    ...state,
    soln,
    loopErrors: errors.loopErrors,
    vertexErrors: errors.vertexErrors,
    grounded: errors.grounded,
    completed: errors.complete || state.completed,
    usedSolve,
  };
}

// --- status / text -------------------------------------------------------

export function status(state: SlantState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

export function textFormat(state: SlantState): string {
  const { w, h, clues, soln } = state;
  const W = w + 1;
  const H = h + 1;
  let out = "";
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = clues[y * W + x];
      out += c >= 0 ? String.fromCharCode(48 + c) : "+";
      if (x < w) out += "-";
    }
    out += "\n";
    if (y < h) {
      for (let x = 0; x < W; x++) {
        out += "|";
        if (x < w) {
          const s = soln[y * w + x];
          out += s !== 0 ? (s < 0 ? "\\" : "/") : " ";
        }
      }
      out += "\n";
    }
  }
  return out;
}
