/**
 * Subsets state, params, move/ui types, and the desc codec — port of the
 * corresponding parts of `puzzles/unreleased/subsets.c` (Lennard Sprong's
 * implementation of Inaba Naoki's puzzle).
 *
 * The grid holds every set over an `n`-letter universe, each placed exactly
 * once. State is four per-cell bitmasks over the `n` letters:
 * - `clues`   — the fixed horseshoe-arrow flags (`F_ADJ_*`), puzzle data;
 * - `immutable` — which letter bits are givens (all-or-nothing per cell in
 *   practice: a given cell has every bit set, a blank cell none);
 * - `known`  — letters confirmed present;
 * - `mask`   — letters not yet ruled out.
 * A cell is *decided* when `known == mask`; a letter slot is Known (in both),
 * Unknown (in `mask` only) or Cleared (in neither).
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import type { PresetMenu } from "../../engine/game.ts";

// --- letters, arrows, cell geometry (upstream values) ------------------------

export const ALL_BITS = (n: number): number => (1 << n) - 1;

export const F_ADJ_UP = 1;
export const F_ADJ_RIGHT = 2;
export const F_ADJ_DOWN = 4;
export const F_ADJ_LEFT = 8;

/** One row of upstream's `adjthan[]` table: the arrow flag `f` on the cell it
 * leaves, the opposing flag `fo` on the cell it enters, the direction, the
 * text-format glyph and the desc-encoding letter. */
export interface AdjDir {
  readonly f: number;
  readonly fo: number;
  readonly dx: number;
  readonly dy: number;
  readonly c: string;
  readonly enc: string;
}

export const ADJTHAN: readonly AdjDir[] = [
  { f: F_ADJ_UP, fo: F_ADJ_DOWN, dx: 0, dy: -1, c: "^", enc: "U" },
  { f: F_ADJ_RIGHT, fo: F_ADJ_LEFT, dx: 1, dy: 0, c: ">", enc: "R" },
  { f: F_ADJ_DOWN, fo: F_ADJ_UP, dx: 0, dy: 1, c: "v", enc: "D" },
  { f: F_ADJ_LEFT, fo: F_ADJ_RIGHT, dx: -1, dy: 0, c: "<", enc: "L" },
];

/* Upstream stubs these to a constant 2 with a "TODO: When other sizes are
 * supported, read n" note; only 4x4 n=4 is a legal configuration, so each
 * cell is a 2×2 block of letter slots. */
export const CELL_WIDTH = 2;
export const CELL_HEIGHT = 2;

// --- types ------------------------------------------------------------------

export interface SubsetsParams {
  w: number;
  h: number;
  /** Universe size: the grid holds all `2^n` sets over `n` letters. */
  n: number;
}

export interface SubsetsState {
  w: number;
  h: number;
  n: number;
  /** Arrow-clue flags per cell (`F_ADJ_*`), fixed puzzle data. */
  clues: Uint8Array;
  /** Given letter bits per cell (`ALL_BITS(n)` for a given cell, 0 else). */
  immutable: Uint16Array;
  /** Letters confirmed present, per cell. */
  known: Uint16Array;
  /** Letters not yet ruled out, per cell. */
  mask: Uint16Array;
  completed: boolean;
  /** Kept for struct parity with upstream, which declares but never sets it
   * (its solve move does not mark the game cheated). Always false. */
  cheated: boolean;
}

/**
 * A move is a single letter-slot tri-state edit (upstream's `"%c%d,%d"`
 * string with `K`/`C`/`U`), or the solver's full-board fill (upstream `'S'`).
 * `bit` is the letter index (bit position), `0..n-1`.
 */
export type SubsetsMove =
  | { kind: "set"; type: "known" | "cleared" | "unknown"; pos: number; bit: number }
  | { kind: "solve"; known: ReadonlyArray<number>; mask: ReadonlyArray<number> };

export interface SubsetsUi {
  /** Keyboard cursor in virtual slot coordinates over the
   * `w·(cw+1)-1 × h·(ch+1)-1` grid (gap rows/columns are skipped). */
  cx: number;
  cy: number;
  cshow: boolean;
}

/** A Check & Save mistake: a set-value placed in more than one decided cell,
 * or an edge whose horseshoe / missing-horseshoe relation two decided cells
 * violate (`dir` indexes {@link ADJTHAN} on the cell `pos` it was flagged on). */
export type SubsetsMistake =
  | { kind: "cell"; pos: number }
  | { kind: "edge"; pos: number; dir: number };

// --- params -----------------------------------------------------------------

export function defaultParams(): SubsetsParams {
  return { w: 4, h: 4, n: 4 };
}

export function presets(): PresetMenu<SubsetsParams> {
  // The sole upstream preset.
  return {
    title: "Subsets",
    submenu: [{ title: "4x4 Size 4", params: defaultParams() }],
  };
}

export function encodeParams(p: SubsetsParams, _full: boolean): string {
  return `${p.w}x${p.h}n${p.n}`;
}

/** atoi at `s[pos]`: parse a leading run of digits, 0 when there are none. */
function eatNum(s: string, pos: number): { value: number; next: number } {
  let next = pos;
  while (next < s.length && s[next] >= "0" && s[next] <= "9") next++;
  return { value: next > pos ? Number.parseInt(s.slice(pos, next), 10) : 0, next };
}

export function decodeParams(s: string): SubsetsParams {
  // Lenient, matching upstream decode_params (which mutates a copy of the
  // current params; a fresh decode starts from the default).
  const p = defaultParams();
  let r = eatNum(s, 0);
  p.w = r.value;
  p.h = p.w;
  let pos = r.next;
  if (s[pos] === "x") {
    r = eatNum(s, pos + 1);
    p.h = r.value;
    pos = r.next;
  }
  if (s[pos] === "n") {
    r = eatNum(s, pos + 1);
    p.n = r.value;
  }
  return p;
}

export function validateParams(p: SubsetsParams, _full: boolean): string | null {
  if (p.w !== 4 || p.h !== 4 || p.n !== 4)
    return "Currently only 4x4 puzzles are supported";
  return null;
}

// --- state ------------------------------------------------------------------

export function blankState(p: SubsetsParams): SubsetsState {
  const s = p.w * p.h;
  return {
    w: p.w,
    h: p.h,
    n: p.n,
    clues: new Uint8Array(s),
    immutable: new Uint16Array(s),
    known: new Uint16Array(s),
    mask: new Uint16Array(s).fill(ALL_BITS(p.n)),
    completed: false,
    cheated: false,
  };
}

export function cloneState(s: SubsetsState): SubsetsState {
  return {
    ...s,
    clues: s.clues.slice(),
    immutable: s.immutable.slice(),
    known: s.known.slice(),
    mask: s.mask.slice(),
  };
}

export function status(s: SubsetsState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- desc codec (byte-match surface) ----------------------------------------

const isDigit = (c: string | undefined): boolean =>
  c !== undefined && c >= "0" && c <= "9";

/**
 * Load a desc into a blank state (upstream `attempt_load_game`): one token
 * per cell in row-major order, comma-separated — a decimal set number for a
 * given or `_` for a blank, then any of `U`/`R`/`D`/`L` arrow markers — with
 * upstream's exact error messages, including the post-load whole-grid arrow
 * checks (off-grid and mutually contradicting flags).
 */
function attemptLoadGame(state: SubsetsState, desc: string): string | null {
  const { w, h, n } = state;
  let i = 0;
  let p = 0;
  while (p < desc.length) {
    if (i >= w * h) return "Too much data to fill grid";

    if (isDigit(desc[p])) {
      let q = p;
      while (isDigit(desc[q])) q++;
      const num = Number.parseInt(desc.slice(p, q), 10);
      if (num > ALL_BITS(n)) return "Out-of-range number in game description";
      state.known[i] = num;
      state.mask[i] = num;
      state.immutable[i] = ALL_BITS(n);
      p = q;
    } else if (desc[p] === "_") {
      p++;
    } else {
      return "Expecting number in game description";
    }

    while (desc[p] === "U" || desc[p] === "R" || desc[p] === "D" || desc[p] === "L") {
      switch (desc[p]) {
        case "U":
          state.clues[i] |= F_ADJ_UP;
          break;
        case "R":
          state.clues[i] |= F_ADJ_RIGHT;
          break;
        case "D":
          state.clues[i] |= F_ADJ_DOWN;
          break;
        default:
          state.clues[i] |= F_ADJ_LEFT;
          break;
      }
      p++;
    }
    i++;
    if (i < w * h && desc[p] !== ",") return "Missing separator";
    if (desc[p] === ",") p++;
  }
  if (i < w * h) return "Not enough data to fill grid";

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let d = 0; d < 4; d++) {
        if (!(state.clues[y * w + x] & ADJTHAN[d].f)) continue;
        const nx = x + ADJTHAN[d].dx;
        const ny = y + ADJTHAN[d].dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return "Flags go off grid";
        if (state.clues[ny * w + nx] & ADJTHAN[d].fo)
          return "Flags contradicting each other";
      }
    }
  }

  return null;
}

export function validateDesc(p: SubsetsParams, desc: string): string | null {
  return attemptLoadGame(blankState(p), desc);
}

/** Decode a validated desc into a fresh state (upstream `new_game`). */
export function newState(p: SubsetsParams, desc: string): SubsetsState {
  const state = blankState(p);
  const err = attemptLoadGame(state, desc);
  if (err) throw new Error(`subsets: invalid desc: ${err}`);
  return state;
}

/**
 * Encode a board's givens + arrow clues as a desc — the exact inverse of
 * {@link newState} and byte-for-byte upstream `new_game_desc`'s emit loop.
 * Only `immutable`/`known`/`clues` are read, so the encoding is stable
 * across play (player edits touch blank cells' `known`/`mask` only).
 */
export function encodeDesc(state: SubsetsState): string {
  const { w, h } = state;
  let out = "";
  for (let i = 0; i < w * h; i++) {
    out += state.immutable[i] ? String(state.known[i]) : "_";
    for (const d of ADJTHAN) {
      if (state.clues[i] & d.f) out += d.enc;
    }
    out += ",";
  }
  return out.slice(0, -1);
}

// --- text format (upstream game_text_format) --------------------------------

const CODE_A = "A".charCodeAt(0);

export function textFormat(state: SubsetsState): string {
  const { w, h, n } = state;
  const cw = CELL_WIDTH;
  const ch = CELL_HEIGHT;
  let out = "";

  for (let y = 0; y < h; y++) {
    for (let cy = 0; cy < ch; cy++) {
      for (let x = 0; x < w; x++) {
        for (let cx = 0; cx < cw; cx++) {
          const cn = cy * cw + cx;
          if (cn >= n) out += " ";
          else if (state.known[y * w + x] & (1 << cn))
            out += String.fromCharCode(CODE_A + cn);
          else if (!(state.mask[y * w + x] & (1 << cn))) out += ".";
          else out += "?";
        }
        if (x < w - 1) {
          out +=
            cy !== 0
              ? " "
              : state.clues[y * w + x] & F_ADJ_RIGHT
                ? ">"
                : state.clues[y * w + x + 1] & F_ADJ_LEFT
                  ? "<"
                  : " ";
        }
      }
      out += "\n";
    }
    if (y < h - 1) {
      for (let x = 0; x < w; x++) {
        out +=
          state.clues[y * w + x] & F_ADJ_DOWN
            ? "v"
            : state.clues[(y + 1) * w + x] & F_ADJ_UP
              ? "^"
              : " ";
        for (let cx = 1; cx < cw; cx++) out += " ";
        if (x < w - 1) out += " ";
      }
      out += "\n";
    }
  }

  return out;
}
