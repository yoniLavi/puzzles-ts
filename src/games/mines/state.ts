/**
 * Types, codec and pure state helpers for Mines (`puzzles/mines.c`).
 *
 * The one deliberate impurity of this port lives here: {@link MineLayout} is a
 * mutable box shared *by reference* across every cloned {@link MinesState}
 * (upstream's refcounted `struct mine_layout`, mines.c:62). The mine bitmap
 * does not exist until the first click generates it (so the first click is
 * never a mine), and once generated it survives undo — clicking a *different*
 * square after undoing to the start uses the *old* layout. That is not a wart:
 * it is what stops the player rerolling the board. `(state, move)` cannot carry
 * that history, so the box is explicit and `index.ts`'s `openSquare` is its
 * single mutation site.
 */

import { isDigit, parseLeadingInt } from "../../engine/decimal.ts";
import { obfuscateBitmap } from "../../engine/obfuscate.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { type RandomState, randomStateDecode } from "../../engine/random/index.ts";
import type { Point } from "../../engine/types.ts";

// --- grid value encoding (upstream `signed char *grid`) ----------------
// 0..8 : open, that many neighboring mines
export const FLAG = -1; // marked as a mine
export const COVERED = -2; // unknown / covered
export const QUERY = -3; // question mark (this frontend never sets one)
export const MINE = 64; // a mine revealed on loss
export const KILLED = 65; // the mine the player trod on
export const WRONGFLAG = 66; // a crossed-out incorrectly-flagged square
/** A square queued to open, seen only inside `openSquare`'s flood. */
export const TODO = -10;

/** The in-bounds squares of the 3×3 block centered on (x, y), itself included,
 * row by row. */
export function around(w: number, h: number, x: number, y: number): Point[] {
  const out: Point[] = [];
  for (let ny = Math.max(y - 1, 0); ny <= Math.min(y + 1, h - 1); ny++) {
    for (let nx = Math.max(x - 1, 0); nx <= Math.min(x + 1, w - 1); nx++) {
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

// --- params ------------------------------------------------------------

export interface MinesParams {
  w: number;
  h: number;
  n: number;
  unique: boolean;
  /** A forced first click for batch generation (the `X`/`Y` param letters,
   * read by `newGameDescBatch`); -1 = unset. The running game never sets them. */
  firstClickX: number;
  firstClickY: number;
}

// --- the shared mine-layout box ----------------------------------------

export interface MineLayout {
  /** The real mine positions (1 = mine), or `null` while the layout has not
   * yet been generated (a preliminary `r…` game before the first click). */
  mines: Int8Array | null;
  /** Mine count, used before the bitmap exists (for the status bar's total). */
  n: number;
  unique: boolean;
  /** The generator RNG, decoded from the preliminary desc; consumed (and
   * nulled) when the layout is generated on the first click. */
  rs: RandomState | null;
  /** Where the first click landed (for the "start here" cross after an undo);
   * -1 until the layout is generated. */
  startx: number;
  starty: number;
}

// --- state / ui / move -------------------------------------------------

export interface MinesState {
  w: number;
  h: number;
  n: number;
  dead: boolean;
  completed: boolean;
  cheated: boolean;
  /** Shared by reference across every clone. */
  layout: MineLayout;
  /** Where the first click landed, as this state knows it (see `openSquare`
   * for why that is not `layout.startx`). Drives `supersededDesc`. */
  clickedAt: Point | null;
  /** Player knowledge (the grid value encoding above); cloned per move. */
  grid: Int8Array;
}

export interface MinesUi {
  /** Mouse-down highlight center / radius (a render-only overlay). */
  hx: number;
  hy: number;
  hradius: number;
  /** Radius that a release will actually act on (0 = single square). */
  validradius: number;
  /** Whether the pending flash is a death (vs a win) — set by `flashLength`. */
  flashIsDeath: boolean;
  /** Death counter; survives undo and a save. */
  deaths: number;
  /** Set once the game was ever won; stops the clock permanently. Unlike
   * `MinesState.completed` it survives an undo, and `encodeUi` saves it as `C`. */
  everCompleted: boolean;
  cursor: GridCursor;
}

/** One grid operation: `F` toggles a flag, `O` opens (with flood), `C` chords a
 * satisfied number. A player move is a list of these. */
export type MineOp = { op: "F" | "O" | "C"; x: number; y: number };
export type MinesMove = { type: "solve" } | { type: "ops"; ops: MineOp[] };

// --- params codec ------------------------------------------------------

export function defaultParams(): MinesParams {
  return { w: 9, h: 9, n: 10, unique: true, firstClickX: -1, firstClickY: -1 };
}

/** Upstream's `decode_params` (mines.c:168): `WxH`, optional `nN` mine count
 * (defaulting to area/10), then `a`/`X`/`Y` flags. */
export function decodeParams(s: string): MinesParams {
  const p = defaultParams();
  const w = parseLeadingInt(s, 0);
  p.w = w.value;
  let i = w.next;
  if (s[i] === "x") {
    const h = parseLeadingInt(s, i + 1);
    p.h = h.value;
    i = h.next;
  } else p.h = p.w;
  if (s[i] === "n") {
    const n = parseLeadingInt(s, i + 1);
    p.n = n.value;
    i = n.next;
    // upstream also skips '.' inside the mine count (a percentage form)
    while (i < s.length && (s[i] === "." || isDigit(s[i]))) i++;
  } else if (p.h > 0 && p.w > 0) {
    p.n = Math.floor((p.w * p.h) / 10);
  }
  while (i < s.length) {
    const c = s[i++];
    if (c === "a") p.unique = false;
    else if (c === "X") {
      const x = parseLeadingInt(s, i);
      p.firstClickX = x.value;
      i = x.next;
    } else if (c === "Y") {
      const y = parseLeadingInt(s, i);
      p.firstClickY = y.value;
      i = y.next;
    }
    // anything else is gunk, skipped
  }
  return p;
}

/** Upstream's `encode_params` (mines.c:208). The mine count and the `a`/`X`/`Y`
 * flags are generation-time (`full`) parameters only. */
export function encodeParams(p: MinesParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += `n${p.n}`;
  if (full && !p.unique) s += "a";
  if (full && p.firstClickX >= 0) s += `X${p.firstClickX}`;
  if (full && p.firstClickY >= 0) s += `Y${p.firstClickY}`;
  return s;
}

/** Upstream's `validate_params` (mines.c:279). */
export function validateParams(p: MinesParams, full: boolean): string | null {
  if (full && p.unique && (p.w <= 2 || p.h <= 2))
    return "Width and height must both be greater than two";
  if (p.w < 1 || p.h < 1) return "Width and height must both be at least one";
  if (p.w > 32767 || p.h > 32767)
    return "Neither width nor height may be unreasonably large";
  if (p.w > Math.floor((2 ** 28 - 1) / p.h))
    return "Width times height must not be unreasonably large";
  if (p.n < 0) return "Mine count may not be negative";
  if (p.n < 1) return "Number of mines must be greater than zero";
  if (p.n > p.w * p.h - 9) return "Too many mines for grid size";
  if (p.firstClickX >= p.w) return "First-click x coordinate must be inside the grid";
  if (p.firstClickY >= p.h) return "First-click y coordinate must be inside the grid";
  return null;
}

// --- mine-bitmap ⇄ hex codec (mines.c describe_layout / new_game) -------

/** Encode a mine bitmap as the obfuscated nibble string that follows the `m`
 * in a public/private desc (upstream `describe_layout`, mines.c:1981, with
 * `obfuscate = true`). Emits exactly `(wh+3)/4` nibbles. */
export function encodeLayoutHex(mines: Int8Array, wh: number): string {
  const bmp = new Uint8Array((wh + 7) >> 3);
  for (let i = 0; i < wh; i++) if (mines[i]) bmp[i >> 3] |= 0x80 >> (i & 7);
  obfuscateBitmap(bmp, wh, false);
  const nnib = (wh + 3) >> 2;
  let out = "";
  for (let i = 0; i < nnib; i++) {
    let v = bmp[i >> 1];
    if ((i & 1) === 0) v >>= 4;
    out += "0123456789abcdef"[v & 0xf];
  }
  return out;
}

/** Decode the `(wh+3)/4`-nibble hex tail of a public/private desc back into a
 * mine bitmap (upstream `new_game`, mines.c:2336). `masked` de-obfuscates. */
function decodeLayoutBitmap(hex: string, wh: number, masked: boolean): Int8Array {
  const bmp = new Uint8Array((wh + 7) >> 3);
  const nnib = (wh + 3) >> 2;
  for (let i = 0; i < nnib; i++) {
    // Either case is accepted, and anything that is not hex reads as 0.
    const v = Number.parseInt(hex[i], 16) || 0;
    bmp[i >> 1] |= v << (4 * (1 - (i & 1)));
  }
  if (masked) obfuscateBitmap(bmp, wh, true);
  const mines = new Int8Array(wh);
  for (let i = 0; i < wh; i++) if (bmp[i >> 3] & (0x80 >> (i & 7))) mines[i] = 1;
  return mines;
}

// --- desc validation (mines.c validate_desc:2081) ----------------------

export function validateDesc(p: MinesParams, desc: string): string | null {
  const wh = p.w * p.h;
  let i = 0;
  if (desc[0] === "r") {
    if (desc.length < 2 || !isDigit(desc[1]))
      return "No initial mine count in game description";
    const n = parseLeadingInt(desc, 1);
    i = n.next;
    if (n.value > wh - 9) return "Too many mines for grid size";
    if (desc[i] !== ",") return "No ',' after initial x-coordinate in game description";
    if (desc[i + 1] !== "u" && desc[i + 1] !== "a")
      return "No uniqueness specifier in game description";
    if (desc[i + 2] !== ",")
      return "No ',' after uniqueness specifier in game description";
    // rest (the encoded RNG state) is ignored
    return null;
  }
  // Public/private desc: optional `x,y,` prefix, optional `m`/`u`, then hex.
  if (desc.length > 0 && isDigit(desc[0])) {
    const x = parseLeadingInt(desc, 0);
    i = x.next;
    if (x.value >= p.w) return "Initial x-coordinate was out of range";
    if (desc[i] !== ",") return "No ',' after initial x-coordinate in game description";
    if (i + 1 >= desc.length || !isDigit(desc[i + 1]))
      return "No initial y-coordinate in game description";
    const y = parseLeadingInt(desc, i + 1);
    i = y.next;
    if (y.value >= p.h) return "Initial y-coordinate was out of range";
    if (desc[i] !== ",") return "No ',' after initial y-coordinate in game description";
    i++;
  }
  if (desc[i] === "m" || desc[i] === "u") i++;
  if (desc.length - i !== (wh + 3) >> 2) return "Game description is wrong length";
  return null;
}

// --- initial state construction (mines.c new_game:2264) ----------------

/** The parsed shape of a desc: the shared layout box, plus the first click
 * to open (a public desc bakes one in). */
export interface DecodedDesc {
  layout: MineLayout;
  openXY: Point | null;
}

export function decodeDesc(p: MinesParams, desc: string): DecodedDesc {
  const layout: MineLayout = {
    mines: null,
    n: p.n,
    unique: p.unique,
    rs: null,
    startx: -1,
    starty: -1,
  };

  let i: number;
  if (desc[0] === "r") {
    const n = parseLeadingInt(desc, 1);
    layout.n = n.value;
    i = n.next;
    if (desc[i]) i++; // eat comma
    layout.unique = desc[i] !== "a";
    i++;
    if (desc[i]) i++; // eat comma
    layout.rs = randomStateDecode(desc.slice(i));
    return { layout, openXY: null };
  }

  // Public/private desc: optional x,y prefix, optional m/u, then hex.
  i = 0;
  let openXY: Point | null = null;
  if (desc.length > 0 && isDigit(desc[0])) {
    const x = parseLeadingInt(desc, 0);
    i = x.next;
    if (desc[i]) i++;
    const y = parseLeadingInt(desc, i);
    i = y.next;
    if (desc[i]) i++;
    openXY = { x: x.value, y: y.value };
  }
  const masked = desc[i] === "m";
  if (masked || desc[i] === "u") i++;
  layout.mines = decodeLayoutBitmap(desc.slice(i), p.w * p.h, masked);
  return { layout, openXY };
}

/** The next move's state: its own `grid`, the same shared `layout`. */
export function cloneState(s: MinesState): MinesState {
  return { ...s, grid: new Int8Array(s.grid) };
}

// --- ui serialization (mines.c encode_ui/decode_ui:2492) ---------------

/** `D<deaths>` optionally followed by `C` (completed) — the only two ui
 * fields upstream preserves across a save. */
export function encodeUi(ui: MinesUi): string {
  return `D${ui.deaths}${ui.everCompleted ? "C" : ""}`;
}

export function decodeUi(ui: MinesUi, encoded: string): void {
  const m = /^D(\d+)(C?)/.exec(encoded);
  if (!m) return;
  ui.deaths = Number(m[1]);
  if (m[2] === "C") ui.everCompleted = true;
}
