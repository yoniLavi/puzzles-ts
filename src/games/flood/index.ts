import { assertNever } from "../../engine/assert-never.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { fromCoord } from "../../engine/geometry.ts";
import { ALREADY_SOLVED, NO_MOVE_WORTH_MAKING } from "../../engine/hint-refusal.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  newCursor,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import { say } from "./hint-text.ts";
import {
  colors,
  computeSize,
  DEFEAT_FLASH_FRAME,
  type FloodDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  VICTORY_FLASH_FRAME,
} from "./render.ts";
import { completed, fill, solveMoves } from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  FILLX,
  FILLY,
  type FloodMove,
  type FloodParams,
  type FloodState,
  type FloodUi,
  newDesc,
  newState,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- move logic -------------------------------------------------------

/** Apply `fills` in turn to a copy of the grid, advancing the move count. */
function applyFills(state: FloodState, fills: readonly number[]): FloodState {
  const grid = Uint8Array.from(state.grid);
  const queue = new Int32Array(state.w * state.h);
  for (const c of fills) fill(state.w, state.h, grid, FILLX, FILLY, c, queue);
  const moves = state.moves + fills.length;
  return { ...state, grid, moves, completed: completed(grid) };
}

export function executeMove(state: FloodState, move: FloodMove): FloodState {
  if (move.type === "solve") {
    // Snap to solved: the hint plan is the step-by-step experience, so Solve
    // just completes the board.
    if (state.completed) throw new Error("Puzzle is already solved");
    const fills = solveMoves(state.w, state.h, state.grid, state.colors);
    return { ...applyFills(state, fills), cheated: true };
  }
  if (move.type !== "fill") return assertNever(move, "flood: executeMove");

  const corner = state.grid[FILLY * state.w + FILLX];
  if (
    move.color < 0 ||
    move.color >= state.colors ||
    move.color === corner ||
    state.completed
  ) {
    throw new Error(`Illegal flood fill with color ${move.color}`);
  }
  return applyFills(state, [move.color]);
}

// --- UI / input -------------------------------------------------------

function newUi(_state: FloodState): FloodUi {
  return { cursor: newCursor(FILLX, FILLY) };
}

function interpretMove(
  state: FloodState,
  ui: FloodUi,
  ds: FloodDrawState,
  p: Point,
  button: number,
): FloodMove | null | UiUpdate {
  const { w, h } = state;
  const raw = stripModifiers(button);
  let tx: number;
  let ty: number;
  let uiUpdated = false;

  if (raw === LEFT_BUTTON) {
    const ts = ds.tileSize;
    tx = fromCoord(p.x, ts, Math.floor(ts / 2));
    ty = fromCoord(p.y, ts, Math.floor(ts / 2));
    if (ui.cursor.visible) {
      ui.cursor.visible = false;
      uiUpdated = true;
    }
  } else if (isCursorMove(raw)) {
    const moved = gridCursorMove(raw, ui.cursor.x, ui.cursor.y, w, h);
    if (moved) {
      ui.cursor.x = moved.x;
      ui.cursor.y = moved.y;
    }
    ui.cursor.visible = true;
    return UI_UPDATE;
  } else if (raw === CURSOR_SELECT) {
    tx = ui.cursor.x;
    ty = ui.cursor.y;
  } else {
    return null;
  }

  // A completed grid is one color, so it offers no fill.
  if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
    const color = state.grid[ty * w + tx];
    if (color !== state.grid[FILLY * w + FILLX]) return { type: "fill", color };
  }
  return uiUpdated ? UI_UPDATE : null;
}

// --- status bar -------------------------------------------------------

/** Upstream's status line: the outcome, then the move count. */
function statusbarText(state: FloodState, _ui: FloodUi): string {
  const count = `${state.moves} / ${state.movelimit} moves`;
  switch (status(state)) {
    case "solved":
      return `${state.cheated ? "Auto-solved." : "COMPLETED!"} ${count}`;
    case "lost":
      return `FAILED! ${count}`;
    default:
      return state.cheated ? `Auto-solver used. ${count}` : count;
  }
}

// --- hint -------------------------------------------------------------

/** The solver's whole remaining fill sequence, one narrated step per fill.
 * Returning the full plan rather than one step keeps the hint banner
 * populated through an auto-hint run. */
function hint(state: FloodState): HintResult<FloodMove> {
  if (state.completed) return { ok: false, error: ALREADY_SOLVED };
  const moves = solveMoves(state.w, state.h, state.grid, state.colors);
  if (moves.length === 0) return { ok: false, error: NO_MOVE_WORTH_MAKING };
  const steps = moves.map(
    (color): HintStep<FloodMove> => ({
      move: { type: "fill", color },
      explanation: say.fill(color),
    }),
  );
  return { ok: true, steps };
}

/** A player fill of the step's color completes it (the plan advances);
 * anything else deviates and drops the plan. */
function hintKeepTrack(
  m: FloodMove,
  step: HintStep<FloodMove>,
  _state: FloodState,
): HintTrackVerdict {
  if (m.type !== "fill" || step.move.type !== "fill") return "off";
  return m.color === step.move.color ? "completed" : "off";
}

// --- flash ------------------------------------------------------------

/** Upstream's `game_flash_length`: leaving the ongoing state flashes the
 * victory rainbow on a win or the defeat blink on a loss. An auto-solve
 * jumps straight to "Auto-solved" with no flash. */
function flashLength(
  oldState: FloodState,
  newState: FloodState,
  dir: number,
  _ui: FloodUi,
): number {
  if (dir !== 1 || newState.cheated) return 0;
  const now = status(newState);
  if (status(oldState) !== "ongoing" || now === "ongoing") return 0;
  if (now === "lost") return DEFEAT_FLASH_FRAME * 3;
  const frames = newState.w + newState.h + newState.colors - 2;
  return VICTORY_FLASH_FRAME * frames;
}

// --- Game object ------------------------------------------------------

export const floodGame: Game<
  FloodParams,
  FloodState,
  FloodMove,
  FloodUi,
  FloodDrawState
> = {
  id: "flood",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  // Choosing a color is the only gesture; the secondary button has no
  // meaning, so a touch player's held press must not be promoted into one.
  ignoresSecondaryButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<FloodParams>(),
    {
      kw: "colors",
      name: "Colors",
      type: "string",
      get: (p) => String(p.colors),
      set: (p, v) => {
        p.colors = parseConfigInt(v);
      },
    },
    {
      kw: "extra-moves-permitted",
      name: "Extra moves permitted",
      type: "string",
      get: (p) => String(p.leniency),
      set: (p, v) => {
        p.leniency = parseConfigInt(v);
      },
    },
  ],
  describeParams: (p) => ({
    colors: String(p.colors),
    "extra-moves-permitted": String(p.leniency),
  }),

  newDesc,
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(_orig, curr) {
    if (curr.completed) return { ok: false, error: "Puzzle is already solved" };
    return { ok: true, move: { type: "solve" as const } };
  },

  hint,
  hintKeepTrack,

  textFormat,
  statusbarText,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize: (ds, ts) => {
    ds.tileSize = ts;
  },
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(floodGame);
