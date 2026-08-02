/**
 * Sticks (Tatebo-Yokobo) — native TS port of `puzzles/unreleased/sticks.c`.
 * Fill every white cell with a horizontal or vertical line: a number on a
 * line states that line's exact length (and a line may overlap at most one
 * number); a number in a black cell states how many lines connect to it.
 *
 * Input is the upstream drag machine: press then drag along an axis to draw
 * that orientation across the cells passed (starting on a matching line
 * turns the drag into a clearing drag); a plain left click cycles
 * blank→vertical→horizontal→blank and a right click cycles the other way;
 * middle-drag clears; a keyboard cursor places lines with Enter/Space/
 * 0/1/2/backspace and draws across two cells with Shift/Ctrl+arrows.
 * Violated clue numbers red live (upstream behaviour); Check & Save
 * additionally flags lines contradicting the unique solution
 * (`findMistakes`).
 */

import {
  type Game,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import { SYMMETRY_CHOICES } from "../../engine/symmetric-blacks.ts";
import type { Colour, ConfigValues, Point, Size } from "../../engine/types.ts";
import { newSticksDesc } from "./generator.ts";
import {
  border,
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SticksDrawState,
  setTileSize,
} from "./render.ts";
import { findMistakes, sticksSolveGame, sticksValidate } from "./solver.ts";
import {
  cloneState,
  decodeParams,
  defaultParams,
  encodeParams,
  F_BLOCK,
  F_HOR,
  F_VER,
  newState,
  presets,
  type SticksLine,
  type SticksMistake,
  type SticksMove,
  type SticksParams,
  type SticksState,
  type SticksUi,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: SticksState): SticksUi {
  return {
    cx: 0,
    cy: 0,
    cursor: false,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    dragType: "none",
    drag: [],
    dragMove: [],
  };
}

const lineBits = (line: SticksLine): number =>
  line === "hor" ? F_HOR : line === "ver" ? F_VER : 0;

const bitsLine = (bits: number): SticksLine =>
  bits & F_HOR ? "hor" : bits & F_VER ? "ver" : "none";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: input dispatch over button x cursor x the three edge states.
function interpretMove(
  state: SticksState,
  ui: SticksUi,
  ds: SticksDrawState | null,
  p: Point,
  rawButton: number,
): SticksMove | null | UiUpdate {
  const { w, h, grid } = state;
  const shift = (rawButton & MOD_SHFT) !== 0;
  const control = (rawButton & MOD_CTRL) !== 0;
  const button = stripModifiers(rawButton);
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const b = border(ts);
  // C's FROMCOORD is truncating integer division, so a pointer slightly
  // inside the border still maps to row/column 0 — keep trunc, not floor.
  const fromC = (v: number): number => Math.trunc((v - b) / ts);
  const dragDelta = ts * 0.4;

  if (isMouseDown(button) || isMouseDrag(button)) ui.cursor = false;

  // --- keyboard cursor movement (draws across two cells with Shift/Ctrl) ---
  if (isCursorMove(button)) {
    const ox = ui.cx;
    const oy = ui.cy;
    const moved = gridCursorMove(button, ui.cx, ui.cy, w, h);
    if (moved) {
      ui.cx = moved.x;
      ui.cy = moved.y;
    }
    ui.cursor = true;

    if (shift || control) {
      const horizontalArrow = button === CURSOR_LEFT || button === CURSOR_RIGHT;
      const line: SticksLine =
        shift && control
          ? "none"
          : control
            ? horizontalArrow
              ? "hor"
              : "ver"
            : horizontalArrow
              ? "ver"
              : "hor";
      const i1 = oy * w + ox;
      const i2 = ui.cy * w + ui.cx;
      const inert = (i: number): boolean =>
        !!(grid[i] & F_BLOCK) ||
        (line === "hor" && !!(grid[i] & F_HOR)) ||
        (line === "ver" && !!(grid[i] & F_VER)) ||
        (line === "none" && !grid[i]);
      const changes: { index: number; line: SticksLine }[] = [];
      if (!inert(i1)) changes.push({ index: i1, line });
      if (i1 !== i2 && !inert(i2)) changes.push({ index: i2, line });
      if (changes.length > 0) return { kind: "set", changes };
    }
    return UI_UPDATE;
  }

  // --- begin a normal drag -------------------------------------------------
  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    ui.minX = ui.maxX = p.x;
    ui.minY = ui.maxY = p.y;
    ui.drag = [];
    ui.dragMove = [];
    ui.dragType = "start";
    return UI_UPDATE;
  }

  // --- perform a normal drag -----------------------------------------------
  if (isMouseDrag(button) && (ui.dragType === "start" || ui.dragType === "line")) {
    ui.minX = Math.min(ui.minX, p.x);
    ui.maxX = Math.max(ui.maxX, p.x);
    ui.minY = Math.min(ui.minY, p.y);
    ui.maxY = Math.max(ui.maxY, p.y);

    const dx = ui.maxX - ui.minX;
    const dy = ui.maxY - ui.minY;
    let dragMove: number;
    if (dx > dy && dx > dragDelta) dragMove = F_HOR;
    else if (dy > dx && dy > dragDelta) dragMove = F_VER;
    else return null;

    const hx = fromC((ui.minX + ui.maxX) / 2);
    const hy = fromC((ui.minY + ui.maxY) / 2);

    ui.minX = ui.maxX = p.x;
    ui.minY = ui.maxY = p.y;

    if (hx < 0 || hx >= w || hy < 0 || hy >= h) return null;
    const i = hy * w + hx;
    if (grid[i] & F_BLOCK) return null;

    if (ui.dragType === "start" && grid[i] & dragMove) {
      // Starting on a matching line: the drag clears instead of draws.
      ui.dragType = "clear";
      dragMove = 0;
    } else {
      ui.dragType = "line";
      const d = ui.drag.indexOf(i);
      if (d !== -1) {
        ui.dragMove[d] = dragMove;
        return UI_UPDATE;
      }
    }

    ui.drag.push(i);
    ui.dragMove.push(dragMove);
    return UI_UPDATE;
  }

  // --- begin a clearing drag (middle button) -------------------------------
  if (button === MIDDLE_BUTTON) {
    const hx = fromC(p.x);
    const hy = fromC(p.y);
    ui.drag = [];
    ui.dragMove = [];
    ui.dragType = "clear";
    // C reads the grid unchecked here (out of bounds is UB); bounds-check.
    if (hx >= 0 && hx < w && hy >= 0 && hy < h) {
      const i = hy * w + hx;
      if (grid[i] & (F_HOR | F_VER)) {
        ui.drag.push(i);
        ui.dragMove.push(0);
      }
    }
    return UI_UPDATE;
  }

  // --- perform a clearing drag ---------------------------------------------
  if (isMouseDrag(button) && ui.dragType === "clear") {
    const hx = fromC(p.x);
    const hy = fromC(p.y);
    if (hx < 0 || hx >= w || hy < 0 || hy >= h) return null; // C: UB read
    const i = hy * w + hx;
    if (!(grid[i] & (F_HOR | F_VER))) return null;
    if (ui.drag.includes(i)) return null;
    ui.drag.push(i);
    ui.dragMove.push(0);
    return UI_UPDATE;
  }

  if (isMouseRelease(button)) {
    // --- a click (release without a qualifying drag) cycles the cell -------
    if (ui.dragType === "start") {
      const hx = fromC((ui.minX + ui.maxX) / 2);
      const hy = fromC((ui.minY + ui.maxY) / 2);
      if (hx < 0 || hx >= w || hy < 0 || hy >= h) {
        ui.dragType = "none";
        return UI_UPDATE;
      }
      const i = hy * w + hx;
      const old = grid[i];
      let value = 0;
      if (button === LEFT_RELEASE) value = old === 0 ? F_VER : old & F_VER ? F_HOR : 0;
      if (button === RIGHT_RELEASE) value = old === 0 ? F_HOR : old & F_HOR ? F_VER : 0;
      ui.drag = [i];
      ui.dragMove = [value];
    }

    ui.dragType = "none";

    // --- confirm clicks and drags as one batched move ----------------------
    if (ui.drag.length > 0) {
      const changes: { index: number; line: SticksLine }[] = [];
      for (let d = 0; d < ui.drag.length; d++) {
        const j = ui.drag[d];
        if (grid[j] & F_BLOCK) continue;
        changes.push({ index: j, line: bitsLine(ui.dragMove[d]) });
      }
      ui.drag = [];
      ui.dragMove = [];
      if (changes.length > 0) return { kind: "set", changes };
      return UI_UPDATE;
    }
    return null;
  }

  // --- keyboard place-one at the cursor ------------------------------------
  if (
    ui.cursor &&
    (button === CURSOR_SELECT ||
      button === CURSOR_SELECT2 ||
      button === 8 /* backspace */ ||
      button === 48 /* '0' */ ||
      button === 49 /* '1' */ ||
      button === 50) /* '2' */
  ) {
    const i = ui.cy * w + ui.cx;
    if (grid[i] & F_BLOCK) return null;
    const old = grid[i];
    let line: SticksLine = "none";
    if (button === 48 || button === 50) line = "hor";
    else if (button === 49) line = "ver";
    else if (button === CURSOR_SELECT2)
      line = old === 0 ? "hor" : old & F_HOR ? "ver" : "none";
    else if (button === CURSOR_SELECT)
      line = old === 0 ? "ver" : old & F_VER ? "hor" : "none";

    // Don't put no-ops on the undo chain (upstream comment).
    if (
      (old & F_HOR && line === "hor") ||
      (old & F_VER && line === "ver") ||
      (old === 0 && line === "none")
    ) {
      return null;
    }
    return { kind: "set", changes: [{ index: i, line }] };
  }

  return null;
}

function executeMove(state: SticksState, move: SticksMove): SticksState {
  const next = cloneState(state);
  if (move.kind === "solve") {
    for (let i = 0; i < next.grid.length; i++) {
      if (state.grid[i] & F_BLOCK) continue;
      next.grid[i] = lineBits(move.grid[i]);
    }
  } else {
    for (const { index, line } of move.changes) {
      if (state.grid[index] & F_BLOCK) continue;
      next.grid[index] = lineBits(line);
    }
  }
  if (sticksValidate(next.grid, next.numbers, next.w, next.h) === "complete")
    next.completed = true;
  // Upstream: `if (cheated) ret->cheated = ret->completed;` — a solve marks
  // the game cheated only when it actually completed the board.
  if (move.kind === "solve") next.cheated = next.completed;
  return next;
}

function solve(orig: SticksState): SolveResult<SticksMove> {
  const grid = orig.grid.slice();
  const result = sticksSolveGame(grid, orig.numbers, orig.w, orig.h);
  if (result === "invalid") return { ok: false, error: "Puzzle is invalid." };
  // An unfinished solve still emits the partial deduction (upstream).
  const lines: SticksLine[] = Array.from(grid, (t) => bitsLine(t));
  return { ok: true, move: { kind: "solve", grid: lines } };
}

function flashLength(
  from: SticksState,
  to: SticksState,
  _dir: number,
  _ui: SticksUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

export const sticksGame: Game<
  SticksParams,
  SticksState,
  SticksMove,
  SticksUi,
  SticksDrawState,
  SticksMistake
> = {
  id: "sticks",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  needsRightButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    "percentage-of-black-squares": String(p.blackpc),
    symmetry: p.symm,
  }),
  paramConfig: [
    ...dimensionParamConfig<SticksParams>(),
    {
      kw: "percentage-of-black-squares",
      name: "%age of black squares",
      type: "string",
      get: (p) => String(p.blackpc),
      set: (p, v) => {
        p.blackpc = parseConfigInt(v);
      },
    },
    {
      kw: "symmetry",
      name: "Symmetry",
      type: "choices",
      choices: SYMMETRY_CHOICES,
      get: (p) => p.symm,
      set: (p, v) => {
        p.symm = v;
      },
    },
  ],

  newDesc: (p: SticksParams, rng: RandomState) => newSticksDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,
  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SticksParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(sticksGame);
