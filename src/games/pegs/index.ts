/**
 * Pegs — peg solitaire.
 *
 * Jump pegs over adjacent pegs into empty holes, removing the jumped
 * peg. Win when exactly one peg remains. Three board types: Cross
 * (the classic English/European layouts), Octagon (European with
 * parity-safe starting hole), and Random (reverse-move generation
 * guaranteeing solubility).
 *
 * Upstream's `pegs.c`, as idiomatic TS: immutable state, a `PegsMove`
 * object, and `SortedMultiset` standing in for the Random generator's
 * `tree234`.
 */

import { rejectMove } from "../../engine/assert-never.ts";
import {
  type Game,
  registerGame,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/index.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
} from "../../engine/pointer.ts";
import type { Point } from "../../engine/types.ts";
import { newDesc } from "./generator.ts";
import {
  colors,
  computeSize,
  FLASH_FRAME,
  fromCoordWithTileSize,
  newDrawState,
  type PegsDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  BOARD_TYPE_NAMES,
  decodeParams,
  defaultParams,
  deserializeMove,
  encodeParams,
  GRID_HOLE,
  GRID_OBST,
  GRID_PEG,
  newState,
  newUi,
  type PegsMove,
  type PegsParams,
  type PegsState,
  type PegsUi,
  presets,
  serializeMove,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

export type { PegsMove, PegsParams, PegsState, PegsUi };

// --- jump legality ---------------------------------------------------

function inGrid(s: PegsState, x: number, y: number): boolean {
  return x >= 0 && x < s.w && y >= 0 && y < s.h;
}

/** Why `m` is not a legal jump on `s`, or null if it is. */
function illegalJump(s: PegsState, m: PegsMove): string | null {
  const { sx, sy, tx, ty } = m;
  if (!inGrid(s, sx, sy)) return "Source out of range";
  if (!inGrid(s, tx, ty)) return "Target out of range";
  const dx = Math.abs(tx - sx);
  const dy = Math.abs(ty - sy);
  if (Math.max(dx, dy) !== 2 || Math.min(dx, dy) !== 0) {
    return "Move length was wrong";
  }
  const { w } = s;
  if (
    s.grid[sy * w + sx] !== GRID_PEG ||
    s.grid[((sy + ty) / 2) * w + (sx + tx) / 2] !== GRID_PEG ||
    s.grid[ty * w + tx] !== GRID_HOLE
  ) {
    return "Grid contents were invalid for this move";
  }
  return null;
}

// --- interpretMove ---------------------------------------------------

function interpretMove(
  s: PegsState,
  ui: PegsUi,
  ds: PegsDrawState,
  p: Point,
  button: number,
): PegsMove | null | UiUpdate {
  const { w, h } = s;
  const ts = ds.tileSize;

  if (button === LEFT_BUTTON) {
    const tx = fromCoordWithTileSize(p.x, ts);
    const ty = fromCoordWithTileSize(p.y, ts);
    if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
      const v = s.grid[ty * w + tx];
      if (v === GRID_PEG) {
        ui.dragging = true;
        ui.sx = tx;
        ui.sy = ty;
        ui.dx = p.x;
        ui.dy = p.y;
        ui.cursor.visible = false;
        ui.curJumping = false;
        return UI_UPDATE;
      }
      if (v === GRID_HOLE) return null; // MOVE_NO_EFFECT
      return null; // MOVE_UNUSED (OBST)
    }
    return null;
  }

  if (button === LEFT_DRAG && ui.dragging) {
    ui.dx = p.x;
    ui.dy = p.y;
    return UI_UPDATE;
  }

  if (button === LEFT_RELEASE && ui.dragging) {
    ui.dragging = false;
    const tx = fromCoordWithTileSize(p.x, ts);
    const ty = fromCoordWithTileSize(p.y, ts);
    const move: PegsMove = { type: "jump", sx: ui.sx, sy: ui.sy, tx, ty };
    return illegalJump(s, move) ? UI_UPDATE : move;
  }

  const cursorMove = cursorDelta(button);
  if (cursorMove) {
    const { dx, dy } = cursorMove;
    const { x, y } = ui.cursor;
    if (!ui.curJumping) {
      // An obstacle cell refuses the cursor.
      const nx = x + dx;
      const ny = y + dy;
      if (inGrid(s, nx, ny) && s.grid[ny * w + nx] !== GRID_OBST) {
        ui.cursor.x = nx;
        ui.cursor.y = ny;
      }
      ui.cursor.visible = true;
      return UI_UPDATE;
    }

    // Jumping mode: the arrow names the direction to jump in.
    const tx = x + 2 * dx;
    const ty = y + 2 * dy;
    ui.curJumping = false;
    if (
      !inGrid(s, tx, ty) ||
      s.grid[(y + dy) * w + (x + dx)] !== GRID_PEG ||
      s.grid[ty * w + tx] !== GRID_HOLE
    ) {
      return UI_UPDATE;
    }
    ui.cursor.x = tx;
    ui.cursor.y = ty;
    return { type: "jump", sx: x, sy: y, tx, ty };
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.cursor.visible) {
      ui.cursor.visible = true;
      return UI_UPDATE;
    }
    if (ui.curJumping) {
      ui.curJumping = false;
      return UI_UPDATE;
    }
    if (s.grid[ui.cursor.y * w + ui.cursor.x] === GRID_PEG) {
      ui.curJumping = true;
      return UI_UPDATE;
    }
    return null;
  }

  return null;
}

// --- executeMove -----------------------------------------------------

function executeMove(s: PegsState, m: PegsMove): PegsState {
  // Pegs' move is one object shape rather than a union, so `m` does not narrow
  // to `never` here and there is no compile-time guarantee to be had; this is
  // the field check the dispatch below depends on (see `rejectMove`).
  if (m.type !== "jump") rejectMove(m, "pegs: executeMove");
  const error = illegalJump(s, m);
  if (error) throw new Error(error);

  const { w, h } = s;
  const { sx, sy, tx, ty } = m;
  const grid = new Uint8Array(s.grid);
  grid[sy * w + sx] = GRID_HOLE;
  grid[((sy + ty) / 2) * w + (sx + tx) / 2] = GRID_HOLE;
  grid[ty * w + tx] = GRID_PEG;

  // Won when exactly one peg remains.
  let pegs = 0;
  for (const v of grid) {
    if (v === GRID_PEG) pegs++;
  }
  return { w, h, completed: s.completed || pegs === 1, grid };
}
// --- animation / flash -----------------------------------------------

function flashLength(a: PegsState, b: PegsState): number {
  if (!a.completed && b.completed) return 2 * FLASH_FRAME;
  return 0;
}

// --- register --------------------------------------------------------

export const pegsGame: Game<PegsParams, PegsState, PegsMove, PegsUi, PegsDrawState> = {
  id: "pegs",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: false,
  canFormatAsText: true,
  // The whole game is one press-and-drag and the secondary button means
  // nothing, so a held press must not be promoted to it: that would destroy
  // the gesture of a touch player who pauses to pick a landing square.
  ignoresSecondaryButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    {
      kw: "board-type",
      name: "Board type",
      type: "choices",
      choices: [...BOARD_TYPE_NAMES],
      get: (p) => p.type,
      set: (p, v) => {
        p.type = v;
      },
    },
    ...dimensionParamConfig<PegsParams>(),
  ],
  describeParams: (p) => ({ "board-type": String(p.type) }),

  newDesc,
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  textFormat,
  serializeMove,
  deserializeMove,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,
  flashLength,
};

registerGame(pegsGame);
