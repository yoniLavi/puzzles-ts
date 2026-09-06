/**
 * Pegs — native TS port of the classic Peg Solitaire game.
 *
 * Jump pegs over adjacent pegs into empty holes, removing the jumped
 * peg. Win when exactly one peg remains. Three board types: Cross
 * (the classic English/European layouts), Octagon (European with
 * parity-safe starting hole), and Random (reverse-move generation
 * guaranteeing solubility).
 *
 * Idiomatic rendering of `puzzles/pegs.c` (deleted when this ships):
 * immutable state, discriminated `PegsMove`, GC instead of
 * dup/free, `SortedMultiset` standing in for `tree234` in the
 * RANDOM generator. The logic mirrors the C reference; it is not a
 * control-flow transliteration.
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
  decodeParams,
  defaultParams,
  deserializeMove,
  encodeParams,
  GRID_HOLE,
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
    if (tx < 0 || tx >= w || ty < 0 || ty >= h) return UI_UPDATE;
    const ddx = tx - ui.sx;
    const ddy = ty - ui.sy;
    if (
      Math.max(Math.abs(ddx), Math.abs(ddy)) !== 2 ||
      Math.min(Math.abs(ddx), Math.abs(ddy)) !== 0
    ) {
      return UI_UPDATE;
    }
    const mx = ui.sx + ddx / 2;
    const my = ui.sy + ddy / 2;
    if (
      s.grid[ty * w + tx] !== GRID_HOLE ||
      s.grid[my * w + mx] !== GRID_PEG ||
      s.grid[ui.sy * w + ui.sx] !== GRID_PEG
    ) {
      return UI_UPDATE;
    }
    return { type: "jump", sx: ui.sx, sy: ui.sy, tx, ty };
  }

  // Cursor movement.
  const cursorMove = cursorDelta(button);
  if (cursorMove) {
    const { dx: ddx, dy: ddy } = cursorMove;
    if (!ui.curJumping) {
      // Normal cursor movement: try to move, skip OBST cells.
      const cx = ui.cursor.x;
      const cy = ui.cursor.y;
      const nx = cx + ddx;
      const ny = cy + ddy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const v = s.grid[ny * w + nx];
        if (v === GRID_HOLE || v === GRID_PEG) {
          ui.cursor.x = nx;
          ui.cursor.y = ny;
        }
      }
      ui.cursor.visible = true;
      return UI_UPDATE;
    }

    // Jumping mode: attempt a jump in the given direction.
    const mx = ui.cursor.x + ddx;
    const my = ui.cursor.y + ddy;
    const jx = mx + ddx;
    const jy = my + ddy;

    ui.curJumping = false;
    if (
      jx >= 0 &&
      jx < w &&
      jy >= 0 &&
      jy < h &&
      s.grid[my * w + mx] === GRID_PEG &&
      s.grid[jy * w + jx] === GRID_HOLE
    ) {
      ui.cursor.x = jx;
      ui.cursor.y = jy;
      return {
        type: "jump",
        sx: ui.cursor.x - 2 * ddx,
        sy: ui.cursor.y - 2 * ddy,
        tx: jx,
        ty: jy,
      };
    }
    return UI_UPDATE;
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
    return null; // MOVE_NO_EFFECT
  }

  return null; // MOVE_UNUSED
}

// --- executeMove -----------------------------------------------------

function executeMove(s: PegsState, m: PegsMove): PegsState {
  // Pegs' move is one object shape rather than a union, so `m` does not narrow
  // to `never` here and there is no compile-time guarantee to be had; this is
  // the field check the dispatch below depends on (see `rejectMove`).
  if (m.type !== "jump") rejectMove(m, "pegs: executeMove");

  const { w, h } = s;
  const { sx, sy, tx, ty } = m;

  // Validate the move.
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) throw new Error("Source out of range");
  if (tx < 0 || tx >= w || ty < 0 || ty >= h) throw new Error("Target out of range");

  const ddx = tx - sx;
  const ddy = ty - sy;
  if (
    Math.max(Math.abs(ddx), Math.abs(ddy)) !== 2 ||
    Math.min(Math.abs(ddx), Math.abs(ddy)) !== 0
  ) {
    throw new Error("Move length was wrong");
  }
  const mx = sx + ddx / 2;
  const my = sy + ddy / 2;

  if (
    s.grid[sy * w + sx] !== GRID_PEG ||
    s.grid[my * w + mx] !== GRID_PEG ||
    s.grid[ty * w + tx] !== GRID_HOLE
  ) {
    throw new Error("Grid contents were invalid for this move");
  }

  // Apply the move to a new state.
  const grid = new Uint8Array(s.grid);
  grid[sy * w + sx] = GRID_HOLE;
  grid[my * w + mx] = GRID_HOLE;
  grid[ty * w + tx] = GRID_PEG;

  // Check completion: exactly one peg remains.
  let completed = s.completed;
  if (!completed) {
    let count = 0;
    for (let i = 0; i < w * h; i++) {
      if (grid[i] === GRID_PEG) count++;
    }
    if (count === 1) completed = true;
  }

  return { w, h, completed, grid };
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
  // The whole game is one press-and-drag, and the secondary button has no
  // meaning — so promoting a held press was silently destroying the gesture of
  // any touch player who paused to pick a landing square.
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
      choices: ["Cross", "Octagon", "Random"],
      get: (p) => p.type,
      set: (p, v) => {
        p.type = v;
      },
    },
    ...dimensionParamConfig<PegsParams>(),
  ],
  describeParams: (p) => ({ "board-type": String(p.type) }),

  newDesc: (p, rng) => newDesc(p, rng),
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
