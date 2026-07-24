/**
 * Crossing rendering — idiomatic port of `game_redraw` and its helpers from
 * `unreleased/crossing.c`.
 *
 * The board sits inside a **half-tile margin** on every side (so the pointer
 * conversion subtracts `tilesize/2`, unlike the zero-border `NARROW_BORDERS`
 * geometry most ports use), with a three-tile **number-list panel** below it.
 * Every cell is a bevelled tile: walls are drawn indented in grey, an entered
 * digit outdented in that digit's own colour, and an empty cell shows the inner
 * background (or the selection highlight) plus its pencil marks. A run that is
 * full but reads as no listed number gets a thick red frame drawn around the
 * whole run, one clipped tile at a time.
 *
 * Upstream repaints the entire canvas every frame — its own TODO list asks for
 * "optimize drawing routines". Here each cell's pixels depend only on its own
 * digit, notes, error/cursor flags and the flash phase, so a per-tile
 * `Int32Array` cache suffices (playbook §3.2), with the Check-&-Save mistake
 * overlay in an `OverlaySidecar` so a mistaken-but-otherwise-unchanged cell
 * still repaints. The number panel repaints only when a clue's used/duplicate
 * state changes.
 *
 * Two deliberate display divergences, both recorded in the change's design.md:
 * the completion flash animates through the nine digit colours (upstream
 * declares its frame counter `bool`, so its "flash" is a single static colour
 * shift — clearly not the intent of `FLASH_TIME = 9 × FLASH_FRAME`), and the
 * sticky pencil mode adds a mode-indicator glyph in the top-left margin.
 */

import type { Colour, DrawTextOptions, Size } from "../../../puzzle/types.ts";
import { mkhighlight, mkhighlightSpecific } from "../../engine/colour-mkhighlight.ts";
import { drawRectCorners, drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import type { CrossingMistake } from "./solver.ts";
import {
  type CrossingPuzzle,
  type CrossingState,
  type CrossingUi,
  validateBoard,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 40;
const FLASH_FRAME = 0.08;
export const FLASH_TIME = FLASH_FRAME * 9;

// --- palette (index-for-index with the upstream COL_* enum) -----------------

export const COL_OUTERBG = 0;
export const COL_LOWLIGHT = 1;
export const COL_INNERBG = 2;
export const COL_HIGHLIGHT = 3;
export const COL_GRID = 4;
export const COL_ERROR = 5;
export const COL_WALL_L = 6;
export const COL_WALL_M = 7;
export const COL_WALL_H = 8;
/** The nine digit colours, each a low/mid/high triple: digit `n` (1-based) has
 * its mid index at `COL_NUM_M(n - 1)`, its low at −1 and its high at +1. */
export const COL_NUM1_L = 9;
export const NCOLOURS = COL_NUM1_L + 27;
/** Fork addition, appended past the upstream enum (Crossing declares no
 * dark-mode `paletteOverrides`, so a plain append is safe): the yellow body of
 * the shared pencil-mode indicator glyph. */
export const COL_PENCIL_BODY = NCOLOURS;

/** Mid-colour palette index of digit-colour `c` (`0`-based). */
export const numMid = (c: number): number => COL_NUM1_L + 1 + c * 3;

/** Upstream's nine per-digit tile colours (`bgcols`). */
const BG_COLS = [
  0xffa07a, // lightsalmon
  0x98fb98, // green
  0x7fffd4, // aquamarine
  0x9370db, // medium purple
  0xffa500, // orange
  0x87cefa, // lightskyblue
  0xddcc11, // yellow-ish
  0x4080ff,
  0x7092be,
];

export function colours(defaultBackground: Colour): Colour[] {
  const out: Colour[] = new Array(NCOLOURS + 1);
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  out[COL_OUTERBG] = defaultBackground;
  out[COL_INNERBG] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_GRID] = [0, 0, 0];
  out[COL_ERROR] = [1, 0, 0];

  const wall = mkhighlightSpecific([0.3, 0.3, 0.3]);
  out[COL_WALL_M] = wall.base;
  out[COL_WALL_H] = wall.highlight;
  out[COL_WALL_L] = wall.lowlight;

  for (let c = 0; c < 9; c++) {
    const rgb = BG_COLS[c];
    // Upstream divides by 256, not 255 — kept so the tiles are the same shade.
    const mid = mkhighlightSpecific([
      ((rgb & 0xff0000) >> 16) / 256,
      ((rgb & 0xff00) >> 8) / 256,
      (rgb & 0xff) / 256,
    ]);
    out[numMid(c)] = mid.base;
    out[numMid(c) + 1] = mid.highlight;
    out[numMid(c) - 1] = mid.lowlight;
  }

  out[COL_PENCIL_BODY] = [1, 0.78, 0.17];
  return out;
}

// --- geometry --------------------------------------------------------------

/** Half a tile of margin surrounds the grid, and three tiles below it hold the
 * number list. */
export function computeSize(p: { w: number; h: number }, ts: number): Size {
  return { w: (p.w + 1) * ts, h: (p.h + 1 + 3) * ts };
}

/** Pixel → cell index along one axis. Upstream's `FROMCOORD` is C's
 * *truncating* division, so a pointer inside the top/left margin maps to row or
 * column 0 rather than off-grid — reproduced with `Math.trunc` (as Sticks does)
 * rather than the shared floor-based `fromCoord`. */
export function fromCoord(pixel: number, ts: number): number {
  return Math.trunc((pixel - Math.floor(ts / 2)) / ts);
}

/** Top-left pixel of cell `v` along one axis. */
const tileOrigin = (v: number, ts: number): number => v * ts + Math.floor(ts / 2);

// --- draw state ------------------------------------------------------------

// Per-cell error flags (upstream `FE_*`): which end(s) of an erroneous run the
// cell is, per axis.
const FE_LEFT = 0x01;
const FE_RIGHT = 0x02;
const FE_CENTER = FE_LEFT | FE_RIGHT;
const FE_TOP = 0x04;
const FE_BOT = 0x08;
const FE_MID = FE_TOP | FE_BOT;

// Cache-key bit layout for a cell's packed tile value.
const K_DIGIT = 0; // bits 0-3: the entered digit (0 = empty)
const K_ERR = 4; // bits 4-7: the FE_* flags
const DF_SELECT = 1 << 8; // mouse ink selection (a highlighted background)
const DF_PENCIL = 1 << 9; // pencil selection (the corner triangle)
const DF_KEYCUR = 1 << 10; // keyboard cursor (corner brackets)
const K_FLASH = 11; // bits 11-14: flash phase + 1 (0 = not flashing)
const K_MARKS = 15; // bits 15-23: the nine pencil-mark bits

export interface CrossingDrawState {
  started: boolean;
  tilesize: number;
  /** `w·h` last-drawn packed tile values (-1 = never drawn). */
  tiles: Int32Array;
  /** Mistake-overlay sidecar (fork addition) — keeps Check & Save in the diff key. */
  wrong: OverlaySidecar;
  /** Per-number last-drawn panel colour class (-1 = never drawn). */
  numberState: Int8Array;
  /** Whether the pencil-mode indicator was on last frame (fork addition). */
  pencilModeShown: boolean;
}

export function newDrawState(state: CrossingState): CrossingDrawState {
  const { w, h, numbers } = state.puzzle;
  return {
    started: false,
    tilesize: 0,
    tiles: new Int32Array(w * h).fill(-1),
    wrong: new OverlaySidecar(w * h),
    numberState: new Int8Array(numbers.length).fill(-1),
    pencilModeShown: false,
  };
}

export function setTileSize(ds: CrossingDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- drawing helpers -------------------------------------------------------

const textOpts = (
  size: number,
  align: DrawTextOptions["align"],
  baseline: DrawTextOptions["baseline"],
  fontType: DrawTextOptions["fontType"] = "variable",
): DrawTextOptions => ({ align, baseline, fontType, size });

/** Upstream `draw_tile`: a bevelled square. Passing `(low, mid, high)` draws it
 * outdented, `(high, mid, low)` indented. */
function drawBevelTile(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  low: number,
  mid: number,
  high: number,
): void {
  const hw = Math.floor(ts / 10);
  dr.clip({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 });
  dr.drawRect({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 }, mid);
  dr.drawPolygon(
    [
      { x: tx + ts, y: ty + ts },
      { x: tx + ts, y: ty + 1 },
      { x: tx + 1, y: ty + ts },
    ],
    low,
    low,
  );
  dr.drawPolygon(
    [
      { x: tx + 1, y: ty + 1 },
      { x: tx + ts, y: ty + 1 },
      { x: tx + 1, y: ty + ts },
    ],
    high,
    high,
  );
  dr.drawRect({ x: tx + 1 + hw, y: ty + 1 + hw, w: ts - 2 * hw, h: ts - 2 * hw }, mid);
  dr.unclip();
  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
}

/** Upstream `draw_text_outline` (misc.c): the text drawn four times offset by a
 * pixel in the outline colour, then once on top in the text colour. */
function drawTextOutline(
  dr: GameDrawing,
  x: number,
  y: number,
  opts: DrawTextOptions,
  textColour: number,
  outlineColour: number,
  text: string,
): void {
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    dr.drawText({ x: x + dx, y: y + dy }, opts, outlineColour, text);
  }
  dr.drawText({ x, y }, opts, textColour, text);
}

/**
 * Upstream `draw_err_rectangle`: one tile's slice of the thick red frame drawn
 * around an erroneous run. The caller deliberately passes a rectangle that
 * overhangs the tile at any end the run continues through, and the clip then
 * hides the overhanging bars — which is what makes the frame continuous along
 * the run and closed at its ends.
 */
function drawErrRectangle(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const thick = Math.floor(ts / 10);
  const margin = Math.floor(ts / 20);
  dr.clip({ x: tx, y: ty, w: ts, h: ts });
  dr.drawRect({ x: x + margin, y: y + margin, w: w - 2 * margin, h: thick }, COL_ERROR);
  dr.drawRect({ x: x + margin, y: y + margin, w: thick, h: h - 2 * margin }, COL_ERROR);
  dr.drawRect(
    { x: x + margin, y: y + h - margin - thick, w: w - 2 * margin, h: thick },
    COL_ERROR,
  );
  dr.drawRect(
    { x: x + w - margin - thick, y: y + margin, w: thick, h: h - 2 * margin },
    COL_ERROR,
  );
  dr.unclip();
}

/** Upstream's pencil-selection cue: a small triangle in the tile's top-left. */
function drawPencilCorner(dr: GameDrawing, ts: number, tx: number, ty: number): void {
  const half = Math.floor(ts / 2);
  dr.drawPolygon(
    [
      { x: tx, y: ty },
      { x: tx + half, y: ty },
      { x: tx, y: ty + half },
    ],
    COL_LOWLIGHT,
    COL_LOWLIGHT,
  );
}

/** The pencil-mark grid inside an empty cell (upstream's inline block). */
function drawMarks(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  marks: number,
): void {
  let nhints = 0;
  for (let i = 0; i < 9; i++) if (marks & (1 << i)) nhints++;
  if (nhints === 0) return;

  let hw = 1;
  while (hw * hw < nhints) hw++;
  if (hw < 3) hw = 3;
  let hh = Math.floor((nhints + hw - 1) / hw);
  if (hh < 2) hh = 2;
  const hmax = Math.max(hw, hh);
  const fontsz = Math.floor(ts / Math.floor((hmax * (11 - hmax)) / 8));

  let j = 0;
  for (let i = 0; i < 9; i++) {
    if (!(marks & (1 << i))) continue;
    const hx = j % hw;
    const hy = Math.floor(j / hw);
    dr.drawText(
      {
        x: tx + Math.floor(((4 * hx + 3) * ts) / (4 * hw + 2)),
        y: ty + Math.floor(((4 * hy + 3) * ts) / (4 * hh + 2)),
      },
      textOpts(fontsz, "center", "mathematical"),
      numMid(i) - 1,
      String(i + 1),
    );
    j++;
  }
}

/** The Check-&-Save mistake overlay (fork addition): a red box inset well
 * inside the tile, so it stays distinguishable from the run-error frame drawn
 * at the tile's edge. */
function drawMistake(dr: GameDrawing, ts: number, tx: number, ty: number): void {
  const inset = Math.max(3, Math.floor(ts / 6));
  const size = ts - 2 * inset;
  for (const d of [0, 1]) {
    drawRectOutline(
      dr,
      tx + inset + d,
      ty + inset + d,
      size - 2 * d,
      size - 2 * d,
      COL_ERROR,
    );
  }
}

// --- per-cell painting -----------------------------------------------------

function drawCell(
  dr: GameDrawing,
  ds: CrossingDrawState,
  puzzle: CrossingPuzzle,
  state: CrossingState,
  x: number,
  y: number,
  errFlags: number,
  flags: number,
  flash: number,
  wrong: boolean,
): void {
  const ts = ds.tilesize;
  const { w, walls } = puzzle;
  const i = y * w + x;
  const tx = tileOrigin(x, ts);
  const ty = tileOrigin(y, ts);
  const digit = state.grid[i];
  const selected = (flags & DF_SELECT) !== 0;

  if (!digit) {
    dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, selected ? COL_HIGHLIGHT : COL_INNERBG);
  }

  if (walls[i]) {
    drawBevelTile(dr, ts, tx, ty, COL_WALL_H, COL_WALL_M, COL_WALL_L);
  } else if (digit) {
    // During the completion flash the digit colours cycle (see the module note).
    const c = flash > 0 ? (x + y + flash) % 9 : digit - 1;
    const mid = numMid(c);
    const low = selected ? mid + 1 : mid - 1;
    const high = selected ? mid - 1 : mid + 1;
    drawBevelTile(dr, ts, tx, ty, low, mid, high);
    drawTextOutline(
      dr,
      (x + 1) * ts,
      (y + 1) * ts,
      textOpts(Math.floor(ts / 2), "center", "mathematical"),
      high,
      COL_GRID,
      String(digit),
    );
  }

  // The erroneous-run frame, drawn per tile and clipped (see drawErrRectangle).
  if (errFlags & (FE_LEFT | FE_RIGHT)) {
    let left = tx + 1;
    let right = tx + ts;
    if (errFlags & FE_LEFT) right += Math.floor(ts / 2);
    if (errFlags & FE_RIGHT) left -= Math.floor(ts / 2);
    drawErrRectangle(dr, ts, tx, ty, left, ty + 1, right - left, ts - 1);
  }
  if (errFlags & (FE_TOP | FE_BOT)) {
    let top = ty + 1;
    let bottom = ty + ts;
    if (errFlags & FE_TOP) bottom += Math.floor(ts / 2);
    if (errFlags & FE_BOT) top -= Math.floor(ts / 2);
    drawErrRectangle(dr, ts, tx, ty, tx + 1, top, ts - 1, bottom - top);
  }

  if (flags & DF_PENCIL) drawPencilCorner(dr, ts, tx, ty);

  if (!walls[i] && !digit) drawMarks(dr, ts, tx, ty, (flags >> K_MARKS) & 0x1ff);

  if (flags & DF_KEYCUR)
    drawRectCorners(
      dr,
      (1 + x) * ts,
      (1 + y) * ts,
      Math.floor(ts * 0.35),
      COL_HIGHLIGHT,
    );

  if (wrong) drawMistake(dr, ts, tx, ty);

  drawRectOutline(dr, tx, ty, ts + 1, ts + 1, COL_GRID);
  dr.drawUpdate({ x: tx, y: ty, w: ts + 1, h: ts + 1 });
}

// --- the number-list panel -------------------------------------------------

/** Guard on upstream's `while (1)` row-growing loop; it converges long before
 * this (once `rows ≥ numcount` each column holds one number). */
const MAX_PANEL_ROWS = 1000;

/**
 * Upstream `draw_numbers`: the clue list under the grid, laid out in columns of
 * `rows` entries. The row count and font size are grown/shrunk until the widest
 * number of each column fits the board width — upstream's answer to its own
 * "find a way to fit the number list on the screen" TODO, and a genuinely
 * adaptive one, so it is ported rather than replaced. Each number is coloured by
 * how many runs currently read as it: unused, used once (dimmed), or duplicated
 * (red).
 */
function drawNumbers(
  dr: GameDrawing,
  ts: number,
  w: number,
  h: number,
  numbers: readonly string[],
  colourOf: (i: number) => number,
): void {
  const count = numbers.length;
  if (count === 0) return;

  const hgt = 2.8 * ts;
  const wdt = w * ts;
  const whprop = 0.6;
  const yoff = (h + 1.2) * ts;
  let rows = 4;
  let space = 0.8;
  let fontsz = 0;

  for (let guard = 0; guard < MAX_PANEL_ROWS; guard++) {
    fontsz = hgt / rows / 1.4;
    let tmpwdt = -space;
    // The widest number of each column decides that column's width.
    for (let i = rows - 1; i < count + rows - 1; i += rows) {
      tmpwdt += numbers[Math.min(i, count - 1)].length * whprop + space;
    }
    if (fontsz * tmpwdt <= wdt) {
      // It fits: spread the slack evenly between the columns.
      if (count > rows)
        space += (wdt / fontsz - tmpwdt) / (Math.floor((count + rows - 1) / rows) - 1);
      break;
    }
    // More rows would make the text smaller than simply shrinking it here.
    if (wdt / tmpwdt > hgt / (rows + 1) / 1.4) {
      fontsz = wdt / tmpwdt;
      break;
    }
    rows++;
  }

  const opts = textOpts(Math.trunc(fontsz), "left", "alphabetic", "fixed");
  let x = 0.5 * ts - space * fontsz;
  let y = yoff;
  let len = 0;
  for (let i = 0; i < count; i++) {
    if (i % rows === 0) {
      x += (len * whprop + space) * fontsz;
      y = yoff;
    }
    len = numbers[i].length;
    dr.drawText({ x: Math.trunc(x), y: Math.trunc(y) }, opts, colourOf(i), numbers[i]);
    y += hgt / rows;
  }
}

// --- pencil-mode indicator -------------------------------------------------

/** The shared CapsLock-style pencil-mode glyph, drawn in the empty half-tile
 * margin above and left of the grid — the same indicator Towers/Unequal/ABCD
 * use. */
function drawPencilIndicator(dr: GameDrawing, ts: number, on: boolean): void {
  const size = Math.floor(ts / 2);
  dr.drawRect({ x: 0, y: 0, w: size, h: size }, COL_OUTERBG);
  if (on) drawPencilGlyph(dr, 0, 0, size, COL_PENCIL_BODY, COL_GRID);
  dr.drawUpdate({ x: 0, y: 0, w: size, h: size });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: CrossingDrawState | null,
  _prev: CrossingState | null,
  state: CrossingState,
  _dir: number,
  ui: CrossingUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly CrossingMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const puzzle = state.puzzle;
  const { w, h, walls, numbers, runs } = puzzle;

  if (!ds.started) {
    const size = computeSize(puzzle, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_OUTERBG);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
    ds.pencilModeShown = false;
    drawPencilIndicator(dr, ts, ui.cpencil);
    ds.pencilModeShown = ui.cpencil;
  }

  const flash = flashTime > 0 ? Math.floor(flashTime / FLASH_FRAME) : 0;
  // Upstream hides the selection while the win flash runs.
  const cshow = ui.cshow && flashTime === 0;

  // Live errors: which runs read as no listed number, spread over their cells.
  const { done, runErrs } = validateBoard(puzzle, state.grid);
  const errFlags = new Uint8Array(w * h);
  for (let r = 0; r < runs.length; r++) {
    if (!runErrs[r]) continue;
    const cells = runs[r].cells;
    const horizontal = runs[r].horizontal;
    for (let k = 0; k < cells.length; k++) {
      errFlags[cells[k]] |=
        k === 0
          ? horizontal
            ? FE_LEFT
            : FE_TOP
          : k === cells.length - 1
            ? horizontal
              ? FE_RIGHT
              : FE_BOT
            : horizontal
              ? FE_CENTER
              : FE_MID;
    }
  }

  ds.wrong.packCells(mistakes, (x, y) => y * w + x);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const here = cshow && ui.cx === x && ui.cy === y;
      let flags = 0;
      if (here && ui.cpencil) flags |= DF_PENCIL;
      else if (here && ui.ckey) flags |= DF_KEYCUR;
      else if (here) flags |= DF_SELECT;
      if (!walls[i] && !state.grid[i]) flags |= (state.marks[i] & 0x1ff) << K_MARKS;

      const tile =
        (state.grid[i] << K_DIGIT) |
        (errFlags[i] << K_ERR) |
        flags |
        ((flash + 1) << K_FLASH);

      if (ds.tiles[i] !== tile || ds.wrong.stale(i)) {
        drawCell(
          dr,
          ds,
          puzzle,
          state,
          x,
          y,
          errFlags[i],
          flags,
          flash,
          ds.wrong.at(i),
        );
        ds.tiles[i] = tile;
        ds.wrong.commit(i);
      }
    }
  }

  // The number panel: repaint only when a clue's used/duplicate state moved.
  const colourClass = (l: number): number =>
    done[l] === 0 ? 0 : done[l] === 1 ? 1 : 2;
  let panelStale = false;
  for (let l = 0; l < numbers.length; l++) {
    if (ds.numberState[l] !== colourClass(l)) {
      panelStale = true;
      break;
    }
  }
  if (panelStale) {
    // Start below the grid's bottom outline so the panel repaint can't erase it.
    const top = tileOrigin(h - 1, ts) + ts + 2;
    const size = computeSize(puzzle, ts);
    dr.drawRect({ x: 0, y: top, w: size.w, h: size.h - top }, COL_OUTERBG);
    drawNumbers(dr, ts, w, h, numbers, (l) =>
      done[l] === 0 ? COL_GRID : done[l] === 1 ? COL_LOWLIGHT : COL_ERROR,
    );
    dr.drawUpdate({ x: 0, y: top, w: size.w, h: size.h - top });
    for (let l = 0; l < numbers.length; l++) ds.numberState[l] = colourClass(l);
  }

  if (ds.pencilModeShown !== ui.cpencil) {
    drawPencilIndicator(dr, ts, ui.cpencil);
    ds.pencilModeShown = ui.cpencil;
  }
}
