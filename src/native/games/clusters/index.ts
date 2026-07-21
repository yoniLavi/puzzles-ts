/**
 * Clusters — native TS port of `puzzles/unreleased/clusters.c`. Fill the grid
 * with red and blue tiles so that every tile touches at least one same-colour
 * neighbour, and the given "dot" tiles touch exactly one. Left-click/-drag
 * paints blue (cycling to red, then clear); right-click/-drag paints red; a
 * keyboard cursor places colours with Enter/Space/0/1/2/backspace. Rule
 * violations are shown live (upstream behaviour), and Check & Save additionally
 * refuses to save while any violation stands (`findMistakes`).
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import {
  type Game,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { fromCoord } from "../../engine/geometry.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newClustersDesc } from "./generator.ts";
import {
  border,
  type ClustersDrawState,
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { COMPLETE, clustersStatus, findErrors, INVALID, solveGame } from "./solver.ts";
import {
  type ClustersFill,
  type ClustersMove,
  type ClustersParams,
  type ClustersState,
  type ClustersUi,
  COLMASK,
  cloneState,
  decodeParams,
  defaultParams,
  encodeParams,
  F_COLOR_0,
  F_COLOR_1,
  F_SINGLE,
  newState,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A cell that breaks a rule in the current state (the local rule checker,
 * design D5 — identical to what the board draws live in red). */
export interface ClustersMistake {
  index: number;
}

function newUi(_state: ClustersState): ClustersUi {
  return { cx: 0, cy: 0, cursor: false, dragType: -1, drag: [] };
}

/** The `paint` letter → fill mapping (upstream 'A'=red, 'B'=blue, 'C'=clear),
 * expressed directly as the {@link ClustersFill} byte. */
function fillFromDragType(dragType: number): ClustersFill {
  return dragType & F_COLOR_0 ? F_COLOR_0 : dragType & F_COLOR_1 ? F_COLOR_1 : 0;
}

function interpretMove(
  state: ClustersState,
  ui: ClustersUi,
  ds: ClustersDrawState | null,
  p: Point,
  rawButton: number,
): ClustersMove | null | UiUpdate {
  const { w, h, grid } = state;
  const shift = (rawButton & MOD_SHFT) !== 0;
  const control = (rawButton & MOD_CTRL) !== 0;
  const button = stripModifiers(rawButton);
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const b = border(ts);

  let hx = ui.cx;
  let hy = ui.cy;

  if (isMouseDown(button)) {
    ui.dragType = -1;
    ui.drag = [];
  }

  if (isMouseDown(button) || isMouseDrag(button)) {
    const gx = fromCoord(p.x, ts, b);
    const gy = fromCoord(p.y, ts, b);
    if (p.x >= b && gx < w && p.y >= b && gy < h) {
      hx = gx;
      hy = gy;
      ui.cursor = false;
    } else {
      return null;
    }
  }

  // --- keyboard cursor movement (paints with Shift/Ctrl held) ---
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
      // Shift = red ('A'), Ctrl = blue ('B'), Shift+Ctrl = clear ('C').
      const fill: ClustersFill = shift && control ? 0 : control ? F_COLOR_1 : F_COLOR_0;
      const i1 = oy * w + ox;
      const i2 = ui.cy * w + ui.cx;
      // Skip a given, and any cell already in the target state (no-op).
      const inert = (i: number): boolean =>
        !!(grid[i] & F_SINGLE) ||
        (fill === F_COLOR_0 && !!(grid[i] & F_COLOR_0)) ||
        (fill === F_COLOR_1 && !!(grid[i] & F_COLOR_1)) ||
        (fill === 0 && grid[i] === 0);
      const cells: { index: number; fill: ClustersFill }[] = [];
      if (!inert(i1)) cells.push({ index: i1, fill });
      if (i1 !== i2 && !inert(i2)) cells.push({ index: i2, fill });
      if (cells.length > 0) return { kind: "paint", cells };
    }
    return UI_UPDATE;
  }

  // --- mouse press: pick a drag colour by cycling the pressed cell ---
  if (isMouseDown(button)) {
    const i = hy * w + hx;
    const old = grid[i];
    if (button === LEFT_BUTTON) {
      ui.dragType = old === 0 ? F_COLOR_1 : old & F_COLOR_1 ? F_COLOR_0 : 0;
    } else if (button === RIGHT_BUTTON) {
      ui.dragType = old === 0 ? F_COLOR_0 : old & F_COLOR_0 ? F_COLOR_1 : 0;
    } else {
      ui.dragType = 0;
    }
    ui.drag = [];
    if (ui.dragType || old) ui.drag.push(i);
    return UI_UPDATE;
  }

  // --- mouse drag: accrete cells onto the drag set ---
  if (isMouseDrag(button) && ui.dragType !== -1) {
    const i = hy * w + hx;
    if (grid[i] === 0 && ui.dragType === 0) return null;
    if (grid[i] & ui.dragType) return null;
    if (ui.drag.includes(i)) return null;
    ui.drag.push(i);
    return UI_UPDATE;
  }

  // --- mouse release: commit the drag as one paint move ---
  if (isMouseRelease(button) && ui.drag.length > 0) {
    const fill = fillFromDragType(ui.dragType);
    const cells = ui.drag
      .filter((i) => !(grid[i] & F_SINGLE)) // never overwrite a given
      .map((index) => ({ index, fill }));
    ui.drag = [];
    if (cells.length > 0) return { kind: "paint", cells };
    return UI_UPDATE;
  }

  // --- keyboard place-one at the cursor ---
  if (
    ui.cursor &&
    (button === CURSOR_SELECT ||
      button === CURSOR_SELECT2 ||
      button === 8 /* backspace */ ||
      button === 48 /* '0' */ ||
      button === 49 /* '1' */ ||
      button === 50) /* '2' */
  ) {
    const i = hy * w + hx;
    if (grid[i] & F_SINGLE) return null; // given
    const old = grid[i];
    let fill: ClustersFill;
    if (button === 48 || button === 50)
      fill = F_COLOR_0; // '0'/'2' → red
    else if (button === 49)
      fill = F_COLOR_1; // '1' → blue
    else if (button === CURSOR_SELECT2)
      fill = old === 0 ? F_COLOR_0 : old & F_COLOR_0 ? F_COLOR_1 : 0; // cycle red→blue→clear
    else if (button === CURSOR_SELECT)
      fill = old === 0 ? F_COLOR_1 : old & F_COLOR_1 ? F_COLOR_0 : 0; // cycle blue→red→clear
    else fill = 0; // backspace → clear

    // No-op guard (upstream "don't put no-ops on the undo chain").
    if (
      (old & F_COLOR_0 && fill === F_COLOR_0) ||
      (old & F_COLOR_1 && fill === F_COLOR_1) ||
      (old === 0 && fill === 0)
    ) {
      return null;
    }
    return { kind: "paint", cells: [{ index: i, fill }] };
  }

  return null;
}

function executeMove(state: ClustersState, move: ClustersMove): ClustersState {
  const next = cloneState(state);
  const { grid } = next;
  if (move.kind === "solve") {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] & F_SINGLE) continue; // keep givens
      grid[i] = move.fills[i];
    }
    next.cheated = true;
  } else {
    for (const { index, fill } of move.cells) {
      if (grid[index] & F_SINGLE) continue; // never overwrite a given
      grid[index] = fill;
    }
  }
  if (clustersStatus(grid, next.w, next.h) === COMPLETE) next.completed = true;
  return next;
}

function solve(orig: ClustersState): SolveResult<ClustersMove> {
  const grid = orig.grid.slice();
  solveGame(grid, orig.w, orig.h, 1);
  if (clustersStatus(grid, orig.w, orig.h) === INVALID) {
    return { ok: false, error: "Puzzle is invalid." };
  }
  const fills: ClustersFill[] = Array.from(
    grid,
    (byte) => (byte & COLMASK) as ClustersFill,
  );
  return { ok: true, move: { kind: "solve", fills } };
}

function findMistakes(state: ClustersState): readonly ClustersMistake[] {
  return findErrors(state.grid, state.w, state.h).map((index) => ({ index }));
}

function flashLength(
  from: ClustersState,
  to: ClustersState,
  _dir: number,
  _ui: ClustersUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

export const clustersGame: Game<
  ClustersParams,
  ClustersState,
  ClustersMove,
  ClustersUi,
  ClustersDrawState,
  ClustersMistake
> = {
  id: "clusters",
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

  newDesc: (p: ClustersParams, rng: RandomState) => newClustersDesc(p, rng),
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
  computeSize: (p: ClustersParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(clustersGame);
