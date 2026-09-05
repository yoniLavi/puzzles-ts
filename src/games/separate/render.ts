/**
 * Separate rendering — the clue layer over the shared border-grid renderer.
 *
 * The mechanic's own look — the three-valued border edges, the error model over
 * the two DSFs, the half-grid cursor, the tile skeleton and the geometry — is
 * [`engine/border-grid-render.ts`](../../engine/border-grid-render.ts), shared
 * with Palisade. What is Separate's and stays here: a cell carries a **letter**,
 * a letter that repeats inside a *completed* wall-bounded region reddens, and a
 * region counts as finished when it is size `k` with no letter twice.
 */

import { buildDsf } from "../../engine/border-grid.ts";
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
  F_CLUE_ERROR,
  F_CORRECT,
  F_FLASH,
  invalidateDanglingRegions,
  mistakeEdgeBits,
  newBorderGridDrawState,
} from "../../engine/border-grid-render.ts";
import {
  correctRegionColor,
  mkhighlight,
} from "../../engine/color/color-mkhighlight.ts";
import {
  ERROR,
  FLASH,
  INK,
  lineMaybeColor,
  lineNoColor,
} from "../../engine/color/palette.ts";
import type { GameDrawing } from "../../engine/game.ts";
import type { Color, Size } from "../../engine/types.ts";
import type {
  SeparateMistake,
  SeparateParams,
  SeparateState,
  SeparateUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 48;
export const FLASH_TIME = 0.7;

const A = "A".charCodeAt(0);

// --- palette (mirrors Palisade's COL_* enum) ------------------------------

export const COL_BACKGROUND = 0;
export const COL_FLASH = 1;
export const COL_GRID = 2; // == letter color == wall color
export const COL_LINE_MAYBE = 3;
export const COL_LINE_NO = 4;
export const COL_ERROR = 5;
export const COL_CORRECT = 6; // a completed, correct region (shared gray shade)

export function colors(defaultBackground: Color): Color[] {
  const { background } = mkhighlight(defaultBackground);
  const out: Color[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_FLASH] = FLASH;
  out[COL_GRID] = INK;
  out[COL_ERROR] = ERROR;
  out[COL_CORRECT] = correctRegionColor(background);
  out[COL_LINE_MAYBE] = lineMaybeColor(background);
  out[COL_LINE_NO] = lineNoColor(background);
  return out;
}

/** Separate's palette indices, in the shared renderer's terms. It has no hint,
 * so no `hintEdge`, and its cursor is drawn in the grid's own ink. */
const PALETTE: BorderGridColors = {
  background: COL_BACKGROUND,
  flash: COL_FLASH,
  correct: COL_CORRECT,
  grid: COL_GRID,
  lineNo: COL_LINE_NO,
  lineMaybe: COL_LINE_MAYBE,
  error: COL_ERROR,
  cursor: COL_GRID,
};

// --- geometry -------------------------------------------------------------

export { fromCoord, margin } from "../../engine/border-grid.ts";
export { center, tileWidth } from "../../engine/border-grid-render.ts";

export function computeSize(p: SeparateParams, ts: number): Size {
  return borderGridSize(p.w, p.h, ts);
}

// --- draw state ------------------------------------------------------------

export type SeparateDrawState = BorderGridDrawState;

export function newDrawState(state: SeparateState): SeparateDrawState {
  return newBorderGridDrawState(state.w, state.h);
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SeparateDrawState,
  _prev: SeparateState | null,
  state: SeparateState,
  _dir: number,
  ui: SeparateUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly SeparateMistake[],
): void {
  const ts = ds.tilesize;
  const { w, h, k, letters, borders } = state;
  const wh = w * h;
  const flash = Math.floor((flashTime * 5) / FLASH_TIME) % 2;

  if (!ds.started) {
    drawBorderGridBackground(dr, ts, w, h, PALETTE);
    ds.started = true;
  }

  const blackDsf = buildDsf(w, h, borders, true);
  const yellowDsf = buildDsf(w, h, borders, false);

  // Per black region: which letters appear, and how many times. A letter that
  // repeats within a *completed* (size-k) wall-bounded region reddens every cell
  // that carries it — the "you closed this region but it has two of the same
  // letter" signal. We gate on size === k so the untouched board (one big region
  // holding every letter k times) stays clean, mirroring Palisade's philosophy
  // of only flagging provably-wrong state.
  const regionCounts = new Map<number, Int32Array>();
  for (let i = 0; i < wh; i++) {
    const root = blackDsf.canonify(i);
    let counts = regionCounts.get(root);
    if (!counts) {
      counts = new Int32Array(k);
      regionCounts.set(root, counts);
    }
    counts[letters[i]]++;
  }

  // Completed-and-correct regions: a wall-bounded (black) component of exactly
  // `k` cells holding one of each letter (no duplicate) with no wall interior to
  // it. These shade with the shared completed-region color (Rect's convention)
  // to signal validity — the same local-correctness feedback Galaxies/Rect give.
  // Start each right-sized component valid, then invalidate on a duplicate letter
  // or an interior (dangling) wall.
  const validRoot = new Map<number, boolean>();
  for (let i = 0; i < wh; i++) {
    const r = blackDsf.canonify(i);
    if (validRoot.has(r)) continue;
    let ok = blackDsf.size(r) === k;
    const counts = regionCounts.get(r);
    if (ok && counts) for (let n = 0; n < k; n++) if (counts[n] > 1) ok = false;
    validRoot.set(r, ok);
  }
  invalidateDanglingRegions(w, h, borders, blackDsf, validRoot);

  const mistakeMask = mistakeEdgeBits(w, h, mistakes);

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      let flags = borders[i] | mistakeMask[i];

      if (flash) flags |= F_FLASH;

      const counts = regionCounts.get(blackDsf.canonify(i));
      if (counts && blackDsf.size(i) === k && counts[letters[i]] > 1)
        flags |= F_CLUE_ERROR;

      if (validRoot.get(blackDsf.canonify(i))) flags |= F_CORRECT;

      flags |= cursorBits(ui.cursor, c, r);
      flags |= borderErrorBits(c, r, w, h, k, borders, blackDsf, yellowDsf);

      if (ds.cache[i] !== flags) {
        ds.cache[i] = flags;
        drawBorderTile(dr, ts, r, c, flags, PALETTE, (_body, o) => {
          dr.drawText(
            { x: o.x + center(ts), y: o.y + center(ts) },
            {
              align: "center",
              baseline: "mathematical",
              fontType: "variable",
              size: Math.floor(ts / 2),
            },
            flags & F_CLUE_ERROR ? COL_ERROR : COL_GRID,
            String.fromCharCode(A + letters[i]),
          );
        });
      }
    }
  }

  if (ui.cursor.visible) drawBorderCursor(dr, ts, ui.cursor.x, ui.cursor.y, COL_GRID);
}
