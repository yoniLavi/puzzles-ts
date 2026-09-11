/**
 * Rendering for Map (upstream `game_colours`, `game_compute_size`,
 * `draw_square`, `draw_error`, `game_redraw`), plus the pixel↔region hit-test
 * helpers `index.ts` uses (kept here so `index → render` is the only dependency
 * direction). The layout is upstream's NARROW_BORDERS one: no border.
 */

import { FOUR_FILLS } from "../../engine/color/colors.ts";
import { ERROR, ERROR_TEXT, INK } from "../../engine/color/palette.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { fromCoord as fromCoordE } from "../../engine/geometry.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_UP,
} from "../../engine/pointer.ts";
import type { Color, Size } from "../../engine/types.ts";
import { BE, LE, type MapData, RE, TE } from "./map-data.ts";
import {
  FLASH_ALL_TO_WHITE,
  FLASH_EACH_TO_WHITE,
  type MapMistake,
  type MapParams,
  type MapState,
  type MapUi,
} from "./state.ts";

// --- palette ---------------------------------------------------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_0 = 2;
export const COL_1 = 3;
export const COL_2 = 4;
export const COL_3 = 5;
export const COL_ERROR = 6;
export const COL_ERRTEXT = 7;
/** Appended past the upstream enum — a wrong-region outline. */
export const COL_MISTAKE = 8;

const FOUR = 4;
const FIVE = 5;

export function colors(defaultBackground: Color): Color[] {
  const ret: Color[] = [];
  ret[COL_BACKGROUND] = defaultBackground;
  ret[COL_GRID] = INK;
  ret[COL_0] = FOUR_FILLS[0];
  ret[COL_1] = FOUR_FILLS[1];
  ret[COL_2] = FOUR_FILLS[2];
  ret[COL_3] = FOUR_FILLS[3];
  ret[COL_ERROR] = ERROR;
  ret[COL_ERRTEXT] = ERROR_TEXT;
  ret[COL_MISTAKE] = ERROR;
  return ret;
}

// --- cache-word flags ------------------------------------------------
// Low bits 0..4 hold the base value `tv*FIVE + bv` (0..24); the rest are flags.

const MISTAKE = 0x20; // bit 5 — the cell belongs to a wrong-colored region
const SHOW_NUMBERS = 0x00004000;
const PENCIL_T_BASE = 0x00080000;
const PENCIL_B_BASE = 0x00008000;
const PENCIL_MASK = 0x007f8000;
const ERR_BASE = 0x00800000;
const ERR_MASK = 0xff800000;

// --- geometry --------------------------------------------------------

function coord(x: number, ts: number): number {
  return x * ts;
}

function fromCoord(px: number, ts: number): number {
  return fromCoordE(px, ts, 0);
}

function epsilonX(button: number): number {
  return button === CURSOR_RIGHT ? 1 : button === CURSOR_LEFT ? -1 : 0;
}

function epsilonY(button: number): number {
  return button === CURSOR_DOWN ? 1 : button === CURSOR_UP ? -1 : 0;
}

/**
 * The region containing a point in tile `(tx, ty)` offset by `(xEps, yEps)` from
 * the tile center — resolving a diagonally-split cell to one of its two
 * regions. Upstream `region_from_logical_coords`.
 */
export function regionFromLogicalCoords(
  map: MapData,
  tx: number,
  ty: number,
  xEps: number,
  yEps: number,
): number {
  const { w, h } = map;
  const wh = w * h;
  if (tx < 0 || tx >= w || ty < 0 || ty >= h) return -1;

  const q = 2 * (xEps > yEps ? 1 : 0) + (-xEps > yEps ? 1 : 0);
  const quadrant = q === 0 ? BE : q === 1 ? LE : q === 2 ? RE : TE;
  return map.map[quadrant * wh + ty * w + tx];
}

/** Upstream `region_from_coords` (pixel → region). */
export function regionFromCoords(
  map: MapData,
  ts: number,
  x: number,
  y: number,
): number {
  const tx = fromCoord(x, ts);
  const ty = fromCoord(y, ts);
  const half = Math.floor(ts / 2);
  return regionFromLogicalCoords(
    map,
    tx,
    ty,
    x - coord(tx, ts) - half,
    y - coord(ty, ts) - half,
  );
}

/** Upstream `region_from_ui_cursor`. */
export function regionFromUiCursor(map: MapData, ui: MapUi): number {
  return regionFromLogicalCoords(
    map,
    ui.cursor.x,
    ui.cursor.y,
    epsilonX(ui.curLastmove),
    epsilonY(ui.curLastmove),
  );
}

// --- draw state ------------------------------------------------------

export interface MapDrawState {
  started: boolean;
  tileSize: number;
  /** Per-cell packed cache word; `-1` forces a repaint. */
  drawn: Int32Array;
  todraw: Int32Array;
  // floating drag/cursor blob
  bl: unknown | null;
  blTileSize: number;
  dragVisible: boolean;
  dragx: number;
  dragy: number;
}

export function computeSize(p: MapParams, tileSize: number): Size {
  return { w: p.w * tileSize + 1, h: p.h * tileSize + 1 };
}

export function newDrawState(s: MapState): MapDrawState {
  const wh = s.params.w * s.params.h;
  return {
    started: false,
    tileSize: 0,
    drawn: new Int32Array(wh).fill(-1),
    todraw: new Int32Array(wh),
    bl: null,
    blTileSize: 0,
    dragVisible: false,
    dragx: -1,
    dragy: -1,
  };
}

export function setTileSize(ds: MapDrawState, tileSize: number): void {
  ds.tileSize = tileSize;
}

// --- flash -----------------------------------------------------------

/** Upstream `flash_length`. */
export function flashLengthFromUi(ui: MapUi): number {
  return ui.flashType === FLASH_EACH_TO_WHITE ? 0.5 : 0.3;
}

// --- drawing ---------------------------------------------------------

function drawError(dr: GameDrawing, ts: number, x: number, y: number): void {
  const r = Math.floor((ts * 2) / 5);
  dr.drawPolygon(
    [
      { x: x - r, y },
      { x, y: y - r },
      { x: x + r, y },
      { x, y: y + r },
    ],
    COL_ERROR,
    COL_GRID,
  );

  // An exclamation mark, hand-drawn (upstream avoids draw_text off-center).
  const xext = Math.floor(ts / 16);
  const yext = Math.floor((ts * 2) / 5) - (xext * 2 + 2);
  dr.drawRect(
    { x: x - xext, y: y - yext, w: xext * 2 + 1, h: yext * 2 + 1 - xext * 3 },
    COL_ERRTEXT,
  );
  dr.drawRect(
    { x: x - xext, y: y + yext - xext * 2 + 1, w: xext * 2 + 1, h: xext * 2 },
    COL_ERRTEXT,
  );
}

function drawSquare(
  dr: GameDrawing,
  ts: number,
  map: MapData,
  x: number,
  y: number,
  vIn: number,
  largeStipples: boolean,
): void {
  const { w, h } = map;
  const wh = w * h;
  const M = map.map;

  const errs = vIn & ERR_MASK;
  const pencil = vIn & PENCIL_MASK;
  const showNumbers = vIn & SHOW_NUMBERS;
  const mistake = vIn & MISTAKE;
  const v = vIn & ~(ERR_MASK | PENCIL_MASK | SHOW_NUMBERS | MISTAKE);
  const tv = Math.floor(v / FIVE);
  const bv = v % FIVE;

  const cx = coord(x, ts);
  const cy = coord(y, ts);
  dr.clip({ x: cx, y: cy, w: ts, h: ts });

  // Base (top) region color.
  dr.drawRect(
    { x: cx, y: cy, w: ts, h: ts },
    tv === FOUR ? COL_BACKGROUND : COL_0 + tv,
  );

  // Second region color if this is a diagonally-divided square.
  if (M[TE * wh + y * w + x] !== M[BE * wh + y * w + x]) {
    const p2x =
      M[LE * wh + y * w + x] === M[TE * wh + y * w + x]
        ? coord(x + 1, ts) + 1
        : coord(x, ts) - 1;
    dr.drawPolygon(
      [
        { x: coord(x, ts) - 1, y: coord(y + 1, ts) + 1 },
        { x: p2x, y: coord(y, ts) - 1 },
        { x: coord(x + 1, ts) + 1, y: coord(y + 1, ts) + 1 },
      ],
      bv === FOUR ? COL_BACKGROUND : COL_0 + bv,
      COL_GRID,
    );
  }

  // Pencil-mark stipples (a square formation; FOUR == 4).
  const te = M[TE * wh + y * w + x];
  for (let yo = 0; yo < 4; yo++)
    for (let xo = 0; xo < 4; xo++) {
      const e =
        yo < xo && yo < 3 - xo ? TE : yo > xo && yo > 3 - xo ? BE : xo < 2 ? LE : RE;
      const ee = M[e * wh + y * w + x];

      if (xo !== (yo * 2 + 1) % 5) continue;
      const c = yo;

      if (!(pencil & ((ee === te ? PENCIL_T_BASE : PENCIL_B_BASE) << c))) continue;
      if (yo === xo && M[TE * wh + y * w + x] !== M[LE * wh + y * w + x]) continue;
      if (yo === 3 - xo && M[TE * wh + y * w + x] !== M[RE * wh + y * w + x]) continue;

      dr.drawCircle(
        {
          x: coord(x, ts) + Math.floor(((xo + 1) * ts) / 5),
          y: coord(y, ts) + Math.floor(((yo + 1) * ts) / 5),
        },
        largeStipples ? Math.floor(ts / 4) : Math.floor(ts / 7),
        COL_0 + c,
        COL_0 + c,
      );
    }

  // Grid lines on region boundaries.
  if (x <= 0 || M[RE * wh + y * w + (x - 1)] !== M[LE * wh + y * w + x])
    dr.drawRect({ x: cx, y: cy, w: 1, h: ts }, COL_GRID);
  if (y <= 0 || M[BE * wh + (y - 1) * w + x] !== M[TE * wh + y * w + x])
    dr.drawRect({ x: cx, y: cy, w: ts, h: 1 }, COL_GRID);
  if (
    x <= 0 ||
    y <= 0 ||
    M[RE * wh + (y - 1) * w + (x - 1)] !== M[TE * wh + y * w + x] ||
    M[BE * wh + (y - 1) * w + (x - 1)] !== M[LE * wh + y * w + x]
  )
    dr.drawRect({ x: cx, y: cy, w: 1, h: 1 }, COL_GRID);

  // Error markers.
  for (let yo = 0; yo < 3; yo++)
    for (let xo = 0; xo < 3; xo++)
      if (errs & (ERR_BASE << (yo * 3 + xo)))
        drawError(
          dr,
          ts,
          Math.floor((coord(x, ts) * 2 + ts * xo) / 2),
          Math.floor((coord(y, ts) * 2 + ts * yo) / 2),
        );

  // Region numbers, if desired.
  if (showNumbers) {
    let oldj = -1;
    for (let i = 0; i < 2; i++) {
      const j = M[(i ? BE : TE) * wh + y * w + x];
      if (oldj === j) continue;
      oldj = j;
      const xo = map.regionx[j] - 2 * x;
      const yo = map.regiony[j] - 2 * y;
      if (xo >= 0 && xo <= 2 && yo >= 0 && yo <= 2) {
        dr.drawText(
          {
            x: Math.floor((coord(x, ts) * 2 + ts * xo) / 2),
            y: Math.floor((coord(y, ts) * 2 + ts * yo) / 2),
          },
          {
            align: "center",
            baseline: "mathematical",
            fontType: "variable",
            size: Math.floor((3 * ts) / 5),
          },
          COL_GRID,
          String(j),
        );
      }
    }
  }

  // Mistake overlay (deliberate divergence): a red inset outline on a cell of a
  // wrong-colored region.
  if (mistake) {
    const inset = Math.max(1, Math.floor(ts / 12));
    const t = Math.max(1, Math.floor(ts / 16));
    const x0 = cx + inset;
    const y0 = cy + inset;
    const bw = ts - 2 * inset;
    dr.drawRect({ x: x0, y: y0, w: bw, h: t }, COL_MISTAKE);
    dr.drawRect({ x: x0, y: y0 + bw - t, w: bw, h: t }, COL_MISTAKE);
    dr.drawRect({ x: x0, y: y0, w: t, h: bw }, COL_MISTAKE);
    dr.drawRect({ x: x0 + bw - t, y: y0, w: t, h: bw }, COL_MISTAKE);
  }

  dr.unclip();
  dr.drawUpdate({ x: cx, y: cy, w: ts, h: ts });
}

export function redraw(
  dr: GameDrawing,
  ds: MapDrawState,
  _prev: MapState | null,
  s: MapState,
  _dir: number,
  ui: MapUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly MapMistake[],
): void {
  const { w, h } = s.params;
  const n = s.params.n;
  const wh = w * h;
  const ts = ds.tileSize;
  const map = s.map;
  const M = map.map;

  // Erase a previous floating blob.
  if (ds.dragVisible) {
    dr.blitterLoad(ds.bl, { x: ds.dragx, y: ds.dragy });
    dr.drawUpdate({ x: ds.dragx, y: ds.dragy, w: ts + 3, h: ts + 3 });
    ds.dragVisible = false;
  }

  if (!ds.started) {
    dr.drawRect(
      { x: coord(0, ts), y: coord(0, ts), w: w * ts + 1, h: h * ts + 1 },
      COL_GRID,
    );
    dr.drawUpdate({ x: coord(0, ts), y: coord(0, ts), w: w * ts + 1, h: h * ts + 1 });
    ds.started = true;
  }

  // Flash phase.
  let flash = -1;
  if (flashTime) {
    const len = flashLengthFromUi(ui);
    if (ui.flashType === FLASH_EACH_TO_WHITE)
      flash = Math.floor((flashTime * FOUR) / len);
    else flash = 1 + Math.floor((flashTime * (FOUR - 1)) / len);
  }

  const mistakeSet = new Set<number>();
  if (mistakes) for (const m of mistakes) mistakeSet.add(m.region);

  // Build the `todraw` array.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const tRegion = M[TE * wh + y * w + x];
      const bRegion = M[BE * wh + y * w + x];
      let tv = s.coloring[tRegion];
      let bv = s.coloring[bRegion];
      if (tv < 0) tv = FOUR;
      if (bv < 0) bv = FOUR;

      if (flash >= 0) {
        if (ui.flashType === FLASH_EACH_TO_WHITE) {
          if (tv === flash) tv = FOUR;
          if (bv === flash) bv = FOUR;
        } else if (ui.flashType === FLASH_ALL_TO_WHITE) {
          if (flash % 2) {
            tv = FOUR;
            bv = FOUR;
          }
        } else {
          if (tv !== FOUR) tv = (tv + flash) % FOUR;
          if (bv !== FOUR) bv = (bv + flash) % FOUR;
        }
      }

      let v = tv * FIVE + bv;

      for (let i = 0; i < FOUR; i++) {
        if (s.coloring[tRegion] < 0 && s.pencil[tRegion] & (1 << i))
          v |= PENCIL_T_BASE << i;
        if (s.coloring[bRegion] < 0 && s.pencil[bRegion] & (1 << i))
          v |= PENCIL_B_BASE << i;
      }

      if (ui.showNumbers) v |= SHOW_NUMBERS;
      if (mistakeSet.has(tRegion) || mistakeSet.has(bRegion)) v |= MISTAKE;

      ds.todraw[y * w + x] = v;
    }

  // Overlay adjacency error markers.
  for (let i = 0; i < map.ngraph; i++) {
    const v1 = Math.floor(map.graph[i] / n);
    const v2 = map.graph[i] % n;
    if (s.coloring[v1] < 0 || s.coloring[v2] < 0) continue;
    if (s.coloring[v1] !== s.coloring[v2]) continue;

    let ex = map.edgex[i];
    let ey = map.edgey[i];
    const xo = ex % 2;
    ex = Math.floor(ex / 2);
    const yo = ey % 2;
    ey = Math.floor(ey / 2);

    ds.todraw[ey * w + ex] |= ERR_BASE << (yo * 3 + xo);
    if (xo === 0) ds.todraw[ey * w + (ex - 1)] |= ERR_BASE << (yo * 3 + 2);
    if (yo === 0) ds.todraw[(ey - 1) * w + ex] |= ERR_BASE << (2 * 3 + xo);
    if (xo === 0 && yo === 0)
      ds.todraw[(ey - 1) * w + (ex - 1)] |= ERR_BASE << (2 * 3 + 2);
  }

  // Draw changed cells.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = ds.todraw[y * w + x];
      if (ds.drawn[y * w + x] !== v) {
        drawSquare(dr, ts, map, x, y, v, ui.largeStipples);
        ds.drawn[y * w + x] = v;
      }
    }

  // Floating drag/cursor blob.
  if (ui.dragColor > -2 || ui.cursor.visible) {
    let bg: number;
    let iscur = false;
    if (ui.dragColor >= 0) bg = COL_0 + ui.dragColor;
    else if (ui.dragColor === -1) bg = COL_BACKGROUND;
    else {
      const r = regionFromUiCursor(map, ui);
      const c = r < 0 ? -1 : s.coloring[r];
      bg = c < 0 ? COL_BACKGROUND : COL_0 + c;
      iscur = true;
    }

    let cursorX: number;
    let cursorY: number;
    if (ui.cursor.visible) {
      cursorX = coord(ui.cursor.x, ts) + Math.floor(ts / 2) + epsilonX(ui.curLastmove);
      cursorY = coord(ui.cursor.y, ts) + Math.floor(ts / 2) + epsilonY(ui.curLastmove);
    } else {
      cursorX = ui.dragx;
      cursorY = ui.dragy;
    }

    // Lazily (re)allocate the blitter for the current tile size.
    if (!ds.bl || ds.blTileSize !== ts) {
      if (ds.bl) dr.blitterFree(ds.bl);
      ds.bl = dr.blitterNew({ w: ts + 3, h: ts + 3 });
      ds.blTileSize = ts;
    }

    ds.dragx = cursorX - Math.floor(ts / 2) - 2;
    ds.dragy = cursorY - Math.floor(ts / 2) - 2;
    dr.blitterSave(ds.bl, { x: ds.dragx, y: ds.dragy });
    dr.drawCircle(
      { x: cursorX, y: cursorY },
      iscur ? Math.floor(ts / 4) : Math.floor(ts / 2),
      bg,
      COL_GRID,
    );
    for (let i = 0; i < FOUR; i++)
      if (ui.dragPencil & (1 << i))
        dr.drawCircle(
          {
            x: cursorX + Math.trunc(((((i * 4 + 2) % 10) - 3) * ts) / 10),
            y: cursorY + Math.trunc(((i * 2 - 3) * ts) / 10),
          },
          Math.floor(ts / 8),
          COL_0 + i,
          COL_0 + i,
        );
    dr.drawUpdate({ x: ds.dragx, y: ds.dragy, w: ts + 3, h: ts + 3 });
    ds.dragVisible = true;
  }
}
