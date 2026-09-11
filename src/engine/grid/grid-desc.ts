/**
 * Grid **description** strings: generation, validation, and the dispatch
 * between them. Upstream's `grid_new_desc` / `grid_validate_desc`
 * (`grid.c:3817` and `:3832`).
 *
 * Most tilings are a pure function of `(width, height)` and need no
 * description. The four aperiodic ones are not: there is no canonical
 * "10×10 patch of spectres", so the generator makes random choices, and the
 * description is the record of those choices — enough to rebuild the *same*
 * patch later from a saved game or a shared game ID. That is the module's
 * contract (see `index.ts`): `gridNewDesc` is the only function in it that
 * consumes randomness.
 *
 * ## The three cases
 *
 * 1. **Aperiodic** (Penrose P2/P3, hats, spectres) — a real description,
 *    generated with the RNG and validated structurally.
 * 2. **Triangular** — a *version flag*, not randomness. `gridNewDesc` returns
 *    the literal `"0"`; an absent description selects upstream's legacy
 *    ragged-ear algorithm and `"0"` the current ear-trimmed one. Both remain
 *    valid, because old shared game IDs carry the absent form.
 * 3. **Every other periodic tiling** — no description at all, and supplying one
 *    is an error.
 */

import type { RandomState } from "../random/index.ts";
import type { GridType } from "./grid-tilings.ts";
import { hatsNewDesc, hatsValidateDesc } from "./tilings/hat-grid.ts";
import { penroseNewDesc, penroseValidateDesc } from "./tilings/penrose-grid.ts";
import { spectresNewDesc, spectresValidateDesc } from "./tilings/spectre-grid.ts";

/**
 * Produce a description for a freshly generated grid, consuming randomness
 * where the tiling needs it. Returns `null` for tilings that take no
 * description. Mirrors `grid_new_desc`.
 */
export function gridNewDesc(
  type: GridType,
  width: number,
  height: number,
  rng: RandomState,
): string | null {
  switch (type) {
    case "triangular":
      // Not random: the literal version flag selecting the ear-trimmed
      // algorithm. New grids always get the current one.
      return "0";
    case "penrose_p2_kite":
      return penroseNewDesc("p2", width, height, rng);
    case "penrose_p3_thick":
      return penroseNewDesc("p3", width, height, rng);
    case "hats":
      return hatsNewDesc(width, height, rng);
    case "spectres":
      return spectresNewDesc(width, height, rng);
    default:
      return null;
  }
}

/**
 * Check a description against a tiling and size. Returns an error message, or
 * `null` when the description is acceptable. Mirrors `grid_validate_desc`.
 */
export function gridValidateDesc(
  type: GridType,
  width: number,
  height: number,
  desc: string | null,
): string | null {
  switch (type) {
    case "triangular":
      return gridValidateDescTriangular(desc);
    case "penrose_p2_kite":
      return penroseValidateDesc("p2", width, height, desc);
    case "penrose_p3_thick":
      return penroseValidateDesc("p3", width, height, desc);
    case "hats":
      return hatsValidateDesc(width, height, desc);
    case "spectres":
      return spectresValidateDesc(width, height, desc);
    default:
      if (desc !== null) {
        return "Grid description strings not used with this grid type";
      }
      return null;
  }
}

/**
 * Triangular's description is a version flag with exactly two legal values:
 * absent (upstream's original algorithm, which leaves "ears" — triangles joined
 * to only one other face at some corners) and `"0"` (the current algorithm,
 * which trims them). Anything else is rejected. Mirrors
 * `grid_validate_desc_triangular`.
 */
function gridValidateDescTriangular(desc: string | null): string | null {
  if (desc === null || desc === "0") return null;
  return "Unrecognized grid description.";
}

/**
 * The guard `gridNew` runs before dispatching. Upstream asserts here
 * (`grid.c:3853`), treating an invalid description that reaches construction as
 * a programming error rather than a user error: callers are expected to have
 * validated already, and every generator then trusts its input.
 */
export function assertGridDescValid(
  type: GridType,
  width: number,
  height: number,
  desc: string | null,
): void {
  const descError = gridValidateDesc(type, width, height, desc);
  if (descError !== null) {
    throw new Error(`grid: invalid description reached gridNew: ${descError}`);
  }
}
