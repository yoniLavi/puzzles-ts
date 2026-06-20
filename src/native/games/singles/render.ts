/**
 * Singles (Hitori) rendering — port of `game_redraw` / `tile_redraw` in
 * `singles.c`. A per-tile diffed loop draws a grid-outlined tile (black or
 * error fill for a blackened cell, lowlight under the completion flash,
 * otherwise the background), a circle ring for a white mark, the cell
 * number (always for a white cell; on a black cell only when the
 * show-black-numbers preference is on), cursor corner brackets, and a red
 * grid outline when the board is in an impossible state. Cells flagged by
 * Check & Save (`findMistakes`) get an inset error outline.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import type { SinglesHint } from "./index.ts";
import {
  F_BLACK,
  F_CIRCLE,
  F_ERROR,
  type SinglesMove,
  type SinglesState,
  type SinglesUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.7;

// --- palette (index-for-index with the upstream COL_* enum) ----------------

export const COL_BACKGROUND = 0;
export const COL_UNUSED1 = 1;
export const COL_LOWLIGHT = 2;
export const COL_BLACK = 3;
export const COL_WHITE = 4;
export const COL_BLACKNUM = 5;
export const COL_GRID = 6;
export const COL_CURSOR = 7;
export const COL_ERROR = 8;
// Fork additions (beyond upstream's COL_* enum): the explained hint.
export const COL_HINT = 9; // the cell(s) the displayed hint forces (blue)
export const COL_HINT_CELL = 10; // the deduction's premise/evidence (light blue)
export const COL_HINT_STRAND = 11; // the corner a corner-deduction protects (amber)
// Element-type legend: a decided premise cell the reason *cites* rings in a
// colour fixed by its type, so "a shaded square" and "the ringed white square"
// read as distinct from the blue forced cell (and from each other) — paired
// with the cell's own black/white appearance as the non-colour cue.
export const COL_HINT_BLACKREF = 12; // a cited shaded (black) premise (teal ring)
export const COL_HINT_WHITEREF = 13; // a cited ringed-white premise (violet ring)

export function colours(defaultBackground: Colour): Colour[] {
  const { background, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_UNUSED1] = [0, 0, 0];
  out[COL_LOWLIGHT] = lowlight;
  out[COL_BLACK] = [0, 0, 0];
  out[COL_WHITE] = [1, 1, 1];
  out[COL_BLACKNUM] = [0.4, 0.4, 0.4];
  out[COL_GRID] = lowlight; // COL_GRID == COL_LOWLIGHT
  out[COL_CURSOR] = [0.2, 0.8, 0];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_HINT] = [0.13, 0.5, 0.85];
  out[COL_HINT_CELL] = [0.82, 0.9, 0.99];
  out[COL_HINT_STRAND] = [0.98, 0.78, 0.42];
  out[COL_HINT_BLACKREF] = [0.0, 0.78, 0.55];
  out[COL_HINT_WHITEREF] = [0.62, 0.3, 0.82];
  return out;
}

// --- geometry --------------------------------------------------------------

const border = (ts: number): number => Math.floor(ts / 2);
const crad = (ts: number): number => Math.floor(ts / 2) - 1;
const textsz = (ts: number): number => Math.floor((14 * crad(ts)) / 10) - 1;
const coord = (v: number, ts: number): number => v * ts + border(ts);

export function computeSize(p: { w: number; h: number }, ts: number): Size {
  return { w: ts * p.w + 2 * border(ts), h: ts * p.h + 2 * border(ts) };
}

// --- draw state ------------------------------------------------------------

const DS_BLACK = 0x1;
const DS_CIRCLE = 0x2;
const DS_CURSOR = 0x4;
const DS_BLACK_NUM = 0x8;
const DS_ERROR = 0x10;
const DS_FLASH = 0x20;
const DS_IMPOSSIBLE = 0x40;
const DS_MISTAKE = 0x80;
// Hint overlay (fork addition): a forced-black target, a forced-white
// (circle) target, and an evidence cell (shaded if undecided, ringed if
// it is a decided black/circle premise — the colour is then the reason).
const DS_HINT_BLACK = 0x100;
const DS_HINT_WHITE = 0x200;
const DS_HINT_EVID = 0x400;
const DS_HINT_STRAND = 0x800; // a corner-deduction's protected corner (amber)

export interface SinglesDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  cache: Int32Array;
}

export function newDrawState(state: SinglesState): SinglesDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    cache: new Int32Array(state.n).fill(-1),
  };
}

export function setTileSize(ds: SinglesDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- cursor corner brackets (misc.c draw_rect_corners) ---------------------

function drawRectCorners(
  dr: GameDrawing,
  cx: number,
  cy: number,
  r: number,
  col: number,
): void {
  const hr = Math.floor(r / 2);
  const segs: [number, number, number, number][] = [
    [cx - r, cy - r, cx - r, cy - hr],
    [cx - r, cy - r, cx - hr, cy - r],
    [cx - r, cy + r, cx - r, cy + hr],
    [cx - r, cy + r, cx - hr, cy + r],
    [cx + r, cy - r, cx + r, cy - hr],
    [cx + r, cy - r, cx + hr, cy - r],
    [cx + r, cy + r, cx + r, cy + hr],
    [cx + r, cy + r, cx + hr, cy + r],
  ];
  for (const [x0, y0, x1, y1] of segs) {
    dr.drawLine({ x: x0, y: y0 }, { x: x1, y: y1 }, col, 1);
  }
}

// --- tile drawing ----------------------------------------------------------

function tileRedraw(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  num: number,
  f: number,
): void {
  let bg: number;
  let tcol: number;
  let dnum: boolean;

  if (f & DS_BLACK) {
    bg = f & DS_ERROR ? COL_ERROR : COL_BLACK;
    tcol = COL_BLACKNUM;
    dnum = !!(f & DS_BLACK_NUM);
  } else {
    bg = f & DS_FLASH ? COL_LOWLIGHT : COL_BACKGROUND;
    tcol = f & DS_ERROR ? COL_ERROR : COL_BLACK;
    dnum = true;
  }

  // Hint overrides. A forced cell is only *highlighted* — the whole cell
  // painted the hint blue with its number kept visible — never pre-filled
  // with the black square / circle the player must place themselves. The
  // highlight says "act here"; the narration says which action. (Doing the
  // move for the player obscured the number and read as already-done, when
  // it's still the player's to apply — owner-directed, 2026-06-20. Auto-hint
  // applies the move for real, so animation mode renders the actual mark.)
  // An evidence cell shades light blue only while it is still undecided; a
  // decided black/circle premise keeps its colour (the reason) and is ringed
  // below instead.
  const target = f & (DS_HINT_BLACK | DS_HINT_WHITE);
  const decided = f & (DS_BLACK | DS_CIRCLE);
  if (target) {
    bg = COL_HINT;
  } else if (f & DS_HINT_STRAND && !decided) {
    bg = COL_HINT_STRAND;
  } else if (f & DS_HINT_EVID && !decided) {
    bg = COL_HINT_CELL;
  }

  const cx = x + Math.floor(ts / 2);
  const cy = y + Math.floor(ts / 2);
  const cr = crad(ts);

  dr.drawRect({ x, y, w: ts, h: ts }, bg);
  drawRectOutline(dr, x, y, ts, ts, f & DS_IMPOSSIBLE ? COL_ERROR : COL_GRID);

  if (f & DS_CIRCLE) {
    dr.drawCircle({ x: cx, y: cy }, cr, tcol, tcol);
    dr.drawCircle({ x: cx, y: cy }, cr - 1, bg, tcol);
  }

  // (No forced-mark preview: the hint highlights where to act, it doesn't
  // place the black square / circle for the player — see the override above.)

  // A decided premise cell (its black/circle colour is the reason): ring
  // it rather than shading over it. The ring colour follows the legend —
  // strand amber for a protected corner, else by the cell's type so a cited
  // shaded square and a cited ringed-white square read distinct from each
  // other and from the blue forced cell.
  if ((f & DS_HINT_EVID || f & DS_HINT_STRAND) && f & (DS_BLACK | DS_CIRCLE)) {
    const ringCol =
      f & DS_HINT_STRAND
        ? COL_HINT_STRAND
        : f & DS_BLACK
          ? COL_HINT_BLACKREF
          : COL_HINT_WHITEREF;
    drawRectOutline(dr, x + 1, y + 1, ts - 2, ts - 2, ringCol);
    drawRectOutline(dr, x + 2, y + 2, ts - 4, ts - 4, ringCol);
  }

  if (dnum) {
    const buf = String(num);
    const tsz = buf.length === 1 ? textsz(ts) : Math.floor((cr * 2 - 1) / buf.length);
    dr.drawText(
      { x: cx, y: cy },
      { align: "center", baseline: "mathematical", fontType: "variable", size: tsz },
      tcol,
      buf,
    );
  }

  if (f & DS_CURSOR)
    drawRectCorners(dr, cx, cy, Math.floor(textsz(ts) / 2), COL_CURSOR);

  // Check & Save: an inset error outline marks a cell contradicting the
  // unique solution (the fork's mistake overlay; not in upstream).
  if (f & DS_MISTAKE) {
    drawRectOutline(dr, x + 2, y + 2, ts - 4, ts - 4, COL_ERROR);
    drawRectOutline(dr, x + 3, y + 3, ts - 6, ts - 6, COL_ERROR);
  }

  dr.drawUpdate({ x, y, w: ts, h: ts });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SinglesDrawState | null,
  _prev: SinglesState | null,
  state: SinglesState,
  _dir: number,
  ui: SinglesUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<SinglesMove, SinglesHint>,
  mistakes?: readonly { x: number; y: number }[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h } = state;

  // Index the displayed hint step's target/evidence cells.
  const hl = hint?.highlights;
  const hintBlack = new Set<number>();
  const hintWhite = new Set<number>();
  const hintEvid = new Set<number>();
  const hintStrand = new Set<number>();
  if (hl) {
    for (const t of hl.targets) {
      (t.value === "black" ? hintBlack : hintWhite).add(t.y * w + t.x);
    }
    for (const e of hl.evidence) hintEvid.add(e.y * w + e.x);
    for (const s of hl.strand) hintStrand.add(s.y * w + s.x);
  }

  if (!ds.started) {
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    // The outer grid frame (one pixel outside the tile grid).
    drawRectOutline(
      dr,
      coord(0, ts) - 1,
      coord(0, ts) - 1,
      ts * w + 2,
      ts * h + 2,
      COL_GRID,
    );
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
  }

  const flash = flashTime > 0 && Math.floor((flashTime * 5) / FLASH_TIME) % 2 === 1;
  const mistakeSet = mistakes ? new Set(mistakes.map((m) => m.y * w + m.x)) : null;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      let f = 0;

      if (flash) f |= DS_FLASH;
      if (state.impossible) f |= DS_IMPOSSIBLE;
      if (ui.cshow && x === ui.cx && y === ui.cy) f |= DS_CURSOR;
      if (state.flags[i] & F_BLACK) {
        f |= DS_BLACK;
        if (ui.showBlackNums) f |= DS_BLACK_NUM;
      }
      if (state.flags[i] & F_CIRCLE) f |= DS_CIRCLE;
      if (state.flags[i] & F_ERROR) f |= DS_ERROR;
      if (mistakeSet?.has(i)) f |= DS_MISTAKE;
      if (hintBlack.has(i)) f |= DS_HINT_BLACK;
      if (hintWhite.has(i)) f |= DS_HINT_WHITE;
      if (hintEvid.has(i)) f |= DS_HINT_EVID;
      if (hintStrand.has(i)) f |= DS_HINT_STRAND;

      if (!ds.started || ds.cache[i] !== f) {
        tileRedraw(dr, ts, coord(x, ts), coord(y, ts), state.nums[i], f);
        ds.cache[i] = f;
      }
    }
  }
  ds.started = true;
}
