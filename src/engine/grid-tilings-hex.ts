/**
 * Five of upstream `grid.c`'s periodic tilings: the hexagon-derived family
 * (`greathexagonal`, `kagome`), `octagonal`, `kites` and `floret`.
 *
 * Import from [`grid.ts`](./grid.ts), not from here. The two load-bearing
 * rules of [`grid-tilings.ts`](./grid-tilings.ts) apply verbatim:
 *
 * 1. **Integer arithmetic only** — dot dedup is by exact coordinate, so a
 *    fractional coordinate silently forks a shared corner into two dots.
 *    Wherever upstream leans on C's truncate-toward-zero integer division,
 *    this file uses `Math.trunc`. That matters most in `floret`, whose basis
 *    vectors have negative components (`FLORET_PY = -26`), so `/` and C's `/`
 *    disagree in *sign* as well as in fractionality.
 * 2. **Emission order is observable** — faces per cell, and corners within a
 *    face, are emitted in upstream's exact order, because dot indices are
 *    assigned on first encounter and the differential compares indices.
 *
 * Upstream's per-cell emission guards are reproduced verbatim too, including
 * the ones that exist purely for appearance (floret drops one pentagon
 * rosette; see the comment there).
 */

import type { Grid } from "./grid-core.ts";
import {
  FLORET_PX,
  FLORET_PY,
  FLORET_TILESIZE,
  GREATHEX_A,
  GREATHEX_B,
  GREATHEX_TILESIZE,
  KAGOME_A,
  KAGOME_B,
  KAGOME_TILESIZE,
  KITE_A,
  KITE_B,
  KITE_TILESIZE,
  OCTAGONAL_A,
  OCTAGONAL_B,
  OCTAGONAL_TILESIZE,
  TilingBuilder,
} from "./grid-tilings.ts";

/**
 * Great-hexagonal tiling: hexagons separated by squares and triangles. Six
 * face kinds per cell — the hexagon unconditionally, then four squares and two
 * triangles each gated on the cell having a neighbour to attach to. Mirrors
 * `grid_new_greathexagonal`.
 */
export function gridNewGreathexagonal(width: number, height: number): Grid {
  const a = GREATHEX_A;
  const b = GREATHEX_B;
  const g = new TilingBuilder(GREATHEX_TILESIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      /* centre of hexagon */
      const px = (3 * a + b) * x;
      let py = (2 * a + 2 * b) * y;
      if (x % 2) py += a + b;

      /* hexagon */
      g.face(
        [px - a, py - b],
        [px + a, py - b],
        [px + 2 * a, py],
        [px + a, py + b],
        [px - a, py + b],
        [px - 2 * a, py],
      );

      /* square below hexagon */
      if (y < height - 1) {
        g.face(
          [px - a, py + b],
          [px + a, py + b],
          [px + a, py + 2 * a + b],
          [px - a, py + 2 * a + b],
        );
      }

      /* square below right */
      if (x < width - 1 && (x % 2 === 0 || y < height - 1)) {
        g.face(
          [px + 2 * a, py],
          [px + 2 * a + b, py + a],
          [px + a + b, py + a + b],
          [px + a, py + b],
        );
      }

      /* square below left */
      if (x > 0 && (x % 2 === 0 || y < height - 1)) {
        g.face(
          [px - 2 * a, py],
          [px - a, py + b],
          [px - a - b, py + a + b],
          [px - 2 * a - b, py + a],
        );
      }

      /* Triangle below right */
      if (x < width - 1 && y < height - 1) {
        g.face([px + a, py + b], [px + a + b, py + a + b], [px + a, py + 2 * a + b]);
      }

      /* Triangle below left */
      if (x > 0 && y < height - 1) {
        g.face([px - a, py + b], [px - a, py + 2 * a + b], [px - a - b, py + a + b]);
      }
    }
  }

  return g.finish();
}

/**
 * Kagome tiling: hexagons with triangles in the interstices, rows offset by
 * half a cell. Mirrors `grid_new_kagome`.
 */
export function gridNewKagome(width: number, height: number): Grid {
  const a = KAGOME_A;
  const b = KAGOME_B;
  const g = new TilingBuilder(KAGOME_TILESIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      /* centre of hexagon */
      let px = 4 * a * x;
      const py = 2 * b * y;
      if (y % 2) px += 2 * a;

      /* hexagon */
      g.face(
        [px + a, py - b],
        [px + 2 * a, py],
        [px + a, py + b],
        [px - a, py + b],
        [px - 2 * a, py],
        [px - a, py - b],
      );

      /* Triangle above right */
      if (x < width - 1 || (!(y % 2) && y)) {
        g.face([px + 3 * a, py - b], [px + 2 * a, py], [px + a, py - b]);
      }

      /* Triangle below right */
      if (x < width - 1 || (!(y % 2) && y < height - 1)) {
        g.face([px + 3 * a, py + b], [px + a, py + b], [px + 2 * a, py]);
      }

      /* Left triangles: only the odd rows, which are shifted right, expose a
       * gap at the left edge that needs filling. */
      if (!x && y % 2) {
        /* Triangle above left */
        g.face([px - a, py - b], [px - 2 * a, py], [px - 3 * a, py - b]);

        /* Triangle below left */
        if (y < height - 1) {
          g.face([px - a, py + b], [px - 3 * a, py + b], [px - 2 * a, py]);
        }
      }
    }
  }

  return g.finish();
}

/**
 * Truncated-square tiling: octagons on a square lattice with diamonds in the
 * gaps. The diamond straddles the cell's top-left corner, so it is emitted
 * only when both neighbours exist. Mirrors `grid_new_octagonal`.
 */
export function gridNewOctagonal(width: number, height: number): Grid {
  const a = OCTAGONAL_A;
  const b = OCTAGONAL_B;
  const g = new TilingBuilder(OCTAGONAL_TILESIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      /* cell position */
      const px = (2 * a + b) * x;
      const py = (2 * a + b) * y;

      /* octagon */
      g.face(
        [px + a, py],
        [px + a + b, py],
        [px + 2 * a + b, py + a],
        [px + 2 * a + b, py + a + b],
        [px + a + b, py + 2 * a + b],
        [px + a, py + 2 * a + b],
        [px, py + a + b],
        [px, py + a],
      );

      /* diamond */
      if (x > 0 && y > 0) {
        g.face([px, py - a], [px + a, py], [px, py + a], [px - a, py]);
      }
    }
  }

  return g.finish();
}

/**
 * Kites tiling: each cell is a rosette of six kites around an order-6 dot,
 * with alternate rows offset. Mirrors `grid_new_kites`.
 */
export function gridNewKites(width: number, height: number): Grid {
  const a = KITE_A;
  const b = KITE_B;
  const g = new TilingBuilder(KITE_TILESIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      /* position of order-6 dot */
      let px = 4 * b * x;
      const py = 6 * a * y;
      if (y % 2) px += 2 * b;

      /* kite pointing up-left */
      g.face(
        [px, py],
        [px + 2 * b, py],
        [px + 2 * b, py + 2 * a],
        [px + b, py + 3 * a],
      );

      /* kite pointing up */
      g.face([px, py], [px + b, py + 3 * a], [px, py + 4 * a], [px - b, py + 3 * a]);

      /* kite pointing up-right */
      g.face(
        [px, py],
        [px - b, py + 3 * a],
        [px - 2 * b, py + 2 * a],
        [px - 2 * b, py],
      );

      /* kite pointing down-right */
      g.face(
        [px, py],
        [px - 2 * b, py],
        [px - 2 * b, py - 2 * a],
        [px - b, py - 3 * a],
      );

      /* kite pointing down */
      g.face([px, py], [px - b, py - 3 * a], [px, py - 4 * a], [px + b, py - 3 * a]);

      /* kite pointing down-left */
      g.face(
        [px, py],
        [px + b, py - 3 * a],
        [px + 2 * b, py - 2 * a],
        [px + 2 * b, py],
      );
    }
  }

  return g.finish();
}

/**
 * Floret (rosette) tiling: six congruent irregular pentagons pinwheeling about
 * each cell centre. Mirrors `grid_new_floret`.
 *
 * **Every division here truncates toward zero.** `py` is negative, so `qy`,
 * `ry` and `cy` all carry negative components, and TypeScript's `/` would
 * yield fractions that `TilingBuilder.dot` refuses (and that C would have
 * truncated *toward zero*, not floored). With upstream's constants the
 * quotients happen to be exact, but the `Math.trunc` calls are the contract,
 * not decoration — they are what keeps a tweak to `FLORET_PX`/`FLORET_PY`
 * from silently producing a differently-shaped grid than the C would.
 */
export function gridNewFloret(width: number, height: number): Grid {
  /* Vectors for sides; weird numbers needed to keep the puzzle aligned with
   * the window. -py/px is close to tan(30 - atan(sqrt(3)/9)); using py=26
   * makes everything lean to the left, rather than right. */
  const px = FLORET_PX;
  const py = FLORET_PY; // negative
  const qx = Math.trunc((4 * px) / 5);
  const qy = -py * 2;
  const rx = qx - px; // negative
  const ry = qy - py;

  const xStep = Math.trunc((6 * px + 3 * qx) / 2);
  const yStep = 4 * py - 5 * qy; // negative
  const yStagger = Math.trunc(yStep / 2);

  const g = new TilingBuilder(FLORET_TILESIZE);

  /* generate pentagonal faces */
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      /* face centre */
      const cx = xStep * x;
      /* `|| 0` normalises negative zero: `yStep` is negative, so `yStep * 0`
       * is IEEE `-0` in JS where C's integer multiply gives plain 0. It
       * compares equal under `===` but not under a structural comparison
       * (`Object.is(-0, 0)` is false), which is exactly what the differential
       * against the C dump does. */
      let cy = yStep * y || 0;
      if (x % 2) {
        cy -= yStagger;
      } else if (y && y === height - 1 && width > 1) {
        /* Upstream deliberately skips this rosette purely for appearance —
         * it squares off the bottom edge (try 3x3). Not an optimisation and
         * not optional: dropping it changes the face and dot indices. */
        continue;
      }

      g.face(
        [cx, cy],
        [cx + 2 * rx, cy + 2 * ry],
        [cx + 2 * rx + qx, cy + 2 * ry + qy],
        [cx + 2 * qx + rx, cy + 2 * qy + ry],
        [cx + 2 * qx, cy + 2 * qy],
      );

      g.face(
        [cx, cy],
        [cx + 2 * qx, cy + 2 * qy],
        [cx + 2 * qx + px, cy + 2 * qy + py],
        [cx + 2 * px + qx, cy + 2 * py + qy],
        [cx + 2 * px, cy + 2 * py],
      );

      g.face(
        [cx, cy],
        [cx + 2 * px, cy + 2 * py],
        [cx + 2 * px - rx, cy + 2 * py - ry],
        [cx - 2 * rx + px, cy - 2 * ry + py],
        [cx - 2 * rx, cy - 2 * ry],
      );

      g.face(
        [cx, cy],
        [cx - 2 * rx, cy - 2 * ry],
        [cx - 2 * rx - qx, cy - 2 * ry - qy],
        [cx - 2 * qx - rx, cy - 2 * qy - ry],
        [cx - 2 * qx, cy - 2 * qy],
      );

      g.face(
        [cx, cy],
        [cx - 2 * qx, cy - 2 * qy],
        [cx - 2 * qx - px, cy - 2 * qy - py],
        [cx - 2 * px - qx, cy - 2 * py - qy],
        [cx - 2 * px, cy - 2 * py],
      );

      g.face(
        [cx, cy],
        [cx - 2 * px, cy - 2 * py],
        [cx - 2 * px + rx, cy - 2 * py + ry],
        [cx + 2 * rx - px, cy + 2 * ry - py],
        [cx + 2 * rx, cy + 2 * ry],
      );
    }
  }

  return g.finish();
}
