import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type {
  Game,
  GameDrawing,
  HintResult,
  HintStep,
  HintTrackVerdict,
  UiUpdate,
} from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import {
  coord as coordE,
  fromCoord as fromCoordE,
} from "../../engine/geometry.ts";
import {
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  cursorDelta,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
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
  const MOD_CTRL = 0x1000;
  const MOD_SHFT = 0x2000;
  const MOD_NUM_KEYPAD = 0x4000;
  const MOD_MASK = 0x7800;
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

      const { x: nx, y: ny } = moveCursor(
        rawButton | pad,
        ui.curX,
        ui.curY,
        state.w,
        state.h,
        false,
      );
      const { x: nwx, y: nwy } = moveCursor(
        rawButton | pad,
        ui.curX,
        ui.curY,
        state.w,
        state.h,
        true,
      );

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
      const { x: nx, y: ny } = moveCursor(
        rawButton | pad,
        ui.curX + 1,
        ui.curY + 1,
        state.w + 2,
        state.h + 2,
        false,
      );

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

function isCursorMove(button: number): boolean {
  return button >= CURSOR_UP && button <= CURSOR_RIGHT;
}

function moveCursor(
  button: number,
  x: number,
  y: number,
  w: number,
  h: number,
  wrap: boolean,
): { x: number; y: number } {
  const d = cursorDelta(button) ?? { dx: 0, dy: 0 };
  let nx = x + d.dx,
    ny = y + d.dy;
  if (wrap) {
    nx = ((nx % w) + w) % w;
    ny = ((ny % h) + h) % h;
  } else {
    nx = Math.max(0, Math.min(w - 1, nx));
    ny = Math.max(0, Math.min(h - 1, ny));
  }
  return { x: nx, y: ny };
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
  const { background: bg, highlight: hi, lowlight: lo } = mkhighlight(defaultBackground);

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

  // Highlight border (outer).
  dr.drawPolygon(
    [
      { x: coord(w, ts) + hw - 1, y: coord(h, ts) + hw - 1 },
      { x: coord(w, ts) + hw - 1, y: coord(0, ts) - hw },
      { x: coord(w, ts) + hw - 1 - ts, y: coord(0, ts) - hw + ts },
      { x: coord(0, ts) - hw + ts, y: coord(h, ts) + hw - 1 - ts },
      { x: coord(0, ts) - hw, y: coord(h, ts) + hw - 1 },
    ],
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
  );

  // Lowlight border (inner).
  dr.drawPolygon(
    [
      { x: coord(0, ts) - hw, y: coord(0, ts) - hw },
      { x: coord(0, ts) - hw, y: coord(h, ts) + hw - 1 },
      { x: coord(0, ts) - hw + ts, y: coord(h, ts) + hw - 1 - ts },
      { x: coord(w, ts) + hw - 1 - ts, y: coord(0, ts) - hw + ts },
      { x: coord(w, ts) + hw - 1, y: coord(0, ts) - hw },
    ],
    COL_LOWLIGHT,
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

/** Toroidal distance: shortest distance on a wrap-around axis of length `len`. */
function toroidalDist(from: number, to: number, len: number): number {
  const d = Math.abs(from - to);
  return Math.min(d, len - d);
}

function slideTilesInto(
  src: Int32Array,
  dest: Int32Array,
  w: number,
  h: number,
  move: Extract<SixteenMove, { type: "slide" }>,
): void {
  const { axis, index, delta } = move;
  dest.set(src);

  if (axis === "row") {
    const offset = index * w;
    for (let x = 0; x < w; x++) {
      const srcX = (((x - delta) % w) + w) % w;
      dest[offset + x] = src[offset + srcX];
    }
  } else {
    for (let y = 0; y < h; y++) {
      const srcY = (((y - delta) % h) + h) % h;
      dest[y * w + index] = src[srcY * w + index];
    }
  }
}

function arrayToKey(arr: Int32Array): string {
  let s = "";
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(arr[i]);
  }
  return s;
}

type SlideMove = Extract<SixteenMove, { type: "slide" }>;

/** Exact bidirectional BFS (in full-slide moves) from `start` to the
 * solved board: expand level by level from both ends, always growing the
 * smaller frontier, until the visited sets meet. Returns the full move
 * path of a shortest solution, or null when no meeting point is found
 * within the depth/state caps. */
function bidirectionalPlan(
  start: Int32Array,
  w: number,
  h: number,
  n: number,
  moves: SlideMove[],
): SlideMove[] | null {
  const MAX_TOTAL_DEPTH = 10;
  const MAX_STATES = 1_500_000;

  const goal = new Int32Array(n);
  for (let i = 0; i < n; i++) goal[i] = i + 1;

  const invert = (m: SlideMove): SlideMove => ({ ...m, delta: -m.delta });

  /** `parent` walks toward the start; `move` is the forward-direction
   * move that leads from the parent to this node. */
  interface FwdInfo {
    parent: string | null;
    move: SlideMove | null;
  }
  /** `parent` walks toward the goal; `out` is the forward-direction
   * move that leads from this node to the parent. */
  interface BwdInfo {
    parent: string | null;
    out: SlideMove | null;
  }
  interface FrontierNode {
    tiles: Int32Array;
    key: string;
  }

  const startKey = arrayToKey(start);
  const goalKey = arrayToKey(goal);
  const fwdSeen = new Map<string, FwdInfo>([[startKey, { parent: null, move: null }]]);
  const bwdSeen = new Map<string, BwdInfo>([[goalKey, { parent: null, out: null }]]);
  let fwdFrontier: FrontierNode[] = [{ tiles: start, key: startKey }];
  let bwdFrontier: FrontierNode[] = [{ tiles: goal, key: goalKey }];
  let depth = 0;

  const scratch = new Int32Array(n);

  /** The shortest path start→goal through a meeting key present in
   * both visited maps: the forward parent chain (reversed) followed by
   * the backward parent chain's outgoing moves. */
  const joinPaths = (meetKey: string): SlideMove[] => {
    const path: SlideMove[] = [];
    for (
      let info = fwdSeen.get(meetKey);
      info !== undefined && info.move !== null && info.parent !== null;
      info = fwdSeen.get(info.parent)
    ) {
      path.push(info.move);
    }
    path.reverse();
    for (
      let info = bwdSeen.get(meetKey);
      info !== undefined && info.out !== null && info.parent !== null;
      info = bwdSeen.get(info.parent)
    ) {
      path.push(info.out);
    }
    return path;
  };

  while (
    fwdFrontier.length > 0 &&
    bwdFrontier.length > 0 &&
    depth < MAX_TOTAL_DEPTH &&
    fwdSeen.size + bwdSeen.size < MAX_STATES
  ) {
    const forward = fwdFrontier.length <= bwdFrontier.length;
    const frontier = forward ? fwdFrontier : bwdFrontier;
    const next: FrontierNode[] = [];
    for (const node of frontier) {
      if (forward) {
        for (const move of moves) {
          slideTilesInto(node.tiles, scratch, w, h, move);
          const key = arrayToKey(scratch);
          if (fwdSeen.has(key)) continue;
          fwdSeen.set(key, { parent: node.key, move });
          if (bwdSeen.has(key)) return joinPaths(key);
          next.push({ tiles: new Int32Array(scratch), key });
        }
      } else {
        for (const move of moves) {
          slideTilesInto(node.tiles, scratch, w, h, move);
          const key = arrayToKey(scratch);
          if (bwdSeen.has(key)) continue;
          // In forward direction, this edge runs successor --inv(move)--> node.
          bwdSeen.set(key, { parent: node.key, out: invert(move) });
          if (fwdSeen.has(key)) return joinPaths(key);
          next.push({ tiles: new Int32Array(scratch), key });
        }
      }
    }
    if (forward) {
      fwdFrontier = next;
    } else {
      bwdFrontier = next;
    }
    depth++;
  }
  return null;
}

function hint(state: SixteenState): HintResult<SixteenMove, SixteenHintHighlights> {
  const { w, h, n, tiles } = state;

  // Already solved?
  let solved = true;
  for (let i = 0; i < n; i++) {
    if (tiles[i] !== i + 1) {
      solved = false;
      break;
    }
  }
  if (solved) return { ok: false, error: "Already solved" };

  let outOfPlace = 0;
  for (let i = 0; i < n; i++) {
    if (tiles[i] !== i + 1) {
      outOfPlace++;
    }
  }

  // A* Search settings
  // Near the solved state, a somewhat larger budget resolves shallow
  // plateaus; deep local minima (e.g. swapped pairs) are beyond ANY
  // sane forward budget and are handled by the exact bidirectional
  // fallback below, so there is no point burning a huge budget here.
  const maxStates = outOfPlace <= 8 ? 6000 : 4000;

  const targetR = new Int32Array(n + 1);
  const targetC = new Int32Array(n + 1);
  for (let tile = 1; tile <= n; tile++) {
    targetR[tile] = Math.floor((tile - 1) / w);
    targetC[tile] = (tile - 1) % w;
  }

  const cellR = new Int32Array(n);
  const cellC = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    cellR[i] = Math.floor(i / w);
    cellC[i] = i % w;
  }

  // Precompute static toroidal Manhattan distances once for this board configuration.
  // distTable[cellIndex * (n + 1) + tile] holds the distance from cell cellIndex to target of tile.
  const distTable = new Int32Array(n * (n + 1));
  for (let i = 0; i < n; i++) {
    for (let tile = 1; tile <= n; tile++) {
      distTable[i * (n + 1) + tile] =
        toroidalDist(cellR[i], targetR[tile], h) +
        toroidalDist(cellC[i], targetC[tile], w);
    }
  }

  const getHeuristic = (board: Int32Array): number => {
    let total = 0;
    const len = board.length;
    const rowStride = n + 1;
    for (let i = 0; i < len; i++) {
      total += distTable[i * rowStride + board[i]];
    }
    return total;
  };

  const startH = getHeuristic(tiles);

  // Store visited states and their best g values
  const visited = new Map<string, number>();
  visited.set(arrayToKey(tiles), 0);

  // Priority Queue using Bucket Queue for O(1) state management.
  // Since f = g + h is always a small integer, we can bucket nodes by their f value.
  // Parent pointers reconstruct the full move path; nodes are already
  // retained by the bucket queue, so the chains add two references per
  // node and no new allocation pattern.
  interface SearchNode {
    tiles: Int32Array;
    g: number;
    h: number;
    f: number;
    parent: SearchNode | null;
    move: SlideMove | null;
  }

  const buckets: SearchNode[][] = [];
  let minF = startH;
  let queueSize = 0;

  const insertSorted = (node: SearchNode) => {
    const f = node.f;
    if (!buckets[f]) {
      buckets[f] = [];
    }
    buckets[f].push(node);
    if (f < minF) {
      minF = f;
    }
    queueSize++;
  };

  insertSorted({
    tiles,
    g: 0,
    h: startH,
    f: startH,
    parent: null,
    move: null,
  });

  let expanded = 0;
  let bestNode: SearchNode = buckets[startH][0];

  // Pre-generate all legal moves from any state. A slide by any distance
  // is a single move — the same granularity as a player's drag and the
  // move counter — so the planner's first move is directly executable as
  // one full slide (executing a longer journey than the plan's first
  // step deviated from the plan and caused auto-hint cycles).
  const moves: Extract<SixteenMove, { type: "slide" }>[] = [];
  for (let r = 0; r < h; r++) {
    for (let delta = 1; delta < w; delta++) {
      moves.push({ type: "slide", axis: "row", index: r, delta });
    }
  }
  for (let c = 0; c < w; c++) {
    for (let delta = 1; delta < h; delta++) {
      moves.push({ type: "slide", axis: "column", index: c, delta });
    }
  }

  const popMin = (): SearchNode | null => {
    while (minF < buckets.length) {
      const bucket = buckets[minF];
      if (bucket && bucket.length > 0) {
        queueSize--;
        const nextNode = bucket.pop();
        if (nextNode !== undefined) return nextNode;
      }
      minF++;
    }
    return null;
  };

  // Reusable scratch buffer to generate move states and check visited list BEFORE allocating arrays.
  const scratchTiles = new Int32Array(n);

  while (queueSize > 0 && expanded < maxStates) {
    const curr = popMin();
    if (!curr) break;
    expanded++;

    // Check if solved
    if (curr.h === 0) {
      bestNode = curr;
      break;
    }

    // Track state with absolute lowest heuristic value
    if (curr.h < bestNode.h) {
      bestNode = curr;
    }

    for (const move of moves) {
      // Avoid immediately undoing or contradicting the last move on the first step of the path.
      if (curr.g === 0 && state.lastMove && state.lastMove.type === "slide") {
        const last = state.lastMove;
        if (move.axis === last.axis && move.index === last.index) {
          const lim = move.axis === "row" ? w : h;
          const normalize = (d: number) => {
            let nd = ((d % lim) + lim) % lim;
            if (nd > lim / 2) nd -= lim;
            return nd;
          };
          const nd1 = normalize(last.delta);
          const ndSum = normalize(last.delta + move.delta);
          if (Math.abs(ndSum) < Math.abs(nd1)) {
            continue;
          }
        }
      }

      slideTilesInto(curr.tiles, scratchTiles, w, h, move);
      const key = arrayToKey(scratchTiles);
      const nextG = curr.g + 1;

      const prevG = visited.get(key);
      if (prevG !== undefined && prevG <= nextG) {
        continue;
      }

      visited.set(key, nextG);
      const nextH = getHeuristic(scratchTiles);

      // Lazy Allocation: Only construct new Int32Array and node object when actually accepted into queue!
      const nextTiles = new Int32Array(scratchTiles);
      const nextNode: SearchNode = {
        tiles: nextTiles,
        g: nextG,
        h: nextH,
        f: nextG + nextH,
        parent: curr,
        move,
      };

      insertSorted(nextNode);
    }
  }

  // Plan selection: use the heuristic search's path when it reached the
  // goal or at least improved on the start position; only when it made
  // NO progress at all — a strict local minimum, e.g. two swapped
  // pairs, where every single slide makes the distance heuristic worse
  // and `bestNode` is still the start node — fall back to an exact
  // bidirectional search on near-solved boards. Those minima sit ~8
  // plies uphill, beyond any sane forward budget, but meeting in the
  // middle crosses them at ~4 plies per side for ~0.5-2s, paid once
  // for the whole endgame thanks to plan-carrying. The no-progress
  // gate matters: mid-game boards with few-but-deep displacements
  // (e.g. a 7-cycle needing 12 slides) used to engage the fallback
  // too, burning ~3s hitting its depth cap before returning the
  // forward search's partial plan anyway.
  const pathTo = (node: SearchNode): SlideMove[] => {
    const path: SlideMove[] = [];
    for (let p: SearchNode | null = node; p !== null && p.move !== null; p = p.parent) {
      path.push(p.move);
    }
    return path.reverse();
  };

  // The myopic case (search failed to reach the goal but improved on
  // the start) yields a *partial* plan — the path to `bestNode`. That
  // is fine: the plan runs out and the next request recomputes from
  // the better position.
  let path: SlideMove[] | null = null;
  if (bestNode.h !== 0 && bestNode.move === null && outOfPlace <= 8) {
    path = bidirectionalPlan(tiles, w, h, n, moves);
  }
  path ??= pathTo(bestNode);
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
    slideTilesInto(board, next, w, h, path[k]);
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
 * could cycle.) */
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

  let explanation =
    move.axis === "row"
      ? `Move tile ${bestTile} to column ${landC + 1}`
      : `Move tile ${bestTile} to row ${landR + 1}`;

  let ultimatePos: number | undefined;

  if (nextMove && nextMove.axis !== move.axis) {
    const onSecondLine =
      nextMove.axis === "column" ? nextMove.index === landC : nextMove.index === landR;
    if (onSecondLine) {
      const ultR =
        nextMove.axis === "column" ? (landR + nextMove.delta + h) % h : landR;
      const ultC = nextMove.axis === "row" ? (landC + nextMove.delta + w) % w : landC;
      const ult = ultR * w + ultC;
      if (ult !== targetPos && ult !== currentIdx) {
        ultimatePos = ult;
        explanation =
          move.axis === "row"
            ? `Move tile ${bestTile} to column ${landC + 1}, then to row ${ultR + 1}`
            : `Move tile ${bestTile} to row ${landR + 1}, then to column ${ultC + 1}`;
      }
    }
  }

  // Normalize the returned delta to the in-grid direction of travel
  // (same permutation mod w/h) so the slide animation glides the tile
  // straight to its target box rather than wrapping across the edge.
  const inGridDelta = move.axis === "row" ? landC - curC : landR - curR;
  const outMove: SixteenMove =
    inGridDelta === move.delta ? move : { ...move, delta: inGridDelta };

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
