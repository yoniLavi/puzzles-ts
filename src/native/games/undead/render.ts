/**
 * Undead rendering — port of `game_redraw` and its helpers from `undead.c`.
 *
 * Layout: a monster-count row across the top, then the `w × h` grid framed by a
 * one-tile border of sighting clues. Each interior cell draws a mirror (a thick
 * diagonal), a placed monster (a drawn ghost/vampire/zombie shape, or a letter
 * in ASCII mode), or a 2×2 grid of pencil notes. The count blocks and edge clues
 * recolour red on error and dim when complete / struck. Cells are diffed against
 * a per-monster-cell cache; the Check & Save mistake overlay rides a sidecar in
 * the diff key (playbook §3.2). The fork pencil-mode indicator sits in the
 * top-right border corner.
 *
 * Note (parity): upstream computes `cell_errors` but never *renders* them (only
 * the count blocks and edge clues turn red); we match that — the red overlay you
 * see in play comes from the counts/clues, and the inset red outline is the
 * separate Check & Save mistake overlay.
 */

import type { Colour, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import {
  CELL_MIRROR_L,
  COUNT_STYLE_PLACED_TOTAL,
  COUNT_STYLE_REMAINING,
  COUNT_STYLE_REMAINING_TOTAL,
  COUNT_STYLE_TOTAL,
  MON_GHOST,
  MON_VAMPIRE,
  MON_ZOMBIE,
  type UndeadState,
  type UndeadUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 64;
export const FLASH_TIME = 0.7;

const f = Math.floor;
const idiv = (a: number, b: number): number => Math.trunc(a / b);

// --- palette (index-for-index with the upstream COL_* enum) ----------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_TEXT = 2;
export const COL_ERROR = 3;
export const COL_HIGHLIGHT = 4;
export const COL_FLASH = 5;
export const COL_GHOST = 6;
export const COL_ZOMBIE = 7;
export const COL_VAMPIRE = 8;
export const COL_DONE = 9;
// Fork addition, appended past the upstream enum; Undead has no dark-mode
// paletteOverrides, so a plain append is safe.
export const COL_PENCIL_BODY = 10;

export function colours(defaultBackground: Colour): Colour[] {
  const bg = defaultBackground;
  const out: Colour[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = [0, 0, 0];
  out[COL_TEXT] = [0, 0, 0];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_HIGHLIGHT] = [0.78 * bg[0], 0.78 * bg[1], 0.78 * bg[2]];
  out[COL_FLASH] = [1, 1, 1];
  // Note: upstream derives all three monster shades from bg[0] (the red channel).
  out[COL_GHOST] = [bg[0] * 0.5, bg[0], bg[0]];
  out[COL_ZOMBIE] = [bg[0] * 0.5, bg[0], bg[0] * 0.5];
  out[COL_VAMPIRE] = [bg[0], bg[0] * 0.9, bg[0] * 0.9];
  out[COL_DONE] = [bg[0] / 1.5, bg[1] / 1.5, bg[2] / 1.5];
  out[COL_PENCIL_BODY] = [1, 0.78, 0.17];
  return out;
}

// --- geometry --------------------------------------------------------------

const border = (ts: number): number => f(ts / 4);

export function computeSize(p: { w: number; h: number }, ts: number): Size {
  const b = border(ts);
  return { w: 2 * b + (p.w + 2) * ts, h: 2 * b + (p.h + 3) * ts };
}

// --- draw state ------------------------------------------------------------

export interface UndeadDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** `numTotal` last-drawn monster bitmasks. */
  monsters: Int8Array;
  /** `numTotal` last-drawn pencil bitmasks. */
  pencils: Uint8Array;
  /** `wh` last-drawn cell-error flags (staleness only — see file note). */
  cellErrors: Uint8Array;
  /** `2·numPaths` last-drawn edge-clue error / done flags. */
  hintErrors: Uint8Array;
  hintsDone: Uint8Array;
  countErrors: Uint8Array;
  countPlaced: Int32Array;
  hx: number;
  hy: number;
  hshow: boolean;
  hpencil: boolean;
  hflash: boolean;
  ascii: boolean;
  countStyle: number;
  countFontsize: number;
  countW: number;
  countGap: number;
  countPadding: number;
  /** `wh` current-frame mistake flags + last-drawn sidecar (Check & Save). */
  wrong: Uint8Array;
  drawnWrong: Int8Array;
  pencilModeShown: boolean;
}

export function newDrawState(state: UndeadState): UndeadDrawState {
  const common = state.common;
  return {
    started: false,
    tilesize: 0,
    w: common.w,
    h: common.h,
    monsters: new Int8Array(common.numTotal).fill(7),
    pencils: new Uint8Array(common.numTotal),
    cellErrors: new Uint8Array(common.wh),
    hintErrors: new Uint8Array(2 * common.numPaths),
    hintsDone: new Uint8Array(2 * common.numPaths),
    countErrors: new Uint8Array(3),
    countPlaced: new Int32Array(3),
    hx: 0,
    hy: 0,
    hshow: false,
    hpencil: false,
    hflash: false,
    ascii: false,
    countStyle: COUNT_STYLE_TOTAL,
    countFontsize: 0,
    countW: 0,
    countGap: 0,
    countPadding: 0,
    wrong: new Uint8Array(common.wh),
    drawnWrong: new Int8Array(common.wh).fill(-1),
    pencilModeShown: false,
  };
}

export function setTileSize(ds: UndeadDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- count-row layout (calculate_count_layout) -----------------------------

function calculateCountLayout(ds: UndeadDrawState): void {
  const ts = ds.tilesize;
  const COUNT_MSIZE = idiv(2 * ts, 3);
  const COUNT_GAP = idiv(ts, 3);
  const COUNT_FONTSIZE = idiv(ts, 2);
  const COUNT_PADDING = idiv(ts, 10);
  const DIGIT_WIDTH = 0.6;
  const totalW = (ds.w + 2) * ts;
  const maxDigits = String(ds.w * ds.h).length;

  let maxChars: number;
  if (ds.countStyle === COUNT_STYLE_REMAINING) maxChars = 1 + maxDigits;
  else if (ds.countStyle === COUNT_STYLE_PLACED_TOTAL) maxChars = maxDigits + 0.5 + maxDigits;
  else if (ds.countStyle === COUNT_STYLE_REMAINING_TOTAL)
    // remaining (with a possible minus sign when over-placed) / total
    maxChars = 1 + maxDigits + 0.5 + maxDigits;
  else maxChars = maxDigits;

  let fontsize = COUNT_FONTSIZE;
  let padding = COUNT_PADDING;
  let numberW = Math.trunc(maxChars * DIGIT_WIDTH * fontsize);
  let blockW = COUNT_MSIZE + padding + numberW;
  let gap = Math.min(COUNT_GAP, idiv(totalW - 3 * blockW, 2));

  if (gap < 0) {
    padding -= Math.min(idiv(-gap, 3), padding);
    blockW = COUNT_MSIZE + padding + numberW;
    gap = idiv(totalW - 3 * blockW, 2);
    if (gap < 0) {
      fontsize = Math.trunc((totalW / 3 - COUNT_MSIZE - padding) / (maxChars * DIGIT_WIDTH));
      fontsize = Math.max(fontsize, idiv(ts, 10));
      numberW = Math.trunc(maxChars * DIGIT_WIDTH * fontsize);
      blockW = COUNT_MSIZE + padding + numberW;
      gap = idiv(totalW - 3 * blockW, 2);
    }
    gap = Math.max(gap, 0);
  }

  ds.countFontsize = fontsize;
  ds.countW = blockW;
  ds.countGap = gap;
  ds.countPadding = padding;
}

const countX = (ds: UndeadDrawState, c: number): number =>
  border(ds.tilesize) +
  idiv((ds.w + 2) * ds.tilesize - ds.countW, 2) +
  (c - 1) * (ds.countGap + ds.countW);
const countY = (ts: number): number => border(ts);

/** The count block (0/1/2) under pixel `(px, py)`, or `-1`. Used by
 * `interpretMove` to place/clear a monster by clicking its count. */
export function countBlockAt(ds: UndeadDrawState, px: number, py: number): number {
  const ts = ds.tilesize;
  if (ts <= 0 || ds.countW <= 0) return -1;
  if (py < countY(ts) || py >= countY(ts) + ts) return -1;
  for (let c = 0; c < 3; c++) {
    if (px >= countX(ds, c) && px < countX(ds, c) + ds.countW) return c;
  }
  return -1;
}

/** Bottom pixel of the count row (upstream `COUNT_Y + COUNT_H`). */
export function countRowBottom(ds: UndeadDrawState): number {
  return countY(ds.tilesize) + ds.tilesize;
}

// --- primitives ------------------------------------------------------------

function drawCircleOrPoint(
  dr: GameDrawing,
  cx: number,
  cy: number,
  radius: number,
  colour: number,
): void {
  if (radius > 0) dr.drawCircle({ x: cx, y: cy }, radius, colour, colour);
  else dr.drawRect({ x: cx, y: cy, w: 1, h: 1 }, colour);
}

/** Draw a monster shape centred at `(x, y)` into a `ts`-wide box (upstream
 * `draw_monster`). `ts` is the monster's own display size, not the tile size. */
function drawMonster(
  dr: GameDrawing,
  x: number,
  y: number,
  ts: number,
  hflash: boolean,
  monster: number,
): void {
  const black = hflash ? COL_FLASH : COL_TEXT;
  const m25 = idiv(2 * ts, 5);

  if (monster === MON_GHOST) {
    dr.clip({ x: x - f(ts / 2) + 2, y: y - f(ts / 2) + 2, w: ts - 3, h: f(ts / 2) + 1 });
    dr.drawCircle({ x, y }, m25, COL_GHOST, black);
    dr.unclip();

    const poly: { x: number; y: number }[] = [];
    poly.push({ x: x - m25, y: y - 2 });
    poly.push({ x: x - m25, y: y + m25 });
    for (let j = 0; j < 3; j++) {
      const total = m25 * 2;
      const before = idiv(total * j, 3);
      const after = idiv(total * (j + 1), 3);
      const mid = idiv(before + after, 2);
      poly.push({ x: x - m25 + mid, y: y + m25 - idiv(total, 6) });
      poly.push({ x: x - m25 + after, y: y + m25 });
    }
    poly.push({ x: x + m25, y: y - 2 });

    dr.clip({ x: x - f(ts / 2) + 2, y, w: ts - 3, h: ts - f(ts / 2) - 1 });
    dr.drawPolygon(poly, COL_GHOST, black);
    dr.unclip();

    dr.drawCircle({ x: x - f(ts / 6), y: y - f(ts / 12) }, f(ts / 10), COL_BACKGROUND, black);
    dr.drawCircle({ x: x + f(ts / 6), y: y - f(ts / 12) }, f(ts / 10), COL_BACKGROUND, black);
    drawCircleOrPoint(dr, x - f(ts / 6) + 1 + f(ts / 48), y - f(ts / 12), f(ts / 48), black);
    drawCircleOrPoint(dr, x + f(ts / 6) + 1 + f(ts / 48), y - f(ts / 12), f(ts / 48), black);
  } else if (monster === MON_VAMPIRE) {
    dr.clip({ x: x - f(ts / 2) + 2, y: y - f(ts / 2) + 2, w: ts - 3, h: f(ts / 2) });
    dr.drawCircle({ x, y }, m25, black, black);
    dr.unclip();

    dr.clip({ x: x - f(ts / 2) + 2, y: y - f(ts / 2) + 2, w: f(ts / 2) + 1, h: f(ts / 2) });
    dr.drawCircle({ x: x - f(ts / 7), y }, m25 - f(ts / 7), COL_VAMPIRE, black);
    dr.unclip();
    dr.clip({ x, y: y - f(ts / 2) + 2, w: f(ts / 2) + 1, h: f(ts / 2) });
    dr.drawCircle({ x: x + f(ts / 7), y }, m25 - f(ts / 7), COL_VAMPIRE, black);
    dr.unclip();

    dr.clip({ x: x - f(ts / 2) + 2, y, w: ts - 3, h: f(ts / 2) });
    dr.drawCircle({ x, y }, m25, COL_VAMPIRE, black);
    dr.unclip();

    dr.drawCircle({ x: x - f(ts / 7), y: y - f(ts / 16) }, f(ts / 16), COL_BACKGROUND, black);
    dr.drawCircle({ x: x + f(ts / 7), y: y - f(ts / 16) }, f(ts / 16), COL_BACKGROUND, black);
    drawCircleOrPoint(dr, x - f(ts / 7), y - f(ts / 16), f(ts / 48), black);
    drawCircleOrPoint(dr, x + f(ts / 7), y - f(ts / 16), f(ts / 48), black);

    dr.clip({ x: x - f(ts / 2) + 2, y: y + f(ts / 8), w: ts - 3, h: f(ts / 4) });
    dr.drawPolygon(
      [
        { x: x - idiv(3 * ts, 16), y: y + idiv(ts, 8) },
        { x: x - idiv(2 * ts, 16), y: y + idiv(7 * ts, 24) },
        { x: x - idiv(1 * ts, 16), y: y + idiv(ts, 8) },
      ],
      COL_BACKGROUND,
      black,
    );
    dr.drawPolygon(
      [
        { x: x + idiv(3 * ts, 16), y: y + idiv(ts, 8) },
        { x: x + idiv(2 * ts, 16), y: y + idiv(7 * ts, 24) },
        { x: x + idiv(1 * ts, 16), y: y + idiv(ts, 8) },
      ],
      COL_BACKGROUND,
      black,
    );
    dr.drawCircle({ x, y: y - f(ts / 5) }, m25, COL_VAMPIRE, black);
    dr.unclip();
  } else if (monster === MON_ZOMBIE) {
    dr.drawCircle({ x, y }, m25, COL_ZOMBIE, black);

    const ex = f(ts / 7);
    const ey = f(ts / 12);
    const r = f(ts / 16);
    dr.drawLine({ x: x - ex - r, y: y - ey - r }, { x: x - ex + r, y: y - ey + r }, black, 1);
    dr.drawLine({ x: x - ex + r, y: y - ey - r }, { x: x - ex - r, y: y - ey + r }, black, 1);
    dr.drawLine({ x: x + ex - r, y: y - ey - r }, { x: x + ex + r, y: y - ey + r }, black, 1);
    dr.drawLine({ x: x + ex + r, y: y - ey - r }, { x: x + ex - r, y: y - ey + r }, black, 1);

    dr.clip({ x: x - f(ts / 5), y: y + f(ts / 6), w: m25 + 1, h: f(ts / 2) });
    dr.drawCircle({ x: x - f(ts / 15), y: y + f(ts / 6) }, f(ts / 12), COL_BACKGROUND, black);
    dr.unclip();
    dr.drawLine({ x: x - f(ts / 5), y: y + f(ts / 6) }, { x: x + f(ts / 5), y: y + f(ts / 6) }, black, 1);
  }
}

// --- cell + furniture drawing ----------------------------------------------

function cellCentre(ds: UndeadDrawState, x: number, y: number): { dx: number; dy: number } {
  const ts = ds.tilesize;
  return {
    dx: border(ts) + x * ts + f(ts / 2),
    dy: border(ts) + y * ts + f(ts / 2) + ts,
  };
}

function drawCellBackground(
  dr: GameDrawing,
  ds: UndeadDrawState,
  ui: UndeadUi,
  x: number,
  y: number,
): void {
  const ts = ds.tilesize;
  const { dx, dy } = cellCentre(ds, x, y);
  const hon = ui.hshow && x === ui.hx && y === ui.hy;
  dr.drawRect(
    { x: dx - f(ts / 2) + 1, y: dy - f(ts / 2) + 1, w: ts - 1, h: ts - 1 },
    hon && !ui.hpencil ? COL_HIGHLIGHT : COL_BACKGROUND,
  );
  if (hon && ui.hpencil) {
    dr.drawPolygon(
      [
        { x: dx - f(ts / 2) + 1, y: dy - f(ts / 2) + 1 },
        { x: dx - f(ts / 2) + 1 + f(ts / 2), y: dy - f(ts / 2) + 1 },
        { x: dx - f(ts / 2) + 1, y: dy - f(ts / 2) + 1 + f(ts / 2) },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
  }
  dr.drawUpdate({ x: dx - f(ts / 2) + 1, y: dy - f(ts / 2) + 1, w: ts - 1, h: ts - 1 });
}

function drawMirror(dr: GameDrawing, ds: UndeadDrawState, x: number, y: number, hflash: boolean, mirror: number): void {
  const ts = ds.tilesize;
  const { dx, dy } = cellCentre(ds, x, y);
  let mx1: number;
  let my1: number;
  let mx2: number;
  let my2: number;
  if (mirror === CELL_MIRROR_L) {
    mx1 = dx - f(ts / 4);
    my1 = dy - f(ts / 4);
    mx2 = dx + f(ts / 4);
    my2 = dy + f(ts / 4);
  } else {
    mx1 = dx - f(ts / 4);
    my1 = dy + f(ts / 4);
    mx2 = dx + f(ts / 4);
    my2 = dy - f(ts / 4);
  }
  dr.drawLine({ x: mx1, y: my1 }, { x: mx2, y: my2 }, hflash ? COL_FLASH : COL_TEXT, f(ts / 16));
  dr.drawUpdate({ x: dx - f(ts / 2) + 1, y: dy - f(ts / 2) + 1, w: ts - 1, h: ts - 1 });
}

function drawBigMonster(
  dr: GameDrawing,
  ds: UndeadDrawState,
  x: number,
  y: number,
  hflash: boolean,
  monster: number,
  ascii: boolean,
): void {
  const ts = ds.tilesize;
  const { dx, dy } = cellCentre(ds, x, y);
  if (ascii) {
    const buf = monster === MON_GHOST ? "G" : monster === MON_VAMPIRE ? "V" : monster === MON_ZOMBIE ? "Z" : " ";
    dr.drawText(
      { x: dx, y: dy },
      { align: "center", baseline: "mathematical", fontType: "variable", size: f(ts / 2) },
      hflash ? COL_FLASH : COL_TEXT,
      buf,
    );
    dr.drawUpdate({ x: dx - f(ts / 2) + 2, y: dy - f(ts / 2) + 2, w: ts - 3, h: ts - 3 });
  } else {
    drawMonster(dr, dx, dy, idiv(3 * ts, 4), hflash, monster);
    dr.drawUpdate({ x: dx - f(ts / 2) + 2, y: dy - f(ts / 2) + 2, w: ts - 3, h: ts - 3 });
  }
}

function drawPencils(
  dr: GameDrawing,
  ds: UndeadDrawState,
  x: number,
  y: number,
  pencil: number,
  ascii: boolean,
): void {
  const ts = ds.tilesize;
  const dx = border(ts) + x * ts + f(ts / 4);
  const dy = border(ts) + y * ts + f(ts / 4) + ts;
  const monsters = [0, 0, 0, 0];
  let i = 0;
  for (let j = 1; j < 8; j *= 2) if (pencil & j) monsters[i++] = j;

  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const m = monsters[py * 2 + px];
      if (!m) continue;
      if (!ascii) {
        drawMonster(dr, dx + f(ts / 2) * px, dy + f(ts / 2) * py, f(ts / 2), false, m);
      } else {
        const buf = m === MON_GHOST ? "G" : m === MON_VAMPIRE ? "V" : "Z";
        dr.drawText(
          { x: dx + f(ts / 2) * px, y: dy + f(ts / 2) * py },
          { align: "center", baseline: "mathematical", fontType: "variable", size: f(ts / 4) },
          COL_TEXT,
          buf,
        );
      }
    }
  }
  dr.drawUpdate({ x: dx - f(ts / 4) + 2, y: dy - f(ts / 4) + 2, w: f(ts / 2) - 3, h: f(ts / 2) - 3 });
}

function drawMonsterCountBackground(dr: GameDrawing, ds: UndeadDrawState): void {
  const ts = ds.tilesize;
  dr.drawRect({ x: 0, y: countY(ts), w: 2 * border(ts) + (ds.w + 2) * ts, h: ts }, COL_BACKGROUND);
  dr.drawUpdate({ x: 0, y: countY(ts), w: 2 * border(ts) + (ds.w + 2) * ts, h: ts });
}

function drawMonsterCount(
  dr: GameDrawing,
  ds: UndeadDrawState,
  state: UndeadState,
  c: number,
  hflash: boolean,
): void {
  const ts = ds.tilesize;
  const dx = countX(ds, c);
  const dy = countY(ts);
  const dw = ds.countW;
  const dh = ts;
  const msize = idiv(2 * ts, 3);
  const fontsize = ds.countFontsize;
  const gap = ds.countGap;
  const padding = ds.countPadding;
  const placed = ds.countPlaced[c];
  const common = state.common;

  const total =
    c === 0 ? common.numGhosts : c === 1 ? common.numVampires : common.numZombies;
  const bufm = c === 0 ? "G" : c === 1 ? "V" : "Z";

  let buf: string;
  if (ds.countStyle === COUNT_STYLE_REMAINING) {
    if (placed === total) buf = "0";
    else if (placed > total) buf = String(placed - total);
    else buf = `−${total - placed}`; // U+2212 minus sign
  } else if (ds.countStyle === COUNT_STYLE_PLACED_TOTAL) {
    buf = `${placed}/${total}`;
  } else if (ds.countStyle === COUNT_STYLE_REMAINING_TOTAL) {
    // remaining-to-place / total-needed; a negative remaining (over-placed) shows
    // a proper minus sign and renders red via the colour logic below.
    const remaining = total - placed;
    const left = remaining < 0 ? `−${-remaining}` : String(remaining);
    buf = `${left}/${total}`;
  } else {
    buf = String(total);
  }

  dr.drawRect({ x: dx, y: dy, w: dw + gap, h: dh }, COL_BACKGROUND);
  if (!ds.ascii) {
    drawMonster(dr, dx + f(msize / 2), dy + f(dh / 2), msize, hflash, 1 << c);
  } else {
    dr.drawText(
      { x: dx + f(msize / 2), y: dy + f(dh / 2) },
      { align: "center", baseline: "mathematical", fontType: "variable", size: idiv(ts, 2) },
      hflash ? COL_FLASH : COL_TEXT,
      bufm,
    );
  }
  const colour =
    state.countErrors[c] || placed > total
      ? COL_ERROR
      : hflash
        ? COL_FLASH
        : placed === total
          ? COL_DONE
          : COL_TEXT;
  dr.drawText(
    { x: dx + msize + padding, y: dy + f(dh / 2) },
    { align: "left", baseline: "mathematical", fontType: "variable", size: fontsize },
    colour,
    buf,
  );
  dr.drawUpdate({ x: dx, y: dy, w: dw + gap, h: dh });
}

function drawPathHint(
  dr: GameDrawing,
  ds: UndeadDrawState,
  x: number,
  y: number,
  colour: number,
  hint: number,
): void {
  const ts = ds.tilesize;
  let dx = border(ts) + x * ts;
  let dy = border(ts) + y * ts + ts;
  const textDx = dx + f(ts / 2);
  const textDy = dy + f(ts / 2);
  dx += 2;
  dy += 2;
  const textSize = ts - 3;
  dr.drawRect({ x: dx, y: dy, w: textSize, h: textSize }, COL_BACKGROUND);
  dr.drawText(
    { x: textDx, y: textDy },
    { align: "center", baseline: "mathematical", fontType: "variable", size: idiv(ts, 2) },
    colour,
    String(hint),
  );
  dr.drawUpdate({ x: dx, y: dy, w: textSize, h: textSize });
}

function rectOutline(dr: GameDrawing, x: number, y: number, w: number, h: number, colour: number): void {
  dr.drawPolygon(
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    -1,
    colour,
  );
}

function drawPencilIndicator(dr: GameDrawing, ds: UndeadDrawState, on: boolean): void {
  const ts = ds.tilesize;
  const b = border(ts);
  const ox = 2 * b + (ds.w + 2) * ts - b;
  dr.drawRect({ x: ox, y: 0, w: b, h: b }, COL_BACKGROUND);
  if (on) drawPencilGlyph(dr, ox, 0, b, COL_PENCIL_BODY, COL_GRID);
  dr.drawUpdate({ x: ox, y: 0, w: b, h: b });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: UndeadDrawState | null,
  _prev: UndeadState | null,
  state: UndeadState,
  _dir: number,
  ui: UndeadUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly { x: number; y: number }[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const common = state.common;
  const w = ds.w;
  const h = ds.h;
  const stride = common.w + 2;
  const b = border(ts);
  const hflash = Math.trunc((flashTime * 5) / FLASH_TIME) % 2 !== 0;

  if (!ds.started) {
    const fullW = 2 * b + (w + 2) * ts;
    const fullH = 2 * b + (h + 3) * ts;
    dr.drawRect({ x: 0, y: 0, w: fullW, h: fullH }, COL_BACKGROUND);
    dr.drawRect({ x: b + ts - 1, y: b + 2 * ts - 1, w: w * ts + 3, h: h * ts + 3 }, COL_GRID);
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        dr.drawRect(
          { x: b + ts * (i + 1) + 1, y: b + ts * (j + 2) + 1, w: ts - 1, h: ts - 1 },
          COL_BACKGROUND,
        );
      }
    }
    dr.drawUpdate({ x: 0, y: 0, w: fullW, h: fullH });
  }

  const hchanged =
    ds.hx !== ui.hx || ds.hy !== ui.hy || ds.hshow !== ui.hshow || ds.hpencil !== ui.hpencil;
  const changedAscii = ds.ascii !== ui.ascii;
  if (changedAscii) ds.ascii = ui.ascii;
  const changedCountStyle = ds.countStyle !== ui.countStyle;
  if (changedCountStyle) ds.countStyle = ui.countStyle;

  // Placed counts.
  const placed = [0, 0, 0];
  for (let i = 0; i < common.numTotal; i++) {
    if (state.guess[i] === MON_GHOST) placed[0]++;
    else if (state.guess[i] === MON_VAMPIRE) placed[1]++;
    else if (state.guess[i] === MON_ZOMBIE) placed[2]++;
  }

  if (changedCountStyle) drawMonsterCountBackground(dr, ds);
  if (changedCountStyle || !ds.started) calculateCountLayout(ds);

  for (let i = 0; i < 3; i++) {
    let stale = !ds.started || ds.hflash !== hflash || changedAscii || changedCountStyle;
    if (ds.countErrors[i] !== state.countErrors[i]) {
      stale = true;
      ds.countErrors[i] = state.countErrors[i];
    }
    if (ds.countPlaced[i] !== placed[i]) {
      stale = true;
      ds.countPlaced[i] = placed[i];
    }
    if (stale) drawMonsterCount(dr, ds, state, i, hflash);
  }

  // Path-count hints.
  const isHintStale = (index: number): boolean => {
    let ret = false;
    if (!ds.started) ret = true;
    if (ds.hflash !== hflash) ret = true;
    if (ds.hintErrors[index] !== state.hintErrors[index]) {
      ds.hintErrors[index] = state.hintErrors[index];
      ret = true;
    }
    if (ds.hintsDone[index] !== state.hintsDone[index]) {
      ds.hintsDone[index] = state.hintsDone[index];
      ret = true;
    }
    return ret;
  };
  const hintColour = (index: number): number => {
    if (state.hintErrors[index]) return COL_ERROR;
    if (hflash) return COL_FLASH;
    if (state.hintsDone[index]) return COL_DONE;
    return COL_TEXT;
  };
  for (const path of common.paths) {
    if (isHintStale(path.gridStart)) {
      const g = rangeCell(path.gridStart, common.w, common.h);
      drawPathHint(dr, ds, g.x, g.y, hintColour(path.gridStart), path.sightingsStart);
    }
    if (isHintStale(path.gridEnd)) {
      const g = rangeCell(path.gridEnd, common.w, common.h);
      drawPathHint(dr, ds, g.x, g.y, hintColour(path.gridEnd), path.sightingsEnd);
    }
  }

  // Mistake overlay sidecar.
  ds.wrong.fill(0);
  if (mistakes) for (const m of mistakes) ds.wrong[m.x + m.y * stride] = 1;

  // Grid cells.
  for (let x = 1; x < w + 1; x++) {
    for (let y = 1; y < h + 1; y++) {
      const xy = x + y * stride;
      const xi = common.xinfo[xy];
      const c = common.grid[xy];

      let stale = !ds.started || ds.hflash !== hflash || changedAscii;
      if (hchanged && ((x === ui.hx && y === ui.hy) || (x === ds.hx && y === ds.hy))) stale = true;
      if (xi >= 0 && state.guess[xi] !== ds.monsters[xi]) {
        stale = true;
        ds.monsters[xi] = state.guess[xi];
      }
      if (xi >= 0 && state.pencils[xi] !== ds.pencils[xi]) {
        stale = true;
        ds.pencils[xi] = state.pencils[xi];
      }
      if (state.cellErrors[xy] !== ds.cellErrors[xy]) {
        stale = true;
        ds.cellErrors[xy] = state.cellErrors[xy];
      }
      if (ds.wrong[xy] !== ds.drawnWrong[xy]) stale = true;

      if (stale) {
        drawCellBackground(dr, ds, ui, x, y);
        if (xi < 0) {
          drawMirror(dr, ds, x, y, hflash, c);
        } else if (
          state.guess[xi] === MON_GHOST ||
          state.guess[xi] === MON_VAMPIRE ||
          state.guess[xi] === MON_ZOMBIE
        ) {
          drawBigMonster(dr, ds, x, y, hflash, state.guess[xi], ui.ascii);
        } else {
          drawPencils(dr, ds, x, y, state.pencils[xi], ui.ascii);
        }
        if (ds.wrong[xy]) {
          const { dx, dy } = cellCentre(ds, x, y);
          for (const inset of [2, 3]) {
            rectOutline(
              dr,
              dx - f(ts / 2) + inset,
              dy - f(ts / 2) + inset,
              ts - 2 * inset,
              ts - 2 * inset,
              COL_ERROR,
            );
          }
          dr.drawUpdate({ x: dx - f(ts / 2) + 1, y: dy - f(ts / 2) + 1, w: ts - 1, h: ts - 1 });
        }
        ds.drawnWrong[xy] = ds.wrong[xy];
      }
    }
  }

  // Pencil-mode indicator (fork addition).
  if (!ds.started || ds.pencilModeShown !== ui.hpencil) {
    drawPencilIndicator(dr, ds, ui.hpencil);
    ds.pencilModeShown = ui.hpencil;
  }

  ds.hx = ui.hx;
  ds.hy = ui.hy;
  ds.hshow = ui.hshow;
  ds.hpencil = ui.hpencil;
  ds.hflash = hflash;
  ds.countStyle = ui.countStyle;
  ds.started = true;
}

/** Border cell `(x, y)` for an edge index — the render-side `range2grid` (we
 * only need the position, not the direction). */
function rangeCell(rangeno: number, width: number, height: number): { x: number; y: number } {
  if (rangeno < width) return { x: rangeno + 1, y: 0 };
  rangeno -= width;
  if (rangeno < height) return { x: width + 1, y: rangeno + 1 };
  rangeno -= height;
  if (rangeno < width) return { x: width - rangeno, y: height + 1 };
  rangeno -= width;
  return { x: 0, y: height - rangeno };
}
