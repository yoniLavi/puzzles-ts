/**
 * Types, the cell alphabet, the desc codec and the pure move helpers for
 * Sokoban (barrel-pushing warehouse puzzle).
 *
 * Faithful transliteration of `puzzles/unfinished/sokoban.c`. The grid is a
 * flat `Uint8Array` of *character codes* — the same alphabet the C uses in
 * game IDs — so a hand-authored level game ID decodes identically here. The
 * full alphabet (pits, deep pits, capital-letter labeled barrels) is ported
 * even though the random generator never emits those characters (design D7):
 * it keeps hand-typed level descriptions working, which the header names as
 * Sokoban's reason to exist.
 */

import { parseDimensions } from "../../engine/params.ts";
import type { GameStatus } from "../../engine/types.ts";

// --- the cell alphabet (char codes) -----------------------------------
// Mirrors sokoban.c's #defines. Values are the ASCII codes of the letters
// the C uses, so decode/encode round-trip byte-for-byte with a C game ID.

const c = (ch: string): number => ch.charCodeAt(0);

export const INITIAL = c("i"); // used only during generation
export const SPACE = c("s");
export const WALL = c("w");
export const PIT = c("p");
export const DEEP_PIT = c("d");
export const TARGET = c("t");
export const BARREL = c("b");
export const BARRELTARGET = c("f"); // barrel on a target ('f'illed)
export const PLAYER = c("u"); // yo'u'; used in game IDs
export const PLAYERTARGET = c("v"); // player on a target

const A = c("A");
const Z = c("Z");

/**
 * A capital letter A–Z is a *labeled* barrel; while resting on a target it
 * is stored as its control-character value (A → ^A = 1, … Z → 26). These let
 * annotated level IDs name particular barrels. `isBarrel`/`isOnTarget`
 * therefore test more than a bare equality (upstream macros of the same name).
 */
export function isPlayer(v: number): boolean {
  return v === PLAYER || v === PLAYERTARGET;
}
export function isBarrel(v: number): boolean {
  return (
    v === BARREL || v === BARRELTARGET || (v >= A && v <= Z) || (v >= 1 && v <= 26)
  );
}
export function isOnTarget(v: number): boolean {
  return (
    v === TARGET || v === BARRELTARGET || v === PLAYERTARGET || (v >= 1 && v <= 26)
  );
}
/** Put a barrel onto a target: BARREL → BARRELTARGET, a capital → its ^ form. */
export function targetize(b: number): number {
  return b === BARREL ? BARRELTARGET : b - (A - 1);
}
/** Take a barrel off a target: BARRELTARGET → BARREL, a ^ form → its capital. */
export function detargetize(b: number): number {
  return b === BARRELTARGET ? BARREL : b + (A - 1);
}
/** The display letter for a labeled barrel, or 0 for a plain/anonymous one. */
export function barrelLabel(b: number): number {
  if (b >= A && b <= Z) return b;
  if (b >= 1 && b <= 26) return b + (A - 1);
  return 0;
}

// --- params -----------------------------------------------------------

export interface SokobanParams {
  w: number;
  h: number;
}

export function defaultParams(): SokobanParams {
  return { w: 12, h: 10 };
}

export function encodeParams(p: SokobanParams, _full: boolean): string {
  return `${p.w}x${p.h}`;
}

export function decodeParams(s: string): SokobanParams {
  // Upstream `decode_params`: `W` or `WxH`, square fallback on a bare number.
  const { w, h } = parseDimensions(s);
  return { w, h };
}

export function validateParams(p: SokobanParams, _full: boolean): string | null {
  if (p.w < 4 || p.h < 4) return "Width and height must both be at least 4";
  return null;
}

export function presets(): {
  title: string;
  submenu: { title: string; params: SokobanParams }[];
} {
  const p = (w: number, h: number) => ({ title: `${w}x${h}`, params: { w, h } });
  return { title: "Type", submenu: [p(12, 10), p(16, 12), p(20, 16)] };
}

// --- state ------------------------------------------------------------

export interface SokobanState {
  readonly w: number;
  readonly h: number;
  /** Row-major grid of cell char codes. The player's cell holds the SPACE
   * or TARGET *beneath* the player (upstream keeps `px`/`py` separately and
   * leaves the underlying square in the grid). */
  readonly grid: Uint8Array;
  readonly px: number;
  readonly py: number;
  readonly completed: boolean;
}

export function cloneSokobanState(s: SokobanState): SokobanState {
  return {
    w: s.w,
    h: s.h,
    grid: s.grid.slice(),
    px: s.px,
    py: s.py,
    completed: s.completed,
  };
}

/** Sokoban has no persistent UI state (upstream `new_ui` returns NULL). */
export type SokobanUi = Record<string, never>;

/**
 * A single step: move the player by (dx, dy). Whether it is a walk or a push
 * is *derived* from the board by {@link moveType}, exactly as the C decides in
 * both `interpret_move` and `execute_move` — so the move never has to carry
 * it. Plain JSON-safe data → the default move codec suffices (design D2).
 */
export type SokobanMove = { type: "move"; dx: number; dy: number };

// --- desc codec -------------------------------------------------------

const isDigit = (ch: string | undefined): boolean =>
  ch !== undefined && ch >= "0" && ch <= "9";

/**
 * Decode a run-length grid description into a flat char-code array (upstream
 * `new_game`). A PLAYER/PLAYERTARGET cell is stored as the SPACE/TARGET
 * beneath it and its coordinates returned separately.
 */
function decodeGrid(
  desc: string,
  w: number,
): { cells: number[]; px: number; py: number } {
  const cells: number[] = [];
  let px = -1;
  let py = -1;
  let i = 0;
  while (i < desc.length) {
    let ch = desc.charCodeAt(i++);
    let n = 1;
    if (isDigit(desc[i])) {
      n = Number.parseInt(desc.slice(i), 10);
      while (isDigit(desc[i])) i++;
    }
    if (ch === PLAYER || ch === PLAYERTARGET) {
      py = Math.floor(cells.length / w);
      px = cells.length % w;
      ch = isOnTarget(ch) ? TARGET : SPACE;
    }
    for (let k = 0; k < n; k++) cells.push(ch);
  }
  return { cells, px, py };
}

export function validateDesc(p: SokobanParams, desc: string): string | null {
  const w = p.w;
  const h = p.h;
  let area = 0;
  let nplayers = 0;
  let i = 0;
  while (i < desc.length) {
    const ch = desc.charCodeAt(i++);
    let n = 1;
    if (isDigit(desc[i])) {
      n = Number.parseInt(desc.slice(i), 10);
      while (isDigit(desc[i])) i++;
    }
    area += n;
    if (ch === PLAYER || ch === PLAYERTARGET) {
      nplayers += n;
    } else if (
      ch === INITIAL ||
      ch === SPACE ||
      ch === WALL ||
      ch === TARGET ||
      ch === PIT ||
      ch === DEEP_PIT ||
      isBarrel(ch)
    ) {
      /* ok */
    } else {
      return "Invalid character in game description";
    }
  }
  if (area > w * h) return "Too much data in game description";
  if (area < w * h) return "Too little data in game description";
  if (nplayers < 1) return "No starting player position specified";
  if (nplayers > 1) return "More than one starting player position specified";
  return null;
}

export function newState(p: SokobanParams, desc: string): SokobanState {
  const { cells, px, py } = decodeGrid(desc, p.w);
  if (cells.length !== p.w * p.h) throw new Error("sokoban: desc area mismatch");
  if (px === -1) throw new Error("sokoban: no player in desc");
  return { w: p.w, h: p.h, grid: Uint8Array.from(cells), px, py, completed: false };
}

// --- move classification ----------------------------------------------

export type MoveKind = "illegal" | "walk" | "push";

/**
 * Classify moving the player by (dx, dy) on this board (upstream `move_type`).
 * A push must be orthogonal, have a barrel ahead and a square that can accept
 * a barrel beyond it; a diagonal *walk* needs one of the two shared-adjacent
 * squares free to notionally pass through (the NetHack rule) and can never
 * push.
 */
export function moveType(state: SokobanState, dx: number, dy: number): MoveKind {
  const { w, h, grid, px, py } = state;
  const nx = px + dx;
  const ny = py + dy;

  if (nx < 0 || nx >= w || ny < 0 || ny >= h) return "illegal";

  const ahead = grid[ny * w + nx];
  if (ahead === WALL || ahead === PIT || ahead === DEEP_PIT) return "illegal";

  if (isBarrel(ahead)) {
    // A push: never diagonal, and the square beyond must accept a barrel.
    if (dx && dy) return "illegal";
    const nbx = nx + dx;
    const nby = ny + dy;
    if (nbx < 0 || nbx >= w || nby < 0 || nby >= h) return "illegal";
    const beyond = grid[nby * w + nbx];
    if (beyond === SPACE || beyond === TARGET || beyond === PIT || beyond === DEEP_PIT)
      return "push";
    return "illegal";
  }

  // An ordinary walk (the ahead square was already checked). A diagonal walk
  // needs one orthogonally-shared square to be free to move through.
  if (dx && dy) {
    const vert = grid[(py + dy) * w + px];
    const horiz = grid[py * w + (px + dx)];
    if (vert !== SPACE && vert !== TARGET && horiz !== SPACE && horiz !== TARGET)
      return "illegal";
  }
  return "walk";
}

// --- status -----------------------------------------------------------

export function status(s: SokobanState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}
