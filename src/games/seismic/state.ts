/**
 * Seismic — params, immutable state, and the description codec.
 *
 * Seismic implements *Hakyuu* / *Ripple Effect* (© 2013 Lennard Sprong,
 * `puzzles/unreleased/seismic.c`). The grid is partitioned into regions; a
 * region of size `N` holds one each of `1..N`, and two equal numbers are kept
 * apart — at least `Z` cells between two `Z`s on a row or column (**Seismic**
 * mode), or never orthogonally/diagonally adjacent (**Tectonic** mode, whose
 * regions hold at most five cells).
 *
 * **Regions live in the shared {@link Dsf}, with no minimal-element map.**
 * Seismic reads `canonify` only as a region *identifier*: walls come from a
 * membership comparison, the solver re-reads its root-indexed scratch arrays
 * through `canonify`, and every clue is per-cell. So union-by-size's root choice
 * is unobservable and the shared `Dsf` is byte-match faithful as-is
 * (docs/games/solver-and-generator.md § "The Latin family"). Don't add a
 * min-dsf variant to "restore fidelity".
 */

import { digitValue, isDigit, parseLeadingInt } from "../../engine/decimal.ts";
import { tierNames } from "../../engine/difficulty.ts";
import { Dsf } from "../../engine/dsf.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { newCursor } from "../../engine/pointer.ts";

// --- difficulty ------------------------------------------------------------

/** Naked singles + hidden-single-in-region only. */
export const DIFF_EASY = 0;
/** Adds the trial-placement deduction. */
export const DIFF_NORMAL = 1;
export const DIFFCOUNT = 2;

export const DIFF_NAMES: readonly string[] = tierNames(2);
/** The difficulty letters `encodeParams` writes and `decodeParams` reads. */
const DIFF_CHARS = "eh";

// --- game mode -------------------------------------------------------------

export const MODE_SEISMIC = 0;
export const MODE_TECTONIC = 1;

export const MODE_NAMES: readonly string[] = ["Seismic", "Tectonic"];

// --- cell flags ------------------------------------------------------------

/** A given: the player may not edit it. */
export const FM_FIXED = 0x01;
/** Live error: this number appears twice in its region. */
export const FM_ERRORDUP = 0x02;
/** Live error: an equal number sits within this number's keep-apart range. */
export const FM_ERRORDIST = 0x04;
export const FM_ERRORMASK = FM_ERRORDUP | FM_ERRORDIST;

// --- candidate bit helpers -------------------------------------------------

/** The candidate bit for number `n` (`1..9`) — bit `n − 1`, as upstream. */
export const numBit = (n: number): number => 1 << (n - 1);
/** Every candidate a region of size `k` admits: bits for `1..k`. */
export const areaBits = (k: number): number => (1 << k) - 1;
/** The widest candidate set (a region of nine). */
export const ALL_MARKS = areaBits(9);

// --- params ----------------------------------------------------------------

export interface SeismicParams {
  w: number;
  h: number;
  /** {@link DIFF_EASY} or {@link DIFF_NORMAL}. */
  diff: number;
  /** {@link MODE_SEISMIC} or {@link MODE_TECTONIC}. */
  mode: number;
}

export const PRESETS: readonly SeismicParams[] = [
  { w: 4, h: 4, diff: DIFF_EASY, mode: MODE_SEISMIC },
  { w: 4, h: 4, diff: DIFF_EASY, mode: MODE_TECTONIC },
  { w: 4, h: 4, diff: DIFF_NORMAL, mode: MODE_SEISMIC },
  { w: 4, h: 4, diff: DIFF_NORMAL, mode: MODE_TECTONIC },
  { w: 6, h: 6, diff: DIFF_EASY, mode: MODE_SEISMIC },
  { w: 6, h: 6, diff: DIFF_EASY, mode: MODE_TECTONIC },
  { w: 6, h: 6, diff: DIFF_NORMAL, mode: MODE_SEISMIC },
  { w: 6, h: 6, diff: DIFF_NORMAL, mode: MODE_TECTONIC },
  { w: 7, h: 7, diff: DIFF_EASY, mode: MODE_SEISMIC },
  { w: 7, h: 7, diff: DIFF_EASY, mode: MODE_TECTONIC },
  { w: 7, h: 7, diff: DIFF_NORMAL, mode: MODE_SEISMIC },
  { w: 7, h: 7, diff: DIFF_NORMAL, mode: MODE_TECTONIC },
  // Past upstream's range (its generator stopped at 7×7): the largest board whose
  // *worst* observed generation stays near two seconds — see `MAX_CELLS_SEISMIC`,
  // which is set by the tail and not the median.
  { w: 8, h: 8, diff: DIFF_EASY, mode: MODE_SEISMIC },
  { w: 8, h: 8, diff: DIFF_EASY, mode: MODE_TECTONIC },
  { w: 8, h: 8, diff: DIFF_NORMAL, mode: MODE_SEISMIC },
  { w: 8, h: 8, diff: DIFF_NORMAL, mode: MODE_TECTONIC },
];

const DEFAULT_PRESET = 4;

export function defaultParams(): SeismicParams {
  return { ...PRESETS[DEFAULT_PRESET] };
}

export function presetName(p: SeismicParams): string {
  return `${MODE_NAMES[p.mode]}: ${p.w}x${p.h} ${DIFF_NAMES[p.diff]}`;
}

export function encodeParams(p: SeismicParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (p.mode === MODE_TECTONIC) s += "T";
  if (full) s += `d${DIFF_CHARS[p.diff]}`;
  return s;
}

export function decodeParams(s: string): SeismicParams {
  const p = defaultParams();

  const wParse = parseLeadingInt(s, 0);
  p.w = wParse.value;
  let i = wParse.next;
  if (s[i] === "x") {
    const hParse = parseLeadingInt(s, i + 1);
    p.h = hParse.value;
    i = hParse.next;
  } else {
    p.h = p.w;
  }

  // The mode letter precedes the difficulty suffix, as upstream writes it.
  p.mode = MODE_SEISMIC;
  if (s[i] === "T") {
    p.mode = MODE_TECTONIC;
    i++;
  }

  if (s[i] === "d") {
    i++;
    // Upstream deliberately parks an out-of-range value here so an unknown
    // letter is rejected by validateParams rather than silently defaulted.
    p.diff = DIFFCOUNT + 1;
    if (i < s.length) {
      const found = DIFF_CHARS.indexOf(s[i]);
      if (found >= 0) p.diff = found;
      i++;
    }
  }

  return p;
}

/**
 * The largest board each mode's generator will be asked for, in cells. Two
 * different questions decide these two numbers, and conflating them is the
 * mistake this comment exists to prevent.
 *
 * **Tectonic's bound answers "how long is too long?"** Every Tectonic size up to
 * 100 cells is *reachable* — an exhaustive sweep of the accepted `(w, h,
 * difficulty)` combinations had zero failures — but nine seeds per slow size
 * showed medians that look fine hiding tails that do not:
 *
 * | Tectonic    | median      | worst of 9 seeds |
 * |-------------|-------------|------------------|
 * | 8×8  (64)   | 0.3–1.8 s   | **2.3 s**        |
 * | 10×8 (80)   | 1.4–1.9 s   | 17.0 s           |
 * | 9×9  (81)   | 1.1–1.5 s   | 16.2 s           |
 * | 10×10 (100) | 4.9–6.2 s   | 18.3 s           |
 *
 * A long wait in the Custom dialog is acceptable (owner decision), so Tectonic's
 * bound is the reachability limit, 100 cells, which admits 10×10 — the size
 * upstream's own TODO names ("10x10 is a common size for Hakyuu puzzles").
 * `PRESETS` still stops at 8×8: a preset is a wait sprung on anyone opening the
 * Type menu, whereas a Custom size is a wait the player chose.
 *
 * **Seismic's bound answers "is it possible at all?", and no wait fixes it.**
 * 10×10 Seismic does not generate: six attempts across both difficulties each
 * ran ~16 s and then threw `RetryLimitExceeded`. Nine region-size distributions
 * were measured against it, and the best managed 34 fills per 100 partitions
 * only by pushing mean region size to 4.45 against upstream's 2.62 — visibly
 * changing the puzzle at every size. Small-region distributions are *provably*
 * infeasible there: mean size 2.26 puts 44 `1`s on a 10×10 against a hard
 * ceiling of 50 (no two `1`s orthogonally adjacent). Reaching it needs a
 * different fill algorithm, not a tuned constant (`audit-author-known-issues`
 * §3a names the experiment that would cost one).
 *
 * So Seismic stays at **64**, the largest area whose worst observed run stays
 * near two seconds. Its exhaustive sweep passed up to 72 cells, but on
 * single-seed timings already reaching 5.5 s, with no tail measurement behind
 * them. Do not raise it without repeating the slow sizes over several seeds: a
 * median-based bound has been shipped here and retracted once already.
 *
 * Refusing in `validateParams`, where the Custom dialog can show a reason, is
 * docs/games/solver-and-generator.md § "Unlucky, impossible, and load-bearing
 * validation"'s prescribed handling. Its cost: a hand-authored Seismic
 * `10x10:⟨desc⟩` game ID is refused too, since params are validated the same
 * way for a `:desc` id as for a `#seed` one.
 */
export const MAX_CELLS_SEISMIC = 64;

/** @see MAX_CELLS_SEISMIC — Tectonic's limit is reachability, not the fill. */
export const MAX_CELLS_TECTONIC = 100;

function maxCells(mode: number): number {
  return mode === MODE_TECTONIC ? MAX_CELLS_TECTONIC : MAX_CELLS_SEISMIC;
}

export function validateParams(p: SeismicParams, _full: boolean): string | null {
  if (p.w < 4 || p.h < 4) return "Width and height must be at least 4";
  const max = maxCells(p.mode);
  if (p.w * p.h > max)
    return `Width times height must be at most ${max} in ${MODE_NAMES[p.mode]} mode (the generator cannot reliably build a larger board)`;
  if (p.diff >= DIFFCOUNT) return "Unknown difficulty rating";
  return null;
}

// --- state -----------------------------------------------------------------

/** The mutable board the solver and the generator work on — exactly the part of
 * `game_state` they touch. {@link SeismicState} satisfies it structurally, so a
 * cloned state can be handed straight to the solver. */
export interface SeismicBoard {
  readonly w: number;
  readonly h: number;
  readonly mode: number;
  /** The region partition. Never mutated during play. */
  readonly dsf: Dsf;
  /** Placed numbers, `0` = empty. */
  readonly grid: Uint8Array;
  /** `FM_*` bits. */
  readonly flags: Uint8Array;
  /** Candidate bitmask per cell — the player's pencil marks during play, the
   * solver's live candidate set while solving. */
  readonly pencil: Uint16Array;
}

export interface SeismicState extends SeismicBoard {
  readonly params: SeismicParams;
  completed: boolean;
  cheated: boolean;
}

export function blankBoard(w: number, h: number, mode: number): SeismicBoard {
  return {
    w,
    h,
    mode,
    dsf: new Dsf(w * h),
    grid: new Uint8Array(w * h),
    flags: new Uint8Array(w * h),
    pencil: new Uint16Array(w * h),
  };
}

export function cloneState(s: SeismicState): SeismicState {
  return {
    w: s.w,
    h: s.h,
    mode: s.mode,
    // The partition is immutable for the life of the game, so every state
    // shares one instance rather than cloning a union-find per keystroke.
    dsf: s.dsf,
    grid: s.grid.slice(),
    flags: s.flags.slice(),
    pencil: s.pencil.slice(),
    params: s.params,
    completed: s.completed,
    cheated: s.cheated,
  };
}

// --- moves and ui ----------------------------------------------------------

export type SeismicMove =
  /** Place (`pencil: false`) or toggle a pencil mark (`pencil: true`); `n === 0`
   * clears the cell / all of its marks. */
  | { type: "set"; x: number; y: number; n: number; pencil: boolean }
  /** Upstream's `M`: fill every empty cell's marks with its region's candidates. */
  | { type: "pencilAll" }
  /** Fill in the solver's answer. */
  | { type: "solve"; grid: number[] };

export interface SeismicUi {
  /** Highlighted cell. */
  cursor: GridCursor;
  /** Whether the highlight was last moved by the keyboard (upstream keeps the
   * cursor visible after a keyboard entry, but hides it after a mouse one). */
  cursorFromKeyboard: boolean;
  /** Whether entry goes to pencil marks rather than the cell. */
  pencilMode: boolean;
  /** Fork divergence (docs/games/mechanics.md § "Pencil marks: the full note-taking UX"): right-click toggles a *persistent* pencil
   * mode rather than a one-shot pencil selection. */
  pencilSticky: boolean;
  /** Preference (default on): keep the mouse highlight after a pencil change. */
  pencilKeepHighlight: boolean;
}

export function newUi(_state: SeismicState): SeismicUi {
  return {
    cursor: newCursor(),
    cursorFromKeyboard: false,
    pencilMode: false,
    pencilSticky: true,
    pencilKeepHighlight: true,
  };
}

// --- description codec -----------------------------------------------------

/** Number of border positions a `w × h` grid has: every horizontal border
 * (between two cells in a row) first, then every vertical one. */
export function borderCount(w: number, h: number): number {
  return (w - 1) * h + w * (h - 1);
}

/**
 * Encode the border list as upstream's alternating run-length scheme: a decimal
 * count for a run of walls, and a letter for a run of non-walls **plus the one
 * wall that ends it** (`'a'` = one gap then a wall, …).
 *
 * *One deliberate divergence, confined to the range where the C's own reader
 * cannot invert its writer.* Upstream emits a bare `'a' + erun - 1` for any gap
 * run, which at `erun === 26` produces `'z'` — a character its decoder reads as
 * "26 gaps and **no** following wall", losing a wall — and past 26 produces
 * characters outside `'a'..'z'` that the decoder rejects outright. Gap runs of
 * 26+ therefore have no defined behavior upstream
 * (docs/games/solver-and-generator.md § "Divergence and what it costs" rule 1),
 * so this chunks them into `'z'` units (26 gaps, no wall — exactly what the
 * reader already means by `'z'`) and lets the residue, or the following wall
 * run, carry the wall. Output is character-for-character identical to the C for
 * every run of ≤ 25, which is every run a generated puzzle has produced.
 */
export function encodeWalls(walls: ArrayLike<number>, ws: number): string {
  let out = "";
  let erun = 0;
  let wrun = 0;
  for (let i = 0; i < ws; i++) {
    if (!walls[i]) {
      if (wrun > 0) out += String(wrun);
      wrun = 0;
      erun++;
    } else if (erun > 0) {
      out += gapLetters(erun);
      // A closing letter already speaks for this wall; a bare run of 'z's does not.
      wrun = erun % 26 === 0 ? 1 : 0;
      erun = 0;
    } else {
      wrun++;
    }
  }
  if (wrun > 0) out += String(wrun);
  // A trailing gap run has no wall after it; the letter's implied wall falls off
  // the end of the border list, exactly as upstream.
  return out + gapLetters(erun);
}

/** Encode the clue grid: letter runs for empty cells, the digit itself for a
 * given. */
function encodeClues(grid: ArrayLike<number>, s: number): string {
  let out = "";
  let erun = 0;
  for (let i = 0; i < s; i++) {
    if (grid[i] === 0) {
      erun++;
    } else {
      out += gapLetters(erun) + String(grid[i]);
      erun = 0;
    }
  }
  return out + gapLetters(erun);
}

/** A run of `n` gaps as letters: a `'z'` per 26, then one letter for the rest
 * (`'a'` = 1). */
function gapLetters(n: number): string {
  const rest = n % 26;
  return "z".repeat((n - rest) / 26) + (rest ? String.fromCharCode(0x60 + rest) : "");
}

/** The wall list plus the clue grid — upstream's `⟨walls⟩,⟨clues⟩` description. */
export function encodeDesc(board: SeismicBoard): string {
  const { w, h, dsf, grid } = board;
  const ws = borderCount(w, h);
  const walls = new Uint8Array(ws);

  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      walls[i++] = dsf.equivalent(y * w + x, y * w + x + 1) ? 0 : 1;
    }
  }
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      walls[i++] = dsf.equivalent(y * w + x, (y + 1) * w + x) ? 0 : 1;
    }
  }

  return `${encodeWalls(walls, ws)},${encodeClues(grid, w * h)}`;
}

/** Decode a description into a fresh board, reporting whether the wall list
 * parsed rather than throwing (`validateDesc` turns that into a message). */
function readDesc(
  p: SeismicParams,
  desc: string,
): { board: SeismicBoard; wallsValid: boolean } {
  const { w, h } = p;
  const ws = borderCount(w, h);
  const board = blankBoard(w, h, p.mode);
  const walls = new Uint8Array(ws);
  let wallsValid = true;

  let at = 0;
  let erun = 0;
  let wrun = 0;
  for (let i = 0; i < ws; i++) {
    if (erun === 0 && wrun === 0) {
      const c = desc[at];
      if (c !== undefined && isDigit(c)) {
        const r = parseLeadingInt(desc, at);
        wrun = r.value;
        at = r.next;
      } else if (c !== undefined && c >= "a" && c <= "y") {
        // A letter is a gap run *and* the wall that ends it.
        erun = c.charCodeAt(0) - 0x61 + 1;
        wrun = 1;
        at++;
      } else if (c === "z") {
        erun = 26;
        at++;
      } else {
        wallsValid = false;
      }
    }
    if (erun > 0) {
      walls[i] = 0;
      erun--;
    } else if (wrun > 0) {
      walls[i] = 1;
      wrun--;
    }
  }

  const hs = (w - 1) * h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      if (!walls[y * (w - 1) + x]) board.dsf.merge(y * w + x, y * w + x + 1);
    }
  }
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      if (!walls[hs + y * w + x]) board.dsf.merge(y * w + x, (y + 1) * w + x);
    }
  }

  // Skip the ',' separator (upstream advances unconditionally, so a truncated
  // description simply reads the clue grid as all-empty).
  at++;
  erun = 0;
  for (let i = 0; i < w * h; i++) {
    let c = "";
    if (erun === 0 && at < desc.length) {
      c = desc[at++];
      if (c >= "a" && c <= "z") erun = c.charCodeAt(0) - 0x61 + 1;
    }
    if (erun > 0) {
      c = "";
      erun--;
    }
    if (digitValue(c) >= 1) {
      board.grid[i] = digitValue(c);
      board.flags[i] = FM_FIXED;
    }
  }

  return { board, wallsValid };
}

export function validateDesc(p: SeismicParams, desc: string): string | null {
  const { board, wallsValid } = readDesc(p, desc);
  if (!wallsValid) return "Region description contains invalid characters";

  // The last offending cell decides the message, as upstream.
  let error: string | null = null;
  for (let i = 0; i < p.w * p.h; i++) {
    const size = board.dsf.size(i);
    if (size > 9) error = "A region is too large";
    if (board.grid[i] > size) error = "A clue is too large";
  }
  return error;
}

export function newState(p: SeismicParams, desc: string): SeismicState {
  const { board } = readDesc(p, desc);
  return { ...board, params: p, completed: false, cheated: false };
}

// --- text rendering --------------------------------------------------------

export function textFormat(state: SeismicState): string {
  const { w, h, dsf, grid } = state;
  const rows: string[] = [];

  rows.push(`+${"-+".repeat(w)}`);
  for (let y = 0; y < h; y++) {
    let cells = "|";
    let under = "+";
    for (let x = 0; x < w; x++) {
      const c = grid[y * w + x];
      cells += c > 0 ? String(c) : ".";
      cells += x === w - 1 || !dsf.equivalent(y * w + x, y * w + x + 1) ? "|" : " ";
      under += y === h - 1 || !dsf.equivalent(y * w + x, (y + 1) * w + x) ? "-" : " ";
      under += "+";
    }
    rows.push(cells);
    rows.push(under);
  }
  return `${rows.join("\n")}\n`;
}
