/**
 * Twiddle — native TS port (migration-order item 7). A grid of numbered
 * tiles; one click rotates an `n×n` subsquare 90°. Solved when the
 * numbers read in non-decreasing row-major order (and, when orientable,
 * every tile is upright).
 *
 * Idiomatic rendering of `puzzles/twiddle.c` (deleted when this ships):
 * immutable state, discriminated `TwiddleMove`, separate number/orient
 * typed arrays instead of C's packed `value*4 + orient`, GC instead of
 * dup/free. The logic mirrors the C reference; it is not a control-flow
 * transliteration.
 */

import type { Colour, Point } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { Game, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  MOD_MASK,
  MOD_NUM_KEYPAD,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import {
  animLength,
  buildColours,
  computeSize,
  FLASH_FRAME,
  fromCoord,
  NCOLOURS,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type TwiddleDrawState,
} from "./render.ts";
import {
  decodeParams,
  defaultParams,
  doRotate,
  encodeParams,
  isComplete,
  newDesc,
  newState,
  presets,
  solvedGrid,
  status,
  type TwiddleMove,
  type TwiddleParams,
  type TwiddleState,
  type TwiddleUi,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- button modifiers -------------------------------------------------

// Twiddle strips every modifier *except* the numpad bit (upstream
// `button & (~MOD_MASK | MOD_NUM_KEYPAD)`), since numpad keys drive the
// corner/edge rotations — so `stripModifiers` is intentionally not used.

// Char codes for the corner-rotation keys.
const KEY_a = 0x61;
const KEY_A = 0x41;
const KEY_b = 0x62;
const KEY_B = 0x42;
const KEY_c = 0x63;
const KEY_C = 0x43;
const KEY_d = 0x64;
const KEY_D = 0x44;

// --- ui ---------------------------------------------------------------

function newUi(_state: TwiddleState): TwiddleUi {
  return { curX: 0, curY: 0, curVisible: false };
}

// --- input ------------------------------------------------------------

function rotateMove(x: number, y: number, dir: 1 | -1): TwiddleMove {
  return { type: "rotate", x, y, dir };
}

function interpretMove(
  state: TwiddleState,
  ui: TwiddleUi,
  ds: TwiddleDrawState | null,
  p: Point,
  rawButton: number,
): TwiddleMove | null | UiUpdate {
  const { w, h, n } = state;
  const button = rawButton & (~MOD_MASK | MOD_NUM_KEYPAD);
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;

  // Cursor movement over the (w-n+1) × (h-n+1) rotation-origin space.
  // No toroidal wrap; the origin space is clamped.
  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.curX, ui.curY, w - n + 1, h - n + 1);
    const changed = moved !== null || !ui.curVisible;
    if (moved) {
      ui.curX = moved.x;
      ui.curY = moved.y;
    }
    ui.curVisible = true;
    return changed ? UI_UPDATE : null;
  }

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    // Offset by (n-1) half-tiles so the user clicks the *centre* of a
    // rotation region rather than its corner.
    const x = fromCoord(p.x - ((n - 1) * ts) / 2, ts);
    const y = fromCoord(p.y - ((n - 1) * ts) / 2, ts);
    if (x < 0 || x > w - n || y < 0 || y > h - n) return null;
    ui.curVisible = false;
    return rotateMove(x, y, button === LEFT_BUTTON ? 1 : -1);
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }
    return rotateMove(ui.curX, ui.curY, button === CURSOR_SELECT2 ? -1 : 1);
  }

  // Corner-rotation keys and numpad rotations. Each targets a fixed
  // block; the letter's case (or the numpad key) sets the direction.
  if (button === KEY_a || button === KEY_A || button === (MOD_NUM_KEYPAD | 0x37)) {
    return rotateMove(0, 0, button === KEY_A ? -1 : 1);
  }
  if (button === KEY_b || button === KEY_B || button === (MOD_NUM_KEYPAD | 0x39)) {
    return rotateMove(w - n, 0, button === KEY_B ? -1 : 1);
  }
  if (button === KEY_c || button === KEY_C || button === (MOD_NUM_KEYPAD | 0x31)) {
    return rotateMove(0, h - n, button === KEY_C ? -1 : 1);
  }
  if (button === KEY_d || button === KEY_D || button === (MOD_NUM_KEYPAD | 0x33)) {
    return rotateMove(w - n, h - n, button === KEY_D ? -1 : 1);
  }
  if (button === (MOD_NUM_KEYPAD | 0x38) && (w - n) % 2 === 0) {
    return rotateMove((w - n) / 2, 0, 1);
  }
  if (button === (MOD_NUM_KEYPAD | 0x32) && (w - n) % 2 === 0) {
    return rotateMove((w - n) / 2, h - n, 1);
  }
  if (button === (MOD_NUM_KEYPAD | 0x34) && (h - n) % 2 === 0) {
    return rotateMove(0, (h - n) / 2, 1);
  }
  if (button === (MOD_NUM_KEYPAD | 0x36) && (h - n) % 2 === 0) {
    return rotateMove(w - n, (h - n) / 2, 1);
  }
  if (button === (MOD_NUM_KEYPAD | 0x35) && (w - n) % 2 === 0 && (h - n) % 2 === 0) {
    return rotateMove((w - n) / 2, (h - n) / 2, 1);
  }

  return null;
}

// --- move execution ---------------------------------------------------

export function executeMove(from: TwiddleState, move: TwiddleMove): TwiddleState {
  if (move.type === "solve") {
    const { numbers, orient } = solvedGrid(from);
    // Upstream sets both completed and movecount to 1 on auto-solve.
    return {
      ...from,
      numbers,
      orient,
      usedSolve: true,
      completed: 1,
      moveCount: 1,
    };
  }

  const { w, h, n } = from;
  if (move.x < 0 || move.y < 0 || move.x > w - n || move.y > h - n) {
    throw new Error(`Illegal twiddle rotation at (${move.x}, ${move.y})`);
  }

  const numbers = Int32Array.from(from.numbers);
  const orient = Uint8Array.from(from.orient);
  doRotate(numbers, orient, w, h, n, from.orientable, move.x, move.y, move.dir);

  const moveCount = from.moveCount + 1;
  let completed = from.completed;
  if (!completed && isComplete(numbers, orient, w * h, from.orientable)) {
    completed = moveCount;
  }

  return {
    ...from,
    numbers,
    orient,
    moveCount,
    completed,
    lastX: move.x,
    lastY: move.y,
    lastR: move.dir,
  };
}

// --- status bar -------------------------------------------------------

function statusbarText(state: TwiddleState, _ui: TwiddleUi): string {
  if (state.usedSolve) {
    return `Moves since auto-solve: ${state.moveCount - state.completed}`;
  }
  const prefix = state.completed ? "COMPLETED! " : "";
  const moves = state.completed || state.moveCount;
  let s = `${prefix}Moves: ${moves}`;
  if (state.movetarget) s += ` (target ${state.movetarget})`;
  return s;
}

// --- colours ----------------------------------------------------------

function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const palette = buildColours(background, highlight, lowlight);
  if (palette.length !== NCOLOURS) {
    throw new Error("twiddle palette size mismatch");
  }
  return palette;
}

// --- Game object ------------------------------------------------------

export const twiddleGame: Game<
  TwiddleParams,
  TwiddleState,
  TwiddleMove,
  TwiddleUi,
  TwiddleDrawState
> = {
  id: "twiddle",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<TwiddleParams>(),
    {
      kw: "rotating-block-size",
      name: "Rotating block size",
      type: "string",
      get: (p) => String(p.n),
      set: (p, v) => {
        p.n = parseConfigInt(v);
      },
    },
    {
      kw: "one-number-per-row",
      name: "One number per row",
      type: "boolean",
      get: (p) => p.rowsonly,
      set: (p, v) => {
        p.rowsonly = v;
      },
    },
    {
      kw: "orientation-matters",
      name: "Orientation matters",
      type: "boolean",
      get: (p) => p.orientable,
      set: (p, v) => {
        p.orientable = v;
      },
    },
    {
      kw: "number-of-shuffling-moves",
      name: "Number of shuffling moves",
      type: "string",
      get: (p) => String(p.movetarget),
      set: (p, v) => {
        p.movetarget = parseConfigInt(v);
      },
    },
  ],

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(_orig, _curr) {
    return { ok: true, move: { type: "solve" as const } };
  },

  textFormat,
  statusbarText,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength: (_a, b) => animLength(b.n),
  flashLength: (oldState, newState_) => {
    if (
      !oldState.completed &&
      newState_.completed &&
      !oldState.usedSolve &&
      !newState_.usedSolve
    )
      return 2 * FLASH_FRAME;
    return 0;
  },
};

registerGame(twiddleGame);
