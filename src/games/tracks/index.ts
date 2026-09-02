/**
 * Tracks (Train Tracks) — native TS port of `tracks.c`. Lay one continuous
 * train track from the entrance (A, left edge) to the exit (B, bottom edge)
 * of a `w × h` grid, using only straight and curved rails that never cross or
 * loop, so every row/column clue counts the track-bearing cells in it.
 *
 * Left-drag lays track along a straight run; right-drag lays "no track". A
 * click near a cell center toggles the square; near an edge toggles that
 * edge. A half-grid keyboard cursor toggles squares (center) and edges
 * (borders); select2 does the no-track variant.
 */

import type { DifficultyContract } from "../../engine/difficulty.ts";
import { winFlash } from "../../engine/flash.ts";
import type { Game, SolveResult, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  isCursorMove,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  newCursor,
  RIGHT_BUTTON,
  RIGHT_RELEASE,
  showCursor,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Color, Point, Size } from "../../engine/types.ts";
import { newDesc } from "./generator.ts";
import {
  copyAndApplyDrag,
  executeMove,
  moveDiff,
  uiCanFlipEdge,
  uiCanFlipSquare,
} from "./moves.ts";
import {
  centeredCoord,
  colors,
  computeSize,
  FLASH_TIME,
  metrics,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type TracksDrawState,
} from "./render.ts";
import { copyAndStrip, tracksSolve } from "./solver.ts";
import {
  D,
  DIFF_COUNT,
  DIFF_NAMES,
  decodeParams,
  defaultParams,
  E_NOTRACK,
  E_TRACK,
  encodeParams,
  inGrid,
  L,
  newState,
  presets,
  R,
  S_NOTRACK,
  S_TRACK,
  sEDirs,
  sEFlags,
  stateToBoard,
  status,
  type TracksMistake,
  type TracksMove,
  type TracksParams,
  type TracksState,
  type TracksUi,
  textFormat,
  U,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: TracksState): TracksUi {
  return {
    dragging: false,
    clearing: false,
    notrack: false,
    dragSx: -1,
    dragSy: -1,
    dragEx: -1,
    dragEy: -1,
    clickx: 0,
    clicky: 0,
    cursor: newCursor(1, 1),
  };
}

/** A single square-flip move (upstream `square_flip_str` — a toggle). */
function squareFlipMove(
  b: ReturnType<typeof stateToBoard>,
  x: number,
  y: number,
  notrack: boolean,
): TracksMove {
  const sf = b.sflags[y * b.w + x];
  const set = notrack ? !(sf & S_NOTRACK) : !(sf & S_TRACK);
  return { ops: [{ kind: "square", x, y, track: !notrack, set }] };
}

/** A single edge-flip move (upstream `edge_flip_str` — a toggle). */
function edgeFlipMove(
  b: ReturnType<typeof stateToBoard>,
  x: number,
  y: number,
  dir: number,
  notrack: boolean,
): TracksMove {
  const ef = sEFlags(b, x, y, dir);
  const set = notrack ? !(ef & E_NOTRACK) : !(ef & E_TRACK);
  return { ops: [{ kind: "edge", x, y, dir, track: !notrack, set }] };
}

/** Constrain an in-progress drag to a single straight row or column
 * (upstream `update_ui_drag`).
 *
 * Deliberate divergence from upstream (owner-requested 2026-07-15): when the
 * pointer drifts to neither the start row nor the start column — the common
 * touch case of wandering off the grid mid-drag — upstream *reset* the paint
 * to the start cell and dropped `dragging`, throwing the whole gesture away.
 * We instead **keep the last valid extent frozen**, so a stray excursion out
 * of bounds no longer invalidates the paint; the drag resumes when the finger
 * returns to the start row/column, and the only way to cancel is to drag back
 * to the start cell (or paint and undo). */
function updateUiDrag(state: TracksState, ui: TracksUi, gx: number, gy: number): void {
  const { w, h } = state;
  const dx = Math.abs(ui.dragSx - gx);
  const dy = Math.abs(ui.dragSy - gy);
  if (dy === 0) {
    ui.dragEx = gx < 0 ? 0 : gx >= w ? w - 1 : gx;
    ui.dragEy = ui.dragSy;
    ui.dragging = true;
  } else if (dx === 0) {
    ui.dragEx = ui.dragSx;
    ui.dragEy = gy < 0 ? 0 : gy >= h ? h - 1 : gy;
    ui.dragging = true;
  }
  // else: off-axis / out-of-bounds drift — keep dragEx/dragEy/dragging as they
  // were, freezing the paint at its last valid extent.
}

function interpretMove(
  state: TracksState,
  ui: TracksUi,
  ds: TracksDrawState,
  p: Point,
  rawButton: number,
): TracksMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;
  const m = metrics(ds.tileSize);
  const fromCoord = (px: number) =>
    px < m.border ? -1 : Math.floor((px - m.border) / m.tile) - 1;
  const board = stateToBoard(state);
  const gx = fromCoord(p.x);
  const gy = fromCoord(p.y);

  if (isMouseDown(button)) {
    ui.cursor.visible = false;
    ui.dragging = false;
    if (!inGrid(state, gx, gy)) {
      ui.dragSx = ui.dragSy = -1;
      return null;
    }
    if (button === RIGHT_BUTTON) {
      ui.notrack = true;
      ui.clearing = (state.sflags[gy * w + gx] & S_NOTRACK) !== 0;
    } else {
      ui.notrack = false;
      ui.clearing = (state.sflags[gy * w + gx] & S_TRACK) !== 0;
    }
    ui.clickx = p.x;
    ui.clicky = p.y;
    ui.dragSx = ui.dragEx = gx;
    ui.dragSy = ui.dragEy = gy;
    return UI_UPDATE;
  }

  if (isMouseDrag(button)) {
    ui.cursor.visible = false;
    updateUiDrag(state, ui, gx, gy);
    return UI_UPDATE;
  }

  if (isMouseRelease(button)) {
    ui.cursor.visible = false;
    if (ui.dragging && (ui.dragSx !== ui.dragEx || ui.dragSy !== ui.dragEy)) {
      const dragged = copyAndApplyDrag(board, ui);
      const move = moveDiff(board, dragged, false);
      ui.dragging = false;
      return move.ops.length > 0 ? move : null;
    }
    ui.dragging = false;
    const px = ui.clickx;
    const py = ui.clicky;
    const cx = centeredCoord(gx, m);
    const cy = centeredCoord(gy, m);
    if (!inGrid(state, gx, gy) || fromCoord(px) !== gx || fromCoord(py) !== gy) {
      return UI_UPDATE;
    }
    const notrack = button === RIGHT_RELEASE;
    if (Math.max(Math.abs(px - cx), Math.abs(py - cy)) < m.tile / 4) {
      if (uiCanFlipSquare(board, gx, gy, notrack))
        return squareFlipMove(board, gx, gy, notrack);
      return UI_UPDATE;
    }
    const direction =
      Math.abs(px - cx) < Math.abs(py - cy) ? (py < cy ? U : D) : px < cx ? L : R;
    if (uiCanFlipEdge(board, gx, gy, direction, notrack)) {
      return edgeFlipMove(board, gx, gy, direction, notrack);
    }
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    const dx = button === CURSOR_LEFT ? -1 : button === CURSOR_RIGHT ? 1 : 0;
    const dy = button === CURSOR_DOWN ? 1 : button === CURSOR_UP ? -1 : 0;
    // Reveal *and* move in one press, as every other game does. The traversal
    // itself stays Tracks': half-grid coordinates, skipping square corners.
    showCursor(ui.cursor);
    ui.cursor.x += dx;
    ui.cursor.y += dy;
    if (ui.cursor.x % 2 === 0 && ui.cursor.y % 2 === 0) {
      // Skip square corners: only centers and edges are selectable.
      ui.cursor.x += dx;
      ui.cursor.y += dy;
    }
    ui.cursor.x = Math.min(Math.max(ui.cursor.x, 1), 2 * w - 1);
    ui.cursor.y = Math.min(Math.max(ui.cursor.y, 1), 2 * h - 1);
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.cursor.visible) {
      ui.cursor.visible = true;
      return UI_UPDATE;
    }
    if (ui.cursor.x % 2 === 0 && ui.cursor.y % 2 === 0) return UI_UPDATE; // corner
    const cgx = Math.floor(ui.cursor.x / 2);
    const cgy = Math.floor(ui.cursor.y / 2);
    const direction = ui.cursor.x % 2 === 0 ? L : ui.cursor.y % 2 === 0 ? U : 0;
    const notrack = button === CURSOR_SELECT2;
    if (direction && uiCanFlipEdge(board, cgx, cgy, direction, notrack)) {
      return edgeFlipMove(board, cgx, cgy, direction, notrack);
    }
    if (!direction && uiCanFlipSquare(board, cgx, cgy, notrack)) {
      return squareFlipMove(board, cgx, cgy, notrack);
    }
    return UI_UPDATE;
  }

  return null;
}

function flashLength(
  oldState: TracksState,
  newState_: TracksState,
  _dir: number,
  _ui: TracksUi,
): number {
  return winFlash(oldState, newState_, FLASH_TIME);
}

function solve(
  orig: TracksState,
  curr: TracksState,
  _aux?: string,
): SolveResult<TracksMove> {
  const before = stateToBoard(curr);
  let solved = stateToBoard(curr);
  let r = tracksSolve(solved, DIFF_COUNT);
  if (r.ret < 1) {
    solved = stateToBoard(orig);
    r = tracksSolve(solved, DIFF_COUNT);
  }
  if (r.ret < 1)
    return { ok: false, error: "Unable to find a solution for this puzzle" };
  return { ok: true, move: moveDiff(before, solved, true) };
}

/** Boards are uniquely solvable: re-solve from the clues and flag every
 * player mark (square or edge) that contradicts the unique solution. A
 * non-uniquely-solvable board degrades to "no detectable mistakes". */
function findMistakes(state: TracksState): readonly TracksMistake[] {
  const { w, h } = state;
  const board = stateToBoard(state);
  const strip = copyAndStrip(board, -1);
  if (tracksSolve(strip, DIFF_COUNT).ret < 1) return [];
  const out: TracksMistake[] = [];
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    const solTrack = (strip.sflags[i] & S_TRACK) !== 0;
    let wrong = false;
    if (state.sflags[i] & S_TRACK && !solTrack) wrong = true;
    if (state.sflags[i] & S_NOTRACK && solTrack) wrong = true;
    const playerTrack = sEDirs(board, x, y, E_TRACK);
    const playerNotrack = sEDirs(board, x, y, E_NOTRACK);
    const solTrackEdges = sEDirs(strip, x, y, E_TRACK);
    if (playerTrack & ~solTrackEdges) wrong = true; // a track edge that shouldn't be
    if (playerNotrack & solTrackEdges) wrong = true; // a no-track edge that should be track
    if (wrong) out.push({ x, y });
  }
  return out;
}

/** Tracks' difficulty contract (`engine/difficulty.ts`). `tracksSolve` returns
 * `{ ret, maxDiff }` with `ret` −1 impossible, 0 non-converged, 1 uniquely
 * solved; `stateToBoard` on the initial state gives the clue-only board. */
const difficulty: DifficultyContract<TracksParams> = {
  tiers: DIFF_NAMES,
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const { ret } = tracksSolve(stateToBoard(newState(p, desc)), cap);
    return ret === 1 ? "solved" : ret < 0 ? "impossible" : "unsolved";
  },
};

export const tracksGame: Game<
  TracksParams,
  TracksState,
  TracksMove,
  TracksUi,
  TracksDrawState,
  TracksMistake
> = {
  id: "tracks",
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
    ...dimensionParamConfig<TracksParams>(),
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
      kw: "disallow-consecutive-1-clues",
      name: "Disallow consecutive 1 clues",
      type: "boolean",
      get: (p) => p.singleOnes,
      set: (p, v) => {
        p.singleOnes = v;
      },
    },
  ],
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.diff,
    "disallow-consecutive-1-clues": p.singleOnes,
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  difficulty,
  findMistakes,

  textFormat,

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: TracksParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tileSize = ts;
  },
  newDrawState,
  redraw,

  flashLength,
};

registerGame(tracksGame);
