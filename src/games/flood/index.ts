import { assertNever } from "../../engine/assert-never.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { fromCoord as fromCoordE } from "../../engine/geometry.ts";
import { ALREADY_SOLVED, NO_MOVE_WORTH_MAKING } from "../../engine/hint-refusal.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  newCursor,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Color, Point, Size } from "../../engine/types.ts";
import {
  COLOR_NAMES,
  colors,
  computeSize,
  type FloodDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
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

// --- flash timing -----------------------------------------------------

const VICTORY_FLASH_FRAME = 0.03;
const DEFEAT_FLASH_FRAME = 0.1;

// --- move logic -------------------------------------------------------

/** Apply a single fill color to a (cloned) grid and return the new
 * state, advancing the move count and completion flag. */
function applyFill(state: FloodState, color: number): FloodState {
  const grid = Uint8Array.from(state.grid);
  const queue = new Int32Array(state.w * state.h);
  fill(state.w, state.h, grid, FILLX, FILLY, color, queue);
  const moves = state.moves + 1;
  return { ...state, grid, moves, completed: completed(grid) };
}

export function executeMove(state: FloodState, move: FloodMove): FloodState {
  if (move.type === "solve") {
    // Snap to solved: run the solver from here and apply every fill
    // (design D5). Upstream stores a path instead; our `hint()` gives the
    // step-by-step experience, so Solve just completes the board.
    if (state.completed) throw new Error("Puzzle is already solved");
    const moves = solveMoves(state.w, state.h, state.grid, state.colors);
    const grid = Uint8Array.from(state.grid);
    const queue = new Int32Array(state.w * state.h);
    for (const c of moves) fill(state.w, state.h, grid, FILLX, FILLY, c, queue);
    return {
      ...state,
      grid,
      moves: state.moves + moves.length,
      completed: true,
      cheated: true,
    };
  }
  if (move.type !== "fill") return assertNever(move, "flood: executeMove");

  const corner = state.grid[FILLY * state.w + FILLX];
  if (
    move.color < 0 ||
    move.color >= state.colors ||
    move.color === corner ||
    state.completed
  ) {
    throw new Error(`Illegal flood fill with colour ${move.color}`);
  }
  return applyFill(state, move.color);
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
  let tx = -1;
  let ty = -1;
  let uiUpdated = false;

  if (raw === LEFT_BUTTON) {
    const ts = ds.tilesize;
    tx = fromCoordE(p.x, ts, Math.floor(ts / 2));
    ty = fromCoordE(p.y, ts, Math.floor(ts / 2));
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
  } else if (raw === CURSOR_SELECT2) {
    // Upstream advances the stored solver path here; we have none
    // (design D2), so this is a no-op.
    return null;
  } else {
    return null;
  }

  let color = -1;
  if (
    tx >= 0 &&
    tx < w &&
    ty >= 0 &&
    ty < h &&
    state.grid[FILLY * w + FILLX] !== state.grid[ty * w + tx]
  ) {
    color = state.grid[ty * w + tx];
  }

  if (color >= 0 && !state.completed) {
    return { type: "fill", color };
  }
  return uiUpdated ? UI_UPDATE : null;
}

// --- status bar -------------------------------------------------------

function statusbarText(state: FloodState, _ui: FloodUi): string {
  // Faithful port of upstream's status string assembly.
  let prefix: string;
  if (state.completed && state.moves <= state.movelimit) {
    prefix = state.cheated ? "Auto-solved. " : "COMPLETED! ";
  } else if (state.moves >= state.movelimit) {
    prefix = "FAILED! ";
  } else if (state.cheated) {
    prefix = "Auto-solver used. ";
  } else {
    prefix = "";
  }
  return `${prefix}${state.moves} / ${state.movelimit} moves`;
}

// --- hint -------------------------------------------------------------

/** Compute the solver's whole remaining move sequence as a hint plan:
 * one narrated fill per step, simulated forward from the current board.
 * Returning the full plan (rather than one step per request) keeps the
 * hint banner populated through an auto-hint run, matching the other
 * solver-backed ports. */
function hint(state: FloodState): HintResult<FloodMove> {
  if (state.completed) return { ok: false, error: ALREADY_SOLVED };
  const moves = solveMoves(state.w, state.h, state.grid, state.colors);
  if (moves.length === 0) return { ok: false, error: NO_MOVE_WORTH_MAKING };

  const steps: HintStep<FloodMove>[] = [];
  for (const color of moves) {
    steps.push({
      move: { type: "fill", color },
      explanation: `Fill with ${COLOR_NAMES[color] ?? `colour ${color}`}`,
    });
  }
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

/** Mirror upstream `game_flash_length`: on a forward transition out of
 * the ongoing state, flash the victory rainbow on a win or the defeat
 * blink on a loss. Auto-solve snaps suppress the flash (the board jumps
 * straight to "Auto-solved"). */
function flashLength(
  oldState: FloodState,
  newState: FloodState,
  dir: number,
  _ui: FloodUi,
): number {
  if (dir !== 1 || newState.cheated) return 0;
  const oldStatus = status(oldState);
  const newStatus = status(newState);
  if (oldStatus === "ongoing" && newStatus !== "ongoing") {
    if (newStatus === "solved") {
      const frames = newState.w + newState.h + newState.colors - 2;
      return VICTORY_FLASH_FRAME * frames;
    }
    return DEFEAT_FLASH_FRAME * 3;
  }
  return 0;
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

  newDesc: (p, rng) => newDesc(p, rng),
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

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: FloodParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(floodGame);
