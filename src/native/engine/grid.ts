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
 *   generators, the size dispatch (`gridSizeFor`, all 18 tilings) and
 *   `gridValidateParams`. Pure integer, no RNG.
 * - [`grid-geometry.ts`](./grid-geometry.ts) — `gridNearestEdge` (input
 *   hit-testing) and `gridFindIncentre` (label placement). The only floating
 *   point in the module, and display/input only — never desc, generation or
 *   solving.
 * - [`grid-desc.ts`](./grid-desc.ts) — `gridNewDesc` / `gridValidateDesc`.
 * - [`grid-trim.ts`](./grid-trim.ts) — `gridTrimVigorously`, which the
 *   aperiodic generators run before `makeConsistent` to shed their ragged
 *   fringe.
 *
 * **The one contract worth knowing before reading further:** `gridNewDesc` is
 * the only function here that consumes randomness, and `gridNew` is a pure
 * deterministic function of `(type, width, height, desc)`. Everything else
 * follows from that split — including the ability to differential-check
 * geometry and RNG fidelity independently.
 *
 * Landed square-tiling-only with Pearl; extended to all 14 periodic tilings by
 * `extend-grid-tilings` for Loopy. The four aperiodic tilings (Penrose P2/P3,
 * hats, spectres) land in `add-aperiodic-tilings`.
 */

export {
  Grid,
  GridDot,
  GridEdge,
  GridFace,
  makeConsistent,
} from "./grid-core.ts";
export { gridNewDesc, gridValidateDesc } from "./grid-desc.ts";
export { gridFindIncentre, gridNearestEdge } from "./grid-geometry.ts";
export {
  ALL_GRID_TYPES,
  APERIODIC_GRID_TYPES,
  type GridSize,
  type GridType,
  gridNewSquare,
  gridSizeFor,
  gridValidateParams,
  PERIODIC_GRID_TYPES,
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
export { GridTrimmedAwayError, gridTrimVigorously } from "./grid-trim.ts";

import type { Grid } from "./grid-core.ts";
import { assertGridDescValid } from "./grid-desc.ts";
import {
  type GridSize,
  type GridType,
  gridNewSquare,
  gridSizeFor,
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
import { gridNewHats } from "./tilings/hat-grid.ts";
import { gridNewPenrose } from "./tilings/penrose-grid.ts";
import { gridNewSpectres } from "./tilings/spectre-grid.ts";

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
  // Upstream asserts the description here rather than returning an error: a bad
  // description reaching construction means the caller skipped validation, so
  // it is a programming error, and every generator below may trust its input.
  assertGridDescValid(type, width, height, desc);

  switch (type) {
    case "square":
      return gridNewSquare(width, height);
    case "honeycomb":
      return gridNewHoneycomb(width, height);
    case "triangular":
      return gridNewTriangular(width, height, desc);
    case "snubsquare":
      return gridNewSnubsquare(width, height);
    case "cairo":
      return gridNewCairo(width, height);
    case "greathexagonal":
      return gridNewGreathexagonal(width, height);
    case "kagome":
      return gridNewKagome(width, height);
    case "octagonal":
      return gridNewOctagonal(width, height);
    case "kites":
      return gridNewKites(width, height);
    case "floret":
      return gridNewFloret(width, height);
    case "dodecagonal":
      return gridNewDodecagonal(width, height);
    case "greatdodecagonal":
      return gridNewGreatdodecagonal(width, height);
    case "greatgreatdodecagonal":
      return gridNewGreatgreatdodecagonal(width, height);
    case "compassdodecagonal":
      return gridNewCompassdodecagonal(width, height);
    // The aperiodic four. `desc` is non-null for all of them: it is the record
    // of the generator's random choices, and `assertGridDescValid` above has
    // already rejected a missing or malformed one.
    case "penrose_p2_kite":
      return gridNewPenrose("p2", width, height, desc as string);
    case "penrose_p3_thick":
      return gridNewPenrose("p3", width, height, desc as string);
    case "hats":
      return gridNewHats(width, height, desc as string);
    case "spectres":
      return gridNewSpectres(width, height, desc as string);
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
  return gridSizeFor(type, width, height);
}
