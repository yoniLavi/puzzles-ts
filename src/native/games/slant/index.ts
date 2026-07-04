/**
 * Slant — native TS port of `slant.c` (Gokigen Naname). Fill every square
 * with a `/` or `\` diagonal so each vertex clue counts its incident
 * diagonals and no closed loop forms.
 *
 * Left-click cycles a square blank → `\` → `/` → blank; right-click the
 * reverse (swappable via the mouse-button-order preference); `\`, `/` and
 * backspace place directly at the keyboard cursor.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { Game, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SlantDrawState,
} from "./render.ts";
import { solveFromClues } from "./solver.ts";
import {
  DIFF_NAMES,
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  newState,
  presets,
  type SlantMistake,
  type SlantMove,
  type SlantParams,
  type SlantState,
  type SlantUi,
  type Slash,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: SlantState): SlantUi {
  return {
    cx: 0,
    cy: 0,
    cursorVisible: false,
    swapButtons: false,
    fadeGrounded: false,
  };
}

// Keyboard char codes handled directly.
const KEY_BACKSLASH = 92;
const KEY_SLASH = 47;
const KEY_BACKSPACE = 8;

/** Cycle a square's value: left-click runs blank→`\`→`/`→blank
 * ("clockwise"), right-click the reverse. */
function cycle(current: number, clockwise: boolean): Slash {
  if (clockwise) {
    let v = current - 1;
    if (v === -2) v = 1;
    return v as Slash;
  }
  let v = current + 1;
  if (v === 2) v = -1;
  return v as Slash;
}

function interpretMove(
  state: SlantState,
  ui: SlantUi,
  ds: SlantDrawState | null,
  p: Point,
  rawButton: number,
): SlantMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const b = Math.floor(ts / 3) + 1; // render.ts border (NARROW_BORDERS)
  const fromCoord = (v: number) => Math.floor((v - b + ts) / ts) - 1;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    let effective = button;
    if (ui.swapButtons) {
      effective = button === LEFT_BUTTON ? RIGHT_BUTTON : LEFT_BUTTON;
    }
    const x = fromCoord(p.x);
    const y = fromCoord(p.y);
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    ui.cursorVisible = false;
    return {
      type: "set",
      x,
      y,
      v: cycle(state.soln[y * w + x], effective === LEFT_BUTTON),
    };
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.cursorVisible) {
      ui.cursorVisible = true;
      return UI_UPDATE;
    }
    const x = ui.cx;
    const y = ui.cy;
    return {
      type: "set",
      x,
      y,
      v: cycle(state.soln[y * w + x], button === CURSOR_SELECT),
    };
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.cx, ui.cy, w, h);
    if (moved) {
      ui.cx = moved.x;
      ui.cy = moved.y;
    }
    ui.cursorVisible = true;
    return UI_UPDATE;
  }

  if (button === KEY_BACKSLASH || button === KEY_SLASH || button === KEY_BACKSPACE) {
    const x = ui.cx;
    const y = ui.cy;
    const v: Slash = button === KEY_BACKSLASH ? -1 : button === KEY_SLASH ? 1 : 0;
    if (state.soln[y * w + x] === v) return null; // no effect
    return { type: "set", x, y, v };
  }

  return null;
}

function flashLength(
  oldState: SlantState,
  newState_: SlantState,
  _dir: number,
  _ui: SlantUi,
): number {
  return !oldState.completed &&
    newState_.completed &&
    !oldState.usedSolve &&
    !newState_.usedSolve
    ? FLASH_TIME
    : 0;
}

function solve(
  orig: SlantState,
  _curr: SlantState,
  aux?: string,
): ReturnType<NonNullable<Game<SlantParams, SlantState, SlantMove>["solve"]>> {
  if (aux && aux.length === orig.w * orig.h) {
    return { ok: true, move: { type: "solve", grid: aux } };
  }
  const result = solveFromClues(orig.w, orig.h, orig.clues);
  if ("error" in result) {
    return {
      ok: false,
      error:
        result.error === "impossible"
          ? "This puzzle is not self-consistent"
          : "Unable to find a unique solution for this puzzle",
    };
  }
  let grid = "";
  for (let i = 0; i < orig.w * orig.h; i++) {
    grid += result.soln[i] < 0 ? "\\" : "/";
  }
  return { ok: true, move: { type: "solve", grid } };
}

/** Boards this fork generates are uniquely solvable at Hard or below:
 * re-solve the clues and flag every placed diagonal that contradicts the
 * unique solution. Blank squares are never mistakes; a non-uniquely-solvable
 * (hand-typed) board degrades to "no detectable mistakes". */
function findMistakes(state: SlantState): readonly SlantMistake[] {
  const { w, h } = state;
  const result = solveFromClues(w, h, state.clues);
  if ("error" in result) return [];
  const out: SlantMistake[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = state.soln[y * w + x];
      if (s !== 0 && s !== result.soln[y * w + x]) out.push({ x, y });
    }
  }
  return out;
}

export const slantGame: Game<
  SlantParams,
  SlantState,
  SlantMove,
  SlantUi,
  SlantDrawState,
  SlantMistake
> = {
  id: "slant",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<SlantParams>(),
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => p.diff,
      set: (p, v) => {
        p.diff = v;
      },
    },
  ],
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.diff,
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,

  textFormat,

  prefs: [
    {
      kw: "left-button",
      name: "Mouse button order",
      type: "choices",
      choices: ["Left \\, right /", "Left /, right \\"],
      get: (ui) => (ui.swapButtons ? 1 : 0),
      set: (ui, v) => {
        ui.swapButtons = v === 1;
      },
    },
    {
      kw: "fade-grounded",
      name: "Fade grounded components",
      type: "boolean",
      get: (ui) => ui.fadeGrounded,
      set: (ui, v) => {
        ui.fadeGrounded = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SlantParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  flashLength,
};

registerGame(slantGame);
