/**
 * The spectre aperiodic monotile: grid glue.
 *
 * Turns the tiling engine in `spectre.ts` into a `Grid` — the `grid.c` side of
 * the port (`grid_new_desc_spectres`, `grid_desc_to_spectre_params`,
 * `grid_validate_desc_spectres`, `grid_spectres_callback`, `grid_new_spectres`).
 *
 * Three things here are easy to get subtly wrong and are called out at their
 * sites below: the patch is generated at **seven times** the requested size, the
 * rational and irrational parts of each coordinate are scaled **separately**
 * before being summed, and the recentring divides with `Math.trunc` because its
 * numerator can be negative.
 */

import type { RandomState } from "../../random/index.ts";
import { type Grid, makeConsistent } from "../grid-core.ts";
import {
  SPECTRE_SQUARELEN,
  SPECTRE_TILESIZE,
  SPECTRE_UNIT,
  TilingBuilder,
} from "../grid-tilings.ts";
import { gridTrimVigorously } from "../grid-trim.ts";
import { nTimesRootK } from "../n-times-root-k.ts";
import {
  SPECTRE_NVERTICES,
  type SpectrePatchParams,
  spectreParamsInvalid,
  spectreTilingGenerate,
  spectreTilingRandomise,
  spectreValidHexLetter,
} from "./spectre.ts";

/**
 * Parse a desc into patch parameters, or return an error message.
 *
 * The format is `[orientation][coordinate digits…][final hex letter]`, e.g.
 * `"0003047Y"`: one character of orientation (`0`–`9`, then `A`,`B` for 10 and
 * 11), then one decimal digit per coordinate, then one of `GDJLXPSFY`.
 *
 * Upstream computes `strlen(desc) - 2` *before* checking the length, which
 * underflows `size_t` on a one-character desc and then reads far off the end of
 * the string. Descs arrive from saved games and shared game IDs — untrusted
 * input — so the length is checked up front here instead. A two-character desc
 * is still legal to *parse* (it simply has zero coordinates); it is rejected a
 * step later by the range check, with upstream's own message.
 */
function descToParams(desc: string): SpectrePatchParams | string {
  if (desc.length === 0) return "empty grid description";
  if (desc.length < 2) return "grid description too short";

  const ncoords = desc.length - 2;

  let orientation: number;
  const first = desc[0];
  if (first >= "0" && first <= "9") {
    orientation = first.charCodeAt(0) - "0".charCodeAt(0);
  } else if (first === "A" || first === "B") {
    orientation = 10 + first.charCodeAt(0) - "A".charCodeAt(0);
  } else {
    return "expected digit or A,B at start of grid description";
  }

  const coords: number[] = [];
  for (let i = 0; i < ncoords; i++) {
    const c = desc[i + 1];
    if (c < "0" || c > "9") return "expected digit in grid description";
    coords.push(c.charCodeAt(0) - "0".charCodeAt(0));
  }

  return { orientation, coords, finalHex: desc[ncoords + 1] };
}

/**
 * Generate a fresh patch and describe it — the only randomness-consuming
 * function here. Mirrors `grid_new_desc_spectres`.
 */
export function spectresNewDesc(
  width: number,
  height: number,
  rng: RandomState,
): string {
  const params = spectreTilingRandomise(
    width * SPECTRE_SQUARELEN,
    height * SPECTRE_SQUARELEN,
    rng,
  );

  const orientation =
    params.orientation < 10
      ? String.fromCharCode("0".charCodeAt(0) + params.orientation)
      : String.fromCharCode("A".charCodeAt(0) + params.orientation - 10);

  // Every coordinate is a single digit: the widest hexagon expands to eight
  // children, so the largest legal value is 7. Upstream asserts the same thing.
  for (const c of params.coords) {
    if (c >= 10) throw new Error(`spectre: coordinate ${c} is not a single digit`);
  }

  return orientation + params.coords.join("") + params.finalHex;
}

/**
 * Check a desc describes a patch that can actually be built. Mirrors
 * `grid_validate_desc_spectres`; the size is not consulted, because a desc
 * constrains the substitution hierarchy rather than the area covered.
 */
export function spectresValidateDesc(
  width: number,
  height: number,
  desc: string | null,
): string | null {
  void width;
  void height;
  if (desc === null) return "Missing grid description string.";

  const parsed = descToParams(desc);
  if (typeof parsed === "string") return parsed;
  // Check the letter before `spectreParamsInvalid` walks the hierarchy with it,
  // rather than relying on that function happening to check it first.
  if (!spectreValidHexLetter(parsed.finalHex)) return "invalid final hexagon type";
  return spectreParamsInvalid(parsed);
}

/**
 * Build the grid a desc describes. Pure: consumes no randomness, and the same
 * `(width, height, desc)` always yields an identical grid.
 * Mirrors `grid_new_spectres`.
 */
export function gridNewSpectres(width: number, height: number, desc: string): Grid {
  const params = descToParams(desc);
  if (typeof params === "string") {
    throw new Error(`spectre: invalid description reached gridNewSpectres: ${params}`);
  }

  // Seven times the requested size in each direction. Unlike hats — which is
  // handed the raw width and height — a spectre "square" is SPECTRE_SQUARELEN
  // units across, and the generator works in those units throughout.
  const width2 = width * SPECTRE_SQUARELEN;
  const height2 = height * SPECTRE_SQUARELEN;

  const builder = new TilingBuilder(SPECTRE_TILESIZE);

  spectreTilingGenerate(params, width2, height2, (coords) => {
    const corners: [number, number][] = [];
    for (let i = 0; i < SPECTRE_NVERTICES; i++) {
      // The rational and irrational parts are scaled separately and then summed:
      // `unit·a + round(unit·b·√3)`, NOT `unit·(a + round(b·√3))`. Factoring the
      // unit out would move where the single rounding happens — and since dot
      // deduplication is by exact coordinate, a one-unit disagreement does not
      // blur a shared corner, it splits it into two dots.
      corners.push([
        coords[4 * i + 0] * SPECTRE_UNIT +
          nTimesRootK(coords[4 * i + 1] * SPECTRE_UNIT, 3),
        coords[4 * i + 2] * SPECTRE_UNIT +
          nTimesRootK(coords[4 * i + 3] * SPECTRE_UNIT, 3),
      ]);
    }
    // All fourteen vertices in emission order, including the collinear one that
    // splits the "double edge". Dropping it would look identical but would stop
    // adjacent spectres sharing the dots that make them adjacent.
    builder.face(...corners);
  });

  // Trimming must happen *before* `makeConsistent`: the generator emits every
  // tile that fits entirely inside the box and stops, which leaves a ragged
  // fringe of faces clinging on by a single dot. (So this cannot use
  // `TilingBuilder.finish()`, which goes straight to `makeConsistent`.)
  const g = builder.grid;
  gridTrimVigorously(g);
  makeConsistent(g);

  // The tiling has no rectangular period to sit on, so the surviving patch ends
  // up off-centre by whatever the fringe happened to be. Recentre it within the
  // extent `gridComputeSize` promised.
  //
  // `Math.trunc`, not `Math.floor`: where the survivors are *wider* than the
  // promised rectangle the numerator is negative, and the two disagree by one
  // there — enough to shift the whole grid a pixel away from the C's.
  const w = width2 * SPECTRE_UNIT;
  const h = height2 * SPECTRE_UNIT;
  g.lowestX -= Math.trunc((w - (g.highestX - g.lowestX)) / 2);
  g.lowestY -= Math.trunc((h - (g.highestY - g.lowestY)) / 2);
  g.highestX = g.lowestX + w;
  g.highestY = g.lowestY + h;

  return g;
}
