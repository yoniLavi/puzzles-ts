/**
 * Types, the cell alphabet, the desc codec and the pure move helpers for
 * Sokoban (barrel-pushing warehouse puzzle), after upstream
 * `puzzles/unfinished/sokoban.c`.
 *
 * The grid is a flat `Uint8Array` of the *character codes* game IDs use, so a
 * hand-authored level ID decodes as it does upstream. The full alphabet (pits,
 * deep pits, capital-letter labeled barrels) is ported although the generator
 * never emits it: hand-typed levels are what upstream's header names as
 * Sokoban's reason to exist.
 */

import { parseLeadingInt } from "../../engine/decimal.ts";
import type { ParamConfigItem, PresetMenu } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import { dims, paramsCodec } from "../../engine/params-codec.ts";
import type { GameStatus } from "../../engine/types.ts";

// --- the cell alphabet (char codes) -----------------------------------
// Upstream's #defines: each value is the character a game ID uses for it.

const c = (ch: string): number => ch.charCodeAt(0);

export const INITIAL = c("i"); // an untouched square during generation
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

export function isPlayer(v: number): boolean {
  return v === PLAYER || v === PLAYERTARGET;
}
/**
 * A capital letter A–Z is a *labeled* barrel, letting an annotated level name
 * particular barrels; on a target it is stored as its control-character value
 * (A → ^A = 1, … Z → 26). Hence `isBarrel`/`isOnTarget` test ranges, not just
 * equality (upstream macros of the same name).
 */
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

/** The "Custom type…" form, and the field list the codec below encodes. */
export const paramConfig: ParamConfigItem<SokobanParams>[] =
  dimensionParamConfig<SokobanParams>();

/** Upstream `decode_params`: `W` or `WxH`, square fallback on a bare number. */
export const { encodeParams, decodeParams } = paramsCodec(defaultParams, [
  dims(paramConfig),
]);

export function validateParams(p: SokobanParams, _full: boolean): string | null {
  if (p.w < 4 || p.h < 4) return "Width and height must both be at least 4";
  return null;
}

export function presets(): PresetMenu<SokobanParams> {
  const p = (w: number, h: number) => ({ title: `${w}x${h}`, params: { w, h } });
  return { title: "Type", submenu: [p(12, 10), p(16, 12), p(20, 16)] };
}

// --- state ------------------------------------------------------------

export interface SokobanState {
  readonly w: number;
  readonly h: number;
  /** Row-major grid of cell char codes. As upstream, the player's cell holds
   * the SPACE or TARGET *beneath* the player, whose position is `px`/`py`. */
  readonly grid: Uint8Array;
  readonly px: number;
  readonly py: number;
  readonly completed: boolean;
}

/** Sokoban has no persistent UI state (upstream `new_ui` returns NULL). */
export type SokobanUi = Record<string, never>;

/**
 * A single step: move the player by (dx, dy). Whether it is a walk or a push
 * is *derived* from the board by {@link moveType}, as the C decides in both
 * `interpret_move` and `execute_move`, so the move never carries it. Plain
 * JSON data, so the default move codec serves.
 */
export type SokobanMove = { type: "move"; dx: number; dy: number };

// --- desc codec -------------------------------------------------------

/** The runs of a desc: each character, then an optional decimal repeat count. */
function* runs(desc: string): Generator<{ ch: number; n: number }> {
  for (let i = 0; i < desc.length; ) {
    const ch = desc.charCodeAt(i++);
    const { value, next } = parseLeadingInt(desc, i);
    const n = next > i ? value : 1;
    i = next;
    yield { ch, n };
  }
}

/** The characters a desc may use besides the player and the barrels. */
const TERRAIN = new Set([INITIAL, SPACE, WALL, TARGET, PIT, DEEP_PIT]);

export function validateDesc(p: SokobanParams, desc: string): string | null {
  let area = 0;
  let nplayers = 0;
  for (const { ch, n } of runs(desc)) {
    area += n;
    if (isPlayer(ch)) nplayers += n;
    else if (!TERRAIN.has(ch) && !isBarrel(ch))
      return "Invalid character in game description";
  }
  if (area > p.w * p.h) return "Too much data in game description";
  if (area < p.w * p.h) return "Too little data in game description";
  if (nplayers < 1) return "No starting player position specified";
  if (nplayers > 1) return "More than one starting player position specified";
  return null;
}

/** Build a board from a desc (upstream `new_game`), storing the player's cell
 * as the SPACE or TARGET beneath it. */
export function newState(p: SokobanParams, desc: string): SokobanState {
  const cells: number[] = [];
  let px = -1;
  let py = -1;
  for (const { ch, n } of runs(desc)) {
    let cell = ch;
    if (isPlayer(ch)) {
      px = cells.length % p.w;
      py = Math.floor(cells.length / p.w);
      cell = ch === PLAYERTARGET ? TARGET : SPACE;
    }
    for (let k = 0; k < n; k++) cells.push(cell);
  }
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

  // An ordinary walk. A diagonal one needs one orthogonally-shared square to
  // be free to move through.
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
