/**
 * Pattern (Nonograms) — native TS port of `pattern.c`. Reconstruct a
 * black/white picture from the run-length clues listed beside every row and
 * column. Left-drag paints black (FULL), right-drag paints white/empty
 * (EMPTY), middle-drag clears to undecided (UNKNOWN); a stylus press cycles a
 * cell's value. The keyboard cursor paints with Ctrl/Shift held and the
 * select keys cycle a cell.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MIDDLE_DRAG,
  MIDDLE_RELEASE,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import { registerGame } from "../../engine/registry.ts";
import { newPatternDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  type PatternDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
} from "./render.ts";
import {
  deduceHintPlan,
  findMistakes,
  type PatternHintReason,
  solveToString,
} from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  GRID_EMPTY,
  GRID_FULL,
  GRID_UNKNOWN,
  type GridVal,
  newState,
  type PatternMistake,
  type PatternMove,
  type PatternParams,
  type PatternState,
  type PatternUi,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

const MOD_STYLUS = 0x0800;

function newUi(_state: PatternState): PatternUi {
  return {
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragEndX: 0,
    dragEndY: 0,
    drag: 0,
    release: 0,
    state: GRID_UNKNOWN,
    curX: 0,
    curY: 0,
    curVisible: false,
  };
}

function interpretMove(
  state: PatternState,
  ui: PatternUi,
  ds: PatternDrawState | null,
  p: Point,
  rawButton: number,
): PatternMove | null | UiUpdate {
  const control = (rawButton & MOD_CTRL) !== 0;
  const shift = (rawButton & MOD_SHFT) !== 0;
  const stylus = (rawButton & MOD_STYLUS) !== 0;
  const button = stripModifiers(rawButton);
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const { w, h } = state.common;
  const { grid } = state;

  let x = fromCoord(ts, w, p.x);
  let y = fromCoord(ts, h, p.y);

  // --- press: begin a drag ---
  if (
    x >= 0 &&
    x < w &&
    y >= 0 &&
    y < h &&
    (button === LEFT_BUTTON || button === RIGHT_BUTTON || button === MIDDLE_BUTTON)
  ) {
    const curr = grid[y * w + x];
    ui.dragging = true;
    if (button === LEFT_BUTTON) {
      ui.drag = LEFT_DRAG;
      ui.release = LEFT_RELEASE;
      ui.state = stylus ? (((curr + 2) % 3) as GridVal) : GRID_FULL; // FULL→EMPTY→UNKNOWN
    } else if (button === RIGHT_BUTTON) {
      ui.drag = RIGHT_DRAG;
      ui.release = RIGHT_RELEASE;
      ui.state = stylus ? (((curr + 1) % 3) as GridVal) : GRID_EMPTY; // EMPTY→FULL→UNKNOWN
    } else {
      ui.drag = MIDDLE_DRAG;
      ui.release = MIDDLE_RELEASE;
      ui.state = GRID_UNKNOWN;
    }
    ui.dragStartX = ui.dragEndX = x;
    ui.dragStartY = ui.dragEndY = y;
    ui.curVisible = false;
    return UI_UPDATE;
  }

  // --- drag: snap to a single line (except a middle/UNKNOWN area-clear) ---
  if (ui.dragging && button === ui.drag) {
    if (ui.state !== GRID_UNKNOWN) {
      if (Math.abs(x - ui.dragStartX) > Math.abs(y - ui.dragStartY)) y = ui.dragStartY;
      else x = ui.dragStartX;
    }
    x = Math.max(0, Math.min(w - 1, x));
    y = Math.max(0, Math.min(h - 1, y));
    ui.dragEndX = x;
    ui.dragEndY = y;
    return UI_UPDATE;
  }

  // --- release: emit the rectangle fill if it changes anything ---
  if (ui.dragging && button === ui.release) {
    const x1 = Math.min(ui.dragStartX, ui.dragEndX);
    const x2 = Math.max(ui.dragStartX, ui.dragEndX);
    const y1 = Math.min(ui.dragStartY, ui.dragEndY);
    const y2 = Math.max(ui.dragStartY, ui.dragEndY);
    // A multi-cell paint drag (not a single click, not a clear) only fills
    // blank cells, so dragging across the board never rewrites a mark the
    // player already placed.
    const multiCell = x2 > x1 || y2 > y1;
    const onlyBlank = multiCell && ui.state !== GRID_UNKNOWN;
    let moveNeeded = false;
    for (let yy = y1; yy <= y2 && !moveNeeded; yy++) {
      for (let xx = x1; xx <= x2; xx++) {
        const i = yy * w + xx;
        if (state.common.immutable[i]) continue;
        const wouldChange = onlyBlank ? grid[i] === GRID_UNKNOWN : grid[i] !== ui.state;
        if (wouldChange) {
          moveNeeded = true;
          break;
        }
      }
    }
    ui.dragging = false;
    if (moveNeeded) {
      return {
        type: "fill",
        value: ui.state,
        x: x1,
        y: y1,
        w: x2 - x1 + 1,
        h: y2 - y1 + 1,
        onlyBlank,
      };
    }
    return UI_UPDATE;
  }

  // --- keyboard cursor movement (paints while Ctrl/Shift held) ---
  if (isCursorMove(button)) {
    const ox = ui.curX;
    const oy = ui.curY;
    const wasVisible = ui.curVisible;
    const moved = gridCursorMove(button, ui.curX, ui.curY, w, h);
    if (moved) {
      ui.curX = moved.x;
      ui.curY = moved.y;
    }
    ui.curVisible = true;
    const ret = moved || !wasVisible ? UI_UPDATE : null;
    if (!control && !shift) return ret;

    const newstate: GridVal = control ? (shift ? GRID_UNKNOWN : GRID_FULL) : GRID_EMPTY;
    if (grid[oy * w + ox] === newstate && grid[ui.curY * w + ui.curX] === newstate) {
      return ret;
    }
    return {
      type: "fill",
      value: newstate,
      x: Math.min(ox, ui.curX),
      y: Math.min(oy, ui.curY),
      w: Math.abs(ox - ui.curX) + 1,
      h: Math.abs(oy - ui.curY) + 1,
    };
  }

  // --- cursor select: cycle the current cell ---
  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }
    const curr = grid[ui.curY * w + ui.curX];
    const newstate: GridVal =
      button === CURSOR_SELECT2
        ? curr === GRID_UNKNOWN
          ? GRID_EMPTY
          : curr === GRID_EMPTY
            ? GRID_FULL
            : GRID_UNKNOWN
        : curr === GRID_UNKNOWN
          ? GRID_FULL
          : curr === GRID_FULL
            ? GRID_EMPTY
            : GRID_UNKNOWN;
    return { type: "fill", value: newstate, x: ui.curX, y: ui.curY, w: 1, h: 1 };
  }

  return null;
}

// --- hint ------------------------------------------------------------------

/** Highlight data for a Pattern hint step. `cells` are the forced target
 * squares (all one colour — `value`), drawn as a `COL_HINT` highlight only,
 * never pre-filled (the narration says black vs white). `line` is the row /
 * column the deduction reasons over — its clue and line of sight shade
 * `COL_HINT_CELL`. `blackRefs` / `whiteRefs` are the already-placed marks the
 * deduction leans on, ringed teal / violet so their own colour stays visible
 * (the cross-game element-type legend). */
export interface PatternHint {
  cells: number[];
  value: GridVal;
  line: number;
  blackRefs: number[];
  whiteRefs: number[];
}

/** Narrate *why* the cells are forced — lead with the indication (the spotted
 * pattern), conclude in the necessity voice, terse. */
function narrate(
  reason: PatternHintReason,
  count: number,
  line: number,
  w: number,
): string {
  const orient = line < w ? "column" : "row";
  const many = count > 1;
  const these = many ? "these cells" : "this cell";
  const they = many ? "they" : "it";
  switch (reason.kind) {
    case "overlap":
      return reason.slack === 0
        ? `This ${orient}'s run of ${reason.run} has nowhere to slide, so ${these} must be black.`
        : `This ${orient}'s run of ${reason.run} can slide only ${reason.slack} cell${
            reason.slack > 1 ? "s" : ""
          }, so ${these} must be black.`;
    case "unreachable":
      return `No run can reach ${these} in this ${orient}, so ${they} must stay white.`;
    case "lineEmpty":
      return `This ${orient} has no clues, so ${these} must stay white.`;
    case "forced":
      return reason.black
        ? `Only one arrangement of this ${orient}'s clues fits, so ${these} must be black.`
        : `Only one arrangement of this ${orient}'s clues fits, so ${these} must stay white.`;
  }
}

function hint(state: PatternState): HintResult<PatternMove, PatternHint> {
  if (state.completed) {
    return { ok: false, error: "This board is already solved." };
  }
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error:
        "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };
  }
  const plan = deduceHintPlan(state);
  if (plan.length === 0) {
    return { ok: false, error: "No further move can be deduced from this position." };
  }
  const { w } = state.common;
  const steps: HintStep<PatternMove, PatternHint>[] = plan.map((m) => ({
    move: { type: "fillCells", value: m.value, cells: m.cells },
    explanation: narrate(m.reason, m.cells.length, m.line, w),
    highlights: {
      cells: m.cells,
      value: m.value,
      line: m.line,
      blackRefs: m.blackRefs,
      whiteRefs: m.whiteRefs,
    },
  }));
  return { ok: true, steps };
}

/** The cells a move would actually change, mapped to their new value. */
function cellsChangedBy(m: PatternMove, state: PatternState): Map<number, GridVal> {
  const out = new Map<number, GridVal>();
  if (m.type === "solve") return out; // a solve is never "following" a step
  const { w, h } = state.common;
  const { grid } = state;
  const imm = state.common.immutable;
  const sz = w * h;
  if (m.type === "fillCells") {
    for (const i of m.cells) {
      if (i < 0 || i >= sz || imm[i]) continue;
      if (grid[i] !== m.value) out.set(i, m.value);
    }
    return out;
  }
  for (let yy = m.y; yy < m.y + m.h; yy++) {
    for (let xx = m.x; xx < m.x + m.w; xx++) {
      const i = yy * w + xx;
      if (imm[i]) continue;
      if (m.onlyBlank && grid[i] !== GRID_UNKNOWN) continue;
      if (grid[i] !== m.value) out.set(i, m.value);
    }
  }
  return out;
}

/** Classify a player move against a (possibly multi-cell) hint step: it must
 * set the hinted value into a subset of the step's cells and touch nothing
 * else. Filling all completes it; filling some keeps it on track (the step
 * shrinks so a later auto-hint fills only the rest); anything else drops the
 * plan to recompute. */
function hintKeepTrack(
  m: PatternMove,
  step: HintStep<PatternMove, PatternHint>,
  state: PatternState,
): HintTrackVerdict {
  const t = step.highlights;
  if (!t) return "off";
  const changed = cellsChangedBy(m, state);
  if (changed.size === 0) return "off";
  const targets = new Set(t.cells);
  for (const [cell, value] of changed) {
    if (!targets.has(cell) || value !== t.value) return "off";
  }
  const remaining = t.cells.filter((c) => !changed.has(c));
  if (remaining.length === t.cells.length) return "off";
  if (remaining.length === 0) return "completed";
  step.highlights = { ...t, cells: remaining };
  step.move = { type: "fillCells", value: t.value, cells: remaining };
  return "onTrack";
}

export const patternGame: Game<
  PatternParams,
  PatternState,
  PatternMove,
  PatternUi,
  PatternDrawState,
  PatternMistake
> = {
  id: "pattern",
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
  paramConfig: dimensionParamConfig(),

  newDesc: (p, rng) => newPatternDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(orig) {
    const grid = solveToString(orig);
    if (!grid)
      return { ok: false, error: "Solving algorithm cannot complete this puzzle" };
    return { ok: true, move: { type: "solve", grid } };
  },

  hint,
  hintKeepTrack,
  findMistakes,
  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: PatternParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  flashLength: (a, b) => winFlash(a, b, FLASH_TIME),
};

registerGame(patternGame);
