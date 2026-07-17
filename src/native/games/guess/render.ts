/**
 * Guess — palette, geometry, and rendering (the blitter drag sprite
 * included). Faithful imperative port of `guess.c`'s drawing routines,
 * with the per-row caches and PEG_* overlay flags kept exactly as
 * upstream, plus the explicit full-canvas background fill our engine
 * contract requires (the engine emits no pixels of its own).
 */

import type { Colour, Point, Rect, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import {
  FEEDBACK_CORRECTCOLOUR,
  FEEDBACK_CORRECTPLACE,
  type GuessParams,
  type GuessState,
  type GuessUi,
  type PegRow,
} from "./state.ts";

// --- colour indices (upstream enum) -----------------------------------

export const COL_BACKGROUND = 0;
export const COL_FRAME = 1;
export const COL_CURSOR = 2;
export const COL_FLASH = 3;
export const COL_HOLD = 4;
export const COL_EMPTY = 5; // must be COL_1 - 1
const COL_1 = 6; // COL_1..COL_10 = 6..15
export const COL_CORRECTPLACE = 16;
export const COL_CORRECTCOLOUR = 17;
export const NCOLOURS = 18;

// --- peg overlay flags (upstream PEG_*) -------------------------------

const PEG_CURSOR = 0x1000;
const PEG_HOLD = 0x2000;
const PEG_LABELLED = 0x4000;
const PEG_FLAGS = PEG_CURSOR | PEG_HOLD | PEG_LABELLED;

// --- size constants ---------------------------------------------------

export const PREFERRED_TILE_SIZE = 32; // PEG_PREFER_SZ
const PEG_GAP = 0.1;
const PEG_HINT = 0.35;
const BORDER = 0.5;

/** Integer division truncating toward zero, matching C's `/` on ints. */
const idiv = (a: number, b: number): number => Math.trunc(a / b);

// --- geometry ---------------------------------------------------------

export interface Geom {
  ncolours: number;
  npegs: number;
  nguesses: number;
  pegsz: number;
  hintsz: number;
  gapsz: number;
  border: number;
  pegrad: number;
  hintrad: number;
  colx: number;
  coly: number;
  guessx: number;
  guessy: number;
  solnx: number;
  solny: number;
  hintw: number;
  w: number;
  h: number;
}

export function computeSize(p: GuessParams, tilesize: number): Size {
  const hintw = idiv(p.npegs + 1, 2);
  const hmul =
    BORDER * 2.0 +
    1.0 * 2.0 +
    1.0 * p.npegs +
    PEG_GAP * p.npegs +
    PEG_HINT * hintw +
    PEG_GAP * (hintw - 1);
  const vmulC = BORDER * 2.0 + 1.0 * p.ncolours + PEG_GAP * (p.ncolours - 1);
  const vmulG = BORDER * 2.0 + 1.0 * (p.nguesses + 1) + PEG_GAP * (p.nguesses + 1);
  const vmul = Math.max(vmulC, vmulG);
  return { w: Math.ceil(tilesize * hmul), h: Math.ceil(tilesize * vmul) };
}

export function computeGeometry(p: GuessParams, tilesize: number): Geom {
  const pegsz = tilesize;
  const hintsz = Math.floor(pegsz * PEG_HINT);
  const gapsz = Math.floor(pegsz * PEG_GAP);
  const border = Math.floor(pegsz * BORDER);
  const pegrad = idiv(pegsz - 1, 2);
  const hintrad = idiv(hintsz - 1, 2);

  const colh = (pegsz + gapsz) * p.ncolours - gapsz;
  const guessh = (pegsz + gapsz) * p.nguesses + gapsz + pegsz;

  const { w, h } = computeSize(p, tilesize);
  const colx = border;
  const coly = idiv(h - colh, 2);
  const guessx = border + pegsz * 2;
  const solnx = guessx;
  const guessy = idiv(h - guessh, 2);
  const solny = guessy + (pegsz + gapsz) * p.nguesses + gapsz;
  const hintw = idiv(p.npegs + 1, 2);

  return {
    ncolours: p.ncolours,
    npegs: p.npegs,
    nguesses: p.nguesses,
    pegsz,
    hintsz,
    gapsz,
    border,
    pegrad,
    hintrad,
    colx,
    coly,
    guessx,
    guessy,
    solnx,
    solny,
    hintw,
    w,
    h,
  };
}

// --- geometry accessors (upstream macros) -----------------------------

export const pegOff = (g: Geom): number => g.pegsz + g.gapsz;
const hintOff = (g: Geom): number => g.hintsz + g.gapsz;
const cgap = (g: Geom): number => Math.max(idiv(g.gapsz, 2), 1);

export const COL_OX = (g: Geom): number => g.colx;
export const COL_OY = (g: Geom): number => g.coly;
const colX = (g: Geom): number => g.colx;
const colY = (g: Geom, c: number): number => g.coly + c * pegOff(g);
export const COL_W = (g: Geom): number => pegOff(g);
export const COL_H = (g: Geom): number => g.ncolours * pegOff(g);

export const GUESS_OX = (g: Geom): number => g.guessx;
export const GUESS_OY = (g: Geom): number => g.guessy;
export const guessX = (g: Geom, p: number): number => g.guessx + p * pegOff(g);
export const guessY = (g: Geom, gi: number): number => g.guessy + gi * pegOff(g);
export const GUESS_W = (g: Geom): number => g.npegs * pegOff(g);
export const GUESS_H = (g: Geom): number => g.nguesses * pegOff(g);

const HINT_OX = (g: Geom): number => GUESS_OX(g) + GUESS_W(g) + g.gapsz;
const HINT_OY = (g: Geom): number =>
  GUESS_OY(g) + idiv(g.pegsz - hintOff(g) - g.hintsz, 2);
const hintX = (g: Geom): number => HINT_OX(g);
const hintY = (g: Geom, gi: number): number => HINT_OY(g) + gi * pegOff(g);
const HINT_W = (g: Geom): number => g.hintw * hintOff(g) - g.gapsz;

const SOLN_OX = (g: Geom): number => GUESS_OX(g);
const SOLN_OY = (g: Geom): number => GUESS_OY(g) + GUESS_H(g) + g.gapsz + 2;
const SOLN_W = (g: Geom): number => GUESS_W(g);
const SOLN_H = (g: Geom): number => pegOff(g);

// --- draw state -------------------------------------------------------

export interface GuessDrawState extends Geom {
  started: boolean;
  solved: number;
  nextGo: number;
  /** Per-row caches of last-drawn pegs (with PEG_* flags) + feedback. */
  guessesCache: PegRow[];
  solutionCache: PegRow;
  coloursCache: PegRow;
  /** Blitter drag sprite. */
  blitPeg: unknown | null;
  dragCol: number;
  blitOx: number;
  blitOy: number;
}

function invalidRow(n: number): PegRow {
  return { pegs: new Array(n).fill(-1), feedback: new Array(n).fill(-1) };
}

export function newDrawState(s: GuessState): GuessDrawState {
  const p = s.params;
  return {
    ...computeGeometry(p, PREFERRED_TILE_SIZE),
    started: false,
    solved: 0,
    nextGo: 0,
    guessesCache: Array.from({ length: p.nguesses }, () => invalidRow(p.npegs)),
    solutionCache: invalidRow(p.npegs),
    coloursCache: invalidRow(p.ncolours),
    blitPeg: null,
    dragCol: 0,
    blitOx: 0,
    blitOy: 0,
  };
}

export function setTileSize(ds: GuessDrawState, tilesize: number): void {
  if (ds.pegsz === tilesize) return;
  Object.assign(
    ds,
    computeGeometry(
      { ncolours: ds.ncolours, npegs: ds.npegs, nguesses: ds.nguesses } as GuessParams,
      tilesize,
    ),
  );
  ds.started = false;
  // Drop the cached pegrows and the now-wrongly-sized drag blitter so
  // the next paint rebuilds both (we have no GameDrawing here to free).
  for (const row of ds.guessesCache) {
    row.pegs.fill(-1);
    row.feedback.fill(-1);
  }
  ds.solutionCache.pegs.fill(-1);
  ds.solutionCache.feedback.fill(-1);
  ds.coloursCache.pegs.fill(-1);
  ds.blitPeg = null;
}

// --- colours ----------------------------------------------------------

const PEG_RGB: Colour[] = [
  [1.0, 0.0, 0.0], // red
  [1.0, 1.0, 0.0], // yellow
  [0.0, 1.0, 0.0], // green
  [0.2, 0.3, 1.0], // blue
  [1.0, 0.5, 0.0], // orange
  [0.5, 0.0, 0.7], // purple
  [0.5, 0.3, 0.3], // brown
  [0.4, 0.8, 1.0], // light blue
  [0.7, 1.0, 0.7], // light green
  [1.0, 0.6, 1.0], // pink
];

export function colours(defaultBackground: Colour): Colour[] {
  const ret: Colour[] = new Array(NCOLOURS);
  const bg: Colour = [defaultBackground[0], defaultBackground[1], defaultBackground[2]];

  for (let i = 0; i < 10; i++) ret[COL_1 + i] = [...PEG_RGB[i]] as Colour;

  ret[COL_FRAME] = [0, 0, 0];
  ret[COL_CURSOR] = [0, 0, 0];
  ret[COL_FLASH] = [0.5, 1.0, 1.0];
  ret[COL_HOLD] = [1.0, 0.5, 0.5];
  ret[COL_CORRECTPLACE] = [0, 0, 0];
  ret[COL_CORRECTCOLOUR] = [1.0, 1.0, 1.0];

  // Darken the background if needed so pure-white COL_CORRECTCOLOUR
  // stays distinguishable from it (borrowed from fifteen.c).
  let max = bg[0];
  for (let i = 1; i < 3; i++) if (bg[i] > max) max = bg[i];
  if (max * 1.2 > 1.0) {
    for (let i = 0; i < 3; i++) bg[i] /= max * 1.2;
  }
  ret[COL_BACKGROUND] = bg;

  // COL_EMPTY: distinguishable from the background for hint purposes.
  ret[COL_EMPTY] = [(bg[0] * 2) / 3, (bg[1] * 2) / 3, (bg[2] * 2) / 3];

  return ret;
}

// --- low-level draw helpers -------------------------------------------

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const pt = (x: number, y: number): Point => ({ x, y });

function drawPeg(
  dr: GameDrawing,
  ds: GuessDrawState,
  cx: number,
  cy: number,
  moving: boolean,
  labelled: boolean,
  col: number,
): void {
  const ts = ds.pegsz;
  const cg = cgap(ds);
  if (!moving) {
    dr.drawRect(rect(cx - cg, cy - cg, ts + cg * 2, ts + cg * 2), COL_BACKGROUND);
  }
  if (ds.pegrad > 0) {
    dr.drawCircle(
      pt(cx + ds.pegrad, cy + ds.pegrad),
      ds.pegrad,
      COL_EMPTY + col,
      col ? COL_FRAME : COL_EMPTY,
    );
  } else {
    dr.drawRect(rect(cx, cy, ts, ts), COL_EMPTY + col);
  }
  if (labelled && col) {
    dr.drawText(
      pt(cx + ds.pegrad, cy + ds.pegrad),
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: ds.pegrad,
      },
      COL_FRAME,
      String(col % 10),
    );
  }
  dr.drawUpdate(rect(cx - cg, cy - cg, ts + cg * 2, ts + cg * 2));
}

function drawCursor(dr: GameDrawing, ds: GuessDrawState, x: number, y: number): void {
  const ts = ds.pegsz;
  const cg = cgap(ds);
  dr.drawCircle(pt(x + ds.pegrad, y + ds.pegrad), ds.pegrad + cg, -1, COL_CURSOR);
  dr.drawUpdate(rect(x - cg, y - cg, ts + cg * 2, ts + cg * 2));
}

/** `guess === -1` draws the revealed solution row. `src` is the row to
 * show (null = blank), `curCol` is the cursor peg index (or -1). */
function guessRedraw(
  dr: GameDrawing,
  ds: GuessDrawState,
  guess: number,
  src: PegRow | null,
  holds: readonly boolean[] | null,
  curCol: number,
  force: boolean,
  labelled: boolean,
): void {
  let dest: PegRow;
  let rowx: number;
  let rowy: number;
  if (guess === -1) {
    dest = ds.solutionCache;
    rowx = SOLN_OX(ds);
    rowy = SOLN_OY(ds);
  } else {
    dest = ds.guessesCache[guess];
    rowx = guessX(ds, 0);
    rowy = guessY(ds, guess);
  }

  for (let i = 0; i < dest.pegs.length; i++) {
    let scol = src ? src.pegs[i] : 0;
    if (i === curCol) scol |= PEG_CURSOR;
    if (holds?.[i]) scol |= PEG_HOLD;
    if (labelled) scol |= PEG_LABELLED;
    if (dest.pegs[i] !== scol || force) {
      drawPeg(dr, ds, rowx + pegOff(ds) * i, rowy, false, labelled, scol & ~PEG_FLAGS);
      if (scol & PEG_CURSOR) drawCursor(dr, ds, rowx + pegOff(ds) * i, rowy);
      if (scol & PEG_HOLD) {
        dr.drawRect(
          rect(
            rowx + pegOff(ds) * i,
            rowy + ds.pegsz + idiv(ds.gapsz, 2) - 2,
            ds.pegsz,
            2,
          ),
          COL_HOLD,
        );
      }
      dr.drawUpdate(
        rect(
          rowx + pegOff(ds) * i,
          rowy + ds.pegsz + idiv(ds.gapsz, 2) - 2,
          ds.pegsz,
          2,
        ),
      );
    }
    dest.pegs[i] = scol;
  }
}

function hintRedraw(
  dr: GameDrawing,
  ds: GuessDrawState,
  guess: number,
  src: PegRow | null,
  force: boolean,
  cursor: boolean,
  markable: boolean,
): void {
  const dest = ds.guessesCache[guess];
  const npegs = dest.feedback.length;
  const emptycol = markable ? COL_FLASH : COL_EMPTY;
  const hintlen = idiv(npegs + 1, 2);

  // Redraw all-or-none (the cursor box wraps the whole section).
  let needRedraw = false;
  for (let i = 0; i < npegs; i++) {
    let scol = src ? src.feedback[i] : 0;
    if (i === 0 && cursor) scol |= PEG_CURSOR;
    if (i === 0 && markable) scol |= PEG_HOLD;
    if (scol !== dest.feedback[i] || force) needRedraw = true;
    dest.feedback[i] = scol;
  }
  if (!needRedraw) return;

  const gap = ds.gapsz;
  const hinth = ds.hintsz + gap + ds.hintsz;
  const hx = hintX(ds) - gap;
  const hy = hintY(ds, guess) - gap;
  const hw = HINT_W(ds) + gap * 2;
  const hh = hinth + gap * 2;

  dr.drawRect(rect(hx, hy, hw, hh), COL_BACKGROUND);

  for (let i = 0; i < npegs; i++) {
    const scol = src ? src.feedback[i] : 0;
    const col =
      scol === FEEDBACK_CORRECTPLACE
        ? COL_CORRECTPLACE
        : scol === FEEDBACK_CORRECTCOLOUR
          ? COL_CORRECTCOLOUR
          : emptycol;
    let rowx = hintX(ds);
    let rowy = hintY(ds, guess);
    if (i < hintlen) {
      rowx += hintOff(ds) * i;
    } else {
      rowx += hintOff(ds) * (i - hintlen);
      rowy += hintOff(ds);
    }
    if (ds.hintrad > 0) {
      dr.drawCircle(
        pt(rowx + ds.hintrad, rowy + ds.hintrad),
        ds.hintrad,
        col,
        col === emptycol ? emptycol : COL_FRAME,
      );
    } else {
      dr.drawRect(rect(rowx, rowy, ds.hintsz, ds.hintsz), col);
    }
  }
  if (cursor) {
    const cg = cgap(ds);
    const x1 = hx + cg;
    const y1 = hy + cg;
    const x2 = hx + hw - cg;
    const y2 = hy + hh - cg;
    dr.drawLine(pt(x1, y1), pt(x2, y1), COL_CURSOR, 1);
    dr.drawLine(pt(x2, y1), pt(x2, y2), COL_CURSOR, 1);
    dr.drawLine(pt(x2, y2), pt(x1, y2), COL_CURSOR, 1);
    dr.drawLine(pt(x1, y2), pt(x1, y1), COL_CURSOR, 1);
  }
  dr.drawUpdate(rect(hx, hy, hw, hh));
}

function currmoveRedraw(
  dr: GameDrawing,
  ds: GuessDrawState,
  guess: number,
  col: number,
): void {
  const ox = guessX(ds, 0);
  const oy = guessY(ds, guess);
  const off = idiv(ds.pegsz, 4);
  dr.drawRect(rect(ox - off - 1, oy, 2, ds.pegsz), col);
  dr.drawUpdate(rect(ox - off - 1, oy, 2, ds.pegsz));
}

// --- game_redraw ------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: GuessDrawState | null,
  _prev: GuessState | null,
  s: GuessState,
  _dir: number,
  ui: GuessUi,
  _animTime: number,
  _flashTime: number,
): void {
  if (!ds) return;
  const ncolours = s.params.ncolours;
  const newMove = s.nextGo !== ds.nextGo || !ds.started;

  if (!ds.started) {
    // The engine paints no pixels of its own: fill the background here.
    dr.drawRect(rect(0, 0, ds.w, ds.h), COL_BACKGROUND);
    dr.drawRect(
      rect(SOLN_OX(ds), SOLN_OY(ds) - ds.gapsz - 1, SOLN_W(ds), 2),
      COL_FRAME,
    );
    dr.drawUpdate(rect(0, 0, ds.w, ds.h));
  }

  // Restore whatever the floating drag sprite last covered.
  if (ds.dragCol !== 0 && ds.blitPeg) {
    dr.blitterLoad(ds.blitPeg, pt(ds.blitOx, ds.blitOy));
    dr.drawUpdate(rect(ds.blitOx, ds.blitOy, ds.pegsz, ds.pegsz));
  }

  // The colour bar.
  for (let i = 0; i < ncolours; i++) {
    let val = i + 1;
    if (ui.displayCur && ui.colourCur === i) val |= PEG_CURSOR;
    if (ui.showLabels) val |= PEG_HOLD;
    if (ds.coloursCache.pegs[i] !== val) {
      drawPeg(dr, ds, colX(ds), colY(ds, i), false, ui.showLabels, i + 1);
      if (val & PEG_CURSOR) drawCursor(dr, ds, colX(ds), colY(ds, i));
      ds.coloursCache.pegs[i] = val;
    }
  }

  // Past guesses + their hints (reverse order so the circular cursor on
  // the active row isn't overdrawn by the row above).
  for (let i = s.params.nguesses - 1; i >= 0; i--) {
    if (i < s.nextGo || s.solved) {
      guessRedraw(dr, ds, i, s.guesses[i], null, -1, false, ui.showLabels);
      hintRedraw(dr, ds, i, s.guesses[i], i === s.nextGo - 1, false, false);
    } else if (i > s.nextGo) {
      guessRedraw(dr, ds, i, null, null, -1, false, ui.showLabels);
      hintRedraw(dr, ds, i, null, false, false, false);
    }
  }
  if (!s.solved) {
    // The active (incomplete) row, drawn from the game_ui.
    guessRedraw(
      dr,
      ds,
      s.nextGo,
      { pegs: ui.currPegs, feedback: [] },
      ui.holds,
      ui.displayCur ? ui.pegCur : -1,
      false,
      ui.showLabels,
    );
    hintRedraw(
      dr,
      ds,
      s.nextGo,
      null,
      true,
      ui.displayCur && ui.pegCur === s.params.npegs,
      ui.markable,
    );
  }

  // The "current move" / "able to mark" marker beside the active row.
  if (newMove) currmoveRedraw(dr, ds, ds.nextGo, COL_BACKGROUND);
  if (!s.solved) currmoveRedraw(dr, ds, s.nextGo, COL_HOLD);

  // The solution box (or its reveal).
  if ((s.solved === 0) !== (ds.solved === 0) || !ds.started) {
    dr.drawRect(
      rect(SOLN_OX(ds), SOLN_OY(ds), SOLN_W(ds), SOLN_H(ds)),
      s.solved ? COL_BACKGROUND : COL_EMPTY,
    );
    dr.drawUpdate(rect(SOLN_OX(ds), SOLN_OY(ds), SOLN_W(ds), SOLN_H(ds)));
  }
  if (s.solved) {
    guessRedraw(
      dr,
      ds,
      -1,
      { pegs: s.solution.slice(), feedback: [] },
      null,
      -1,
      ds.solved === 0,
      ui.showLabels,
    );
  }
  ds.solved = s.solved;
  ds.nextGo = s.nextGo;

  // Save the background under the new floating sprite and draw it.
  if (ui.dragCol !== 0) {
    if (!ds.blitPeg) ds.blitPeg = dr.blitterNew({ w: ds.pegsz + 2, h: ds.pegsz + 2 });
    const ox = ui.dragX - idiv(ds.pegsz, 2);
    const oy = ui.dragY - idiv(ds.pegsz, 2);
    ds.blitOx = ox - 1;
    ds.blitOy = oy - 1;
    dr.blitterSave(ds.blitPeg, pt(ds.blitOx, ds.blitOy));
    drawPeg(dr, ds, ox, oy, true, ui.showLabels, ui.dragCol);
  }
  ds.dragCol = ui.dragCol;
  ds.started = true;
}
