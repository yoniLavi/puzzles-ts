/**
 * Sokoban (upstream `puzzles/unfinished/sokoban.c`): push every barrel onto a
 * target square by walking into it; you can never pull.
 *
 * A movement puzzle, so it deliberately ships **no** `solve`, `hint` or
 * `findMistakes`: upstream has no solver (Sokoban solving is PSPACE-complete),
 * and every reachable position is legal, so there is no wrong-but-legal state
 * to flag and Check & Save is a plain Quick-save. Moves are instant, as
 * upstream's `game_anim_length` is 0.
 */

import { rejectMove } from "../../engine/assert-never.ts";
import type { Game } from "../../engine/game.ts";
import { cursorDelta, LEFT_BUTTON, stripModifiers } from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import { newSokobanDesc } from "./generator.ts";
import {
  colors,
  computeSize,
  FLASH_LENGTH,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SokobanDrawState,
  setTileSize,
} from "./render.ts";
import {
  DEEP_PIT,
  decodeParams,
  defaultParams,
  detargetize,
  encodeParams,
  isBarrel,
  isOnTarget,
  moveType,
  newState,
  PIT,
  paramConfig,
  presets,
  type SokobanMove,
  type SokobanParams,
  type SokobanState,
  type SokobanUi,
  SPACE,
  status,
  TARGET,
  targetize,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- input ------------------------------------------------------------

/**
 * The eight directions on the digits `1`–`9` (not `5`), beside the cursor keys'
 * four. Upstream binds only the number pad's digits; the bare digits are bound
 * too, because a numpad sends digits only with Num Lock on and a laptop may
 * have none (docs/games/input.md § "The numeric keypad never arrives").
 * `stripModifiers` lets the numpad's own digits through.
 */
const DIGIT_DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  "7": { dx: -1, dy: -1 },
  "8": { dx: 0, dy: -1 },
  "9": { dx: 1, dy: -1 },
  "4": { dx: -1, dy: 0 },
  "6": { dx: 1, dy: 0 },
  "1": { dx: -1, dy: 1 },
  "2": { dx: 0, dy: 1 },
  "3": { dx: 1, dy: 1 },
};

function interpretMove(
  state: SokobanState,
  _ui: SokobanUi,
  ds: SokobanDrawState,
  p: Point,
  rawButton: number,
): SokobanMove | null {
  const button = stripModifiers(rawButton);
  let dx = 0;
  let dy = 0;

  if (button === LEFT_BUTTON) {
    // Toward the click from the player's cell, diagonally when off both axes.
    const ts = ds.tileSize;
    if (p.x < state.px * ts) dx = -1;
    else if (p.x > (state.px + 1) * ts) dx = 1;
    if (p.y < state.py * ts) dy = -1;
    else if (p.y > (state.py + 1) * ts) dy = 1;
  } else {
    const dir = cursorDelta(button) ?? DIGIT_DIRECTIONS[String.fromCharCode(button)];
    if (!dir) return null;
    dx = dir.dx;
    dy = dir.dy;
  }

  if (dx === 0 && dy === 0) return null;
  if (moveType(state, dx, dy) === "illegal") return null;
  return { type: "move", dx, dy };
}

// --- move execution ---------------------------------------------------

export function executeMove(state: SokobanState, move: SokobanMove): SokobanState {
  // One object shape rather than a union, so there is no discriminant to
  // narrow to `never`: check the fields the dispatch reads. A move with no
  // step would reach `moveType` as (NaN, NaN), read the grid out of bounds and
  // come back a *legal* walk, gaining the board a move it never made.
  if (
    move.type !== "move" ||
    !Number.isInteger(move.dx) ||
    !Number.isInteger(move.dy)
  ) {
    rejectMove(move, "sokoban: executeMove");
  }

  const { dx, dy } = move;
  const kind = moveType(state, dx, dy);
  if (kind === "illegal") throw new Error("sokoban: illegal move");

  const { w, h } = state;
  const grid = state.grid.slice();
  const nx = state.px + dx;
  const ny = state.py + dy;

  if (kind === "push") {
    const from = ny * w + nx;
    const to = (ny + dy) * w + nx + dx;
    // Lift the barrel, leaving the SPACE or TARGET beneath it.
    let b = grid[from];
    if (isOnTarget(b)) {
      grid[from] = TARGET;
      b = detargetize(b);
    } else {
      grid[from] = SPACE;
    }
    // Set it down beyond: it fills a pit, and a deep pit eats it and remains.
    const beyond = grid[to];
    if (beyond === PIT) grid[to] = SPACE;
    else if (beyond === TARGET) grid[to] = targetize(b);
    else if (beyond !== DEEP_PIT) grid[to] = b;
  }

  // Completion: the board cannot become any *more* complete. That is, either
  // there are no barrels off targets, or there is no way to place any that
  // remain (no free target, no pit, no deep pit anywhere). This handles spare
  // barrels and levels with pits correctly.
  let completed = state.completed;
  if (!completed) {
    let freeBarrels = false;
    let freeTargets = false;
    for (const v of grid) {
      if (isBarrel(v) && !isOnTarget(v)) freeBarrels = true;
      if (v === DEEP_PIT || v === PIT || (!isBarrel(v) && isOnTarget(v)))
        freeTargets = true;
    }
    completed = !freeBarrels || !freeTargets;
  }

  return { w, h, grid, px: nx, py: ny, completed };
}

// --- Game object ------------------------------------------------------

export const sokobanGame: Game<
  SokobanParams,
  SokobanState,
  SokobanMove,
  SokobanUi,
  SokobanDrawState
> = {
  id: "sokoban",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: false,
  canFormatAsText: false,
  // Stepping the player is the only gesture; the secondary button has no
  // meaning, so a touch player's held press must not be promoted into one.
  ignoresSecondaryButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig,

  newDesc: newSokobanDesc,
  validateDesc,
  newState,
  newUi: () => ({}),

  interpretMove,
  executeMove,
  status,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (oldState, newState) =>
    !oldState.completed && newState.completed ? FLASH_LENGTH : 0,
};

registerGame(sokobanGame);
