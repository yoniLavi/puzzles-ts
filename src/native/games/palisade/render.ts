/**
 * Palisade rendering — faithful port of `draw_tile` / `game_redraw`.
 *
 * Per-tile diffed loop over an `Int32Array` flag cache (the no-BigInt
 * pattern). Each tile draws its four border edges (wall / no-wall /
 * unknown / error coloured), the clue, and any cursor box. The live
 * error highlighting is recomputed every frame from two DSFs over the
 * current borders (black = wall-separated regions, yellow = no-wall
 * regions); the `findMistakes` overlay folds into the same error bits.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import {
  BORDER,
  BORDER_MASK,
  bitcount,
  buildDsf,
  DISABLED,
  DX,
  DY,
  EMPTY,
  outOfBounds,
  type PalisadeHint,
  type PalisadeMistake,
  type PalisadeMove,
  type PalisadeParams,
  type PalisadeState,
  type PalisadeUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 48;
export const FLASH_TIME = 0.7;

// --- palette (upstream COL_* enum) ----------------------------------------

export const COL_BACKGROUND = 0;
export const COL_FLASH = 1;
export const COL_GRID = 2; // == COL_CLUE == COL_LINE_YES
export const COL_LINE_MAYBE = 3;
export const COL_LINE_NO = 4;
export const COL_ERROR = 5;
export const COL_HINT = 6; // every edge the deduction forces this step (blue)
export const COL_HINT_CELL = 7; // referenced-cell shading (a light blue)

const DARKER = 0.9;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_FLASH] = highlight;
  out[COL_GRID] = [0, 0, 0];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_HINT] = [0.13, 0.5, 0.85];
  out[COL_HINT_CELL] = [0.82, 0.9, 0.99];
  out[COL_LINE_MAYBE] = [background[0] * DARKER, background[1] * DARKER, 0];
  out[COL_LINE_NO] = [
    background[0] * DARKER,
    background[1] * DARKER,
    background[2] * DARKER,
  ];
  return out;
}

// --- geometry -------------------------------------------------------------

export const tileWidth = (ts: number): number => Math.max(Math.floor((3 * ts) / 32), 1);
export const margin = (ts: number): number => Math.floor(ts / 2);
const center = (ts: number): number =>
  Math.floor(ts / 2) + Math.floor(tileWidth(ts) / 2);

export function computeSize(p: PalisadeParams, ts: number): Size {
  return {
    w: p.w * ts + tileWidth(ts) + 2 * margin(ts),
    h: p.h * ts + tileWidth(ts) + 2 * margin(ts),
  };
}

/** Tile column/row for a pixel coordinate (upstream FROMCOORD). */
export function fromCoord(coord: number, ts: number): number {
  return Math.floor((coord - margin(ts)) / ts);
}

// --- packed flag bits ------------------------------------------------------

const BORDER_ERROR = (border: number): number => border << 8; // bits 8..11
const F_ERROR_CLUE = 1 << 12;
const F_FLASH = 1 << 13;
const CONTAINS_CURSOR = (x: number): number => x << 14; // 9 bits, 14..22
const HINT_EDGE = (border: number): number => border << 23; // bits 23..26
const F_HINT_CELL = 1 << 27; // a hint-referenced cell (clue pair / region)

// --- draw state ------------------------------------------------------------

export interface PalisadeDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** w·h cache of last-drawn packed tile flags; -1 forces a draw. */
  cache: Int32Array;
}

export function newDrawState(state: PalisadeState): PalisadeDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    cache: new Int32Array(state.w * state.h).fill(-1),
  };
}

// --- tile drawing ----------------------------------------------------------

/** Colour for edge `dir`, given the tile's packed flags. Every edge the
 * current hint forces this step (the action edge plus the firing's other
 * edges — they share a fate, so they share a colour) is in `HINT_EDGE`
 * and wins over the normal edge states. */
function edgeColour(flags: number, dir: number): number {
  const b = BORDER(dir);
  if (flags & HINT_EDGE(b)) return COL_HINT;
  if (flags & BORDER_ERROR(b)) return COL_ERROR;
  if (flags & b) return COL_GRID; // wall (COL_LINE_YES)
  if (flags & DISABLED(b)) return COL_LINE_NO;
  return COL_LINE_MAYBE;
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  r: number,
  c: number,
  flags: number,
  clue: number,
): void {
  const w = tileWidth(ts);
  const x = margin(ts) + ts * c;
  const y = margin(ts) + ts * r;

  dr.clip({ x, y, w: ts + w, h: ts + w });

  dr.drawRect(
    { x: x + w, y: y + w, w: ts - w, h: ts - w },
    flags & F_FLASH ? COL_FLASH : flags & F_HINT_CELL ? COL_HINT_CELL : COL_BACKGROUND,
  );

  if (clue !== EMPTY) {
    dr.drawText(
      { x: x + center(ts), y: y + center(ts) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: Math.floor(ts / 2),
      },
      flags & F_ERROR_CLUE ? COL_ERROR : COL_GRID,
      String(clue),
    );
  }

  // Four border edges (U, R, D, L).
  dr.drawRect({ x: x + w, y, w: ts - w, h: w }, edgeColour(flags, 0));
  dr.drawRect({ x: x + ts, y: y + w, w, h: ts - w }, edgeColour(flags, 1));
  dr.drawRect({ x: x + w, y: y + ts, w: ts - w, h: w }, edgeColour(flags, 2));
  dr.drawRect({ x, y: y + w, w, h: ts - w }, edgeColour(flags, 3));

  dr.unclip();
  dr.drawUpdate({ x, y, w: ts + w, h: ts + w });
}

// --- cursor ----------------------------------------------------------------

function drawCursor(dr: GameDrawing, ts: number, curX: number, curY: number): void {
  const offX = curX % 2;
  const offY = curY % 2;
  const x = margin(ts) + ts * Math.floor(curX / 2);
  const y = margin(ts) + ts * Math.floor(curY / 2);
  const w = tileWidth(ts);

  const centerX = x + (offX === 0 ? Math.floor(w / 2) : center(ts));
  const centerY = y + (offY === 0 ? Math.floor(w / 2) : center(ts));

  // cur_type = (offX<<1)+offY: 0 TL-corner, 1 left-border, 2 top-border, 3 centre.
  const third = Math.floor(ts / 3);
  const twoThird = Math.floor((2 * ts) / 3);
  const cw = offX === 0 ? third : twoThird;
  const ch = offY === 0 ? third : twoThird;

  const ox = centerX - Math.floor(cw / 2);
  const oy = centerY - Math.floor(ch / 2);
  // Outline (draw_rect_outline): four 1-px edges.
  dr.drawLine({ x: ox, y: oy }, { x: ox + cw, y: oy }, COL_GRID, 1);
  dr.drawLine({ x: ox + cw, y: oy }, { x: ox + cw, y: oy + ch }, COL_GRID, 1);
  dr.drawLine({ x: ox + cw, y: oy + ch }, { x: ox, y: oy + ch }, COL_GRID, 1);
  dr.drawLine({ x: ox, y: oy + ch }, { x: ox, y: oy }, COL_GRID, 1);
  dr.drawUpdate({ x: ox, y: oy, w: cw + 1, h: ch + 1 });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: PalisadeDrawState | null,
  _prev: PalisadeState | null,
  state: PalisadeState,
  _dir: number,
  ui: PalisadeUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<PalisadeMove, PalisadeHint>,
  mistakes?: readonly PalisadeMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, k, clues, borders } = state;
  const wh = w * h;
  const flash = Math.floor((flashTime * 5) / FLASH_TIME) % 2;

  // Fold the displayed hint step into per-tile hint channels. The action
  // edge and the firing's other forced edges (`hl.edges`) all paint
  // COL_HINT — they share a fate, so they share a colour — so both are
  // marked into the one edge mask; the referenced cells (the clue pair /
  // region) shade COL_HINT_CELL. Both sides of each edge are marked (same
  // pixels).
  const hintEdgeMask = new Int32Array(wh);
  const hintCellMask = new Int32Array(wh);
  const hl = hint?.highlights;
  if (hl) {
    const markEdge = (ex: number, ey: number, edir: number): void => {
      hintEdgeMask[ey * w + ex] |= BORDER(edir);
      const nx = ex + DX[edir];
      const ny = ey + DY[edir];
      if (!outOfBounds(nx, ny, w, h)) hintEdgeMask[ny * w + nx] |= BORDER(edir ^ 2);
    };
    markEdge(hl.x, hl.y, hl.dir);
    if (hl.edges) for (const e of hl.edges) markEdge(e.x, e.y, e.dir);
    if (hl.cells)
      for (const cell of hl.cells) hintCellMask[cell.y * w + cell.x] |= F_HINT_CELL;
  }

  if (!ds.started) {
    const size = computeSize({ w, h, k }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    const tw = tileWidth(ts);
    for (let r = 0; r <= h; r++) {
      for (let c = 0; c <= w; c++) {
        dr.drawRect(
          { x: margin(ts) + ts * c, y: margin(ts) + ts * r, w: tw, h: tw },
          COL_GRID,
        );
      }
    }
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  const blackDsf = buildDsf(w, h, borders, true);
  const yellowDsf = buildDsf(w, h, borders, false);

  // Fold the findMistakes overlay into per-edge error bits.
  const mistakeMask = new Int32Array(wh);
  if (mistakes) {
    for (const m of mistakes) mistakeMask[m.y * w + m.x] |= BORDER_ERROR(BORDER(m.dir));
  }

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      const clue = clues[i];
      let flags =
        borders[i] | mistakeMask[i] | HINT_EDGE(hintEdgeMask[i]) | hintCellMask[i];

      if (flash) flags |= F_FLASH;

      const on = bitcount(borders[i]);
      const off = bitcount((borders[i] >> 4) & BORDER_MASK);
      if (clue !== EMPTY && (on > clue || clue > 4 - off)) flags |= F_ERROR_CLUE;

      if (ui.show) {
        for (let u = 0; u < 3; u++) {
          for (let v = 0; v < 3; v++) {
            if (ui.x === 2 * c + u && ui.y === 2 * r + v)
              flags |= CONTAINS_CURSOR(1 << (3 * u + v));
          }
        }
      }

      for (let dir = 0; dir < 4; dir++) {
        const cc = c + DX[dir];
        const rr = r + DY[dir];
        if (outOfBounds(cc, rr, w, h)) continue;
        const ii = rr * w + cc;
        const tooLarge =
          (yellowDsf.size(i) > k || yellowDsf.size(ii) > k) &&
          !yellowDsf.equivalent(i, ii);
        const tooSmall =
          (blackDsf.size(i) < k || blackDsf.size(ii) < k) &&
          !blackDsf.equivalent(i, ii);
        const dangling =
          borders[i] & BORDER(dir) &&
          (yellowDsf.equivalent(i, ii) ||
            (blackDsf.size(i) <= k && blackDsf.equivalent(i, ii)));
        if (tooLarge || tooSmall || dangling) flags |= BORDER_ERROR(BORDER(dir));
      }

      if (ds.cache[i] !== flags) {
        ds.cache[i] = flags;
        drawTile(dr, ts, r, c, flags, clue);
      }
    }
  }

  if (ui.show) drawCursor(dr, ts, ui.x, ui.y);
}
