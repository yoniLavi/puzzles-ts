/**
 * Galaxies rendering — imperative `redraw` per the post-Flip doctrine
 * (engine emits no pixels of its own; the game's `!ds.started` branch
 * owns the background fill; per-tile diff cache for incremental
 * repaints). The scene-graph reconciler experiment was withdrawn
 * 2026-05-21; ports stay on imperative `Game.redraw` with the
 * cache-fragility doctrine fixes from `fix-flip-canvas-reshape`.
 */

import { drawMarkSides, MARK_ALL } from "../../engine/hint-mark.ts";
import {
  drawRectOutline,
  type GameDrawing,
  type HintStep,
} from "../../engine/index.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import type { GalaxiesHint } from "./hint.ts";
import type { GalaxiesMove } from "./index.ts";
import { legalDotsFor, okToAddAssocWithOpposite } from "./moves.ts";
import {
  checkComplete,
  F_DOT,
  F_DOT_BLACK,
  F_EDGE_SET,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  SpaceType,
  spaceOppositeDot,
  spaceTypeAt,
  tileOpposite,
} from "./state.ts";

// --- color palette indices ----------------------------------------

export const COL_BACKGROUND = 0;
export const COL_WHITEBG = 1;
export const COL_BLACKBG = 2;
export const COL_WHITEDOT = 3;
export const COL_BLACKDOT = 4;
export const COL_GRID = 5;
export const COL_EDGE = 6;
export const COL_ARROW = 7;
export const COL_CURSOR = 8;
export const COL_MISTAKE = 9;
/** The in-progress association drag's preview — its own color, not the
 * cursor's. The two are different meanings ("where the keyboard is" vs "let go
 * and this is laid"), they are on screen together during a keyboard drag, and
 * the cursor's is a board-relative *tint*, which a transient affordance the
 * player is steering by must never be: see `DRAG_ADD`'s doc comment. */
export const COL_DRAG = 10;
/** The displayed hint's *action*: the cells an association claims, the wall it
 * draws, and a ring on the dot it points at. Purple rather than the
 * collection's hint blue — see the assignment in `index.ts` `colors()`. */
export const COL_HINT = 11;
/** The displayed hint's *evidence*: the cells, walls and dots the deduction
 * reasons over. */
export const COL_HINT_CELL = 12;
export const NCOLORS = 13;

// --- DrawState ------------------------------------------------------

export interface GalaxiesDrawState {
  w: number;
  h: number;
  tileSize: number;
  started: boolean;
  /** Per-tile cache key (flags | dots) from the last paint; -1 = never
   * drawn, triggers a full redraw of that tile next time. Fits in
   * 30 bits, so an Int32Array is enough. ddx/ddy live in `dx`/`dy`
   * and are compared as separate cache-miss conditions. */
  cache: Int32Array;
  /** Per-tile arrow dx/dy cache; part of the cache-miss comparison. */
  dx: Int16Array;
  dy: Int16Array;
  /** Everything the *transient* UI paints on a tile, in one sidecar word:
   * the drag preview plane (bits 0-1, {@link PREVIEW_GHOST} /
   * {@link PREVIEW_TARGET}) and the half-grid keyboard cursor's subcell
   * position (bits 2-10, {@link cursorBit}). A sidecar rather than key bits
   * because the Int32 key is full (bits 0-11 flags, 12-29 dots, 30 mistake) —
   * same reasoning as `wrongEdges`.
   *
   * Both are here for the same reason: an overlay drawn *outside* the tile
   * cache has nothing to erase it. The drag arrows shipped that way and
   * smeared across every tile they crossed; the half-grid cursor shipped that
   * way too and left a mark at every vertex and edge it visited, unnoticed
   * only because its color was a near-invisible tint of the board. */
  overlay: OverlaySidecar;
  /** Everything the displayed *hint* paints on a tile, in one sidecar word —
   * see {@link HINT_TARGET_CELL} and friends. A third sidecar rather than more
   * key bits for the same reason as the other two: the Int32 key is full.
   * Packed by hand because a hint here has its own topology (walls belong to
   * two tiles at once, and a dot ring belongs to up to four). */
  hint: OverlaySidecar;
  /** Per-tile wrong-wall mask (DRAW_EDGE_L/R/U/D bits) for the mistake
   * overlay — a sidecar rather than a cache-key bit because there are no
   * free bits left in the Int32 key for four more edge flags. Part of
   * the cache-miss comparison, so walls repaint clean when it clears.
   * Packed by hand (`clear`/`add`) rather than from a cell list: one wrong
   * wall is a *shared* edge, so it lights a different bit in each of the two
   * tiles it separates. */
  wrongEdges: OverlaySidecar;
}

const PREFERRED_TILE_SIZE = 32;

export function newDrawState(s: GalaxiesState): GalaxiesDrawState {
  const n = s.w * s.h;
  const cache = new Int32Array(n);
  for (let i = 0; i < n; i++) cache[i] = -1;
  return {
    w: s.w,
    h: s.h,
    tileSize: PREFERRED_TILE_SIZE,
    started: false,
    cache,
    dx: new Int16Array(n),
    dy: new Int16Array(n),
    overlay: new OverlaySidecar(n),
    hint: new OverlaySidecar(n),
    wrongEdges: new OverlaySidecar(n),
  };
}

export function setTileSize(ds: GalaxiesDrawState, tileSize: number): void {
  if (ds.tileSize === tileSize) return;
  ds.tileSize = tileSize;
  ds.started = false;
  // Every tile now misses on its key, so it repaints and re-commits its
  // wrong-wall mask along with it.
  for (let i = 0; i < ds.cache.length; i++) ds.cache[i] = -1;
}

// --- flags encoded into the per-tile cache key ---------------------

const DRAW_EDGE_L = 1 << 0;
const DRAW_EDGE_R = 1 << 1;
const DRAW_EDGE_U = 1 << 2;
const DRAW_EDGE_D = 1 << 3;
const DRAW_CORNER_UL = 1 << 4;
const DRAW_CORNER_UR = 1 << 5;
const DRAW_CORNER_DL = 1 << 6;
const DRAW_CORNER_DR = 1 << 7;
const DRAW_WHITE = 1 << 8;
const DRAW_BLACK = 1 << 9;
const DRAW_ARROW = 1 << 10;
const DRAW_CURSOR = 1 << 11;
// Mistake highlight (a wrong association). Bit 30 — above the dot bits
// (12-29) and below the sign bit, so it folds into the Int32 cache key
// and the tile repaints clean when the mistake overlay is cleared.
const DRAW_MISTAKE = 1 << 30;
// Dots: 9 positions per tile × 2 bits = bits 12-29 of the key.
const DOT_SHIFT_C = 12;
const DOT_SHIFT_M = 2;
const DOT_WHITE = 1;
const DOT_BLACK = 2;

// --- the transient-UI overlay sidecar (`ds.overlay`) ---------------

/** Bits 0-1: this tile is the drag preview's 180° partner (the ghost)… */
const PREVIEW_GHOST = 1;
/** …or the drop target itself (arrow plus an outline). */
const PREVIEW_TARGET = 2;
const PREVIEW_MASK = 3;
/** Bits 2-10: the half-grid keyboard cursor sits at this tile's subcell
 * position `(dy0 * 3 + dx0)`. A vertex cursor is on a tile corner, so up to
 * four tiles carry a bit for the same cursor and each paints its clipped
 * quarter — the same shape the dot bits use. */
const cursorBit = (dx0: number, dy0: number): number => 1 << (2 + dy0 * 3 + dx0);
/** Bits 11-28: a cell→dot drag's candidate dots, two bits per subcell
 * position — {@link CAND_LEGAL} for a dot this cell could join,
 * {@link CAND_SNAPPED} for the one the pointer has picked. Same 9-position
 * shape as the dot bits, so a dot on a tile corner is ringed (and erased) by
 * each of the four tiles that clip it. */
const CAND_SHIFT = 11;
const CAND_LEGAL = 1;
const CAND_SNAPPED = 2;
const candBits = (dx0: number, dy0: number, v: number): number =>
  v << (CAND_SHIFT + 2 * (dy0 * 3 + dx0));
const candAt = (overlay: number, dx0: number, dy0: number): number =>
  (overlay >>> (CAND_SHIFT + 2 * (dy0 * 3 + dx0))) & 3;

// --- the hint sidecar (`ds.hint`) ----------------------------------

/** Bit 0: a cell the hint's association claims (solid `COL_HINT`). */
const HINT_TARGET_CELL = 1 << 0;
/** Bit 1: a cell the deduction reasons over (`COL_HINT_CELL` wash). */
const HINT_AREA_CELL = 1 << 1;
/** Bit 28: a cell the move claims only because it is the 180° partner of the
 * one being deduced. Outlined in `COL_HINT` rather than filled: same fate,
 * same hue, but the deduced cell is the one the words are about. */
const HINT_PARTNER_CELL = 1 << 28;
/** Bits 2-5: the wall to draw, on this tile's L/R/U/D side (`COL_HINT`). One
 * wall lights a bit in each of the two tiles it separates, exactly as
 * `wrongEdges` does. */
const HINT_WALL_SHIFT = 2;
/** Bits 6-9: a wall the deduction cites (`COL_HINT_CELL`). */
const HINT_REFWALL_SHIFT = 6;
/** Bits 10-27: a ring on the dot at this tile's subcell position, two bits
 * each — {@link HINT_DOT_ACTION} for the dot the association points at,
 * {@link HINT_DOT_REF} for one the argument merely cites. Nine positions, the
 * same shape the dots and the drag's candidate rings use, so a dot on a tile
 * corner is ringed (and erased) by each tile that clips it. */
const HINT_DOT_SHIFT = 10;
const HINT_DOT_ACTION = 1;
const HINT_DOT_REF = 2;
const hintDotBits = (dx0: number, dy0: number, v: number): number =>
  v << (HINT_DOT_SHIFT + 2 * (dy0 * 3 + dx0));
const hintDotAt = (hint: number, dx0: number, dy0: number): number =>
  (hint >>> (HINT_DOT_SHIFT + 2 * (dy0 * 3 + dx0))) & 3;

/**
 * Pack one frame's hint overlay. A cell is one tile; a wall at half-grid
 * `(x, y)` lights the facing side of each of the two tiles it separates; a dot
 * ring is clipped by each tile whose 3x3 subcell block contains it.
 */
function packHint(
  ds: GalaxiesDrawState,
  w: number,
  h: number,
  hl: GalaxiesHint | undefined,
): void {
  ds.hint.clear();
  if (!hl) return;
  const add = (tx: number, ty: number, bit: number) => {
    if (tx >= 0 && tx < w && ty >= 0 && ty < h) ds.hint.add(ty * w + tx, bit);
  };
  const cell = (x: number, y: number, bit: number) => {
    add((x - 1) >> 1, (y - 1) >> 1, bit);
  };
  const wall = (x: number, y: number, shift: number) => {
    const vertical = x % 2 === 0;
    const tx = vertical ? x >> 1 : (x - 1) >> 1;
    const ty = vertical ? (y - 1) >> 1 : y >> 1;
    add(tx, ty, (vertical ? DRAW_EDGE_L : DRAW_EDGE_U) << shift);
    add(
      vertical ? tx - 1 : tx,
      vertical ? ty : ty - 1,
      (vertical ? DRAW_EDGE_R : DRAW_EDGE_D) << shift,
    );
  };
  const dot = (x: number, y: number, v: number) => {
    for (let ty = (y >> 1) - 1; ty <= y >> 1; ty++) {
      for (let tx = (x >> 1) - 1; tx <= x >> 1; tx++) {
        const dx0 = x - 2 * tx;
        const dy0 = y - 2 * ty;
        if (dx0 < 0 || dx0 > 2 || dy0 < 0 || dy0 > 2) continue;
        if (tx < 0 || tx >= w || ty < 0 || ty >= h) continue;
        // Never ring a dot on a cell the hint has filled: the ring would be
        // its own color on its own color — invisible, and saying nothing the
        // fill does not already say. It is the "dot sits on these cells" rule
        // that hits this, and its narration names the dot by position rather
        // than by a ring for exactly the same reason.
        if (ds.hint.packed[ty * w + tx] & HINT_TARGET_CELL) continue;
        add(tx, ty, hintDotBits(dx0, dy0, v));
      }
    }
  };
  for (const a of hl.area) cell(a.x, a.y, HINT_AREA_CELL);
  // With a focus, only that cell fills; the rest of the move's cells are its
  // partners and are outlined. Without one, the cells are equivalent and all
  // fill (quality-bar rule 3 — equivalent moves share a color).
  const focus = hl.focus;
  for (const t of hl.targets) {
    const same = focus !== null && t.x === focus.x && t.y === focus.y;
    cell(t.x, t.y, focus === null || same ? HINT_TARGET_CELL : HINT_PARTNER_CELL);
  }
  for (const e of hl.walls) wall(e.x, e.y, HINT_REFWALL_SHIFT);
  for (const e of hl.targetWalls) wall(e.x, e.y, HINT_WALL_SHIFT);
  for (const d of hl.refDots) dot(d.x, d.y, HINT_DOT_REF);
  if (hl.targetDot) dot(hl.targetDot.x, hl.targetDot.y, HINT_DOT_ACTION);
}

// --- rendering helpers ---------------------------------------------

/** Clearance between an arrow's point and the dot it points at, as a fraction
 * of the tile. Not a taste choice: it is the gap a *diagonal* arrow already
 * had — a dot on a cell's corner is `√2/2` tiles away and the arrow reaches
 * `1/3`, leaving `√2/2 − 1/4 − 1/3 ≈ 1/8` — and the bug was that the shorter
 * orthogonal reach (a dot on a cell's *edge*, only `1/2` a tile away) had none
 * of it and drew straight into the circle. Capping every arrow at this
 * clearance leaves the diagonals within half a pixel of where they were and
 * pulls the orthogonal ones clear. */
const ARROW_DOT_CLEARANCE = 1 / 8;

function drawArrow(
  dr: GameDrawing,
  cx: number,
  cy: number,
  ddx: number,
  ddy: number,
  tileSize: number,
  col: number,
  dotRadius: number,
  thickness = 1,
): void {
  const sq = ddx * ddx + ddy * ddy;
  if (sq === 0) return;
  const vlen = Math.sqrt(sq);
  const xdx = ddx / vlen;
  const xdy = ddy / vlen;
  const ydx = -xdy;
  const ydy = xdx;
  // `ddx`/`ddy` are half-tile grid steps, so the dot's center is `vlen / 2`
  // tiles away. Shorten only the point; the tail stays put, so an arrow near
  // its dot reads as a short arrow rather than a shrunken one.
  const reach = Math.min(
    tileSize / 3,
    (vlen * tileSize) / 2 - dotRadius - ARROW_DOT_CLEARANCE * tileSize,
  );
  const e1x = cx + Math.round(xdx * reach);
  const e1y = cy + Math.round(xdy * reach);
  const e2x = cx - Math.round((xdx * tileSize) / 3);
  const e2y = cy - Math.round((xdy * tileSize) / 3);
  const adx = Math.round(((ydx - xdx) * tileSize) / 8);
  const ady = Math.round(((ydy - xdy) * tileSize) / 8);
  const adx2 = Math.round(((-ydx - xdx) * tileSize) / 8);
  const ady2 = Math.round(((-ydy - xdy) * tileSize) / 8);
  dr.drawLine({ x: e1x, y: e1y }, { x: e2x, y: e2y }, col, thickness);
  dr.drawLine({ x: e1x, y: e1y }, { x: e1x + adx, y: e1y + ady }, col, thickness);
  dr.drawLine({ x: e1x, y: e1y }, { x: e1x + adx2, y: e1y + ady2 }, col, thickness);
}

function drawSquare(
  dr: GameDrawing,
  x: number,
  y: number,
  tileSize: number,
  border: number,
  flags: number,
  dots: number,
  ddx: number,
  ddy: number,
  wrongEdges: number,
  overlay: number,
  hint: number,
): void {
  const preview = overlay & PREVIEW_MASK;
  const lx = x * tileSize + border;
  const ly = y * tileSize + border;
  const edgeThickness = Math.max(tileSize >> 4, 2);
  const cursorSize = (tileSize / 4) | 0;
  const dotSize = (tileSize / 4) | 0;
  const previewThickness = Math.max(2, tileSize >> 4);

  dr.clip({ x: lx, y: ly, w: tileSize, h: tileSize });

  // Background. No hint role appears here: a Galaxies cell's fill *is* its
  // association — white with one dot, black with the other, plain when
  // unassociated — which is the very thing a hint is reasoning about, so a fill
  // over it takes the premise away. Both marks are inset rings instead, drawn
  // below.
  const bg =
    flags & DRAW_WHITE
      ? COL_WHITEBG
      : flags & DRAW_BLACK
        ? COL_BLACKBG
        : COL_BACKGROUND;
  dr.drawRect({ x: lx, y: ly, w: tileSize, h: tileSize }, bg);

  // Grid lines (top-left only — neighbors will draw their own)
  const gridCol = flags & DRAW_BLACK ? COL_BLACKDOT : COL_GRID;
  dr.drawRect({ x: lx, y: ly, w: 1, h: tileSize }, gridCol);
  dr.drawRect({ x: lx, y: ly, w: tileSize, h: 1 }, gridCol);

  // Arrow or cursor. A drag-preview arrow renders in COL_DRAG and
  // thicker than a committed one: a preview must not look like a
  // committed arrow (docs/games/rendering.md § "A press preview must
  // not look like a commit"), and both preview tiles share one color
  // because release commits them together — they share a fate.
  if (flags & DRAW_ARROW) {
    drawArrow(
      dr,
      lx + (tileSize >> 1),
      ly + (tileSize >> 1),
      ddx,
      ddy,
      tileSize,
      preview ? COL_DRAG : flags & DRAW_CURSOR ? COL_CURSOR : COL_ARROW,
      dotSize,
      preview ? previewThickness : 1,
    );
  } else if (flags & DRAW_CURSOR) {
    const cx = lx + (tileSize >> 1) - cursorSize;
    const cy = ly + (tileSize >> 1) - cursorSize;
    const sz = 2 * cursorSize + 1;
    drawRectOutline(dr, cx, cy, sz, sz, COL_CURSOR);
  }

  // Edges. Three overlays can recolor a wall, and one of them can conjure a
  // bar where the board has none: a wall the player set inside a single
  // solution galaxy is COL_MISTAKE; a wall the displayed hint reasons *from*
  // is COL_HINT_CELL; and the wall a hint asks the player to *draw* is a
  // COL_HINT bar drawn whether or not the wall exists yet — that is the whole
  // suggestion, and it is Palisade's forced-edge treatment in Galaxies'
  // vocabulary (docs/games/hints.md § "Echo the move's shape in the hint
  // color"). `null` means this side draws nothing.
  const edgeCol = (side: number): number | null => {
    if (hint & (side << HINT_WALL_SHIFT)) return COL_HINT;
    if (!(flags & side)) return null;
    if (wrongEdges & side) return COL_MISTAKE;
    if (hint & (side << HINT_REFWALL_SHIFT)) return COL_HINT_CELL;
    return COL_EDGE;
  };
  const colL = edgeCol(DRAW_EDGE_L);
  if (colL !== null) {
    dr.drawRect({ x: lx, y: ly, w: edgeThickness, h: tileSize }, colL);
  }
  const colR = edgeCol(DRAW_EDGE_R);
  if (colR !== null) {
    dr.drawRect(
      {
        x: lx + tileSize - edgeThickness + 1,
        y: ly,
        w: edgeThickness - 1,
        h: tileSize,
      },
      colR,
    );
  }
  const colU = edgeCol(DRAW_EDGE_U);
  if (colU !== null) {
    dr.drawRect({ x: lx, y: ly, w: tileSize, h: edgeThickness }, colU);
  }
  const colD = edgeCol(DRAW_EDGE_D);
  if (colD !== null) {
    dr.drawRect(
      {
        x: lx,
        y: ly + tileSize - edgeThickness + 1,
        w: tileSize,
        h: edgeThickness - 1,
      },
      colD,
    );
  }
  if (flags & DRAW_CORNER_UL) {
    dr.drawRect({ x: lx, y: ly, w: edgeThickness, h: edgeThickness }, COL_EDGE);
  }
  if (flags & DRAW_CORNER_UR) {
    dr.drawRect(
      {
        x: lx + tileSize - edgeThickness + 1,
        y: ly,
        w: edgeThickness - 1,
        h: edgeThickness,
      },
      COL_EDGE,
    );
  }
  if (flags & DRAW_CORNER_DL) {
    dr.drawRect(
      {
        x: lx,
        y: ly + tileSize - edgeThickness + 1,
        w: edgeThickness,
        h: edgeThickness - 1,
      },
      COL_EDGE,
    );
  }
  if (flags & DRAW_CORNER_DR) {
    dr.drawRect(
      {
        x: lx + tileSize - edgeThickness + 1,
        y: ly + tileSize - edgeThickness + 1,
        w: edgeThickness - 1,
        h: edgeThickness - 1,
      },
      COL_EDGE,
    );
  }

  // Dots — 9 possible positions per tile (grid-aligned).
  for (let dy0 = 0; dy0 < 3; dy0++) {
    for (let dx0 = 0; dx0 < 3; dx0++) {
      const shift = DOT_SHIFT_C + DOT_SHIFT_M * (dy0 * 3 + dx0);
      const val = (dots >>> shift) & ((1 << DOT_SHIFT_M) - 1);
      if (val) {
        dr.drawCircle(
          { x: lx + ((dx0 * tileSize) >> 1), y: ly + ((dy0 * tileSize) >> 1) },
          dotSize,
          val === 1 ? COL_WHITEDOT : COL_BLACKDOT,
          COL_BLACKDOT,
        );
      }
    }
  }

  // Candidate rings for a cell→dot drag: a ring outside each dot this cell
  // could legally join, heavier on the one the pointer has picked. Drawn
  // after the dots so it frames rather than underlies them.
  if (overlay >>> CAND_SHIFT) {
    for (let dy0 = 0; dy0 < 3; dy0++) {
      for (let dx0 = 0; dx0 < 3; dx0++) {
        const v = candAt(overlay, dx0, dy0);
        if (!v) continue;
        // `drawCircle` strokes one pixel wide and takes no thickness, so the
        // picked dot is emphasized with concentric rings rather than a
        // heavier one.
        const rings = v === CAND_SNAPPED ? previewThickness : 1;
        const center = {
          x: lx + ((dx0 * tileSize) >> 1),
          y: ly + ((dy0 * tileSize) >> 1),
        };
        for (let r = 0; r < rings; r++) {
          dr.drawCircle(center, dotSize + 2 + r, -1, COL_DRAG);
        }
      }
    }
  }

  // The displayed hint's dot rings, in the drag's own ring vocabulary so the
  // player reads them without being taught a second shape: the dot an
  // association must point at, and any dot the argument merely cites. The
  // colors differ from the drag's (see `colors()`), which is what keeps the
  // two readable when a player drags to follow the hint and the cell's legal
  // dots are ringed at the same time.
  if (hint >>> HINT_DOT_SHIFT) {
    for (let dy0 = 0; dy0 < 3; dy0++) {
      for (let dx0 = 0; dx0 < 3; dx0++) {
        const v = hintDotAt(hint, dx0, dy0);
        if (!v) continue;
        const center = {
          x: lx + ((dx0 * tileSize) >> 1),
          y: ly + ((dy0 * tileSize) >> 1),
        };
        const col = v === HINT_DOT_ACTION ? COL_HINT : COL_HINT_CELL;
        // A **filled halo**, then the dot painted back on top of it. Rings
        // came first and were nearly invisible against the loud cell marks
        // (owner-reported): `drawCircle` strokes one pixel wide, so a ring is
        // a hairline however many you stack. Filling the dot itself was the
        // other option and would cost the narration its noun — a hint that
        // says "the white dot" must leave the dot visibly white.
        const halo = Math.max(2, tileSize >> 4);
        dr.drawCircle(center, dotSize + halo, col, col);
        const val = (dots >>> (DOT_SHIFT_C + DOT_SHIFT_M * (dy0 * 3 + dx0))) & 3;
        if (val) {
          dr.drawCircle(
            center,
            dotSize,
            val === DOT_WHITE ? COL_WHITEDOT : COL_BLACKDOT,
            COL_BLACKDOT,
          );
        }
      }
    }
  }

  // The half-grid keyboard cursor (on a vertex or an edge, never a tile —
  // a tile cursor is the DRAW_CURSOR outline above). Drawn here, clipped to
  // and cached by this tile, so moving the cursor off it repaints it clean:
  // the block that used to draw this after the tile loop had nothing to
  // erase it and left a mark at every cell the cursor visited.
  if (overlay & ~PREVIEW_MASK) {
    for (let dy0 = 0; dy0 < 3; dy0++) {
      for (let dx0 = 0; dx0 < 3; dx0++) {
        if (!(overlay & cursorBit(dx0, dy0))) continue;
        // An edge cursor is a bar along its edge, a vertex cursor a small
        // square; the long axis is the odd (half-way) coordinate.
        const hw = dx0 % 2 ? cursorSize : (cursorSize / 3) | 0;
        const hh = dy0 % 2 ? cursorSize : (cursorSize / 3) | 0;
        dr.drawRect(
          {
            x: lx + ((dx0 * tileSize) >> 1) - hw,
            y: ly + ((dy0 * tileSize) >> 1) - hh,
            w: 2 * hw + 1,
            h: 2 * hh + 1,
          },
          COL_CURSOR,
        );
      }
    }
  }

  // The hint's cell marks, all three of them rings.
  //
  // **Inset, not on the cell's border**, because in Galaxies that border is
  // where a *wall* lives: a mark drawn there would read as one, and a hint that
  // suggests a wall already draws a `COL_HINT` bar in exactly that place. The
  // inset borrows the drag preview's geometry deliberately — in both cases the
  // mark means "this cell is part of what is about to be committed" — and
  // differs only in color, which is the one thing that has to separate a hint
  // from a drag.
  //
  // **And none of them is a fill**, because a Galaxies cell's fill *is* its
  // association: white with one dot, black with the other, plain when
  // unassociated. That is the very thing the deduction is about, so painting
  // over it takes the premise away.
  //
  // The **focus** cell is doubled and the partner single. The words say "this
  // cell", so only one cell may look like the thing being said (owner-reported
  // when both were marked alike) — and with the fill gone, weight is what is
  // left to say it with.
  const cellMark =
    hint & HINT_TARGET_CELL
      ? COL_HINT
      : hint & HINT_PARTNER_CELL
        ? COL_HINT
        : hint & HINT_AREA_CELL
          ? COL_HINT_CELL
          : -1;
  if (cellMark >= 0) {
    const inset = Math.max(edgeThickness + 1, (tileSize / 8) | 0);
    const ring = (extra: number) =>
      drawMarkSides(
        dr,
        {
          box: {
            x: lx + inset + extra,
            y: ly + inset + extra,
            w: tileSize - 2 * (inset + extra),
            h: tileSize - 2 * (inset + extra),
          },
          outer: 0,
          inner: previewThickness,
        },
        MARK_ALL,
        cellMark,
      );
    ring(0);
    if (hint & HINT_TARGET_CELL) ring(2 * previewThickness);
  }

  // The drop target itself gets an outline on top of its preview
  // arrow — "showing the target too": the mirror partner's ghost says
  // what comes along, the outline says where the pointer will commit.
  if (preview === 2) {
    const inset = Math.max(edgeThickness + 1, (tileSize / 8) | 0);
    drawRectOutline(
      dr,
      lx + inset,
      ly + inset,
      tileSize - 2 * inset,
      tileSize - 2 * inset,
      COL_DRAG,
      previewThickness,
    );
  }

  // Mistake highlight: an inset red outline marking a wrong
  // association, drawn last so it sits above the region fill / arrow.
  if (flags & DRAW_MISTAKE) {
    const inset = Math.max(edgeThickness, (tileSize / 12) | 0);
    const t = Math.max(2, (tileSize / 12) | 0);
    const span = tileSize - 2 * inset;
    dr.drawRect({ x: lx + inset, y: ly + inset, w: span, h: t }, COL_MISTAKE);
    dr.drawRect(
      { x: lx + inset, y: ly + tileSize - inset - t, w: span, h: t },
      COL_MISTAKE,
    );
    dr.drawRect({ x: lx + inset, y: ly + inset, w: t, h: span }, COL_MISTAKE);
    dr.drawRect(
      { x: lx + tileSize - inset - t, y: ly + inset, w: t, h: span },
      COL_MISTAKE,
    );
  }

  dr.unclip();
  dr.drawUpdate({ x: lx, y: ly, w: tileSize, h: tileSize });
}

/**
 * Split the engine's mistake overlay into wrong-association tiles
 * (returned as a set of tile indices, folded into the cache key as
 * DRAW_MISTAKE) and wrong walls (packed into the `wrongEdges`
 * sidecar). Clears and repacks the sidecar every call, so an empty
 * overlay erases a previous one.
 *
 * A wall lives on a half-grid coordinate *between* two tiles, so it
 * lights one bit in each of them: a vertical wall (even x, odd y) is
 * the right-hand tile's L edge and the left-hand tile's R edge, and
 * vice versa for a horizontal wall. Tiles off the board's rim simply
 * drop out.
 */
function splitMistakeOverlay(
  ds: GalaxiesDrawState,
  w: number,
  h: number,
  mistakes: readonly { kind: "tile" | "edge"; x: number; y: number }[] | undefined,
): Set<number> {
  const mistakeTiles = new Set<number>();
  ds.wrongEdges.clear();
  const addWall = (tx: number, ty: number, bit: number) => {
    if (tx >= 0 && tx < w && ty >= 0 && ty < h) ds.wrongEdges.add(ty * w + tx, bit);
  };
  for (const m of mistakes ?? []) {
    if (m.kind === "edge") {
      const vertical = m.x % 2 === 0;
      const tx = vertical ? m.x >> 1 : (m.x - 1) >> 1;
      const ty = vertical ? (m.y - 1) >> 1 : m.y >> 1;
      addWall(tx, ty, vertical ? DRAW_EDGE_L : DRAW_EDGE_U);
      addWall(
        vertical ? tx - 1 : tx,
        vertical ? ty : ty - 1,
        vertical ? DRAW_EDGE_R : DRAW_EDGE_D,
      );
    } else {
      const tx = (m.x - 1) >> 1;
      const ty = (m.y - 1) >> 1;
      if (tx >= 0 && tx < w && ty >= 0 && ty < h) mistakeTiles.add(ty * w + tx);
    }
  }
  return mistakeTiles;
}

// --- main redraw ----------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: GalaxiesDrawState,
  _prev: GalaxiesState | null,
  s: GalaxiesState,
  _dir: number,
  ui: {
    dragging: boolean;
    dragToDot: boolean;
    targetX: number;
    targetY: number;
    dotx: number;
    doty: number;
    srcx: number;
    srcy: number;
    showDragCandidates: boolean;
    cursor: GridCursor;
  },
  _animTime: number,
  flashTime: number,
  hint?: HintStep<GalaxiesMove, GalaxiesHint>,
  mistakes?: readonly { kind: "tile" | "edge"; x: number; y: number }[],
): void {
  const w = ds.w;
  const h = ds.h;
  const tile = ds.tileSize;

  // Both halves of the mistake overlay feed the cache-miss check, so
  // cells repaint clean once the overlay clears.
  const mistakeTiles = splitMistakeOverlay(ds, w, h, mistakes);
  // So does the hint's, which is what makes a hint appear on a frame where
  // nothing else changed (`hint-overlay.test.ts`).
  packHint(ds, w, h, hint?.highlights);
  const border = tile;
  const drawWidth = w * tile + 2 * border;
  const drawHeight = h * tile + 2 * border;
  const edgeThickness = Math.max(tile >> 4, 2);

  let flashing = false;
  if (flashTime > 0) {
    const frame = (flashTime / 0.15) | 0;
    flashing = frame % 2 === 0;
  }

  // First-draw: own the window background and the outer border.
  if (!ds.started) {
    dr.drawRect({ x: 0, y: 0, w: drawWidth, h: drawHeight }, COL_BACKGROUND);
    // Outer border edge frame, matching upstream's first-draw rect.
    dr.drawRect(
      {
        x: border - edgeThickness + 1,
        y: border - edgeThickness + 1,
        w: w * tile + edgeThickness * 2 - 1,
        h: h * tile + edgeThickness * 2 - 1,
      },
      COL_EDGE,
    );
    dr.drawUpdate({ x: 0, y: 0, w: drawWidth, h: drawHeight });
    ds.started = true;
  }

  const cols = checkComplete(s, true).colors;

  // The in-progress drag's snapped preview: the drop target and its
  // 180° partner about the drag dot — exactly the pair a release
  // commits — or nothing when a release would not commit there (the
  // Inertia aim idiom: an uncommittable target shows no arrow, and
  // that absence is the feedback). Legality is evaluated against the
  // *current* state every redraw, so a mid-drag undo cannot leave the
  // preview promising a move the release would refuse.
  let pvX = -1;
  let pvY = -1;
  let pvOppX = -1;
  let pvOppY = -1;
  if (
    ui.dragging &&
    cols &&
    okToAddAssocWithOpposite(s, ui.targetX, ui.targetY, ui.dotx, ui.doty, cols)
  ) {
    pvX = ui.targetX;
    pvY = ui.targetY;
    const opp = spaceOppositeDot(s, pvX, pvY, ui.dotx, ui.doty);
    if (opp) {
      pvOppX = opp.x;
      pvOppY = opp.y;
    }
  }

  // A vertex or edge cursor lies on a tile boundary, so up to four tiles
  // paint their clipped share of it — each through its own 3x3 subcell
  // block, exactly as the dots do.
  const halfGridCursor =
    ui.cursor.visible && spaceTypeAt(ui.cursor.x, ui.cursor.y) !== SpaceType.Tile;
  ds.overlay.clear();

  // The candidate rings of a cell→dot drag. Recomputed from the current
  // state every frame — like the preview's own legality — so a mid-drag undo
  // cannot leave a ring promising a dot the release would refuse.
  const candidates =
    ui.dragging && ui.dragToDot && ui.showDragCandidates
      ? legalDotsFor(s, ui.targetX, ui.targetY)
      : [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let flags = 0;
      let ddx = 0;
      let ddy = 0;
      let dots = 0;

      // Edge flags.
      if (s.flags[idx(s, 2 * x, 2 * y + 1)] & F_EDGE_SET) flags |= DRAW_EDGE_L;
      if (s.flags[idx(s, 2 * x + 2, 2 * y + 1)] & F_EDGE_SET) flags |= DRAW_EDGE_R;
      if (s.flags[idx(s, 2 * x + 1, 2 * y)] & F_EDGE_SET) flags |= DRAW_EDGE_U;
      if (s.flags[idx(s, 2 * x + 1, 2 * y + 2)] & F_EDGE_SET) flags |= DRAW_EDGE_D;

      // Corner flags (from neighboring edges).
      if (
        (x > 0 && s.flags[idx(s, 2 * x - 1, 2 * y)] & F_EDGE_SET) ||
        (y > 0 && s.flags[idx(s, 2 * x, 2 * y - 1)] & F_EDGE_SET)
      ) {
        flags |= DRAW_CORNER_UL;
      }
      if (
        (x + 1 < w && s.flags[idx(s, 2 * x + 3, 2 * y)] & F_EDGE_SET) ||
        (y > 0 && s.flags[idx(s, 2 * x + 2, 2 * y - 1)] & F_EDGE_SET)
      ) {
        flags |= DRAW_CORNER_UR;
      }
      if (
        (x > 0 && s.flags[idx(s, 2 * x - 1, 2 * y + 2)] & F_EDGE_SET) ||
        (y + 1 < h && s.flags[idx(s, 2 * x, 2 * y + 3)] & F_EDGE_SET)
      ) {
        flags |= DRAW_CORNER_DL;
      }
      if (
        (x + 1 < w && s.flags[idx(s, 2 * x + 3, 2 * y + 2)] & F_EDGE_SET) ||
        (y + 1 < h && s.flags[idx(s, 2 * x + 2, 2 * y + 3)] & F_EDGE_SET)
      ) {
        flags |= DRAW_CORNER_DR;
      }

      // Region color.
      const ti = idx(s, 2 * x + 1, 2 * y + 1);
      const sFlags = s.flags[ti];
      if (cols?.[y * w + x] && !flashing) {
        flags |= cols[y * w + x] === 2 ? DRAW_BLACK : DRAW_WHITE;
      }

      // Arrow (association indicator).
      let opp: { x: number; y: number } | null = null;
      if (sFlags & F_TILE_ASSOC) opp = tileOpposite(s, 2 * x + 1, 2 * y + 1);
      if (sFlags & F_TILE_ASSOC && cols && !cols[y * w + x]) {
        let suppressArrow = false;
        if (ui.dragging && ui.srcx === 2 * x + 1 && ui.srcy === 2 * y + 1) {
          suppressArrow = true;
        } else if (ui.dragging && opp && ui.srcx === opp.x && ui.srcy === opp.y) {
          suppressArrow = true;
        }
        if (!suppressArrow && (s.doty[ti] !== 2 * y + 1 || s.dotx[ti] !== 2 * x + 1)) {
          flags |= DRAW_ARROW;
          ddy = s.doty[ti] - (2 * y + 1);
          ddx = s.dotx[ti] - (2 * x + 1);
        }
      }

      // Dots in the 3x3 of subcell positions.
      for (let dy0 = 0; dy0 < 3; dy0++) {
        for (let dx0 = 0; dx0 < 3; dx0++) {
          const f = s.flags[idx(s, 2 * x + dx0, 2 * y + dy0)];
          if (f & F_DOT) {
            const v = f & F_DOT_BLACK ? DOT_BLACK : DOT_WHITE;
            dots |= v << (DOT_SHIFT_C + DOT_SHIFT_M * (dy0 * 3 + dx0));
          }
        }
      }

      // Cursor on tile.
      if (
        ui.cursor.visible &&
        ui.cursor.x === 2 * x + 1 &&
        ui.cursor.y === 2 * y + 1 &&
        !(sFlags & F_DOT)
      ) {
        flags |= DRAW_CURSOR;
      }

      // Wrong-association highlight (bit 30 of the key).
      if (mistakeTiles.has(y * w + x)) flags |= DRAW_MISTAKE;

      // Drag preview: the snapped target and its mirror partner show the
      // association a release would commit, overriding any committed
      // arrow's direction for the duration.
      const tx2 = 2 * x + 1;
      const ty2 = 2 * y + 1;
      const cacheI = y * w + x;
      let preview = 0;
      if (tx2 === pvX && ty2 === pvY) preview = PREVIEW_TARGET;
      else if (tx2 === pvOppX && ty2 === pvOppY) preview = PREVIEW_GHOST;
      if (preview) {
        flags |= DRAW_ARROW;
        ddx = ui.dotx - tx2;
        ddy = ui.doty - ty2;
      }
      ds.overlay.add(cacheI, preview);

      // The half-grid keyboard cursor, if it is on one of this tile's nine
      // subcell positions. A tile-center cursor is DRAW_CURSOR in the key
      // above; a vertex or edge cursor rides the overlay sidecar so the tile
      // that painted it is the tile that erases it.
      if (halfGridCursor) {
        const cdx = ui.cursor.x - 2 * x;
        const cdy = ui.cursor.y - 2 * y;
        if (cdx >= 0 && cdx <= 2 && cdy >= 0 && cdy <= 2) {
          ds.overlay.add(cacheI, cursorBit(cdx, cdy));
        }
      }

      // Candidate rings, on each of the (up to four) tiles that clip the dot.
      for (const d of candidates) {
        const ddx0 = d.x - 2 * x;
        const ddy0 = d.y - 2 * y;
        if (ddx0 < 0 || ddx0 > 2 || ddy0 < 0 || ddy0 > 2) continue;
        const snapped = d.x === ui.dotx && d.y === ui.doty;
        ds.overlay.add(
          cacheI,
          candBits(ddx0, ddy0, snapped ? CAND_SNAPPED : CAND_LEGAL),
        );
      }

      // Cache key: flags (bits 0-11, 30) | dots (bits 12-29), within 31
      // bits — fits a positive Int32. ddx/ddy, the transient-UI overlay
      // and the wrong-wall mask live in their sidecar arrays and form part
      // of the cache-miss check.
      const key = flags | dots;
      if (
        ds.cache[cacheI] !== key ||
        ds.dx[cacheI] !== ddx ||
        ds.dy[cacheI] !== ddy ||
        ds.overlay.stale(cacheI) ||
        ds.hint.stale(cacheI) ||
        ds.wrongEdges.stale(cacheI)
      ) {
        drawSquare(
          dr,
          x,
          y,
          tile,
          border,
          flags,
          dots,
          ddx,
          ddy,
          ds.wrongEdges.packed[cacheI],
          ds.overlay.packed[cacheI],
          ds.hint.packed[cacheI],
        );
        ds.cache[cacheI] = key;
        ds.dx[cacheI] = ddx;
        ds.dy[cacheI] = ddy;
        ds.overlay.commit(cacheI);
        ds.hint.commit(cacheI);
        ds.wrongEdges.commit(cacheI);
      }
    }
  }

  // Nothing is painted after the tile loop, deliberately. Both transient
  // overlays — the drag preview and the half-grid cursor — are folded into
  // the per-tile cache above via `ds.overlay`, so every pixel they paint is
  // clipped to a tile and erased by that tile's own repaint when the target
  // or the cursor moves on. Each shipped the other way and each smeared: the
  // drag as two unclipped pixel-following arrows that left stale ink on every
  // tile crossed *and outside the board*, where nothing repaints at all
  // (owner-reported 2026-08-08); the cursor as a bare drawRect that left a
  // mark at every vertex and edge it visited, unnoticed only because it was
  // painted in a near-invisible tint of the board.
}
