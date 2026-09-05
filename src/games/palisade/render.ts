/**
 * Palisade rendering — the clue layer over the shared border-grid renderer.
 *
 * The mechanic's own look — the three-valued border edges, the error model over
 * the two DSFs, the half-grid cursor, the tile skeleton and the geometry — is
 * [`engine/border-grid-render.ts`](../../engine/border-grid-render.ts), shared
 * with Separate. What is Palisade's and stays here: a cell carries a **clue**
 * counting its walls, a clue the board already contradicts reddens, a region
 * counts as finished when it is size `k` with every clue in it satisfied, and
 * the explained hint paints its forced edges and outlines its referenced cells.
 */

import {
  BORDER,
  BORDER_MASK,
  buildDsf,
  DX,
  DY,
  outOfBounds,
} from "../../engine/border-grid.ts";
import {
  type BorderGridColors,
  type BorderGridDrawState,
  borderErrorBits,
  borderGridSize,
  center,
  cursorBits,
  drawBorderCursor,
  drawBorderGridBackground,
  drawBorderTile,
  EDGE_HINT,
  F_CLUE_ERROR,
  F_CORRECT,
  F_FLASH,
  GAME_FLAG_SHIFT,
  invalidateDanglingRegions,
  mistakeEdgeBits,
  newBorderGridDrawState,
} from "../../engine/border-grid-render.ts";
import {
  correctRegionColor,
  mkhighlight,
} from "../../engine/color/color-mkhighlight.ts";
import {
  CURSOR,
  ERROR,
  FLASH,
  HINT_ACTION,
  HINT_EVIDENCE,
  INK,
  lineMaybeColor,
  lineNoColor,
} from "../../engine/color/palette.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { drawMarkSides, MARK_ALL } from "../../engine/hint-mark.ts";
import type { Color, Size } from "../../engine/types.ts";
import {
  bitcount,
  EMPTY,
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
export const COL_HINT_CELL = 7; // referenced-cell outline, inset inside the cell
export const COL_CORRECT = 8; // a completed, correct region (shared gray shade)
/** The keyboard cursor's box, which upstream drew in the grid's own ink. Appended
 * past the C enum; Palisade has no dark-mode `paletteOverrides`. */
export const COL_CURSOR = 9;

export function colors(defaultBackground: Color): Color[] {
  const { background } = mkhighlight(defaultBackground);
  const out: Color[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_FLASH] = FLASH;
  out[COL_GRID] = INK;
  out[COL_CURSOR] = CURSOR;
  out[COL_ERROR] = ERROR;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  out[COL_CORRECT] = correctRegionColor(background);
  out[COL_LINE_MAYBE] = lineMaybeColor(background);
  out[COL_LINE_NO] = lineNoColor(background);
  return out;
}

/** Palisade's palette indices, in the shared renderer's terms. */
const PALETTE: BorderGridColors = {
  background: COL_BACKGROUND,
  flash: COL_FLASH,
  correct: COL_CORRECT,
  grid: COL_GRID,
  lineNo: COL_LINE_NO,
  lineMaybe: COL_LINE_MAYBE,
  error: COL_ERROR,
  hintEdge: COL_HINT,
  cursor: COL_CURSOR,
};

// --- geometry -------------------------------------------------------------

export { fromCoord, margin } from "../../engine/border-grid.ts";
export { center, tileWidth } from "../../engine/border-grid-render.ts";

export function computeSize(p: PalisadeParams, ts: number): Size {
  return borderGridSize(p.w, p.h, ts);
}

// --- Palisade's own packed flag ---------------------------------------------

/** A hint-referenced cell (a clue pair, or a region). The one bit Palisade adds
 * to the shared layout, taken from the first index the module reserves for a
 * game so the two cannot collide silently. */
const F_HINT_CELL = 1 << GAME_FLAG_SHIFT;

// --- draw state ------------------------------------------------------------

export type PalisadeDrawState = BorderGridDrawState;

export function newDrawState(state: PalisadeState): PalisadeDrawState {
  return newBorderGridDrawState(state.w, state.h);
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: PalisadeDrawState,
  _prev: PalisadeState | null,
  state: PalisadeState,
  _dir: number,
  ui: PalisadeUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<PalisadeMove, PalisadeHint>,
  mistakes?: readonly PalisadeMistake[],
): void {
  const ts = ds.tilesize;
  const { w, h, k, clues, borders } = state;
  const wh = w * h;
  const flash = Math.floor((flashTime * 5) / FLASH_TIME) % 2;

  // Fold the displayed hint step into per-tile hint channels. The action
  // edge and the firing's other forced edges (`hl.edges`) all paint
  // COL_HINT — they share a fate, so they share a color — so both are
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
    drawBorderGridBackground(dr, ts, w, h, PALETTE);
    ds.started = true;
  }

  const blackDsf = buildDsf(w, h, borders, true);
  const yellowDsf = buildDsf(w, h, borders, false);

  // Completed-and-correct regions: a wall-bounded (black) component of exactly
  // `k` cells, every clue in it satisfied, and no wall interior to it. These
  // shade with the shared completed-region color (Rect's convention), the same
  // feedback Galaxies/Rect give (a *local* correctness check, not a
  // global-solution check). Start each right-sized component valid, then
  // invalidate on a clue mismatch or an interior (dangling) wall.
  const validRoot = new Map<number, boolean>();
  for (let i = 0; i < wh; i++) {
    const r = blackDsf.canonify(i);
    if (!validRoot.has(r)) validRoot.set(r, blackDsf.size(r) === k);
  }
  for (let i = 0; i < wh; i++) {
    if (clues[i] !== EMPTY && clues[i] !== bitcount(borders[i]))
      validRoot.set(blackDsf.canonify(i), false);
  }
  invalidateDanglingRegions(w, h, borders, blackDsf, validRoot);

  const mistakeMask = mistakeEdgeBits(w, h, mistakes);

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      const clue = clues[i];
      let flags =
        borders[i] | mistakeMask[i] | EDGE_HINT(hintEdgeMask[i]) | hintCellMask[i];

      if (validRoot.get(blackDsf.canonify(i))) flags |= F_CORRECT;
      if (flash) flags |= F_FLASH;

      const on = bitcount(borders[i]);
      const off = bitcount((borders[i] >> 4) & BORDER_MASK);
      if (clue !== EMPTY && (on > clue || clue > 4 - off)) flags |= F_CLUE_ERROR;

      flags |= cursorBits(ui.cursor, c, r);
      flags |= borderErrorBits(c, r, w, h, k, borders, blackDsf, yellowDsf);

      if (ds.cache[i] !== flags) {
        ds.cache[i] = flags;
        drawBorderTile(dr, ts, r, c, flags, PALETTE, (body, o) => {
          // The referenced cells are **outlined**, not washed. Two reasons, and
          // the second is Palisade's own: a referenced cell carries the clue
          // digit the deduction counts with, and the wash also took the cell's
          // background from `F_CORRECT`, so a hint over a finished region hid
          // the fact that it was finished. The outline is **inset inside the
          // cell body** rather than on its border, because in Palisade that
          // border is a *wall* — it is where the hint's own forced edges are
          // drawn, in `COL_HINT`.
          if (flags & F_HINT_CELL) {
            drawMarkSides(
              dr,
              { box: body, outer: 0, inner: Math.max(2, ts >> 4) },
              MARK_ALL,
              COL_HINT_CELL,
            );
          }

          if (clue !== EMPTY) {
            dr.drawText(
              { x: o.x + center(ts), y: o.y + center(ts) },
              {
                align: "center",
                baseline: "mathematical",
                fontType: "variable",
                size: Math.floor(ts / 2),
              },
              flags & F_CLUE_ERROR ? COL_ERROR : COL_GRID,
              String(clue),
            );
          }
        });
      }
    }
  }

  if (ui.cursor.visible) drawBorderCursor(dr, ts, ui.cursor.x, ui.cursor.y, COL_CURSOR);
}
