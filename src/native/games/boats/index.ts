/**
 * Boats — native TS port of `unreleased/boats.c` (Lennard Sprong, 2012).
 *
 * *Battleships*: locate a known fleet in the grid. The numbers on the right and
 * bottom count the occupied cells of each row and column, a few boat segments
 * are given with their orientation, and no two boats touch — not even
 * diagonally. A boat is crossed off the list at the bottom once it is completely
 * surrounded by water.
 *
 * **Input is a line-fill drag.** A left-click cycles a square empty → boat →
 * water → empty; a right-click toggles water; and a press-and-drag fills a run
 * along whichever axis the pointer moved further, previewing as it goes and
 * committing on release. A keyboard cursor with Enter (boat) and Space (water)
 * does the same one square at a time, and Ctrl/Shift with an arrow fills a line
 * as the cursor moves.
 *
 * Unresolved segments are the interesting part of the model: the player only
 * ever says "there is *something* here", and `adjustShips` turns that into the
 * right shape — end cap, centre or single — as soon as the neighbours decide it.
 *
 * Layout: [`state.ts`](./state.ts) (params, cell model, codecs, moves/ui),
 * [`validate.ts`](./validate.ts) (the shared status passes),
 * [`solver.ts`](./solver.ts) (the four deduction tiers + `findMistakes`),
 * [`generator.ts`](./generator.ts) (solver-gated generation + `validateParams`),
 * [`render.ts`](./render.ts).
 */

import type {
  Colour,
  ConfigValues,
  GameStatus,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import {
  type Game,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newBoatsDesc, validateParams } from "./generator.ts";
import {
  type BoatsDrawState,
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { type BoatsMistake, findBoatsMistakes, solveToGrid } from "./solver.ts";
import {
  type BoatsFill,
  type BoatsFillFrom,
  type BoatsMove,
  type BoatsParams,
  type BoatsState,
  type BoatsUi,
  cloneState,
  DIFF_NAMES,
  decodeFleet,
  decodeParams,
  defaultFleet,
  defaultParams,
  EMPTY,
  encodeFleet,
  encodeParams,
  fillChangesAnything,
  fillOf,
  newState,
  newUi,
  PRESETS,
  presetParams,
  presetTitle,
  SHIP_VAGUE,
  STATUS_COMPLETE,
  textFormat,
  validateDesc,
  WATER,
} from "./state.ts";
import { adjustShips, validateState } from "./validate.ts";

const BACKSPACE = 8;

function presets(): PresetMenu<BoatsParams> {
  return {
    title: "Boats",
    submenu: PRESETS.map((_, i) => {
      const p = presetParams(i);
      return { title: presetTitle(p), params: p };
    }),
  };
}

// --- input -----------------------------------------------------------------

/** Left-click cycles empty → boat → water → empty. */
function leftCycle(from: BoatsFill): BoatsFill {
  return from === "B" ? "W" : from === "-" ? "B" : "-";
}

function interpretMove(
  state: BoatsState,
  ui: BoatsUi,
  ds: BoatsDrawState | null,
  point: Point,
  rawButton: number,
): BoatsMove | null | UiUpdate {
  const { w, h } = state.params;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const button = stripModifiers(rawButton);

  let gx = fromCoord(point.x, ts);
  let gy = fromCoord(point.y, ts);
  // Players usually want to fill a whole line, so the click target on the far
  // edges reaches into the number row/column (upstream does the same).
  if (gx === w) gx = w - 1;
  if (gy === h) gy = h - 1;

  if (isMouseDown(button)) {
    if (gx >= 0 && gy >= 0 && gx < w && gy < h) {
      let from: BoatsFillFrom = fillOf(state.grid[gy * w + gx]);
      let to: BoatsFill = "-";

      if (button === LEFT_BUTTON) {
        to = leftCycle(from);
        // Clearing to water applies to the whole dragged line regardless of
        // what each square currently holds.
        if (to === "W") from = "*";
      }
      if (button === RIGHT_BUTTON) to = from === "-" ? "W" : "-";
      if (button === MIDDLE_BUTTON) from = "*";

      ui.dragFrom = from;
      ui.dragTo = to;
      ui.dragOk = true;
      ui.dsx = ui.dex = gx;
      ui.dsy = ui.dey = gy;
      ui.cursor = false;
      return UI_UPDATE;
    }
  }

  if ((isMouseDrag(button) || isMouseRelease(button)) && ui.dragTo !== "") {
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) {
      ui.dragOk = false;
    } else {
      // A drag is limited to one row or column: whichever coordinate has moved
      // less snaps back to the drag's start.
      if (Math.abs(gx - ui.dsx) < Math.abs(gy - ui.dsy)) gx = ui.dsx;
      else gy = ui.dsy;

      ui.dex = gx;
      ui.dey = gy;
      ui.dragOk = true;
    }

    if (isMouseRelease(button) && ui.dragOk) {
      const from = ui.dragFrom as BoatsFillFrom;
      const to = ui.dragTo as BoatsFill;
      const x0 = Math.min(ui.dsx, ui.dex);
      const x1 = Math.max(ui.dsx, ui.dex);
      const y0 = Math.min(ui.dsy, ui.dey);
      const y1 = Math.max(ui.dsy, ui.dey);
      ui.dragOk = false;

      if (fillChangesAnything(state, x0, y0, x1, y1, from, to))
        return { kind: "fill", x0, y0, x1, y1, from, to };
    }
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    const fromX = ui.cx;
    const fromY = ui.cy;
    const moved = gridCursorMove(button, ui.cx, ui.cy, w, h);
    if (moved) {
      ui.cx = moved.x;
      ui.cy = moved.y;
    }
    ui.cursor = true;

    // Hold Ctrl (boats), Shift (water) or both (clear) to fill as you move.
    if (rawButton & (MOD_CTRL | MOD_SHFT)) {
      const to: BoatsFill =
        rawButton & MOD_CTRL ? (rawButton & MOD_SHFT ? "-" : "B") : "W";
      const from: BoatsFillFrom = to === "-" ? "*" : "-";
      const x0 = Math.min(fromX, ui.cx);
      const x1 = Math.max(fromX, ui.cx);
      const y0 = Math.min(fromY, ui.cy);
      const y1 = Math.max(fromY, ui.cy);

      if (fillChangesAnything(state, x0, y0, x1, y1, from, to))
        return { kind: "fill", x0, y0, x1, y1, from, to };
    }

    return UI_UPDATE;
  }

  if (
    ui.cursor &&
    (button === CURSOR_SELECT || button === CURSOR_SELECT2 || button === BACKSPACE)
  ) {
    const x = ui.cx;
    const y = ui.cy;
    const from = fillOf(state.grid[y * w + x]);
    let to: BoatsFill = "-";
    if (button === CURSOR_SELECT && from === "-") to = "B";
    if (button === CURSOR_SELECT2 && from === "-") to = "W";

    if (fillChangesAnything(state, x, y, x, y, from, to))
      return { kind: "fill", x0: x, y0: y, x1: x, y1: y, from, to };
  }

  return null;
}

// --- moves -----------------------------------------------------------------

function executeMove(state: BoatsState, move: BoatsMove): BoatsState {
  const { w } = state.params;
  const next = cloneState(state);

  if (move.kind === "fill") {
    for (let x = move.x0; x <= move.x1; x++) {
      for (let y = move.y0; y <= move.y1; y++) {
        const i = y * w + x;
        if (state.gridClues[i] !== EMPTY) continue; // a given square is fixed
        if (move.from !== "*" && fillOf(next.grid[i]) !== move.from) continue;
        next.grid[i] = move.to === "B" ? SHIP_VAGUE : move.to === "W" ? WATER : EMPTY;
      }
    }
  } else {
    if (move.grid.length !== w * state.params.h)
      throw new Error("boats: solve move has the wrong grid size");
    next.grid.set(move.grid);
  }

  // Resolve every segment's shape from its neighbours, then see whether that
  // finished the puzzle.
  const board = {
    w,
    h: state.params.h,
    fleet: state.params.fleet,
    fleetData: state.params.fleetData,
    gridClues: next.gridClues,
    borderClues: next.borderClues,
    grid: next.grid,
  };
  adjustShips(board);
  const completed = validateState(board) === STATUS_COMPLETE;

  return {
    ...next,
    completed,
    // A solve that did not actually finish the grid is not cheating.
    cheated: move.kind === "solve" ? completed : next.cheated,
  };
}

function solve(orig: BoatsState): SolveResult<BoatsMove> {
  const result = solveToGrid(orig.params, orig.gridClues, orig.borderClues);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, move: { kind: "solve", grid: Array.from(result.grid) } };
}

function status(s: BoatsState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

function flashLength(from: BoatsState, to: BoatsState): number {
  return !from.completed && to.completed && !from.cheated && !to.cheated
    ? FLASH_TIME
    : 0;
}

// --- params UI -------------------------------------------------------------

/** The fleet configuration as the Custom dialog and the type-menu summary show
 * it: blank when it is the default pyramid for this fleet size, exactly as
 * upstream's `game_configure` does. */
function fleetConfigString(p: BoatsParams): string {
  const def = defaultFleet(p.fleet);
  const same =
    def.length === p.fleetData.length && def.every((n, i) => n === p.fleetData[i]);
  return same ? "" : encodeFleet(p.fleetData, p.fleet);
}

export const boatsGame: Game<
  BoatsParams,
  BoatsState,
  BoatsMove,
  BoatsUi,
  BoatsDrawState,
  BoatsMistake
> = {
  id: "boats",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  // Param-dependent: the text grid gives each row one character per column and
  // one for its number, which only works up to 10×10 (upstream
  // `game_can_format_as_text_now`). `textFormat` returns undefined past that.
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    "fleet-size": String(p.fleet),
    difficulty: p.diff,
    "remove-numbers": p.strip ? 1 : 0,
    "fleet-configuration": fleetConfigString(p),
  }),

  paramConfig: [
    ...dimensionParamConfig<BoatsParams>(),
    {
      kw: "fleet-size",
      name: "Fleet size",
      type: "string",
      get: (p) => String(p.fleet),
      set: (p, v) => {
        p.fleet = parseConfigInt(v);
        // Upstream `custom_params` re-reads the fleet list against the new
        // size, so growing the fleet size extends the default pyramid.
        p.fleetData = defaultFleet(p.fleet);
      },
    },
    {
      kw: "fleet-configuration",
      name: "Fleet configuration",
      type: "string",
      get: fleetConfigString,
      set: (p, v) => {
        p.fleetData = v === "" ? defaultFleet(p.fleet) : decodeFleet(v, p.fleet);
      },
    },
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
    {
      kw: "remove-numbers",
      name: "Remove numbers",
      type: "boolean",
      get: (p) => p.strip,
      set: (p, v) => {
        p.strip = v;
      },
    },
  ],

  newDesc: (p, rng) => newBoatsDesc(p, rng),
  validateDesc,
  newState,
  newUi: () => newUi(),

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes: findBoatsMistakes,
  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: BoatsParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(boatsGame);
