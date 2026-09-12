/**
 * Penrose P2 (kite/dart) and P3 (thick/thin rhombs): the **grid glue**.
 *
 * This is the `grid.c` side of the Penrose port (`grid.c:3243-3480`) — the
 * description format, the unit scaling, and the assembly of a `Grid`. The
 * tiling itself lives in `penrose.ts`, which knows nothing of pixels. Both
 * variants share one generator, distinguished only by a `which` flag, so they
 * share one module.
 *
 * ## Units, and the two crossings that cancel
 *
 * The generator hands back coordinates as exact integer combinations of 1 and
 * √5, but the x and y components are in *different* scale units (1/4 and
 * sin(π/5)/2 respectively), whose ratio 2·sin(π/5) ≈ 1.1756 is irrational.
 * Upstream fudges that into a rational approximation by picking a pair of
 * integer scale factors — {@link UNITS} — which distorts the
 * tiling very slightly but *consistently*, so nothing drifts out of place
 * across a large patch. The combination of 1 and √5 is still evaluated
 * exactly, via {@link nTimesRootK}, because an approximate √5 could put two
 * such combinations in the wrong order in a big enough patch.
 *
 * On top of that, upstream **transposes x and y**, so that the tiling has
 * vertical rather than horizontal edges: nicer to look at, and it stops the
 * clue digits in two P3 thin rhombs either side of a horizontal line from
 * looking crowded. The transposition happens twice — once in
 * {@link apiSizePenrose}, whose returned `w`/`h` fields are *already* crossed
 * relative to how they are used, and once in the callback below — and the two
 * cancel. **Preserve both verbatim**; any half-fix silently produces a
 * grid of the wrong aspect ratio rather than an error.
 *
 * The P2 and P3 base units differ because sensible sizes for the two differ:
 * subdividing either tiling into the other grows the tile count by φ each
 * time, and since tile area goes as the square of length, fitting about the
 * same number of tiles into the same area wants the two length units to differ
 * by √φ.
 */

import { nTimesRootK } from "../../n-times-root-k.ts";
import type { RandomState } from "../../random/index.ts";
import { type Grid, makeConsistent } from "../grid-core.ts";
import { PENROSE_TILE_SIZE, TilingBuilder } from "../grid-tilings.ts";
import { gridTrimVigorously } from "../grid-trim.ts";
import {
  type Letter,
  type PenrosePatchParams,
  type PenroseWhich,
  penroseTilingGenerate,
  penroseTilingParamsInvalid,
  penroseTilingRandomize,
  penroseValidLetter,
} from "./penrose.ts";

export type { PenroseWhich } from "./penrose.ts";

/** Grid units per unit of the tiling's x and y components. */
const UNITS: Record<PenroseWhich, { readonly x: number; readonly y: number }> = {
  p2: { x: 37, y: 44 },
  p3: { x: 30, y: 35 },
};

/**
 * The size of patch to ask the generator for, in its own units.
 *
 * Note the **crossed** units: `w` divides by the *y* unit and `h` by the *x*
 * unit. That is upstream's `api_size_penrose` exactly, and it is only half of
 * the transposition — callers pass `(size.h, size.w)` to the generator, which
 * is the other half. Reading either line in isolation looks like a bug.
 */
function apiSizePenrose(
  width: number,
  height: number,
  which: PenroseWhich,
): { w: number; h: number } {
  return {
    w: Math.trunc((width * PENROSE_TILE_SIZE) / UNITS[which].y),
    h: Math.trunc((height * PENROSE_TILE_SIZE) / UNITS[which].x),
  };
}

/**
 * Rejection of the pre-2023 Penrose description format.
 *
 * Upstream's `penrose-legacy.c` generates a patch from the expansion of one big
 * triangle whenever a description begins with `'G'`. It is not ported: the
 * modern generator never emits one (its first character is always a digit),
 * and without it the whole Penrose path is exact-integer. A pre-fork saved game
 * carrying a legacy description therefore does not load, and says so rather
 * than failing with the generic, misleading "expected digit" error.
 */
const LEGACY_DESC_ERROR =
  "This is a legacy Penrose grid description ('G...'), which is no longer " +
  "supported. Please generate a new grid.";

/** A parsed description, or the error that stopped it being one. */
type ParseResult =
  | { readonly ok: true; readonly params: PenrosePatchParams }
  | { readonly ok: false; readonly error: string };

/**
 * Parse `[orientation digit][start-vertex digit][tile letters]`, e.g.
 * `"50ABUAAVBUUAB"` (P2) or `"50CXYYCXYYY"` (P3).
 *
 * The two leading characters are checked before any letters are counted, which
 * avoids upstream's `size_t` underflow on a one-character description while
 * reaching the same error: it fails on its missing second character.
 */
function parseDesc(desc: string, which: PenroseWhich): ParseResult {
  if (desc.length === 0) return { ok: false, error: "empty grid description" };

  const orientationChar = desc[0];
  if (!(orientationChar >= "0" && orientationChar <= "9")) {
    return { ok: false, error: "expected digit at start of grid description" };
  }
  const startVertexChar = desc[1];
  if (!(startVertexChar >= "0" && startVertexChar < "3")) {
    return {
      ok: false,
      error: "expected digit as second char of grid description",
    };
  }

  const coords: Letter[] = [];
  for (let i = 2; i < desc.length; i++) {
    const c = desc[i];
    if (!penroseValidLetter(c, which)) {
      return { ok: false, error: "expected tile letter in grid description" };
    }
    coords.push(c);
  }

  const params: PenrosePatchParams = {
    orientation: Number(orientationChar),
    startVertex: Number(startVertexChar),
    coords,
  };
  const invalid = penroseTilingParamsInvalid(params, which);
  return invalid === null ? { ok: true, params } : { ok: false, error: invalid };
}

/** Invent a Penrose patch filling `width × height` tiles, as a description. */
export function penroseNewDesc(
  which: PenroseWhich,
  width: number,
  height: number,
  rng: RandomState,
): string {
  const size = apiSizePenrose(width, height, which);
  // The generator's w/h are `size.h`/`size.w`: see `apiSizePenrose`.
  const params = penroseTilingRandomize(which, size.h, size.w, rng);
  return `${params.orientation}${params.startVertex}${params.coords.join("")}`;
}

/** Validate a description; `null` if acceptable, else the reason it is not. */
export function penroseValidateDesc(
  which: PenroseWhich,
  _width: number,
  _height: number,
  desc: string | null,
): string | null {
  if (desc === null) return "Missing grid description string.";
  if (desc[0] === "G") return LEGACY_DESC_ERROR;

  const parsed = parseDesc(desc, which);
  return parsed.ok ? null : parsed.error;
}

/**
 * Build the grid a description names.
 *
 * A pure deterministic function of its arguments — no randomness reaches here,
 * which is what lets the differential test geometry and RNG fidelity
 * separately.
 */
export function gridNewPenrose(
  which: PenroseWhich,
  width: number,
  height: number,
  desc: string,
): Grid {
  if (desc[0] === "G") throw new Error(`grid: ${LEGACY_DESC_ERROR}`);

  const parsed = parseDesc(desc, which);
  if (!parsed.ok) {
    // Upstream asserts here: reaching construction with an invalid description
    // means the caller skipped validation, which is a programming error rather
    // than bad user input.
    throw new Error(`grid: invalid penrose description (${parsed.error})`);
  }

  const { x: xunit, y: yunit } = UNITS[which];
  const builder = new TilingBuilder(PENROSE_TILE_SIZE);

  const size = apiSizePenrose(width, height, which);
  penroseTilingGenerate(parsed.params, size.h, size.w, (vertices) => {
    builder.face(
      ...vertices.map(({ x, y }): [number, number] => {
        // The transposition: grid-x comes from the tiling's y component and
        // vice versa (see this file's header). The rational and irrational
        // parts are scaled **separately and then summed** — writing this as
        // `unit * (c1 + nTimesRootK(cr5, 5))` moves where the single rounding
        // happens and quietly defeats the exact-arithmetic bridge.
        const gx = y.c1 * yunit + nTimesRootK(y.cr5 * yunit, 5);
        const gy = x.c1 * xunit + nTimesRootK(x.cr5 * xunit, 5);
        // The one negative-zero choke point. Signed basis vectors run through
        // the whole tiling, and `-0` survives `===` *and* the dot-dedup key, so
        // a grid carrying one is structurally perfect and visible only to a
        // comparison like the differential's `toEqual`. Normalize here, where
        // exact arithmetic becomes a pixel.
        return [gx === 0 ? 0 : gx, gy === 0 ? 0 : gy];
      }),
    );
  });

  const g = builder.grid;
  // Trimming **before** `makeConsistent`: the patch has a ragged fringe of
  // faces hanging off it by a single dot (the generator emits only triangles
  // lying entirely inside its box), and trimming operates on face→dot lists,
  // which is precisely `makeConsistent`'s precondition.
  gridTrimVigorously(g);
  makeConsistent(g);

  // Center the surviving patch in the rectangle originally promised by
  // `gridComputeSize`. `Math.trunc`, not `Math.floor`: the numerator goes
  // negative whenever the patch came out wider than the promise, and there the
  // two differ by one — enough to shift the whole grid a pixel.
  const w = width * PENROSE_TILE_SIZE;
  const h = height * PENROSE_TILE_SIZE;
  g.lowestX -= Math.trunc((w - (g.highestX - g.lowestX)) / 2);
  g.lowestY -= Math.trunc((h - (g.highestY - g.lowestY)) / 2);
  g.highestX = g.lowestX + w;
  g.highestY = g.lowestY + h;

  return g;
}
