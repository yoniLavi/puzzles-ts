import { describe, expect, it } from "vitest";
import { findLoops } from "./findloop.ts";

/** Build a neighbour callback from an undirected edge list. */
function graph(n: number, edges: [number, number][]) {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return (v: number) => adj[v];
}

describe("findLoops", () => {
  it("finds no loop in a path", () => {
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    const r = findLoops(4, graph(4, edges));
    expect(r.anyLoop).toBe(false);
    for (const [a, b] of edges) {
      expect(r.isLoopEdge(a, b)).toBe(false);
      expect(r.isBridge(a, b)).not.toBeNull();
    }
  });

  it("finds no loop in a multi-component forest and reports bridge splits", () => {
    // Component A: star 0-(1,2,3); component B: edge 4-5; isolated 6.
    const r = findLoops(
      7,
      graph(7, [
        [0, 1],
        [0, 2],
        [0, 3],
        [4, 5],
      ]),
    );
    expect(r.anyLoop).toBe(false);
    const split = r.isBridge(0, 1);
    expect(split).not.toBeNull();
    // One vertex (1) on one side, three (0,2,3) on the other, whichever
    // orientation the DFS picked.
    const counts = [split?.uVertices, split?.vVertices].sort();
    expect(counts).toEqual([1, 3]);
    const ab = r.isBridge(4, 5);
    expect(ab && ab.uVertices + ab.vVertices).toBe(2);
  });

  it("identifies cycle edges as loop edges and the tail as a bridge", () => {
    // Triangle 0-1-2 with a tail 2-3-4.
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 0],
      [2, 3],
      [3, 4],
    ];
    const r = findLoops(5, graph(5, edges));
    expect(r.anyLoop).toBe(true);
    expect(r.isLoopEdge(0, 1)).toBe(true);
    expect(r.isLoopEdge(1, 2)).toBe(true);
    expect(r.isLoopEdge(2, 0)).toBe(true);
    expect(r.isLoopEdge(2, 3)).toBe(false);
    expect(r.isLoopEdge(3, 4)).toBe(false);
    const tail = r.isBridge(2, 3);
    expect(tail).not.toBeNull();
    const counts = [tail?.uVertices, tail?.vVertices].sort();
    expect(counts).toEqual([2, 3]);
  });

  it("handles two independent cycles plus a connecting bridge", () => {
    // Squares 0-1-2-3 and 4-5-6-7, bridged 3-4.
    const cycleEdges: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
    ];
    const r = findLoops(8, graph(8, [...cycleEdges, [3, 4]]));
    expect(r.anyLoop).toBe(true);
    for (const [a, b] of cycleEdges) expect(r.isLoopEdge(a, b)).toBe(true);
    expect(r.isLoopEdge(3, 4)).toBe(false);
    const mid = r.isBridge(3, 4);
    expect(mid && mid.uVertices + mid.vVertices).toBe(8);
  });

  it("handles an empty graph", () => {
    const r = findLoops(0, () => []);
    expect(r.anyLoop).toBe(false);
  });

  it("marks every edge of a theta graph (two vertices, three paths) as a loop edge", () => {
    // 0—1 via three internally-disjoint paths: direct, via 2, via 3-4.
    const edges: [number, number][] = [
      [0, 1],
      [0, 2],
      [2, 1],
      [0, 3],
      [3, 4],
      [4, 1],
    ];
    const r = findLoops(5, graph(5, edges));
    expect(r.anyLoop).toBe(true);
    for (const [a, b] of edges) {
      expect(r.isLoopEdge(a, b)).toBe(true);
      expect(r.isBridge(a, b)).toBeNull();
    }
  });
});
