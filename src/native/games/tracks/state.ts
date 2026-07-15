/**
 * Tracks (Train Tracks) state, params, desc codec, the shared-edge board
 * model, and the live error/completion analysis — the state half of a native
 * TS port of `tracks.c`.
 *
 * Lay a single continuous train track from an entrance on the left edge to an
 * exit on the bottom edge of a `w × h` grid, using only straight and curved
 * rails that neither cross nor form a loop, so every row/column clue counts
 * the number of track-bearing cells in it.
 *
 * The per-cell flag word keeps upstream's exact bit layout (an `Int32Array`
 * of `sflags`): the solver is byte-match-critical, so reproducing its bit
 * arithmetic verbatim is the lowest-risk choice (playbook §4.4). Edges are
 * shared between neighbouring cells — setting one cell's edge mirrors the bit
 * onto the adjacent cell — so the two never disagree.
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import { Dsf } from "../../engine/dsf.ts";
import { findLoops } from "../../engine/findloop.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions } from "../../engine/params.ts";

// --- difficulty (upstream DIFFLIST: Easy, Tricky, Hard) -------------------
export const DIFF_EASY = 0;
export const DIFF_TRICKY = 1;
export const DIFF_HARD = 2;
export const DIFF_COUNT = 3;
export const DIFF_NAMES = ["Easy", "Tricky", "Hard"] as const;
export const DIFF_CHARS = "eth"; // ENCODE chars, indexed by difficulty

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
export const MOVECHAR = (d: number): string =>
  d === R ? "R" : d === U ? "U" : d === L ? "L" : d === D ? "D" : "?";

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
  readonly usedSolve: boolean;
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
  dragging: boolean;
  clearing: boolean;
  notrack: boolean;
  dragSx: number;
  dragSy: number;
  dragEx: number;
  dragEy: number;
  clickx: number;
  clicky: number;
  /** Keyboard cursor over the half-size grid (0..2w, 0..2h). */
  curx: number;
  cury: number;
  cursorActive: boolean;
}

/** A player mark that contradicts the unique solution (Check & Save). */
export interface TracksMistake {
  x: number;
  y: number;
}

// --- a mutable working board (the solver/generator/executeMove subject) ----

/** The mutable board the solver and generator work on — upstream mutates the
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

/** The four directions in which a particular edge flag is set around a
 * square. */
export function sEDirs(b: Board, x: number, y: number, eflag: number): number {
  const shift = eflag === E_TRACK ? S_TRACK_SHIFT : S_NOTRACK_SHIFT;
  return (b.sflags[y * b.w + x] >> shift) & ALLDIR;
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

/** The neighbour across edge `d`, and the reciprocal direction, or null. */
function sEAdj(
  b: Board,
  x: number,
  y: number,
  d: number,
): { ax: number; ay: number; ad: number } | null {
  if (d === L && x > 0) return { ax: x - 1, ay: y, ad: R };
  if (d === R && x < b.w - 1) return { ax: x + 1, ay: y, ad: L };
  if (d === U && y > 0) return { ax: x, ay: y - 1, ad: D };
  if (d === D && y < b.h - 1) return { ax: x, ay: y + 1, ad: U };
  return null;
}

/** Set a flag on a given edge of a square (and its shared neighbour edge). */
export function sESet(b: Board, x: number, y: number, d: number, eflag: number): void {
  const shift = eflag === E_TRACK ? S_TRACK_SHIFT : S_NOTRACK_SHIFT;
  b.sflags[y * b.w + x] |= d << shift;
  const adj = sEAdj(b, x, y, d);
  if (adj) b.sflags[adj.ay * b.w + adj.ax] |= adj.ad << shift;
}

/** Clear a flag on a given edge of a square (and its shared neighbour edge). */
export function sEClear(
  b: Board,
  x: number,
  y: number,
  d: number,
  eflag: number,
): void {
  const shift = eflag === E_TRACK ? S_TRACK_SHIFT : S_NOTRACK_SHIFT;
  b.sflags[y * b.w + x] &= ~(d << shift);
  const adj = sEAdj(b, x, y, d);
  if (adj) b.sflags[adj.ay * b.w + adj.ax] &= ~(adj.ad << shift);
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

export function encodeParams(p: TracksParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += `d${DIFF_CHARS[p.diff] ?? "?"}${p.singleOnes ? "" : "o"}`;
  return s;
}

export function decodeParams(s: string): TracksParams {
  const ret = defaultParams();
  const dims = parseDimensions(s, 0);
  ret.w = dims.w;
  ret.h = dims.h;
  let i = dims.next;
  if (s[i] === "d") {
    i++;
    // Upstream leniency: an unknown difficulty char leaves DIFF_TRICKY.
    const idx = DIFF_CHARS.indexOf(s[i]);
    if (idx >= 0) ret.diff = idx;
    if (i < s.length) i++;
  }
  ret.singleOnes = true;
  if (s[i] === "o") {
    ret.singleOnes = false;
    i++;
  }
  return ret;
}

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
    let f = 0;
    if (ch >= "0" && ch <= "9") f = ch.charCodeAt(0) - 48;
    else if (ch >= "A" && ch <= "F") f = ch.charCodeAt(0) - 65 + 10;
    else if (ch >= "a" && ch <= "z") i += ch.charCodeAt(0) - 97;
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
    while (pos < desc.length && desc[pos] >= "0" && desc[pos] <= "9") pos++;
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
    if (ch >= "0" && ch <= "9") f = ch.charCodeAt(0) - 48;
    else if (ch >= "A" && ch <= "F") f = ch.charCodeAt(0) - 65 + 10;
    else if (ch >= "a" && ch <= "z") i += ch.charCodeAt(0) - 97;

    if (f !== 0) {
      const x = i % w;
      const y = Math.floor(i / w);
      b.sflags[i] |= S_TRACK | S_CLUE;
      if (f & U) sESet(b, x, y, U, E_TRACK);
      if (f & D) sESet(b, x, y, D, E_TRACK);
      if (f & L) sESet(b, x, y, L, E_TRACK);
      if (f & R) sESet(b, x, y, R, E_TRACK);
    }
    i++;
    pos++;
    if (i === w * h) break;
  }
  let rowS = -1;
  let colS = -1;
  for (let n = 0; n < w + h; n++) {
    // desc[pos] === ',' (validated)
    pos++;
    if (desc[pos] === "S") {
      if (n < w) colS = n;
      else rowS = n - w;
      pos++;
    }
    let numStr = "";
    while (pos < desc.length && desc[pos] >= "0" && desc[pos] <= "9") {
      numStr += desc[pos];
      pos++;
    }
    b.numbers[n] = Number.parseInt(numStr || "0", 10);
  }
  b.rowS = rowS;
  b.colS = colS;
  return b;
}

/** Encode a board's clue squares + numbers as the upstream desc. */
export function encodeDesc(b: Board): string {
  const { w, h } = b;
  let desc = "";
  for (let i = 0; i < w * h; i++) {
    if (
      !(b.sflags[i] & S_CLUE) &&
      desc.length > 0 &&
      desc[desc.length - 1] >= "a" &&
      desc[desc.length - 1] < "z"
    ) {
      // Advance the current run letter.
      desc =
        desc.slice(0, -1) + String.fromCharCode(desc.charCodeAt(desc.length - 1) + 1);
    } else if (!(b.sflags[i] & S_CLUE)) {
      desc += "a";
    } else {
      const f = sEDirs(b, i % w, Math.floor(i / w), E_TRACK);
      desc += f < 10 ? String.fromCharCode(48 + f) : String.fromCharCode(65 + (f - 10));
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
    usedSolve: false,
  };
}

export function status(s: TracksState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- completion flash labelling (upstream set_flash_data) ------------------

/** Label each track tile with how far along the track it is (an 8-bit field),
 * so the completion flash can travel along the route. */
export function setFlashData(b: Board): void {
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

function* tracksNeighbours(b: Board, vertex: number): Iterable<number> {
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
    for (let i = 0; i < w + h; i++) b.numErrors[i] = 0;
    for (let i = 0; i < w * h; i++) {
      b.sflags[i] &= ~S_ERROR;
      if (sECount(b, i % w, Math.floor(i / w), E_TRACK) > 2) {
        ret = false;
        b.sflags[i] |= S_ERROR;
      }
    }
  }

  // Connectivity of the current track set.
  const dsf = new Dsf(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      // Guard the grid boundary (upstream `dsf_update_completion` checks
      // INGRID): the exit cell's outward edge must not merge off-grid.
      if (x < w - 1 && sEDirs(b, x, y, E_TRACK) & R) dsf.merge(i, y * w + (x + 1));
      if (y < h - 1 && sEDirs(b, x, y, E_TRACK) & D) dsf.merge(i, (y + 1) * w + x);
    }
  }

  // No loop allowed.
  const loops = findLoops(w * h, (v) => tracksNeighbours(b, v));
  if (loops.anyLoop) {
    ret = false;
    if (mark) {
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          const u = y * w + x;
          for (const v of tracksNeighbours(b, u)) {
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

  for (let x = 0; x < w; x++) {
    const target = b.numbers[x];
    let ntrack = 0;
    let nnotrack = 0;
    let ntrackcomplete = 0;
    for (let y = 0; y < h; y++) {
      if (sECount(b, x, y, E_TRACK) > 0 || b.sflags[y * w + x] & S_TRACK) ntrack++;
      if (sECount(b, x, y, E_TRACK) === 2) ntrackcomplete++;
      if (b.sflags[y * w + x] & S_NOTRACK) nnotrack++;
    }
    if (mark) {
      if (
        ntrack > target ||
        nnotrack > h - target ||
        (pathret && ntrackcomplete !== target)
      ) {
        b.numErrors[x] = 1;
        ret = false;
      }
    }
    if (ntrackcomplete !== target) ret = false;
  }
  for (let y = 0; y < h; y++) {
    const target = b.numbers[w + y];
    let ntrack = 0;
    let nnotrack = 0;
    let ntrackcomplete = 0;
    for (let x = 0; x < w; x++) {
      if (sECount(b, x, y, E_TRACK) > 0 || b.sflags[y * w + x] & S_TRACK) ntrack++;
      if (sECount(b, x, y, E_TRACK) === 2) ntrackcomplete++;
      if (b.sflags[y * w + x] & S_NOTRACK) nnotrack++;
    }
    if (mark) {
      if (
        ntrack > target ||
        nnotrack > w - target ||
        (pathret && ntrackcomplete !== target)
      ) {
        b.numErrors[w + y] = 1;
        ret = false;
      }
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
  const hex = (n: number) =>
    n < 10 ? String.fromCharCode(48 + n) : String.fromCharCode(65 + n - 10);
  let out = "";
  // Column clues.
  out += "  ";
  for (let x = 0; x < w; x++) out += `${hex(b.numbers[x])} `;
  out += "\n";
  // Top edge.
  out += " +";
  for (let x = 0; x < w * 2 - 1; x++) out += "-";
  out += "+\n";
  for (let y = 0; y < h; y++) {
    out += y === b.rowS ? "A" : " ";
    out += y === b.rowS ? "-" : "|";
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
    out += hex(b.numbers[w + y]);
    out += "\n";
    if (y === h - 1) continue;
    out += " |";
    for (let x = 0; x < w; x++) {
      const f = sEDirs(b, x, y, E_TRACK);
      out += f & D ? "|" : " ";
      out += x < w - 1 ? " " : "|";
    }
    out += "\n";
  }
  out += " +";
  for (let x = 0; x < w * 2 - 1; x++) out += x === b.colS * 2 ? "|" : "-";
  out += "+\n";
  out += "  ";
  for (let x = 0; x < w * 2 - 1; x++) out += x === b.colS * 2 ? "B" : " ";
  out += "\n";
  return out;
}
