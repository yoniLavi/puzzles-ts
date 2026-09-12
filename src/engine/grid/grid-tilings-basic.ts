/**
 * The four "basic" periodic tilings of upstream `grid.c` — honeycomb,
 * triangular, snubsquare and cairo. Import from `index.ts`, not from here.
 *
 * The two rules in `grid-tilings.ts`'s header bind here: integer arithmetic
 * only, and emission order is observable. Upstream's per-cell emission guards —
 * cairo's `y > 0` / `x > 0`, the `(x + y) % 2` branches — are reproduced
 * exactly.
 */

import type { Grid } from "./grid-core.ts";
import {
  CAIRO_A,
  CAIRO_B,
  CAIRO_TILE_SIZE,
  HONEY_A,
  HONEY_B,
  HONEY_TILE_SIZE,
  SNUBSQUARE_A,
  SNUBSQUARE_B,
  SNUBSQUARE_TILE_SIZE,
  TilingBuilder,
  TRIANGLE_TILE_SIZE,
  TRIANGLE_VEC_X,
  TRIANGLE_VEC_Y,
} from "./grid-tilings.ts";

/**
 * Honeycomb: one hexagonal face per cell, centered at `(3a·x, 2b·y)` with odd
 * columns pushed down half a cell. Mirrors `grid_new_honeycomb`.
 */
export function gridNewHoneycomb(width: number, height: number): Grid {
  const a = HONEY_A;
  const b = HONEY_B;
  const g = new TilingBuilder(HONEY_TILE_SIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Face center; odd columns are offset downwards.
      const cx = 3 * a * x;
      let cy = 2 * b * y;
      if (x % 2) cy += b;

      g.face(
        [cx - a, cy - b],
        [cx + a, cy - b],
        [cx + 2 * a, cy],
        [cx + a, cy + b],
        [cx - a, cy + b],
        [cx - 2 * a, cy],
      );
    }
  }

  return g.finish();
}

/**
 * Triangular. Mirrors `grid_new_triangular`, **including both of its
 * algorithms** — an absent desc selects the legacy generator, and `"0"` (the
 * only other desc validation allows) the current one:
 *
 * - **Legacy** (`desc === null`): predates the shared dot-dedup machinery and
 *   works by direct index arithmetic over a fully pre-allocated
 *   `(width+1)×(height+1)` dot array. It is slightly asymmetric and leaves
 *   'ears' (faces joined to only one other face) at two corners. Preserved
 *   as-is because old shared game ids depend on it.
 * - **Current** (`desc === "0"`): emits per row `(width+1)` triangles one way
 *   up then `width` the other way, skipping the two triangles that would
 *   become ears on the last row of an odd-height grid.
 */
export function gridNewTriangular(
  width: number,
  height: number,
  desc: string | null,
): Grid {
  const vecX = TRIANGLE_VEC_X;
  const vecY = TRIANGLE_VEC_Y;
  const g = new TilingBuilder(TRIANGLE_TILE_SIZE);

  if (desc === null) {
    // ---- Legacy algorithm (ragged 'ears'; kept for old game ids) ----
    //
    // Upstream allocates every dot up front in row-major order and then
    // indexes into that array. Emitting the same coordinates in the same
    // nested loop order through the dedup map reproduces the indices exactly
    // (the coordinates are pairwise distinct, so nothing dedups).
    const at = (x: number, y: number): [number, number] => [
      // Odd rows are offset to the right.
      x * 2 * vecX + (y % 2 ? vecX : 0),
      y * vecY,
    ];

    for (let y = 0; y <= height; y++) {
      for (let x = 0; x <= width; x++) g.dot(...at(x, y));
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // The face descriptions depend on the parity of the row number.
        if (y % 2) {
          g.face(at(x, y), at(x + 1, y + 1), at(x, y + 1));
          g.face(at(x, y), at(x + 1, y), at(x + 1, y + 1));
        } else {
          g.face(at(x, y), at(x + 1, y), at(x, y + 1));
          g.face(at(x + 1, y), at(x + 1, y + 1), at(x, y + 1));
        }
      }
    }
  } else {
    // ---- Current algorithm (never any ears; 4-way symmetric if height even) ----
    for (let y = 0; y < height; y++) {
      // Each row holds (width+1) triangles one way up and (width) the other.
      // Which way up is which varies with the parity of y, as does the
      // direction the dots run around each face.
      const odd = y % 2 !== 0;
      let y0 = y * vecY;
      let y1 = y0;
      if (odd) y1 += vecY;
      else y0 += vecY;

      for (let x = 0; x <= width; x++) {
        const x0 = 2 * x * vecX;
        const x1 = x0 + vecX;
        const x2 = x1 + vecX;

        // On an odd-height grid, skip the first and last triangles of the
        // last row — otherwise they end up as ears.
        if (height % 2 === 1 && y === height - 1 && (x === 0 || x === width)) {
          continue;
        }

        if (odd) g.face([x0, y0], [x2, y0], [x1, y1]);
        else g.face([x0, y0], [x1, y1], [x2, y0]);
      }

      for (let x = 0; x < width; x++) {
        const x0 = (2 * x + 1) * vecX;
        const x1 = x0 + vecX;
        const x2 = x1 + vecX;

        if (odd) g.face([x0, y1], [x1, y0], [x2, y1]);
        else g.face([x0, y1], [x2, y1], [x1, y0]);
      }
    }
  }

  return g.finish();
}

/**
 * Snubsquare: a square plus (conditionally) an up/down and a left/right
 * triangle per cell, with the whole cell reflected on `(x + y)` parity.
 * Mirrors `grid_new_snubsquare`.
 */
export function gridNewSnubsquare(width: number, height: number): Grid {
  const a = SNUBSQUARE_A;
  const b = SNUBSQUARE_B;
  const g = new TilingBuilder(SNUBSQUARE_TILE_SIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = (a + b) * x;
      const py = (a + b) * y;
      const odd = (x + y) % 2 !== 0;

      // Square face.
      if (odd) {
        g.face([px + a, py], [px + a + b, py + a], [px + b, py + a + b], [px, py + b]);
      } else {
        g.face([px + b, py], [px + a + b, py + b], [px + a, py + a + b], [px, py + a]);
      }

      // Up/down triangle.
      if (x > 0) {
        if (odd) {
          g.face([px + a, py], [px, py + b], [px - a, py]);
        } else {
          g.face([px, py + a], [px + a, py + a + b], [px - a, py + a + b]);
        }
      }

      // Left/right triangle.
      if (y > 0) {
        if (odd) {
          g.face([px + a, py], [px + a + b, py - a], [px + a + b, py + a]);
        } else {
          g.face([px, py - a], [px + b, py], [px, py + a]);
        }
      }
    }
  }

  return g.finish();
}

/**
 * Cairo: a horizontal and a vertical pentagon per cell (each emitted only
 * where its neighbor cell exists), reflected on `(x + y)` parity.
 * Mirrors `grid_new_cairo`.
 */
export function gridNewCairo(width: number, height: number): Grid {
  const a = CAIRO_A;
  const b = CAIRO_B;
  const g = new TilingBuilder(CAIRO_TILE_SIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = 2 * b * x;
      const py = 2 * b * y;
      const odd = (x + y) % 2 !== 0;

      // Horizontal pentagon.
      if (y > 0) {
        if (odd) {
          g.face(
            [px + a, py - b],
            [px + 2 * b - a, py - b],
            [px + 2 * b, py],
            [px + b, py + a],
            [px, py],
          );
        } else {
          g.face(
            [px, py],
            [px + b, py - a],
            [px + 2 * b, py],
            [px + 2 * b - a, py + b],
            [px + a, py + b],
          );
        }
      }

      // Vertical pentagon.
      if (x > 0) {
        if (odd) {
          g.face(
            [px, py],
            [px + b, py + a],
            [px + b, py + 2 * b - a],
            [px, py + 2 * b],
            [px - a, py + b],
          );
        } else {
          g.face(
            [px, py],
            [px + a, py + b],
            [px, py + 2 * b],
            [px - b, py + 2 * b - a],
            [px - b, py + a],
          );
        }
      }
    }
  }

  return g.finish();
}
