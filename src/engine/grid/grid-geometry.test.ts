/**
 * `grid-geometry.ts` — the grid module's only floating-point code, and the
 * boundary that makes it safe.
 *
 * **Both helpers are display/input only.** `gridNearestEdge` decides which edge
 * a click lands on; `gridFindIncentre` decides where a clue digit is drawn.
 * Neither reaches a grid description, a generator or a solver, so neither is
 * byte-parity surface, and the exact comparisons at this module's branch points
 * (`det === 0`, `disc >= 0`, `Math.abs(eq[0]) < Math.abs(eq[1])`) are not
 * reproducible across compilers and do not need to be. What must hold is
 * behavioural: a click picks the edge a player meant, and a digit lands inside
 * its face with room around it.
 *
 * Coverage of this module is deliberately spread over three files, and this one
 * is the named home:
 *
 * - `grid.test.ts` drives `gridNearestEdge` through the barrel — the eligibility
 *   rules, the vertex case and the lowest-index tie-break.
 * - `grid-incentre.test.ts` compares `gridFindIncentre` against a frozen C
 *   capture *by property* (inside the face, and the circle it admits is as large
 *   as the C's), plus caching, non-convex shapes and two known answers.
 * - here: the cases neither of those reaches — a click that is perpendicularly
 *   near an edge but nowhere near the board, the rounding of the stored point,
 *   a face with no interior at all, and the two shapes that exercise parts of
 *   the candidate enumeration a tiling does not happen to need.
 */

import { describe, expect, it } from "vitest";
import { gridFindIncentre, gridNearestEdge } from "./grid-geometry.ts";
import { GridDot, GridFace, gridNew, gridNewSquare, makeConsistent } from "./index.ts";

/**
 * A one-face grid from an explicit clockwise vertex ring (y down), linked up by
 * `makeConsistent` exactly as a real tiling's face is. The single face's outer
 * side is the infinite exterior.
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

/** Distance from `(x, y)` to the segment `(ax,ay)`–`(bx,by)`, written from the
 * vertex ring rather than from the implementation's edge list. */
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
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Standard even-odd ray cast, written from the vertex ring. */
function insidePolygon(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y) {
      if (xi + ((y - yi) / (yj - yi)) * (xj - xi) > x) inside = !inside;
    }
  }
  return inside;
}

/** The radius of the largest circle centred at `(x, y)` that fits inside the
 * polygon — the quantity the incentre exists to maximise. Zero outside it. */
function inscribedRadius(poly: [number, number][], x: number, y: number): number {
  if (!insidePolygon(poly, x, y)) return 0;
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
 * The best {@link inscribedRadius} over every integer point of the polygon's
 * bounding box — a brute-force yardstick owing nothing to the implementation.
 * Slow by construction and used on a handful of small shapes; the point is that
 * it cannot share a bug with the thing it is measuring.
 */
function bestByBruteForce(poly: [number, number][]): number {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  let best = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      best = Math.max(best, inscribedRadius(poly, x, y));
    }
  }
  return best;
}

/**
 * A deterministic family of markedly non-convex polygons: vertices at equal
 * angles, radii varying wildly, so reflex corners and long thin arms both turn
 * up. Each is seeded from its own index, so a case can be read and re-run on its
 * own. The generalisation to arbitrary polygons is a stated property of the
 * routine — several tilings produce faces where a centroid sits outside the
 * face — so it is checked over arbitrary polygons.
 */
function awkwardPolygon(n: number): [number, number][] {
  let s = (n * 2654435761) % 2147483647;
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s >>> 8) / 8388608;
  };
  const order = 4 + (n % 6);
  const ring: [number, number][] = [];
  for (let k = 0; k < order; k++) {
    const r = 20 + Math.floor(rnd() * 100);
    const a = (2 * Math.PI * k) / order;
    ring.push([Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))]);
  }
  return ring;
}

describe("gridNearestEdge", () => {
  it("rejects a click square-on to an edge but nowhere near the board", () => {
    // The acute-angle rules alone do not catch this one, which is why the
    // half-edge-length cut exists: square-on to an edge's midpoint the triangle
    // is acute at both of its dots however far away the point is, so without the
    // cut the edge stays "eligible" from 500 units off the board. The cut
    // confines a hit to the circle that has the edge as its diameter. The board
    // spans (0,0)–(60,60); (10, 71) is 11 units below the bottom edge's midpoint,
    // just past the 10 units that edge admits.
    const g = gridNewSquare(3, 3); // square tiles, 20 units
    expect(gridNearestEdge(g, 10, 60)).not.toBeNull(); // on the edge itself
    expect(gridNearestEdge(g, 10, 71)).toBeNull(); // just past the radius
    expect(gridNearestEdge(g, 10, 500)).toBeNull(); // and far beyond it
  });
});

describe("gridFindIncentre", () => {
  it("rounds the stored point to the nearest integer rather than truncating", () => {
    // A right isosceles triangle with legs of 10: its inradius is
    // (10 + 10 − √200) / 2 ≈ 2.929, and the incentre sits at (r, r). Truncating
    // stores (2, 2); rounding stores (3, 3), which is the nearer point and — on
    // the negative coordinates real tilings produce — the difference between
    // rounding and `Math.floor` too.
    const face = singleFaceGrid([
      [0, 0],
      [10, 0],
      [0, 10],
    ]);
    gridFindIncentre(face);
    expect([face.ix, face.iy]).toEqual([3, 3]);
  });

  it("fails loudly on a face with no interior at all", () => {
    // Three collinear dots enclose nothing, so no candidate point is ever inside
    // and the best distance stays zero. Returning quietly would store the origin
    // — a clue digit drawn at the top-left corner of the board, with nothing to
    // say it is wrong.
    const face = singleFaceGrid([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    expect(() => gridFindIncentre(face)).toThrow(/no interior point/);
  });

  it("beats a brute-force sweep on every shape of an awkward family", () => {
    // The property the whole routine exists for, checked against a yardstick
    // that shares none of its machinery: the point it picks must admit a circle
    // essentially as large as the best any integer point of the face admits.
    //
    // This is what catches a *mis-measurement* as opposed to a wrong search.
    // Measuring the room to the infinite line an edge lies on, rather than to
    // the edge itself, looks harmless — the corner loop has already accounted
    // for the endpoints — and on a convex face it is, because the perpendicular
    // foot from an interior point always lands on the edge. Give the face a
    // reflex corner and it stops being true, the room is understated, and the
    // search settles for a visibly worse point: 0.64 of the achievable radius
    // on the worst member below, against 0.97 for the code as written.
    for (let n = 0; n < 24; n++) {
      const ring = awkwardPolygon(n);
      const face = singleFaceGrid(ring);
      gridFindIncentre(face);

      const best = bestByBruteForce(ring);
      const got = inscribedRadius(ring, face.ix, face.iy);
      expect(best).toBeGreaterThan(0);
      // Not equality: the stored point is rounded to whole units, and upstream
      // picks an arbitrary end of the continuum where parallel edges leave one.
      expect(got / best).toBeGreaterThan(0.95);
    }
  });

  it("considers the candidate points held in place by three vertices", () => {
    // Where the largest circle touches three *vertices* and no edge, only the
    // arm of the 3-subset enumeration that takes three dots produces it — and
    // that arm is reached only when the subset's lowest index may be a dot. No
    // periodic tiling needs it, so nothing else here would notice it going.
    //
    // Provenance: swept for. Restricting the enumeration to subsets containing
    // an edge changes the answer on 5 of 400 members of the family above; this
    // is the shape with the widest margin, frozen so the case is deterministic.
    const ring: [number, number][] = [
      [84, 0],
      [77, 77],
      [0, 96],
      [-15, 15],
      [-102, 0],
      [-83, -83],
      [0, -62],
      [68, -68],
    ];
    const face = singleFaceGrid(ring);
    gridFindIncentre(face);

    expect(
      inscribedRadius(ring, face.ix, face.iy) / bestByBruteForce(ring),
    ).toBeGreaterThan(0.98);
  });
});
