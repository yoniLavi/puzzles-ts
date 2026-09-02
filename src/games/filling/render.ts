/**
 * Filling (Fillomino) rendering — faithful port of `game_redraw` /
 * `draw_grid` / `draw_square` in filling.c. Per-cell `Int32Array` cache keyed
 * on a packed `(value | flags)` word; region borders, completed/overfull/
 * boxed-in error shades, selection and cursor highlights recomputed each
 * frame from a fresh region DSF. Plus the fork's mistake overlay (Check &
 * Save), an inset error outline distinct from the live overfull shade.
 *
 * Palette mirrors the C color enum index-for-index; `COL_BACKGROUND` is the
 * frontend default background, as in C (Filling has no near-white tiles, so
 * no `mkhighlightSpecific` is needed).
 */

import { PURPLE } from "../../engine/color/colors.ts";
import {
  correctRegionColor,
  ERROR_WASH,
  HINT_ACTION,
  HINT_EVIDENCE,
  highlightWash,
  INK,
  playerEntryColor,
} from "../../engine/color/palette.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { HintMarks, type MarkBand, type MarkCell } from "../../engine/hint-mark.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import type { Color, Size } from "../../engine/types.ts";
import type { FillingHint } from "./index.ts";
import {
  DX,
  DY,
  type FillingMistake,
  type FillingMove,
  type FillingState,
  makeRegionDsf,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.4;

// --- palette (mirrors the filling.c color enum index-for-index) ---------
export const COL_BACKGROUND = 0;
export const COL_GRID = 1; // grid lines and clue digits (COL_CLUE = COL_GRID)
export const COL_HIGHLIGHT = 2; // selected-cell background
export const COL_CORRECT = 3; // completed-region background
export const COL_ERROR = 4; // overfull / boxed-in region background
export const COL_USER = 5; // player-filled digit
export const COL_CURSOR = 6;
export const COL_HINT = 7; // the cell to fill — ringed on its own border
export const COL_HINT_CELL = 8; // the deduction's evidence cells — outlined

export function colors(defaultBackground: Color): Color[] {
  const bg = defaultBackground;
  const out: Color[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = INK;
  out[COL_HIGHLIGHT] = highlightWash(bg);
  out[COL_CORRECT] = correctRegionColor(bg);
  out[COL_ERROR] = ERROR_WASH;
  out[COL_USER] = playerEntryColor(bg);
  // Not `CURSOR`: green is the player's own digits.
  out[COL_CURSOR] = PURPLE;
  out[COL_HINT] = HINT_ACTION;
  // Filling's evidence is **outlined rather than washed**, and it is the game
  // where that call is least obvious, so here is the reason.
  //
  // Filling is the strongest case *for* a shade in the whole collection: its
  // premise is a **number**, and a digit reads perfectly well on a pale fill
  // (3.41:1 in light, 4.04:1 in dark against the evidence wash). That is true,
  // and it is not the binding constraint. The wash also has to be dark enough
  // for a *derived* foreground to survive on it, and at that lightness it
  // measures **1.15:1 against its own board in dark mode** — legible content on
  // a tint nobody can see. The two requirements move in opposite directions
  // along one axis, so a wash under content loses whichever way it is tuned.
  //
  // An outline is not on that axis at all: it is read *against* the board rather
  // than through, so it can take teal's **bold** step — the one defined as "dark
  // in light mode, light in dark mode", standing off the board by a similar
  // margin in both schemes where the base sits at one lightness under either.
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  return out;
}

// --- packed flags (the cache key; value occupies bits 0..3) --------------
const VALUE_BITS = 4;
const BORDER_U = 0x010;
const BORDER_D = 0x020;
const BORDER_L = 0x040;
const BORDER_R = 0x080;
const BORDER_UR = 0x100;
const BORDER_DR = 0x200;
const BORDER_UL = 0x400;
const BORDER_DL = 0x800;
const HIGH_BG = 0x1000;
const CORRECT_BG = 0x2000;
const ERROR_BG = 0x4000;
const USER_COL = 0x8000;
const CURSOR_SQ = 0x10000;
const FF_MISTAKE = 0x20000; // fork's Check & Save overlay (no upstream analog)
const HINT_TARGET = 0x40000; // the cell the displayed hint points at
const HINT_AREA = 0x80000; // an evidence cell shaded light blue

// --- geometry (upstream BORDER = TILE_SIZE/2, BORDER_WIDTH = max(TS/32,1)) -
const border = (ts: number) => Math.floor(ts / 2);
const borderWidth = (ts: number) => Math.max(Math.floor(ts / 32), 1);
const coord = (n: number, ts: number) => border(ts) + n * ts;

export function computeSize(w: number, h: number, ts: number): Size {
  return { w: w * ts + 2 * border(ts), h: h * ts + 2 * border(ts) };
}

// --- draw state ----------------------------------------------------------

export interface FillingDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Last-drawn packed word per cell; -1 forces a draw. */
  cache: Int32Array;
  /** The hint target's ring and the evidence region's outline (fork additions),
   * drawn after the cell loop. See {@link markBand}. */
  marks: HintMarks;
}

export function newDrawState(state: FillingState): FillingDrawState {
  return {
    started: false,
    tilesize: PREFERRED_TILE_SIZE,
    w: state.w,
    h: state.h,
    cache: new Int32Array(state.w * state.h).fill(-1),
    marks: new HintMarks(),
  };
}

/**
 * Where a hint mark sits around cell `(x, y)` — **on the cell's own border**,
 * where its region outline already runs.
 *
 * Filling's cells tile exactly, so there is no gutter and the band lies wholly
 * inside the box (`outer` 0); a cell whose hint flags change repaints itself and
 * takes its mark with it, so there is nothing to erase. It has room because the
 * content is a single digit at half the tile size, centered — a quarter of a tile
 * clear on every side.
 *
 * A mark does cover the region border along the sides it draws. The border
 * survives regardless: each of two cells across a region boundary draws its own
 * `BORDER_WIDTH` half, and only the marked cell's half is painted over.
 */
function markBand(ds: FillingDrawState, x: number, y: number): MarkBand {
  const ts = ds.tilesize;
  return {
    box: { x: coord(x, ts), y: coord(y, ts), w: ts, h: ts },
    outer: 0,
    inner: Math.max(2, ts >> 4),
  };
}

// --- tile drawing --------------------------------------------------------

function drawSquare(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  n: number,
  flags: number,
): void {
  const px = coord(x, ts);
  const py = coord(y, ts);
  const bw = borderWidth(ts);
  dr.clip({ x: px, y: py, w: ts, h: ts });

  // No hint role appears here: the target's ring and the evidence region's
  // outline are drawn on the cell's own border in `redraw`, so a hint never
  // paints over the digits it is reasoning about. `HINT_TARGET`/`HINT_AREA`
  // stay in the cache word regardless — they are what makes a cell repaint when
  // the mark leaves it, which is also what erases the mark.
  const bg =
    flags & HIGH_BG
      ? COL_HIGHLIGHT
      : flags & ERROR_BG
        ? COL_ERROR
        : flags & CORRECT_BG
          ? COL_CORRECT
          : COL_BACKGROUND;
  dr.drawRect({ x: px, y: py, w: ts, h: ts }, bg);

  // Thin grid lines on the top and left edges (interior lines come from each
  // cell's own top/left).
  dr.drawLine({ x: px, y: py }, { x: px + ts, y: py }, COL_GRID, 1);
  dr.drawLine({ x: px, y: py }, { x: px, y: py + ts }, COL_GRID, 1);

  if (n) {
    dr.drawText(
      { x: px + Math.floor(ts / 2), y: py + Math.floor(ts / 2) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: Math.floor(ts / 2),
      },
      flags & USER_COL ? COL_USER : COL_GRID,
      String(n),
    );
  }

  // The hint leaves the target cell empty with only a mild highlight, so it
  // reads as a call to action ("input a number here"), not a filled answer.

  // Bold region borders.
  if (flags & BORDER_L)
    dr.drawRect({ x: px + 1, y: py + 1, w: bw, h: ts - 1 }, COL_GRID);
  if (flags & BORDER_U)
    dr.drawRect({ x: px + 1, y: py + 1, w: ts - 1, h: bw }, COL_GRID);
  if (flags & BORDER_R) {
    dr.drawRect({ x: px + ts - bw, y: py + 1, w: bw, h: ts - 1 }, COL_GRID);
  }
  if (flags & BORDER_D) {
    dr.drawRect({ x: px + 1, y: py + ts - bw, w: ts - 1, h: bw }, COL_GRID);
  }
  if (flags & BORDER_UL) dr.drawRect({ x: px + 1, y: py + 1, w: bw, h: bw }, COL_GRID);
  if (flags & BORDER_UR) {
    dr.drawRect({ x: px + ts - bw, y: py + 1, w: bw, h: bw }, COL_GRID);
  }
  if (flags & BORDER_DL) {
    dr.drawRect({ x: px + 1, y: py + ts - bw, w: bw, h: bw }, COL_GRID);
  }
  if (flags & BORDER_DR) {
    dr.drawRect({ x: px + ts - bw, y: py + ts - bw, w: bw, h: bw }, COL_GRID);
  }

  // Mistake overlay (Check & Save): an inset error outline.
  if (flags & FF_MISTAKE) {
    const t = Math.max(1, Math.floor(ts / 16));
    const inset = Math.max(1, Math.floor(ts / 8));
    const sx = px + inset;
    const sy = py + inset;
    const span = ts - 1 - 2 * inset;
    dr.drawRect({ x: sx, y: sy, w: span, h: t }, COL_ERROR);
    dr.drawRect({ x: sx, y: sy + span - t, w: span, h: t }, COL_ERROR);
    dr.drawRect({ x: sx, y: sy, w: t, h: span }, COL_ERROR);
    dr.drawRect({ x: sx + span - t, y: sy, w: t, h: span }, COL_ERROR);
  }

  if (flags & CURSOR_SQ) {
    const coff = Math.floor(ts / 8);
    const sx = px + coff;
    const sy = py + coff;
    const span = ts - 2 * coff;
    dr.drawRect({ x: sx, y: sy, w: span, h: 1 }, COL_CURSOR);
    dr.drawRect({ x: sx, y: sy + span - 1, w: span, h: 1 }, COL_CURSOR);
    dr.drawRect({ x: sx, y: sy, w: 1, h: span }, COL_CURSOR);
    dr.drawRect({ x: sx + span - 1, y: sy, w: 1, h: span }, COL_CURSOR);
  }

  dr.unclip();
  dr.drawUpdate({ x: px, y: py, w: ts, h: ts });
}

// --- redraw --------------------------------------------------------------

export function redrawFilling(
  dr: GameDrawing,
  ds: FillingDrawState,
  _prev: FillingState | null,
  state: FillingState,
  _dir: number,
  ui: {
    sel: Set<number> | null;
    cursor: GridCursor;
  },
  _animTime: number,
  flashTime: number,
  hint?: HintStep<FillingMove, FillingHint>,
  mistakes?: readonly FillingMistake[],
): void {
  const ts = ds.tilesize;
  const { w, h, board, clues } = state;
  const sz = w * h;
  const bw = borderWidth(ts);

  if (!ds.started) {
    // The engine paints no pixels of its own: fill the background, then the
    // black grid frame the cells draw on top of.
    const size = computeSize(w, h, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawRect(
      {
        x: border(ts) - bw,
        y: border(ts) - bw,
        w: w * ts + 2 * bw + 1,
        h: h * ts + 2 * bw + 1,
      },
      COL_GRID,
    );
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  const flashy =
    flashTime > 0 && (flashTime <= FLASH_TIME / 3 || flashTime >= (FLASH_TIME * 2) / 3);

  const dsf = makeRegionDsf(board, w, h);
  const mistakeSet =
    mistakes && mistakes.length > 0
      ? new Set(mistakes.map((m) => m.y * w + m.x))
      : null;

  // The displayed hint step: the forced target cells (a mild "fill here"
  // highlight) and the deduction's evidence cells (shaded light blue).
  const hl = hint?.highlights;
  const hintTargets = hl && hl.cells.length > 0 ? new Set(hl.cells) : null;
  const hintArea = hl && hl.area.length > 0 ? new Set(hl.area) : null;

  // Border between two differing cells when both are filled, or either's
  // region is complete/overfull. Bit 1 = border to the right, bit 2 = below.
  const borderScratch = new Int32Array(sz);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      for (let dxi = 0; dxi <= 1; dxi++) {
        const dyi = 1 - dxi;
        if (x + dxi >= w || y + dyi >= h) continue;
        const ni = (y + dyi) * w + (x + dxi);
        const v1 = board[i];
        const v2 = board[ni];
        if (v1 === v2) continue;
        const s1 = dsf.size(i);
        const s2 = dsf.size(ni);
        let bord = false;
        if (v1 && v2) bord = true;
        if (v1 && s1 >= v1) bord = true;
        if (v2 && s2 >= v2) bord = true;
        if (bord) borderScratch[i] |= dxi ? 1 : 2;
      }
    }
  }

  // Per-region "has an empty neighbor" so a boxed-in incomplete region can
  // be flagged as an error (it can never reach its size).
  const hasEmptyNeighbor = new Set<number>();
  for (let i = 0; i < sz; i++) {
    if (board[i] === 0) continue;
    const x = i % w;
    const y = (i / w) | 0;
    for (let j = 0; j < 4; j++) {
      const nx = x + DX[j];
      const ny = y + DY[j];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (board[ny * w + nx] === 0) {
        hasEmptyNeighbor.add(dsf.canonify(i));
        break;
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = board[i];
      let flags = 0;

      if (flashy) {
        // background flags cleared
      } else if (ui.sel?.has(i)) {
        flags |= HIGH_BG;
      } else if (v) {
        const size = dsf.size(i);
        if (size === v) flags |= CORRECT_BG;
        else if (size > v) flags |= ERROR_BG;
        else if (!hasEmptyNeighbor.has(dsf.canonify(i))) flags |= ERROR_BG;
      }

      if (ui.cursor.visible && x === ui.cursor.x && y === ui.cursor.y)
        flags |= CURSOR_SQ;

      // Outer-edge borders are independent of the interior border flag.
      if (x === 0) flags |= BORDER_L;
      if (y === 0) flags |= BORDER_U;
      if (x === w - 1) flags |= BORDER_R;
      if (y === h - 1) flags |= BORDER_D;

      if (x === 0 || borderScratch[i - 1] & 1) flags |= BORDER_L;
      if (y === 0 || borderScratch[i - w] & 2) flags |= BORDER_U;
      if (x === w - 1 || borderScratch[i] & 1) flags |= BORDER_R;
      if (y === h - 1 || borderScratch[i] & 2) flags |= BORDER_D;
      if (y > 0 && x > 0 && borderScratch[i - w - 1]) flags |= BORDER_UL;
      if (
        y > 0 &&
        x < w - 1 &&
        (borderScratch[i - w] & 1 || borderScratch[i - w + 1] & 2)
      ) {
        flags |= BORDER_UR;
      }
      if (
        y < h - 1 &&
        x > 0 &&
        (borderScratch[i - 1] & 2 || borderScratch[i + w - 1] & 1)
      ) {
        flags |= BORDER_DL;
      }
      if (
        y < h - 1 &&
        x < w - 1 &&
        (borderScratch[i + 1] & 2 || borderScratch[i + w] & 1)
      ) {
        flags |= BORDER_DR;
      }

      if (clues[i] === 0) flags |= USER_COL;
      if (mistakeSet?.has(i)) flags |= FF_MISTAKE;
      // Independent bits, not an either/or: a cell can be both the acted-on cell
      // and part of the evidence, and it then carries both marks.
      if (hintTargets?.has(i)) flags |= HINT_TARGET;
      if (hintArea?.has(i)) flags |= HINT_AREA;

      const word = v | (flags << VALUE_BITS);
      if (ds.cache[i] !== word) {
        ds.cache[i] = word;
        drawSquare(dr, ts, x, y, v, flags);
      }
    }
  }

  paintHintMarks(dr, ds, hintTargets, hintArea);
}

/**
 * The hint marks, after the cell loop and outside every clip, so a mark on a
 * shared region border is not half-covered by the neighbor drawing its own.
 */
function paintHintMarks(
  dr: GameDrawing,
  ds: FillingDrawState,
  targets: ReadonlySet<number> | null,
  area: ReadonlySet<number> | null,
): void {
  const cellAt = (i: number): MarkCell => ({ x: i % ds.w, y: (i / ds.w) | 0 });
  ds.marks.paint(dr, [...(targets ?? [])].map(cellAt), [...(area ?? [])].map(cellAt), {
    band: (x, y) => markBand(ds, x, y),
    targetColor: COL_HINT,
    evidenceColor: COL_HINT_CELL,
  });
}
