/**
 * Loop/bridge finding in undirected graphs — idiomatic TS port of upstream
 * `findloop.c` (Tarjan's bridge-finding algorithm, the non-recursive
 * doubly-linked-list variant credited to
 * https://mathstodon.xyz/@abacabadabacaba@infosec.exchange/113113280480134188).
 *
 * A bridge is an edge whose removal would disconnect its component; an edge
 * is part of a loop exactly when it is *not* a bridge. Games use this for
 * live loop-error highlighting (Slant) and bridge analysis (Bridges,
 * Dominosa, Loopy, Tracks when ported).
 *
 * Deterministic and RNG-free. The C's stateful `neighbour_fn_t` re-entry
 * protocol (`vertex >= 0` starts iteration, `-1` continues) becomes an
 * ordinary `(vertex) => Iterable<number>` callback.
 */

/** Vertex counts on the two sides of a bridge edge. */
export interface BridgeSplit {
  /** Vertices on `u`'s side of the bridge (including `u`). */
  uVertices: number;
  /** Vertices on `v`'s side of the bridge (including `v`). */
  vVertices: number;
}

export interface FindLoopResult {
  /** True iff the graph contains at least one loop. */
  anyLoop: boolean;
  /** Is the edge `u`–`v` (which must be a real edge of the graph) part of
   * some loop — i.e. not a bridge? */
  isLoopEdge(u: number, v: number): boolean;
  /** If the edge `u`–`v` is a bridge, the vertex counts on either side;
   * `null` when it is a loop edge. */
  isBridge(u: number, v: number): BridgeSplit | null;
}

/**
 * Run the bridge-finding DFS over an undirected graph with vertices
 * `0 … nvertices−1`. `neighbours(v)` yields every vertex adjacent to `v`
 * (each edge must be reported from both endpoints, as upstream).
 */
export function findLoops(
  nvertices: number,
  neighbours: (vertex: number) => Iterable<number>,
): FindLoopResult {
  // One flat record per vertex, exactly upstream's `struct findloopstate`.
  const depth = new Int32Array(nvertices).fill(-1);
  const shallowestReachable = new Int32Array(nvertices).fill(nvertices);
  const subtreeSize = new Int32Array(nvertices).fill(1);
  const parent = new Int32Array(nvertices).fill(-1);
  const componentRoot = new Int32Array(nvertices);
  const prev = new Int32Array(nvertices);
  const next = new Int32Array(nvertices);
  for (let i = 0; i < nvertices; i++) {
    componentRoot[i] = i;
    prev[i] = i - 1;
    next[i] = i === nvertices - 1 ? -1 : i + 1;
  }

  let anyLoop = false;

  // The DFS visits each node twice — once on the way down (schedule the
  // children just before it in the list, note back-edges), once on the way
  // back up (fold subtree stats into the parent). The doubly-linked list
  // is the work queue; moving an already-listed child lets the same vertex
  // be re-scheduled at a deeper position without duplication.
  let v = nvertices > 0 ? 0 : -1;
  while (v !== -1) {
    const u = v;
    if (depth[u] < 0) {
      // First visit (on the way down).
      if (parent[u] < 0) {
        depth[u] = 0;
        componentRoot[u] = u;
      } else {
        depth[u] = depth[parent[u]] + 1;
        componentRoot[u] = componentRoot[parent[u]];
      }

      // Schedule visits to the neighbours, and then back here.
      v = u;
      for (const w of neighbours(u)) {
        if (w === parent[u]) continue;
        if (depth[w] < 0) {
          parent[w] = u;
          // Remove the neighbour from the linked list…
          if (prev[w] >= 0) next[prev[w]] = next[w];
          if (next[w] >= 0) prev[next[w]] = prev[w];
          // …and re-insert it immediately before the next node to visit.
          prev[w] = prev[v];
          next[w] = v;
          if (prev[v] >= 0) next[prev[v]] = w;
          prev[v] = w;
          // Mark this as the next node to visit.
          v = w;
        } else {
          // Back-edge to an ancestor: part of a loop.
          shallowestReachable[u] = Math.min(shallowestReachable[u], depth[w]);
          anyLoop = true;
        }
      }
    } else {
      // Second visit (on the way back up): fold stats into the parent.
      if (parent[u] >= 0) {
        subtreeSize[parent[u]] += subtreeSize[u];
        shallowestReachable[parent[u]] = Math.min(
          shallowestReachable[parent[u]],
          shallowestReachable[u],
        );
      }
      v = next[u];
    }
  }

  // In the DFS forest every edge is parent→child or child→ancestor. A
  // parent→child edge is a bridge iff nothing in the child's subtree
  // reaches an ancestor of the child.
  const isBridgeOneWay = (u: number, w: number): BridgeSplit | null => {
    if (parent[u] !== w) return null;
    if (shallowestReachable[u] < depth[u]) return null;
    const r = componentRoot[u];
    return {
      uVertices: subtreeSize[u],
      vVertices: subtreeSize[r] - subtreeSize[u],
    };
  };

  return {
    anyLoop,
    isLoopEdge(u: number, w: number): boolean {
      if (parent[u] === w && shallowestReachable[u] >= depth[u]) return false;
      if (parent[w] === u && shallowestReachable[w] >= depth[w]) return false;
      return true;
    },
    isBridge(u: number, w: number): BridgeSplit | null {
      const forward = isBridgeOneWay(u, w);
      if (forward) return forward;
      const backward = isBridgeOneWay(w, u);
      if (backward) {
        return { uVertices: backward.vVertices, vVertices: backward.uVertices };
      }
      return null;
    },
  };
}
