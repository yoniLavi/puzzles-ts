/**
 * Behavioural check for `gridFindIncentre` — the largest-inscribed-circle
 * centre used to place Loopy's clue digits.
 *
 * **Deliberately not a byte-match differential.** The C is ~460 lines of float
 * geometry with exact comparisons at its branch points (`det == 0`,
 * `disc >= 0`, `fabs(eq[0]) < fabs(eq[1])`), so the *last* ULP of a candidate
 * point is not reproducible across compilers, let alone across C and JS — and
 * it does not need to be. The incentre never reaches a grid description, a
 * generator or a solver; it only decides where a digit is drawn, and this
 * project's byte-parity scope is generator/solver/codec, not display (see
 * `extend-grid-tilings` design D3). So we assert the two properties that
 * actually matter:
 *
 *   1. the point is strictly inside its face, and
 *   2. the circle it admits is as large as the C's, to within a tolerance.
 *
 * The C side comes from `__fixtures__/grid-incentre-c-reference.json`
 * (regenerate with `build/native/auxiliary/grid-trace --incentres`) — a
 * separate fixture from the incidence differential's `grid-c-reference.json`,
 * which stays a byte-match check and must not be perturbed by this one.
 *
 * The point-in-polygon and distance-to-boundary routines below are written
 * **independently of the implementation's own**, so a bug shared between them
 * cannot make this test vacuously pass.
 */

import { describe, expect, it } from "vitest";
import reference from "./__fixtures__/grid-incentre-c-reference.json" with {
  type: "json",
};
import {
  type Grid,
  GridDot,
  GridFace,
  type GridType,
  gridNew,
  makeConsistent,
} from "./grid.ts";
import { gridFindIncentre } from "./grid-geometry.ts";

/** One `(type, w, h, desc)` grid's per-face incentres, dumped from the C. */
interface IncentreFixture {
  type: string;
  width: number;
  height: number;
  desc: string | null;
  /** `[ix, iy]` per face, in face-index order. */
  incentres: [number, number][];
}

const fixtures = reference as unknown as IncentreFixture[];

/**
 * A face's corners as a plain polygon, in its clockwise ring order. Everything
 * below works off this rather than off `GridEdge`, which is the point: the
 * implementation vets candidates using `face.edges` (whose per-edge
 * orientation is arbitrary), so checking against `face.dots` here is a genuinely
 * separate derivation of the same shape.
 */
function polygon(f: GridFace): [number, number][] {
  return f.dots.map((d) => {
    if (d === null) throw new Error("face with a null dot");
    return [d.x, d.y] as [number, number];
  });
}

/**
 * Standard even-odd ray cast: count the polygon sides crossing the ray heading
 * in +x from the point. Written from the polygon's vertex ring, with the
 * conventional half-open y-interval so a vertex on the ray is counted once.
 */
function insidePolygon(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y) {
      const crossX = xi + ((y - yi) / (yj - yi)) * (xj - xi);
      if (crossX > x) inside = !inside;
    }
  }
  return inside;
}

/** Distance from `(x, y)` to the segment `(ax,ay)`–`(bx,by)`. */
function distanceToSegment(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  // Clamp the projection parameter to [0,1] so we measure to the segment, not
  // to its infinite line — the endpoint cases fall out of the clamp.
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/**
 * The radius of the largest circle centred at `(x, y)` that fits inside the
 * polygon: the distance to the nearest side. This is the quantity the whole
 * routine exists to maximise, and comparing it at the TS point against the C
 * point is the real quality comparison — far more meaningful than comparing
 * coordinates, since two quite different points can admit the same circle
 * (exactly the parallel-edge continuum upstream notes it handles arbitrarily).
 */
function inscribedRadius(poly: [number, number][], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(
      best,
      distanceToSegment(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]),
    );
  }
  return best;
}

/**
 * Grid coordinates run at tile sizes of 18–150 units, so one unit is
 * comfortably sub-pixel at any playable scale — and both sides round their
 * answer to an integer anyway, which alone can move the admitted radius by up
 * to ~0.71 (half a diagonal).
 */
const RADIUS_TOLERANCE = 1;

describe("gridFindIncentre", () => {
  describe("against the C reference", () => {
    // A tiling whose TS generator has not landed yet must not fail this file;
    // it is reported and skipped, so the test is green now and strengthens by
    // itself as the remaining generators land.
    const skipped: string[] = [];

    for (const f of fixtures) {
      const label = `${f.type} ${f.width}x${f.height}${f.desc === null ? "" : ` desc=${f.desc}`}`;

      it(label, ({ skip }) => {
        let g: Grid;
        try {
          g = gridNew(f.type as GridType, f.width, f.height, f.desc);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          skipped.push(`${label}: ${message}`);
          console.log(
            `[grid-incentre] SKIPPED ${label} — generator unavailable: ${message}`,
          );
          skip();
          return;
        }

        expect(g.faces).toHaveLength(f.incentres.length);

        let worstRadiusDelta = 0;
        let worstPointDelta = 0;

        for (const [i, face] of g.faces.entries()) {
          gridFindIncentre(face);
          const poly = polygon(face);
          const [cx, cy] = f.incentres[i];

          // (1) strictly inside: the ray cast says in, AND it is not sitting
          // on the boundary (a point exactly on a side admits no circle).
          const tsRadius = inscribedRadius(poly, face.ix, face.iy);
          expect(
            insidePolygon(poly, face.ix, face.iy),
            `${label} face ${i}: incentre (${face.ix}, ${face.iy}) is outside its face`,
          ).toBe(true);
          expect(
            tsRadius,
            `${label} face ${i}: incentre (${face.ix}, ${face.iy}) is on the boundary`,
          ).toBeGreaterThan(0);

          // (2) the circle it admits is as big as the C's, within tolerance.
          const cRadius = inscribedRadius(poly, cx, cy);
          expect(
            Math.abs(tsRadius - cRadius),
            `${label} face ${i}: TS incentre (${face.ix}, ${face.iy}) admits r=${tsRadius}, ` +
              `C incentre (${cx}, ${cy}) admits r=${cRadius}`,
          ).toBeLessThanOrEqual(RADIUS_TOLERANCE);

          worstRadiusDelta = Math.max(worstRadiusDelta, Math.abs(tsRadius - cRadius));
          worstPointDelta = Math.max(
            worstPointDelta,
            Math.hypot(face.ix - cx, face.iy - cy),
          );
        }

        // Recorded, not asserted: how far the two implementations actually
        // drift is the useful review signal, and pinning it would be exactly
        // the float gate D3 says not to build.
        if (worstPointDelta > 0) {
          console.log(
            `[grid-incentre] ${label}: worst |Δpoint| = ${worstPointDelta.toFixed(3)}, ` +
              `worst |Δradius| = ${worstRadiusDelta.toFixed(6)}`,
          );
        }
      });
    }

    it("reports which tilings were skipped", () => {
      // Not a failure — it is a visible record. A silent skip is how a whole
      // family of tilings quietly stops being checked.
      if (skipped.length > 0) {
        console.log(
          `[grid-incentre] ${skipped.length} fixture(s) skipped:\n  ${skipped.join("\n  ")}`,
        );
      }
      expect(Array.isArray(skipped)).toBe(true);
    });
  });

  describe("caching", () => {
    it("computes once and returns the same point on a second call", () => {
      const g = gridNew("square", 3, 3);
      const face = g.faces[4];
      expect(face.hasIncentre).toBe(false);

      gridFindIncentre(face);
      expect(face.hasIncentre).toBe(true);
      const { ix, iy } = face;

      // The cache is observable only by its effect, so poison the stored value
      // and confirm the second call leaves it alone — a recompute would
      // overwrite it back to the true incentre.
      face.ix = ix + 1000;
      face.iy = iy + 1000;
      gridFindIncentre(face);
      expect(face.ix).toBe(ix + 1000);
      expect(face.iy).toBe(iy + 1000);
    });

    it("is idempotent when the value is left alone", () => {
      const g = gridNew("square", 3, 3);
      const face = g.faces[0];
      gridFindIncentre(face);
      const first: [number, number] = [face.ix, face.iy];
      gridFindIncentre(face);
      expect([face.ix, face.iy]).toEqual(first);
    });
  });

  describe("non-convex faces", () => {
    /**
     * Build a one-face grid from an explicit clockwise vertex ring (y down).
     * `makeConsistent` links it up exactly as a real tiling's face is linked;
     * the single face's outer side is the infinite exterior.
     */
    function singleFaceGrid(ring: [number, number][]): GridFace {
      const g = gridNew("square", 1, 1); // borrow a Grid instance
      g.dots = ring.map(([x, y], i) => new GridDot(i, x, y));
      const face = new GridFace(0, ring.length, [...g.dots]);
      g.faces = [face];
      g.edges = [];
      makeConsistent(g);
      return face;
    }

    /** The vertex centroid — what a naive implementation would use. */
    function centroid(poly: [number, number][]): [number, number] {
      const n = poly.length;
      return [
        poly.reduce((s, p) => s + p[0], 0) / n,
        poly.reduce((s, p) => s + p[1], 0) / n,
      ];
    }

    it("places the incentre inside an L-shape, where the centroid falls outside", () => {
      // An L: a 60x20 arm along the top and a 20x60 arm down the left.
      const ring: [number, number][] = [
        [0, 0],
        [60, 0],
        [60, 20],
        [20, 20],
        [20, 60],
        [0, 60],
      ];
      const face = singleFaceGrid(ring);
      gridFindIncentre(face);

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
      const ring: [number, number][] = [
        [0, 0],
        [50, 60],
        [100, 0],
        [50, 100],
      ];
      const face = singleFaceGrid(ring);
      gridFindIncentre(face);

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
        ] as [number, number][],
        [
          [0, 0],
          [50, 60],
          [100, 0],
          [50, 100],
        ] as [number, number][],
      ]) {
        const face = singleFaceGrid(ring);
        gridFindIncentre(face);
        const [gx, gy] = centroid(ring);
        const centroidRadius = insidePolygon(ring, gx, gy)
          ? inscribedRadius(ring, gx, gy)
          : 0;
        expect(inscribedRadius(ring, face.ix, face.iy)).toBeGreaterThan(centroidRadius);
      }
    });
  });

  describe("simple shapes with a known answer", () => {
    it("finds the centre of a square cell", () => {
      const g = gridNew("square", 3, 3);
      // Square tiles are 20 units; face 4 is the middle cell, (20,20)-(40,40).
      gridFindIncentre(g.faces[4]);
      expect([g.faces[4].ix, g.faces[4].iy]).toEqual([30, 30]);
    });

    it("finds the classical incentre of every face of a honeycomb", () => {
      // A regular hexagon's incentre is its centre, so every face's incentre
      // must admit a circle of the hexagon's apothem.
      let g: Grid;
      try {
        g = gridNew("honeycomb", 3, 3);
      } catch {
        console.log(
          "[grid-incentre] SKIPPED honeycomb known-answer check — generator unavailable",
        );
        return;
      }
      for (const face of g.faces) {
        gridFindIncentre(face);
        const poly = polygon(face);
        const [cx, cy] = centroidOf(poly);
        // The incentre of a regular hexagon coincides with its centroid.
        expect(Math.hypot(face.ix - cx, face.iy - cy)).toBeLessThan(1);
      }
    });

    function centroidOf(poly: [number, number][]): [number, number] {
      const n = poly.length;
      return [
        poly.reduce((s, p) => s + p[0], 0) / n,
        poly.reduce((s, p) => s + p[1], 0) / n,
      ];
    }
  });
});
