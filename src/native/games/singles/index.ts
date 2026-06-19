/**
 * Singles (Hitori) — native TS port of `singles.c`. A grid of numbers in
 * which you blacken cells so that no number repeats among the remaining
 * (white) cells of any row or column, no two black cells are orthogonally
 * adjacent, and the white cells form one connected region. Left-click /
 * select toggles a cell black; right-click / select2 toggles a white mark
 * (circle); clicking a marked cell clears it. A click outside the grid
 * toggles the "show numbers on black squares" preference. Rule violations
 * are highlighted live; Check & Save additionally flags cells that
 * contradict the unique solution.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import {
  type Game,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  isCursorMove,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newSinglesDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SinglesDrawState,
  setTileSize,
} from "./render.ts";
import { CC_MARK_ERRORS, checkComplete, solveSpecific } from "./solver.ts";
import {
  type CellValue,
  cloneState,
  DIFF_ANY,
  decodeParams,
  defaultParams,
  diffName,
  encodeParams,
  F_BLACK,
  F_CIRCLE,
  makeState,
  newState,
  type SinglesMove,
  type SinglesParams,
  type SinglesState,
  type SinglesUi,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A cell whose mark contradicts the unique solution (Check & Save). */
export interface SinglesMistake {
  x: number;
  y: number;
}

const PRESET_SIZES = [5, 6, 8, 10, 12];

function presets(): {
  title: string;
  submenu: { title: string; params: SinglesParams }[];
} {
  const submenu: { title: string; params: SinglesParams }[] = [];
  for (const d of PRESET_SIZES) {
    for (const diff of ["easy", "tricky"] as const) {
      submenu.push({
        title: `${d}x${d} ${diffName(diff)}`,
        params: { w: d, h: d, diff },
      });
    }
  }
  return { title: "Singles", submenu };
}

function newUi(_state: SinglesState): SinglesUi {
  return { cx: 0, cy: 0, cshow: false, showBlackNums: false };
}

function changedState(
  ui: SinglesUi,
  oldState: SinglesState | null,
  newSt: SinglesState,
): void {
  if (oldState && !oldState.completed && newSt.completed) ui.cshow = false;
}

function inGrid(s: SinglesState, x: number, y: number): boolean {
  return x >= 0 && x < s.w && y >= 0 && y < s.h;
}

function interpretMove(
  state: SinglesState,
  ui: SinglesUi,
  ds: SinglesDrawState | null,
  p: Point,
  rawButton: number,
): SinglesMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;

  // Cursor movement: wraps toroidally; first press only reveals the cursor.
  if (isCursorMove(button)) {
    const delta = cursorDelta(button);
    if (!delta) return null;
    const ox = ui.cx;
    const oy = ui.cy;
    ui.cx = (((ui.cx + delta.dx) % w) + w) % w;
    ui.cy = (((ui.cy + delta.dy) % h) + h) % h;
    if (!ui.cshow) {
      ui.cshow = true;
      return UI_UPDATE;
    }
    return ui.cx !== ox || ui.cy !== oy ? UI_UPDATE : null;
  }

  let x: number;
  let y: number;
  let action: "none" | "black" | "circle" | "ui" = "none";

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    x = ui.cx;
    y = ui.cy;
    if (!ui.cshow) ui.cshow = true;
    action = button === CURSOR_SELECT ? "black" : "circle";
  } else if (
    button === LEFT_BUTTON ||
    button === MIDDLE_BUTTON ||
    button === RIGHT_BUTTON
  ) {
    const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
    const border = Math.floor(ts / 2);
    const fromCoord = (v: number): number => Math.floor((v - border + ts) / ts) - 1;
    x = fromCoord(p.x);
    y = fromCoord(p.y);
    if (ui.cshow) {
      ui.cshow = false;
      action = "ui";
    }
    if (!inGrid(state, x, y)) {
      ui.showBlackNums = !ui.showBlackNums;
      action = "ui";
    } else if (button === LEFT_BUTTON) {
      action = "black";
    } else if (button === RIGHT_BUTTON) {
      action = "circle";
    }
  } else {
    return null;
  }

  if (action === "ui") return UI_UPDATE;
  if (action === "black" || action === "circle") {
    const i = y * w + x;
    let value: CellValue;
    if (state.flags[i] & (F_BLACK | F_CIRCLE)) value = "empty";
    else value = action === "black" ? "black" : "circle";
    return { sets: [{ x, y, value }] };
  }
  return null;
}

function executeMove(state: SinglesState, move: SinglesMove): SinglesState {
  const next = cloneState(state);
  for (const { x, y, value } of move.sets) {
    if (!inGrid(next, x, y)) throw new Error("singles move out of bounds");
    const i = y * next.w + x;
    next.flags[i] &= ~(F_BLACK | F_CIRCLE);
    if (value === "black") next.flags[i] |= F_BLACK;
    else if (value === "circle") next.flags[i] |= F_CIRCLE;
  }
  if (move.solve) next.usedSolve = true;
  if (checkComplete(next, CC_MARK_ERRORS)) next.completed = true;
  return next;
}

/** The B/C/E diff between two states (upstream game_state_diff). */
function diffMove(src: SinglesState, dst: SinglesState): SinglesMove {
  const sets: SinglesMove["sets"] = [];
  for (let x = 0; x < dst.w; x++) {
    for (let y = 0; y < dst.h; y++) {
      const i = y * dst.w + x;
      const sm = src.flags[i] & (F_BLACK | F_CIRCLE);
      const dm = dst.flags[i] & (F_BLACK | F_CIRCLE);
      if (sm !== dm) {
        const value: CellValue =
          dm & F_BLACK ? "black" : dm & F_CIRCLE ? "circle" : "empty";
        sets.push({ x, y, value });
      }
    }
  }
  return { sets, solve: true };
}

function solve(orig: SinglesState, curr: SinglesState): SolveResult<SinglesMove> {
  let solved = cloneState(curr);
  if (solveSpecific(solved, DIFF_ANY, false) > 0) {
    return { ok: true, move: diffMove(curr, solved) };
  }
  solved = cloneState(orig);
  if (solveSpecific(solved, DIFF_ANY, false) > 0) {
    return { ok: true, move: diffMove(curr, solved) };
  }
  return { ok: false, error: "Unable to solve puzzle." };
}

function findMistakes(state: SinglesState): readonly SinglesMistake[] {
  const solved = makeState(state.w, state.h, state.nums);
  if (solveSpecific(solved, DIFF_ANY, false) <= 0) return [];
  const out: SinglesMistake[] = [];
  for (let i = 0; i < state.n; i++) {
    const pv = state.flags[i] & (F_BLACK | F_CIRCLE);
    if (!pv) continue; // undecided cells are never mistakes
    const sv = solved.flags[i] & (F_BLACK | F_CIRCLE);
    if (pv !== sv) out.push({ x: i % state.w, y: (i / state.w) | 0 });
  }
  return out;
}

function flashLength(
  from: SinglesState,
  to: SinglesState,
  _dir: number,
  _ui: SinglesUi,
): number {
  if (!from.completed && to.completed && !to.usedSolve) return FLASH_TIME;
  return 0;
}

export const singlesGame: Game<
  SinglesParams,
  SinglesState,
  SinglesMove,
  SinglesUi,
  SinglesDrawState,
  SinglesMistake
> = {
  id: "singles",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  newDesc: (p, rng) => newSinglesDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,

  textFormat,

  prefs: [
    {
      kw: "show-black-nums",
      name: "Show numbers on black squares",
      type: "boolean",
      get: (ui) => ui.showBlackNums,
      set: (ui, v) => {
        ui.showBlackNums = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SinglesParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(singlesGame);
