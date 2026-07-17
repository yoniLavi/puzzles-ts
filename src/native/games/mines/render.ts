/**
 * Rendering for Mines (`game_redraw` + `draw_tile`, mines.c:2976/3119).
 *
 * Palette index-for-index with the C `enum` (design/task 6.1). Geometry uses
 * the **web build's** `NARROW_BORDERS` variant (`BORDER = max(ts*3/20, 1)`,
 * playbook §3.2) since that is what the browser actually showed.
 *
 * The two ui-derived overlays — the mouse-down highlight radius and the "too
 * many flags" wrong-number tint — are folded into each tile's cache value `v`
 * (exactly as the C does), so they live *in* the diff key and repaint/clear on
 * their own frames (design D8, playbook §3.2). The paint-twice test in
 * `mines.test.ts` guards that.
 */

import { drawRecessedBorder } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { coord } from "../../engine/geometry.ts";
import { FLAG, KILLED, type MinesState, type MinesUi } from "./state.ts";

// --- palette (upstream enum order, mines.c:24) -------------------------
export const COL_BACKGROUND = 0;
export const COL_BACKGROUND2 = 1;
export const COL_1 = 2;
export const COL_2 = 3;
export const COL_3 = 4;
export const COL_4 = 5;
export const COL_5 = 6;
export const COL_6 = 7;
export const COL_7 = 8;
export const COL_8 = 9;
export const COL_MINE = 10;
export const COL_BANG = 11;
export const COL_CROSS = 12;
export const COL_FLAG = 13;
export const COL_FLAGBASE = 14;
export const COL_QUERY = 15;
export const COL_HIGHLIGHT = 16;
export const COL_LOWLIGHT = 17;
export const COL_WRONGNUMBER = 18;
export const COL_CURSOR = 19;
export const NCOLOURS = 20;

export const PREFERRED_TILE_SIZE = 20;
const FLASH_FRAME = 0.13;

/** The web build defines `NARROW_BORDERS`, so `BORDER = max(ts*3/20, 1)`
 * (mines.c:37) — not the desktop default of `ts*3/2`. */
export function borderFor(tileSize: number): number {
  return Math.max(Math.floor((tileSize * 3) / 20), 1);
}
function outerHighlightWidth(border: number): number {
  return Math.max(border - 1, 1);
}
function highlightWidth(tileSize: number): number {
  return Math.max(Math.floor(tileSize / 10), 1);
}

export interface MinesDrawState {
  w: number;
  h: number;
  tileSize: number;
  started: boolean;
  /** Per-tile cache of the last-drawn value `v` (-99 = never drawn). */
  grid: Int8Array;
  /** Last-drawn flash background colour index (-1 = undecided). */
  bg: number;
  /** Last-drawn cursor cell (-1,-1 = none), for the cursor-moved repaint. */
  curX: number;
  curY: number;
}

export function newDrawState(s: MinesState): MinesDrawState {
  return {
    w: s.w,
    h: s.h,
    tileSize: 0,
    started: false,
    grid: new Int8Array(s.w * s.h).fill(-99),
    bg: -1,
    curX: -1,
    curY: -1,
  };
}

export function setTileSize(ds: MinesDrawState, tileSize: number): void {
  ds.tileSize = tileSize;
}

export function computeSize(
  p: { w: number; h: number },
  tileSize: number,
): { w: number; h: number } {
  const border = borderFor(tileSize);
  return { w: border * 2 + tileSize * p.w, h: border * 2 + tileSize * p.h };
}

// --- one tile (upstream draw_tile, mines.c:2976) -----------------------

function setcoord(
  coords: number[],
  n: number,
  x: number,
  y: number,
  ts: number,
  dx: number,
  dy: number,
): void {
  coords[n * 2 + 0] = x + Math.trunc(ts * dx);
  coords[n * 2 + 1] = y + Math.trunc(ts * dy);
}

function poly(flat: number[], count: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) pts.push({ x: flat[i * 2], y: flat[i * 2 + 1] });
  return pts;
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  v: number,
  bg: number,
): void {
  const hw = highlightWidth(ts);
  if (v < 0) {
    const coords: number[] = [];
    if (v === -22 || v === -23 || v === -24) {
      v += 20;
      // Highlighted (pressed): flat fill, no bevel.
      dr.drawRect({ x, y, w: ts, h: ts }, bg === COL_BACKGROUND ? COL_BACKGROUND2 : bg);
      dr.drawLine({ x, y }, { x: x + ts - 1, y }, COL_LOWLIGHT, 1);
      dr.drawLine({ x, y }, { x, y: y + ts - 1 }, COL_LOWLIGHT, 1);
    } else {
      // Raised (covered) tile: two bevel triangles + inner bg rect.
      coords[0] = x + ts - 1;
      coords[1] = y + ts - 1;
      coords[2] = x + ts - 1;
      coords[3] = y;
      coords[4] = x;
      coords[5] = y + ts - 1;
      dr.drawPolygon(poly(coords, 3), COL_LOWLIGHT, COL_LOWLIGHT);
      coords[0] = x;
      coords[1] = y;
      dr.drawPolygon(poly(coords, 3), COL_HIGHLIGHT, COL_HIGHLIGHT);
      dr.drawRect({ x: x + hw, y: y + hw, w: ts - 2 * hw, h: ts - 2 * hw }, bg);
    }

    if (v === FLAG) {
      // A flag.
      setcoord(coords, 0, x, y, ts, 0.6, 0.35);
      setcoord(coords, 1, x, y, ts, 0.6, 0.7);
      setcoord(coords, 2, x, y, ts, 0.8, 0.8);
      setcoord(coords, 3, x, y, ts, 0.25, 0.8);
      setcoord(coords, 4, x, y, ts, 0.55, 0.7);
      setcoord(coords, 5, x, y, ts, 0.55, 0.35);
      dr.drawPolygon(poly(coords, 6), COL_FLAGBASE, COL_FLAGBASE);
      setcoord(coords, 0, x, y, ts, 0.6, 0.2);
      setcoord(coords, 1, x, y, ts, 0.6, 0.5);
      setcoord(coords, 2, x, y, ts, 0.2, 0.35);
      dr.drawPolygon(poly(coords, 3), COL_FLAG, COL_FLAG);
    } else if (v === -3) {
      // A question mark (this frontend never sets one, but be faithful).
      dr.drawText(
        { x: x + Math.floor(ts / 2), y: y + Math.floor(ts / 2) },
        {
          align: "center",
          baseline: "mathematical",
          fontType: "variable",
          size: Math.floor((ts * 6) / 8),
        },
        COL_QUERY,
        "?",
      );
    } else if (v === -4) {
      // The 'click here' cross marking the safe first-click location.
      const c0 = Math.floor(ts / 4);
      const c1 = ts - 1 - c0;
      dr.drawLine({ x: x + c0, y: y + c0 }, { x: x + c1, y: y + c1 }, COL_MINE, 1);
      dr.drawLine({ x: x + c0, y: y + c1 }, { x: x + c1, y: y + c0 }, COL_MINE, 1);
    }
  } else {
    // Open tile. `v | 32` is the too-many-flags wrong-number tint.
    let bgcol = bg;
    if (v & 32) {
      bgcol = COL_WRONGNUMBER;
      v &= ~32;
    }
    dr.drawRect(
      { x, y, w: ts, h: ts },
      v === KILLED ? COL_BANG : bgcol === COL_BACKGROUND ? COL_BACKGROUND2 : bgcol,
    );
    dr.drawLine({ x, y }, { x: x + ts - 1, y }, COL_LOWLIGHT, 1);
    dr.drawLine({ x, y }, { x, y: y + ts - 1 }, COL_LOWLIGHT, 1);

    if (v > 0 && v <= 8) {
      dr.drawText(
        { x: x + Math.floor(ts / 2), y: y + Math.floor(ts / 2) },
        {
          align: "center",
          baseline: "mathematical",
          fontType: "variable",
          size: Math.floor((ts * 7) / 8),
        },
        COL_1 - 1 + v,
        String(v),
      );
    } else if (v >= 64) {
      const cx = x + Math.floor(ts / 2);
      const cy = y + Math.floor(ts / 2);
      const r = Math.floor(ts / 2) - 3;
      dr.drawCircle({ x: cx, y: cy }, Math.floor((5 * r) / 6), COL_MINE, COL_MINE);
      dr.drawRect(
        {
          x: cx - Math.floor(r / 6),
          y: cy - r,
          w: 2 * Math.floor(r / 6) + 1,
          h: 2 * r + 1,
        },
        COL_MINE,
      );
      dr.drawRect(
        {
          x: cx - r,
          y: cy - Math.floor(r / 6),
          w: 2 * r + 1,
          h: 2 * Math.floor(r / 6) + 1,
        },
        COL_MINE,
      );
      dr.drawRect(
        {
          x: cx - Math.floor(r / 3),
          y: cy - Math.floor(r / 3),
          w: Math.floor(r / 3),
          h: Math.floor(r / 4),
        },
        COL_HIGHLIGHT,
      );

      if (v === 66) {
        // Cross out an incorrectly-flagged mine.
        for (let dx = -1; dx <= 1; dx++) {
          dr.drawLine(
            { x: x + 3 + dx, y: y + 2 },
            { x: x + ts - 3 + dx, y: y + ts - 2 },
            COL_CROSS,
            1,
          );
          dr.drawLine(
            { x: x + ts - 3 + dx, y: y + 2 },
            { x: x + 3 + dx, y: y + ts - 2 },
            COL_CROSS,
            1,
          );
        }
      }
    }
  }

  dr.drawUpdate({ x, y, w: ts, h: ts });
}

// --- full redraw (upstream game_redraw, mines.c:3119) ------------------

export function redraw(
  dr: GameDrawing,
  ds: MinesDrawState | null,
  _prev: MinesState | null,
  s: MinesState,
  _dir: number,
  ui: MinesUi,
  _animTime: number,
  flashTime: number,
): void {
  if (!ds) return;
  const ts = ds.tileSize;
  const border = borderFor(ts);
  const cx0 = (x: number) => coord(x, ts, border);

  let bg: number;
  if (flashTime) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    if (frame % 2) bg = ui.flashIsDeath ? COL_BACKGROUND : COL_LOWLIGHT;
    else bg = ui.flashIsDeath ? COL_BANG : COL_HIGHLIGHT;
  } else {
    bg = COL_BACKGROUND;
  }

  if (!ds.started) {
    // Recessed area framing the whole puzzle.
    const ohw = outerHighlightWidth(border);
    drawRecessedBorder(
      dr,
      {
        left: cx0(0) - ohw,
        top: cx0(0) - ohw,
        right: cx0(s.w) + ohw - 1,
        bottom: cx0(s.h) + ohw - 1,
      },
      ts,
      COL_HIGHLIGHT,
      COL_LOWLIGHT,
    );
    ds.started = true;
  }

  const cursorX = ui.curVisible ? ui.curX : -1;
  const cursorY = ui.curVisible ? ui.curY : -1;
  const cmoved = cursorX !== ds.curX || cursorY !== ds.curY;

  for (let y = 0; y < ds.h; y++) {
    for (let x = 0; x < ds.w; x++) {
      let v = s.grid[y * ds.w + x];

      if (v >= 0 && v <= 8) {
        // Too-many-flags: count flags around, tint if more than the clue.
        let flags = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (
              nx >= 0 &&
              nx < ds.w &&
              ny >= 0 &&
              ny < ds.h &&
              s.grid[ny * ds.w + nx] === FLAG
            )
              flags++;
          }
        }
        if (flags > v) v |= 32;
      }

      if (v === -2 && x === s.layout.startx && y === s.layout.starty) v = -4;

      if (
        (v === -2 || v === -3 || v === -4) &&
        Math.abs(x - ui.hx) <= ui.hradius &&
        Math.abs(y - ui.hy) <= ui.hradius
      ) {
        v -= 20;
      }

      const cc =
        cmoved &&
        ((x === cursorX && y === cursorY) || (x === ds.curX && y === ds.curY));

      if (ds.grid[y * ds.w + x] !== v || bg !== ds.bg || cc) {
        drawTile(
          dr,
          ts,
          cx0(x),
          cx0(y),
          v,
          x === cursorX && y === cursorY ? COL_CURSOR : bg,
        );
        ds.grid[y * ds.w + x] = v;
      }
    }
  }
  ds.bg = bg;
  ds.curX = cursorX;
  ds.curY = cursorY;
  // (Mine count for the status bar is computed by `statusbarText` in index.ts.)
}
