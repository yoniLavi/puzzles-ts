/**
 * Geometry helpers over a built `Grid` — the only floating-point code in the
 * grid module. Import from `grid.ts`, not from here.
 *
 * Both helpers are **input/display only**: `gridNearestEdge` decides which edge
 * a click lands on, and `gridFindIncentre` decides where a clue digit is drawn.
 * Neither influences a grid description, generation or solving, so neither is
 * byte-parity surface (this project's byte-parity scope covers
 * generator/solver/codec, not display — see `feedback_byte_parity_scope`).
 *
 * Ported for Loopy (openspec `extend-grid-tilings`), which is the sole
 * consumer: it has no keyboard input and no drag, so `gridNearestEdge` is its
 * *entire* input path.
 */

import type { Grid, GridDot, GridEdge, GridFace } from "./grid-core.ts";

const sq = (n: number): number => n * n;

/**
 * Perpendicular distance from `(px, py)` to the infinite line through
 * `(ax, ay)`–`(bx, by)`.
 *
 * The determinant below is twice the area of the triangle, which equals the
 * perpendicular distance times the line length — so dividing by the length
 * gives the distance. Mirrors `point_line_distance`.
 */
function pointLineDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const det = Math.abs(ax * by - bx * ay + bx * py - px * by + px * ay - ax * py);
  return det / Math.sqrt(sq(ax - bx) + sq(ay - by));
}

/**
 * The edge nearest the point `(x, y)` in grid coordinates, or `null` when no
 * edge is reasonably near it. Mirrors `grid_nearest_edge`.
 *
 * Perpendicular distance alone is not enough — an edge can be perpendicularly
 * close while the point is off to one side, past its end:
 *
 * ```
 *      edge1
 *   *---------*------
 *             |
 *             |      * (x, y)
 *       edge2 |
 *             |   edge2 is right, edge1 is not, even though edge1 is
 *             *   perpendicularly closer.
 * ```
 *
 * So an edge is eligible only if the triangle it forms with the point has
 * **acute angles at both of its dots** — detected by Pythagoras, since
 * `h² = a² + b²` is exactly the right angle and `h² < a² + b²` the acute one.
 * That test is **exact integer arithmetic**; only the distance comparison
 * afterwards is floating point.
 *
 * The final comparison is deliberately strict (`<`, not `<=`) and there is no
 * tiebreak, so on an exact tie the **lowest-index edge wins by iteration
 * order**. Relaxing it to `<=` silently changes which edge a click on a vertex
 * toggles.
 */
export function gridNearestEdge(g: Grid, x: number, y: number): GridEdge | null {
  let bestEdge: GridEdge | null = null;
  let bestDistance = 0;

  for (const e of g.edges) {
    // Squared length of the edge, and of the two other sides of the triangle.
    const e2 = sq(e.dot1.x - e.dot2.x) + sq(e.dot1.y - e.dot2.y);
    const a2 = sq(e.dot1.x - x) + sq(e.dot1.y - y);
    const b2 = sq(e.dot2.x - x) + sq(e.dot2.y - y);
    if (a2 >= e2 + b2) continue;
    if (b2 >= e2 + a2) continue;

    // Eligible so far. Now reject clicks way off the grid: require the
    // perpendicular distance to be at most half the edge length, i.e. a
    // circular region with the edge as diameter.
    const dist = pointLineDistance(x, y, e.dot1.x, e.dot1.y, e.dot2.x, e.dot2.y);
    if (4 * sq(dist) > e2) continue;

    if (bestEdge === null || dist < bestDistance) {
      bestEdge = e;
      bestDistance = dist;
    }
  }
  return bestEdge;
}

/**
 * The **incentre** of a face: the centre of the largest circle that fits
 * anywhere inside it. Computed lazily on first request and cached on the face
 * (`face.hasIncentre`, `face.ix`, `face.iy`).
 *
 * This is where a symbol or clue digit will most easily fit, which is its only
 * purpose — Loopy draws its clue numbers there. For a triangle it is the
 * classical incentre; the definition generalises to arbitrary polygons, which
 * matters here because several tilings produce faces that are markedly
 * non-convex, where a centroid would sit visibly off-centre or even outside.
 *
 * Mirrors `grid_find_incentre`. Display-only: never assert its exact
 * coordinates, only that the point lies inside the face and the circle it
 * admits is (near enough) the largest one.
 */
export function gridFindIncentre(f: GridFace): void {
  if (f.hasIncentre) return;

  // The point we want is the one maximising its distance to the nearest edge
  // or corner. Such a point must touch at least *three* edges and/or vertices:
  // a circle touching only two can always still be grown in some direction, so
  // a two-contact point is not even a local maximum. So we enumerate every
  // 3-subset of the face's combined edge+vertex set, generate the one or two
  // candidate points equidistant from all three, and vet each candidate.
  //
  // Known imperfection, inherited from upstream: with parallel edges (a long
  // thin rectangle, a parallelogram) a whole *continuum* of equally good
  // answers exists, and this picks an arbitrary end of it rather than the
  // middle. Fixing that needs parallel-pair detection plus extra midpoint
  // candidates plus rounding-error tolerance; not worth it for label placement.
  //
  // Note we do *not* iterate over `f.edges`, but over pairs of dots adjacent in
  // the face's clockwise dot ring. That gives each edge a consistent
  // orientation relative to this face, which `GridEdge` alone cannot: an
  // order-3 vertex forces at least one of its three faces to see two of its
  // edges tip-to-tip or tail-to-tail rather than tip-to-tail.
  const order = f.order;
  // biome-ignore lint/style/noNonNullAssertion: a built face has all its dots.
  const dotAt = (i: number): GridDot => f.dots[i]!;

  // The current 3-subset, partitioned into edges (as dot pairs) and dots. The
  // three nested loops push onto these on the way in and pop on the way out,
  // mirroring the C's nedges/ndots counters.
  const edgeDot1: GridDot[] = [];
  const edgeDot2: GridDot[] = [];
  const subsetDots: GridDot[] = [];

  // Index `i` in `[0, 2*order)` means "edge i" when `i < order`, else "dot
  // i - order" — one flat enumeration over the combined set.
  const push = (i: number): void => {
    if (i < order) {
      edgeDot1.push(dotAt(i));
      edgeDot2.push(dotAt((i + 1) % order));
    } else {
      subsetDots.push(dotAt(i - order));
    }
  };
  const pop = (i: number): void => {
    if (i < order) {
      edgeDot1.pop();
      edgeDot2.pop();
    } else {
      subsetDots.pop();
    }
  };

  let xBest = 0;
  let yBest = 0;
  let bestDist = 0;

  for (let i = 0; i + 2 < 2 * order; i++) {
    push(i);
    for (let j = i + 1; j + 1 < 2 * order; j++) {
      push(j);
      for (let k = j + 1; k < 2 * order; k++) {
        push(k);

        const candidates = incentreCandidates(edgeDot1, edgeDot2, subsetDots);
        for (const [x, y] of candidates) {
          if (!pointInFace(f, x, y)) continue;
          const dist = minSquaredDistanceToBoundary(f, x, y);
          if (bestDist < dist) {
            bestDist = dist;
            xBest = x;
            yBest = y;
          }
        }

        pop(k);
      }
      pop(j);
    }
    pop(i);
  }

  if (!(bestDist > 0)) {
    throw new Error(`gridFindIncentre: no interior point found for face ${f.index}`);
  }

  f.hasIncentre = true;
  // Round to nearest. `Math.trunc(v + 0.5)` rather than `Math.floor`, matching
  // the C's double->int assignment, which truncates toward zero: for a
  // negative coordinate the two differ by one unit, and grid coordinates do go
  // negative. Sub-pixel either way, but there is no reason to diverge.
  f.ix = Math.trunc(xBest + 0.5);
  f.iy = Math.trunc(yBest + 0.5);
}

/**
 * The one or two points equidistant from all three members of one 3-subset of
 * a face's edges and vertices. Which of four cases applies is decided by how
 * many of the three are edges.
 */
function incentreCandidates(
  edgeDot1: GridDot[],
  edgeDot2: GridDot[],
  dots: GridDot[],
): Array<[number, number]> {
  const nedges = edgeDot1.length;

  if (nedges === 3) {
    // Three edges: purely linear. Each row says "the point (x,y) is at
    // distance r from this edge", and we solve the three simultaneously for
    // x, y and r — then discard r.
    const matrix = new Array<number>(9);
    const vector = new Array<number>(3);
    for (let m = 0; m < 3; m++) {
      const { x1, y1, dx, dy } = edgeVector(edgeDot1[m], edgeDot2[m]);
      // ((x,y) - (x1,y1)) . (dy,-dx) = r |(dx,dy)|
      //   =>  x dy - y dx - r |(dx,dy)| = x1 dy - y1 dx
      matrix[3 * m + 0] = dy;
      matrix[3 * m + 1] = -dx;
      matrix[3 * m + 2] = -Math.sqrt(dx * dx + dy * dy);
      vector[m] = x1 * dy - y1 * dx;
    }
    const solution = solve3x3Matrix(matrix, vector);
    return solution ? [[solution[0], solution[1]]] : [];
  }

  if (nedges === 2) {
    // Two edges and a dot — a quadratic.
    //
    // Being distance r from each of two lines gives two linear equations in
    // x, y, r. Eliminating r between them leaves a single linear equation in
    // x and y: the angle bisector. Parametrise that line by t, which makes x,
    // y and r all linear in t, and the circle equation
    // (x-xd)^2 + (y-yd)^2 = r^2 becomes a quadratic in t.
    const eqs: number[][] = [];
    for (let m = 0; m < 2; m++) {
      const { x1, y1, dx, dy } = edgeVector(edgeDot1[m], edgeDot2[m]);
      // a, b, c, d  with  ax + by + cr = d
      eqs.push([dy, -dx, -Math.sqrt(dx * dx + dy * dy), x1 * dy - y1 * dx]);
    }

    // Eliminate r to get the angle bisector: a, b, c with ax + by = c.
    const eq = [
      eqs[0][0] * eqs[1][2] - eqs[1][0] * eqs[0][2],
      eqs[0][1] * eqs[1][2] - eqs[1][1] * eqs[0][2],
      eqs[0][3] * eqs[1][2] - eqs[1][3] * eqs[0][2],
    ];

    // Parametrise by whichever of x, y is better conditioned.
    let xt: [number, number];
    let yt: [number, number];
    if (Math.abs(eq[0]) < Math.abs(eq[1])) {
      xt = [1, 0]; // the parameter is x
      yt = [-eq[0] / eq[1], eq[2] / eq[1]];
    } else {
      yt = [1, 0]; // the parameter is y
      xt = [-eq[1] / eq[0], eq[2] / eq[0]];
    }

    // r, linear in t, read off the first edge's equation.
    const rt: [number, number] = [
      -(eqs[0][0] * xt[0] + eqs[0][1] * yt[0]) / eqs[0][2],
      (eqs[0][3] - eqs[0][0] * xt[1] - eqs[0][1] * yt[1]) / eqs[0][2],
    ];

    // (x-xd)^2 + (y-yd)^2 - r^2 = 0, expanded as a t^2 + b t + c = 0.
    const dx1 = xt[1] - dots[0].x;
    const dy1 = yt[1] - dots[0].y;
    const q: [number, number, number] = [
      -rt[0] * rt[0] + xt[0] * xt[0] + yt[0] * yt[0],
      -2 * rt[0] * rt[1] + 2 * xt[0] * dx1 + 2 * yt[0] * dy1,
      -rt[1] * rt[1] + dx1 * dx1 + dy1 * dy1,
    ];
    return solveQuadraticPoints(q, xt, yt);
  }

  if (nedges === 1) {
    // Two dots and an edge — another quadratic.
    //
    // The point must lie on the perpendicular bisector of the two dots, so
    // parametrise that line by t; x, y and the distance to the edge are then
    // all linear in t. Setting that distance equal to the radius of the circle
    // through both dots (Pythagoras on half their separation) gives the
    // quadratic.
    const dxd = dots[1].x - dots[0].x;
    const dyd = dots[1].y - dots[0].y;
    const d = Math.sqrt(dxd * dxd + dyd * dyd);
    // t is at standard scale (the direction vector is a unit normal), which
    // is what lets `halfsep` below be used directly as a length.
    const xt: [number, number] = [-dyd / d, (dots[0].x + dots[1].x) / 2];
    const yt: [number, number] = [dxd / d, (dots[0].y + dots[1].y) / 2];
    const halfsep = 0.5 * d;

    const e = edgeVector(edgeDot1[0], edgeDot2[0]);
    const elen = Math.sqrt(e.dx * e.dx + e.dy * e.dy);
    const rt: [number, number] = [
      (xt[0] * e.dy - yt[0] * e.dx) / elen,
      ((xt[1] - e.x1) * e.dy - (yt[1] - e.y1) * e.dx) / elen,
    ];

    const q: [number, number, number] = [
      rt[0] * rt[0] - 1,
      2 * rt[0] * rt[1],
      rt[1] * rt[1] - halfsep * halfsep,
    ];
    return solveQuadraticPoints(q, xt, yt);
  }

  // Three dots: the circumcentre, where two perpendicular bisectors meet. Two
  // bisectors suffice, so this is only a 2x2 system.
  const matrix = new Array<number>(4);
  const vector = new Array<number>(2);
  for (let m = 0; m < 2; m++) {
    const { x1, y1, dx, dy } = edgeVector(dots[m], dots[m + 1]);
    // ((x,y) - (x1,y1)) . (dx,dy) = 1/2 |(dx,dy)|^2
    //   =>  2x dx + 2y dy = dx^2 + dy^2 + 2 x1 dx + 2 y1 dy
    matrix[2 * m + 0] = 2 * dx;
    matrix[2 * m + 1] = 2 * dy;
    vector[m] = dx * dx + dy * dy + 2 * x1 * dx + 2 * y1 * dy;
  }
  const solution = solve2x2Matrix(matrix, vector);
  return solution ? [[solution[0], solution[1]]] : [];
}

/** A directed edge as its start point plus its delta. */
function edgeVector(
  d1: GridDot,
  d2: GridDot,
): { x1: number; y1: number; dx: number; dy: number } {
  return { x1: d1.x, y1: d1.y, dx: d2.x - d1.x, dy: d2.y - d1.y };
}

/**
 * Solve `q[0] t² + q[1] t + q[2] = 0` and map both roots back through the
 * linear parametrisations `xt`, `yt` to candidate points. A negative
 * discriminant means no real solution and so no candidates.
 */
function solveQuadraticPoints(
  q: [number, number, number],
  xt: [number, number],
  yt: [number, number],
): Array<[number, number]> {
  const disc = q[1] * q[1] - 4 * q[0] * q[2];
  if (!(disc >= 0)) return [];
  const root = Math.sqrt(disc);
  const t1 = (-q[1] + root) / (2 * q[0]);
  const t2 = (-q[1] - root) / (2 * q[0]);
  return [
    [xt[0] * t1 + xt[1], yt[0] * t1 + yt[1]],
    [xt[0] * t2 + xt[1], yt[0] * t2 + yt[1]],
  ];
}

/**
 * Solve the 2×2 system `mx · out = vin` by explicit inversion, or `null` when
 * the matrix is singular. Mirrors `solve_2x2_matrix`, including its exact
 * `det == 0` test — a near-singular system yields a wild candidate point,
 * which the point-in-polygon and minimum-distance vetting then discards.
 */
function solve2x2Matrix(mx: number[], vin: number[]): [number, number] | null {
  const det = mx[0] * mx[3] - mx[1] * mx[2];
  if (det === 0) return null;
  const inv = [mx[3] / det, -mx[1] / det, -mx[2] / det, mx[0] / det];
  return [inv[0] * vin[0] + inv[1] * vin[1], inv[2] * vin[0] + inv[3] * vin[1]];
}

/**
 * Solve the 3×3 system `mx · out = vin` by explicit inversion (cofactors over
 * the determinant), or `null` when singular. Mirrors `solve_3x3_matrix`.
 */
function solve3x3Matrix(mx: number[], vin: number[]): [number, number, number] | null {
  const det =
    mx[0] * mx[4] * mx[8] +
    mx[1] * mx[5] * mx[6] +
    mx[2] * mx[3] * mx[7] -
    mx[0] * mx[5] * mx[7] -
    mx[1] * mx[3] * mx[8] -
    mx[2] * mx[4] * mx[6];
  if (det === 0) return null;

  const inv = [
    (mx[4] * mx[8] - mx[5] * mx[7]) / det,
    (mx[2] * mx[7] - mx[1] * mx[8]) / det,
    (mx[1] * mx[5] - mx[2] * mx[4]) / det,
    (mx[5] * mx[6] - mx[3] * mx[8]) / det,
    (mx[0] * mx[8] - mx[2] * mx[6]) / det,
    (mx[2] * mx[3] - mx[0] * mx[5]) / det,
    (mx[3] * mx[7] - mx[4] * mx[6]) / det,
    (mx[1] * mx[6] - mx[0] * mx[7]) / det,
    (mx[0] * mx[4] - mx[1] * mx[3]) / det,
  ];
  return [
    inv[0] * vin[0] + inv[1] * vin[1] + inv[2] * vin[2],
    inv[3] * vin[0] + inv[4] * vin[1] + inv[5] * vin[2],
    inv[6] * vin[0] + inv[7] * vin[1] + inv[8] * vin[2],
  ];
}

/**
 * Whether `(x, y)` is inside the face, by the crossing-number rule: count the
 * face's edges that cross the ray heading right from the point, and take an
 * odd count as "inside".
 *
 * The half-open `y` interval (`>= ys && < ye`) is what makes the tie cases
 * consistent: an edge that starts, ends or passes exactly through our
 * y-coordinate is counted as though the point were nudged by a small
 * *positive* epsilon in both x and y, so a vertex is never double-counted.
 */
function pointInFace(f: GridFace, x: number, y: number): boolean {
  let inside = false;
  for (let e = 0; e < f.order; e++) {
    // biome-ignore lint/style/noNonNullAssertion: a built face has all its edges.
    const edge = f.edges[e]!;
    const xs = edge.dot1.x;
    const xe = edge.dot2.x;
    const ys = edge.dot1.y;
    const ye = edge.dot2.y;
    if ((y >= ys && y < ye) || (y >= ye && y < ys)) {
      // The edge spans our y. Is its crossing x to our right? That x is
      // (y - ys) * (xe - xs) / (ye - ys); we compare against (x - xs) with
      // the division cleared, which needs the denominator made positive
      // first so the inequality does not flip.
      let num = xe - xs;
      let denom = ye - ys;
      if (denom < 0) {
        num = -num;
        denom = -denom;
      }
      if ((x - xs) * denom >= (y - ys) * num) inside = !inside;
    }
  }
  return inside;
}

/**
 * The **squared** radius of the largest circle centred at `(x, y)` that stays
 * inside the face: the minimum squared distance from the point to any of the
 * face's corners or edges. Squared throughout — the square root would be pure
 * cost, since only comparisons are ever made.
 */
function minSquaredDistanceToBoundary(f: GridFace, x: number, y: number): number {
  let mindist = Number.POSITIVE_INFINITY;

  // The corners.
  for (let d = 0; d < f.order; d++) {
    // biome-ignore lint/style/noNonNullAssertion: a built face has all its dots.
    const dot = f.dots[d]!;
    const dist = sq(x - dot.x) + sq(y - dot.y);
    if (mindist > dist) mindist = dist;
  }

  // The edges — but only where the perpendicular foot actually lands between
  // the endpoints. Where it does not, the nearer endpoint is the closest point
  // on that edge and the corner loop above has already accounted for it.
  for (let e = 0; e < f.order; e++) {
    // biome-ignore lint/style/noNonNullAssertion: a built face has all its edges.
    const edge = f.edges[e]!;
    const xs = edge.dot1.x;
    const ys = edge.dot1.y;
    const edx = edge.dot2.x - xs;
    const edy = edge.dot2.y - ys;
    const pdx = x - xs;
    const pdy = y - ys;
    // The foot lies strictly between the endpoints s and e exactly when
    // (p-s).(e-s) lies strictly between 0 and (e-s).(e-s).
    const pde = pdx * edx + pdy * edy;
    const ede = edx * edx + edy * edy;
    if (pde > 0 && pde < ede) {
      const pdre = pdx * edy - pdy * edx;
      const sqlen = (pdre * pdre) / ede;
      if (mindist > sqlen) mindist = sqlen;
    }
  }

  return mindist;
}
