/**
 * Inertia's two graph algorithms.
 *
 * Neither is a deductive solver — Inertia has no deductions. Instead:
 *
 * 1. `findGemCandidates` (upstream `find_gem_candidates`) tells the generator
 *    where a gem may legally be placed: the squares that lie on some round
 *    trip from the start back to the start. It searches **square + direction**
 *    pairs, not squares, because a square can be enterable only heading one
 *    way and leavable only heading another — you could collect a gem there and
 *    then never get home.
 *
 * 2. `solveRoute` (upstream `solve_game`) finds a route collecting every
 *    remaining gem. That is a travelling-salesman problem, so it does not try
 *    to be optimal: it grows a tour by repeatedly splicing in a round trip to
 *    the nearest uncollected gem, then repeatedly shortens redundant stretches
 *    until the tour stops shrinking.
 */

import {
  atGrid,
  BLANK,
  type Cell,
  DIRECTIONS,
  DX,
  DY,
  GEM,
  type InertiaState,
  MINE,
  STOP,
  WALL,
} from "./state.ts";

/** A node code packs a square with either a direction — a gem the ball is
 * sliding *through*, where it cannot turn — or `DIRECTIONS`, meaning the ball
 * is stationary there. So a square has `DIRECTIONS + 1` possible nodes. */
const DP1 = DIRECTIONS + 1;

/** The direction with this (sign-normalised) step, or -1. */
function directionOf(dx: number, dy: number): number {
  for (let d = 0; d < DIRECTIONS; d++) {
    if (DX[d] === dx && DY[d] === dy) return d;
  }
  return -1;
}

// --- gem candidates --------------------------------------------------

/**
 * Can the ball transition directly from (x1,y1) heading `dir1` to (x2,y2)
 * heading `dir2`? Upstream `can_go`.
 *
 * The start square is held as a `STOP` in `grid` (its index passed separately),
 * which is exactly how upstream treats it here — `can_go` accepts `STOP` and
 * `START` interchangeably.
 */
function canGo(
  grid: Uint8Array,
  w: number,
  h: number,
  x1: number,
  y1: number,
  dir1: number,
  x2: number,
  y2: number,
  dir2: number,
): boolean {
  // Standing on an unoccupyable square: no move is possible at all.
  const here = atGrid(grid, w, h, x1, y1);
  if (here === WALL || here === MINE) return false;

  // A move can stop at (x1,y1) — because the square stops it, or because the
  // next square along is a wall — and then set off again in any direction.
  if (
    x2 === x1 &&
    y2 === y1 &&
    (here === STOP || atGrid(grid, w, h, x1 + DX[dir1], y1 + DY[dir1]) === WALL)
  ) {
    return true;
  }

  // Otherwise a move already under way can carry on one square further.
  if (x2 === x1 + DX[dir1] && y2 === y1 + DY[dir1] && dir1 === dir2) {
    const next: Cell = atGrid(grid, w, h, x2, y2);
    if (next === BLANK || next === GEM || next === STOP) return true;
  }

  return false;
}

/**
 * The squares a gem may be placed on: those with some direction that is
 * reachable both *from* the start and *back to* the start. Returns a flag per
 * square (only ever set on `BLANK` squares) and how many are set.
 *
 * Two breadth-first searches over the `w · h · DIRECTIONS` space — one
 * following moves forwards from the start, one following them backwards to it.
 */
export function findGemCandidates(
  grid: Uint8Array,
  w: number,
  h: number,
  startIndex: number,
): { candidates: Uint8Array; count: number } {
  const wh = w * h;
  const sx = startIndex % w;
  const sy = Math.floor(startIndex / w);
  const queue = new Int32Array(wh * DIRECTIONS);

  const search = (forwards: boolean): Uint8Array => {
    const reachable = new Uint8Array(wh * DIRECTIONS);
    const sign = forwards ? +1 : -1;
    let head = 0;
    let tail = 0;

    for (let dir = 0; dir < DIRECTIONS; dir++) {
      const index = (sy * w + sx) * DIRECTIONS + dir;
      queue[tail++] = index;
      reachable[index] = 1;
    }

    while (head < tail) {
      const index = queue[head++];
      const dir = index % DIRECTIONS;
      const x = Math.floor(index / DIRECTIONS) % w;
      const y = Math.floor(index / (w * DIRECTIONS));

      // Where we can switch to: one step further along our current direction
      // (or one step back, when searching backwards), and every other
      // direction in this square (i.e. stopping and turning).
      for (let n = -1; n < DIRECTIONS; n++) {
        const x2 = n < 0 ? x + sign * DX[dir] : x;
        const y2 = n < 0 ? y + sign * DY[dir] : y;
        const d2 = n < 0 ? dir : n;
        if (x2 < 0 || x2 >= w || y2 < 0 || y2 >= h) continue;

        const i2 = (y2 * w + x2) * DIRECTIONS + d2;
        if (reachable[i2]) continue;

        const ok = forwards
          ? canGo(grid, w, h, x, y, dir, x2, y2, d2)
          : canGo(grid, w, h, x2, y2, d2, x, y, dir);
        if (ok) {
          queue[tail++] = i2;
          reachable[i2] = 1;
        }
      }
    }

    return reachable;
  };

  const reachableFrom = search(true);
  const reachableTo = search(false);

  const candidates = new Uint8Array(wh);
  let count = 0;
  for (let i = 0; i < wh; i++) {
    if (grid[i] !== BLANK) continue;
    for (let d = 0; d < DIRECTIONS; d++) {
      if (reachableFrom[i * DIRECTIONS + d] && reachableTo[i * DIRECTIONS + d]) {
        candidates[i] = 1;
        count++;
        break;
      }
    }
  }

  return { candidates, count };
}

// --- route solver ----------------------------------------------------

export type RouteResult = { ok: true; route: number[] } | { ok: false; error: string };

/**
 * Where a slide from (x,y) in direction `d` ends up, as a node code — or -1 if
 * it kills the ball. Upstream `move_goes_to`.
 *
 * The ball comes to rest (node direction `DIRECTIONS`) on a stop square or
 * against a wall; a gem interrupts the slide as a *directed* node, because the
 * ball arrives there still moving and cannot turn.
 */
function moveGoesTo(
  grid: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  d: number,
): number {
  let dr: number;
  for (;;) {
    if (atGrid(grid, w, h, x + DX[d], y + DY[d]) === WALL) {
      dr = DIRECTIONS; // hit a wall, so we end up stationary
      break;
    }
    x += DX[d];
    y += DY[d];
    const cell = atGrid(grid, w, h, x, y);
    if (cell === STOP) {
      dr = DIRECTIONS; // hit a stop, so we end up stationary
      break;
    }
    if (cell === GEM) {
      dr = d; // hit a gem, so we're still moving
      break;
    }
    if (cell === MINE) return -1; // hit a mine, so the move is invalid
  }
  return (y * w + x) * DP1 + dr;
}

/** The move graph, as the compressed adjacency pair upstream builds. */
interface Graph {
  /** Node code, indexed by graph vertex. */
  nodes: Int32Array;
  n: number;
  edges: Int32Array;
  edgeI: Int32Array;
  backEdges: Int32Array;
  backEdgeI: Int32Array;
}

/** Every vertex the ball can reach from where it stands, and the moves between
 * them. */
function buildGraph(
  grid: Uint8Array,
  w: number,
  h: number,
  px: number,
  py: number,
): Graph {
  const wh = w * h;
  const nodeIndex = new Int32Array(DP1 * wh).fill(-1);
  const nodes = new Int32Array(DP1 * wh);
  let head = 0;
  let tail = 0;

  nodes[tail] = (py * w + px) * DP1 + DIRECTIONS;
  nodeIndex[nodes[0]] = tail;
  tail++;

  while (head < tail) {
    const nc = nodes[head++];
    const d = nc % DP1;
    const sq = Math.floor(nc / DP1);
    const x = sq % w;
    const y = Math.floor(sq / w);

    // A mid-slide node can only carry on in its own direction; a stationary one
    // can set off in any.
    for (let dd = 0; dd < DIRECTIONS; dd++) {
      if (d < DIRECTIONS && d !== dd) continue;
      const nnc = moveGoesTo(grid, w, h, x, y, dd);
      if (nnc >= 0 && nnc !== nc && nodeIndex[nnc] < 0) {
        nodes[tail] = nnc;
        nodeIndex[nnc] = tail;
        tail++;
      }
    }
  }
  const n = head;

  // Forward edges, in direction order within each node.
  const edgeList: number[] = [];
  const edgeI = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    edgeI[i] = edgeList.length;
    const nc = nodes[i];
    const d = nc % DP1;
    const sq = Math.floor(nc / DP1);
    const x = sq % w;
    const y = Math.floor(sq / w);

    for (let dd = 0; dd < DIRECTIONS; dd++) {
      if (d < DIRECTIONS && d !== dd) continue;
      const nnc = moveGoesTo(grid, w, h, x, y, dd);
      if (nnc >= 0 && nnc !== nc) edgeList.push(nodeIndex[nnc]);
    }
  }
  edgeI[n] = edgeList.length;
  const edges = Int32Array.from(edgeList);

  // The transpose. Upstream builds it by sorting `target · n + source`; walking
  // the sources in ascending order and appending yields the identical grouping
  // and within-group order, with no sort at all.
  const backEdgeI = new Int32Array(n + 1);
  for (const t of edges) backEdgeI[t + 1]++;
  for (let i = 0; i < n; i++) backEdgeI[i + 1] += backEdgeI[i];
  const backEdges = new Int32Array(edges.length);
  const fill = backEdgeI.slice(0, n);
  for (let src = 0; src < n; src++) {
    for (let e = edgeI[src]; e < edgeI[src + 1]; e++) {
      backEdges[fill[edges[e]]++] = src;
    }
  }

  return { nodes: nodes.slice(0, n), n, edges, edgeI, backEdges, backEdgeI };
}

/** Breadth-first search from every seed, over forward or backward edges. */
function bfs(g: Graph, seeds: readonly number[], forwards: boolean): Int32Array {
  const ep = forwards ? g.edges : g.backEdges;
  const ei = forwards ? g.edgeI : g.backEdgeI;
  const dist = new Int32Array(g.n).fill(-1);
  const list = new Int32Array(g.n);
  let head = 0;
  let tail = 0;

  for (const s of seeds) {
    if (dist[s] < 0) {
      dist[s] = 0;
      list[tail++] = s;
    }
  }
  while (head < tail) {
    const ni = list[head++];
    for (let i = ei[ni]; i < ei[ni + 1]; i++) {
      const ti = ep[i];
      if (dist[ti] < 0) {
        dist[ti] = dist[ni] + 1;
        list[tail++] = ti;
      }
    }
  }
  return dist;
}

/**
 * A route from the ball's current position collecting every remaining gem, as
 * a sequence of directions. Upstream `solve_game`.
 */
export function solveRoute(state: InertiaState): RouteResult {
  const { w, h } = state.params;
  const wh = w * h;
  const grid = state.grid;

  if (!grid.includes(GEM)) return { ok: false, error: "Game is already solved" };

  const g = buildGraph(grid, w, h, state.px, state.py);
  const { nodes, edges, edgeI, backEdges, backEdgeI } = g;

  /* The tour is a circuit of graph vertices, which may (and usually will)
   * repeat vertices. It starts as just the ball's current position. */
  let circuit: number[] = [0];

  /** Gems still to collect while the tour grows; how many times each gem is
   * collected while it is reduced (upstream reuses one array for both). */
  const gemVisits = new Int32Array(wh);
  for (let i = 0; i < wh; i++) if (grid[i] === GEM) gemVisits[i] = 1;

  let error: string | null = null;

  // --- grow the tour, one gem at a time ---
  for (;;) {
    // Picking the *nearest* unreached gem is only a heuristic — any gem
    // reachable both ways would give a valid tour — but a near one tends to
    // give a shorter one.
    const distFromTour = bfs(g, circuit, true);
    const distToTour = bfs(g, circuit, false);

    let target = -1;
    let bestDist = -1;
    for (let i = 0; i < g.n; i++) {
      const sq = Math.floor(nodes[i] / DP1);
      if (!gemVisits[sq] || distFromTour[i] < 0 || distToTour[i] < 0) continue;
      const thisDist = distFromTour[i] + distToTour[i];
      if (bestDist < 0 || bestDist > thisDist) {
        bestDist = thisDist;
        target = i;
      }
    }
    if (target < 0) break; // no gem reachable at all: stop growing

    const distFromTarget = bfs(g, [target], true);
    const distToTarget = bfs(g, [target], false);

    // Either divert an existing edge A→B into A→target→B, or turn a single
    // vertex X into a round trip X→target→X. Whichever costs fewer moves.
    let n1 = -1;
    let n2 = -1;
    bestDist = -1;
    for (let i = 0; i < circuit.length; i++) {
      if (distFromTarget[circuit[i]] >= 0 && distToTarget[circuit[i]] >= 0) {
        const thisDist = distFromTarget[circuit[i]] + distToTarget[circuit[i]];
        if (bestDist < 0 || thisDist < bestDist) {
          bestDist = thisDist;
          n1 = i;
          n2 = i;
        }
      }
      if (
        i + 1 < circuit.length &&
        distToTarget[circuit[i]] >= 0 &&
        distFromTarget[circuit[i + 1]] >= 0
      ) {
        const thisDist = distToTarget[circuit[i]] + distFromTarget[circuit[i + 1]];
        if (bestDist < 0 || thisDist < bestDist) {
          bestDist = thisDist;
          n1 = i;
          n2 = i + 1;
        }
      }
    }
    if (bestDist < 0) {
      error = "Unable to find a solution from this starting point";
      break;
    }

    // Open up room for the detour, then write the shortest path into the
    // target and the shortest path back out of it into the gap. Note that when
    // n1 === n2 (a round trip out of a single vertex) the gap *opens on top of*
    // that vertex, so both endpoints have to be read before we splice —
    // upstream gets away without this only because its `memmove` leaves the
    // original value behind in the vacated slot.
    const fromNode = circuit[n1];
    const toNode = circuit[n2];
    let extraLen = distToTarget[fromNode] + distFromTarget[toNode];
    if (n1 !== n2) extraLen--;
    circuit = circuit
      .slice(0, n2)
      .concat(new Array<number>(extraLen).fill(-1), circuit.slice(n2));
    n2 += extraLen;

    for (const forwards of [false, true]) {
      const ep = forwards ? edges : backEdges;
      const ei = forwards ? edgeI : backEdgeI;
      const dp = forwards ? distToTarget : distFromTarget;
      const step = forwards ? +1 : -1;
      let dest = forwards ? n1 : n2;
      let ni = forwards ? fromNode : toNode;

      for (;;) {
        circuit[dest] = ni;
        if (dp[ni] === 0) break;
        dest += step;
        let next = -1;
        for (let i = ei[ni]; i < ei[ni + 1]; i++) {
          if (dp[ep[i]] === dp[ni] - 1) {
            next = ep[i];
            break;
          }
        }
        if (next < 0) throw new Error("inertia: shortest path vanished");
        ni = next;
      }
    }

    // Every gem the new stretch passes through is now collected.
    for (let i = n1; i <= n2; i++) gemVisits[Math.floor(nodes[circuit[i]] / DP1)] = 0;
  }

  /* The tour now collects every reachable gem, but wastefully: a detour we
   * carefully spliced in for one gem may have been made pointless by the
   * detour for a *later* gem passing through it anyway. So count how often each
   * gem is collected, then replace every maximal stretch whose removal would
   * strand no gem with a shortest path between its endpoints. Repeat,
   * alternating direction, until the tour stops shrinking. */
  while (!error) {
    const oldLen = circuit.length;

    for (const dir of [+1, -1]) {
      gemVisits.fill(0);
      for (const c of circuit) {
        const sq = Math.floor(nodes[c] / DP1);
        if (grid[sq] === GEM) gemVisits[sq]++;
      }
      // A gem we never collect at all means we never had a solution.
      let stranded = false;
      for (let i = 0; i < wh; i++) {
        if (grid[i] === GEM && gemVisits[i] === 0) stranded = true;
      }
      if (stranded) {
        error = "Unable to find a solution from this starting point";
        break;
      }

      let j = dir > 0 ? 0 : circuit.length - 1;
      for (let i = j; i < circuit.length && i >= 0; i += dir) {
        const sq = Math.floor(nodes[circuit[i]] / DP1);

        if (grid[sq] === GEM && gemVisits[sq] > 1) {
          gemVisits[sq]--; // collected elsewhere too, so this vertex is expendable
          continue;
        }
        if (grid[sq] !== GEM && i !== circuit.length - 1) continue;

        // circuit[i] collects a gem for its only time, or ends the tour, so it
        // has to stay: shorten the stretch from circuit[j] to circuit[i].
        let p = Math.min(i, j);
        let q = Math.max(i, j);

        const dist = bfs(g, [circuit[p]], true);
        const thisDist = dist[circuit[q]];
        if (thisDist < 0 || thisDist > q - p) {
          throw new Error("inertia: tour reduction found no path");
        }

        const rest = circuit.slice(q);
        circuit.length = p + thisDist;
        for (const c of rest) circuit.push(c);
        q = p + thisDist;
        if (dir > 0) i = q; // resume the scan at the shortened stretch's end

        // Write the shortest path into the gap, walking back from its end.
        let dest = q;
        let ni = circuit[q];
        for (;;) {
          circuit[dest] = ni;
          if (dist[ni] === 0) break;
          dest--;
          let prev = -1;
          for (let k = backEdgeI[ni]; k < backEdgeI[ni + 1]; k++) {
            if (dist[backEdges[k]] === dist[ni] - 1) {
              prev = backEdges[k];
              break;
            }
          }
          if (prev < 0) throw new Error("inertia: tour reduction lost its path");
          ni = prev;
        }

        // The replacement stretch collects gems of its own.
        while (++p < q) {
          const xy = Math.floor(nodes[circuit[p]] / DP1);
          if (grid[xy] === GEM) gemVisits[xy]++;
        }

        j = i;
      }
    }

    if (circuit.length === oldLen) break;
  }

  if (error) return { ok: false, error };

  // Encode the tour as directions. Mid-slide vertices are skipped: they are
  // gems the ball passes *through*, not places it stops and turns.
  const route: number[] = [];
  let x = Math.floor(nodes[circuit[0]] / DP1) % w;
  let y = Math.floor(Math.floor(nodes[circuit[0]] / DP1) / w);
  for (let i = 1; i < circuit.length; i++) {
    if (nodes[circuit[i]] % DP1 !== DIRECTIONS) continue;
    const sq = Math.floor(nodes[circuit[i]] / DP1);
    const x2 = sq % w;
    const y2 = Math.floor(sq / w);
    const d = directionOf(Math.sign(x2 - x), Math.sign(y2 - y));
    if (d < 0) throw new Error("inertia: tour step is not a straight move");
    route.push(d);
    x = x2;
    y = y2;
  }

  return { ok: true, route };
}
