/**
 * Tier-1 structural tests for the shared planar-grid leaf.
 *
 * The square-specific block came first (with Pearl); `extend-grid-tilings`
 * added the all-tilings blocks below it for Loopy. All of it is deliberately
 * **independent of the C fixture**: the differential
 * (`grid-differential.test.ts`) proves the tilings match upstream, while these
 * prove they are structurally sane — which still holds if the oracle is ever
 * regenerated, and which catches incidence bugs by invariant rather than by
 * comparison.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../random/index.ts";
import {
  APERIODIC_GRID_TYPES,
  type Grid,
  gridComputeSize,
  gridNearestEdge,
  gridNew,
  gridNewDesc,
  gridNewSquare,
  gridValidateDesc,
  gridValidateParams,
  PERIODIC_GRID_TYPES,
} from "./grid.ts";

describe("gridNewSquare", () => {
  it("has the expected face/edge/dot counts for a w×h grid", () => {
    for (const [w, h] of [
      [5, 5],
      [6, 4],
      [11, 7],
    ] as const) {
      const g = gridNewSquare(w, h);
      expect(g.numFaces).toBe(w * h);
      expect(g.numDots).toBe((w + 1) * (h + 1));
      // Undirected edges of a w×h square grid: w(h+1) horizontal + h(w+1) vertical.
      expect(g.numEdges).toBe(w * (h + 1) + h * (w + 1));
    }
  });

  it("gives every interior edge two faces and every border edge one", () => {
    const g = gridNewSquare(6, 4);
    let border = 0;
    let interior = 0;
    for (const e of g.edges) {
      const nFaces = (e.face1 ? 1 : 0) + (e.face2 ? 1 : 0);
      if (nFaces === 1) border++;
      else if (nFaces === 2) interior++;
      else throw new Error("edge with zero faces");
    }
    // The perimeter of a 6×4 grid is 2*(6+4) = 20 unit border edges.
    expect(border).toBe(2 * (6 + 4));
    expect(interior).toBe(g.numEdges - border);
  });

  it("each face's four edges join its consecutive corner dots", () => {
    const g = gridNewSquare(5, 5);
    for (const f of g.faces) {
      expect(f.order).toBe(4);
      for (let k = 0; k < 4; k++) {
        const e = f.edges[k];
        expect(e).not.toBeNull();
        if (!e) continue;
        const d1 = f.dots[k];
        const d2 = f.dots[(k + 1) % 4];
        const endpoints = new Set([e.dot1, e.dot2]);
        expect(d1 !== null && endpoints.has(d1)).toBe(true);
        expect(d2 !== null && endpoints.has(d2)).toBe(true);
      }
    }
  });

  it("deduplicates shared corner dots to a single instance", () => {
    const g = gridNewSquare(3, 3);
    // The dot shared by the four central cells is a single object.
    const byCoord = new Map<string, number>();
    for (const d of g.dots) {
      const key = `${d.x},${d.y}`;
      byCoord.set(key, (byCoord.get(key) ?? 0) + 1);
    }
    for (const [, count] of byCoord) expect(count).toBe(1);
    // tileSize is the 20-unit square side loopgen divides dot coords by.
    expect(g.tileSize).toBe(20);
  });

  it("is deterministic: two builds give identical faces/edges/dots in order", () => {
    const a = gridNewSquare(7, 5);
    const b = gridNewSquare(7, 5);
    expect(a.dots.map((d) => [d.x, d.y])).toEqual(b.dots.map((d) => [d.x, d.y]));
    expect(a.edges.map((e) => [e.dot1.index, e.dot2.index])).toEqual(
      b.edges.map((e) => [e.dot1.index, e.dot2.index]),
    );
    expect(a.dots.map((d) => d.order)).toEqual(b.dots.map((d) => d.order));
  });

  it("bounding box spans the whole grid", () => {
    const g = gridNewSquare(6, 4);
    expect(g.lowestX).toBe(0);
    expect(g.lowestY).toBe(0);
    expect(g.highestX).toBe(6 * 20);
    expect(g.highestY).toBe(4 * 20);
  });
});

/**
 * A legal small size per tiling. These are the minimum sizes the *consuming
 * game* imposes (Loopy's `GRIDLIST` amin/omin) — geometry itself has no
 * minimum, but below these a patch is degenerate and not worth asserting on.
 */
const MIN_SIZE: Record<(typeof PERIODIC_GRID_TYPES)[number], [number, number]> = {
  square: [3, 3],
  honeycomb: [3, 3],
  triangular: [3, 3],
  snubsquare: [3, 3],
  cairo: [3, 4],
  greathexagonal: [3, 3],
  kagome: [3, 3],
  octagonal: [3, 3],
  kites: [3, 3],
  floret: [1, 2],
  dodecagonal: [2, 2],
  greatdodecagonal: [2, 2],
  greatgreatdodecagonal: [2, 2],
  compassdodecagonal: [2, 2],
};

describe.each(PERIODIC_GRID_TYPES)("%s tiling", (type) => {
  const [minW, minH] = MIN_SIZE[type];
  // Two sizes: the minimum (boundary guards active) and one larger with
  // interior cells (boundary guards inactive) — the complementary paths.
  const sizes: [number, number][] = [
    [minW, minH],
    [minW + 2, minH + 1],
  ];

  it.each(sizes)("builds a fully-linked grid at %ix%i", (w, h) => {
    const g = gridNew(type, w, h);

    expect(g.faces.length).toBeGreaterThan(0);
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.dots.length).toBeGreaterThan(0);

    // Indices are positional — everything downstream (Loopy's dline indexing,
    // the differential) assumes it.
    g.faces.forEach((f, i) => {
      expect(f.index).toBe(i);
    });
    g.edges.forEach((e, i) => {
      expect(e.index).toBe(i);
    });
    g.dots.forEach((d, i) => {
      expect(d.index).toBe(i);
    });

    for (const f of g.faces) {
      expect(f.dots.length).toBe(f.order);
      expect(f.edges.length).toBe(f.order);
      for (let k = 0; k < f.order; k++) {
        const d1 = f.dots[k];
        const d2 = f.dots[(k + 1) % f.order];
        const e = f.edges[k];
        expect(d1).not.toBeNull();
        expect(e).not.toBeNull();
        // Edge k joins dots k and k+1 (in either orientation), and knows it
        // borders this face. This is the invariant Loopy's dline machinery
        // rests on; a violation corrupts deductions silently, never throws.
        const joins =
          (e?.dot1 === d1 && e?.dot2 === d2) || (e?.dot1 === d2 && e?.dot2 === d1);
        expect(joins).toBe(true);
        expect(e?.face1 === f || e?.face2 === f).toBe(true);
      }
    }

    for (const e of g.edges) {
      // A null face is the infinite exterior; both null would be a detached
      // edge, which cannot happen in a patch built from faces.
      expect(e.face1).not.toBeNull();
      expect(e.dot1).not.toBe(e.dot2);
    }

    for (const d of g.dots) {
      expect(d.edges.length).toBe(d.order);
      expect(d.faces.length).toBe(d.order);
      expect(d.order).toBeGreaterThan(0);
      for (const e of d.edges) {
        expect(e.dot1 === d || e.dot2 === d).toBe(true);
      }
    }
  });

  it.each(sizes)("satisfies Euler's formula at %ix%i", (w, h) => {
    // V - E + F = 1 for a simply-connected planar patch (the infinite exterior
    // face is not counted). This catches a whole class of incidence error — a
    // duplicated dot, a dropped edge, an over-emitted face — by arithmetic,
    // without needing to know what the tiling should look like.
    const g = gridNew(type, w, h);
    expect(g.dots.length - g.edges.length + g.faces.length).toBe(1);
  });

  it.each(sizes)("is deterministic at %ix%i", (w, h) => {
    const a = gridNew(type, w, h);
    const b = gridNew(type, w, h);
    expect(a.dots.map((d) => [d.x, d.y])).toEqual(b.dots.map((d) => [d.x, d.y]));
    expect(a.faces.map((f) => f.dots.map((d) => d?.index))).toEqual(
      b.faces.map((f) => f.dots.map((d) => d?.index)),
    );
  });

  it.each(sizes)("uses only exact integer coordinates at %ix%i", (w, h) => {
    // grid.c:1404 "No floating-point arithmetic here!" — dot dedup is by exact
    // coordinate equality, so a fractional coordinate silently splits a shared
    // corner into two dots instead of raising.
    const g = gridNew(type, w, h);
    for (const d of g.dots) {
      expect(Number.isInteger(d.x)).toBe(true);
      expect(Number.isInteger(d.y)).toBe(true);
      // The negative-zero hazard that bit floret: a negative scale factor
      // times a zero index yields -0, which compares equal to 0 but is
      // structurally distinct (Object.is(-0, 0) === false), so it passes every
      // arithmetic check and fails only a structural comparison.
      expect(Object.is(d.x, -0)).toBe(false);
      expect(Object.is(d.y, -0)).toBe(false);
    }
  });

  it("bounding box fits inside gridComputeSize's promised extent", () => {
    const g = gridNew(type, minW, minH);
    const size = gridComputeSize(type, minW, minH);
    expect(size.tileSize).toBe(g.tileSize);
    expect(g.highestX - g.lowestX).toBeLessThanOrEqual(size.xExtent);
    expect(g.highestY - g.lowestY).toBeLessThanOrEqual(size.yExtent);
  });
});

describe("triangular version desc", () => {
  it("selects a different algorithm per desc", () => {
    // Absent desc = upstream's legacy generator, which leaves ragged boundary
    // "ears"; "0" = the current ear-trimmed one. Old shared game IDs rely on
    // the legacy branch still existing, so it is not dead code.
    const legacy = gridNew("triangular", 3, 3, null);
    const trimmed = gridNew("triangular", 3, 3, "0");
    expect(legacy.faces.length).not.toBe(trimmed.faces.length);
    expect(trimmed.faces.length).toBeGreaterThan(legacy.faces.length);
  });

  it("rejects a desc on a tiling that takes none", () => {
    expect(() => gridNew("square", 3, 3, "0")).toThrow(/description/i);
  });
});

describe("aperiodic tilings", () => {
  // Replaced `extend-grid-tilings`' "these throw a named error" guard, which
  // was the change boundary while the four were unimplemented. Index-exact
  // agreement with the C lives in `grid-aperiodic-differential.test.ts`; what
  // is asserted here is only that they are wired into the barrel at all.
  it.each([
    ...APERIODIC_GRID_TYPES,
  ])("%s builds from a generated description", (type) => {
    const desc = gridNewDesc(type, 6, 6, randomNew("wiring"));
    expect(desc).not.toBeNull();
    expect(gridValidateDesc(type, 6, 6, desc)).toBeNull();

    const g = gridNew(type, 6, 6, desc);
    expect(g.faces.length).toBeGreaterThan(0);
    expect(g.dots.length).toBeGreaterThan(0);
    // Simply-connected planar patch, post-trim.
    expect(g.dots.length - g.edges.length + g.faces.length).toBe(1);
  });

  it.each([...APERIODIC_GRID_TYPES])("%s requires a description", (type) => {
    // Unlike the periodic tilings, a description is not optional here: it is
    // the record of the generator's random choices, without which there is no
    // particular patch to rebuild.
    expect(() => gridNew(type, 6, 6, null)).toThrow(/invalid description/);
  });
});

describe("gridNearestEdge", () => {
  // Square tiling, tileSize 20: cell (0,0) spans (0,0)-(20,20).
  const g: Grid = gridNewSquare(3, 3);

  it("finds the edge a click sits on", () => {
    const e = gridNearestEdge(g, 10, 0);
    expect(e).not.toBeNull();
    expect([e?.dot1.y, e?.dot2.y]).toEqual([0, 0]);
  });

  it("returns null for a click far off the grid", () => {
    expect(gridNearestEdge(g, 5000, 5000)).toBeNull();
  });

  it("ignores an edge the click is off the end of", () => {
    // Perpendicularly on the line through cell (0,0)'s top edge, but far past
    // its end — the acute-angle test must reject that edge specifically.
    const topEdge = gridNearestEdge(g, 10, 0);
    expect(gridNearestEdge(g, -500, 0)).not.toBe(topEdge);
  });

  it("selects nothing for a click exactly on a vertex", () => {
    // Not an edge case papered over — it falls out of the acute-angle test at
    // its degenerate limit, identically in the C. With the click exactly at
    // `dot2`, `b2 == 0` and `a2 == e2`, so the first guard `a2 >= e2 + b2`
    // reads `e2 >= e2` and rejects. Every edge touching that vertex is
    // rejected the same way, so a click precisely on a dot toggles nothing.
    expect(gridNearestEdge(g, 20, 20)).toBeNull();
  });

  it("breaks an exact tie toward the lowest-index edge", () => {
    // The cell centre is exactly equidistant (10 units) from all four of its
    // edges, and all four pass eligibility — `4*10² > 20²` is false, so none
    // is rejected. Upstream compares with a strict `<` and has no tiebreak, so
    // iteration order decides and the lowest index wins; relaxing to `<=`
    // would silently pick a different edge.
    const [px, py] = [10, 10];
    const chosen = gridNearestEdge(g, px, py);
    expect(chosen).not.toBeNull();

    // Re-derive the winner independently: apply BOTH eligibility rules (the
    // acute-angle test *and* the half-edge-length distance cut), then take the
    // minimum distance, then the lowest index among those tied at it.
    const sq = (n: number) => n * n;
    const scored = g.edges
      .map((e) => {
        const e2 = sq(e.dot1.x - e.dot2.x) + sq(e.dot1.y - e.dot2.y);
        const a2 = sq(e.dot1.x - px) + sq(e.dot1.y - py);
        const b2 = sq(e.dot2.x - px) + sq(e.dot2.y - py);
        if (a2 >= e2 + b2 || b2 >= e2 + a2) return null;
        const det = Math.abs(
          e.dot1.x * e.dot2.y -
            e.dot2.x * e.dot1.y +
            e.dot2.x * py -
            px * e.dot2.y +
            px * e.dot1.y -
            e.dot1.x * py,
        );
        const dist = det / Math.sqrt(e2);
        if (4 * sq(dist) > e2) return null;
        return { index: e.index, dist };
      })
      .filter((s): s is { index: number; dist: number } => s !== null);

    const best = Math.min(...scored.map((s) => s.dist));
    const tied = scored.filter((s) => s.dist === best);
    // The tie must be real, or this test proves nothing about tiebreaking.
    expect(tied.length).toBeGreaterThan(1);
    expect(chosen?.index).toBe(Math.min(...tied.map((s) => s.index)));
  });
});

describe("gridValidateParams", () => {
  it("accepts a legal size", () => {
    expect(gridValidateParams("square", 10, 10)).toBeNull();
    expect(gridValidateParams("cairo", 3, 4)).toBeNull();
  });

  it("rejects non-positive dimensions", () => {
    expect(gridValidateParams("square", 0, 5)).toMatch(/positive/);
    expect(gridValidateParams("square", 5, -1)).toMatch(/positive/);
  });

  it("rejects an unreasonably large grid", () => {
    // The guard exists for the resource bound, not for overflow (TS numbers
    // are doubles) — without it a mistyped size tries to allocate hundreds of
    // millions of objects.
    expect(gridValidateParams("square", 1e9, 1e9)).toMatch(/unreasonably large/);
  });

  it("enforces no per-type minimum — that belongs to the game", () => {
    // Cairo needs one dimension >= 4 to be *playable*, but that rule lives in
    // Loopy's GRIDLIST, not the geometry. A 1x1 cairo is small, not invalid.
    expect(gridValidateParams("cairo", 1, 1)).toBeNull();
  });
});
