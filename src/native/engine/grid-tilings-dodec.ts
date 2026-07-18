/**
 * The four dodecagon-based periodic tilings of upstream `grid.c`
 * (`grid_new_dodecagonal`, `grid_new_greatdodecagonal`,
 * `grid_new_greatgreatdodecagonal`, `grid_new_compassdodecagonal`).
 * Import from `grid.ts`, not from here.
 *
 * All four share `DODEC_TILESIZE`/`DODEC_A`/`DODEC_B` and open every cell with
 * the same twelve-corner dodecagon; they differ in the cell pitch, the
 * odd-row stagger, and the filler faces packed between the dodecagons.
 *
 * The two load-bearing rules from `grid-tilings.ts` apply verbatim here:
 * integer arithmetic only (dot dedup is exact-coordinate), and emission order
 * is observable (dot indices are assigned in first-encounter order). The face
 * order, the corner order within each face, and each per-cell emission guard
 * are transcribed from upstream unchanged — including the guards' asymmetries,
 * which are what make the patch's boundary ragged in exactly upstream's way.
 */

import type { Grid } from "./grid-core.ts";
import { DODEC_A, DODEC_B, DODEC_TILESIZE, TilingBuilder } from "./grid-tilings.ts";

const a = DODEC_A;
const b = DODEC_B;

/**
 * The twelve-corner dodecagon centred on `(px, py)`, clockwise from the top
 * right. Identical in all four tilings, so it is emitted from one place — the
 * corner order is upstream's and is observable.
 */
function dodecagon(builder: TilingBuilder, px: number, py: number): void {
  builder.face(
    [px + a, py - (2 * a + b)],
    [px + (a + b), py - (a + b)],
    [px + (2 * a + b), py - a],
    [px + (2 * a + b), py + a],
    [px + (a + b), py + (a + b)],
    [px + a, py + (2 * a + b)],
    [px - a, py + (2 * a + b)],
    [px - (a + b), py + (a + b)],
    [px - (2 * a + b), py + a],
    [px - (2 * a + b), py - a],
    [px - (a + b), py - (a + b)],
    [px - a, py - (2 * a + b)],
  );
}

/**
 * Dodecagonal tiling: dodecagons on a staggered lattice with a triangle above
 * and below each. Mirrors `grid_new_dodecagonal`.
 */
export function gridNewDodecagonal(width: number, height: number): Grid {
  const builder = new TilingBuilder(DODEC_TILESIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      /* centre of dodecagon */
      let px = (4 * a + 2 * b) * x;
      const py = (3 * a + 2 * b) * y;
      if (y % 2) px += 2 * a + b;

      dodecagon(builder, px, py);

      /* triangle below dodecagon */
      if (y < height - 1 && (x < width - 1 || !(y % 2)) && (x > 0 || y % 2)) {
        builder.face(
          [px + a, py + (2 * a + b)],
          [px, py + (2 * a + 2 * b)],
          [px - a, py + (2 * a + b)],
        );
      }

      /* triangle above dodecagon */
      if (y && (x < width - 1 || !(y % 2)) && (x > 0 || y % 2)) {
        builder.face(
          [px - a, py - (2 * a + b)],
          [px, py - (2 * a + 2 * b)],
          [px + a, py - (2 * a + b)],
        );
      }
    }
  }

  return builder.finish();
}

/**
 * Great dodecagonal tiling: dodecagons with hexagons above/below and squares
 * to the right and on both upper diagonals. Mirrors
 * `grid_new_greatdodecagonal`.
 */
export function gridNewGreatdodecagonal(width: number, height: number): Grid {
  const builder = new TilingBuilder(DODEC_TILESIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      /* centre of dodecagon */
      let px = (6 * a + 2 * b) * x;
      const py = (3 * a + 3 * b) * y;
      if (y % 2) px += 3 * a + b;

      dodecagon(builder, px, py);

      /* hexagon below dodecagon */
      if (y < height - 1 && (x < width - 1 || !(y % 2)) && (x > 0 || y % 2)) {
        builder.face(
          [px + a, py + (2 * a + b)],
          [px + 2 * a, py + (2 * a + 2 * b)],
          [px + a, py + (2 * a + 3 * b)],
          [px - a, py + (2 * a + 3 * b)],
          [px - 2 * a, py + (2 * a + 2 * b)],
          [px - a, py + (2 * a + b)],
        );
      }

      /* hexagon above dodecagon */
      if (y && (x < width - 1 || !(y % 2)) && (x > 0 || y % 2)) {
        builder.face(
          [px - a, py - (2 * a + b)],
          [px - 2 * a, py - (2 * a + 2 * b)],
          [px - a, py - (2 * a + 3 * b)],
          [px + a, py - (2 * a + 3 * b)],
          [px + 2 * a, py - (2 * a + 2 * b)],
          [px + a, py - (2 * a + b)],
        );
      }

      /* square on right of dodecagon */
      if (x < width - 1) {
        builder.face(
          [px + 2 * a + b, py - a],
          [px + 4 * a + b, py - a],
          [px + 4 * a + b, py + a],
          [px + 2 * a + b, py + a],
        );
      }

      /* square on top right of dodecagon */
      if (y && (x < width - 1 || !(y % 2))) {
        builder.face(
          [px + a, py - (2 * a + b)],
          [px + 2 * a, py - (2 * a + 2 * b)],
          [px + (2 * a + b), py - (a + 2 * b)],
          [px + (a + b), py - (a + b)],
        );
      }

      /* square on top left of dodecagon */
      if (y && (x || y % 2)) {
        builder.face(
          [px - (a + b), py - (a + b)],
          [px - (2 * a + b), py - (a + 2 * b)],
          [px - 2 * a, py - (2 * a + 2 * b)],
          [px - a, py - (2 * a + b)],
        );
      }
    }
  }

  return builder.finish();
}

/**
 * Great great dodecagonal tiling: the densest of the family — twelve face
 * kinds per cell (dodecagon, three hexagons, six squares, two triangles).
 * Mirrors `grid_new_greatgreatdodecagonal`.
 */
export function gridNewGreatgreatdodecagonal(width: number, height: number): Grid {
  const builder = new TilingBuilder(DODEC_TILESIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      /* centre of dodecagon */
      let px = (4 * a + 4 * b) * x;
      const py = (6 * a + 2 * b) * y;
      if (y % 2) px += 2 * a + 2 * b;

      dodecagon(builder, px, py);

      /* hexagon on top right of dodecagon */
      if (y && (x < width - 1 || !(y % 2))) {
        builder.face(
          [px + (a + 2 * b), py - (4 * a + b)],
          [px + (a + 2 * b), py - (2 * a + b)],
          [px + (a + b), py - (a + b)],
          [px + a, py - (2 * a + b)],
          [px + a, py - (4 * a + b)],
          [px + (a + b), py - (5 * a + b)],
        );
      }

      /* hexagon on right of dodecagon */
      if (x < width - 1) {
        builder.face(
          [px + (2 * a + 3 * b), py - a],
          [px + (2 * a + 3 * b), py + a],
          [px + (2 * a + 2 * b), py + 2 * a],
          [px + (2 * a + b), py + a],
          [px + (2 * a + b), py - a],
          [px + (2 * a + 2 * b), py - 2 * a],
        );
      }

      /* hexagon on bottom right of dodecagon */
      if (y < height - 1 && (x < width - 1 || !(y % 2))) {
        builder.face(
          [px + (a + 2 * b), py + (2 * a + b)],
          [px + (a + 2 * b), py + (4 * a + b)],
          [px + (a + b), py + (5 * a + b)],
          [px + a, py + (4 * a + b)],
          [px + a, py + (2 * a + b)],
          [px + (a + b), py + (a + b)],
        );
      }

      /* square on top right of dodecagon */
      if (y && x < width - 1) {
        builder.face(
          [px + (a + 2 * b), py - (2 * a + b)],
          [px + (2 * a + 2 * b), py - 2 * a],
          [px + (2 * a + b), py - a],
          [px + (a + b), py - (a + b)],
        );
      }

      /* square on bottom right of dodecagon */
      if (y < height - 1 && x < width - 1) {
        builder.face(
          [px + (2 * a + 2 * b), py + 2 * a],
          [px + (a + 2 * b), py + (2 * a + b)],
          [px + (a + b), py + (a + b)],
          [px + (2 * a + b), py + a],
        );
      }

      /* square below dodecagon */
      if (y < height - 1 && (x < width - 1 || !(y % 2)) && (x > 0 || y % 2)) {
        builder.face(
          [px + a, py + (2 * a + b)],
          [px + a, py + (4 * a + b)],
          [px - a, py + (4 * a + b)],
          [px - a, py + (2 * a + b)],
        );
      }

      /* square on bottom left of dodecagon */
      if (x && y < height - 1) {
        builder.face(
          [px - (2 * a + b), py + a],
          [px - (a + b), py + (a + b)],
          [px - (a + 2 * b), py + (2 * a + b)],
          [px - (2 * a + 2 * b), py + 2 * a],
        );
      }

      /* square on top left of dodecagon */
      if (x && y) {
        builder.face(
          [px - (a + b), py - (a + b)],
          [px - (2 * a + b), py - a],
          [px - (2 * a + 2 * b), py - 2 * a],
          [px - (a + 2 * b), py - (2 * a + b)],
        );
      }

      /* square above dodecagon */
      if (y && (x < width - 1 || !(y % 2)) && (x > 0 || y % 2)) {
        builder.face(
          [px + a, py - (4 * a + b)],
          [px + a, py - (2 * a + b)],
          [px - a, py - (2 * a + b)],
          [px - a, py - (4 * a + b)],
        );
      }

      /* upper triangle (v) */
      if (y && x < width - 1) {
        builder.face(
          [px + (3 * a + 2 * b), py - (2 * a + b)],
          [px + (2 * a + 2 * b), py - 2 * a],
          [px + (a + 2 * b), py - (2 * a + b)],
        );
      }

      /* lower triangle (^) */
      if (y < height - 1 && x < width - 1) {
        builder.face(
          [px + (3 * a + 2 * b), py + (2 * a + b)],
          [px + (a + 2 * b), py + (2 * a + b)],
          [px + (2 * a + 2 * b), py + 2 * a],
        );
      }
    }
  }

  return builder.finish();
}

/**
 * Compass dodecagonal tiling: unstaggered dodecagons with a compass rose (four
 * triangles around a central square) filling each gap to the bottom right.
 * Mirrors `grid_new_compassdodecagonal`.
 */
export function gridNewCompassdodecagonal(width: number, height: number): Grid {
  const builder = new TilingBuilder(DODEC_TILESIZE);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      /* centre of dodecagon */
      const px = (4 * a + 2 * b) * x;
      const py = (4 * a + 2 * b) * y;

      dodecagon(builder, px, py);

      if (x < width - 1 && y < height - 1) {
        /* north triangle */
        builder.face(
          [px + (2 * a + b), py + a],
          [px + (3 * a + b), py + (a + b)],
          [px + (a + b), py + (a + b)],
        );

        /* east triangle */
        builder.face(
          [px + (3 * a + 2 * b), py + (2 * a + b)],
          [px + (3 * a + b), py + (3 * a + b)],
          [px + (3 * a + b), py + (a + b)],
        );

        /* south triangle */
        builder.face(
          [px + (3 * a + b), py + (3 * a + b)],
          [px + (2 * a + b), py + (3 * a + 2 * b)],
          [px + (a + b), py + (3 * a + b)],
        );

        /* west triangle */
        builder.face(
          [px + (a + b), py + (a + b)],
          [px + (a + b), py + (3 * a + b)],
          [px + a, py + (2 * a + b)],
        );

        /* square in center */
        builder.face(
          [px + (3 * a + b), py + (a + b)],
          [px + (3 * a + b), py + (3 * a + b)],
          [px + (a + b), py + (3 * a + b)],
          [px + (a + b), py + (a + b)],
        );
      }
    }
  }

  return builder.finish();
}
