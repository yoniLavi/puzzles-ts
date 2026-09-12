/**
 * Rendering for Bridges, a port of upstream's packed-word draw model
 * (`bridges.c` game_redraw + draw_* helpers): each tile's cache entry is a
 * 28-bit descriptor that encodes not only the tile's own contents but the
 * bridge-stubs intruding from neighboring islands and the island-arcs
 * intruding from adjacent island tiles. The descriptor *is* the cache key, so
 * "redraw iff `newgrid[i] != grid[i]`" falls straight out.
 *
 * The mistake overlay recolors `findMistakes` wrong bridges with the existing
 * red `COL_WARNING` channel, which lives inside the cache key and therefore
 * repaints clean when the overlay clears.
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import {
  ERROR_WASH,
  GRID_MID,
  HELD,
  HINT_ACTION,
  HINT_EVIDENCE,
  highlightWash,
  INK,
} from "../../engine/color/palette.ts";
import { glyphFont } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import type { Color } from "../../engine/types.ts";
import type { BridgesHighlights } from "./hint.ts";
import type { BridgesSpan } from "./solver.ts";
import {
  type BridgesMistake,
  type BridgesMove,
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

// --- Color enum (bridges.c lines 103-112), index-for-index with C ---
export const COL_BACKGROUND = 0;
export const COL_FOREGROUND = 1;
export const COL_HIGHLIGHT = 2;
export const COL_LOWLIGHT = 3;
export const COL_SELECTED = 4;
export const COL_MARK = 5;
/**
 * Upstream's `COL_HINT`, renamed. It is the bevel shade the "Show possible
 * bridge locations" preference draws a span in, and has nothing to do with the
 * hint system: it says *a bridge could go here*, not *this one must*.
 *
 * The rename is not tidying. `hint-mark.test.ts` finds each game's hint colors
 * by reading the `COL_HINT` export out of its own `render.ts`, so a game that
 * already owns that identifier for something else does not fail the guard, it
 * **silently redirects it** at a color no hint ever paints. That is
 * `AGENTS.md` § "A scan that keys on a name" from the other end: the sweep keys
 * on a name and the name was taken.
 */
export const COL_POSSIBLE = 6;
export const COL_GRID = 7;
export const COL_WARNING = 8;
export const COL_CURSOR = 9;
/** The hint's action color: the bridge to draw, or the cross to place. */
export const COL_HINT = 10;
/** The hint's evidence color: the islands and bridges the argument counts. */
export const COL_HINT_CELL = 11;

// --- Packed draw-word fields (bridges.c lines 2262-2297) ---
// Line data (6 bits per direction).
const DL_COUNTMASK = 0x07;
const DL_COUNT_CROSS = 0x06;
const DL_COUNT_POSSIBLE = 0x07;
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

// --- Hint draw flags -------------------------------------------------------
//
// A second `Int32Array` beside `grid`, compared in the same per-tile diff test:
// that is what puts the overlay in the tile cache's diff key, which is the
// whole of the bug class `hint-overlay.test.ts` guards
// (docs/games/rendering.md § "The tile cache and the diff key"). There is no
// room in the packed word — an island square already reaches bit 29 — and a
// lane of its own is what `engine/overlay-sidecar.ts` reaches for too.
//
// It mirrors the packed model's island/line duality because it has to: a hint
// that recolors an island's rim has to intrude into the four neighbor tiles
// exactly as the rim itself does, and a hinted bridge has to reach the
// half-stubs its endpoint islands draw.
/** Bridges the step wants this span to end up carrying (0 = not a target). */
const HL_COUNTMASK = 0x07;
/** The step draws the game's own no-line cross here. */
const HL_CROSS = 0x08;
/** The argument counts the bridge already here. */
const HL_CITED = 0x10;
const HL_MASK = 0x1f;
/** The island whose arithmetic forces the step. */
const HI_FOCUS = 0x01;
/** An island the argument counts. */
const HI_CITED = 0x02;
const HI_MASK = 0x03;
// Shifts within an island square's hint word.
const H_I_ISLAND_SHIFT = 0;
const H_I_LINE_SHIFT_L = 2;
const H_I_LINE_SHIFT_R = 7;
const H_I_LINE_SHIFT_U = 12;
const H_I_LINE_SHIFT_D = 17;
// Shifts within a line square's hint word.
const H_L_ISLAND_SHIFT_L = 0;
const H_L_ISLAND_SHIFT_R = 2;
const H_L_ISLAND_SHIFT_U = 4;
const H_L_ISLAND_SHIFT_D = 6;
const H_L_LINE_SHIFT_H = 8;
const H_L_LINE_SHIFT_V = 13;

export interface BridgesDrawState {
  started: boolean;
  tileSize: number;
  /** Per-cell packed draw descriptor from the last paint; -1 forces a redraw. */
  grid: Int32Array;
  /** Scratch descriptor grid for the current frame (avoids per-frame alloc). */
  newgrid: Int32Array;
  /** Per-cell hint word from the last paint; part of the diff key. */
  hint: Int32Array;
}

export function newDrawState(state: BridgesState): BridgesDrawState {
  const n = state.w * state.h;
  return {
    started: false,
    tileSize: PREFERRED_TILE_SIZE,
    grid: new Int32Array(n).fill(-1),
    newgrid: new Int32Array(n),
    hint: new Int32Array(n).fill(-1),
  };
}

export function setTileSize(ds: BridgesDrawState, tileSize: number): void {
  if (ds.tileSize === tileSize) return;
  ds.tileSize = tileSize;
  ds.started = false;
  ds.grid.fill(-1);
  ds.hint.fill(-1);
}

export function computeSize(
  p: BridgesParams,
  tileSize: number,
): { w: number; h: number } {
  const b = border(tileSize);
  return { w: p.w * tileSize + 2 * b, h: p.h * tileSize + 2 * b };
}

export function colors(defaultBackground: Color): Color[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  return [
    background, // COL_BACKGROUND
    INK, // COL_FOREGROUND
    highlight, // COL_HIGHLIGHT
    lowlight, // COL_LOWLIGHT
    HELD, // COL_SELECTED
    highlight, // COL_MARK (= HIGHLIGHT)
    lowlight, // COL_POSSIBLE (= LOWLIGHT): the "possible bridge" bevel line
    GRID_MID, // COL_GRID
    ERROR_WASH, // COL_WARNING (also the mistake overlay color)
    // COL_CURSOR — not `CURSOR`: green is the island a bridge is being drawn
    // from, and the cursor *fills* the island under its clue digit, which is
    // the "you are here" wash Solo's family draws its cursor cell with.
    highlightWash(background),
    HINT_ACTION, // COL_HINT
    HINT_EVIDENCE, // COL_HINT_CELL
  ];
}

// --- geometry helpers (all args positive, so integer division is trunc) ---
const div = (a: number, b: number): number => Math.trunc(a / b);
/** A grid cell's top-left pixel (bridges.c COORD). */
export const toCoord = (x: number, ts: number, b: number): number => x * ts + b;
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
  if (ui.showPossible) {
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
 *
 * `hdata` is this direction's hint word, and the hint borrows the shapes this
 * function already draws rather than inventing one
 * (docs/games/hints.md § "Echo the move's shape in the hint color"): a span the
 * step wants bridged is drawn as the bundle it would become, with the bars the
 * step *adds* in `COL_HINT` over the ones already there; a span it wants
 * blocked takes the game's own pair of crosses in `COL_HINT`; and a bridge the
 * argument merely counts keeps its shape and takes `COL_HINT_CELL`.
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
  hdata = 0,
): void {
  const raw = ldata & DL_COUNTMASK;
  // A cross and a "possible bridge" bevel are both drawn *instead of* bridges,
  // so neither is a bar the hint has to leave in the board's own color.
  const placed = raw === DL_COUNT_CROSS || raw === DL_COUNT_POSSIBLE ? 0 : raw;
  const want = hdata & HL_COUNTMASK;
  const count = want > 0 ? want : raw;
  /** Bars from here on are the ones the step adds. */
  const hintFrom = want > 0 ? placed : -1;
  const fg =
    count === DL_COUNT_POSSIBLE
      ? COL_POSSIBLE
      : hdata & HL_CITED
        ? COL_HINT_CELL
        : (ldata & DL_COLMASK) === DL_COL_SELECTED
          ? COL_SELECTED
          : (ldata & DL_COLMASK) === DL_COL_FLASH
            ? COL_HIGHLIGHT
            : (ldata & DL_COLMASK) === DL_COL_WARNING
              ? COL_WARNING
              : COL_FOREGROUND;

  if (hdata & HL_CROSS) {
    // Drawn under `which & 2` only, so the pair lands once per tile like the
    // bridge bars rather than twice.
    if (which & 2) {
      drawCross(
        dr,
        ts,
        ox + ts8(1, ts) * fx + ts8(3, ts) * ax,
        oy + ts8(1, ts) * fy + ts8(3, ts) * ay,
        COL_HINT,
      );
      drawCross(
        dr,
        ts,
        ox + ts8(5, ts) * fx + ts8(3, ts) * ax,
        oy + ts8(5, ts) * fy + ts8(3, ts) * ay,
        COL_HINT,
      );
    }
    return;
  }

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
    const lh = count === DL_COUNT_POSSIBLE ? 1 : count;
    const lw = lineWidth(ts);
    let gw = lw;
    // Shrink the inter-bridge gap until the whole bundle fits the tile.
    let bw = lw * lh + gw * (lh + 1);
    while (bw > ts) {
      gw--;
      bw = lw * lh + gw * (lh + 1);
    }
    let loff = offset(bw, ts);
    if (which & 1) {
      if (ldata & DL_LOCK && fg !== COL_POSSIBLE) {
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
          hintFrom >= 0 && i >= hintFrom ? COL_HINT : fg,
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
  hint = 0,
): void {
  drawGeneralLine(dr, ts, ox, oy, 1, 0, 0, 1, w, vdata, which, hint);
}

function drawVline(
  dr: GameDrawing,
  ts: number,
  ox: number,
  oy: number,
  h: number,
  vdata: number,
  which: number,
  hint = 0,
): void {
  drawGeneralLine(dr, ts, ox, oy, 0, 1, 1, 0, h, vdata, which, hint);
}

/**
 * `ihint` recolors the island's own rim and clue digit, which is a **ring**
 * rather than a fill: `drawIsland` paints an annulus (an `fg` disc with a `bg`
 * disc on top), so the hint costs the island's mark and its background nothing.
 *
 * That is the game's own vocabulary again, and it is what the shared
 * `hint-mark.ts` band could not have given here: an island's circle has a
 * radius of `12/20` of the tile, so it is *wider than its own tile* and spills
 * into the four neighbors. A band on the tile's border box would cut across the
 * circle rather than outline anything.
 */
function drawIsland(
  dr: GameDrawing,
  ts: number,
  ox: number,
  oy: number,
  clue: number,
  idata: number,
  ihint = 0,
): void {
  if ((idata & DI_BGMASK) === DI_BG_NO_ISLAND) return;
  const half = div(ts, 2);
  const orad = islandRadius(ts);
  const irad = orad - lineWidth(ts);
  const fg =
    ihint & HI_FOCUS
      ? COL_HINT
      : ihint & HI_CITED
        ? COL_HINT_CELL
        : (idata & DI_COLMASK) === DI_COL_SELECTED
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
    const textcolor = fg === COL_SELECTED ? COL_FOREGROUND : fg;
    dr.drawText(
      { x: ox + half, y: oy + half },
      glyphFont(islandNumsize(clue, ts)),
      textcolor,
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
  hint: number,
): void {
  const ox = toCoord(x, ts, b);
  const oy = toCoord(y, ts, b);
  dr.clip({ x: ox, y: oy, w: ts, h: ts });
  dr.drawRect({ x: ox, y: oy, w: ts, h: ts }, COL_BACKGROUND);
  const half = div(ts, 2);
  for (const which of [1, 2]) {
    drawHline(
      dr,
      ts,
      ox,
      oy,
      half,
      (data >> D_I_LINE_SHIFT_L) & DL_MASK,
      which,
      (hint >> H_I_LINE_SHIFT_L) & HL_MASK,
    );
    drawHline(
      dr,
      ts,
      ox + ts - half,
      oy,
      half,
      (data >> D_I_LINE_SHIFT_R) & DL_MASK,
      which,
      (hint >> H_I_LINE_SHIFT_R) & HL_MASK,
    );
    drawVline(
      dr,
      ts,
      ox,
      oy,
      half,
      (data >> D_I_LINE_SHIFT_U) & DL_MASK,
      which,
      (hint >> H_I_LINE_SHIFT_U) & HL_MASK,
    );
    drawVline(
      dr,
      ts,
      ox,
      oy + ts - half,
      half,
      (data >> D_I_LINE_SHIFT_D) & DL_MASK,
      which,
      (hint >> H_I_LINE_SHIFT_D) & HL_MASK,
    );
  }
  drawIsland(
    dr,
    ts,
    ox,
    oy,
    clue,
    (data >> D_I_ISLAND_SHIFT) & DI_MASK,
    (hint >> H_I_ISLAND_SHIFT) & HI_MASK,
  );
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
  hint: number,
): void {
  const ox = toCoord(x, ts, b);
  const oy = toCoord(y, ts, b);
  dr.clip({ x: ox, y: oy, w: ts, h: ts });
  dr.drawRect({ x: ox, y: oy, w: ts, h: ts }, COL_BACKGROUND);
  const hdata = (data >> D_L_LINE_SHIFT_H) & DL_MASK;
  const vdata = (data >> D_L_LINE_SHIFT_V) & DL_MASK;
  const hhint = (hint >> H_L_LINE_SHIFT_H) & HL_MASK;
  const vhint = (hint >> H_L_LINE_SHIFT_V) & HL_MASK;
  // Possible-bridge bevels at the bottom, then crosses, then bridges — a
  // straight compare of the count fields gives that order (DL_COUNTMASK
  // enumeration).
  if ((hdata & DL_COUNTMASK) > (vdata & DL_COUNTMASK)) {
    drawHline(dr, ts, ox, oy, ts, hdata, 3, hhint);
    drawVline(dr, ts, ox, oy, ts, vdata, 3, vhint);
  } else {
    drawVline(dr, ts, ox, oy, ts, vdata, 3, vhint);
    drawHline(dr, ts, ox, oy, ts, hdata, 3, hhint);
  }
  // Islands intruding from the four sides (no clue numbers).
  const ihint = (side: number): number => (hint >> side) & HI_MASK;
  drawIsland(
    dr,
    ts,
    ox - ts,
    oy,
    -1,
    (data >> D_L_ISLAND_SHIFT_L) & DI_MASK,
    ihint(H_L_ISLAND_SHIFT_L),
  );
  drawIsland(
    dr,
    ts,
    ox + ts,
    oy,
    -1,
    (data >> D_L_ISLAND_SHIFT_R) & DI_MASK,
    ihint(H_L_ISLAND_SHIFT_R),
  );
  drawIsland(
    dr,
    ts,
    ox,
    oy - ts,
    -1,
    (data >> D_L_ISLAND_SHIFT_U) & DI_MASK,
    ihint(H_L_ISLAND_SHIFT_U),
  );
  drawIsland(
    dr,
    ts,
    ox,
    oy + ts,
    -1,
    (data >> D_L_ISLAND_SHIFT_D) & DI_MASK,
    ihint(H_L_ISLAND_SHIFT_D),
  );
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
  hint: number,
): void {
  const ox = toCoord(x, ts, b);
  const oy = toCoord(y, ts, b);
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
    (hint >> H_I_ISLAND_SHIFT) & HI_MASK,
  );
  dr.unclip();
  dr.drawUpdate({ x: cx, y: cy, w: cw, h: ch });
}

/**
 * Build the mistake mask: a per-cell bit set for every line-square on a wrong
 * bridge span, plus the two endpoint island cells, so they can be recolored
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

/**
 * The per-cell hint word for the displayed step, in the same island/line
 * layout the packed descriptor uses, and by the same two-pass shape: every
 * cell's own roles first, then the intrusions into its neighbors.
 *
 * **Nothing here comes from `engine/hint-mark.ts`, and that is this game's
 * answer to it.** A `MarkBand` is a band on a cell's border box, and neither
 * thing a Bridges deduction points at is one: an island is a circle wider than
 * its own tile, and a bridge is a *span* between two of them, which is nobody's
 * border. Both marks are therefore the game's own shapes recolored
 * (docs/games/hints.md § "Echo the move's shape in the hint color").
 */
function hintWords(s: BridgesState, hl?: BridgesHighlights): Int32Array {
  const { w, h } = s;
  const out = new Int32Array(w * h);
  if (!hl) return out;

  // Islands: the focus wins over a citation, so "this 5" is never ambiguous
  // with "the outlined islands" (docs/games/hints.md § "Two marks on the
  // board, one 'this cell'").
  for (const i of hl.islands) out[s.idx(i.x, i.y)] |= HI_CITED << H_I_ISLAND_SHIFT;
  if (hl.focus) {
    const c = s.idx(hl.focus.x, hl.focus.y);
    out[c] = (out[c] & ~(HI_MASK << H_I_ISLAND_SHIFT)) | (HI_FOCUS << H_I_ISLAND_SHIFT);
  }

  /** Set `bits` on every cell strictly between the span's two islands. */
  const span = (sp: BridgesSpan, bits: number): void => {
    const dx = Math.sign(sp.x2 - sp.x1);
    const dy = Math.sign(sp.y2 - sp.y1);
    const shift = dx ? H_L_LINE_SHIFT_H : H_L_LINE_SHIFT_V;
    for (let x = sp.x1 + dx, y = sp.y1 + dy; x !== sp.x2 || y !== sp.y2; ) {
      out[s.idx(x, y)] |= bits << shift;
      x += dx;
      y += dy;
    }
  };
  for (const sp of hl.spans) span(sp, HL_CITED);
  // Targets after citations: a span the step decides is never merely cited.
  for (const t of hl.targets) {
    span(t, t.blocked ? HL_CROSS : t.bridges & HL_COUNTMASK);
  }

  // Second pass: what each cell shows of its neighbors. An island's rim spills
  // into the four tiles around it and a bridge reaches the half-stubs its
  // endpoint islands draw, so both have to be carried across.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const c = s.idx(x, y);
      if (s.gridAt(x, y) & G_ISLAND) {
        const role = (out[c] >> H_I_ISLAND_SHIFT) & HI_MASK;
        if (!role) continue;
        if (x > 0 && !(s.gridAt(x - 1, y) & G_ISLAND))
          out[s.idx(x - 1, y)] |= role << H_L_ISLAND_SHIFT_R;
        if (x + 1 < w && !(s.gridAt(x + 1, y) & G_ISLAND))
          out[s.idx(x + 1, y)] |= role << H_L_ISLAND_SHIFT_L;
        if (y > 0 && !(s.gridAt(x, y - 1) & G_ISLAND))
          out[s.idx(x, y - 1)] |= role << H_L_ISLAND_SHIFT_D;
        if (y + 1 < h && !(s.gridAt(x, y + 1) & G_ISLAND))
          out[s.idx(x, y + 1)] |= role << H_L_ISLAND_SHIFT_U;
      } else {
        const hbits = (out[c] >> H_L_LINE_SHIFT_H) & HL_MASK;
        const vbits = (out[c] >> H_L_LINE_SHIFT_V) & HL_MASK;
        if (hbits) {
          if (x > 0 && s.gridAt(x - 1, y) & G_ISLAND)
            out[s.idx(x - 1, y)] |= hbits << H_I_LINE_SHIFT_R;
          if (x + 1 < w && s.gridAt(x + 1, y) & G_ISLAND)
            out[s.idx(x + 1, y)] |= hbits << H_I_LINE_SHIFT_L;
        }
        if (vbits) {
          if (y > 0 && s.gridAt(x, y - 1) & G_ISLAND)
            out[s.idx(x, y - 1)] |= vbits << H_I_LINE_SHIFT_D;
          if (y + 1 < h && s.gridAt(x, y + 1) & G_ISLAND)
            out[s.idx(x, y + 1)] |= vbits << H_I_LINE_SHIFT_U;
        }
      }
    }
  }
  return out;
}

// The redraw doctrine is what makes this branchy: one cache key per island and
// per bridge span, compared against the last frame before anything is painted.
// The branches ARE the diff, and hoisting them into helpers hides which cell a
// given comparison guards.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: see above
export function redrawBridges(
  dr: GameDrawing,
  ds: BridgesDrawState,
  _prev: BridgesState | null,
  s: BridgesState,
  ui: BridgesUi,
  flashTime: number,
  mistakes: readonly BridgesMistake[] = [],
  hint?: HintStep<BridgesMove, BridgesHighlights>,
): void {
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
    dragSrc = { x: ui.dragxSrc, y: ui.dragySrc };
    if (ui.dragxDst !== -1 && ui.dragyDst !== -1) {
      dragDst = { x: ui.dragxDst, y: ui.dragyDst };
    }
  }

  const mistakeMask = buildMistakeMask(s, mistakes);
  const newgrid = ds.newgrid;
  newgrid.fill(0);
  const newhint = hintWords(s, hint?.highlights);

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

        if (ui.cursor.visible && ui.cursor.x === is.x && ui.cursor.y === is.y)
          idata |= DI_BG_CURSOR;
        else if (v & G_MARK) idata |= DI_BG_MARK;
        // Fork aid: auto-gray a satisfied island (visual only — no lock).
        // A satisfied island is never impossible, so this never fights the red.
        else if (ui.autoMark && s.islandCountbridges(is) === is.count)
          idata |= DI_BG_MARK;
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
              : ui.showPossible && betweenIsland(s, x, y, 1, 0)
                ? DL_COUNT_POSSIBLE
                : 0;
        let vdata =
          v & G_NOLINEV
            ? DL_COUNT_CROSS
            : v & G_LINEV
              ? lv
              : ui.showPossible && betweenIsland(s, x, y, 0, 1)
                ? DL_COUNT_POSSIBLE
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
      const newhintval = newhint[c];
      // The hint word is part of the diff key, not a second overlay pass: a
      // frame whose board is unchanged and whose hint is not must still
      // repaint (`hint-overlay.test.ts`).
      if (ds.grid[c] === newval && ds.hint[c] === newhintval) continue;
      const v = s.gridAt(x, y);
      if (v & G_ISLAND) {
        const is = s.islandAt(x, y);
        drawIslandTile(dr, ts, b, x, y, is ? is.count : 0, newval, newhintval);
        if (x === 0) drawEdgeTile(dr, ts, b, x - 1, y, 1, 0, newval, newhintval);
        if (y === 0) drawEdgeTile(dr, ts, b, x, y - 1, 0, 1, newval, newhintval);
        if (x === w - 1) drawEdgeTile(dr, ts, b, x + 1, y, -1, 0, newval, newhintval);
        if (y === h - 1) drawEdgeTile(dr, ts, b, x, y + 1, 0, -1, newval, newhintval);
      } else {
        drawLineTile(dr, ts, b, x, y, newval, newhintval);
      }
      ds.grid[c] = newval;
      ds.hint[c] = newhintval;
    }
  }
}
