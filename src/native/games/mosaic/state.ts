/**
 * Mosaic state, params, and desc codec — idiomatic TS port of the
 * state half of `mosaic.c` (a Fill-a-Pix-style puzzle: numeric clues
 * say how many cells of the clue's 3×3 neighbourhood, itself included,
 * are black).
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions } from "../../engine/params.ts";

// --- cell-state flags (upstream `enum cell_state`) ----------------------

// The low two bits are the player's mark; SOLVED/ERROR are derived
// overlays on clue cells. The toggle cycle `(v + steps) % 3` and the
// paint guard `(v & STATE_OK_NUM) === 0` rely on this exact encoding,
// so it is kept verbatim.
export const STATE_UNMARKED = 0;
export const STATE_MARKED = 1;
export const STATE_BLANK = 2;
export const STATE_SOLVED = 4;
export const STATE_ERROR = 8;
/** Mask of the two mark bits; also the modulus of the toggle cycle. */
export const STATE_OK_NUM = STATE_BLANK | STATE_MARKED;

export const MAX_TILES = 10000;
export const DEFAULT_SIZE = 10;
export const DEFAULT_AGGRESSIVENESS = true;

// --- types --------------------------------------------------------------

export interface MosaicParams {
  width: number;
  height: number;
  /** Hide every clue that can be hidden (slower generation, harder board). */
  aggressive: boolean;
}

/** The immutable clue board, shared by reference across every state of
 * one game (upstream's refcounted `board_state`; GC replaces the
 * refcount). `clues[i]` is `0..9` for a shown clue, `-1` for none. */
export interface MosaicBoard {
  readonly width: number;
  readonly height: number;
  readonly clues: Int8Array;
}

export interface MosaicState {
  readonly width: number;
  readonly height: number;
  readonly board: MosaicBoard;
  /** Per-cell mark + overlay flags (STATE_*). Cloned per move. */
  readonly cells: Uint8Array;
  readonly cheating: boolean;
  /** Shown clues not yet flagged SOLVED; 0 means the board is complete. */
  readonly notCompletedClues: number;
}

/** `paint` walks from (x,y) toward (srcX,srcY) exclusive, setting only
 * still-unmarked cells to `paintState` — upstream's `d`/`e` moves,
 * which `execute_move` treats identically. `solve` carries the
 * hex-packed marked-cell bitmap upstream's `solve_game` emits. */
export type MosaicMove =
  | { type: "toggle"; x: number; y: number; double: boolean }
  | {
      type: "paint";
      x: number;
      y: number;
      srcX: number;
      srcY: number;
      paintState: number;
    }
  | { type: "solve"; solution: string };

export interface MosaicUi {
  /** Drag anchor + the mark a click decided to paint (upstream
   * `last_x`/`last_y`/`last_state`). `-1` anchor = none. */
  lastX: number;
  lastY: number;
  lastState: number;
  curX: number;
  curY: number;
  cursorVisible: boolean;
}

/** A determined cell whose mark contradicts the deduced solution. */
export interface MosaicMistake {
  x: number;
  y: number;
}

// --- params -------------------------------------------------------------

export function defaultParams(): MosaicParams {
  return {
    width: DEFAULT_SIZE,
    height: DEFAULT_SIZE,
    aggressive: DEFAULT_AGGRESSIVENESS,
  };
}

export function presets(): PresetMenu<MosaicParams> {
  const sizes = [3, 5, 10, 15, 25, 50];
  return {
    title: "Size",
    submenu: sizes.map((n) => ({
      title: `Size: ${n}x${n}`,
      // 50×50 aggressive generation is too slow; upstream turns it off.
      params: { width: n, height: n, aggressive: n < 50 },
    })),
  };
}

export function encodeParams(p: MosaicParams, full: boolean): string {
  let s = `${p.width}x${p.height}`;
  if (full && p.aggressive !== DEFAULT_AGGRESSIVENESS) {
    s += `h${p.aggressive ? 1 : 0}`;
  }
  return s;
}

export function decodeParams(s: string): MosaicParams {
  const ret = defaultParams();
  const dims = parseDimensions(s);
  ret.width = dims.w;
  ret.height = dims.h;
  let i = dims.next;
  if (s[i] === "h") {
    i++;
    ret.aggressive = (Number.parseInt(s.slice(i), 10) || 0) !== 0;
  }
  return ret;
}

export function validateParams(p: MosaicParams, _full: boolean): string | null {
  if (p.height < 3 || p.width < 3) return "Minimal size is 3x3";
  if (p.height > MAX_TILES / p.width) return `Maximum size is ${MAX_TILES} tiles`;
  return null;
}

// --- desc codec -----------------------------------------------------------

/** Encode a clue board as upstream's run-length desc: a digit per shown
 * clue, a letter `a`-`z` per run of 1-26 hidden cells (emitted lazily
 * before the next clue / at end / when the run hits 26). */
export function encodeBoard(board: MosaicBoard): string {
  let out = "";
  let run = 0;
  for (const clue of board.clues) {
    if (clue >= 0) {
      if (run > 0) {
        out += String.fromCharCode(96 + run); // 'a' = 1
        run = 0;
      }
      out += String(clue);
    } else {
      if (run === 26) {
        out += "z";
        run = 0;
      }
      run++;
    }
  }
  if (run > 0) out += String.fromCharCode(96 + run);
  return out;
}

export function validateDesc(p: MosaicParams, desc: string): string | null {
  let length = 0;
  for (const ch of desc) {
    if (ch >= "a" && ch <= "z") {
      length += ch.charCodeAt(0) - 97; // + the shared ++ below = run length
    } else if (ch < "0" || ch > "9") {
      return "Invalid character in game description";
    }
    length++;
  }
  if (length !== p.width * p.height) return "Desc size mismatch";
  return null;
}

export function newState(p: MosaicParams, desc: string): MosaicState {
  const size = p.width * p.height;
  const clues = new Int8Array(size).fill(-1);
  let notCompletedClues = 0;
  let loc = 0;
  for (const ch of desc) {
    if (ch >= "0" && ch <= "9") {
      clues[loc] = ch.charCodeAt(0) - 48;
      notCompletedClues++;
      loc++;
    } else {
      // Letter run of hidden cells ('a' = 1). The cells are already -1.
      loc += ch >= "a" && ch <= "z" ? ch.charCodeAt(0) - 96 : 1;
    }
  }
  const board: MosaicBoard = Object.freeze({
    width: p.width,
    height: p.height,
    clues,
  });
  return {
    width: p.width,
    height: p.height,
    board,
    cells: new Uint8Array(size),
    cheating: false,
    notCompletedClues,
  };
}

// --- neighbourhood counting ----------------------------------------------

/** Count the marked / blank / total cells of the 3×3 neighbourhood of
 * (x,y), clipped to the board (upstream `count_around_state`). */
export function countAround(
  width: number,
  height: number,
  cells: Uint8Array,
  x: number,
  y: number,
): { marked: number; blank: number; total: number } {
  let marked = 0;
  let blank = 0;
  let total = 0;
  for (let j = Math.max(0, y - 1); j <= Math.min(height - 1, y + 1); j++) {
    for (let i = Math.max(0, x - 1); i <= Math.min(width - 1, x + 1); i++) {
      total++;
      const v = cells[j * width + i];
      if (v & STATE_BLANK) blank++;
      else if (v & STATE_MARKED) marked++;
    }
  }
  return { marked, blank, total };
}

/** Re-derive the SOLVED/ERROR overlay of every shown clue in the 3×3
 * neighbourhood of a just-changed cell (upstream
 * `update_board_state_around`). Mutates `cells` in place — callers pass
 * the already-cloned next state's array. */
export function updateBoardStateAround(
  state: { width: number; height: number; board: MosaicBoard },
  cells: Uint8Array,
  x: number,
  y: number,
): void {
  const { width, height, board } = state;
  for (let j = Math.max(0, y - 1); j <= Math.min(height - 1, y + 1); j++) {
    for (let i = Math.max(0, x - 1); i <= Math.min(width - 1, x + 1); i++) {
      const clue = board.clues[j * width + i];
      if (clue < 0) continue;
      const { marked, blank, total } = countAround(width, height, cells, i, j);
      const pos = j * width + i;
      const mark = cells[pos] & STATE_OK_NUM;
      if (clue === marked && total - marked - blank === 0) {
        cells[pos] = mark | STATE_SOLVED;
      } else if (clue < marked || clue > total - blank) {
        cells[pos] = mark | STATE_ERROR;
      } else {
        cells[pos] = mark;
      }
    }
  }
}

/** Shown clues not yet flagged SOLVED (upstream's per-move recount). */
function countNotCompletedClues(board: MosaicBoard, cells: Uint8Array): number {
  let left = 0;
  for (let i = 0; i < board.clues.length; i++) {
    if (board.clues[i] >= 0 && (cells[i] & STATE_SOLVED) === 0) left++;
  }
  return left;
}

// --- moves ----------------------------------------------------------------

export const STATE_MARKED_SOLVED = STATE_MARKED | STATE_SOLVED;
export const STATE_BLANK_SOLVED = STATE_BLANK | STATE_SOLVED;

export function executeMove(state: MosaicState, move: MosaicMove): MosaicState {
  const { width, height } = state;
  const size = width * height;
  const cells = Uint8Array.from(state.cells);

  if (move.type === "solve") {
    // Apply the hex-packed marked-cell bitmap, MSB first.
    let loc = 0;
    for (let i = 0; i + 1 < move.solution.length && loc < size; i += 2) {
      let byte = Number.parseInt(move.solution.slice(i, i + 2), 16);
      if (Number.isNaN(byte)) throw new Error("Bad solve bitmap");
      for (let bit = 0; bit < 8 && loc < size; bit++) {
        cells[loc] = byte & 0x80 ? STATE_MARKED_SOLVED : STATE_BLANK_SOLVED;
        byte = (byte << 1) & 0xff;
        loc++;
      }
    }
    if (loc < size) throw new Error("Bad solve bitmap");
    return { ...state, cells, cheating: true, notCompletedClues: 0 };
  }

  const inBounds = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height;

  if (move.type === "toggle") {
    if (!inBounds(move.x, move.y)) throw new Error("Toggle out of bounds");
    const pos = move.y * width + move.x;
    // Strip any SOLVED/ERROR overlay, then cycle the mark.
    cells[pos] = ((cells[pos] & STATE_OK_NUM) + (move.double ? 2 : 1)) % STATE_OK_NUM;
    updateBoardStateAround(state, cells, move.x, move.y);
  } else {
    const { x, y, srcX, srcY, paintState } = move;
    if (!inBounds(x, y)) throw new Error("Paint out of bounds");
    // Walk from (x,y) toward the anchor, exclusive (the anchor cell was
    // painted by the initial click).
    let dirX = 0;
    let dirY = 0;
    let diff: number;
    if (srcX === x && srcY !== y) {
      diff = Math.abs(srcY - y);
      dirY = srcY - y < 0 ? -1 : 1;
    } else {
      diff = Math.abs(srcX - x);
      dirX = srcX - x < 0 ? -1 : 1;
    }
    for (let i = 0; i < diff; i++) {
      const cx = x + dirX * i;
      const cy = y + dirY * i;
      if (!inBounds(cx, cy)) throw new Error("Paint out of bounds");
      const pos = cy * width + cx;
      if ((cells[pos] & STATE_OK_NUM) === 0) {
        cells[pos] = paintState;
        updateBoardStateAround(state, cells, cx, cy);
      }
    }
  }

  return {
    ...state,
    cells,
    notCompletedClues: countNotCompletedClues(state.board, cells),
  };
}

// --- status / text ----------------------------------------------------------

export function status(state: MosaicState): GameStatus {
  return state.notCompletedClues === 0 ? "solved" : "ongoing";
}

export function statusbarText(state: MosaicState, _ui: MosaicUi): string {
  if (state.notCompletedClues === 0) {
    return state.cheating ? "Auto solved" : "COMPLETED!";
  }
  return `Clues left: ${state.notCompletedClues}`;
}

export function textFormat(state: MosaicState): string {
  const { width, height, board } = state;
  const lines: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const clue = board.clues[y * width + x];
      row += clue >= 0 ? `|${clue}|` : "| |";
    }
    lines.push(row);
  }
  return `${lines.join("\n")}\n`;
}
