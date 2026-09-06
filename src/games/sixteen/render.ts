/**
 * Sixteen's renderer: the beveled tiles, the gutter arrows that mark which row
 * or column a click will slide, the hint's two-leg preview, and the toroidal
 * slide animation.
 *
 * The board's pixel origin lives here and `interpretMove` imports it — one
 * function, both callers (`docs/games/mechanics.md`).
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import { HINT_ACTION, INK } from "../../engine/color/palette.ts";
import { drawRecessedBorder as drawBevel } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { coord as coordE, fromCoord as fromCoordE } from "../../engine/geometry.ts";
import type { Color, Point, Size } from "../../engine/types.ts";
import type { SixteenMove, SixteenParams, SixteenState, SixteenUi } from "./state.ts";

// --- constants --------------------------------------------------------

export const PREFERRED_TILE_SIZE = 48;
export const ANIM_TIME = 0.4;
export const FLASH_FRAME = 0.13;
const HIGHLIGHT_WIDTH_DIV = 20;

// --- color indices ---------------------------------------------------

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

// --- coordinate helpers -----------------------------------------------

function coord(pos: number, ts: number): number {
  return coordE(pos, ts, border(ts));
}

export function fromCoord(pixel: number, ts: number): number {
  return fromCoordE(pixel, ts, border(ts));
}

function border(ts: number): number {
  return ts;
}

// --- drawing ----------------------------------------------------------

export interface SixteenDrawState {
  started: boolean;
  w: number;
  h: number;
  bgcolor: number;
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

export function newDrawState(state: SixteenState): SixteenDrawState {
  return {
    started: false,
    w: state.w,
    h: state.h,
    bgcolor: COL_BACKGROUND,
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

export function computeSize(p: SixteenParams, ts: number): Size {
  const b = border(ts);
  return {
    w: ts * p.w + 2 * b,
    h: ts * p.h + 2 * b,
  };
}

export function colors(defaultBackground: Color): Color[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Color[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_TEXT] = INK;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_HINT] = HINT_ACTION;
  return out;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: redraw with mid-slide interpolation: every tile can be in one of several animation phases.
export function redraw(
  dr: GameDrawing,
  ds: SixteenDrawState,
  prev: SixteenState | null,
  state: SixteenState,
  dir: number,
  ui: SixteenUi,
  animTime: number,
  flashTime: number,
  activeHint?: HintStep<SixteenMove, SixteenHintHighlights>,
): void {
  const ts = ds.tilesize;
  const hw = Math.max(1, Math.floor(ts / HIGHLIGHT_WIDTH_DIV));

  let bgcolor = COL_BACKGROUND;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgcolor = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
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
  if (ui.cursor.visible) {
    curX = ui.cursor.x;
    curY = ui.cursor.y;
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
      ds.bgcolor !== bgcolor ||
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
        drawX2 === -1 && tileCursor(i, state, curX, curY) ? COL_LOWLIGHT : bgcolor;
      if (hintTile !== null && t === hintTile) {
        tileBg = COL_HINT;
      }
      drawTile(dr, ts, hw, drawX, drawY, t, tileBg);

      if (drawX2 !== -1 || drawY2 !== -1) {
        let wrapBg = bgcolor;
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
  ds.bgcolor = bgcolor;
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
  bgColor: number,
): void {
  if (tile === 0) {
    dr.drawRect({ x, y, w: ts, h: ts }, bgColor);
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
    // Center fill.
    dr.drawRect({ x: x + hw, y: y + hw, w: ts - 2 * hw, h: ts - 2 * hw }, bgColor);
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
  fillColor: number,
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

  dr.drawPolygon(coords, fillColor, COL_TEXT);
}

function drawArrowAt(
  dr: GameDrawing,
  ts: number,
  w: number,
  h: number,
  ax: number,
  ay: number,
  fillColor: number,
): void {
  if (ax === -1) {
    drawArrow(dr, ts, coord(0, ts), coord(ay + 1, ts), 0, -1, fillColor);
  } else if (ax === w) {
    drawArrow(dr, ts, coord(w, ts), coord(ay, ts), 0, 1, fillColor);
  } else if (ay === -1) {
    drawArrow(dr, ts, coord(ax, ts), coord(0, ts), 1, 0, fillColor);
  } else if (ay === h) {
    drawArrow(dr, ts, coord(ax + 1, ts), coord(h, ts), -1, 0, fillColor);
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
  color: number,
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
      dr.drawRect({ x: cx, y, w, h: b }, color);
    }
    // Draw bottom border (horizontal)
    for (let cx = x; cx < x + ts; cx += step) {
      const w = Math.min(dashLen, x + ts - cx);
      dr.drawRect({ x: cx, y: y + ts - b, w, h: b }, color);
    }
    // Draw left border (vertical)
    for (let cy = y + b; cy < y + ts - b; cy += step) {
      const h = Math.min(dashLen, y + ts - b - cy);
      dr.drawRect({ x, y: cy, w: b, h }, color);
    }
    // Draw right border (vertical)
    for (let cy = y + b; cy < y + ts - b; cy += step) {
      const h = Math.min(dashLen, y + ts - b - cy);
      dr.drawRect({ x: x + ts - b, y: cy, w: b, h }, color);
    }
  } else {
    // Draw outline: top, bottom, left, right.
    dr.drawRect({ x, y, w: ts, h: b }, color);
    dr.drawRect({ x, y: y + ts - b, w: ts, h: b }, color);
    dr.drawRect({ x, y: y + b, w: b, h: ts - 2 * b }, color);
    dr.drawRect({ x: x + ts - b, y: y + b, w: b, h: ts - 2 * b }, color);
  }
  dr.drawUpdate({ x, y, w: ts, h: ts });
}

/** Draw or erase a hint highlight for a tile. Source tiles are highlighted
 * with a filled color using drawTile (keeping the number visible), while
 * target positions are highlighted with a 3-pixel border. */
function drawHintOverlay(
  dr: GameDrawing,
  ts: number,
  hw: number,
  state: SixteenState,
  pos: number,
  color: number,
  isTarget: boolean,
): void {
  const x = coord(pos % state.w, ts);
  const y = coord(Math.floor(pos / state.w), ts);
  const tile = state.tiles[pos];

  if (color === COL_BACKGROUND) {
    // Erase highlight: just redraw the tile with normal background.
    drawTile(dr, ts, hw, x, y, tile, COL_BACKGROUND);
  } else if (isTarget) {
    // Draw target border.
    drawHintBorder(dr, ts, state, pos, color);
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
