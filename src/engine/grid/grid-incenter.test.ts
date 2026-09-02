/**
 * `gridFindIncenter` — the largest-inscribed-circle center used to place
 * Loopy's clue digits — swept over **every face of every tiling** and measured
 * against the best circle the integer lattice actually admits.
 *
 * ## The yardstick is the truth, not a peer
 *
 * This file used to compare against `__fixtures__/grid-incenter-c-reference.json`,
 * a frozen capture of where the C put each digit, asserting only
 * `|r_TS − r_C| ≤ 1`. That bar is green whenever the two implementations agree
 * — *including when they are both wrong* — and it was not tightenable, because
 * its tolerance existed to absorb the peer's error rather than this code's.
 * `bestByBruteForce` replaces it with the quantity the routine exists to
 * maximize, computed from the vertex ring alone (`engine/testing/polygon-yardstick.ts`),
 * so it cannot share a bug with the thing it measures.
 *
 * That swap immediately found something the C comparison structurally could
 * not: the stored point was rounded with the C's `(int)(v + 0.5)`, which is not
 * round-to-nearest on the negative coordinates a grid mostly has. The C is off
 * the same way, so every face passed. See `grid-geometry.ts`'s rounding comment.
 *
 * ## What the numbers below mean
 *
 * `bestByBruteForce` sweeps the same integer lattice the answer is quantized
 * onto, so it is by construction an upper bound on what any stored incenter can
 * admit, and the shortfall measures the **search** with no rounding term in it.
 * Two complementary bounds are asserted per face, because they fail differently:
 * an absolute one catches a point nudged off the optimum (the rounding defect
 * above trips it at 1.229), a relative one catches a search that settled
 * somewhere else entirely — measuring an edge's *infinite line* rather than the
 * edge understates the room beside a reflex corner and scores 0.64.
 *
 * The cases are enumerated from `ALL_GRID_TYPES`, not from a fixture list, so a
 * newly added tiling joins the sweep by existing rather than by someone
 * remembering. That is also why the four aperiodic tilings are covered here for
 * the first time: their descs come from `gridNewDesc` under a fixed seed, which
 * needs no capture at all — and hats and spectres are the most non-convex faces
 * the collection has, which is precisely where this routine is hard.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../random/index.ts";
import {
  bestByBruteForce,
  inscribedRadius,
  insidePolygon,
  type Ring,
} from "../testing/polygon-yardstick.ts";
import { gridFindIncenter } from "./grid-geometry.ts";
import {
  ALL_GRID_TYPES,
  APERIODIC_GRID_TYPES,
  type Grid,
  GridDot,
  GridFace,
  type GridType,
  gridNew,
  gridNewDesc,
  makeConsistent,
} from "./index.ts";

/**
 * A face's corners as a plain polygon, in its clockwise ring order. Everything
 * below works off this rather than off `GridEdge`, which is the point: the
 * implementation vets candidates using `face.edges` (whose per-edge orientation
 * is arbitrary), so checking against `face.dots` here is a genuinely separate
 * derivation of the same shape.
 */
function polygon(f: GridFace): Ring {
  return f.dots.map((d) => {
    if (d === null) throw new Error("face with a null dot");
    return [d.x, d.y] as [number, number];
  });
}

/**
 * Every tiling, at three sizes each — the shapes a tiling produces vary with
 * how the pattern meets the board edge, so one size per tiling would miss the
 * partial faces at the fringe.
 *
 * The sizes for the fourteen periodic tilings are the ones the retired C
 * capture used, kept so this sweep covers at least what it covered. The
 * aperiodic four are new here; Penrose runs at 4x4 because kite/dart at width 3
 * has no generable patch at any height (`add-loopy-ts-port` D1).
 */
const CASES: [GridType, number, number][] = [
  ["square", 3, 3],
  ["square", 5, 5],
  ["square", 5, 3],
  ["honeycomb", 3, 3],
  ["honeycomb", 5, 5],
  ["honeycomb", 3, 5],
  ["triangular", 3, 3],
  ["triangular", 5, 4],
  ["triangular", 4, 5],
  ["snubsquare", 3, 3],
  ["snubsquare", 5, 5],
  ["snubsquare", 4, 6],
  ["cairo", 3, 4],
  ["cairo", 5, 5],
  ["cairo", 4, 6],
  ["greathexagonal", 3, 3],
  ["greathexagonal", 5, 4],
  ["greathexagonal", 4, 5],
  ["kagome", 3, 3],
  ["kagome", 5, 4],
  ["kagome", 4, 5],
  ["octagonal", 3, 3],
  ["octagonal", 5, 5],
  ["octagonal", 4, 6],
  ["kites", 3, 3],
  ["kites", 4, 4],
  ["kites", 3, 5],
  ["floret", 1, 2],
  ["floret", 3, 3],
  ["floret", 2, 4],
  ["dodecagonal", 2, 2],
  ["dodecagonal", 4, 4],
  ["dodecagonal", 3, 5],
  ["greatdodecagonal", 2, 2],
  ["greatdodecagonal", 4, 4],
  ["greatdodecagonal", 3, 5],
  ["greatgreatdodecagonal", 2, 2],
  ["greatgreatdodecagonal", 4, 4],
  ["greatgreatdodecagonal", 3, 5],
  ["compassdodecagonal", 2, 2],
  ["compassdodecagonal", 4, 4],
  ["compassdodecagonal", 3, 5],
  ["penrose_p2_kite", 4, 4],
  ["penrose_p3_thick", 4, 4],
  ["hats", 3, 3],
  ["spectres", 3, 3],
];

/**
 * Build one case's grid. The aperiodic four need a desc recording the
 * generator's random choices, and some seeds produce a patch that trims away to
 * nothing — a documented outcome upstream aborts on, which this port recovers
 * from by retrying. So retry here too, and fail loudly if no seed works rather
 * than quietly dropping the tiling from the sweep.
 */
function gridFor(type: GridType, w: number, h: number): Grid {
  if (!(APERIODIC_GRID_TYPES as readonly string[]).includes(type)) {
    // `triangular` is the one periodic tiling taking a desc: "0" selects the
    // ear-trimmed algorithm, which is what Loopy plays on.
    return gridNew(type, w, h, type === "triangular" ? "0" : null);
  }
  for (let s = 0; s < 40; s++) {
    try {
      return gridNew(type, w, h, gridNewDesc(type, w, h, randomNew(`incentre-${s}`)));
    } catch {
      // Degenerate patch for this seed; try the next.
    }
  }
  throw new Error(`no seed in 0..39 produced a generable ${type} ${w}x${h} patch`);
}

/**
 * The most a stored incenter may fall short of the best the lattice admits.
 *
 * Not a fitted number: the search returns a point on the continuous optimum and
 * the store rounds each axis by at most 0.5, so the displacement is at most
 * 1/√2 ≈ 0.707 and the radius — being 1-Lipschitz in the point — can lose at
 * most that much. The measured worst across all 1,816 faces is **0.053**, an
 * order of magnitude inside the bound, which says the search is finding the
 * true optimum rather than merely a good candidate.
 *
 * A regression that reintroduces the C's `(int)(v + 0.5)` truncation measures
 * 1.229 and fails this.
 */
const MAX_RADIUS_SHORTFALL = 0.71;

/**
 * And the relative floor, which fails on a different shape of defect: a search
 * that settles on a *different* point rather than a nudged one. On a small face
 * a wrong point can be within a unit absolutely while being visibly off-center.
 *
 * Verified against a real defect rather than guessed at: measuring the room to
 * an edge's *infinite line* instead of to the edge scores ≈0.64 here and fails
 * two tilings. Not every enumeration defect reaches this file — restricting the
 * 3-subset walk to subsets containing an edge changes no tiling's answer at all,
 * which is why `grid-geometry.test.ts` carries hand-built shapes as well.
 */
const MIN_RADIUS_RATIO = 0.9;

describe("gridFindIncenter", () => {
  describe("against the best circle the lattice admits", () => {
    for (const [type, w, h] of CASES) {
      const label = `${type} ${w}x${h}`;

      it(label, () => {
        const g = gridFor(type, w, h);

        // How many things did I look at? A sweep that iterates zero faces
        // passes every assertion inside it, so the count is asserted before
        // any of them. `grid-differential.test.ts` pins the exact face list far
        // more strongly; this only has to make the loop's emptiness visible.
        expect(g.faces.length).toBeGreaterThan(0);

        let worstShortfall = 0;
        let worstRatio = 1;

        for (const face of g.faces) {
          gridFindIncenter(face);
          const poly = polygon(face);
          const got = inscribedRadius(poly, face.ix, face.iy);
          const best = bestByBruteForce(poly);

          // (1) strictly inside: the ray cast says in, AND it is not sitting on
          // the boundary (a point exactly on a side admits no circle).
          expect(
            insidePolygon(poly, face.ix, face.iy),
            `${label} face ${face.index}: incentre (${face.ix}, ${face.iy}) is outside its face`,
          ).toBe(true);
          expect(
            got,
            `${label} face ${face.index}: incentre (${face.ix}, ${face.iy}) is on the boundary`,
          ).toBeGreaterThan(0);

          // (2) the circle it admits is as large as the lattice allows.
          expect(
            best - got,
            `${label} face ${face.index}: incentre (${face.ix}, ${face.iy}) admits ` +
              `r=${got.toFixed(3)}, but some integer point of the face admits ${best.toFixed(3)}`,
          ).toBeLessThanOrEqual(MAX_RADIUS_SHORTFALL);
          expect(
            got / best,
            `${label} face ${face.index}: incentre (${face.ix}, ${face.iy}) admits ` +
              `only ${((got / best) * 100).toFixed(1)}% of the achievable radius`,
          ).toBeGreaterThan(MIN_RADIUS_RATIO);

          worstShortfall = Math.max(worstShortfall, best - got);
          worstRatio = Math.min(worstRatio, got / best);
        }

        // Recorded, not asserted: how much room the tiling's worst face leaves
        // on the table is the useful review signal, and pinning it per tiling
        // would be a float gate on display code.
        if (worstShortfall > 0.01) {
          console.log(
            `[grid-incenter] ${label}: worst shortfall ${worstShortfall.toFixed(4)} ` +
              `(${(worstRatio * 100).toFixed(2)}% of achievable) over ${g.faces.length} faces`,
          );
        }
      });
    }

    it("covers every tiling the barrel offers", () => {
      // The enumeration above is a literal list, so it can fall behind
      // `ALL_GRID_TYPES`. A tiling added without a case here would otherwise be
      // silently unswept — the failure mode the retired fixture's skip scaffold
      // had by construction.
      expect(new Set(CASES.map(([type]) => type))).toEqual(new Set(ALL_GRID_TYPES));
    });
  });

  describe("caching", () => {
    it("computes once and returns the same point on a second call", () => {
      const g = gridNew("square", 3, 3);
      const face = g.faces[4];
      expect(face.hasIncenter).toBe(false);

      gridFindIncenter(face);
      expect(face.hasIncenter).toBe(true);
      const { ix, iy } = face;

      // The cache is observable only by its effect, so poison the stored value
      // and confirm the second call leaves it alone — a recompute would
      // overwrite it back to the true incenter.
      face.ix = ix + 1000;
      face.iy = iy + 1000;
      gridFindIncenter(face);
      expect(face.ix).toBe(ix + 1000);
      expect(face.iy).toBe(iy + 1000);
    });

    it("is idempotent when the value is left alone", () => {
      const g = gridNew("square", 3, 3);
      const face = g.faces[0];
      gridFindIncenter(face);
      const first: [number, number] = [face.ix, face.iy];
      gridFindIncenter(face);
      expect([face.ix, face.iy]).toEqual(first);
    });
  });

  describe("non-convex faces", () => {
    /**
     * Build a one-face grid from an explicit clockwise vertex ring (y down).
     * `makeConsistent` links it up exactly as a real tiling's face is linked;
     * the single face's outer side is the infinite exterior.
     */
    function singleFaceGrid(ring: Ring): GridFace {
      const g = gridNew("square", 1, 1); // borrow a Grid instance
      g.dots = ring.map(([x, y], i) => new GridDot(i, x, y));
      const face = new GridFace(0, ring.length, [...g.dots]);
      g.faces = [face];
      g.edges = [];
      makeConsistent(g);
      return face;
    }

    /** The vertex centroid — what a naive implementation would use. */
    function centroid(poly: Ring): [number, number] {
      const n = poly.length;
      return [
        poly.reduce((s, p) => s + p[0], 0) / n,
        poly.reduce((s, p) => s + p[1], 0) / n,
      ];
    }

    it("places the incentre inside an L-shape, where the centroid falls outside", () => {
      // An L: a 60x20 arm along the top and a 20x60 arm down the left.
      const ring: Ring = [
        [0, 0],
        [60, 0],
        [60, 20],
        [20, 20],
        [20, 60],
        [0, 60],
      ];
      const face = singleFaceGrid(ring);
      gridFindIncenter(face);

      // The centroid is the case that motivates porting the real algorithm:
      // it lands in the notch, outside the polygon entirely.
      const [gx, gy] = centroid(ring);
      expect(insidePolygon(ring, gx, gy)).toBe(false);

      expect(insidePolygon(ring, face.ix, face.iy)).toBe(true);
      // Each arm is 20 wide, so the biggest circle anywhere inside has r=10.
      expect(inscribedRadius(ring, face.ix, face.iy)).toBeGreaterThan(9.5);
    });

    it("places the incentre inside a chevron, where the centroid falls outside", () => {
      // An arrowhead pointing down: a deep reflex vertex at the top middle.
      const ring: Ring = [
        [0, 0],
        [50, 60],
        [100, 0],
        [50, 100],
      ];
      const face = singleFaceGrid(ring);
      gridFindIncenter(face);

      const [gx, gy] = centroid(ring);
      expect(insidePolygon(ring, gx, gy)).toBe(false);

      expect(insidePolygon(ring, face.ix, face.iy)).toBe(true);
      expect(inscribedRadius(ring, face.ix, face.iy)).toBeGreaterThan(0);
    });

    it("beats the centroid on the largest circle it admits, for both shapes", () => {
      for (const ring of [
        [
          [0, 0],
          [60, 0],
          [60, 20],
          [20, 20],
          [20, 60],
          [0, 60],
        ] as Ring,
        [
          [0, 0],
          [50, 60],
          [100, 0],
          [50, 100],
        ] as Ring,
      ]) {
        const face = singleFaceGrid(ring);
        gridFindIncenter(face);
        const [gx, gy] = centroid(ring);
        const centroidRadius = inscribedRadius(ring, gx, gy);
        expect(inscribedRadius(ring, face.ix, face.iy)).toBeGreaterThan(centroidRadius);
      }
    });
  });

  describe("simple shapes with a known answer", () => {
    it("finds the centre of a square cell", () => {
      const g = gridNew("square", 3, 3);
      // Square tiles are 20 units; face 4 is the middle cell, (20,20)-(40,40).
      gridFindIncenter(g.faces[4]);
      expect([g.faces[4].ix, g.faces[4].iy]).toEqual([30, 30]);
    });

    it("finds the classical incentre of every face of a honeycomb", () => {
      // A regular hexagon's incenter is its center, so every face's incenter
      // must admit a circle of the hexagon's apothem.
      const g = gridNew("honeycomb", 3, 3);
      for (const face of g.faces) {
        gridFindIncenter(face);
        const poly = polygon(face);
        const n = poly.length;
        const cx = poly.reduce((s, p) => s + p[0], 0) / n;
        const cy = poly.reduce((s, p) => s + p[1], 0) / n;
        // The incenter of a regular hexagon coincides with its centroid.
        expect(Math.hypot(face.ix - cx, face.iy - cy)).toBeLessThan(1);
      }
    });
  });
});
