/**
 * The hat aperiodic monotile: **grid glue**.
 *
 * The `grid.c` side of hats — desc generation, desc parsing/validation, and
 * turning the tiling engine's callbacks into a `Grid`. The tiling itself lives
 * in `hat.ts`; this file only bridges it to the grid representation.
 *
 * Desc format: each combinatorial coordinate in decimal *followed by* a comma,
 * then one metatile letter — e.g. `"0,3,0,0,6,F"`.
 */

import type { RandomState } from "../../random/index.ts";
import { type Grid, makeConsistent } from "../grid-core.ts";
import {
  HATS_TILESIZE,
  HATS_XUNIT,
  HATS_YUNIT,
  TilingBuilder,
} from "../grid-tilings.ts";
import { gridTrimVigorously } from "../grid-trim.ts";
import {
  type HatPatchParams,
  hatTilingGenerate,
  hatTilingParamsInvalid,
  hatTilingRandomise,
  metatileCharToType,
} from "./hat.ts";

/** Result of parsing a desc: the params, or the reason it is not one. */
type ParseResult =
  | { readonly params: HatPatchParams; readonly error?: undefined }
  | { readonly params?: undefined; readonly error: string };

/**
 * Parse a desc into patch params. Shared by validation and construction, so
 * that `gridNewHats` can rely on having been validated by the same code.
 *
 * Trailing junk after the metatile letter is accepted, matching the C, which
 * stops reading at the letter and never checks for a terminator.
 */
function descToHatParams(desc: string): ParseResult {
  const coords: number[] = [];
  let p = 0;

  const isDigit = (i: number): boolean =>
    i < desc.length && desc[i] >= "0" && desc[i] <= "9";

  while (isDigit(p)) {
    const start = p;
    while (isDigit(p)) p++;
    if (desc[p] !== ",") return { error: "expected ',' in grid description" };
    const n = Number(desc.slice(start, p));
    // Two guards, both upstream's: at most two digits, and at most one byte —
    // the C stores each coordinate in an `unsigned char`.
    if (p - start > 2 || n > 0xff) {
      return { error: "too-large coordinate in grid description" };
    }
    p++; /* eat the comma */
    coords.push(n);
  }

  const letter = desc[p] ?? "";
  if (metatileCharToType(letter) < 0) {
    return { error: "invalid character in grid description" };
  }

  return { params: { ncoords: coords.length, coords, finalMetatile: letter } };
}

/** Generate a random hat patch description covering `width × height` squares. */
export function hatsNewDesc(width: number, height: number, rng: RandomState): string {
  const hp = hatTilingRandomise(width, height, rng);
  let out = "";
  for (const c of hp.coords) {
    if (c >= 100) {
      throw new Error(`hat: coordinate ${c} needs more than two digits`);
    }
    out += `${c},`;
  }
  return out + hp.finalMetatile;
}

/** Validate a hat desc. Returns an error message, or null if it is acceptable. */
export function hatsValidateDesc(
  _width: number,
  _height: number,
  desc: string | null,
): string | null {
  if (desc === null) return "Missing grid description string.";
  const parsed = descToHatParams(desc);
  if (parsed.error !== undefined) return parsed.error;
  return hatTilingParamsInvalid(parsed.params);
}

/**
 * Build the hat grid for an already-validated desc.
 *
 * Two things here are deliberately unlike the other aperiodic tilings:
 *
 * 1. **The face order comes from the callback's `nvertices`**, not a literal.
 *    Penrose faces are always 4 and spectre's always 14, but the hat API
 *    promises no constant — so read it from the callback.
 * 2. **No re-centring.** Penrose and spectres shift their trimmed patch to sit
 *    inside the extent `gridComputeSize` reports; hats keeps whatever survived
 *    trimming, so its bounding box generally will *not* match that extent. The
 *    asymmetry is upstream's, and is load-bearing for byte-match.
 *
 * Trimming runs *before* `makeConsistent` — the hat walk emits a ragged edge of
 * hats that fell partly outside the region — which is why this assembles the
 * grid by hand rather than through `TilingBuilder.finish()`.
 */
export function gridNewHats(width: number, height: number, desc: string): Grid {
  const parsed = descToHatParams(desc);
  if (parsed.error !== undefined) {
    throw new Error(`hat: ${parsed.error} (should have been validated already)`);
  }

  const b = new TilingBuilder(HATS_TILESIZE);
  hatTilingGenerate(parsed.params, width, height, (nvertices, coords) => {
    const corners: [number, number][] = [];
    for (let i = 0; i < nvertices; i++) {
      corners.push([coords[2 * i] * HATS_XUNIT, coords[2 * i + 1] * HATS_YUNIT]);
    }
    b.face(...corners);
  });

  gridTrimVigorously(b.grid);
  makeConsistent(b.grid);
  return b.grid;
}
