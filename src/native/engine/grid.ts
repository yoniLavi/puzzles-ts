/**
 * Shared planar-grid geometry leaf — the public entry point. The idiomatic TS
 * port of upstream `grid.c` (Lambros Lambrou's general planar-graph grid
 * code), which models any planar graph as faces, edges and dots with full
 * reference incidence.
 *
 * Split across three files, all of which are re-exported here — **import from
 * this module, not from the parts**:
 *
 * - [`grid-core.ts`](./grid-core.ts) — the four incidence classes
 *   (`Grid`/`GridFace`/`GridEdge`/`GridDot`) and the shared `makeConsistent`
 *   incidence builder.
 * - [`grid-tilings.ts`](./grid-tilings.ts) — the 14 periodic tiling
 *   generators and `periodicGridSize`. Pure integer, no RNG.
 * - [`grid-geometry.ts`](./grid-geometry.ts) — `gridNearestEdge` (input
 *   hit-testing) and `gridFindIncentre` (label placement). The only floating
 *   point in the module, and display/input only — never desc, generation or
 *   solving.
 *
 * Landed square-tiling-only with Pearl; extended to all 14 periodic tilings by
 * `extend-grid-tilings` for Loopy. The four aperiodic tilings (Penrose P2/P3,
 * hats, spectres) are RNG-bearing and desc-round-tripping, and land next in
 * `add-aperiodic-tilings` — until then `gridNew` rejects them.
 */

export {
  Grid,
  GridDot,
  GridEdge,
  GridFace,
  makeConsistent,
} from "./grid-core.ts";
export { gridFindIncentre, gridNearestEdge } from "./grid-geometry.ts";
export {
  type GridSize,
  type GridType,
  gridNewSquare,
  gridValidateParams,
  PERIODIC_GRID_TYPES,
  periodicGridSize,
} from "./grid-tilings.ts";
export {
  gridNewCairo,
  gridNewHoneycomb,
  gridNewSnubsquare,
  gridNewTriangular,
} from "./grid-tilings-basic.ts";
export {
  gridNewCompassdodecagonal,
  gridNewDodecagonal,
  gridNewGreatdodecagonal,
  gridNewGreatgreatdodecagonal,
} from "./grid-tilings-dodec.ts";
export {
  gridNewFloret,
  gridNewGreathexagonal,
  gridNewKagome,
  gridNewKites,
  gridNewOctagonal,
} from "./grid-tilings-hex.ts";

import type { Grid } from "./grid-core.ts";
import {
  type GridSize,
  type GridType,
  gridNewSquare,
  periodicGridSize,
} from "./grid-tilings.ts";
import {
  gridNewCairo,
  gridNewHoneycomb,
  gridNewSnubsquare,
  gridNewTriangular,
} from "./grid-tilings-basic.ts";
import {
  gridNewCompassdodecagonal,
  gridNewDodecagonal,
  gridNewGreatdodecagonal,
  gridNewGreatgreatdodecagonal,
} from "./grid-tilings-dodec.ts";
import {
  gridNewFloret,
  gridNewGreathexagonal,
  gridNewKagome,
  gridNewKites,
  gridNewOctagonal,
} from "./grid-tilings-hex.ts";

/**
 * Build a grid of the given type and size. `desc` is the tiling's description
 * string where it has one — today only `triangular` (a version flag selecting
 * upstream's legacy ragged-ear algorithm when absent, or the ear-trimmed one
 * when `"0"`). Every other periodic tiling requires `desc` to be null.
 *
 * Mirrors `grid_new`.
 */
export function gridNew(
  type: GridType,
  width: number,
  height: number,
  desc: string | null = null,
): Grid {
  switch (type) {
    case "square":
      requireNoDesc(type, desc);
      return gridNewSquare(width, height);
    case "honeycomb":
      requireNoDesc(type, desc);
      return gridNewHoneycomb(width, height);
    case "triangular":
      return gridNewTriangular(width, height, desc);
    case "snubsquare":
      requireNoDesc(type, desc);
      return gridNewSnubsquare(width, height);
    case "cairo":
      requireNoDesc(type, desc);
      return gridNewCairo(width, height);
    case "greathexagonal":
      requireNoDesc(type, desc);
      return gridNewGreathexagonal(width, height);
    case "kagome":
      requireNoDesc(type, desc);
      return gridNewKagome(width, height);
    case "octagonal":
      requireNoDesc(type, desc);
      return gridNewOctagonal(width, height);
    case "kites":
      requireNoDesc(type, desc);
      return gridNewKites(width, height);
    case "floret":
      requireNoDesc(type, desc);
      return gridNewFloret(width, height);
    case "dodecagonal":
      requireNoDesc(type, desc);
      return gridNewDodecagonal(width, height);
    case "greatdodecagonal":
      requireNoDesc(type, desc);
      return gridNewGreatdodecagonal(width, height);
    case "greatgreatdodecagonal":
      requireNoDesc(type, desc);
      return gridNewGreatgreatdodecagonal(width, height);
    case "compassdodecagonal":
      requireNoDesc(type, desc);
      return gridNewCompassdodecagonal(width, height);
    case "penrose_p2_kite":
    case "penrose_p3_thick":
    case "hats":
    case "spectres":
      throw new Error(
        `grid: the aperiodic tiling '${type}' is not implemented yet ` +
          "(openspec add-aperiodic-tilings)",
      );
    default:
      throw new Error(`grid: unimplemented tiling '${type}'`);
  }
}

function requireNoDesc(type: GridType, desc: string | null): void {
  if (desc !== null) {
    throw new Error(`grid: tiling '${type}' takes no description string`);
  }
}

/**
 * A tiling's natural tile size and extent, as a pure function of
 * `(type, width, height)` — no grid need be built. Mirrors
 * `grid_compute_size`; consumers size their drawing surface from it.
 */
export function gridComputeSize(
  type: GridType,
  width: number,
  height: number,
): GridSize {
  return periodicGridSize(type, width, height);
}
