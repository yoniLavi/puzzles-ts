/**
 * Undead rendering — port of `game_redraw` and its helpers from `undead.c`.
 *
 * Layout: a monster-count row across the top, then the `w × h` grid framed by a
 * one-tile border of sighting clues. Each interior cell draws a mirror (a thick
 * diagonal), a placed monster (a drawn ghost/vampire/zombie shape, or a letter
 * in ASCII mode), or a 2×2 grid of pencil notes. The count blocks and edge clues
 * recolor red on error and dim when complete / struck. Cells are diffed against
 * a per-monster-cell cache; the Check & Save mistake overlay rides a sidecar in
 * the diff key (docs/games/rendering.md § "The tile cache and the diff key"). The
 * fork's pencil-mode indicator sits in the top-right border corner.
 *
 * Upstream computes `cell_errors` but never *renders* them (only the count
 * blocks and edge clues turn red), and neither does this port; the inset red
 * outline is the separate Check & Save mistake overlay.
 */

import {
  clueDoneColor,
  ERROR,
  FLASH,
  HINT_ACTION,
  HINT_EVIDENCE,
  highlightWash,
  INK,
  PENCIL_BODY,
} from "../../engine/color/palette.ts";
import {
  undeadGhost,
  undeadVampire,
  undeadZombie,
} from "../../engine/color/palette-games.ts";
import { glyphFont } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { HintMarks, type MarkBand, type MarkCell } from "../../engine/hint-mark.ts";
import {
  HINT_AREA,
  HINT_TARGET,
  OverlaySidecar,
} from "../../engine/overlay-sidecar.ts";
import {
  type PencilIndicatorBox,
  type PencilIndicatorStyle,
  repaintPencilIndicator,
} from "../../engine/pencil-indicator.ts";
import { type GridCursor, newCursor } from "../../engine/pointer.ts";
import type { Color, Point, Rect, Size } from "../../engine/types.ts";
import {
  CELL_MIRROR_L,
  COUNT_STYLE_PLACED_TOTAL,
  COUNT_STYLE_REMAINING,
  COUNT_STYLE_REMAINING_TOTAL,
  COUNT_STYLE_TOTAL,
  isSingleton,
  MON_GHOST,
  MON_VAMPIRE,
  MON_ZOMBIE,
  MONSTERS,
  range2grid,
  type UndeadMove,
  type UndeadState,
  type UndeadUi,
} from "./state.ts";

/** Highlight payload an Undead hint step carries (built in `index.ts`). See
 * docs/games/hints.md § "The element-type color legend". Coordinates are
 * interior (1-based) grid cells, matching `redraw`/`findMistakes`. */
export interface UndeadHint {
  /** The driving sightline's bounce path, outlined `COL_HINT_CELL` (evidence). */
  area: Point[];
  /** The cell(s) the deduction acts on, ringed `COL_HINT`. */
  targets: Point[];
  /** The candidate monster(s) ruled out, shown struck through in the notes. */
  marks: { x: number; y: number; monster: number }[];
}

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
// Fork additions, appended past the upstream enum; Undead has no dark-mode
// paletteOverrides, so a plain append is safe.
export const COL_PENCIL_BODY = 10;
// The explained-hint legend (docs/games/hints.md § "The element-type color legend").
export const COL_HINT = 11; // the cell(s)/candidate(s) the deduction acts on
export const COL_HINT_CELL = 12; // the driving sightline's bounce path (evidence)

export function colors(defaultBackground: Color): Color[] {
  const bg = defaultBackground;
  const out: Color[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = INK;
  out[COL_TEXT] = INK;
  out[COL_ERROR] = ERROR;
  out[COL_HIGHLIGHT] = highlightWash(bg);
  out[COL_FLASH] = FLASH;
  out[COL_GHOST] = undeadGhost(bg);
  out[COL_ZOMBIE] = undeadZombie(bg);
  out[COL_VAMPIRE] = undeadVampire(bg);
  out[COL_DONE] = clueDoneColor(bg);
  out[COL_PENCIL_BODY] = PENCIL_BODY;
  out[COL_HINT] = HINT_ACTION;
  // Both hint marks are outlines on the cell's border, so both take a strong
  // color: a wash is sized to be read *through*, an outline is read *against*.
  // See `HINT_EVIDENCE` for why the role is teal's bold step.
  out[COL_HINT_CELL] = HINT_EVIDENCE;
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
  pencil: Uint8Array;
  /** `wh` last-drawn cell-error flags (staleness only — see file note). */
  cellErrors: Uint8Array;
  /** `2·numPaths` last-drawn edge-clue error / done flags. */
  hintErrors: Uint8Array;
  hintsDone: Uint8Array;
  countErrors: Uint8Array;
  countPlaced: Int32Array;
  cursor: GridCursor;
  pencilMode: boolean;
  hflash: boolean;
  ascii: boolean;
  countStyle: number;
  countFontsize: number;
  countW: number;
  countGap: number;
  countPadding: number;
  /** `wh` hint-overlay sidecar (fork addition): bit 0 = target cell, bit 1 =
   * evidence area, bits 2.. = struck-monster mask (`monster << 2`). Owns the
   * repack/stale/commit dance that keeps the overlay in the cache diff key
   * (docs/games/rendering.md § "The tile cache and the diff key"). */
  hint: OverlaySidecar;
  /** `wh` mistake-overlay sidecar (Check & Save) — same dance. */
  wrong: OverlaySidecar;
  /** The hint target's ring and the evidence area's outline (fork additions),
   * drawn after the cell loop. See {@link markBand}. */
  marks: HintMarks;
  pencilModeShown: boolean | null;
}

export function newDrawState(state: UndeadState): UndeadDrawState {
  const common = state.common;
  return {
    started: false,
    tilesize: 0,
    w: common.w,
    h: common.h,
    monsters: new Int8Array(common.numTotal).fill(7),
    pencil: new Uint8Array(common.numTotal),
    cellErrors: new Uint8Array(common.wh),
    hintErrors: new Uint8Array(2 * common.numPaths),
    hintsDone: new Uint8Array(2 * common.numPaths),
    countErrors: new Uint8Array(3),
    countPlaced: new Int32Array(3),
    cursor: newCursor(),
    pencilMode: false,
    hflash: false,
    ascii: false,
    countStyle: COUNT_STYLE_TOTAL,
    countFontsize: 0,
    countW: 0,
    countGap: 0,
    countPadding: 0,
    hint: new OverlaySidecar(common.wh),
    wrong: new OverlaySidecar(common.wh),
    marks: new HintMarks(),
    pencilModeShown: null,
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
  else if (ds.countStyle === COUNT_STYLE_PLACED_TOTAL)
    maxChars = maxDigits + 0.5 + maxDigits;
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
      fontsize = Math.trunc(
        (totalW / 3 - COUNT_MSIZE - padding) / (maxChars * DIGIT_WIDTH),
      );
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

// --- primitives ------------------------------------------------------------

function drawCircleOrPoint(
  dr: GameDrawing,
  cx: number,
  cy: number,
  radius: number,
  color: number,
): void {
  if (radius > 0) dr.drawCircle({ x: cx, y: cy }, radius, color, color);
  else dr.drawRect({ x: cx, y: cy, w: 1, h: 1 }, color);
}

/** Draw a monster shape centered at `(x, y)` into a `ts`-wide box (upstream
 * `draw_monster`). `ts` is the monster's own display size, not the tile size.
 * The paired features loop left then right. */
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
    dr.clip({
      x: x - f(ts / 2) + 2,
      y: y - f(ts / 2) + 2,
      w: ts - 3,
      h: f(ts / 2) + 1,
    });
    dr.drawCircle({ x, y }, m25, COL_GHOST, black);
    dr.unclip();

    const poly: Point[] = [
      { x: x - m25, y: y - 2 },
      { x: x - m25, y: y + m25 },
    ];
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

    const eyeY = y - f(ts / 12);
    const pupil = f(ts / 48);
    for (const s of [-1, 1]) {
      dr.drawCircle(
        { x: x + s * f(ts / 6), y: eyeY },
        f(ts / 10),
        COL_BACKGROUND,
        black,
      );
    }
    for (const s of [-1, 1]) {
      drawCircleOrPoint(dr, x + s * f(ts / 6) + 1 + pupil, eyeY, pupil, black);
    }
  } else if (monster === MON_VAMPIRE) {
    dr.clip({ x: x - f(ts / 2) + 2, y: y - f(ts / 2) + 2, w: ts - 3, h: f(ts / 2) });
    dr.drawCircle({ x, y }, m25, black, black);
    dr.unclip();

    dr.clip({
      x: x - f(ts / 2) + 2,
      y: y - f(ts / 2) + 2,
      w: f(ts / 2) + 1,
      h: f(ts / 2),
    });
    dr.drawCircle({ x: x - f(ts / 7), y }, m25 - f(ts / 7), COL_VAMPIRE, black);
    dr.unclip();
    dr.clip({ x, y: y - f(ts / 2) + 2, w: f(ts / 2) + 1, h: f(ts / 2) });
    dr.drawCircle({ x: x + f(ts / 7), y }, m25 - f(ts / 7), COL_VAMPIRE, black);
    dr.unclip();

    dr.clip({ x: x - f(ts / 2) + 2, y, w: ts - 3, h: f(ts / 2) });
    dr.drawCircle({ x, y }, m25, COL_VAMPIRE, black);
    dr.unclip();

    const eyeY = y - f(ts / 16);
    for (const s of [-1, 1]) {
      dr.drawCircle(
        { x: x + s * f(ts / 7), y: eyeY },
        f(ts / 16),
        COL_BACKGROUND,
        black,
      );
    }
    drawCircleOrPoint(dr, x - f(ts / 7), eyeY, f(ts / 48), black);
    drawCircleOrPoint(dr, x + f(ts / 7), eyeY, f(ts / 48), black);

    dr.clip({ x: x - f(ts / 2) + 2, y: y + f(ts / 8), w: ts - 3, h: f(ts / 4) });
    for (const s of [-1, 1]) {
      dr.drawPolygon(
        [
          { x: x + s * idiv(3 * ts, 16), y: y + idiv(ts, 8) },
          { x: x + s * idiv(2 * ts, 16), y: y + idiv(7 * ts, 24) },
          { x: x + s * idiv(1 * ts, 16), y: y + idiv(ts, 8) },
        ],
        COL_BACKGROUND,
        black,
      );
    }
    dr.drawCircle({ x, y: y - f(ts / 5) }, m25, COL_VAMPIRE, black);
    dr.unclip();
  } else if (monster === MON_ZOMBIE) {
    dr.drawCircle({ x, y }, m25, COL_ZOMBIE, black);

    // Crossed-out eyes.
    const eyeY = y - f(ts / 12);
    const r = f(ts / 16);
    for (const s of [-1, 1]) {
      const ex = x + s * f(ts / 7);
      dr.drawLine({ x: ex - r, y: eyeY - r }, { x: ex + r, y: eyeY + r }, black, 1);
      dr.drawLine({ x: ex + r, y: eyeY - r }, { x: ex - r, y: eyeY + r }, black, 1);
    }

    const mouthY = y + f(ts / 6);
    dr.clip({ x: x - f(ts / 5), y: mouthY, w: m25 + 1, h: f(ts / 2) });
    dr.drawCircle({ x: x - f(ts / 15), y: mouthY }, f(ts / 12), COL_BACKGROUND, black);
    dr.unclip();
    dr.drawLine(
      { x: x - f(ts / 5), y: mouthY },
      { x: x + f(ts / 5), y: mouthY },
      black,
      1,
    );
  }
}

// --- cell + furniture drawing ----------------------------------------------

function cellCenter(
  ds: UndeadDrawState,
  x: number,
  y: number,
): { dx: number; dy: number } {
  const ts = ds.tilesize;
  return {
    dx: border(ts) + x * ts + f(ts / 2),
    dy: border(ts) + y * ts + f(ts / 2) + ts,
  };
}

/** A cell's `TILESIZE − 1` square, inside the grid lines around it. */
function cellRect(ds: UndeadDrawState, x: number, y: number): Rect {
  const ts = ds.tilesize;
  const { dx, dy } = cellCenter(ds, x, y);
  return { x: dx - f(ts / 2) + 1, y: dy - f(ts / 2) + 1, w: ts - 1, h: ts - 1 };
}

/**
 * Where a hint mark sits around cell `(x, y)` (border-ring coordinates) —
 * straddling the grid line, one pixel of gutter and a couple of the cell's own
 * edge.
 *
 * Undead's cells are `TILESIZE − 1` squares on a `TILESIZE` pitch over a
 * `COL_GRID` backing rectangle, so a single pixel between them is real gutter and
 * is what `HintMarks` paints back when a mark moves; the rest lies inside the
 * cell, where the cell's own repaint undoes it.
 *
 * The inner reach is bounded by the pencil glyphs rather than chosen: a penciled
 * monster is a circle of radius `2/5` of its `TILESIZE/2` box, centered a quarter
 * of a tile in, so it clears the cell edge by `TILESIZE/20`.
 */
function markBand(ds: UndeadDrawState, x: number, y: number): MarkBand {
  return {
    box: cellRect(ds, x, y),
    outer: 1,
    inner: Math.max(2, f(ds.tilesize / 24)),
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
  const { dx, dy } = cellCenter(ds, x, y);
  const hon = ui.cursor.visible && x === ui.cursor.x && y === ui.cursor.y;
  dr.drawRect(
    cellRect(ds, x, y),
    hon && !ui.pencilMode ? COL_HIGHLIGHT : COL_BACKGROUND,
  );
  if (hon && ui.pencilMode) {
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
  dr.drawUpdate(cellRect(ds, x, y));
}

function drawMirror(
  dr: GameDrawing,
  ds: UndeadDrawState,
  x: number,
  y: number,
  hflash: boolean,
  mirror: number,
): void {
  const ts = ds.tilesize;
  const { dx, dy } = cellCenter(ds, x, y);
  // `\` falls to the right, `/` rises.
  const d = f(ts / 4);
  const fall = mirror === CELL_MIRROR_L ? d : -d;
  dr.drawLine(
    { x: dx - d, y: dy - fall },
    { x: dx + d, y: dy + fall },
    hflash ? COL_FLASH : COL_TEXT,
    f(ts / 16),
  );
  dr.drawUpdate(cellRect(ds, x, y));
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
  const { dx, dy } = cellCenter(ds, x, y);
  if (ascii) {
    const buf =
      monster === MON_GHOST
        ? "G"
        : monster === MON_VAMPIRE
          ? "V"
          : monster === MON_ZOMBIE
            ? "Z"
            : " ";
    dr.drawText(
      { x: dx, y: dy },
      glyphFont(f(ts / 2)),
      hflash ? COL_FLASH : COL_TEXT,
      buf,
    );
    dr.drawUpdate({
      x: dx - f(ts / 2) + 2,
      y: dy - f(ts / 2) + 2,
      w: ts - 3,
      h: ts - 3,
    });
  } else {
    drawMonster(dr, dx, dy, idiv(3 * ts, 4), hflash, monster);
    dr.drawUpdate({
      x: dx - f(ts / 2) + 2,
      y: dy - f(ts / 2) + 2,
      w: ts - 3,
      h: ts - 3,
    });
  }
}

function drawPencils(
  dr: GameDrawing,
  ds: UndeadDrawState,
  x: number,
  y: number,
  pencil: number,
  ascii: boolean,
  struck: number,
): void {
  const ts = ds.tilesize;
  const dx = border(ts) + x * ts + f(ts / 4);
  const dy = border(ts) + y * ts + f(ts / 4) + ts;
  // The notes present fill a 2×2 grid in reading order.
  let slot = 0;
  for (const m of MONSTERS) {
    if (!(pencil & m)) continue;
    const cx = dx + f(ts / 2) * (slot % 2);
    const cy = dy + f(ts / 2) * Math.floor(slot / 2);
    slot++;
    if (!ascii) {
      drawMonster(dr, cx, cy, f(ts / 2), false, m);
    } else {
      const buf = m === MON_GHOST ? "G" : m === MON_VAMPIRE ? "V" : "Z";
      dr.drawText({ x: cx, y: cy }, glyphFont(f(ts / 4)), COL_TEXT, buf);
    }
    // A struck candidate keeps its normal glyph (legible on a non-COL_HINT
    // background) and gains a COL_HINT strikethrough as the "ruled out" cue.
    if (struck & m) {
      const r = f(ts / 6);
      dr.drawLine(
        { x: cx - r, y: cy + r },
        { x: cx + r, y: cy - r },
        COL_HINT,
        Math.max(1, f(ts / 24)),
      );
    }
  }
  dr.drawUpdate({
    x: dx - f(ts / 4) + 2,
    y: dy - f(ts / 4) + 2,
    w: f(ts / 2) - 3,
    h: f(ts / 2) - 3,
  });
}

function drawMonsterCountBackground(dr: GameDrawing, ds: UndeadDrawState): void {
  const ts = ds.tilesize;
  dr.drawRect(
    { x: 0, y: countY(ts), w: 2 * border(ts) + (ds.w + 2) * ts, h: ts },
    COL_BACKGROUND,
  );
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
  const placed = ds.countPlaced[c];
  const common = state.common;
  const total = [common.numGhosts, common.numVampires, common.numZombies][c];
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
    // a proper minus sign and renders red via the color logic below.
    const remaining = total - placed;
    const left = remaining < 0 ? `−${-remaining}` : String(remaining);
    buf = `${left}/${total}`;
  } else {
    buf = String(total);
  }

  dr.drawRect({ x: dx, y: dy, w: dw + ds.countGap, h: dh }, COL_BACKGROUND);
  if (!ds.ascii) {
    drawMonster(dr, dx + f(msize / 2), dy + f(dh / 2), msize, hflash, 1 << c);
  } else {
    dr.drawText(
      { x: dx + f(msize / 2), y: dy + f(dh / 2) },
      glyphFont(idiv(ts, 2)),
      hflash ? COL_FLASH : COL_TEXT,
      bufm,
    );
  }
  const color =
    state.countErrors[c] || placed > total
      ? COL_ERROR
      : hflash
        ? COL_FLASH
        : placed === total
          ? COL_DONE
          : COL_TEXT;
  dr.drawText(
    { x: dx + msize + ds.countPadding, y: dy + f(dh / 2) },
    {
      align: "left",
      baseline: "mathematical",
      fontType: "variable",
      size: ds.countFontsize,
    },
    color,
    buf,
  );
  dr.drawUpdate({ x: dx, y: dy, w: dw + ds.countGap, h: dh });
}

/** An edge sighting clue, in border cell `(x, y)`. */
function drawClue(
  dr: GameDrawing,
  ds: UndeadDrawState,
  x: number,
  y: number,
  color: number,
  clue: number,
): void {
  const ts = ds.tilesize;
  const dx = border(ts) + x * ts;
  const dy = border(ts) + y * ts + ts;
  const box = { x: dx + 2, y: dy + 2, w: ts - 3, h: ts - 3 };
  dr.drawRect(box, COL_BACKGROUND);
  dr.drawText(
    { x: dx + f(ts / 2), y: dy + f(ts / 2) },
    glyphFont(idiv(ts, 2)),
    color,
    String(clue),
  );
  dr.drawUpdate(box);
}

function rectOutline(
  dr: GameDrawing,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  dr.drawPolygon(
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    -1,
    color,
  );
}

const PENCIL_STYLE: PencilIndicatorStyle = {
  background: COL_BACKGROUND,
  body: COL_PENCIL_BODY,
  ink: COL_GRID,
};

/** The empty top-right corner cell of the clue ring (grid cell (w+1, 0)), a
 * full tile like Towers' clue-corner indicator: Undead's ts/4 border is too
 * thin for the shared glyph to read at the other pencil-mark games' size. */
const PENCIL_BOX = (ds: UndeadDrawState): PencilIndicatorBox => {
  const ts = ds.tilesize;
  const b = border(ts);
  return { x: b + (ds.w + 1) * ts, y: b + ts, size: ts };
};

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: UndeadDrawState,
  _prev: UndeadState | null,
  state: UndeadState,
  _dir: number,
  ui: UndeadUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<UndeadMove, UndeadHint>,
  mistakes?: readonly { x: number; y: number }[],
): void {
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
    dr.drawRect(
      { x: b + ts - 1, y: b + 2 * ts - 1, w: w * ts + 3, h: h * ts + 3 },
      COL_GRID,
    );
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        dr.drawRect(
          { x: b + ts * (i + 1) + 1, y: b + ts * (j + 2) + 1, w: ts - 1, h: ts - 1 },
          COL_BACKGROUND,
        );
      }
    }
    dr.drawUpdate({ x: 0, y: 0, w: fullW, h: fullH });
    ds.marks.reset(); // the backing rect just erased every grid line
  }

  const hchanged =
    ds.cursor.x !== ui.cursor.x ||
    ds.cursor.y !== ui.cursor.y ||
    ds.cursor.visible !== ui.cursor.visible ||
    ds.pencilMode !== ui.pencilMode;
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
    let stale =
      !ds.started || ds.hflash !== hflash || changedAscii || changedCountStyle;
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

  // The edge clues.
  const isClueStale = (index: number): boolean => {
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
  const clueColor = (index: number): number => {
    if (state.hintErrors[index]) return COL_ERROR;
    if (hflash) return COL_FLASH;
    if (state.hintsDone[index]) return COL_DONE;
    return COL_TEXT;
  };
  const drawClueAt = (index: number, clue: number): void => {
    if (!isClueStale(index)) return;
    const g = range2grid(index, common.w, common.h);
    drawClue(dr, ds, g.x, g.y, clueColor(index), clue);
  };
  for (const path of common.paths) {
    drawClueAt(path.gridStart, path.sightingsStart);
    drawClueAt(path.gridEnd, path.sightingsEnd);
  }

  // The two overlay sidecars. Hint: bit 0 target, bit 1 area, bits 2.. struck mask.
  const index = (x: number, y: number) => x + y * stride;
  ds.hint.pack(hint?.highlights, index, (m) => m.monster << 2);
  ds.wrong.packCells(mistakes, index);

  // Grid cells.
  for (let x = 1; x < w + 1; x++) {
    for (let y = 1; y < h + 1; y++) {
      const xy = x + y * stride;
      const xi = common.xinfo[xy];
      const c = common.grid[xy];

      let stale = !ds.started || ds.hflash !== hflash || changedAscii;
      if (
        hchanged &&
        ((x === ui.cursor.x && y === ui.cursor.y) ||
          (x === ds.cursor.x && y === ds.cursor.y))
      )
        stale = true;
      if (xi >= 0 && state.guess[xi] !== ds.monsters[xi]) {
        stale = true;
        ds.monsters[xi] = state.guess[xi];
      }
      if (xi >= 0 && state.pencil[xi] !== ds.pencil[xi]) {
        stale = true;
        ds.pencil[xi] = state.pencil[xi];
      }
      if (state.cellErrors[xy] !== ds.cellErrors[xy]) {
        stale = true;
        ds.cellErrors[xy] = state.cellErrors[xy];
      }
      if (ds.hint.stale(xy)) stale = true;
      if (ds.wrong.stale(xy)) stale = true;

      if (stale) {
        const struck = (ds.hint.packed[xy] >> 2) & 7;
        // Both hint marks are drawn after this loop, on the cell's border, so
        // the cell paints its ordinary background and a marked cell keeps
        // showing the candidates the hint is reasoning about.
        drawCellBackground(dr, ds, ui, x, y);
        if (xi < 0) {
          drawMirror(dr, ds, x, y, hflash, c);
        } else if (isSingleton(state.guess[xi])) {
          drawBigMonster(dr, ds, x, y, hflash, state.guess[xi], ui.ascii);
        } else {
          drawPencils(dr, ds, x, y, state.pencil[xi], ui.ascii, struck);
        }
        if (ds.wrong.at(xy)) {
          const { dx, dy } = cellCenter(ds, x, y);
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
          dr.drawUpdate(cellRect(ds, x, y));
        }
        ds.hint.commit(xy);
        ds.wrong.commit(xy);
      }
    }
  }

  // The hint marks, after the cell loop and outside every clip, because they
  // straddle the grid line, which no cell repaints.
  const targets: MarkCell[] = [];
  const evidence: MarkCell[] = [];
  for (let x = 1; x < w + 1; x++) {
    for (let y = 1; y < h + 1; y++) {
      const packed = ds.hint.packed[x + y * stride];
      if (packed & HINT_TARGET) targets.push({ x, y });
      if (packed & HINT_AREA) evidence.push({ x, y });
    }
  }
  ds.marks.paint(dr, targets, evidence, {
    band: (x, y) => markBand(ds, x, y),
    targetColor: COL_HINT,
    evidenceColor: COL_HINT_CELL,
    gutterColor: COL_GRID,
  });

  // Pencil-mode indicator (fork addition).
  repaintPencilIndicator(dr, ds, ui.pencilMode, PENCIL_BOX(ds), PENCIL_STYLE);

  ds.cursor.x = ui.cursor.x;
  ds.cursor.y = ui.cursor.y;
  ds.cursor.visible = ui.cursor.visible;
  ds.pencilMode = ui.pencilMode;
  ds.hflash = hflash;
  ds.started = true;
}
