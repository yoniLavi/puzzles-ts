/**
 * Types and pure state helpers for Keen (KenKen / Inshi No Heya) — the
 * state/codec parts of `keen.c`.
 *
 * A board is a `w × w` Latin square of digits `1..w`. The grid is partitioned
 * into contiguous *cages* (a disjoint-set forest, {@link KeenClues.dsf}); each
 * cage carries an arithmetic clue — a target value and one of add / subtract /
 * multiply / divide — that its digits must satisfy. Subtraction and division
 * cages are always dominoes (area 2). The cage partition + clues are immutable
 * (shared by reference); the player's working digit (`grid`) and pencil-mark
 * bitmap (`pencil`) are cloned per move. Keen has **no givens** — every cell
 * starts blank.
 */

import { Dsf } from "../../engine/dsf.ts";

// --- difficulty ------------------------------------------------------------

export type Difficulty = "easy" | "normal" | "hard" | "extreme" | "unreasonable";

export const DIFF_EASY = 0;
export const DIFF_NORMAL = 1;
export const DIFF_HARD = 2;
export const DIFF_EXTREME = 3;
export const DIFF_UNREASONABLE = 4;
export const DIFF_COUNT = 5;

// keen_diffchars / keen_diffnames, indexed by level.
const DIFF_CHARS = "enhxu";
const DIFF_NAMES = ["Easy", "Normal", "Hard", "Extreme", "Unreasonable"];
const DIFFS: Difficulty[] = ["easy", "normal", "hard", "extreme", "unreasonable"];

export function diffToLevel(d: Difficulty): number {
  const i = DIFFS.indexOf(d);
  return i < 0 ? DIFF_NORMAL : i;
}
export function diffFromLevel(level: number): Difficulty {
  return DIFFS[level] ?? "normal";
}
export function diffChar(d: Difficulty): string {
  return DIFF_CHARS[diffToLevel(d)];
}
export function diffName(d: Difficulty): string {
  return DIFF_NAMES[diffToLevel(d)];
}

// --- clue packing (upstream C_* / CMASK) -----------------------------------
// A clue is a single packed number: the top bits hold the operation, the rest
// the target value. The ordering (ADD/MUL before SUB/DIV, DIV last) is
// load-bearing for the generator's balanced clue assignment, so it is kept.

export const C_ADD = 0x00000000;
export const C_MUL = 0x20000000;
export const C_SUB = 0x40000000;
export const C_DIV = 0x60000000;
export const CMASK = 0x60000000;

export function clueOp(clue: number): number {
  return clue & CMASK;
}
export function clueVal(clue: number): number {
  return clue & ~CMASK;
}

/** Maximum cage area (upstream `MAXBLK`). */
export const MAXBLK = 6;

// --- error flags (written by checkErrors; mapped to draw flags in render) ---

/** A cage whose filled digits violate its clue. */
export const ERR_CLUE = 1;
/** A duplicate digit in a row or column. */
export const ERR_LATIN = 2;

// --- params ----------------------------------------------------------------

export interface KeenParams {
  w: number;
  diff: Difficulty;
  multiplicationOnly: boolean;
}

export function defaultParams(): KeenParams {
  return { w: 6, diff: "normal", multiplicationOnly: false };
}

export function encodeParams(p: KeenParams, full: boolean): string {
  if (!full) return `${p.w}`;
  return `${p.w}d${diffChar(p.diff)}${p.multiplicationOnly ? "m" : ""}`;
}

export function decodeParams(s: string): KeenParams {
  const p = defaultParams();
  let i = 0;
  let digits = "";
  while (i < s.length && s[i] >= "0" && s[i] <= "9") digits += s[i++];
  if (digits) p.w = Number.parseInt(digits, 10);
  if (s[i] === "d") {
    i++;
    const idx = DIFF_CHARS.indexOf(s[i] ?? "");
    p.diff = idx >= 0 ? diffFromLevel(idx) : "normal";
    if (idx >= 0) i++;
  }
  if (s[i] === "m") {
    i++;
    p.multiplicationOnly = true;
  }
  return p;
}

export function validateParams(p: KeenParams, _full: boolean): string | null {
  if (p.w < 3 || p.w > 9) return "Grid size must be between 3 and 9";
  if (diffToLevel(p.diff) >= DIFF_COUNT) return "Unknown difficulty rating";
  return null;
}

// --- block-structure codec -------------------------------------------------

/**
 * Build, for the dsf over `a` cells, a map `minimal[i]` = the smallest-indexed
 * cell in `i`'s class (upstream `dsf_minimal`). Keen stores each cage's clue at
 * its minimal cell and the desc lists clues in minimal-cell order, so this
 * identity — not just connectivity — is load-bearing. The shared `Dsf` uses
 * union-by-size and doesn't track a minimal element, so we precompute it once
 * after all merges are done (correct because generation/parse never read a
 * minimal mid-merge). A single ascending pass: the first cell seen for each
 * root is, by construction, its minimum.
 */
export function buildMinimal(dsf: Dsf, a: number): Int32Array {
  const rootMin = new Int32Array(a).fill(-1);
  for (let i = 0; i < a; i++) {
    const r = dsf.canonify(i);
    if (rootMin[r] < 0) rootMin[r] = i; // first (smallest) i for this root
  }
  const minimal = new Int32Array(a);
  for (let i = 0; i < a; i++) minimal[i] = rootMin[dsf.canonify(i)];
  return minimal;
}

/**
 * Encode the cage partition as the pattern of internal dividing lines: first
 * the `w·(w−1)` internal vertical lines in reading order, then the `w·(w−1)`
 * internal horizontal lines in transposed order, plus one terminating virtual
 * edge. Runs of non-edges between edges are encoded `_` (0), `a`..`y` (1..25),
 * `z` (25 with no following edge). A second pass compresses a run of the same
 * letter into `letter + count`. Faithful to upstream `encode_block_structure`.
 */
export function encodeBlockStructure(w: number, dsf: Dsf): string {
  let raw = "";
  let currrun = 0;
  const total = 2 * w * (w - 1);
  for (let i = 0; i <= total; i++) {
    let edge: boolean;
    if (i === total) {
      edge = true; // terminating virtual edge
    } else {
      let p0: number;
      let p1: number;
      if (i < w * (w - 1)) {
        const y = (i / (w - 1)) | 0;
        const x = i % (w - 1);
        p0 = y * w + x;
        p1 = y * w + x + 1;
      } else {
        const x = ((i / (w - 1)) | 0) - w;
        const y = i % (w - 1);
        p0 = y * w + x;
        p1 = (y + 1) * w + x;
      }
      edge = !dsf.equivalent(p0, p1);
    }

    if (edge) {
      while (currrun > 25) {
        raw += "z";
        currrun -= 25;
      }
      if (currrun) raw += String.fromCharCode(97 - 1 + currrun);
      else raw += "_";
      currrun = 0;
    } else {
      currrun++;
    }
  }

  // Compression pass: replace a run of the same character with one copy plus a
  // repeat count where that is shorter.
  let out = "";
  let r = 0;
  while (r < raw.length) {
    const c = raw[r];
    out += c;
    let i = 0;
    while (r + i < raw.length && raw[r + i] === c) i++;
    r += i;
    if (i === 2) out += c;
    else if (i > 2) out += String(i);
  }
  return out;
}

/**
 * Rebuild the cage dsf from the block-structure prefix of `desc` starting at
 * `start`. Returns `{ error, next }` where `next` is the index of the comma (or
 * end) following the block structure. Faithful to `parse_block_structure`.
 */
export function parseBlockStructure(
  desc: string,
  start: number,
  w: number,
  dsf: Dsf,
): { error: string | null; next: number } {
  let i = start;
  let pos = 0;
  let repc = 0;
  let repn = 0;
  const total = 2 * w * (w - 1);
  dsf.reinit();

  while (i < desc.length && (repn > 0 || desc[i] !== ",")) {
    let c: number;
    if (repn > 0) {
      repn--;
      c = repc;
    } else if (desc[i] === "_" || (desc[i] >= "a" && desc[i] <= "z")) {
      c = desc[i] === "_" ? 0 : desc.charCodeAt(i) - 97 + 1;
      i++;
      if (i < desc.length && desc[i] >= "0" && desc[i] <= "9") {
        let num = "";
        while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") num += desc[i++];
        repc = c;
        repn = Number.parseInt(num, 10) - 1;
      }
    } else {
      return { error: "Invalid character in game description", next: i };
    }

    const adv = c !== 25; // 'z' is the special "no following edge" case.

    while (c-- > 0) {
      if (pos >= total)
        return { error: "Too much data in block structure specification", next: i };
      let p0: number;
      let p1: number;
      if (pos < w * (w - 1)) {
        const y = (pos / (w - 1)) | 0;
        const x = pos % (w - 1);
        p0 = y * w + x;
        p1 = y * w + x + 1;
      } else {
        const x = ((pos / (w - 1)) | 0) - w;
        const y = pos % (w - 1);
        p0 = y * w + x;
        p1 = (y + 1) * w + x;
      }
      dsf.merge(p0, p1);
      pos++;
    }
    if (adv) {
      pos++;
      if (pos > total + 1)
        return { error: "Too much data in block structure specification", next: i };
    }
  }

  if (pos !== total + 1)
    return { error: "Not enough data in block structure specification", next: i };
  return { error: null, next: i };
}

// --- clues -----------------------------------------------------------------

/** The immutable cage partition + per-cage clue, shared across cloned states. */
export interface KeenClues {
  w: number;
  dsf: Dsf;
  /** `minimal[i]` = the minimal-indexed cell of `i`'s cage (clue storage key). */
  minimal: Int32Array;
  /** `a`-length; the packed `op | value` clue at each cage's minimal cell, 0
   * elsewhere. */
  clues: Int32Array;
}

// --- state -----------------------------------------------------------------

export interface KeenState {
  params: KeenParams;
  clues: KeenClues;
  /** `w²` working digits (0 = blank); cloned per move. */
  grid: Int8Array;
  /** `w²` pencil-mark bitmaps (bit `1<<n` = mark `n`); cloned per move. */
  pencil: Int32Array;
  completed: boolean;
  cheated: boolean;
}

export function cloneState(s: KeenState): KeenState {
  return {
    params: s.params,
    clues: s.clues, // immutable, shared
    grid: s.grid.slice(),
    pencil: s.pencil.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

// --- desc codec ------------------------------------------------------------

export function validateDesc(p: KeenParams, desc: string): string | null {
  const w = p.w;
  const a = w * w;
  const dsf = new Dsf(a);
  const { error, next } = parseBlockStructure(desc, 0, w, dsf);
  if (error) return error;
  if (desc[next] !== ",") return "Expected ',' after block structure description";

  let i = next + 1;
  const minimal = buildMinimal(dsf, a);
  for (let cell = 0; cell < a; cell++) {
    if (minimal[cell] !== cell) continue;
    const ch = desc[i];
    if (ch === "a" || ch === "m") {
      // no validation
    } else if (ch === "d" || ch === "s") {
      if (dsf.size(cell) !== 2)
        return "Subtraction and division blocks must have area 2";
    } else if (ch === undefined || ch === "") {
      return "Too few clues for block structure";
    } else {
      return "Unrecognised clue type";
    }
    i++;
    while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") i++;
  }
  if (i < desc.length) return "Too many clues for block structure";
  return null;
}

export function newState(p: KeenParams, desc: string): KeenState {
  const w = p.w;
  const a = w * w;
  const dsf = new Dsf(a);
  const { next } = parseBlockStructure(desc, 0, w, dsf);
  const minimal = buildMinimal(dsf, a);

  // `next` points at the comma.
  let i = next + 1;
  const clues = new Int32Array(a);
  for (let cell = 0; cell < a; cell++) {
    if (minimal[cell] !== cell) continue;
    let clue = 0;
    switch (desc[i]) {
      case "a":
        clue = C_ADD;
        break;
      case "m":
        clue = C_MUL;
        break;
      case "s":
        clue = C_SUB;
        break;
      case "d":
        clue = C_DIV;
        break;
      default:
        throw new Error("keen: bad description in newState");
    }
    i++;
    let num = "";
    while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") num += desc[i++];
    clues[cell] = clue | Number.parseInt(num, 10);
  }

  return {
    params: p,
    clues: { w, dsf, minimal, clues },
    grid: new Int8Array(a),
    pencil: new Int32Array(a),
    completed: false,
    cheated: false,
  };
}

// --- error checking (check_errors) -----------------------------------------

/**
 * Mark every cell/clue currently in error and report whether any error exists.
 * When `errors` (an `a`-length array) is given it is filled with {@link
 * ERR_CLUE}/{@link ERR_LATIN} bits per cell; either way the boolean return is
 * the completion test (`!checkErrors` ⇒ solved). Faithful to `check_errors`.
 */
export function checkErrors(state: KeenState, errors?: Int32Array): boolean {
  const w = state.params.w;
  const a = w * w;
  const { minimal, clues } = state.clues;
  const grid = state.grid;
  let errs = false;

  const cluevals = new Int32Array(a);
  const full = new Uint8Array(a).fill(1); // per-cage "no empty cell" flag
  if (errors) errors.fill(0);

  for (let i = 0; i < a; i++) {
    const j = minimal[i];
    if (j === i) {
      cluevals[i] = grid[i];
    } else {
      const op = clueOp(clues[j]);
      switch (op) {
        case C_ADD:
          cluevals[j] += grid[i];
          break;
        case C_MUL:
          cluevals[j] *= grid[i];
          break;
        case C_SUB:
          cluevals[j] = Math.abs(cluevals[j] - grid[i]);
          break;
        case C_DIV: {
          const d1 = Math.min(cluevals[j], grid[i]);
          const d2 = Math.max(cluevals[j], grid[i]);
          cluevals[j] = d1 === 0 || d2 % d1 !== 0 ? 0 : (d2 / d1) | 0;
          break;
        }
      }
    }
    if (!grid[i]) full[j] = 0;
  }

  for (let i = 0; i < a; i++) {
    const j = minimal[i];
    if (j === i) {
      if (clueVal(clues[j]) !== cluevals[i]) {
        errs = true;
        if (errors && full[j]) errors[j] |= ERR_CLUE;
      }
    }
  }

  const fullMask = (1 << (w + 1)) - (1 << 1); // bits 1..w
  for (let y = 0; y < w; y++) {
    let mask = 0;
    let errmask = 0;
    for (let x = 0; x < w; x++) {
      const bit = 1 << grid[y * w + x];
      errmask |= mask & bit;
      mask |= bit;
    }
    if (mask !== fullMask) {
      errs = true;
      errmask &= ~1;
      if (errors) {
        for (let x = 0; x < w; x++) {
          if (errmask & (1 << grid[y * w + x])) errors[y * w + x] |= ERR_LATIN;
        }
      }
    }
  }

  for (let x = 0; x < w; x++) {
    let mask = 0;
    let errmask = 0;
    for (let y = 0; y < w; y++) {
      const bit = 1 << grid[y * w + x];
      errmask |= mask & bit;
      mask |= bit;
    }
    if (mask !== fullMask) {
      errs = true;
      errmask &= ~1;
      if (errors) {
        for (let y = 0; y < w; y++) {
          if (errmask & (1 << grid[y * w + x])) errors[y * w + x] |= ERR_LATIN;
        }
      }
    }
  }

  return errs;
}

// --- status ----------------------------------------------------------------

export function status(s: KeenState): "solved" | "ongoing" {
  return s.completed ? "solved" : "ongoing";
}

// --- moves -----------------------------------------------------------------

export type KeenMove =
  /** Enter (or pencil-toggle) digit `n` at `(x, y)`; `n = 0` clears. `autoElim`
   * (auto-pencil mode, decided at move-creation off the Ui preference so replay
   * is deterministic) additionally strikes digit `n` from the pencil marks of
   * every other cell in the same row and column when this is a real placement. */
  | {
      type: "set";
      x: number;
      y: number;
      n: number;
      pencil: boolean;
      autoElim?: boolean;
    }
  /** Fill in every empty cell's pencil marks (the `M` key / fill-all button). */
  | { type: "pencilAll" }
  /** Strike (clear) the listed pencil candidates atomically — a hint's
   * single-firing elimination; idempotent (clearing an absent bit is a no-op). */
  | { type: "pencilStrike"; marks: { x: number; y: number; n: number }[] }
  /** Auto-solve to the given full grid. */
  | { type: "solve"; grid: number[] };

// --- ui --------------------------------------------------------------------

export interface KeenUi {
  hx: number;
  hy: number;
  hpencil: boolean;
  hshow: boolean;
  hcursor: boolean;
  /** Preference (default off, upstream `PREF_PENCIL_KEEP_HIGHLIGHT`): keep the
   * mouse highlight after a pencil-mark change. */
  pencilKeepHighlight: boolean;
  /** Preference (default on): right-click toggles a *sticky* pencil mode. */
  pencilSticky: boolean;
  /** Preference (default on): placing a digit strikes it from the pencil marks
   * of every other cell in its row and column. */
  autoPencil: boolean;
}

export function newUi(_state: KeenState): KeenUi {
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
