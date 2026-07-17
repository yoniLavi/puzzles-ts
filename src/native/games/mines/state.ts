/**
 * Types, codec and pure state helpers for Mines (`puzzles/mines.c`).
 *
 * The one deliberate impurity of this port lives here: {@link MineLayout} is a
 * mutable box shared *by reference* across every cloned {@link MinesState}
 * (upstream's refcounted `struct mine_layout`, mines.c:62). The mine bitmap
 * does not exist until the first click generates it (so the first click is
 * never a mine), and once generated it survives undo — clicking a *different*
 * square after undoing to the start uses the *old* layout. That is not a wart:
 * it is what stops the player rerolling the board (design D1). The engine
 * cannot see this history in `(state, move)`, so we mirror the C with an
 * explicit shared box and let `index.ts` document the single mutation site.
 */

import { obfuscateBitmap } from "../../engine/obfuscate.ts";
import {
  type RandomState,
  randomStateDecode,
  randomStateEncode,
} from "../../random/index.ts";

// --- grid value encoding (upstream `signed char *grid`) ----------------
// 0..8 : open, that many neighbouring mines
export const FLAG = -1; // marked as a mine
export const COVERED = -2; // unknown / covered
export const QUERY = -3; // question mark (unused by this frontend, kept for text format)
export const MINE = 64; // a mine revealed on loss
export const KILLED = 65; // the mine the player trod on
export const WRONGFLAG = 66; // a crossed-out incorrectly-flagged square
/** Internal `todo` marker used only inside the flood-open loop. */
export const TODO = -10;

// --- params ------------------------------------------------------------

export interface MinesParams {
  w: number;
  h: number;
  n: number;
  unique: boolean;
  /** Forced first-click location for non-interactive generation; -1 = unset
   * (the `X`/`Y` desc/param letters). The running game never sets these, but
   * they are load-bearing for the byte-match differential (design D6). */
  firstClickX: number;
  firstClickY: number;
}

// --- the shared mine-layout box (design D1) ----------------------------

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
  won: boolean;
  usedSolve: boolean;
  /** Shared by reference across every clone (design D1). */
  layout: MineLayout;
  /** Where the first click landed, recorded on the *state* on the first open
   * whether or not the layout was generated there (design D2) — a save
   * restored from the private desc has the layout but not the click, and the
   * replayed click must put it back. Drives `index.ts`'s `supersededDesc`. */
  clickedAt: { x: number; y: number } | null;
  /** Player knowledge (the grid value encoding above); cloned per move. */
  grid: Int8Array;
}

export interface MinesUi {
  /** Mouse-down highlight centre / radius (a render-only overlay, design D8). */
  hx: number;
  hy: number;
  hradius: number;
  /** Radius that a release will actually act on (0 = single square). */
  validradius: number;
  /** Whether the pending flash is a death (vs a win) — set by `flashLength`. */
  flashIsDeath: boolean;
  /** Persistent death counter, survives undo and a save (design D7). */
  deaths: number;
  /** Set once the game was ever won; stops the clock permanently (design D3). */
  completed: boolean;
  curX: number;
  curY: number;
  curVisible: boolean;
}

/** One elementary grid operation in a move. `F` toggles a flag, `O` opens
 * (with flood), `C` chords a satisfied number. A player move is a `;`-separated
 * list of these (upstream's move string), here a discriminated union. */
export type MineOp = { op: "F" | "O" | "C"; x: number; y: number };
export type MinesMove = { type: "solve" } | { type: "ops"; ops: MineOp[] };

// --- params codec ------------------------------------------------------

export function defaultParams(): MinesParams {
  return { w: 9, h: 9, n: 10, unique: true, firstClickX: -1, firstClickY: -1 };
}

/** Faithful port of `decode_params` (mines.c:168): `WxH`, optional `nN` mine
 * count (defaulting to area/10), then `a`/`X`/`Y` flags. */
export function decodeParams(s: string): MinesParams {
  const p = defaultParams();
  let i = 0;
  const readInt = (): number => {
    let v = 0;
    let seen = false;
    while (i < s.length && s[i] >= "0" && s[i] <= "9") {
      v = v * 10 + (s.charCodeAt(i) - 48);
      i++;
      seen = true;
    }
    return seen ? v : 0;
  };
  p.w = readInt();
  if (s[i] === "x") {
    i++;
    p.h = readInt();
  } else {
    p.h = p.w;
  }
  if (s[i] === "n") {
    i++;
    p.n = readInt();
    // upstream also skips '.' inside the mine count (a percentage form)
    while (i < s.length && (s[i] === "." || (s[i] >= "0" && s[i] <= "9"))) i++;
  } else if (p.h > 0 && p.w > 0) {
    p.n = Math.floor((p.w * p.h) / 10);
  }
  while (i < s.length) {
    if (s[i] === "a") {
      i++;
      p.unique = false;
    } else if (s[i] === "X") {
      i++;
      p.firstClickX = readInt();
    } else if (s[i] === "Y") {
      i++;
      p.firstClickY = readInt();
    } else {
      i++; // skip any other gunk
    }
  }
  return p;
}

/** Faithful port of `encode_params` (mines.c:208). The mine count and the
 * `a`/`X`/`Y` flags are generation-time (`full`) parameters only. */
export function encodeParams(p: MinesParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += `n${p.n}`;
  if (full && !p.unique) s += "a";
  if (full && p.firstClickX >= 0) s += `X${p.firstClickX}`;
  if (full && p.firstClickY >= 0) s += `Y${p.firstClickY}`;
  return s;
}

/** Faithful port of `validate_params` (mines.c:279). */
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
export function decodeLayoutBitmap(
  hex: string,
  wh: number,
  masked: boolean,
): Int8Array {
  const bmp = new Uint8Array((wh + 7) >> 3);
  const nnib = (wh + 3) >> 2;
  for (let i = 0; i < nnib; i++) {
    const c = hex.charCodeAt(i);
    let v: number;
    if (c >= 48 && c <= 57) v = c - 48;
    else if (c >= 97 && c <= 102) v = c - 97 + 10;
    else if (c >= 65 && c <= 70) v = c - 65 + 10;
    else v = 0;
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
  const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
  if (desc[0] === "r") {
    i = 1;
    if (!isDigit(desc[i])) return "No initial mine count in game description";
    let n = 0;
    while (isDigit(desc[i])) {
      n = n * 10 + (desc.charCodeAt(i) - 48);
      i++;
    }
    if (n > wh - 9) return "Too many mines for grid size";
    if (desc[i] !== ",") return "No ',' after initial x-coordinate in game description";
    i++;
    if (desc[i] !== "u" && desc[i] !== "a")
      return "No uniqueness specifier in game description";
    i++;
    if (desc[i] !== ",") return "No ',' after uniqueness specifier in game description";
    // rest (the encoded RNG state) is ignored
    return null;
  }
  // Public/private desc: optional `x,y,` prefix, optional `m`/`u`, then hex.
  if (isDigit(desc[i])) {
    let x = 0;
    while (isDigit(desc[i])) {
      x = x * 10 + (desc.charCodeAt(i) - 48);
      i++;
    }
    if (x < 0 || x >= p.w) return "Initial x-coordinate was out of range";
    if (desc[i] !== ",") return "No ',' after initial x-coordinate in game description";
    i++;
    if (!isDigit(desc[i])) return "No initial y-coordinate in game description";
    let y = 0;
    while (isDigit(desc[i])) {
      y = y * 10 + (desc.charCodeAt(i) - 48);
      i++;
    }
    if (y < 0 || y >= p.h) return "Initial y-coordinate was out of range";
    if (desc[i] !== ",") return "No ',' after initial y-coordinate in game description";
    i++;
  }
  if (desc[i] === "m" || desc[i] === "u") i++;
  if (desc.length - i !== (wh + 3) >> 2) return "Game description is wrong length";
  return null;
}

// --- initial state construction (mines.c new_game:2264) ----------------

/** The parsed shape of a desc: the shared layout box, plus the first click
 * to open (a public desc bakes one in). `index.ts`'s `newState` builds the
 * covered grid, then opens `openXY` if present. */
export interface DecodedDesc {
  layout: MineLayout;
  openXY: { x: number; y: number } | null;
}

export function decodeDesc(p: MinesParams, desc: string): DecodedDesc {
  const wh = p.w * p.h;
  const layout: MineLayout = {
    mines: null,
    n: p.n,
    unique: p.unique,
    rs: null,
    startx: -1,
    starty: -1,
  };

  if (desc[0] === "r") {
    let i = 1;
    let n = 0;
    while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") {
      n = n * 10 + (desc.charCodeAt(i) - 48);
      i++;
    }
    layout.n = n;
    if (desc[i]) i++; // eat comma
    layout.unique = desc[i] !== "a";
    i++;
    if (desc[i]) i++; // eat comma
    layout.rs = randomStateDecode(desc.slice(i));
    return { layout, openXY: null };
  }

  // Public/private desc: optional x,y prefix, optional m/u, then hex.
  let i = 0;
  let openXY: { x: number; y: number } | null = null;
  if (desc[i] >= "0" && desc[i] <= "9") {
    let x = 0;
    while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") {
      x = x * 10 + (desc.charCodeAt(i) - 48);
      i++;
    }
    if (desc[i]) i++;
    let y = 0;
    while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") {
      y = y * 10 + (desc.charCodeAt(i) - 48);
      i++;
    }
    if (desc[i]) i++;
    openXY = { x, y };
  }
  let masked = false;
  if (desc[i] === "m") {
    masked = true;
    i++;
  } else if (desc[i] === "u") {
    i++;
  }
  layout.mines = decodeLayoutBitmap(desc.slice(i), wh, masked);
  return { layout, openXY };
}

export function cloneState(s: MinesState): MinesState {
  return {
    w: s.w,
    h: s.h,
    n: s.n,
    dead: s.dead,
    won: s.won,
    usedSolve: s.usedSolve,
    layout: s.layout, // shared by reference — design D1
    clickedAt: s.clickedAt,
    grid: new Int8Array(s.grid),
  };
}

// --- ui serialisation (mines.c encode_ui/decode_ui:2492) ---------------

/** `D<deaths>` optionally followed by `C` (completed) — the only two ui
 * fields upstream preserves across a save (design D7). */
export function encodeUi(ui: MinesUi): string {
  return `D${ui.deaths}${ui.completed ? "C" : ""}`;
}

export function decodeUi(ui: MinesUi, encoded: string): void {
  const m = /^D(\d+)(C?)/.exec(encoded);
  if (!m) return;
  ui.deaths = Number(m[1]);
  if (m[2] === "C") ui.completed = true;
}

// re-export so index.ts and the differential can build the preliminary desc
export { randomStateEncode };
