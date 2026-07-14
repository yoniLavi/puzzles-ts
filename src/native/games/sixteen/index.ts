import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import { drawRecessedBorder as drawBevel } from "../../engine/draw.ts";
import type {
  Game,
  GameDrawing,
  HintResult,
  HintStep,
  HintTrackVerdict,
  UiUpdate,
} from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { coord as coordE, fromCoord as fromCoordE } from "../../engine/geometry.ts";
import { HINT_SETTING_UP, workingOn } from "../../engine/hint-vocab.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MOD_CTRL,
  MOD_MASK,
  MOD_NUM_KEYPAD,
  MOD_SHFT,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import { registerGame } from "../../engine/registry.ts";
import {
  planSlides,
  type SlideMove,
  slidePieces,
  toroidalDist,
} from "../../engine/slide-planner.ts";
import {
  CursorMode,
  decodeParams,
  defaultParams,
  encodeParams,
  newDesc,
  newState,
  presets,
  type SixteenMove,
  type SixteenParams,
  type SixteenState,
  type SixteenUi,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- constants --------------------------------------------------------

const PREFERRED_TILE_SIZE = 48;
const ANIM_TIME = 0.4;
const FLASH_FRAME = 0.13;
const HIGHLIGHT_WIDTH_DIV = 20;

// --- colour indices ---------------------------------------------------

const COL_BACKGROUND = 0;
const COL_TEXT = 1;
const COL_HIGHLIGHT = 2;
const COL_LOWLIGHT = 3;
const COL_HINT = 4;

// --- hint highlights --------------------------------------------------

/** Highlight data for a Sixteen hint step: which tile to move and
 * where it should go. The renderer highlights the tile's current cell
 * and its target cell so the player can figure out the right slides. */
export interface SixteenHintHighlights {
  /** The tile number being moved closer to its target. */
  tile: number;
  /** The position (flat index) where this tile should end up. */
  targetPos: number;
  /** Where the *next* plan step takes this tile when it continues the
   * same journey perpendicular to this one (two-leg preview). */
  ultimatePos?: number;
}

// --- move logic -------------------------------------------------------

export function executeMove(state: SixteenState, move: SixteenMove): SixteenState {
  if (move.type === "solve") {
    const tiles = new Int32Array(state.n);
    for (let i = 0; i < state.n; i++) tiles[i] = i + 1;
    return {
      ...state,
      tiles,
      usedSolve: true,
      completed: state.moveCount + 1,
      moveCount: state.moveCount + 1,
    };
  }

  const { axis, index, delta } = move;
  const tiles = new Int32Array(state.tiles);

  if (axis === "row") {
    for (let x = 0; x < state.w; x++) {
      const srcX = (((x - delta) % state.w) + state.w) % state.w;
      tiles[index * state.w + x] = state.tiles[index * state.w + srcX];
    }
  } else {
    for (let y = 0; y < state.h; y++) {
      const srcY = (((y - delta) % state.h) + state.h) % state.h;
      tiles[y * state.w + index] = state.tiles[srcY * state.w + index];
    }
  }

  const moveCount = state.moveCount + 1;
  let completed = state.completed;
  if (!completed) {
    let done = true;
    for (let i = 0; i < state.n; i++) {
      if (tiles[i] !== i + 1) {
        done = false;
        break;
      }
    }
    if (done) completed = moveCount;
  }

  return {
    ...state,
    tiles,
    moveCount,
    completed,
    lastMovementSense: axis === "row" ? delta : 0 + (axis === "column" ? delta : 0),
    lastMove: move,
  };
}

// --- UI ---------------------------------------------------------------

function newUi(_state: SixteenState): SixteenUi {
  return {
    curX: 0,
    curY: 0,
    curVisible: false,
    curMode: CursorMode.Unlocked,
  };
}

function interpretMove(
  state: SixteenState,
  ui: SixteenUi,
  ds: SixteenDrawState | null,
  p: Point,
  button: number,
): SixteenMove | null | UiUpdate {
  const shift = !!(button & MOD_SHFT);
  const control = !!(button & MOD_CTRL);
  const pad = button & MOD_NUM_KEYPAD;
  const rawButton = button & ~MOD_MASK;

  // Cursor movement.
  if (isCursorMove(rawButton) || pad) {
    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }

    if (control || shift || ui.curMode !== CursorMode.Unlocked) {
      if (ui.curX < 0 || ui.curX >= state.w || ui.curY < 0 || ui.curY >= state.h)
        return null;

      const { x: nx, y: ny } = gridCursorMove(
        rawButton | pad,
        ui.curX,
        ui.curY,
        state.w,
        state.h,
        false,
      ) ?? { x: ui.curX, y: ui.curY };
      const { x: nwx, y: nwy } = gridCursorMove(
        rawButton | pad,
        ui.curX,
        ui.curY,
        state.w,
        state.h,
        true,
      ) ?? { x: ui.curX, y: ui.curY };

      let move: SixteenMove;
      if (nx !== nwx) {
        move = {
          type: "slide",
          axis: "row",
          index: ui.curY,
          delta: nx > ui.curX ? 1 : -1,
        };
      } else if (ny !== nwy) {
        move = {
          type: "slide",
          axis: "column",
          index: ui.curX,
          delta: ny > ui.curY ? 1 : -1,
        };
      } else if (nx === ui.curX) {
        move = { type: "slide", axis: "column", index: ui.curX, delta: ny - ui.curY };
      } else {
        move = { type: "slide", axis: "row", index: ui.curY, delta: nx - ui.curX };
      }

      if (control || (!shift && ui.curMode === CursorMode.LockTile)) {
        ui.curX = nwx;
        ui.curY = nwy;
      }

      return move;
    } else {
      const { x: nx, y: ny } = gridCursorMove(
        rawButton | pad,
        ui.curX + 1,
        ui.curY + 1,
        state.w + 2,
        state.h + 2,
        false,
      ) ?? { x: ui.curX + 1, y: ui.curY + 1 };

      if (nx === 0 && ny === 0) {
        const t = ui.curX;
        ui.curX = ui.curY;
        ui.curY = t;
      } else if (nx === 0 && ny === state.h + 1) {
        const t = ui.curX;
        ui.curX = state.h - 1 - ui.curY;
        ui.curY = state.h - 1 - t;
      } else if (nx === state.w + 1 && ny === 0) {
        const t = ui.curX;
        ui.curX = state.w - 1 - ui.curY;
        ui.curY = state.w - 1 - t;
      } else if (nx === state.w + 1 && ny === state.h + 1) {
        const t = ui.curX;
        ui.curX = state.w - state.h + ui.curY;
        ui.curY = state.h - state.w + t;
      } else {
        ui.curX = nx - 1;
        ui.curY = ny - 1;
      }

      ui.curVisible = true;
      return UI_UPDATE;
    }
  }

  if (ui.dragging) {
    if (rawButton === LEFT_DRAG) {
      ui.dragX = p.x;
      ui.dragY = p.y;

      if (!ui.dragAxis) {
        const dx = p.x - (ui.dragStartX ?? p.x);
        const dy = p.y - (ui.dragStartY ?? p.y);
        const threshold = 5; // pixels
        if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
          if (Math.abs(dx) > Math.abs(dy)) {
            ui.dragAxis = "row";
            ui.dragIndex = ui.dragStartCellY;
          } else {
            ui.dragAxis = "column";
            ui.dragIndex = ui.dragStartCellX;
          }
        }
      }
      return UI_UPDATE;
    }

    if (rawButton === LEFT_RELEASE) {
      const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
      const axis = ui.dragAxis;
      const index = ui.dragIndex;
      const startX = ui.dragStartX ?? p.x;
      const startY = ui.dragStartY ?? p.y;

      // Reset drag state
      ui.dragging = false;
      ui.dragStartX = undefined;
      ui.dragStartY = undefined;
      ui.dragX = undefined;
      ui.dragY = undefined;
      ui.dragAxis = undefined;
      ui.dragIndex = undefined;
      ui.dragStartCellX = undefined;
      ui.dragStartCellY = undefined;

      if (axis && index !== undefined && index >= 0) {
        const dist = axis === "row" ? p.x - startX : p.y - startY;
        const delta = Math.round(dist / ts);

        if (delta !== 0) {
          const lim = axis === "row" ? state.w : state.h;
          let normalizedDelta = ((delta % lim) + lim) % lim;
          if (normalizedDelta > lim / 2) {
            normalizedDelta -= lim;
          }
          if (normalizedDelta !== 0) {
            ui.justDragged = true;
            return {
              type: "slide",
              axis,
              index,
              delta: normalizedDelta,
            };
          }
        }
      }
      return UI_UPDATE;
    }
  }

  // Mouse click / cursor select.
  let cx = -1,
    cy = -1;
  if (rawButton === LEFT_BUTTON || rawButton === RIGHT_BUTTON) {
    const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
    cx = fromCoord(p.x, ts);
    cy = fromCoord(p.y, ts);
    ui.curVisible = false;

    if (
      rawButton === LEFT_BUTTON &&
      cx >= 0 &&
      cx < state.w &&
      cy >= 0 &&
      cy < state.h
    ) {
      ui.dragging = true;
      ui.dragStartX = p.x;
      ui.dragStartY = p.y;
      ui.dragX = p.x;
      ui.dragY = p.y;
      ui.dragAxis = null;
      ui.dragIndex = -1;
      ui.dragStartCellX = cx;
      ui.dragStartCellY = cy;
      return UI_UPDATE;
    }
  } else if (rawButton === CURSOR_SELECT || rawButton === CURSOR_SELECT2) {
    if (ui.curVisible) {
      if (
        ui.curX === -1 ||
        ui.curX === state.w ||
        ui.curY === -1 ||
        ui.curY === state.h
      ) {
        cx = ui.curX;
        cy = ui.curY;
      } else {
        const m =
          rawButton === CURSOR_SELECT2 ? CursorMode.LockPosition : CursorMode.LockTile;
        ui.curMode = ui.curMode === m ? CursorMode.Unlocked : m;
        return UI_UPDATE;
      }
    } else {
      ui.curVisible = true;
      return UI_UPDATE;
    }
  } else {
    return null;
  }

  // Determine slide direction from click position.
  let dx = 0,
    dy = 0;
  if (cx === -1 && cy >= 0 && cy < state.h) {
    dx = -1;
    dy = 0;
  } else if (cx === state.w && cy >= 0 && cy < state.h) {
    dx = 1;
    dy = 0;
  } else if (cy === -1 && cx >= 0 && cx < state.w) {
    dy = -1;
    dx = 0;
  } else if (cy === state.h && cx >= 0 && cx < state.w) {
    dy = 1;
    dx = 0;
  } else return UI_UPDATE;

  // Reverse direction for right button / CURSOR_SELECT2.
  if (rawButton === RIGHT_BUTTON || rawButton === CURSOR_SELECT2) {
    dx = -dx;
    dy = -dy;
  }

  if (dx) return { type: "slide", axis: "row", index: cy, delta: dx };
  return { type: "slide", axis: "column", index: cx, delta: dy };
}

// --- coordinate helpers -----------------------------------------------

function coord(pos: number, ts: number): number {
  return coordE(pos, ts, border(ts));
}

function fromCoord(pixel: number, ts: number): number {
  return fromCoordE(pixel, ts, border(ts));
}

function border(ts: number): number {
  return ts;
}

// --- drawing ----------------------------------------------------------

interface SixteenDrawState {
  started: boolean;
  w: number;
  h: number;
  bgcolour: number;
  tiles: Int32Array;
  tilesize: number;
  curX: number;
  curY: number;
  /** Tile number currently highlighted as hint, or null. */
  hintTile: number | null;
  /** Target position currently highlighted as hint, or null. */
  hintTarget: number | null;
  /** Ultimate destination currently highlighted as hint, or null. */
  hintUltimate: number | null;
  /** Arrow currently highlighted as hint, or null. */
  hintArrowX: number | null;
  hintArrowY: number | null;
  dragging?: boolean;
  dragAxis?: "row" | "column" | null;
  dragIndex?: number;
  dragX?: number;
  dragY?: number;
}

function newDrawState(state: SixteenState): SixteenDrawState {
  return {
    started: false,
    w: state.w,
    h: state.h,
    bgcolour: COL_BACKGROUND,
    tiles: new Int32Array(state.n).fill(-1),
    tilesize: 0,
    curX: -1,
    curY: -1,
    hintTile: null,
    hintTarget: null,
    hintUltimate: null,
    hintArrowX: null,
    hintArrowY: null,
  };
}

function computeSize(p: SixteenParams, ts: number): Size {
  const b = border(ts);
  return {
    w: ts * p.w + 2 * b,
    h: ts * p.h + 2 * b,
  };
}

function colours(defaultBackground: Colour): Colour[] {
  const {
    background: bg,
    highlight: hi,
    lowlight: lo,
  } = mkhighlight(defaultBackground);

  const text: Colour = [0, 0, 0];
  // Hint colour: a clear blue for highlighting hint tiles.
  const hint: Colour = [0.3, 0.5, 0.9];
  return [bg, text, hi, lo, hint];
}

function redraw(
  dr: GameDrawing,
  ds: SixteenDrawState | null,
  prev: SixteenState | null,
  state: SixteenState,
  dir: number,
  ui: SixteenUi,
  animTime: number,
  flashTime: number,
  activeHint?: HintStep<SixteenMove, SixteenHintHighlights>,
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const hw = Math.max(1, Math.floor(ts / HIGHLIGHT_WIDTH_DIV));

  let bgcolour = COL_BACKGROUND;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgcolour = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
  }

  if (!ds.started) {
    drawRecessedBorder(dr, state, ts, hw);
    for (let i = 0; i < state.w; i++) {
      drawArrow(dr, ts, coord(i, ts), coord(0, ts), 1, 0, COL_LOWLIGHT);
      drawArrow(dr, ts, coord(i + 1, ts), coord(state.h, ts), -1, 0, COL_LOWLIGHT);
    }
    for (let i = 0; i < state.h; i++) {
      drawArrow(dr, ts, coord(state.w, ts), coord(i, ts), 0, 1, COL_LOWLIGHT);
      drawArrow(dr, ts, coord(0, ts), coord(i + 1, ts), 0, -1, COL_LOWLIGHT);
    }
    ds.started = true;
  }

  // Cursor.
  let curX = -1,
    curY = -1;
  if (ui.curVisible) {
    curX = ui.curX;
    curY = ui.curY;
  }

  // Hint arrow highlight.
  let hintArrowX: number | null = null;
  let hintArrowY: number | null = null;
  if (activeHint?.move && activeHint.move.type === "slide") {
    const m = activeHint.move;
    const hl = activeHint.highlights;
    if (hl) {
      const tilePos = state.tiles.indexOf(hl.tile);
      if (tilePos >= 0) {
        // Deliberately point in-grid toward the target (not the shorter
        // toroidal wrap): the tile then visibly travels toward the target
        // instead of jumping across the board edge, even when that costs
        // an extra move versus the solver's wrapping slide.
        if (m.axis === "row") {
          const curCol = tilePos % state.w;
          const targetCol = hl.targetPos % state.w;
          let d = m.delta;
          if (curCol < targetCol) {
            d = 1; // right
          } else if (curCol > targetCol) {
            d = -1; // left
          }
          hintArrowX = d === -1 ? -1 : state.w;
          hintArrowY = m.index;
        } else {
          const curRow = Math.floor(tilePos / state.w);
          const targetRow = Math.floor(hl.targetPos / state.w);
          let d = m.delta;
          if (curRow < targetRow) {
            d = 1; // down
          } else if (curRow > targetRow) {
            d = -1; // up
          }
          hintArrowX = m.index;
          hintArrowY = d === -1 ? -1 : state.h;
        }
      }
    }
    // Fallback if highlights or tile not found
    if (hintArrowX === null || hintArrowY === null) {
      if (m.axis === "row") {
        hintArrowX = m.delta === -1 ? -1 : state.w;
        hintArrowY = m.index;
      } else {
        hintArrowX = m.index;
        hintArrowY = m.delta === -1 ? -1 : state.h;
      }
    }
  }

  if (hintArrowX !== ds.hintArrowX || hintArrowY !== ds.hintArrowY) {
    // Erase old arrow highlight.
    if (ds.hintArrowX !== null && ds.hintArrowY !== null) {
      const isCur = ds.hintArrowX === curX && ds.hintArrowY === curY;
      const fill = isCur ? COL_HIGHLIGHT : COL_LOWLIGHT;
      drawArrowAt(dr, ts, state.w, state.h, ds.hintArrowX, ds.hintArrowY, fill);
    }
    // Draw new arrow highlight.
    if (hintArrowX !== null && hintArrowY !== null) {
      drawArrowAt(dr, ts, state.w, state.h, hintArrowX, hintArrowY, COL_HINT);
    }
    ds.hintArrowX = hintArrowX;
    ds.hintArrowY = hintArrowY;
  }

  if (curX !== ds.curX || curY !== ds.curY) {
    drawArrowForCursor(dr, ts, ds, curX, curY, true);
    drawArrowForCursor(dr, ts, ds, ds.curX, ds.curY, false);
  }

  // Hint highlights: highlight the tile to move and its target position.
  // Track in drawstate so we can repaint when the hint changes.
  const hl = activeHint?.highlights;
  const hintTile = hl?.tile ?? null;
  const hintTarget = hl?.targetPos ?? null;
  const hintUltimate = hl?.ultimatePos ?? null;
  if (
    hintTile !== ds.hintTile ||
    hintTarget !== ds.hintTarget ||
    hintUltimate !== ds.hintUltimate
  ) {
    // Erase old highlights by repainting those tiles.
    if (ds.hintTile !== null) {
      const oldPos = state.tiles.indexOf(ds.hintTile);
      if (oldPos >= 0)
        drawHintOverlay(dr, ts, hw, state, oldPos, COL_BACKGROUND, false);
    }
    if (ds.hintTarget !== null) {
      drawHintOverlay(dr, ts, hw, state, ds.hintTarget, COL_BACKGROUND, true);
    }
    if (ds.hintUltimate !== null) {
      drawHintOverlay(dr, ts, hw, state, ds.hintUltimate, COL_BACKGROUND, true);
    }
    // Draw new highlights (source fill).
    if (hintTile !== null) {
      const pos = state.tiles.indexOf(hintTile);
      if (pos >= 0) drawHintOverlay(dr, ts, hw, state, pos, COL_HINT, false);
    }
    ds.hintTile = hintTile;
    ds.hintTarget = hintTarget;
    ds.hintUltimate = hintUltimate;
  }

  // Clip to the tile area.
  dr.clip({ x: coord(0, ts), y: coord(0, ts), w: ts * state.w, h: ts * state.h });

  for (let i = 0; i < state.n; i++) {
    let t: number;
    if (prev && prev.tiles[i] !== state.tiles[i]) t = -1;
    else t = state.tiles[i];

    const t0 = t;

    const isDraggedNow = !!(
      ui.dragging &&
      ui.dragAxis &&
      ui.dragIndex !== undefined &&
      ui.dragIndex >= 0 &&
      (ui.dragAxis === "row"
        ? Math.floor(i / state.w) === ui.dragIndex
        : i % state.w === ui.dragIndex)
    );

    const wasDraggedPrev = !!(
      ds.dragging &&
      ds.dragAxis &&
      ds.dragIndex !== undefined &&
      ds.dragIndex >= 0 &&
      (ds.dragAxis === "row"
        ? Math.floor(i / state.w) === ds.dragIndex
        : i % state.w === ds.dragIndex)
    );

    const mustRedraw =
      isDraggedNow ||
      wasDraggedPrev ||
      (isDraggedNow && (ui.dragX !== ds.dragX || ui.dragY !== ds.dragY));

    if (
      mustRedraw ||
      ds.bgcolour !== bgcolour ||
      ds.tiles[i] !== t ||
      ds.tiles[i] === -1 ||
      t === -1 ||
      ((ds.curX !== curX || ds.curY !== curY) &&
        (tileCursor(i, state, ds.curX, ds.curY) || tileCursor(i, state, curX, curY)))
    ) {
      let drawX: number,
        drawY: number,
        drawX2 = -1,
        drawY2 = -1;

      if (t === -1 && prev) {
        // Animating tile.
        let sense: number;
        if (dir >= 0) {
          sense = state.lastMovementSense;
        } else {
          sense = -(prev?.lastMovementSense ?? 0);
        }

        t = state.tiles[i];

        const x1 = coord(i % state.w, ts);
        const y1 = coord(Math.floor(i / state.w), ts);

        // Find where this tile was in the old state.
        let j = 0;
        for (; j < prev.n; j++) {
          if (prev.tiles[j] === state.tiles[i]) break;
        }
        const x0 = coord(j % state.w, ts);
        const y0 = coord(Math.floor(j / state.w), ts);

        let dx = x1 - x0;
        if (dx !== 0 && dx !== ts * sense) {
          dx = dx < 0 ? dx + ts * state.w : dx - ts * state.w;
        }
        let dy = y1 - y0;
        if (dy !== 0 && dy !== ts * sense) {
          dy = dy < 0 ? dy + ts * state.h : dy - ts * state.h;
        }

        let c = animTime / ANIM_TIME;
        c = Math.max(0, Math.min(1, c));

        drawX = x0 + Math.round(c * dx);
        drawY = y0 + Math.round(c * dy);
        drawX2 = x1 - dx + Math.round(c * dx);
        drawY2 = y1 - dy + Math.round(c * dy);
      } else if (isDraggedNow) {
        if (ui.dragAxis === "row") {
          const offset = (ui.dragX ?? 0) - (ui.dragStartX ?? 0);
          const totalSize = state.w * ts;
          let dragOffset = ((offset % totalSize) + totalSize) % totalSize;
          if (dragOffset > totalSize / 2) {
            dragOffset -= totalSize;
          }

          drawX = coord(i % state.w, ts) + dragOffset;
          drawY = coord(Math.floor(i / state.w), ts);

          const minCoord = coord(0, ts);
          const maxCoord = minCoord + totalSize;
          if (drawX < minCoord) {
            drawX2 = drawX + totalSize;
            drawY2 = drawY;
          } else if (drawX + ts > maxCoord) {
            drawX2 = drawX - totalSize;
            drawY2 = drawY;
          }
        } else {
          const offset = (ui.dragY ?? 0) - (ui.dragStartY ?? 0);
          const totalSize = state.h * ts;
          let dragOffset = ((offset % totalSize) + totalSize) % totalSize;
          if (dragOffset > totalSize / 2) {
            dragOffset -= totalSize;
          }

          drawX = coord(i % state.w, ts);
          drawY = coord(Math.floor(i / state.w), ts) + dragOffset;

          const minCoord = coord(0, ts);
          const maxCoord = minCoord + totalSize;
          if (drawY < minCoord) {
            drawX2 = drawX;
            drawY2 = drawY + totalSize;
          } else if (drawY + ts > maxCoord) {
            drawX2 = drawX;
            drawY2 = drawY - totalSize;
          }
        }
      } else {
        drawX = coord(i % state.w, ts);
        drawY = coord(Math.floor(i / state.w), ts);
      }

      let tileBg =
        drawX2 === -1 && tileCursor(i, state, curX, curY) ? COL_LOWLIGHT : bgcolour;
      if (hintTile !== null && t === hintTile) {
        tileBg = COL_HINT;
      }
      drawTile(dr, ts, hw, drawX, drawY, t, tileBg);

      if (drawX2 !== -1 || drawY2 !== -1) {
        let wrapBg = bgcolour;
        if (hintTile !== null && t === hintTile) {
          wrapBg = COL_HINT;
        }
        drawTile(dr, ts, hw, drawX2, drawY2, t, wrapBg);
      }
    }
    ds.tiles[i] = t0;
  }

  ds.curX = curX;
  ds.curY = curY;
  ds.dragging = ui.dragging;
  ds.dragAxis = ui.dragAxis;
  ds.dragIndex = ui.dragIndex;
  ds.dragX = ui.dragX;
  ds.dragY = ui.dragY;
  if (hintTarget !== null) {
    const isIntermediate = hintUltimate !== null;
    drawHintBorder(dr, ts, state, hintTarget, COL_HINT, isIntermediate);
  }
  if (hintUltimate !== null) {
    drawHintBorder(dr, ts, state, hintUltimate, COL_HINT, false);
  }
  dr.unclip();
  ds.bgcolour = bgcolour;
}

function tileCursor(i: number, state: SixteenState, cx: number, cy: number): boolean {
  if (cx < 0 || cx >= state.w || cy < 0 || cy >= state.h) return false;
  return i === cy * state.w + cx;
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  hw: number,
  x: number,
  y: number,
  tile: number,
  bgColour: number,
): void {
  if (tile === 0) {
    dr.drawRect({ x, y, w: ts, h: ts }, bgColour);
  } else {
    // Lowlight triangle (bottom-right).
    dr.drawPolygon(
      [
        { x: x + ts - 1, y: y + ts - 1 },
        { x: x + ts - 1, y },
        { x, y: y + ts - 1 },
      ],
      COL_LOWLIGHT,
      COL_LOWLIGHT,
    );
    // Highlight triangle (top-left).
    dr.drawPolygon(
      [
        { x, y },
        { x, y: y + ts - 1 },
        { x: x + ts - 1, y },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
    // Centre fill.
    dr.drawRect({ x: x + hw, y: y + hw, w: ts - 2 * hw, h: ts - 2 * hw }, bgColour);
    // Number.
    dr.drawText(
      { x: x + ts / 2, y: y + ts / 2 },
      { align: "center", baseline: "mathematical", fontType: "variable", size: ts / 3 },
      COL_TEXT,
      String(tile),
    );
  }
  dr.drawUpdate({ x, y, w: ts, h: ts });
}

function drawArrow(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  xdx: number,
  xdy: number,
  fillColour: number,
): void {
  const ydy = -xdx;
  const ydx = xdy;

  const point = (xx: number, yy: number): Point => ({
    x: x + xx * xdx + yy * ydx,
    y: y + xx * xdy + yy * ydy,
  });

  const coords: Point[] = [
    point(ts / 2, (3 * ts) / 4), // top of arrow
    point((3 * ts) / 4, ts / 2), // right corner
    point((5 * ts) / 8, ts / 2), // right concave
    point((5 * ts) / 8, ts / 4), // bottom right
    point((3 * ts) / 8, ts / 4), // bottom left
    point((3 * ts) / 8, ts / 2), // left concave
    point(ts / 4, ts / 2), // left corner
  ];

  dr.drawPolygon(coords, fillColour, COL_TEXT);
}

function drawArrowAt(
  dr: GameDrawing,
  ts: number,
  w: number,
  h: number,
  ax: number,
  ay: number,
  fillColour: number,
): void {
  if (ax === -1) {
    drawArrow(dr, ts, coord(0, ts), coord(ay + 1, ts), 0, -1, fillColour);
  } else if (ax === w) {
    drawArrow(dr, ts, coord(w, ts), coord(ay, ts), 0, 1, fillColour);
  } else if (ay === -1) {
    drawArrow(dr, ts, coord(ax, ts), coord(0, ts), 1, 0, fillColour);
  } else if (ay === h) {
    drawArrow(dr, ts, coord(ax + 1, ts), coord(h, ts), -1, 0, fillColour);
  } else return;

  dr.drawUpdate({ x: coord(ax, ts), y: coord(ay, ts), w: ts, h: ts });
}

/** Draw a border-only highlight on a tile cell (target position).
 * Draws a 3-pixel outline so the tile number remains fully readable. */
function drawHintBorder(
  dr: GameDrawing,
  ts: number,
  state: SixteenState,
  pos: number,
  colour: number,
  dashed = false,
): void {
  const x = coord(pos % state.w, ts);
  const y = coord(Math.floor(pos / state.w), ts);
  const b = 3; // 3-pixel border

  if (dashed) {
    const dashLen = 6;
    const gapLen = 4;
    const step = dashLen + gapLen;

    // Draw top border (horizontal)
    for (let cx = x; cx < x + ts; cx += step) {
      const w = Math.min(dashLen, x + ts - cx);
      dr.drawRect({ x: cx, y, w, h: b }, colour);
    }
    // Draw bottom border (horizontal)
    for (let cx = x; cx < x + ts; cx += step) {
      const w = Math.min(dashLen, x + ts - cx);
      dr.drawRect({ x: cx, y: y + ts - b, w, h: b }, colour);
    }
    // Draw left border (vertical)
    for (let cy = y + b; cy < y + ts - b; cy += step) {
      const h = Math.min(dashLen, y + ts - b - cy);
      dr.drawRect({ x, y: cy, w: b, h }, colour);
    }
    // Draw right border (vertical)
    for (let cy = y + b; cy < y + ts - b; cy += step) {
      const h = Math.min(dashLen, y + ts - b - cy);
      dr.drawRect({ x: x + ts - b, y: cy, w: b, h }, colour);
    }
  } else {
    // Draw outline: top, bottom, left, right.
    dr.drawRect({ x, y, w: ts, h: b }, colour);
    dr.drawRect({ x, y: y + ts - b, w: ts, h: b }, colour);
    dr.drawRect({ x, y: y + b, w: b, h: ts - 2 * b }, colour);
    dr.drawRect({ x: x + ts - b, y: y + b, w: b, h: ts - 2 * b }, colour);
  }
  dr.drawUpdate({ x, y, w: ts, h: ts });
}

/** Draw or erase a hint highlight for a tile. Source tiles are highlighted
 * with a filled colour using drawTile (keeping the number visible), while
 * target positions are highlighted with a 3-pixel border. */
function drawHintOverlay(
  dr: GameDrawing,
  ts: number,
  hw: number,
  state: SixteenState,
  pos: number,
  colour: number,
  isTarget: boolean,
): void {
  const x = coord(pos % state.w, ts);
  const y = coord(Math.floor(pos / state.w), ts);
  const tile = state.tiles[pos];

  if (colour === COL_BACKGROUND) {
    // Erase highlight: just redraw the tile with normal background.
    drawTile(dr, ts, hw, x, y, tile, COL_BACKGROUND);
  } else if (isTarget) {
    // Draw target border.
    drawHintBorder(dr, ts, state, pos, colour);
  } else {
    // Draw source fill: draw the tile with COL_HINT as the background!
    drawTile(dr, ts, hw, x, y, tile, COL_HINT);
  }
}

function drawArrowForCursor(
  dr: GameDrawing,
  ts: number,
  ds: SixteenDrawState,
  curX: number,
  curY: number,
  cur: boolean,
): void {
  if (curX === -1 && curY === -1) return;
  const fill = cur
    ? COL_HIGHLIGHT
    : curX === ds.hintArrowX && curY === ds.hintArrowY
      ? COL_HINT
      : COL_LOWLIGHT;
  drawArrowAt(dr, ts, ds.w, ds.h, curX, curY, fill);
}

function drawRecessedBorder(
  dr: GameDrawing,
  state: SixteenState,
  ts: number,
  hw: number,
): void {
  const w = state.w;
  const h = state.h;

  drawBevel(
    dr,
    {
      left: coord(0, ts) - hw,
      top: coord(0, ts) - hw,
      right: coord(w, ts) + hw - 1,
      bottom: coord(h, ts) + hw - 1,
    },
    ts,
    COL_HIGHLIGHT,
    COL_LOWLIGHT,
  );
}

// --- status bar -------------------------------------------------------

function statusbarText(state: SixteenState, _ui: SixteenUi): string {
  if (state.usedSolve) {
    return `Moves since auto-solve: ${state.moveCount - state.completed}`;
  }
  const prefix = state.completed ? "COMPLETED! " : "";
  const moves = state.completed || state.moveCount;
  let s = `${prefix}Moves: ${moves}`;
  if (state.moveTarget) s += ` (target ${state.moveTarget})`;
  return s;
}

// --- hint heuristic ----------------------------------------------------

/** Test-only diagnostic: whether the most recent `hint()` engaged the exact
 * bidirectional fallback — the expensive (~0.5-2s) path the no-progress gate
 * exists to avoid on boards the forward search can already make progress on.
 * Tests assert this directly instead of timing a wall-clock proxy (which
 * flakes under full-suite CPU contention). Unused in production. */
let lastHintEngagedFallback = false;
export function __lastHintEngagedFallback(): boolean {
  return lastHintEngagedFallback;
}

/** Sixteen's own move for a planned slide. The planner's `delta` already means
 * "how far a tile travels", which is Sixteen's sense too, so only the axis
 * spelling differs. */
function toSixteenMove(m: SlideMove): SixteenMove {
  return {
    type: "slide",
    axis: m.axis === "row" ? "row" : "column",
    index: m.index,
    delta: m.delta,
  };
}

function hint(state: SixteenState): HintResult<SixteenMove, SixteenHintHighlights> {
  const { w, h, n, tiles } = state;

  let outOfPlace = 0;
  for (let i = 0; i < n; i++) {
    if (tiles[i] !== i + 1) outOfPlace++;
  }
  if (outOfPlace === 0) return { ok: false, error: "Already solved" };

  // Every legal move: a slide of any line by any distance. A slide by any
  // distance is a *single* move — the same granularity as a player's drag and
  // as the move counter — so the plan's first move is directly executable
  // (executing a longer journey than the plan's first step deviated from the
  // plan and caused auto-hint cycles).
  const moves: SlideMove[] = [];
  for (let r = 0; r < h; r++) {
    for (let delta = 1; delta < w; delta++) {
      moves.push({ axis: "row", index: r, delta });
    }
  }
  for (let c = 0; c < w; c++) {
    for (let delta = 1; delta < h; delta++) {
      moves.push({ axis: "col", index: c, delta });
    }
  }

  // Every tile is distinct and belongs in the cell one below its own number, so
  // "how far from finished" is just the total distance the tiles must travel.
  // Precomputed per (cell, tile) so the heuristic is a sum of table lookups.
  const goal = new Int32Array(n);
  for (let i = 0; i < n; i++) goal[i] = i + 1;

  const stride = n + 1;
  const distTable = new Int32Array(n * stride);
  for (let cell = 0; cell < n; cell++) {
    for (let tile = 1; tile <= n; tile++) {
      distTable[cell * stride + tile] =
        toroidalDist(Math.floor(cell / w), Math.floor((tile - 1) / w), h) +
        toroidalDist(cell % w, (tile - 1) % w, w);
    }
  }
  const heuristic = (board: Int32Array): number => {
    let total = 0;
    for (let cell = 0; cell < n; cell++)
      total += distTable[cell * stride + board[cell]];
    return total;
  };

  const last = state.lastMove;
  const plan = planSlides({
    w,
    h,
    start: tiles,
    goal,
    heuristic,
    moves,
    // Near the solved state a somewhat larger budget resolves shallow
    // plateaus; deep local minima (two swapped pairs) are beyond *any* sane
    // forward budget and are the exact fallback's job, so there is no point
    // burning a huge budget here.
    maxStates: outOfPlace <= 8 ? 6000 : 4000,
    // Don't open by undoing (or partly undoing) the slide the player just made.
    rejectFirstMove:
      last?.type === "slide"
        ? (m) => {
            const axis = m.axis === "row" ? "row" : "column";
            if (axis !== last.axis || m.index !== last.index) return false;
            const lim = m.axis === "row" ? w : h;
            const normalize = (d: number) => {
              let nd = ((d % lim) + lim) % lim;
              if (nd > lim / 2) nd -= lim;
              return nd;
            };
            return (
              Math.abs(normalize(last.delta + m.delta)) <
              Math.abs(normalize(last.delta))
            );
          }
        : undefined,
    // A local minimum sits ~8 plies uphill — beyond any forward budget — but
    // meeting in the middle crosses it at ~4 plies a side, paid once for the
    // whole endgame thanks to plan-carrying. Only worth it near the end, and
    // only once the forward search has proved itself helpless.
    exactSearch:
      outOfPlace <= 8
        ? { when: "no-progress" as const, maxDepth: 10, maxStates: 4_000_000 }
        : undefined,
  });

  lastHintEngagedFallback = plan.usedExactSearch;
  const path = plan.moves;
  if (path.length === 0) {
    return { ok: false, error: "No helpful hint found" };
  }

  // Narrate each step against the simulated board it applies to: the
  // plan is computed once, so every step's story must already be told
  // from the state its predecessors produce. A step that the previous
  // step previewed as the continuation of a tile's journey ("then to
  // column 2") is narrated around that same tile — the user who
  // follows the journey must see its second leg, not an unrelated
  // story about whichever tile happens to be lowest-numbered on the
  // line.
  const steps: HintStep<SixteenMove, SixteenHintHighlights>[] = [];
  let board = tiles;
  for (let k = 0; k < path.length; k++) {
    const prev = steps[k - 1]?.highlights;
    const journey =
      prev && prev.ultimatePos !== undefined
        ? { tile: prev.tile, ultimatePos: prev.ultimatePos }
        : null;
    steps.push(narrateStep(board, w, h, path[k], path[k + 1] ?? null, journey));
    const next = new Int32Array(n);
    slidePieces(board, next, w, h, path[k]);
    board = next;
  }

  return { ok: true, steps };
}

/** Narrate one plan step against the board it applies to. The
 * highlighted tile is the lowest-numbered out-of-place tile on the
 * moved line — unless the previous step previewed this move as the
 * continuation of a tile's journey, in which case that journey tile
 * carries the narration through its second leg. The target is the
 * narrated tile's landing cell under the move (with a second-leg
 * preview when the next planned move continues the same tile's
 * journey perpendicular to this one); the returned move's delta is
 * normalized to the in-grid direction of travel. (An earlier version
 * narrated the tile's *solved* row/column regardless of what the move
 * achieved; once hints started executing the narrated slide, that
 * overpromise pushed the game off the solver's path and auto-play
 * could cycle.) The narration reads "Working on tile N: move it to
 * <line>[, then <line>]" and explains *why* via a trailing clause —
 * ", its final spot" when the journey ends in the tile's solved cell,
 * else "(setting up)" — per the shared sliding-tile hint vocabulary. */
function narrateStep(
  tiles: Int32Array,
  w: number,
  h: number,
  move: SlideMove,
  nextMove: SlideMove | null,
  journey: { tile: number; ultimatePos: number } | null = null,
): HintStep<SixteenMove, SixteenHintHighlights> {
  // A previewed journey continuation keeps narrating the same tile,
  // provided this move really does carry it to the previewed cell.
  let bestTile = 0;
  let continuesPrevious = false;
  if (journey) {
    const idx = tiles.indexOf(journey.tile);
    const r = Math.floor(idx / w);
    const c = idx % w;
    const onLine = move.axis === "row" ? r === move.index : c === move.index;
    if (onLine) {
      const jLandR = move.axis === "row" ? r : (r + move.delta + h) % h;
      const jLandC = move.axis === "row" ? (c + move.delta + w) % w : c;
      if (jLandR * w + jLandC === journey.ultimatePos) {
        bestTile = journey.tile;
        continuesPrevious = true;
      }
    }
  }

  // Otherwise pick the lowest-numbered out-of-place tile on the moved
  // row/column; if every tile on the line is in place (the move only
  // serves another line's journey), the lowest-numbered tile on it.
  if (bestTile === 0 && move.axis === "row") {
    const r = move.index;
    for (let c = 0; c < w; c++) {
      const tile = tiles[r * w + c];
      const targetCol = (tile - 1) % w;
      const targetRow = Math.floor((tile - 1) / w);
      if (targetRow !== r || targetCol !== c) {
        if (bestTile === 0 || tile < bestTile) {
          bestTile = tile;
        }
      }
    }
    if (bestTile === 0) {
      for (let c = 0; c < w; c++) {
        const tile = tiles[r * w + c];
        if (bestTile === 0 || tile < bestTile) {
          bestTile = tile;
        }
      }
    }
  } else if (bestTile === 0) {
    const colIndex = move.index;
    for (let r = 0; r < h; r++) {
      const tile = tiles[r * w + colIndex];
      const targetCol = (tile - 1) % w;
      const targetRow = Math.floor((tile - 1) / w);
      if (targetRow !== r || targetCol !== colIndex) {
        if (bestTile === 0 || tile < bestTile) {
          bestTile = tile;
        }
      }
    }
    if (bestTile === 0) {
      for (let r = 0; r < h; r++) {
        const tile = tiles[r * w + colIndex];
        if (bestTile === 0 || tile < bestTile) {
          bestTile = tile;
        }
      }
    }
  }

  // bestTile is selected from the moved line, so it is always found.
  const currentIdx = tiles.indexOf(bestTile);
  const curR = Math.floor(currentIdx / w);
  const curC = currentIdx % w;

  const landR = move.axis === "row" ? curR : (curR + move.delta + h) % h;
  const landC = move.axis === "row" ? (curC + move.delta + w) % w : curC;
  const targetPos = landR * w + landC;

  // Goal:tactic narration. The prefix names the tile being worked toward
  // home; the tactic states the destination line this move sends it to.
  // A continuation leg ("then to …") repeats neither the verb nor the why
  // — leg 0 of its journey already carried both and is still on screen.
  const firstDest = move.axis === "row" ? `column ${landC + 1}` : `row ${landR + 1}`;
  let tactic = continuesPrevious ? `then to ${firstDest}` : `move it to ${firstDest}`;

  let ultimatePos: number | undefined;

  if (nextMove && nextMove.axis !== move.axis) {
    const onSecondLine =
      nextMove.axis === "col" ? nextMove.index === landC : nextMove.index === landR;
    if (onSecondLine) {
      const ultR = nextMove.axis === "col" ? (landR + nextMove.delta + h) % h : landR;
      const ultC = nextMove.axis === "row" ? (landC + nextMove.delta + w) % w : landC;
      const ult = ultR * w + ultC;
      if (ult !== targetPos && ult !== currentIdx) {
        ultimatePos = ult;
        const secondDest =
          move.axis === "row" ? `row ${ultR + 1}` : `column ${ultC + 1}`;
        tactic += `, then ${secondDest}`;
      }
    }
  }

  // Explain *why* the move matters (per the hint quality bar): a move
  // that lands the narrated tile in its solved cell (index tile-1) is a
  // **home** move; one that leaves it out of place is a **staging** move.
  // The why attaches to the journey's *end* — for a previewed two-leg
  // journey use the ultimate landing cell, so a first leg that merely
  // stages but whose second leg homes the tile reads as a home move. A
  // continuation leg carries no why (leg 0 of its journey already did).
  let suffix = "";
  if (!continuesPrevious) {
    const finalPos = ultimatePos ?? targetPos;
    suffix = finalPos === bestTile - 1 ? ", its final spot" : ` ${HINT_SETTING_UP}`;
  }

  const explanation = `${workingOn(bestTile)}${tactic}${suffix}`;

  // Normalize the returned delta to the in-grid direction of travel
  // (same permutation mod w/h) so the slide animation glides the tile
  // straight to its target box rather than wrapping across the edge.
  const inGridDelta = move.axis === "row" ? landC - curC : landR - curR;
  const outMove = toSixteenMove(
    inGridDelta === move.delta ? move : { ...move, delta: inGridDelta },
  );

  return {
    move: outMove,
    explanation,
    highlights: { tile: bestTile, targetPos, ultimatePos },
    ...(continuesPrevious ? { continuesPrevious } : {}),
  };
}

// --- Game object ------------------------------------------------------

export const sixteenGame: Game<
  SixteenParams,
  SixteenState,
  SixteenMove,
  SixteenUi,
  SixteenDrawState
> = {
  id: "sixteen",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<SixteenParams>(),
    {
      kw: "number-of-shuffling-moves",
      name: "Number of shuffling moves",
      type: "string",
      get: (p) => String(p.movetarget),
      set: (p, v) => {
        p.movetarget = parseConfigInt(v);
      },
    },
  ],
  describeParams: (p) => ({
    "number-of-shuffling-moves": String(p.movetarget),
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status: (s) => (s.completed > 0 ? "solved" : "ongoing"),

  solve(_orig, _curr) {
    return { ok: true, move: { type: "solve" as const } };
  },

  hint,

  hintKeepTrack(
    m: SixteenMove,
    step: HintStep<SixteenMove, SixteenHintHighlights>,
    state: SixteenState,
  ): HintTrackVerdict {
    if (m.type !== "slide" || step.move.type !== "slide") return "off";

    // Only slides of the hinted row/column relate to the step at all.
    if (m.axis !== step.move.axis || m.index !== step.move.index) {
      return "off";
    }

    const hl = step.highlights;
    if (!hl) return "off";

    // A slide of the hinted line that lands the tile on the step's
    // target completes the step. This is safe exactly because a line
    // slide is determined by its displacement: any slide landing the
    // tile there produces the same permutation as the planned move,
    // so the post-move state matches the plan and the remaining
    // steps stay valid.
    const nextState = executeMove(state, m);
    const tilePos = nextState.tiles.indexOf(hl.tile);
    if (tilePos === hl.targetPos) return "completed";

    // Any other slide of the line is partial progress (or a detour):
    // shrink the step's move to the remaining in-grid distance so a
    // later executeHint doesn't overshoot.
    const curR = Math.floor(tilePos / state.w);
    const curC = tilePos % state.w;
    const tgtR = Math.floor(hl.targetPos / state.w);
    const tgtC = hl.targetPos % state.w;
    const remaining = step.move.axis === "row" ? tgtC - curC : tgtR - curR;
    step.move = { ...step.move, delta: remaining };
    return "onTrack";
  },

  textFormat,
  statusbarText,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength: (_oldState, _newState, _dir, ui) => {
    if (ui.justDragged) {
      ui.justDragged = false;
      return 0;
    }
    return ANIM_TIME;
  },
  flashLength: (oldState, newState) => {
    if (
      !oldState.completed &&
      newState.completed &&
      !oldState.usedSolve &&
      !newState.usedSolve
    )
      return 2 * FLASH_FRAME;
    return 0;
  },
};

registerGame(sixteenGame);
