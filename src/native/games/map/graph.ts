/**
 * Region-adjacency graph for Map (upstream `gengraph` + the graph helpers).
 *
 * The graph is a sorted edge list: each adjacency `(i, j)` is stored **twice**,
 * once as the value `i*n + j` and once as `j*n + i`, in ascending order. This
 * lets `graphVertexStart` binary-search the first edge leaving a vertex and
 * `graphEdgeIndex` binary-search a specific edge.
 */

/**
 * Build the adjacency edge list from a `w*h` region grid (`map[y*w+x]` = region
 * index). Returns the sorted edge list and its length. Upstream `gengraph`.
 */
export function gengraph(
  w: number,
  h: number,
  n: number,
  map: Int32Array,
): { graph: Int32Array; ngraph: number } {
  // Adjacency matrix first (as bytes; n*n can be large but n is modest).
  const adj = new Uint8Array(n * n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = map[y * w + x];
      if (x + 1 < w) {
        const vx = map[y * w + (x + 1)];
        if (vx !== v) {
          adj[v * n + vx] = 1;
          adj[vx * n + v] = 1;
        }
      }
      if (y + 1 < h) {
        const vy = map[(y + 1) * w + x];
        if (vy !== v) {
          adj[v * n + vy] = 1;
          adj[vy * n + v] = 1;
        }
      }
    }

  // Compact the matrix into a sorted list of the set indices.
  let ngraph = 0;
  for (let i = 0; i < n * n; i++) if (adj[i]) ngraph++;
  const graph = new Int32Array(ngraph);
  let j = 0;
  for (let i = 0; i < n * n; i++) if (adj[i]) graph[j++] = i;

  return { graph, ngraph };
}

/** Binary-search the index of edge `(i, j)` in `graph`, or -1. */
export function graphEdgeIndex(
  graph: Int32Array,
  n: number,
  ngraph: number,
  i: number,
  j: number,
): number {
  const v = i * n + j;
  let bot = -1;
  let top = ngraph;
  while (top - bot > 1) {
    const mid = (top + bot) >> 1;
    if (graph[mid] === v) return mid;
    if (graph[mid] < v) bot = mid;
    else top = mid;
  }
  return -1;
}

/** True iff regions `i` and `j` are adjacent. */
export function graphAdjacent(
  graph: Int32Array,
  n: number,
  ngraph: number,
  i: number,
  j: number,
): boolean {
  return graphEdgeIndex(graph, n, ngraph, i, j) >= 0;
}

/** Index of the first edge leaving vertex `i` (the run `[i*n, (i+1)*n)`). */
export function graphVertexStart(
  graph: Int32Array,
  n: number,
  ngraph: number,
  i: number,
): number {
  const v = i * n;
  let bot = -1;
  let top = ngraph;
  while (top - bot > 1) {
    const mid = (top + bot) >> 1;
    if (graph[mid] < v) bot = mid;
    else top = mid;
  }
  return top;
}
