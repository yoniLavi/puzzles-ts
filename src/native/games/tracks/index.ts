/**
 * Tracks (Train Tracks) — native TS port of `tracks.c`. Lay one continuous
 * train track from the entrance (A, left edge) to the exit (B, bottom edge)
 * of a `w × h` grid, using only straight and curved rails that never cross or
 * loop, so every row/column clue counts the track-bearing cells in it.
 *
 * Left-drag lays track along a straight run; right-drag lays "no track". A
 * click near a cell centre toggles the square; near an edge toggles that
 * edge. A half-grid keyboard cursor toggles squares (centre) and edges
 * (borders); select2 does the no-track variant.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { Game, SolveResult, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MIDDLE_DRAG,
  MIDDLE_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
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
  colours,
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
    curx: 1,
    cury: 1,
    cursorActive: false,
  };
}

const isMouseDown = (b: number) =>
  b === LEFT_BUTTON || b === MIDDLE_BUTTON || b === RIGHT_BUTTON;
const isMouseDrag = (b: number) =>
  b === LEFT_DRAG || b === MIDDLE_DRAG || b === RIGHT_DRAG;
const isMouseRelease = (b: number) =>
  b === LEFT_RELEASE || b === MIDDLE_RELEASE || b === RIGHT_RELEASE;

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
  ds: TracksDrawState | null,
  p: Point,
  rawButton: number,
): TracksMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;
  const m = metrics(ds?.tileSize ?? PREFERRED_TILE_SIZE);
  const fromCoord = (px: number) =>
    px < m.border ? -1 : Math.floor((px - m.border) / m.tile) - 1;
  const board = stateToBoard(state);
  const gx = fromCoord(p.x);
  const gy = fromCoord(p.y);

  if (isMouseDown(button)) {
    ui.cursorActive = false;
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
    ui.cursorActive = false;
    updateUiDrag(state, ui, gx, gy);
    return UI_UPDATE;
  }

  if (isMouseRelease(button)) {
    ui.cursorActive = false;
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
    const dx = button === 0x020b ? -1 : button === 0x020c ? 1 : 0; // CURSOR_LEFT/RIGHT
    const dy = button === 0x020a ? 1 : button === 0x0209 ? -1 : 0; // CURSOR_DOWN/UP
    if (!ui.cursorActive) {
      ui.cursorActive = true;
      return UI_UPDATE;
    }
    ui.curx += dx;
    ui.cury += dy;
    if (ui.curx % 2 === 0 && ui.cury % 2 === 0) {
      // Skip square corners: only centres and edges are selectable.
      ui.curx += dx;
      ui.cury += dy;
    }
    ui.curx = Math.min(Math.max(ui.curx, 1), 2 * w - 1);
    ui.cury = Math.min(Math.max(ui.cury, 1), 2 * h - 1);
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.cursorActive) {
      ui.cursorActive = true;
      return UI_UPDATE;
    }
    if (ui.curx % 2 === 0 && ui.cury % 2 === 0) return UI_UPDATE; // corner
    const cgx = Math.floor(ui.curx / 2);
    const cgy = Math.floor(ui.cury / 2);
    const direction = ui.curx % 2 === 0 ? L : ui.cury % 2 === 0 ? U : 0;
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
  return !oldState.completed && newState_.completed && !newState_.usedSolve
    ? FLASH_TIME
    : 0;
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
  findMistakes,

  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
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
