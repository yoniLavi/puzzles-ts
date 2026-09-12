/**
 * Tracks (Train Tracks) state, params, desc codec, the shared-edge board
 * model, and the live error/completion analysis: the state half of the port
 * of `tracks.c`.
 *
 * Lay a single continuous train track from an entrance on the left edge to an
 * exit on the bottom edge of a `w × h` grid, using only straight and curved
 * rails that neither cross nor form a loop, so every row/column clue counts
 * the number of track-bearing cells in it.
 *
 * The per-cell flag word keeps upstream's exact bit layout (an `Int32Array`
 * of `sflags`): the solver is byte-match-critical, so reproducing its bit
 * arithmetic verbatim is the lowest-risk choice
 * (docs/games/solver-and-generator.md § "Solver-gated generation"). Edges are
 * shared between neighboring cells: setting one cell's edge mirrors the bit
 * onto the adjacent cell, so the two never disagree.
 */

import { parseLeadingInt } from "../../engine/decimal.ts";
import { c2nUpper, n2cUpper, UPPER_ALPHABET_SIZE } from "../../engine/desc-alphabet.ts";
import { tierNames } from "../../engine/difficulty.ts";
import { Dsf } from "../../engine/dsf.ts";
import { findLoops } from "../../engine/findloop.ts";
import type { ParamConfigItem, PresetMenu } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import { choice, dims, flag, paramsCodec } from "../../engine/params-codec.ts";
import type { GridCursor, GridDrag } from "../../engine/pointer.ts";
import type { GameStatus } from "../../engine/types.ts";

// --- difficulty (upstream's Easy, Tricky, Hard; shown as tierNames(3)) ------
export const DIFF_EASY = 0;
export const DIFF_TRICKY = 1;
export const DIFF_HARD = 2;
export const DIFF_COUNT = 3;
const DIFF_NAMES: readonly string[] = tierNames(DIFF_COUNT);
const DIFF_CHARS = "eth"; // ENCODE chars, indexed by difficulty

// --- directions (upstream R/U/L/D bit flags) ------------------------------
export const R = 1;
export const U = 2;
export const L = 4;
export const D = 8;
export const ALLDIR = 15;
export const DIRS = [U, D, L, R] as const; // upstream dirs_const order

export const DX = (d: number): number => (d === R ? 1 : d === L ? -1 : 0);
export const DY = (d: number): number => (d === D ? 1 : d === U ? -1 : 0);
/** The opposite direction (upstream `F`). */
export const FLIP = (d: number): number => ((d << 2) | (d >> 2)) & 0xf;

export const NBITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;

// --- square + edge flag bits (upstream layout) ----------------------------
export const S_TRACK = 1;
export const S_NOTRACK = 2;
export const S_ERROR = 4;
export const S_CLUE = 8;
export const S_MARK = 16;
export const S_FLASH_SHIFT = 8;
export const S_FLASH_MASK = (1 << 8) - 1;
export const S_TRACK_SHIFT = 16;
export const S_NOTRACK_SHIFT = 20;

export const E_TRACK = 1;
export const E_NOTRACK = 2;

// --- types ----------------------------------------------------------------

export interface TracksParams {
  w: number;
  h: number;
  diff: number;
  /** Disallow consecutive 1-clues (upstream `single_ones`, default true). */
  singleOnes: boolean;
}

/** The shared, immutable clue-number + station data (upstream `struct
 * numbers`). `numbers` holds the `w` column clues then the `h` row clues;
 * `colS` is the exit column (bottom edge), `rowS` the entrance row (left
 * edge). */
export interface TracksNumbers {
  readonly numbers: Int32Array; // length w + h
  readonly rowS: number;
  readonly colS: number;
}

export interface TracksState {
  readonly w: number;
  readonly h: number;
  readonly diff: number;
  readonly singleOnes: boolean;
  /** Per-cell flag word, upstream layout; cloned per move. */
  readonly sflags: Int32Array;
  /** Shared clue numbers + stations. */
  readonly numbers: TracksNumbers;
  /** Per-clue error flag (length w + h), recomputed each move. */
  readonly numErrors: Uint8Array;
  readonly completed: boolean;
  readonly cheated: boolean;
}

/** One flag change: set/clear a track/no-track flag on a square or one of its
 * edges. A single drag or solve produces a list of these. */
export interface TracksOp {
  kind: "square" | "edge";
  x: number;
  y: number;
  /** For an edge op, the direction (R/U/L/D); ignored for a square op. */
  dir?: number;
  track: boolean; // true → track (S_TRACK/E_TRACK); false → no-track
  set: boolean; // true → set the flag; false → clear it
}

export type TracksMove = { ops: TracksOp[]; solve?: boolean };

export interface TracksUi {
  /** The drag's anchor and current cell, in grid coordinates. `live` is "a
   * press is down"; {@link TracksUi.painting} is the narrower thing Tracks
   * cares about. */
  drag: GridDrag;
  /** Whether the drag has **aligned to an axis and is laying track**. A press
   * starts a drag that is live but not yet painting: only once the pointer
   * reaches the anchor's own row or column does the paint begin. Not a second
   * spelling of `drag.live`. */
  painting: boolean;
  clearing: boolean;
  notrack: boolean;
  clickx: number;
  clicky: number;
  /** Keyboard cursor over the half-size grid (0..2w, 0..2h). */
  cursor: GridCursor;
}

// --- a mutable working board (the solver/generator/executeMove subject) ----

/** The mutable board the solver and generator work on: upstream mutates the
 * `game_state` in place, so a close transliteration keeps a mutable holder. */
export interface Board {
  w: number;
  h: number;
  sflags: Int32Array;
  numbers: Int32Array; // length w + h
  rowS: number;
  colS: number;
  numErrors: Uint8Array; // length w + h
  impossible: boolean;
  /**
   * The hint path's recorder; the generator and `findMistakes` leave it
   * undefined and allocate nothing. It rides on the board because every rung
   * already takes the board, so one optional field reaches all eight and the
   * flag setters they change it through (docs/games/hints.md § "Recording the
   * deduction").
   */
  rec?: TracksRecorder;
}

/**
 * What the recording path collects for one firing: the flag changes it made,
 * and the premise that forced them. A change made with no premise standing
 * comes back as a firing with a `null` reason, which the plan hides
 * (`showable` in `hint.ts`).
 */
export interface TracksRecorder {
  /** The rung's premise; `null` when it declares none. `unknown` because the
   * shape belongs to the solver, and naming it here would point this module at
   * the deduction module; `tracksRecordingPass` narrows it. */
  reason: unknown;
  /** The flag changes this firing made, in the order it made them. */
  ops: TracksOp[];
}

export function blankBoard(w: number, h: number): Board {
  return {
    w,
    h,
    sflags: new Int32Array(w * h),
    numbers: new Int32Array(w + h),
    rowS: -1,
    colS: -1,
    numErrors: new Uint8Array(w + h),
    impossible: false,
  };
}

/** A mutable working copy of a state's board (for the solver / findMistakes). */
export function stateToBoard(s: TracksState): Board {
  return {
    w: s.w,
    h: s.h,
    sflags: Int32Array.from(s.sflags),
    numbers: Int32Array.from(s.numbers.numbers),
    rowS: s.numbers.rowS,
    colS: s.numbers.colS,
    numErrors: Uint8Array.from(s.numErrors),
    impossible: false,
  };
}

export const inGrid = (b: { w: number; h: number }, x: number, y: number): boolean =>
  x >= 0 && x < b.w && y >= 0 && y < b.h;

// --- shared-edge helpers (upstream S_E_*) ---------------------------------

const edgeShift = (eflag: number): number =>
  eflag === E_TRACK ? S_TRACK_SHIFT : S_NOTRACK_SHIFT;

/** The four directions in which a particular edge flag is set around a
 * square. */
export function sEDirs(b: Board, x: number, y: number, eflag: number): number {
  return (b.sflags[y * b.w + x] >> edgeShift(eflag)) & ALLDIR;
}

/** Count of a particular edge flag around a square. */
export function sECount(b: Board, x: number, y: number, eflag: number): number {
  return NBITS[sEDirs(b, x, y, eflag)];
}

/** The two flags (E_TRACK / E_NOTRACK) set on a specific edge of a square. */
export function sEFlags(b: Board, x: number, y: number, d: number): number {
  const f = b.sflags[y * b.w + x];
  const t = f & (d << S_TRACK_SHIFT);
  const nt = f & (d << S_NOTRACK_SHIFT);
  return (t ? E_TRACK : 0) | (nt ? E_NOTRACK : 0);
}

/** Set a flag on a given edge of a square (and its shared neighbor edge). */
export function sESet(b: Board, x: number, y: number, d: number, eflag: number): void {
  const shift = edgeShift(eflag);
  b.sflags[y * b.w + x] |= d << shift;
  const ax = x + DX(d);
  const ay = y + DY(d);
  if (inGrid(b, ax, ay)) b.sflags[ay * b.w + ax] |= FLIP(d) << shift;
}

/** Clear a flag on a given edge of a square (and its shared neighbor edge). */
export function sEClear(
  b: Board,
  x: number,
  y: number,
  d: number,
  eflag: number,
): void {
  const shift = edgeShift(eflag);
  b.sflags[y * b.w + x] &= ~(d << shift);
  const ax = x + DX(d);
  const ay = y + DY(d);
  if (inGrid(b, ax, ay)) b.sflags[ay * b.w + ax] &= ~(FLIP(d) << shift);
}

// --- params ---------------------------------------------------------------

const PRESETS: TracksParams[] = [
  { w: 8, h: 8, diff: DIFF_EASY, singleOnes: true },
  { w: 8, h: 8, diff: DIFF_TRICKY, singleOnes: true },
  { w: 10, h: 8, diff: DIFF_EASY, singleOnes: true },
  { w: 10, h: 8, diff: DIFF_TRICKY, singleOnes: true },
  { w: 10, h: 10, diff: DIFF_EASY, singleOnes: true },
  { w: 10, h: 10, diff: DIFF_TRICKY, singleOnes: true },
  { w: 10, h: 10, diff: DIFF_HARD, singleOnes: true },
  { w: 15, h: 10, diff: DIFF_EASY, singleOnes: true },
  { w: 15, h: 10, diff: DIFF_TRICKY, singleOnes: true },
  { w: 15, h: 15, diff: DIFF_EASY, singleOnes: true },
  { w: 15, h: 15, diff: DIFF_TRICKY, singleOnes: true },
  { w: 15, h: 15, diff: DIFF_HARD, singleOnes: true },
];

export function defaultParams(): TracksParams {
  return { w: 8, h: 8, diff: DIFF_TRICKY, singleOnes: true };
}

export function presets(): PresetMenu<TracksParams> {
  return {
    title: "Size",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${DIFF_NAMES[p.diff]}`,
      params: { ...p },
    })),
  };
}

/** The "Custom type…" form, and the field list the codec below encodes. */
export const paramConfig: ParamConfigItem<TracksParams>[] = [
  ...dimensionParamConfig<TracksParams>(),
  {
    kw: "difficulty",
    name: "Difficulty",
    type: "choices",
    choices: [...DIFF_NAMES],
    get: (p) => p.diff,
    set: (p, v) => {
      p.diff = v;
    },
  },
  {
    kw: "disallow-consecutive-1-clues",
    name: "Disallow consecutive 1 clues",
    type: "boolean",
    get: (p) => p.singleOnes,
    set: (p, v) => {
      p.singleOnes = v;
    },
  },
];

/** `WxH`, plus the generator-only difficulty letter. Upstream leniency: an
 * unknown difficulty char leaves the default tier. The `o` letter is written
 * when consecutive 1 clues are *allowed*, so its absence means "disallow". */
export const { encodeParams, decodeParams } = paramsCodec(defaultParams, [
  dims(paramConfig),
  choice(paramConfig, "d", "difficulty", DIFF_CHARS, { full: true }),
  flag(paramConfig, "o", "disallow-consecutive-1-clues", {
    full: true,
    means: false,
  }),
]);

export function validateParams(p: TracksParams, _full: boolean): string | null {
  // Generating anything under 4x4 runs into trouble (upstream).
  if (p.w < 4 || p.h < 4) return "Width and height must both be at least four";
  if (p.w > Number.MAX_SAFE_INTEGER / p.h) {
    return "Width times height must not be unreasonably large";
  }
  return null;
}

// --- desc codec -----------------------------------------------------------
// Grid: run-length `a`–`z` gaps (each letter advances the count) + one hex
// char per clue square (its two E_TRACK direction flags). Then a
// `,`-separated `S?<n>` list of the w column clues and h row clues.

export function validateDesc(p: TracksParams, desc: string): string | null {
  const { w, h } = p;
  let i = 0;
  let pos = 0;
  let inCount = 0;
  let outCount = 0;
  while (pos < desc.length) {
    const ch = desc[pos];
    // A clue square is a nibble of direction flags: `0`–`9`, then `A`–`F`.
    let f = 0;
    if (ch >= "a" && ch <= "z") i += ch.charCodeAt(0) - 97;
    else if (c2nUpper(ch) >= 0 && c2nUpper(ch) <= 15) f = c2nUpper(ch);
    else return "Game description contained unexpected characters";

    if (f !== 0 && NBITS[f] !== 2) return "Clue did not provide 2 direction flags";
    i++;
    pos++;
    if (i === w * h) break;
  }
  for (let n = 0; n < w + h; n++) {
    if (desc[pos] === undefined)
      return "Not enough numbers given after grid specification";
    if (desc[pos] !== ",") return "Invalid character in number list";
    pos++;
    if (desc[pos] === "S") {
      if (n < w) outCount++;
      else inCount++;
      pos++;
    }
    pos = parseLeadingInt(desc, pos).next;
  }
  if (inCount !== 1 || outCount !== 1)
    return "Puzzle must have one entrance and one exit";
  if (pos < desc.length)
    return "Unexpected additional character at end of game description";
  return null;
}

/** Parse a desc into a fresh board (clue squares + edges + numbers/stations). */
export function decodeDesc(p: TracksParams, desc: string): Board {
  const { w, h } = p;
  const b = blankBoard(w, h);
  let i = 0;
  let pos = 0;
  while (pos < desc.length) {
    const ch = desc[pos];
    let f = 0;
    if (ch >= "a" && ch <= "z") i += ch.charCodeAt(0) - 97;
    else if (c2nUpper(ch) >= 0 && c2nUpper(ch) <= 15) f = c2nUpper(ch);

    if (f !== 0) {
      b.sflags[i] |= S_TRACK | S_CLUE;
      for (const d of DIRS) if (f & d) sESet(b, i % w, Math.floor(i / w), d, E_TRACK);
    }
    i++;
    pos++;
    if (i === w * h) break;
  }
  for (let n = 0; n < w + h; n++) {
    // desc[pos] === ',' (validated)
    pos++;
    if (desc[pos] === "S") {
      if (n < w) b.colS = n;
      else b.rowS = n - w;
      pos++;
    }
    const count = parseLeadingInt(desc, pos);
    pos = count.next;
    b.numbers[n] = count.value;
  }
  return b;
}

/** Encode a board's clue squares + numbers as the upstream desc. */
export function encodeDesc(b: Board): string {
  const { w, h } = b;
  let desc = "";
  for (let i = 0; i < w * h; i++) {
    if (b.sflags[i] & S_CLUE) {
      desc += n2cUpper(sEDirs(b, i % w, Math.floor(i / w), E_TRACK));
      continue;
    }
    // Extend the current run letter, or start a new run at `a`.
    const last = desc[desc.length - 1];
    if (last >= "a" && last < "z") {
      desc = desc.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
    } else {
      desc += "a";
    }
  }
  for (let x = 0; x < w; x++) {
    desc += `,${x === b.colS ? "S" : ""}${b.numbers[x]}`;
  }
  for (let y = 0; y < h; y++) {
    desc += `,${y === b.rowS ? "S" : ""}${b.numbers[y + w]}`;
  }
  return desc;
}

export function newState(p: TracksParams, desc: string): TracksState {
  const b = decodeDesc(p, desc);
  return {
    w: p.w,
    h: p.h,
    diff: p.diff,
    singleOnes: p.singleOnes,
    sflags: b.sflags,
    numbers: { numbers: b.numbers, rowS: b.rowS, colS: b.colS },
    numErrors: b.numErrors,
    completed: false,
    cheated: false,
  };
}

export function status(s: TracksState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- completion flash labeling (upstream set_flash_data) ------------------

/** Label each track tile with how far along the track it is (an 8-bit field),
 * so the completion flash can travel along the route. */
function setFlashData(b: Board): void {
  const { w } = b;
  let ntrack = 0;
  for (let x = 0; x < w; x++) ntrack += b.numbers[x];
  let n = 0;
  let x = 0;
  let y = b.rowS;
  let d = R;
  do {
    b.sflags[y * w + x] &= ~(S_FLASH_MASK << S_FLASH_SHIFT);
    b.sflags[y * w + x] |=
      (n * Math.floor(S_FLASH_MASK / (ntrack - 1))) << S_FLASH_SHIFT;
    n++;
    d = FLIP(d); // the direction we just arrived from
    d = sEDirs(b, x, y, E_TRACK) & ~d; // the other track from here
    x += DX(d);
    y += DY(d);
  } while (inGrid(b, x, y));
}

// --- completion / error analysis (upstream check_completion) --------------

/** Union every pair of squares joined by a laid track edge. */
export function trackDsf(b: Board): Dsf {
  const { w, h } = b;
  const dsf = new Dsf(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      // Guard the grid boundary (upstream `dsf_update_completion` checks
      // INGRID): the exit cell's outward edge must not merge off-grid.
      if (x < w - 1 && sEDirs(b, x, y, E_TRACK) & R) dsf.merge(i, i + 1);
      if (y < h - 1 && sEDirs(b, x, y, E_TRACK) & D) dsf.merge(i, i + w);
    }
  }
  return dsf;
}

function* tracksNeighbors(b: Board, vertex: number): Iterable<number> {
  const { w } = b;
  const x = vertex % w;
  const y = Math.floor(vertex / w);
  const dirs = sEDirs(b, x, y, E_TRACK);
  for (let j = 0; j < 4; j++) {
    const dir = 1 << j;
    if (dirs & dir) {
      const nx = x + DX(dir);
      const ny = y + DY(dir);
      if (inGrid(b, nx, ny)) yield ny * w + nx;
    }
  }
}

/**
 * Recompute error state and completion (upstream `check_completion`). With
 * `mark`, sets S_ERROR per cell and numErrors per clue and labels the flash
 * on completion. Returns whether the board is a finished, correct solution.
 */
export function checkCompletion(b: Board, mark: boolean): boolean {
  const { w, h } = b;
  let ret = true;

  if (mark) {
    b.numErrors.fill(0);
    for (let i = 0; i < w * h; i++) {
      b.sflags[i] &= ~S_ERROR;
      if (sECount(b, i % w, Math.floor(i / w), E_TRACK) > 2) {
        ret = false;
        b.sflags[i] |= S_ERROR;
      }
    }
  }

  const dsf = trackDsf(b);

  // No loop allowed.
  const loops = findLoops(w * h, (v) => tracksNeighbors(b, v));
  if (loops.anyLoop) {
    ret = false;
    if (mark) {
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          const u = y * w + x;
          for (const v of tracksNeighbors(b, u)) {
            if (loops.isLoopEdge(u, v)) b.sflags[u] |= S_ERROR;
          }
        }
      }
    }
  }

  if (mark) {
    const pathclass = dsf.canonify(b.rowS * w);
    if (pathclass === dsf.canonify((h - 1) * w + b.colS)) {
      // A continuous entrance→exit path exists: any other track is an error.
      for (let i = 0; i < w * h; i++) {
        if (
          dsf.canonify(i) !== pathclass &&
          (b.sflags[i] & S_TRACK || sECount(b, i % w, Math.floor(i / w), E_TRACK) > 0)
        ) {
          ret = false;
          b.sflags[i] |= S_ERROR;
        }
      }
    } else {
      ret = false;
    }
  }

  const pathret = ret; // do we have a plausible solution so far?

  // Each clue, columns (`0..w-1`) then rows.
  for (let line = 0; line < w + h; line++) {
    const isCol = line < w;
    const len = isCol ? h : w;
    const target = b.numbers[line];
    let ntrack = 0;
    let nnotrack = 0;
    let ntrackcomplete = 0;
    for (let k = 0; k < len; k++) {
      const x = isCol ? line : k;
      const y = isCol ? k : line - w;
      const edges = sECount(b, x, y, E_TRACK);
      if (edges > 0 || b.sflags[y * w + x] & S_TRACK) ntrack++;
      if (edges === 2) ntrackcomplete++;
      if (b.sflags[y * w + x] & S_NOTRACK) nnotrack++;
    }
    if (
      mark &&
      (ntrack > target ||
        nnotrack > len - target ||
        (pathret && ntrackcomplete !== target))
    ) {
      b.numErrors[line] = 1;
      ret = false;
    }
    if (ntrackcomplete !== target) ret = false;
  }

  if (mark && ret) setFlashData(b);
  return ret;
}

// --- text format (upstream game_text_format) ------------------------------

export function textFormat(s: TracksState): string {
  const b = stateToBoard(s);
  const { w, h } = b;
  let out = "  ";
  // A count is bounded only by the grid, and past `Z` the alphabet has no
  // character for it, so the number is written out (upstream wrote the
  // punctuation after `Z`).
  const countChar = (n: number): string =>
    n < UPPER_ALPHABET_SIZE ? n2cUpper(n) : String(n);
  for (let x = 0; x < w; x++) out += `${countChar(b.numbers[x])} `;
  out += `\n +${"-".repeat(w * 2 - 1)}+\n`;
  for (let y = 0; y < h; y++) {
    out += y === b.rowS ? "A-" : " |";
    for (let x = 0; x < w; x++) {
      const f = sEDirs(b, x, y, E_TRACK);
      if (b.sflags[y * w + x] & S_CLUE) out += "C";
      else if (f === (L | U) || f === (R | D)) out += "/";
      else if (f === (L | D) || f === (R | U)) out += "\\";
      else if (f === (U | D)) out += "|";
      else if (f === (R | L)) out += "-";
      else if (b.sflags[y * w + x] & S_NOTRACK) out += "x";
      else out += " ";
      out += x < w - 1 ? (f & R ? "-" : " ") : "|";
    }
    out += `${countChar(b.numbers[w + y])}\n`;
    if (y === h - 1) continue;
    out += " |";
    for (let x = 0; x < w; x++) {
      out += sEDirs(b, x, y, E_TRACK) & D ? "|" : " ";
      out += x < w - 1 ? " " : "|";
    }
    out += "\n";
  }
  out += " +";
  for (let x = 0; x < w * 2 - 1; x++) out += x === b.colS * 2 ? "|" : "-";
  out += "+\n  ";
  for (let x = 0; x < w * 2 - 1; x++) out += x === b.colS * 2 ? "B" : " ";
  out += "\n";
  return out;
}
