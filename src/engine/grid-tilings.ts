/**
 * The periodic tiling generators of upstream `grid.c`, ported for Loopy
 * (openspec `extend-grid-tilings`). Import from `grid.ts`, not from here.
 *
 * **Every generator in this file is a pure function of `(width, height)`** —
 * no randomness, no floating point — and follows one shape: walk cells in
 * `y`-then-`x` order, emit K faces per cell at integer offsets from the cell
 * origin with their corners clockwise, dedup shared corner dots by exact
 * coordinate, then `makeConsistent`.
 *
 * Two rules are load-bearing and must not be "tidied":
 *
 * 1. **Integer arithmetic only.** `grid.c:1404` says so in as many words. Dot
 *    dedup is by *exact* coordinate equality, so a fractional coordinate does
 *    not round — it produces a second, distinct dot and a structurally broken
 *    grid, with no error raised. Where upstream relies on C's truncating
 *    integer division, use `Math.trunc`, never `/` (this bites in `floret`,
 *    whose basis vectors have negative components).
 * 2. **Emission order is observable.** Dot indices are assigned in
 *    first-encounter order, driven by these loops. `grid-differential.test.ts`
 *    compares indices, not just shapes, so reordering face emission within a
 *    cell is a behaviour change even when the resulting geometry is identical.
 *
 * The four aperiodic tilings (Penrose P2/P3, hats, spectres) are NOT here —
 * they are RNG-bearing and desc-round-tripping, and land in
 * `add-aperiodic-tilings`.
 */

import { Grid, GridDot, GridFace, makeConsistent } from "./grid-core.ts";

/**
 * The tiling types, **in upstream `GRIDGEN_LIST` order**. That order is
 * observable — it is what `grid_type` values mean — so entries may only be
 * appended, never reordered or inserted.
 *
 * Note that Loopy has its *own*, differently-ordered grid enum frozen into its
 * saved game IDs (`loopy.c` `GRIDLIST`), mapped onto this one by the game. The
 * two orderings are deliberately distinct; do not collapse them.
 */
export type GridType =
  | "square"
  | "honeycomb"
  | "triangular"
  | "snubsquare"
  | "cairo"
  | "greathexagonal"
  | "kagome"
  | "octagonal"
  | "kites"
  | "floret"
  | "dodecagonal"
  | "greatdodecagonal"
  | "greatgreatdodecagonal"
  | "compassdodecagonal"
  | "penrose_p2_kite"
  | "penrose_p3_thick"
  | "hats"
  | "spectres";

/** The 14 tilings implemented in this change; the other four are aperiodic. */
export const PERIODIC_GRID_TYPES = [
  "square",
  "honeycomb",
  "triangular",
  "snubsquare",
  "cairo",
  "greathexagonal",
  "kagome",
  "octagonal",
  "kites",
  "floret",
  "dodecagonal",
  "greatdodecagonal",
  "greatgreatdodecagonal",
  "compassdodecagonal",
] as const satisfies readonly GridType[];

/** The four aperiodic tilings: RNG-bearing, desc-round-tripping, and trimmed
 * before their incidence is derived. Their generators live in `tilings/`. */
export const APERIODIC_GRID_TYPES = [
  "penrose_p2_kite",
  "penrose_p3_thick",
  "hats",
  "spectres",
] as const satisfies readonly GridType[];

/** All 18 tilings, in `GRIDGEN_LIST` order. */
export const ALL_GRID_TYPES = [
  ...PERIODIC_GRID_TYPES,
  ...APERIODIC_GRID_TYPES,
] as const satisfies readonly GridType[];

/** A tiling's natural tile size and the extent of the patch it produces. */
export interface GridSize {
  tileSize: number;
  xExtent: number;
  yExtent: number;
}

// ---------------------------------------------------------------------------
// Tiling constants (upstream's #defines, kept under the same names).
// ---------------------------------------------------------------------------

const SQUARE_TILESIZE = 20;

export const HONEY_TILESIZE = 45;
/** Vector for side of hexagon — ratio is close to sqrt(3). */
export const HONEY_A = 15;
export const HONEY_B = 26;

export const TRIANGLE_TILESIZE = 18;
export const TRIANGLE_VEC_X = 15;
export const TRIANGLE_VEC_Y = 26;

export const SNUBSQUARE_TILESIZE = 18;
export const SNUBSQUARE_A = 15;
export const SNUBSQUARE_B = 26;

export const CAIRO_TILESIZE = 40;
export const CAIRO_A = 14;
export const CAIRO_B = 31;

export const GREATHEX_TILESIZE = 18;
export const GREATHEX_A = 15;
export const GREATHEX_B = 26;

export const KAGOME_TILESIZE = 18;
export const KAGOME_A = 15;
export const KAGOME_B = 26;

export const OCTAGONAL_TILESIZE = 40;
export const OCTAGONAL_A = 29;
export const OCTAGONAL_B = 41;

export const KITE_TILESIZE = 40;
export const KITE_A = 15;
export const KITE_B = 26;

export const FLORET_TILESIZE = 150;
export const FLORET_PX = 75;
export const FLORET_PY = -26;

export const DODEC_TILESIZE = 26;
export const DODEC_A = 15;
export const DODEC_B = 26;

// Aperiodic tilings. The generators live in `tilings/`; only their *sizes* and
// bounds are here, because size is a pure function of (width, height) that
// needs no patch built — and because the size arms must stay adjacent to the
// periodic ones they dispatch alongside.

export const PENROSE_TILESIZE = 100;

export const HATS_TILESIZE = 32;
export const HATS_XSQUARELEN = 4;
export const HATS_YSQUARELEN = 6;
export const HATS_XUNIT = 14;
export const HATS_YUNIT = 8;

export const SPECTRE_TILESIZE = 32;
export const SPECTRE_SQUARELEN = 7;
export const SPECTRE_UNIT = 8;

// ---------------------------------------------------------------------------
// Size computation — pure integer, needs no constructed grid.
// ---------------------------------------------------------------------------

/**
 * The natural tile size and extent of a periodic tiling, as a pure function of
 * `(type, width, height)`. Mirrors the `grid_size_*` family; the app sizes its
 * drawing surface from this before any grid exists.
 */
export function gridSizeFor(type: GridType, width: number, height: number): GridSize {
  switch (type) {
    case "square":
      return {
        tileSize: SQUARE_TILESIZE,
        xExtent: width * SQUARE_TILESIZE,
        yExtent: height * SQUARE_TILESIZE,
      };
    case "honeycomb":
      return {
        tileSize: HONEY_TILESIZE,
        xExtent: 3 * HONEY_A * (width - 1) + 4 * HONEY_A,
        yExtent: 2 * HONEY_B * (height - 1) + 3 * HONEY_B,
      };
    case "triangular":
      return {
        tileSize: TRIANGLE_TILESIZE,
        xExtent: (width + 1) * 2 * TRIANGLE_VEC_X,
        yExtent: height * TRIANGLE_VEC_Y,
      };
    case "snubsquare":
      return {
        tileSize: SNUBSQUARE_TILESIZE,
        xExtent:
          (SNUBSQUARE_A + SNUBSQUARE_B) * (width - 1) + SNUBSQUARE_A + SNUBSQUARE_B,
        yExtent:
          (SNUBSQUARE_A + SNUBSQUARE_B) * (height - 1) + SNUBSQUARE_A + SNUBSQUARE_B,
      };
    case "cairo":
      // CAIRO_A is unused in determining grid size.
      return {
        tileSize: CAIRO_TILESIZE,
        xExtent: 2 * CAIRO_B * (width - 1) + 2 * CAIRO_B,
        yExtent: 2 * CAIRO_B * (height - 1) + 2 * CAIRO_B,
      };
    case "greathexagonal":
      return {
        tileSize: GREATHEX_TILESIZE,
        xExtent: (3 * GREATHEX_A + GREATHEX_B) * (width - 1) + 4 * GREATHEX_A,
        yExtent:
          (2 * GREATHEX_A + 2 * GREATHEX_B) * (height - 1) +
          3 * GREATHEX_B +
          GREATHEX_A,
      };
    case "kagome":
      return {
        tileSize: KAGOME_TILESIZE,
        xExtent: 4 * KAGOME_A * (width - 1) + 6 * KAGOME_A,
        yExtent: 2 * KAGOME_B * (height - 1) + 2 * KAGOME_B,
      };
    case "octagonal":
      return {
        tileSize: OCTAGONAL_TILESIZE,
        xExtent: (2 * OCTAGONAL_A + OCTAGONAL_B) * width,
        yExtent: (2 * OCTAGONAL_A + OCTAGONAL_B) * height,
      };
    case "kites":
      return {
        tileSize: KITE_TILESIZE,
        xExtent: 4 * KITE_B * width + 2 * KITE_B,
        yExtent: 6 * KITE_A * (height - 1) + 8 * KITE_A,
      };
    case "floret": {
      // Math.trunc, not `/`: qy is negative, and C truncates toward zero.
      const px = FLORET_PX;
      const py = FLORET_PY;
      const qx = Math.trunc((4 * px) / 5);
      const qy = -py * 2;
      const ry = qy - py;
      // FLORET_RX is unused in determining grid size.
      let yExtent = (5 * qy - 4 * py) * (height - 1) + 4 * ry + 2 * qy;
      if (height === 1) yExtent += Math.trunc((5 * qy - 4 * py) / 2);
      return {
        tileSize: FLORET_TILESIZE,
        xExtent: Math.trunc((6 * px + 3 * qx) / 2) * (width - 1) + 4 * px + 2 * qx,
        yExtent,
      };
    }
    case "dodecagonal":
      return {
        tileSize: DODEC_TILESIZE,
        xExtent:
          (4 * DODEC_A + 2 * DODEC_B) * (width - 1) + 3 * (2 * DODEC_A + DODEC_B),
        yExtent:
          (3 * DODEC_A + 2 * DODEC_B) * (height - 1) + 2 * (2 * DODEC_A + DODEC_B),
      };
    case "greatdodecagonal":
      return {
        tileSize: DODEC_TILESIZE,
        xExtent:
          (6 * DODEC_A + 2 * DODEC_B) * (width - 1) +
          2 * (2 * DODEC_A + DODEC_B) +
          3 * DODEC_A +
          DODEC_B,
        yExtent:
          (3 * DODEC_A + 3 * DODEC_B) * (height - 1) + 2 * (2 * DODEC_A + DODEC_B),
      };
    case "greatgreatdodecagonal":
      return {
        tileSize: DODEC_TILESIZE,
        xExtent:
          (4 * DODEC_A + 4 * DODEC_B) * (width - 1) +
          2 * (2 * DODEC_A + DODEC_B) +
          2 * DODEC_A +
          2 * DODEC_B,
        yExtent:
          (6 * DODEC_A + 2 * DODEC_B) * (height - 1) + 2 * (2 * DODEC_A + DODEC_B),
      };
    case "compassdodecagonal":
      return {
        tileSize: DODEC_TILESIZE,
        xExtent: (4 * DODEC_A + 2 * DODEC_B) * width,
        yExtent: (4 * DODEC_A + 2 * DODEC_B) * height,
      };
    // The aperiodic tilings. Note both Penrose variants report the *same*
    // extent despite their different internal x/y units: the unit difference
    // only changes how many tiles land inside the fixed 100·w × 100·h box.
    case "penrose_p2_kite":
    case "penrose_p3_thick":
      return {
        tileSize: PENROSE_TILESIZE,
        xExtent: PENROSE_TILESIZE * width,
        yExtent: PENROSE_TILESIZE * height,
      };
    // Hats is the one tiling whose built grid is NOT re-centred into the
    // extent reported here: Penrose and spectres both force their bounding box
    // to match, hats keeps whatever survived trimming. So a hat grid's bbox
    // will generally differ from this. That asymmetry is upstream's and is
    // deliberate — don't "fix" it by adding a recentring step.
    case "hats":
      return {
        tileSize: HATS_TILESIZE,
        xExtent: width * HATS_XUNIT * HATS_XSQUARELEN,
        yExtent: height * HATS_YUNIT * HATS_YSQUARELEN,
      };
    case "spectres":
      return {
        tileSize: SPECTRE_TILESIZE,
        xExtent: width * SPECTRE_UNIT * SPECTRE_SQUARELEN,
        yExtent: height * SPECTRE_UNIT * SPECTRE_SQUARELEN,
      };
  }
}

// ---------------------------------------------------------------------------
// Parameter validation.
// ---------------------------------------------------------------------------

/** C's `INT_MAX` — the bound upstream's overflow guards are written against. */
const INT_MAX = 2147483647;

/**
 * Per-tiling bound on the number of objects a patch allocates, as a multiple
 * of the cell count. Taken from each `grid_validate_params_*`'s `max_dots` /
 * `max_faces` guard.
 *
 * `corners: true` means upstream bounds `(width+1) * (height+1)` — it counts
 * lattice corners, so a 1-cell grid still has 4 — where `false` bounds
 * `width * height`. The distinction changes the accepted/rejected boundary, so
 * it is carried per tiling rather than normalised away.
 */
const OBJECT_BOUND: Record<
  GridType,
  { multiplier: number; corners: boolean; extentUnit?: number }
> = {
  square: { multiplier: 1, corners: true },
  honeycomb: { multiplier: 2, corners: true },
  triangular: { multiplier: 4, corners: true },
  snubsquare: { multiplier: 3, corners: false },
  cairo: { multiplier: 2, corners: false },
  greathexagonal: { multiplier: 6, corners: true },
  kagome: { multiplier: 6, corners: true },
  octagonal: { multiplier: 4, corners: true },
  kites: { multiplier: 6, corners: true },
  floret: { multiplier: 9, corners: true },
  dodecagonal: { multiplier: 14, corners: false },
  greatdodecagonal: { multiplier: 200, corners: false },
  greatgreatdodecagonal: { multiplier: 300, corners: false },
  compassdodecagonal: { multiplier: 18, corners: false },

  // Aperiodic. `extentUnit` is upstream's `l` — see the note in
  // `gridValidateParams` on why these four don't use the forward extent.
  penrose_p2_kite: {
    multiplier: 3 * 3 * 4,
    corners: false,
    extentUnit: PENROSE_TILESIZE,
  },
  penrose_p3_thick: {
    multiplier: 3 * 3 * 4,
    corners: false,
    extentUnit: PENROSE_TILESIZE,
  },
  hats: { multiplier: 6, corners: false, extentUnit: HATS_TILESIZE },
  spectres: {
    multiplier: SPECTRE_SQUARELEN * SPECTRE_SQUARELEN,
    corners: false,
    extentUnit: SPECTRE_UNIT * SPECTRE_SQUARELEN,
  },
};

/**
 * Reject a grid size that is non-positive or unreasonably large. Mirrors
 * `grid_validate_params`; returns an error message, or `null` when the size is
 * acceptable.
 *
 * **Note what this does and does not enforce.** Upstream's per-type checks are
 * purely *maximum*-size guards. The per-type **minimum** sizes players actually
 * run into (Cairo needing one dimension ≥ 4, hats and spectres needing 6×6)
 * are not in `grid.c` at all — they live in the consuming game, as `amin`/`omin`
 * in Loopy's `GRIDLIST`. Geometry has no opinion on them.
 *
 * **Why keep the guards at all, when TS has no integer overflow?** Upstream
 * writes each check in divided form (`width > INT_MAX / k / height`) precisely
 * to avoid the `int` overflow it is testing for. TS numbers are doubles, so we
 * can compute the products directly — which is both clearer and exactly
 * equivalent. The guards are retained not for overflow, which cannot happen
 * here, but for the resource bound they incidentally provide: without them a
 * mistyped size silently tries to allocate hundreds of millions of objects.
 * `INT_MAX` is kept as the threshold so the accepted/rejected boundary stays
 * identical to the C's.
 *
 * **Wording divergence, recorded deliberately.** Upstream returns "Grid must
 * not be unreasonably large"; this returns "Grid size must not be unreasonably
 * large". Nothing compares these strings — they are surfaced to the player, not
 * to a fixture — and the extra word reads better next to a size the player just
 * typed. Noted so it stays a decision rather than becoming unexplained drift
 * from the reference.
 */
export function gridValidateParams(
  type: GridType,
  width: number,
  height: number,
): string | null {
  if (width <= 0 || height <= 0) return "Width and height must both be positive";

  const bound = OBJECT_BOUND[type];

  // Extent overflow. For the periodic tilings this is computed forward rather
  // than in upstream's divided form (see the doc comment) — equivalent, and it
  // reuses the size function the differential already proves against the C.
  //
  // The four aperiodic tilings need upstream's `l` instead, because there `l`
  // is *not* the reported extent: hats, for instance, guard on `width * 32`
  // while reporting an extent of `width * 56`. Computing forward would move the
  // accept/reject boundary (INT_MAX/56 rather than INT_MAX/32). Nothing real
  // sits near either threshold, but a silently different boundary is exactly
  // the kind of drift the differential cannot see, so match the C.
  if (bound.extentUnit !== undefined) {
    if (width > INT_MAX / bound.extentUnit || height > INT_MAX / bound.extentUnit) {
      return "Grid size must not be unreasonably large";
    }
  } else {
    const { xExtent, yExtent } = gridSizeFor(type, width, height);
    if (xExtent > INT_MAX || yExtent > INT_MAX) {
      return "Grid size must not be unreasonably large";
    }
  }

  const cells = bound.corners ? (width + 1) * (height + 1) : width * height;
  if (cells > INT_MAX / bound.multiplier) {
    return "Grid size must not be unreasonably large";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared generator scaffolding.
// ---------------------------------------------------------------------------

/**
 * Accumulates faces and deduplicated dots while a tiling is emitted, then
 * hands off to `makeConsistent`. Mirrors upstream's `grid_empty` +
 * `grid_get_dot` + `grid_face_add_new` + `grid_face_set_dot` quartet, with the
 * `tree234` point index replaced by a `Map` (a pure lookup — the tree's order
 * was never observable; see `grid-core.ts`).
 */
export class TilingBuilder {
  readonly grid = new Grid();
  private readonly points = new Map<string, GridDot>();

  constructor(tileSize: number) {
    this.grid.tileSize = tileSize;
  }

  /** The dot at exactly `(x, y)`, creating it on first encounter. */
  dot(x: number, y: number): GridDot {
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      // Fail loudly rather than silently splitting a shared corner in two.
      throw new Error(`grid: non-integer dot coordinate (${x}, ${y})`);
    }
    const key = `${x},${y}`;
    const existing = this.points.get(key);
    if (existing) return existing;
    const d = new GridDot(this.grid.dots.length, x, y);
    this.grid.dots.push(d);
    this.points.set(key, d);
    return d;
  }

  /**
   * Emit one face from its corner coordinates, **clockwise**. Pass the corners
   * in upstream's order for this tiling: the order is observable through dot
   * indices and through each face's edge ring.
   */
  face(...corners: [number, number][]): void {
    const f = new GridFace(
      this.grid.faces.length,
      corners.length,
      corners.map(([x, y]) => this.dot(x, y)),
    );
    this.grid.faces.push(f);
  }

  /** Link the grid up and return it. */
  finish(): Grid {
    makeConsistent(this.grid);
    return this.grid;
  }
}

// ---------------------------------------------------------------------------
// The tilings.
// ---------------------------------------------------------------------------

/**
 * Square tiling: one four-dot face per cell at `(a·x, a·y)`.
 * Mirrors `grid_new_square`.
 */
export function gridNewSquare(width: number, height: number): Grid {
  const a = SQUARE_TILESIZE;
  const b = new TilingBuilder(a);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = a * x;
      const py = a * y;
      b.face([px, py], [px + a, py], [px + a, py + a], [px, py + a]);
    }
  }
  return b.finish();
}
