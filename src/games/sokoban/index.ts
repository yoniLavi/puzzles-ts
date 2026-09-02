/**
 * Sokoban — native TS port (upstream `puzzles/unfinished/sokoban.c`). Push
 * every barrel onto a target square by walking into it; you can never pull.
 *
 * A movement puzzle, so it deliberately ships **no** `solve`, `hint` or
 * `findMistakes` — upstream has no solver (Sokoban solving is PSPACE-complete),
 * the game is non-deductive, and it has no wrong-but-legal cell state (every
 * reachable position is legal). Consequently Check & Save degrades to a plain
 * Quick-save (`canFindMistakes` is false), which is correct for a
 * non-uniquely-solvable movement puzzle (design D3/D4). There is no animation
 * either — moves are instant, matching upstream `game_anim_length` = 0 (D5).
 */

import { rejectMove } from "../../engine/assert-never.ts";
import type { Game } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_UP,
  LEFT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Color, Point, Size } from "../../engine/types.ts";
import { newSokobanDesc } from "./generator.ts";
import {
  colors,
  computeSize,
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

const FLASH_LENGTH = 0.3;

// --- input ------------------------------------------------------------

/**
 * The eight directions bound to the bare number-pad digits. This web frontend
 * never sets `MOD_NUM_KEYPAD`, so a faithful transcription of upstream's
 * `MOD_NUM_KEYPAD | '7'` bindings would leave the diagonals unreachable by
 * keyboard (docs/games/input.md § "The numeric keypad never arrives"). Accept the bare digits `1`–`9` (except `5`), plus
 * the cursor keys for the four orthogonal moves — a deliberate divergence that
 * costs nothing and restores the input the C build's keypad also failed to reach.
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

  if (button === CURSOR_UP) dy = -1;
  else if (button === CURSOR_DOWN) dy = 1;
  else if (button === CURSOR_LEFT) dx = -1;
  else if (button === CURSOR_RIGHT) dx = 1;
  else if (button === LEFT_BUTTON) {
    // Direction relative to the player's cell (can be diagonal).
    const ts = ds.tilesize;
    const coord = (n: number) => n * ts; // BORDER = 0
    if (p.x < coord(state.px)) dx = -1;
    else if (p.x > coord(state.px + 1)) dx = 1;
    if (p.y < coord(state.py)) dy = -1;
    else if (p.y > coord(state.py + 1)) dy = 1;
  } else {
    const dir = DIGIT_DIRECTIONS[String.fromCharCode(button)];
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
  // Sokoban's move is one object shape rather than a union, so there is no
  // discriminant to narrow to `never`: check the fields the dispatch reads.
  // Without this a move with no step lands in `moveType` as `(NaN, NaN)`, which
  // reads the grid out of bounds and comes back "no barrel here" — a *legal*
  // walk, so the board silently gained a move it never made.
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
  const px = state.px;
  const py = state.py;
  const nx = px + dx;
  const ny = py + dy;
  const nbx = nx + dx;
  const nby = ny + dy;

  if (kind === "push") {
    // Take the barrel off (nx,ny), leaving SPACE or TARGET.
    let b = grid[ny * w + nx];
    if (isOnTarget(b)) {
      grid[ny * w + nx] = TARGET;
      b = detargetize(b);
    } else {
      grid[ny * w + nx] = SPACE;
    }
    // Deposit it beyond, honoring pits.
    const beyond = grid[nby * w + nbx];
    if (beyond === PIT) {
      grid[nby * w + nbx] = SPACE; // the barrel fills the pit and is consumed
    } else if (beyond === DEEP_PIT) {
      /* the deep pit eats the barrel and remains */
    } else if (beyond === TARGET) {
      grid[nby * w + nbx] = targetize(b);
    } else {
      grid[nby * w + nbx] = b;
    }
  }

  // Completion: the board cannot become any *more* complete. That is, either
  // there are no barrels off targets, or there is no way to place any that
  // remain (no free target, no pit, no deep pit anywhere). This handles spare
  // barrels and levels with pits correctly.
  let completed = state.completed;
  if (!completed) {
    let freeBarrels = false;
    let freeTargets = false;
    for (let i = 0; i < w * h; i++) {
      const v = grid[i];
      if (isBarrel(v) && !isOnTarget(v)) freeBarrels = true;
      if (v === DEEP_PIT || v === PIT || (!isBarrel(v) && isOnTarget(v)))
        freeTargets = true;
    }
    if (!freeBarrels || !freeTargets) completed = true;
  }

  return { w, h, grid, px: nx, py: ny, completed };
}

// --- flash ------------------------------------------------------------

function flashLength(
  oldState: SokobanState,
  newSt: SokobanState,
  _dir: number,
  _ui: SokobanUi,
): number {
  return !oldState.completed && newSt.completed ? FLASH_LENGTH : 0;
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
  // Sokoban's params are exactly width and height, so this is the plain form.
  // It was missing until `audit-vestigial-contract-surface`, which made Sokoban
  // the one game in the collection whose "Custom type…" dialog opened with no
  // fields in it — invisible because the menu entry is gated on a flag the
  // midend hard-coded to `true`.
  paramConfig: dimensionParamConfig(),

  newDesc: (p: SokobanParams, rng: RandomState) => newSokobanDesc(p, rng),
  validateDesc,
  newState,
  newUi: () => ({}),

  interpretMove,
  executeMove,
  status,

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SokobanParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(sokobanGame);
