/**
 * Rendering for Bridges — imperative `redraw` per the post-Flip doctrine
 * (engine emits no pixels; the game's `!ds.started` branch owns the first
 * background fill; a per-tile `Int32Array` diff cache drives incremental
 * repaints).
 *
 * This is a faithful port of the upstream packed-word draw model
 * (`bridges.c` game_redraw + draw_* helpers): each tile's cache entry is a
 * 28-bit descriptor that encodes not only the tile's own contents but the
 * bridge-stubs intruding from neighbouring islands and the island-arcs
 * intruding from adjacent island tiles. The descriptor *is* the cache key, so
 * "redraw iff `newgrid[i] != grid[i]`" falls straight out.
 *
 * Display code targets neat visuals + clean structure (not byte-fidelity), so
 * the one deliberate divergence is the mistake overlay: `findMistakes` wrong
 * bridges are recoloured with the existing red `COL_WARNING` channel, which
 * lives inside the cache key and therefore repaints clean when the overlay
 * clears.
 */
import type { Colour } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import {
  type BridgesMistake,
  type BridgesParams,
  type BridgesState,
  type BridgesUi,
  G_ISLAND,
  G_LINEH,
  G_LINEV,
  G_MARK,
  G_MARKH,
  G_MARKV,
  G_NOLINEH,
  G_NOLINEV,
  G_WARN,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 24;
export const FLASH_TIME = 0.5;

/** Web build defines NARROW_BORDERS: BORDER = TILE/8 + 1 (bridges.c line 93). */
export function border(tileSize: number): number {
  return Math.floor(tileSize / 8) + 1;
}

// --- Colour enum (bridges.c lines 103-112), index-for-index with C ---
export const COL_BACKGROUND = 0;
export const COL_FOREGROUND = 1;
export const COL_HIGHLIGHT = 2;
export const COL_LOWLIGHT = 3;
export const COL_SELECTED = 4;
export const COL_MARK = 5;
export const COL_HINT = 6;
export const COL_GRID = 7;
export const COL_WARNING = 8;
export const COL_CURSOR = 9;
export const NCOLOURS = 10;

// --- Packed draw-word fields (bridges.c lines 2262-2297) ---
// Line data (6 bits per direction).
const DL_COUNTMASK = 0x07;
const DL_COUNT_CROSS = 0x06;
const DL_COUNT_HINT = 0x07;
const DL_COLMASK = 0x18;
const DL_COL_NORMAL = 0x00;
const DL_COL_WARNING = 0x08;
const DL_COL_FLASH = 0x10;
const DL_COL_SELECTED = 0x18;
const DL_LOCK = 0x20;
const DL_MASK = 0x3f;
// Island data (4 bits per direction).
const DI_COLMASK = 0x03;
const DI_COL_NORMAL = 0x00;
const DI_COL_FLASH = 0x01;
const DI_COL_WARNING = 0x02;
const DI_COL_SELECTED = 0x03;
const DI_BGMASK = 0x0c;
const DI_BG_NO_ISLAND = 0x00;
const DI_BG_NORMAL = 0x04;
const DI_BG_MARK = 0x08;
const DI_BG_CURSOR = 0x0c;
const DI_MASK = 0x0f;
// Shifts within an island square's word.
const D_I_ISLAND_SHIFT = 0;
const D_I_LINE_SHIFT_L = 4;
const D_I_LINE_SHIFT_R = 10;
const D_I_LINE_SHIFT_U = 16;
const D_I_LINE_SHIFT_D = 24;
// Shifts within a line square's word.
const D_L_ISLAND_SHIFT_L = 0;
const D_L_ISLAND_SHIFT_R = 4;
const D_L_ISLAND_SHIFT_U = 8;
const D_L_ISLAND_SHIFT_D = 12;
const D_L_LINE_SHIFT_H = 16;
const D_L_LINE_SHIFT_V = 22;

export interface BridgesDrawState {
  started: boolean;
  tileSize: number;
  w: number;
  h: number;
  /** Per-cell packed draw descriptor from the last paint; -1 forces a redraw. */
  grid: Int32Array;
  /** Scratch descriptor grid for the current frame (avoids per-frame alloc). */
  newgrid: Int32Array;
  dragging: boolean;
}

export function newDrawState(state: BridgesState): BridgesDrawState {
  const n = state.w * state.h;
  return {
    started: false,
    tileSize: PREFERRED_TILE_SIZE,
    w: state.w,
    h: state.h,
    grid: new Int32Array(n).fill(-1),
    newgrid: new Int32Array(n),
    dragging: false,
  };
}

export function setTileSize(ds: BridgesDrawState, tileSize: number): void {
  if (ds.tileSize === tileSize) return;
  ds.tileSize = tileSize;
  ds.started = false;
  ds.grid.fill(-1);
}

export function computeSize(
  p: BridgesParams,
  tileSize: number,
): { w: number; h: number } {
  const b = border(tileSize);
  return { w: p.w * tileSize + 2 * b, h: p.h * tileSize + 2 * b };
}

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const [br, bgc, bb] = background;
  // COL_HINT = COL_LOWLIGHT; COL_GRID = (HINT + BACKGROUND) / 2; COL_MARK = HIGHLIGHT.
  const grid: Colour = [
    (lowlight[0] + br) / 2,
    (lowlight[1] + bgc) / 2,
    (lowlight[2] + bb) / 2,
  ];
  // COL_CURSOR: red channel brightened, green/blue dimmed (bridges.c 2742-2744).
  const cursor: Colour = [Math.min(br * 1.4, 1), bgc * 0.8, bb * 0.8];
  return [
    background, // COL_BACKGROUND
    [0, 0, 0], // COL_FOREGROUND
    highlight, // COL_HIGHLIGHT
    lowlight, // COL_LOWLIGHT
    [0.25, 1, 0.25], // COL_SELECTED
    highlight, // COL_MARK (= HIGHLIGHT)
    lowlight, // COL_HINT (= LOWLIGHT)
    grid, // COL_GRID
    [1, 0.25, 0.25], // COL_WARNING (also the mistake overlay colour)
    cursor, // COL_CURSOR
  ];
}

// --- geometry helpers (all args positive, so integer division is trunc) ---
const div = (a: number, b: number): number => Math.trunc(a / b);
const coord = (x: number, ts: number, b: number): number => x * ts + b;
const lineWidth = (ts: number): number => div(ts, 8);
const ts8 = (x: number, ts: number): number => div(x * ts, 8);
const offset = (thing: number, ts: number): number => div(ts, 2) - div(thing, 2);
const islandRadius = (ts: number): number => div(ts * 12, 20);
const islandNumsize = (clue: number, ts: number): number =>
  clue < 10 ? div(ts * 7, 10) : div(ts * 5, 10);

/** WITHIN(x,min,max) — inclusive, order-independent (bridges.c line 200). */
function within(x: number, a: number, b: number): boolean {
  return a > b ? x >= b && x <= a : x >= a && x <= b;
}

/** Is (sx,sy) on the straight span strictly between two islands in dir (dx,dy)? */
function betweenIsland(
  st: BridgesState,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
): boolean {
  let x = sx - dx;
  let y = sy - dy;
  let found = false;
  while (st.inGrid(x, y)) {
    if (st.gridAt(x, y) & G_ISLAND) {
      found = true;
      break;
    }
    x -= dx;
    y -= dy;
  }
  if (!found) return false;
  x = sx + dx;
  y = sy + dy;
  while (st.inGrid(x, y)) {
    if (st.gridAt(x, y) & G_ISLAND) return true;
    x += dx;
    y += dy;
  }
  return false;
}

function linesLvlh(
  st: BridgesState,
  ui: BridgesUi,
  x: number,
  y: number,
  v: number,
): [number, number] {
  const c = st.idx(x, y);
  let lv = v & G_LINEV ? st.lines[c] : 0;
  let lh = v & G_LINEH ? st.lines[c] : 0;
  if (ui.showHints) {
    if (betweenIsland(st, x, y, 0, 1) && !lv) lv = 1;
    if (betweenIsland(st, x, y, 1, 0) && !lh) lh = 1;
  }
  return [lv, lh];
}

// --- primitive drawing (bridges.c draw_cross/draw_general_line/…) ---

function drawCross(
  dr: GameDrawing,
  ts: number,
  ox: number,
  oy: number,
  col: number,
): void {
  const off = ts8(2, ts);
  dr.drawLine({ x: ox, y: oy }, { x: ox + off, y: oy + off }, col, 1);
  dr.drawLine({ x: ox + off, y: oy }, { x: ox, y: oy + off }, col, 1);
}

/**
 * Draw one direction of lines in a square. fx,fy is the 'forward' direction
 * (along the lines); ax,ay the 'across' direction. `which & 1` draws the white
 * locked-bridge backing; `which & 2` draws the bridges themselves (so two
 * overlapping locked bridges don't erase each other).
 */
function drawGeneralLine(
  dr: GameDrawing,
  ts: number,
  ox: number,
  oy: number,
  fx: number,
  fy: number,
  ax: number,
  ay: number,
  len: number,
  ldata: number,
  which: number,
): void {
  const count = ldata & DL_COUNTMASK;
  const fg =
    count === DL_COUNT_HINT
      ? COL_HINT
      : (ldata & DL_COLMASK) === DL_COL_SELECTED
        ? COL_SELECTED
        : (ldata & DL_COLMASK) === DL_COL_FLASH
          ? COL_HIGHLIGHT
          : (ldata & DL_COLMASK) === DL_COL_WARNING
            ? COL_WARNING
            : COL_FOREGROUND;

  if (count === DL_COUNT_CROSS) {
    drawCross(
      dr,
      ts,
      ox + ts8(1, ts) * fx + ts8(3, ts) * ax,
      oy + ts8(1, ts) * fy + ts8(3, ts) * ay,
      fg,
    );
    drawCross(
      dr,
      ts,
      ox + ts8(5, ts) * fx + ts8(3, ts) * ax,
      oy + ts8(5, ts) * fy + ts8(3, ts) * ay,
      fg,
    );
  } else if (count !== 0) {
    let lh = count;
    if (lh === DL_COUNT_HINT) lh = 1;
    const lw = lineWidth(ts);
    let gw = lineWidth(ts);
    // Shrink the inter-bridge gap until the whole bundle fits the tile.
    let bw = lw * lh + gw * (lh + 1);
    while (bw > ts) {
      gw--;
      bw = lw * lh + gw * (lh + 1);
    }
    let loff = offset(bw, ts);
    if (which & 1) {
      if (ldata & DL_LOCK && fg !== COL_HINT) {
        dr.drawRect(
          {
            x: ox + loff * ax,
            y: oy + loff * ay,
            w: len * fx + bw * ax,
            h: len * fy + bw * ay,
          },
          COL_MARK,
        );
      }
    }
    if (which & 2) {
      for (let i = 0; i < lh; i++, loff += lw + gw) {
        dr.drawRect(
          {
            x: ox + (loff + gw) * ax,
            y: oy + (loff + gw) * ay,
            w: len * fx + lw * ax,
            h: len * fy + lw * ay,
          },
          fg,
        );
      }
    }
  }
}

function drawHline(
  dr: GameDrawing,
  ts: number,
  ox: number,
  oy: number,
  w: number,
  vdata: number,
  which: number,
): void {
  drawGeneralLine(dr, ts, ox, oy, 1, 0, 0, 1, w, vdata, which);
}

function drawVline(
  dr: GameDrawing,
  ts: number,
  ox: number,
  oy: number,
  h: number,
  vdata: number,
  which: number,
): void {
  drawGeneralLine(dr, ts, ox, oy, 0, 1, 1, 0, h, vdata, which);
}

function drawIsland(
  dr: GameDrawing,
  ts: number,
  ox: number,
  oy: number,
  clue: number,
  idata: number,
): void {
  if ((idata & DI_BGMASK) === DI_BG_NO_ISLAND) return;
  const half = div(ts, 2);
  const orad = islandRadius(ts);
  const irad = orad - lineWidth(ts);
  const fg =
    (idata & DI_COLMASK) === DI_COL_SELECTED
      ? COL_SELECTED
      : (idata & DI_COLMASK) === DI_COL_WARNING
        ? COL_WARNING
        : (idata & DI_COLMASK) === DI_COL_FLASH
          ? COL_HIGHLIGHT
          : COL_FOREGROUND;
  const bg =
    (idata & DI_BGMASK) === DI_BG_CURSOR
      ? COL_CURSOR
      : (idata & DI_BGMASK) === DI_BG_MARK
        ? COL_MARK
        : COL_BACKGROUND;

  dr.drawCircle({ x: ox + half, y: oy + half }, orad, fg, fg);
  dr.drawCircle({ x: ox + half, y: oy + half }, irad, bg, bg);

  if (clue > 0) {
    const textcolour = fg === COL_SELECTED ? COL_FOREGROUND : fg;
    dr.drawText(
      { x: ox + half, y: oy + half },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: islandNumsize(clue, ts),
      },
      textcolour,
      String(clue),
    );
  }
}

function drawIslandTile(
  dr: GameDrawing,
  ts: number,
  b: number,
  x: number,
  y: number,
  clue: number,
  data: number,
): void {
  const ox = coord(x, ts, b);
  const oy = coord(y, ts, b);
  dr.clip({ x: ox, y: oy, w: ts, h: ts });
  dr.drawRect({ x: ox, y: oy, w: ts, h: ts }, COL_BACKGROUND);
  const half = div(ts, 2);
  for (let which = 1; which <= 2; which <<= 1) {
    drawHline(dr, ts, ox, oy, half, (data >> D_I_LINE_SHIFT_L) & DL_MASK, which);
    drawHline(
      dr,
      ts,
      ox + ts - half,
      oy,
      half,
      (data >> D_I_LINE_SHIFT_R) & DL_MASK,
      which,
    );
    drawVline(dr, ts, ox, oy, half, (data >> D_I_LINE_SHIFT_U) & DL_MASK, which);
    drawVline(
      dr,
      ts,
      ox,
      oy + ts - half,
      half,
      (data >> D_I_LINE_SHIFT_D) & DL_MASK,
      which,
    );
  }
  drawIsland(dr, ts, ox, oy, clue, (data >> D_I_ISLAND_SHIFT) & DI_MASK);
  dr.unclip();
  dr.drawUpdate({ x: ox, y: oy, w: ts, h: ts });
}

function drawLineTile(
  dr: GameDrawing,
  ts: number,
  b: number,
  x: number,
  y: number,
  data: number,
): void {
  const ox = coord(x, ts, b);
  const oy = coord(y, ts, b);
  dr.clip({ x: ox, y: oy, w: ts, h: ts });
  dr.drawRect({ x: ox, y: oy, w: ts, h: ts }, COL_BACKGROUND);
  const hdata = (data >> D_L_LINE_SHIFT_H) & DL_MASK;
  const vdata = (data >> D_L_LINE_SHIFT_V) & DL_MASK;
  // Hint lines at the bottom, then crosses, then bridges — a straight compare
  // of the count fields gives that order (DL_COUNTMASK enumeration).
  if ((hdata & DL_COUNTMASK) > (vdata & DL_COUNTMASK)) {
    drawHline(dr, ts, ox, oy, ts, hdata, 3);
    drawVline(dr, ts, ox, oy, ts, vdata, 3);
  } else {
    drawVline(dr, ts, ox, oy, ts, vdata, 3);
    drawHline(dr, ts, ox, oy, ts, hdata, 3);
  }
  // Islands intruding from the four sides (no clue numbers).
  drawIsland(dr, ts, ox - ts, oy, -1, (data >> D_L_ISLAND_SHIFT_L) & DI_MASK);
  drawIsland(dr, ts, ox + ts, oy, -1, (data >> D_L_ISLAND_SHIFT_R) & DI_MASK);
  drawIsland(dr, ts, ox, oy - ts, -1, (data >> D_L_ISLAND_SHIFT_U) & DI_MASK);
  drawIsland(dr, ts, ox, oy + ts, -1, (data >> D_L_ISLAND_SHIFT_D) & DI_MASK);
  dr.unclip();
  dr.drawUpdate({ x: ox, y: oy, w: ts, h: ts });
}

function drawEdgeTile(
  dr: GameDrawing,
  ts: number,
  b: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  data: number,
): void {
  const ox = coord(x, ts, b);
  const oy = coord(y, ts, b);
  let cx = ox;
  let cy = oy;
  let cw = ts;
  let ch = ts;
  const half = div(ts, 2);
  if (dy) {
    if (dy > 0) cy += half;
    ch -= half;
  } else {
    if (dx > 0) cx += half;
    cw -= half;
  }
  dr.clip({ x: cx, y: cy, w: cw, h: ch });
  dr.drawRect({ x: cx, y: cy, w: cw, h: ch }, COL_BACKGROUND);
  drawIsland(
    dr,
    ts,
    ox + ts * dx,
    oy + ts * dy,
    -1,
    (data >> D_I_ISLAND_SHIFT) & DI_MASK,
  );
  dr.unclip();
  dr.drawUpdate({ x: cx, y: cy, w: cw, h: ch });
}

/**
 * Build the mistake mask: a per-cell bit set for every line-square on a wrong
 * bridge span, plus the two endpoint island cells, so they can be recoloured
 * red. Returns a `Uint8Array` (1 = mistake) sized w*h, or null when there are
 * no mistakes.
 */
function buildMistakeMask(
  st: BridgesState,
  mistakes: readonly BridgesMistake[],
): Uint8Array | null {
  if (mistakes.length === 0) return null;
  const mask = new Uint8Array(st.w * st.h);
  for (const m of mistakes) {
    mask[st.idx(m.x1, m.y1)] = 1;
    mask[st.idx(m.x2, m.y2)] = 1;
    const dx = Math.sign(m.x2 - m.x1);
    const dy = Math.sign(m.y2 - m.y1);
    let x = m.x1 + dx;
    let y = m.y1 + dy;
    while (x !== m.x2 || y !== m.y2) {
      mask[st.idx(x, y)] = 1;
      x += dx;
      y += dy;
    }
  }
  return mask;
}

export function redrawBridges(
  dr: GameDrawing,
  ds: BridgesDrawState | null,
  _prev: BridgesState | null,
  s: BridgesState,
  ui: BridgesUi,
  flashTime: number,
  mistakes: readonly BridgesMistake[] = [],
): void {
  if (!ds) return;
  const ts = ds.tileSize;
  const b = border(ts);
  const w = s.w;
  const h = s.h;

  let flash = false;
  if (flashTime) {
    const f = Math.trunc((flashTime * 5) / FLASH_TIME);
    if (f === 1 || f === 3) flash = true;
  }

  if (!ds.started) {
    dr.drawRect({ x: 0, y: 0, w: w * ts + 2 * b, h: h * ts + 2 * b }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: w * ts + 2 * b, h: h * ts + 2 * b });
    ds.started = true;
  }

  let dragSrc: { x: number; y: number } | null = null;
  let dragDst: { x: number; y: number } | null = null;
  if (ui.dragxSrc !== -1 && ui.dragySrc !== -1) {
    ds.dragging = true;
    dragSrc = { x: ui.dragxSrc, y: ui.dragySrc };
    if (ui.dragxDst !== -1 && ui.dragyDst !== -1) {
      dragDst = { x: ui.dragxDst, y: ui.dragyDst };
    }
  } else {
    ds.dragging = false;
  }

  const mistakeMask = buildMistakeMask(s, mistakes);
  const newgrid = ds.newgrid;
  newgrid.fill(0);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const c = s.idx(x, y);
      const v = s.gridAt(x, y);

      if (v & G_ISLAND) {
        const is = s.islandAt(x, y);
        if (!is) continue;
        let idata = 0;
        if (flash) idata |= DI_COL_FLASH;
        else if (
          dragSrc &&
          ((is.x === dragSrc.x && is.y === dragSrc.y) ||
            (dragDst && is.x === dragDst.x && is.y === dragDst.y))
        )
          idata |= DI_COL_SELECTED;
        else if (
          s.islandImpossible(is, (v & G_MARK) !== 0) ||
          v & G_WARN ||
          mistakeMask?.[c]
        )
          idata |= DI_COL_WARNING;
        else idata |= DI_COL_NORMAL;

        if (ui.curVisible && ui.curX === is.x && ui.curY === is.y)
          idata |= DI_BG_CURSOR;
        else if (v & G_MARK) idata |= DI_BG_MARK;
        else idata |= DI_BG_NORMAL;

        newgrid[c] |= idata << D_I_ISLAND_SHIFT;
        if (x > 0 && !(s.gridAt(x - 1, y) & G_ISLAND))
          newgrid[s.idx(x - 1, y)] |= idata << D_L_ISLAND_SHIFT_R;
        if (x + 1 < w && !(s.gridAt(x + 1, y) & G_ISLAND))
          newgrid[s.idx(x + 1, y)] |= idata << D_L_ISLAND_SHIFT_L;
        if (y > 0 && !(s.gridAt(x, y - 1) & G_ISLAND))
          newgrid[s.idx(x, y - 1)] |= idata << D_L_ISLAND_SHIFT_D;
        if (y + 1 < h && !(s.gridAt(x, y + 1) & G_ISLAND))
          newgrid[s.idx(x, y + 1)] |= idata << D_L_ISLAND_SHIFT_U;
      } else {
        let selh = false;
        let selv = false;
        if (
          dragSrc &&
          dragDst &&
          within(x, dragSrc.x, dragDst.x) &&
          within(y, dragSrc.y, dragDst.y)
        ) {
          if (dragSrc.x !== dragDst.x) selh = true;
          else selv = true;
        }
        const [lv, lh] = linesLvlh(s, ui, x, y, v);

        let hdata =
          v & G_NOLINEH
            ? DL_COUNT_CROSS
            : v & G_LINEH
              ? lh
              : ui.showHints && betweenIsland(s, x, y, 1, 0)
                ? DL_COUNT_HINT
                : 0;
        let vdata =
          v & G_NOLINEV
            ? DL_COUNT_CROSS
            : v & G_LINEV
              ? lv
              : ui.showHints && betweenIsland(s, x, y, 0, 1)
                ? DL_COUNT_HINT
                : 0;

        const wrong = mistakeMask?.[c];
        hdata |= flash
          ? DL_COL_FLASH
          : v & G_WARN || wrong
            ? DL_COL_WARNING
            : selh
              ? DL_COL_SELECTED
              : DL_COL_NORMAL;
        vdata |= flash
          ? DL_COL_FLASH
          : v & G_WARN || wrong
            ? DL_COL_WARNING
            : selv
              ? DL_COL_SELECTED
              : DL_COL_NORMAL;

        if (v & G_MARKH) hdata |= DL_LOCK;
        if (v & G_MARKV) vdata |= DL_LOCK;

        newgrid[c] |= hdata << D_L_LINE_SHIFT_H;
        newgrid[c] |= vdata << D_L_LINE_SHIFT_V;
        if (x > 0 && s.gridAt(x - 1, y) & G_ISLAND)
          newgrid[s.idx(x - 1, y)] |= hdata << D_I_LINE_SHIFT_R;
        if (x + 1 < w && s.gridAt(x + 1, y) & G_ISLAND)
          newgrid[s.idx(x + 1, y)] |= hdata << D_I_LINE_SHIFT_L;
        if (y > 0 && s.gridAt(x, y - 1) & G_ISLAND)
          newgrid[s.idx(x, y - 1)] |= vdata << D_I_LINE_SHIFT_D;
        if (y + 1 < h && s.gridAt(x, y + 1) & G_ISLAND)
          newgrid[s.idx(x, y + 1)] |= vdata << D_I_LINE_SHIFT_U;
      }
    }
  }

  // Draw any changed tile.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const c = s.idx(x, y);
      const newval = newgrid[c];
      if (ds.grid[c] === newval) continue;
      const v = s.gridAt(x, y);
      if (v & G_ISLAND) {
        const is = s.islandAt(x, y);
        drawIslandTile(dr, ts, b, x, y, is ? is.count : 0, newval);
        if (x === 0) drawEdgeTile(dr, ts, b, x - 1, y, 1, 0, newval);
        if (y === 0) drawEdgeTile(dr, ts, b, x, y - 1, 0, 1, newval);
        if (x === w - 1) drawEdgeTile(dr, ts, b, x + 1, y, -1, 0, newval);
        if (y === h - 1) drawEdgeTile(dr, ts, b, x, y + 1, 0, -1, newval);
      } else {
        drawLineTile(dr, ts, b, x, y, newval);
      }
      ds.grid[c] = newval;
    }
  }
}

/** Map a pixel coordinate to a grid cell (bridges.c FROMCOORD). */
export function fromCoord(px: number, ts: number, b: number): number {
  return Math.floor((px - b + ts) / ts) - 1;
}

/** Map a grid cell to its top-left pixel (bridges.c COORD). */
export function toCoord(x: number, ts: number, b: number): number {
  return coord(x, ts, b);
}
