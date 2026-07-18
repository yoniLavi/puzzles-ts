/**
 * Tier-1 structural tests for the shared square-grid leaf. The square tiling
 * is deterministic (no RNG, no float), so these assert the incidence
 * invariants and reproducibility rather than any corpus.
 */
import { describe, expect, it } from "vitest";
import { gridNewSquare } from "./grid.ts";

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
