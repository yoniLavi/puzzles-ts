/**
 * A polygon yardstick for tests: point-in-polygon, distance-to-boundary, and
 * the best inscribed circle over the integer lattice — **derived from nothing
 * but a vertex ring**.
 *
 * Its entire value is what it does *not* import. `gridFindIncentre` maximises
 * the inscribed radius; these functions compute that radius from first
 * principles, sharing no line with it, so a bug in the implementation cannot
 * make a test measuring it vacuously pass. Two rules follow, and they are the
 * reason this module exists at all rather than each test rolling its own:
 *
 * 1. **Never import `grid-geometry.ts` here** (nor anything that does). The day
 *    this module reuses the implementation's `pointInFace` to save twenty
 *    lines, every test built on it silently stops being a check.
 * 2. **Take a plain `[x, y][]` ring, not a `GridFace`.** The implementation vets
 *    candidates through `face.edges`, whose per-face orientation is arbitrary;
 *    working from the dot ring is a genuinely separate derivation of the same
 *    shape, and taking the ring as an argument makes that structural rather
 *    than a convention a future edit can drift off.
 *
 * Written for `grid-geometry.test.ts` and hoisted here when
 * `grid-incentre.test.ts` became its second consumer — the change that replaced
 * that file's peer comparison against a frozen C capture with this, the real
 * quantity (`retire-the-incentre-c-fixture`). A peer bar is green whenever both
 * implementations are wrong in the same way; this one is not.
 *
 * Test-only: nothing under `src/` outside a `*.test.ts` may import it.
 */

/** A closed polygon as its vertex ring, in order. */
export type Ring = [number, number][];

/**
 * Standard even-odd ray cast: count the sides crossing the ray heading in +x
 * from the point, using the conventional half-open y-interval so a vertex lying
 * on the ray is counted once rather than twice.
 */
export function insidePolygon(poly: Ring, x: number, y: number): boolean {
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

/**
 * Distance from `(x, y)` to the segment `(ax,ay)`–`(bx,by)`.
 *
 * The projection parameter is clamped to `[0, 1]` so this measures to the
 * **segment**, not to its infinite line — the endpoint cases fall out of the
 * clamp. That clamp is load-bearing rather than tidy: measuring to the infinite
 * line overstates the room available beside a reflex corner, which is exactly
 * the mis-measurement this yardstick exists to catch.
 */
export function distanceToSegment(
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

/**
 * The radius of the largest circle centred at `(x, y)` that fits inside the
 * polygon — the distance to the nearest side, and zero anywhere outside.
 *
 * This is the quantity the incentre exists to maximise, and comparing it is far
 * more meaningful than comparing coordinates: two quite different points can
 * admit the same circle, which is precisely the parallel-edge continuum
 * upstream notes it resolves arbitrarily.
 */
export function inscribedRadius(poly: Ring, x: number, y: number): number {
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
 *
 * The lattice is the same one the implementation's answer is quantised onto, so
 * the comparison is like for like: the returned value is by construction an
 * upper bound on the radius any stored (integer) incentre can admit, and the
 * shortfall is therefore a pure measure of the search, with no rounding term
 * smuggled into it.
 *
 * Slow by construction — quadratic in the bounding box, ~8.4 M points across
 * every face of every tiling. That is affordable (~1.3 s) and is why the sweep
 * runs at full resolution rather than on a coarsened lattice.
 */
export function bestByBruteForce(poly: Ring): number {
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
