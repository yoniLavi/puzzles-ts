/**
 * `grid-geometry.ts` — the grid module's only floating-point code, and the
 * boundary that makes it safe.
 *
 * **Both helpers are display/input only.** `gridNearestEdge` decides which edge
 * a click lands on; `gridFindIncenter` decides where a clue digit is drawn.
 * Neither reaches a grid description, a generator or a solver, so neither is
 * byte-parity surface, and the exact comparisons at this module's branch points
 * (`det === 0`, `disc >= 0`, `Math.abs(eq[0]) < Math.abs(eq[1])`) are not
 * reproducible across compilers and do not need to be. What must hold is
 * behavioral: a click picks the edge a player meant, and a digit lands inside
 * its face with room around it.
 *
 * Coverage of this module is deliberately spread over three files, and this one
 * is the named home:
 *
 * - `grid.test.ts` drives `gridNearestEdge` through the barrel — the eligibility
 *   rules, the vertex case and the lowest-index tie-break.
 * - `grid-incenter.test.ts` sweeps `gridFindIncenter` over every face of every
 *   tiling against the best circle the integer lattice admits, plus caching,
 *   non-convex shapes and two known answers.
 * - here: the cases neither of those reaches — a click that is perpendicularly
 *   near an edge but nowhere near the board, the rounding of the stored point,
 *   a face with no interior at all, and the two shapes that exercise parts of
 *   the candidate enumeration a tiling does not happen to need.
 *
 * The polygon yardstick both files measure against lives in
 * `engine/testing/polygon-yardstick.ts`; its whole value is that it imports
 * nothing from `grid-geometry.ts`, so read its header before reusing it.
 */

import { describe, expect, it } from "vitest";
import {
  bestByBruteForce,
  inscribedRadius,
  type Ring,
} from "../testing/polygon-yardstick.ts";
import { gridFindIncenter, gridNearestEdge } from "./grid-geometry.ts";
import { GridDot, GridFace, gridNew, gridNewSquare, makeConsistent } from "./index.ts";

/**
 * A one-face grid from an explicit clockwise vertex ring (y down), linked up by
 * `makeConsistent` exactly as a real tiling's face is. The single face's outer
 * side is the infinite exterior.
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

/**
 * A deterministic family of markedly non-convex polygons: vertices at equal
 * angles, radii varying wildly, so reflex corners and long thin arms both turn
 * up. Each is seeded from its own index, so a case can be read and re-run on its
 * own. The generalization to arbitrary polygons is a stated property of the
 * routine — several tilings produce faces where a centroid sits outside the
 * face — so it is checked over arbitrary polygons.
 */
function awkwardPolygon(n: number): Ring {
  let s = (n * 2654435761) % 2147483647;
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s >>> 8) / 8388608;
  };
  const order = 4 + (n % 6);
  const ring: Ring = [];
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

describe("gridFindIncenter", () => {
  it("rounds the stored point to the nearest integer rather than truncating", () => {
    // A right isosceles triangle with legs of 10: its inradius is
    // (10 + 10 − √200) / 2 ≈ 2.929, and the incenter sits at (r, r). Truncating
    // stores (2, 2); rounding stores (3, 3), which is the nearer point.
    const face = singleFaceGrid([
      [0, 0],
      [10, 0],
      [0, 10],
    ]);
    gridFindIncenter(face);
    expect([face.ix, face.iy]).toEqual([3, 3]);
  });

  it("rounds to nearest on negative coordinates too, where C's `(int)(v + 0.5)` does not", () => {
    // The same triangle reflected through the origin, so the incenter sits at
    // ≈(−2.929, −2.929). The nearest integer point is (−3, −3).
    //
    // Upstream stores through a double->int assignment, i.e. `(int)(v + 0.5)`,
    // which truncates toward zero: −2.929 + 0.5 = −2.429, truncated to **−2**.
    // That is a whole unit off, and it is not an edge case — grid coordinates
    // are negative over most of a board, so the C form misplaces nearly every
    // clue digit it stores. `retire-the-incentre-c-fixture` measured the cost at
    // up to 1.229 units of inscribed radius across the eighteen tilings, against
    // 0.053 for rounding; `grid-incenter.test.ts` is what holds it there.
    //
    // The peer comparison this file's sibling used to run could not see it: the
    // C is wrong in exactly the same direction, so the two agreed perfectly.
    const face = singleFaceGrid([
      [0, 0],
      [0, -10],
      [-10, 0],
    ]);
    gridFindIncenter(face);
    expect([face.ix, face.iy]).toEqual([-3, -3]);
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
    expect(() => gridFindIncenter(face)).toThrow(/no interior point/);
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
      gridFindIncenter(face);

      const best = bestByBruteForce(ring);
      const got = inscribedRadius(ring, face.ix, face.iy);
      expect(best).toBeGreaterThan(0);
      // Not equality: the stored point is rounded to whole units, and upstream
      // picks an arbitrary end of the continuum where parallel edges leave one.
      expect(got / best).toBeGreaterThan(0.95);
    }
  });

  it("enumerates 3-subsets over the whole combined edge-and-vertex set", () => {
    // The enumeration indexes edges 0..order-1 and vertices order..2*order-1 and
    // walks every 3-subset of the two together. Shortening its outer loop drops
    // the subsets led by the *last* members, and on this shape that is where the
    // best circle's supporting trio lives: the answer degrades to 0.97 of the
    // achievable radius, which nothing else here would notice.
    //
    // **This test does not pin the all-vertices arm, despite what its previous
    // name and comment claimed.** Restricting the outer loop to `i < order` is
    // exactly "the subset must contain an edge" — vertices sort after every edge
    // — and under it this shape's answer is *bit-identical*, point and radius.
    // Re-swept while replacing this file's sibling's C comparison
    // (`retire-the-incentre-c-fixture`): across 400 members of the family above,
    // removing the all-vertices arm changes the answer on **2**, by at most 1%
    // of the achievable radius, and on one of the two it makes the answer
    // slightly *better*. So there is no shape here worth freezing for it, and
    // the arm is recorded as unpinned rather than left looking covered. The
    // earlier "5 of 400, widest margin" note measured a different restriction.
    const ring: Ring = [
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
    gridFindIncenter(face);

    expect(
      inscribedRadius(ring, face.ix, face.iy) / bestByBruteForce(ring),
    ).toBeGreaterThan(0.98);
  });
});
