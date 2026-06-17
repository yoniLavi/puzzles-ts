import { parseDimensions, parseLeadingInt } from "../../engine/params.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";

// --- types -----------------------------------------------------------

export interface TwiddleParams {
  w: number;
  h: number;
  /** Size of the rotating subsquare (≥ 2). */
  n: number;
  /** One number per row (tiles in a row share a number). */
  rowsonly: boolean;
  /** Orientation matters: a tile must also end upright. */
  orientable: boolean;
  /** Number of shuffling moves; `0` means "auto" (parity-safe default). */
  movetarget: number;
}

export interface TwiddleState {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  readonly orientable: boolean;
  /** Displayed tile numbers in row-major order (1-indexed). The solved
   * board reads in non-decreasing order. */
  readonly numbers: Int32Array;
  /** Tile orientations 0..3 (only meaningful when `orientable`); 0 is
   * upright. Advanced by `(orient + dir) & 3` on each rotation. */
  readonly orient: Uint8Array;
  /** `0` while ongoing; otherwise the move count at which the puzzle was
   * first completed. */
  readonly completed: number;
  /** Set by Solve; suppresses the completion flash and switches the
   * status bar to "Moves since auto-solve". */
  readonly usedSolve: boolean;
  readonly moveCount: number;
  readonly movetarget: number;
  /** Top-left corner + direction of the last rotation, for animation
   * (`-1` when none yet). */
  readonly lastX: number;
  readonly lastY: number;
  readonly lastR: number;
}

/** A rotation carries the top-left corner of the `n×n` region and a
 * direction (`+1`/`-1`); a solve snaps to the solved board (upstream
 * `"S"`). Both are plain JSON-safe data, so the default move codec
 * suffices. */
export type TwiddleMove =
  | { type: "rotate"; x: number; y: number; dir: 1 | -1 }
  | { type: "solve" };

export interface TwiddleUi {
  /** Cursor position in the `(w-n+1) × (h-n+1)` rotation-origin space. */
  curX: number;
  curY: number;
  curVisible: boolean;
}

// --- params ----------------------------------------------------------

export function defaultParams(): TwiddleParams {
  return { w: 3, h: 3, n: 2, rowsonly: false, orientable: false, movetarget: 0 };
}

export function encodeParams(p: TwiddleParams, _full: boolean): string {
  // Upstream writes the full descriptor regardless of `full` (the
  // shuffle limit is part of the limited params because the target move
  // count must be supplied).
  let s = `${p.w}x${p.h}n${p.n}`;
  if (p.rowsonly) s += "r";
  if (p.orientable) s += "o";
  if (p.movetarget) s += `m${p.movetarget}`;
  return s;
}

export function decodeParams(s: string): TwiddleParams {
  // Upstream `decode_params`: w = h = atoi; n = 2; flags off. Then an
  // optional `xH`, an optional `nN`, then any of `r`/`o`/`mK` in order.
  let n = 2;
  let rowsonly = false;
  let orientable = false;
  let movetarget = 0;

  const { w, h, next } = parseDimensions(s);
  let i = next;

  if (s[i] === "n") {
    const nRun = parseLeadingInt(s, i + 1);
    n = nRun.value || 2;
    i = nRun.next;
  }
  while (i < s.length) {
    if (s[i] === "r") {
      rowsonly = true;
      i++;
    } else if (s[i] === "o") {
      orientable = true;
      i++;
    } else if (s[i] === "m") {
      const mRun = parseLeadingInt(s, i + 1);
      movetarget = mRun.value;
      i = mRun.next;
    } else {
      i++;
    }
  }
  return { w, h, n, rowsonly, orientable, movetarget };
}

export function validateParams(p: TwiddleParams, _full: boolean): string | null {
  if (p.n < 2) return "Rotating block size must be at least two";
  if (p.w < p.n) return "Width must be at least the rotating block size";
  if (p.h < p.n) return "Height must be at least the rotating block size";
  if (p.w > Math.floor(0x7fffffff / p.h))
    return "Width times height must not be unreasonably large";
  if (p.movetarget < 0) return "Number of shuffling moves may not be negative";
  return null;
}

// --- presets ----------------------------------------------------------

function preset(
  title: string,
  w: number,
  h: number,
  n: number,
  rowsonly: boolean,
  orientable: boolean,
) {
  return {
    title,
    params: { w, h, n, rowsonly, orientable, movetarget: 0 },
  };
}

export function presets() {
  return {
    title: "Type",
    submenu: [
      preset("3×3 rows only", 3, 3, 2, true, false),
      preset("3×3 normal", 3, 3, 2, false, false),
      preset("3×3 orientable", 3, 3, 2, false, true),
      preset("4×4 normal", 4, 4, 2, false, false),
      preset("4×4 orientable", 4, 4, 2, false, true),
      preset("4×4, rotating 3×3 blocks", 4, 4, 3, false, false),
      preset("5×5, rotating 3×3 blocks", 5, 5, 3, false, false),
      preset("6×6, rotating 4×4 blocks", 6, 6, 4, false, false),
    ],
  };
}

// --- rotation ---------------------------------------------------------

/**
 * Rotate the `n×n` block whose top-left corner is `(x, y)` by `dir`
 * quarter-turns, in place on the given `numbers`/`orient` arrays (the
 * caller passes copies — `executeMove` is pure). Faithful port of
 * upstream `do_rotate`: loop the representative quarter
 * `(n+1)/2 × n/2` and cycle each element with its 4-rotational coset
 * `p[0..3]`. When orientable, each moved tile's orientation advances by
 * `dir` (the upstream `v ^= ((v+dir) ^ v) & 3` packed-bit trick reduces
 * to `(orient + dir) & 3`), plus the lone centre tile when `n` is odd.
 */
export function doRotate(
  numbers: Int32Array,
  orient: Uint8Array,
  w: number,
  _h: number,
  n: number,
  orientable: boolean,
  x: number,
  y: number,
  dir: number,
): void {
  const d = dir & 3;
  if (d === 0) return; // nothing to do

  const base = y * w + x; // translate region to its top-left corner
  for (let i = 0; i < Math.floor((n + 1) / 2); i++) {
    for (let j = 0; j < Math.floor(n / 2); j++) {
      const p = [
        j * w + i,
        i * w + (n - j - 1),
        (n - j - 1) * w + (n - i - 1),
        (n - i - 1) * w + j,
      ];
      const gn = [0, 0, 0, 0];
      const go = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) {
        gn[k] = numbers[base + p[k]];
        go[k] = orient[base + p[k]];
      }
      for (let k = 0; k < 4; k++) {
        const src = (k + d) & 3;
        numbers[base + p[k]] = gn[src];
        orient[base + p[k]] = orientable ? (go[src] + d) & 3 : go[src];
      }
    }
  }

  // Don't forget the orientation on the centre square, if n is odd.
  if (orientable && n & 1) {
    const c = base + (n >> 1) * w + (n >> 1);
    orient[c] = (orient[c] + d) & 3;
  }
}

// --- completion -------------------------------------------------------

/** Solved iff the numbers read in non-decreasing row-major order
 * (non-strict, so `rowsonly`'s repeated numbers pass) and — when
 * orientable — every tile is upright. */
export function isComplete(
  numbers: Int32Array,
  orient: Uint8Array,
  wh: number,
  orientable: boolean,
): boolean {
  for (let i = 1; i < wh; i++) {
    if (numbers[i] < numbers[i - 1]) return false;
  }
  if (orientable) {
    for (let i = 0; i < wh; i++) {
      if (orient[i] !== 0) return false;
    }
  }
  return true;
}

// --- desc / state -----------------------------------------------------

const ORIENT_LETTERS = "uldr"; // index = orientation (u=0, l=1, d=2, r=3)

function letterToOrient(c: string): number {
  switch (c) {
    case "l":
      return 1;
    case "d":
      return 2;
    case "r":
      return 3;
    default: // 'u'
      return 0;
  }
}

function encodeDesc(
  numbers: Int32Array,
  orient: Uint8Array,
  wh: number,
  orientable: boolean,
): string {
  let s = "";
  for (let i = 0; i < wh; i++) {
    s += String(numbers[i]);
    if (orientable) s += ORIENT_LETTERS[orient[i]];
    else if (i < wh - 1) s += ",";
  }
  return s;
}

export function validateDesc(p: TwiddleParams, desc: string): string | null {
  const wh = p.w * p.h;
  let i = 0;
  for (let cell = 0; cell < wh; cell++) {
    if (i >= desc.length || desc[i] < "0" || desc[i] > "9")
      return "Not enough numbers in string";
    while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") i++;
    if (!p.orientable && cell < wh - 1) {
      if (desc[i] !== ",") return "Expected comma after number";
    } else if (p.orientable) {
      const c = desc[i];
      if (c !== "l" && c !== "r" && c !== "u" && c !== "d")
        return "Expected orientation letter after number";
    } else if (cell === wh - 1 && i < desc.length) {
      return "Excess junk at end of string";
    }
    if (i < desc.length) i++; // eat separator / orientation letter
  }
  return null;
}

function parseDesc(
  desc: string,
  wh: number,
  orientable: boolean,
): { numbers: Int32Array; orient: Uint8Array } {
  const numbers = new Int32Array(wh);
  const orient = new Uint8Array(wh);
  let i = 0;
  for (let cell = 0; cell < wh; cell++) {
    let numStr = "";
    while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") {
      numStr += desc[i];
      i++;
    }
    numbers[cell] = Number.parseInt(numStr, 10);
    if (i < desc.length) {
      if (orientable) orient[cell] = letterToOrient(desc[i]);
      i++; // consume orientation letter or comma
    }
  }
  return { numbers, orient };
}

export function newState(p: TwiddleParams, desc: string): TwiddleState {
  const wh = p.w * p.h;
  const { numbers, orient } = parseDesc(desc, wh, p.orientable);
  return {
    w: p.w,
    h: p.h,
    n: p.n,
    orientable: p.orientable,
    numbers,
    orient,
    completed: 0,
    usedSolve: false,
    moveCount: 0,
    movetarget: p.movetarget,
    lastX: -1,
    lastY: -1,
    lastR: -1,
  };
}

export function status(state: TwiddleState): "solved" | "ongoing" {
  return state.completed > 0 ? "solved" : "ongoing";
}

// --- text format ------------------------------------------------------

const TEXT_ARROWS = "^<v>"; // orientation arrows: up, left, down, right

export function textFormat(state: TwiddleState): string {
  const { w, h, numbers, orient, orientable } = state;
  let col = 0;
  for (let i = 0; i < w * h; i++) {
    col = Math.max(col, String(numbers[i]).length);
  }
  const lines: string[] = [];
  for (let y = 0; y < h; y++) {
    const cells: string[] = [];
    for (let x = 0; x < w; x++) {
      const v = numbers[y * w + x];
      let cell = String(v).padStart(col);
      if (orientable) cell += TEXT_ARROWS[orient[y * w + x]];
      cells.push(cell);
    }
    lines.push(cells.join(" "));
  }
  return lines.join("\n");
}

// --- generator --------------------------------------------------------

/** Build the solved grid into `numbers`/`orient`. */
function fillSolved(
  numbers: Int32Array,
  orient: Uint8Array,
  w: number,
  rowsonly: boolean,
): void {
  for (let i = 0; i < numbers.length; i++) {
    numbers[i] = (rowsonly ? Math.floor(i / w) : i) + 1;
    orient[i] = 0;
  }
}

/**
 * Faithful port of upstream `new_game_desc`: shuffle the solved grid by
 * a long sequence of random rotations, each chosen under the `prevmoves`
 * guard that forbids immediately undoing or over-repeating a rotation in
 * an un-overlapped region (with the `w==h==n` special case where that is
 * unavoidable). Re-shuffle while the result is already solved.
 */
export function newDesc(p: TwiddleParams, rng: RandomState): { desc: string } {
  const { w, h, n } = p;
  const wh = w * h;
  const numbers = new Int32Array(wh);
  const orient = new Uint8Array(wh);
  fillSolved(numbers, orient, w, p.rowsonly);

  let totalMoves = p.movetarget;
  if (!totalMoves) {
    // Add a random move to avoid parity issues.
    totalMoves = w * h * n * n * 2 + randomUpto(rng, 2);
  }

  const rw = w - n + 1; // width of rotation-centre space
  const rh = h - n + 1;

  do {
    const prevmoves = new Int32Array(rw * rh);

    for (let i = 0; i < totalMoves; i++) {
      let x: number;
      let y: number;
      let r: number;
      let oldtotal: number;
      let newtotal: number;
      do {
        x = randomUpto(rng, rw);
        y = randomUpto(rng, rh);
        r = 2 * randomUpto(rng, 2) - 1; // ±1
        oldtotal = prevmoves[y * rw + x];
        newtotal = oldtotal + r;
        // Special case for w==h==n: every move repeats/undoes a previous
        // one, so the guard can never be satisfied — skip it there.
      } while (
        (w !== n || h !== n) &&
        (Math.abs(newtotal) < Math.abs(oldtotal) || Math.abs(newtotal) > 2)
      );

      doRotate(numbers, orient, w, h, n, p.orientable, x, y, r);

      // Log the rotation for inversion detection, and zero every region
      // that overlaps this one (now safe to move in again).
      prevmoves[y * rw + x] += r;
      for (let dy = -n + 1; dy <= n - 1; dy++) {
        if (y + dy < 0 || y + dy >= rh) continue;
        for (let dx = -n + 1; dx <= n - 1; dx++) {
          if (x + dx < 0 || x + dx >= rw) continue;
          if (dx === 0 && dy === 0) continue;
          prevmoves[(y + dy) * rw + (x + dx)] = 0;
        }
      }
    }
  } while (isComplete(numbers, orient, wh, p.orientable));

  return { desc: encodeDesc(numbers, orient, wh, p.orientable) };
}

/** Build the solved arrangement's numbers/orient for a given state
 * (used by Solve). */
export function solvedGrid(state: TwiddleState): {
  numbers: Int32Array;
  orient: Uint8Array;
} {
  // Solve = sort the current numbers ascending, clear orientations.
  const numbers = Int32Array.from(state.numbers);
  numbers.sort();
  const orient = new Uint8Array(state.numbers.length);
  return { numbers, orient };
}
