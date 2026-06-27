/**
 * Solo (Sudoku) rendering — port of `game_redraw` / `draw_number` /
 * `game_colours` from `solo.c`.
 *
 * The board is a `cr × cr` grid drawn on a `COL_GRID` backing rectangle so the
 * thin grid lines show between cells. Each cell's background is widened by
 * `GRIDEXTRA` toward same-*block* neighbours (so a sub-block reads as one merged
 * region), with explicit corner-jut squares where a diagonal neighbour is a
 * different block — exactly Keen's cage drawing, but driven by
 * `blocks.whichblock` (rectangular or jigsaw) rather than a cage dsf. On top of
 * that, four composable variants add their own marks:
 *
 *  - **X** (`xtype`) — the two main diagonals are shaded `COL_XDIAGONALS`.
 *  - **killer** — a second cage partition drawn as inset `COL_KILLER` lines
 *    (offset `GRIDEXTRA*3` from the cell edge), plus the cage-sum clue text.
 *  - givens render `COL_CLUE` (black), player digits `COL_USER` (green); a
 *    digit that duplicates within its row/col/block/diagonal/cage, or a cage
 *    whose full sum is wrong, recolours to `COL_ERROR`.
 *
 * A cell's drawn pixels depend only on its own digit + pencil bitmap + a small
 * highlight byte (cursor/flash/error/cage-sum) plus the immutable block/cage
 * structure, so a per-cell cache of `(digit|hl, pencil)` suffices — with the
 * (fork) Check-&-Save mistake overlay tracked in a sidecar so an already-drawn
 * cell still repaints when flagged (playbook §3.2).
 */

import type { Colour, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import {
  checkKillerCageSum,
  onDiag0,
  onDiag1,
  type SoloState,
  type SoloUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 48;
export const FLASH_TIME = 0.4;

// --- palette (index-for-index with the upstream COL_* enum) ----------------
// Must stay aligned: augmentation.ts darkens index 2 (COL_GRID) under dark mode.

export const COL_BACKGROUND = 0;
export const COL_XDIAGONALS = 1;
export const COL_GRID = 2;
export const COL_CLUE = 3;
export const COL_USER = 4;
export const COL_HIGHLIGHT = 5;
export const COL_ERROR = 6;
export const COL_PENCIL = 7;
export const COL_KILLER = 8;
// Fork addition, appended past the upstream enum (NCOLOURS = 9). Solo's only
// dark-mode override touches index 2, so a plain append is safe.
export const COL_PENCIL_BODY = 9; // the yellow body of the pencil-mode indicator

export function colours(defaultBackground: Colour): Colour[] {
  const bg = defaultBackground;
  const out: Colour[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_XDIAGONALS] = [0.9 * bg[0], 0.9 * bg[1], 0.9 * bg[2]];
  out[COL_GRID] = [0, 0, 0];
  out[COL_CLUE] = [0, 0, 0];
  out[COL_USER] = [0, 0.6 * bg[1], 0];
  out[COL_HIGHLIGHT] = [0.78 * bg[0], 0.78 * bg[1], 0.78 * bg[2]];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_PENCIL] = [0.5 * bg[0], 0.5 * bg[1], bg[2]];
  out[COL_KILLER] = [0.5 * bg[0], 0.5 * bg[1], 0.1 * bg[2]];
  out[COL_PENCIL_BODY] = [1, 0.78, 0.17];
  return out;
}

// --- highlight byte (the `hl` argument of draw_number) ----------------------
// Low nibble: 0 = none, 1 = solid highlight (cursor non-pencil / flash),
// 2 = pencil highlight (top-left triangle). Bit 16 = duplicate-digit error,
// bit 32 = killer-cage sum wrong.

const HL_SOLID = 1;
const HL_PENCIL = 2;
const HL_ERROR = 16;
const HL_KSUM = 32;

// --- geometry --------------------------------------------------------------

export const border = (ts: number): number => (ts / 2) | 0;
export const gridExtra = (ts: number): number => Math.max((ts / 32) | 0, 1);
export const coord = (v: number, ts: number): number => v * ts + border(ts);

/** Inverse of `coord` — faithful to `interpret_move`'s `(x+TILE-BORDER)/TILE-1`. */
export function fromCoord(v: number, ts: number): number {
  return Math.floor((v + (ts - border(ts))) / ts) - 1;
}

export function computeSize(cr: number, ts: number): Size {
  const s = cr * ts + 2 * border(ts);
  return { w: s, h: s };
}

// --- draw state ------------------------------------------------------------

export interface SoloDrawState {
  started: boolean;
  tileSize: number;
  cr: number;
  xtype: boolean;
  /** `cr²` last-drawn `(digit | hl << 8)` values (-1 = never drawn). */
  tiles: Int32Array;
  /** `cr²` last-drawn pencil bitmaps (-1 = never drawn). */
  pencil: Int32Array;
  /** `cr²` mistake-overlay flags (fork addition), refilled each redraw. */
  wrong: Uint8Array;
  /** `cr²` last-drawn mistake-overlay flags (-1 = never drawn); in the diff key
   * so Check & Save repaints a cell whose tile is otherwise unchanged. */
  drawnWrong: Int8Array;
  /** Whether the pencil-mode indicator was on last frame (fork addition). */
  pencilModeShown: boolean;
}

export function newDrawState(state: SoloState): SoloDrawState {
  const a = state.cr * state.cr;
  return {
    started: false,
    tileSize: 0,
    cr: state.cr,
    xtype: state.xtype,
    tiles: new Int32Array(a).fill(-1),
    pencil: new Int32Array(a).fill(-1),
    wrong: new Uint8Array(a),
    drawnWrong: new Int8Array(a).fill(-1),
    pencilModeShown: false,
  };
}

export function setTileSize(ds: SoloDrawState, ts: number): void {
  ds.tileSize = ts;
}

// --- digit glyph (upstream: '1'..'9' then 'a'.. for orders > 9) -------------

function digitChar(n: number): string {
  // n is 1-based; upstream prints '0'+n, rolling into 'a' past '9'.
  return n <= 9 ? String(n) : String.fromCharCode("a".charCodeAt(0) + (n - 10));
}

// --- single-cell drawing (draw_number) -------------------------------------

function drawNumber(
  dr: GameDrawing,
  ds: SoloDrawState,
  state: SoloState,
  x: number,
  y: number,
  hl: number,
  wrong: boolean,
): void {
  const ts = ds.tileSize;
  const cr = state.cr;
  const ge = gridExtra(ts);
  const b = border(ts);
  const wb = state.blocks.whichblock;
  const cell = y * cr + x;
  const colKiller = hl & HL_KSUM ? COL_ERROR : COL_KILLER;

  const tx = b + x * ts + 1 + ge;
  const ty = b + y * ts + 1 + ge;

  let cx = tx;
  let cy = ty;
  const tw = ts - 1 - 2 * ge;
  const th = ts - 1 - 2 * ge;
  let cw = tw;
  let ch = th;

  // Widen the background toward same-block neighbours so the sub-block merges.
  if (x > 0 && wb[cell] === wb[cell - 1]) {
    cx -= ge;
    cw += ge;
  }
  if (x + 1 < cr && wb[cell] === wb[cell + 1]) cw += ge;
  if (y > 0 && wb[cell] === wb[cell - cr]) {
    cy -= ge;
    ch += ge;
  }
  if (y + 1 < cr && wb[cell] === wb[cell + cr]) ch += ge;

  dr.clip({ x: cx, y: cy, w: cw, h: ch });

  // Background: solid highlight wins; else X-diagonal shade; else plain.
  const bg =
    (hl & 15) === HL_SOLID
      ? COL_HIGHLIGHT
      : ds.xtype && (onDiag0(cell, cr) || onDiag1(cell, cr))
        ? COL_XDIAGONALS
        : COL_BACKGROUND;
  dr.drawRect({ x: cx, y: cy, w: cw, h: ch }, bg);

  // Pencil-mode highlight (top-left triangle).
  if ((hl & 15) === HL_PENCIL) {
    dr.drawPolygon(
      [
        { x: cx, y: cy },
        { x: cx + ((cw / 2) | 0), y: cy },
        { x: cx, y: cy + ((ch / 2) | 0) },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
  }

  // Corner juts: a GRIDEXTRA square where the diagonal neighbour is a different
  // block (so the grid corner shows through the merged region).
  if (x > 0 && y > 0 && wb[cell] !== wb[(y - 1) * cr + x - 1])
    dr.drawRect({ x: tx - ge, y: ty - ge, w: ge, h: ge }, COL_GRID);
  if (x + 1 < cr && y > 0 && wb[cell] !== wb[(y - 1) * cr + x + 1])
    dr.drawRect({ x: tx + ts - 1 - 2 * ge, y: ty - ge, w: ge, h: ge }, COL_GRID);
  if (x > 0 && y + 1 < cr && wb[cell] !== wb[(y + 1) * cr + x - 1])
    dr.drawRect({ x: tx - ge, y: ty + ts - 1 - 2 * ge, w: ge, h: ge }, COL_GRID);
  if (x + 1 < cr && y + 1 < cr && wb[cell] !== wb[(y + 1) * cr + x + 1])
    dr.drawRect(
      { x: tx + ts - 1 - 2 * ge, y: ty + ts - 1 - 2 * ge, w: ge, h: ge },
      COL_GRID,
    );

  // Killer cage borders + corners.
  const killer = state.killerData;
  if (killer) {
    const kwb = killer.kblocks.whichblock;
    const t = ge * 3;
    // In jigsaw mode, offset from the cell *centre* lines so adjacent cage
    // outlines line up; otherwise from the cell edge.
    const jigsaw = state.params.r === 1;
    const kcx = jigsaw ? tx : cx;
    const kcy = jigsaw ? ty : cy;
    const kcw = jigsaw ? tw : cw;
    const kch = jigsaw ? th : ch;
    let kl = kcx - 1;
    let kt = kcy - 1;
    let kr = kcx + kcw;
    let kb = kcy + kch;
    let hasLeft = false;
    let hasRight = false;
    let hasTop = false;
    let hasBottom = false;
    if (x === 0 || kwb[cell] !== kwb[cell - 1]) {
      hasLeft = true;
      kl += t;
    }
    if (x + 1 >= cr || kwb[cell] !== kwb[cell + 1]) {
      hasRight = true;
      kr -= t;
    }
    if (y === 0 || kwb[cell] !== kwb[cell - cr]) {
      hasTop = true;
      kt += t;
    }
    if (y + 1 >= cr || kwb[cell] !== kwb[cell + cr]) {
      hasBottom = true;
      kb -= t;
    }
    if (hasTop) dr.drawLine({ x: kl, y: kt }, { x: kr, y: kt }, colKiller, 1);
    if (hasBottom) dr.drawLine({ x: kl, y: kb }, { x: kr, y: kb }, colKiller, 1);
    if (hasLeft) dr.drawLine({ x: kl, y: kt }, { x: kl, y: kb }, colKiller, 1);
    if (hasRight) dr.drawLine({ x: kr, y: kt }, { x: kr, y: kb }, colKiller, 1);
    // Corners — only where there wasn't a full edge.
    if (
      x > 0 &&
      y > 0 &&
      !hasLeft &&
      !hasTop &&
      kwb[cell] !== kwb[(y - 1) * cr + x - 1]
    ) {
      dr.drawLine({ x: kl, y: kt + t }, { x: kl + t, y: kt + t }, colKiller, 1);
      dr.drawLine({ x: kl + t, y: kt }, { x: kl + t, y: kt + t }, colKiller, 1);
    }
    if (
      x + 1 < cr &&
      y > 0 &&
      !hasRight &&
      !hasTop &&
      kwb[cell] !== kwb[(y - 1) * cr + x + 1]
    ) {
      dr.drawLine(
        { x: kcx + kcw - t, y: kt + t },
        { x: kcx + kcw, y: kt + t },
        colKiller,
        1,
      );
      dr.drawLine(
        { x: kcx + kcw - t, y: kt },
        { x: kcx + kcw - t, y: kt + t },
        colKiller,
        1,
      );
    }
    if (
      x > 0 &&
      y + 1 < cr &&
      !hasLeft &&
      !hasBottom &&
      kwb[cell] !== kwb[(y + 1) * cr + x - 1]
    ) {
      dr.drawLine(
        { x: kl, y: kcy + kch - t },
        { x: kl + t, y: kcy + kch - t },
        colKiller,
        1,
      );
      dr.drawLine(
        { x: kl + t, y: kcy + kch - t },
        { x: kl + t, y: kcy + kch },
        colKiller,
        1,
      );
    }
    if (
      x + 1 < cr &&
      y + 1 < cr &&
      !hasRight &&
      !hasBottom &&
      kwb[cell] !== kwb[(y + 1) * cr + x + 1]
    ) {
      dr.drawLine(
        { x: kcx + kcw - t, y: kcy + kch - t },
        { x: kcx + kcw - t, y: kcy + kch },
        colKiller,
        1,
      );
      dr.drawLine(
        { x: kcx + kcw - t, y: kcy + kch - t },
        { x: kcx + kcw, y: kcy + kch - t },
        colKiller,
        1,
      );
    }
  }

  // Killer cage-sum clue.
  if (killer?.kgrid[cell]) {
    dr.drawText(
      { x: tx + ge * 4, y: ty + ge * 4 + ((ts / 4) | 0) },
      {
        align: "left",
        baseline: "alphabetic",
        fontType: "variable",
        size: (ts / 4) | 0,
      },
      colKiller,
      String(killer.kgrid[cell]),
    );
  }

  // The digit, or the pencil-mark grid.
  const d = state.grid[cell];
  if (d) {
    dr.drawText(
      { x: tx + ((ts / 2) | 0), y: ty + ((ts / 2) | 0) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: (ts / 2) | 0,
      },
      state.immutable[cell] ? COL_CLUE : hl & HL_ERROR ? COL_ERROR : COL_USER,
      digitChar(d),
    );
  } else {
    drawPencilMarks(dr, state, x, y, tx, ty, ts, ge);
  }

  // Check & Save mistake overlay (fork addition): an inset red outline.
  if (wrong) {
    const l = tx;
    const tt = ty;
    const r = tx + ts - 1 - 2 * ge;
    const bb = ty + ts - 1 - 2 * ge;
    for (const inset of [2, 3]) {
      dr.drawLine(
        { x: l + inset, y: tt + inset },
        { x: r - inset, y: tt + inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: r - inset, y: tt + inset },
        { x: r - inset, y: bb - inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: r - inset, y: bb - inset },
        { x: l + inset, y: bb - inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: l + inset, y: bb - inset },
        { x: l + inset, y: tt + inset },
        COL_ERROR,
        1,
      );
    }
  }

  dr.unclip();
  dr.drawUpdate({ x: cx, y: cy, w: cw, h: ch });
}

/** The auto-sized pencil-mark grid for an empty cell (draw_number's else branch). */
function drawPencilMarks(
  dr: GameDrawing,
  state: SoloState,
  x: number,
  y: number,
  tx: number,
  ty: number,
  ts: number,
  ge: number,
): void {
  const cr = state.cr;
  const cell = y * cr + x;
  const marks = state.pencil[cell];
  let npencil = 0;
  for (let i = 0; i < cr; i++) if (marks & (1 << (i + 1))) npencil++;
  if (!npencil) return;

  const minph = 2;
  let pl = tx + ge;
  let pr = pl + ts - ge;
  let pt = ty + ge;
  let pb = pt + ts - ge;
  if (state.killer) {
    // Reserve uniform space for the cage outline (and the sum clue when present),
    // regardless of which sides actually carry a cage edge.
    pl += ge * 3;
    pr -= ge * 3;
    pt += ge * 3;
    pb -= ge * 3;
    if (state.killerData && state.killerData.kgrid[cell] !== 0) pt += (ts / 4) | 0;
  }

  // Choose the grid layout maximising the font size.
  let bestsize = 0;
  let pbest = 0;
  for (let pw = 3; pw < Math.max(npencil, 4); pw++) {
    let ph = ((npencil + pw - 1) / pw) | 0;
    ph = Math.max(ph, minph);
    const fw = (pr - pl) / pw;
    const fh = (pb - pt) / ph;
    const fs = Math.min(fw, fh);
    if (fs >= bestsize) {
      bestsize = fs;
      pbest = pw;
    }
  }
  const pw = pbest;
  let ph = ((npencil + pw - 1) / pw) | 0;
  ph = Math.max(ph, minph);
  const fontsize = Math.min(((pr - pl) / pw) | 0, ((pb - pt) / ph) | 0);

  pl = tx + (((ts - fontsize * pw) / 2) | 0);
  pt = ty + (((ts - fontsize * ph) / 2) | 0);
  if (state.killer && state.killerData && state.killerData.kgrid[cell] !== 0) {
    pt = Math.max(pt, ty + ge * 3 + ((ts / 4) | 0));
  }

  let j = 0;
  for (let i = 0; i < cr; i++) {
    if (!(marks & (1 << (i + 1)))) continue;
    const dx = j % pw;
    const dy = (j / pw) | 0;
    dr.drawText(
      {
        x: pl + (((fontsize * (2 * dx + 1)) / 2) | 0),
        y: pt + (((fontsize * (2 * dy + 1)) / 2) | 0),
      },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: fontsize,
      },
      COL_PENCIL,
      digitChar(i + 1),
    );
    j++;
  }
}

// --- pencil-mode indicator -------------------------------------------------

/** The shared diagonal pencil glyph, drawn in the empty top-right border corner
 * (outside the grid, never overlapping a cell) — the corner Keen/Unequal use. */
function drawPencilIndicator(
  dr: GameDrawing,
  cr: number,
  ts: number,
  on: boolean,
): void {
  const b = border(ts);
  const ox = computeSize(cr, ts).w - b;
  dr.drawRect({ x: ox, y: 0, w: b, h: b }, COL_BACKGROUND);
  if (on) drawPencilGlyph(dr, ox, 0, b, COL_PENCIL_BODY, COL_GRID);
  dr.drawUpdate({ x: ox, y: 0, w: b, h: b });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SoloDrawState | null,
  _prev: SoloState | null,
  state: SoloState,
  _dir: number,
  ui: SoloUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly { x: number; y: number }[],
): void {
  if (!ds) return;
  const ts = ds.tileSize;
  const cr = state.cr;
  const ge = gridExtra(ts);
  const b = border(ts);
  const size = computeSize(cr, ts);
  const firstFrame = !ds.started;

  if (!ds.started) {
    // Engine paints no pixels of its own — fill the whole canvas, then the grid
    // backing rectangle the thin lines show through.
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawRect(
      {
        x: b - ge,
        y: b - ge,
        w: cr * ts + 1 + 2 * ge,
        h: cr * ts + 1 + 2 * ge,
      },
      COL_GRID,
    );
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  // Tally duplicate digits per row / column / block / diagonal / killer cage so
  // an over-used digit can be flagged red (faithful to game_redraw's
  // `entered_items`). We track a count per (region, digit).
  const blocks = state.blocks;
  const killer = state.killerData;
  const nrBlocks = blocks.nrBlocks;
  // Region layout: rows [0,cr), cols [cr,2cr), blocks [2cr, 2cr+nrBlocks),
  // diag0/diag1, then killer cages.
  const diagBase = 2 * cr + nrBlocks;
  const kBase = diagBase + 2;
  const nKiller = killer ? killer.kblocks.nrBlocks : 0;
  const nregions = kBase + nKiller;
  const count = new Int32Array(nregions * cr);
  const bump = (region: number, digit: number) => {
    count[region * cr + (digit - 1)]++;
  };
  for (let y = 0; y < cr; y++) {
    for (let x = 0; x < cr; x++) {
      const d = state.grid[y * cr + x];
      if (!d) continue;
      bump(y, d); // row y
      bump(cr + x, d); // col x
      bump(2 * cr + blocks.whichblock[y * cr + x], d); // block
      if (ds.xtype) {
        if (onDiag0(y * cr + x, cr)) bump(diagBase, d);
        if (onDiag1(y * cr + x, cr)) bump(diagBase + 1, d);
      }
      if (killer) bump(kBase + killer.kblocks.whichblock[y * cr + x], d);
    }
  }
  const dup = (region: number, digit: number) => count[region * cr + (digit - 1)] > 1;

  ds.wrong.fill(0);
  if (mistakes) for (const m of mistakes) ds.wrong[m.y * cr + m.x] = 1;

  const flash =
    flashTime > 0 && (flashTime <= FLASH_TIME / 3 || flashTime >= (FLASH_TIME * 2) / 3);

  for (let y = 0; y < cr; y++) {
    for (let x = 0; x < cr; x++) {
      const cell = y * cr + x;
      const d = state.grid[cell];
      let hl = 0;
      if (flash) hl = HL_SOLID;
      if (x === ui.hx && y === ui.hy && ui.hshow)
        hl = ui.hpencil ? HL_PENCIL : HL_SOLID;

      if (d) {
        if (
          dup(y, d) ||
          dup(cr + x, d) ||
          dup(2 * cr + blocks.whichblock[cell], d) ||
          (ds.xtype &&
            ((onDiag0(cell, cr) && dup(diagBase, d)) ||
              (onDiag1(cell, cr) && dup(diagBase + 1, d)))) ||
          (killer && dup(kBase + killer.kblocks.whichblock[cell], d))
        )
          hl |= HL_ERROR;
        if (
          killer &&
          checkKillerCageSum(killer, state.grid, killer.kblocks.whichblock[cell]) === 0
        )
          hl |= HL_KSUM;
      }

      const tile = d | (hl << 8);
      const pen = state.pencil[cell];
      const wrong = ds.wrong[cell];
      if (
        ds.tiles[cell] !== tile ||
        ds.pencil[cell] !== pen ||
        ds.drawnWrong[cell] !== wrong
      ) {
        drawNumber(dr, ds, state, x, y, hl, wrong !== 0);
        ds.tiles[cell] = tile;
        ds.pencil[cell] = pen;
        ds.drawnWrong[cell] = wrong;
      }
    }
  }

  // Pencil-mode indicator (fork addition).
  if (firstFrame || ds.pencilModeShown !== ui.hpencil) {
    drawPencilIndicator(dr, cr, ts, ui.hpencil);
    ds.pencilModeShown = ui.hpencil;
  }
}
