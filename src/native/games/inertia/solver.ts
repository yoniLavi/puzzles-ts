/**
 * Inertia's two graph algorithms. Neither is a deductive solver — Inertia has
 * no deductions:
 *
 * 1. `findGemCandidates` tells the generator where a gem may legally go: the
 *    squares that lie on some round trip from the start back to the start.
 *
 * 2. `solveRoute` finds a route collecting every remaining gem. That is a
 *    travelling-salesman problem, so it does not try to be optimal: it grows a
 *    tour by splicing in a detour to one uncollected gem after another, then
 *    repeatedly shortens redundant stretches until the tour stops shrinking.
 *
 * Both search the same space — not squares, but **square + condition** pairs
 * (see `AT_REST`). That distinction is the heart of the game: the ball arriving
 * at a square mid-slide is in a different position from the ball standing on
 * it, because it cannot turn.
 */

import {
  BLANK,
  type Board,
  DIRECTIONS,
  DX,
  DY,
  GEM,
  type InertiaState,
  MINE,
  STOP,
  WALL,
} from "./state.ts";

const UNSOLVABLE = "Unable to find a solution from this starting point";

// --- what the ball can do --------------------------------------------

/**
 * Can the ball go straight from "at (x1,y1) heading `dir1`" to "at (x2,y2)
 * heading `dir2`"? There are exactly two ways.
 */
function canGo(
  board: Board,
  x1: number,
  y1: number,
  dir1: number,
  x2: number,
  y2: number,
  dir2: number,
): boolean {
  const here = board.at(x1, y1);
  if (here === WALL || here === MINE) return false; // it can't be there at all

  // It can stop where it is — the square catches it, or a wall blocks the way
  // on — and then set off again in any direction it likes.
  const stops = here === STOP || board.at(x1 + DX[dir1], y1 + DY[dir1]) === WALL;
  if (x2 === x1 && y2 === y1 && stops) return true;

  // Or a slide already under way can carry on one more square.
  if (dir1 === dir2 && x2 === x1 + DX[dir1] && y2 === y1 + DY[dir1]) {
    const next = board.at(x2, y2);
    return next === BLANK || next === GEM || next === STOP;
  }

  return false;
}

// --- gem candidates ---------------------------------------------------

/**
 * The squares a gem may be placed on: those the ball can both reach *and* get
 * back from. Two breadth-first searches — one following moves forwards from the
 * start, one following them backwards to it — and a square qualifies when some
 * single direction survives both.
 *
 * Searching square+direction pairs rather than squares is the whole point: a
 * square can be enterable only heading north and leavable only heading east, so
 * "reachable" and "returnable" must agree on *how* the ball is standing there,
 * or a gem could be collected and never brought home.
 *
 * Returns the qualifying squares in ascending order (the generator shuffles
 * them, so the order it starts from must be deterministic).
 */
export function findGemCandidates(board: Board, startSquare: number): number[] {
  const reachableFrom = floodDirections(board, startSquare, true);
  const reachableTo = floodDirections(board, startSquare, false);

  const candidates: number[] = [];
  for (let square = 0; square < board.area; square++) {
    if (board.cell(square) !== BLANK) continue;
    for (let dir = 0; dir < DIRECTIONS; dir++) {
      const i = square * DIRECTIONS + dir;
      if (reachableFrom[i] && reachableTo[i]) {
        candidates.push(square);
        break;
      }
    }
  }
  return candidates;
}

/**
 * Flag every (square, direction) the ball can get *to* from the start
 * (`forwards`), or can get *to the start from* (`!forwards`).
 */
function floodDirections(
  board: Board,
  startSquare: number,
  forwards: boolean,
): Uint8Array {
  const reached = new Uint8Array(board.area * DIRECTIONS);
  const queue: number[] = [];
  const sign = forwards ? +1 : -1;

  // The ball starts at rest, so it may be facing any way at all.
  for (let dir = 0; dir < DIRECTIONS; dir++) {
    const i = startSquare * DIRECTIONS + dir;
    reached[i] = 1;
    queue.push(i);
  }

  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const dir = i % DIRECTIONS;
    const square = Math.floor(i / DIRECTIONS);
    const x = board.x(square);
    const y = board.y(square);

    // Two kinds of neighbour: one square along the current direction (or one
    // square back, searching backwards); or the same square facing some other
    // way, which is the ball stopping here and turning.
    for (let n = -1; n < DIRECTIONS; n++) {
      const sliding = n < 0;
      const x2 = sliding ? x + sign * DX[dir] : x;
      const y2 = sliding ? y + sign * DY[dir] : y;
      const dir2 = sliding ? dir : n;
      if (!board.inside(x2, y2)) continue;

      const i2 = board.square(x2, y2) * DIRECTIONS + dir2;
      if (reached[i2]) continue;

      const ok = forwards
        ? canGo(board, x, y, dir, x2, y2, dir2)
        : canGo(board, x2, y2, dir2, x, y, dir);
      if (!ok) continue;

      reached[i2] = 1;
      queue.push(i2);
    }
  }

  return reached;
}

// --- the move graph ---------------------------------------------------

/**
 * A **node** is the ball at a square, in one of `DIRECTIONS + 1` conditions: at
 * rest, or still sliding in one of the eight directions.
 *
 * Sliding nodes only ever occur on gems — the one thing that interrupts a slide
 * without stopping it. They cannot be merged with the at-rest node for that
 * square: the ball arrives still moving and has no choice but to carry on, so a
 * gem is not one place but up to eight, and they are not interchangeable.
 */
const AT_REST = DIRECTIONS;
const CONDITIONS = DIRECTIONS + 1;

const nodeAt = (square: number, condition: number): number =>
  square * CONDITIONS + condition;

/** Where a slide from (x, y) heading `dir` ends up, as a node — or -1 if it
 * runs the ball onto a mine. */
function slideTo(board: Board, x: number, y: number, dir: number): number {
  for (;;) {
    // The next square is a wall (or the void beyond the board): stop here.
    if (board.at(x + DX[dir], y + DY[dir]) === WALL) {
      return nodeAt(board.square(x, y), AT_REST);
    }
    x += DX[dir];
    y += DY[dir];

    const cell = board.at(x, y);
    if (cell === MINE) return -1;
    if (cell === STOP) return nodeAt(board.square(x, y), AT_REST);
    if (cell === GEM) return nodeAt(board.square(x, y), dir); // still moving
  }
}

/** Everywhere the ball can get to from where it stands, and the moves between
 * those places. Vertex 0 is the ball's current position. */
class MoveGraph {
  /** Node code, per vertex. */
  private readonly nodes: number[] = [];
  private readonly out: number[][] = [];
  private readonly in: number[][] = [];

  constructor(
    readonly board: Board,
    px: number,
    py: number,
  ) {
    const vertexOf = new Map<number, number>();
    const vertexFor = (node: number): number => {
      let v = vertexOf.get(node);
      if (v === undefined) {
        v = this.nodes.length;
        vertexOf.set(node, v);
        this.nodes.push(node);
        this.out.push([]);
        this.in.push([]);
      }
      return v;
    };

    vertexFor(nodeAt(board.square(px, py), AT_REST));

    // Breadth-first over the moves. `nodes` doubles as the queue: each newly
    // discovered vertex is appended, and we walk to the end of the list.
    for (let v = 0; v < this.nodes.length; v++) {
      const square = Math.floor(this.nodes[v] / CONDITIONS);
      const condition = this.nodes[v] % CONDITIONS;

      for (let dir = 0; dir < DIRECTIONS; dir++) {
        // Mid-slide the ball has no choice; at rest it may go any way.
        if (condition !== AT_REST && condition !== dir) continue;

        const dest = slideTo(board, board.x(square), board.y(square), dir);
        // A fatal move is no move; a move that ends where it began (blocked by
        // a wall on the very first square) is no move either.
        if (dest < 0 || dest === this.nodes[v]) continue;

        const w = vertexFor(dest);
        this.out[v].push(w);
        this.in[w].push(v);
      }
    }
  }

  get size(): number {
    return this.nodes.length;
  }

  squareOf(v: number): number {
    return Math.floor(this.nodes[v] / CONDITIONS);
  }

  /** Is this vertex a place the ball stops (rather than a gem it slides
   * through)? Only at-rest vertices are moves in the route. */
  isAtRest(v: number): boolean {
    return this.nodes[v] % CONDITIONS === AT_REST;
  }

  hasGem(v: number): boolean {
    return this.board.cell(this.squareOf(v)) === GEM;
  }

  /** Distance from the nearest seed to every vertex; -1 where unreachable. */
  distancesFrom(seeds: Iterable<number>): Int32Array {
    return this.search(seeds, this.out);
  }

  /** Distance from every vertex to the nearest seed; -1 where there is no way. */
  distancesTo(seeds: Iterable<number>): Int32Array {
    return this.search(seeds, this.in);
  }

  private search(seeds: Iterable<number>, adjacent: number[][]): Int32Array {
    const dist = new Int32Array(this.size).fill(-1);
    const queue: number[] = [];

    for (const seed of seeds) {
      if (dist[seed] < 0) {
        dist[seed] = 0;
        queue.push(seed);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      for (const w of adjacent[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          queue.push(w);
        }
      }
    }
    return dist;
  }

  /**
   * A shortest path starting at `from` and ending at the vertex `distancesTo`
   * was built for: each step is a successor one step closer. Both ends included.
   */
  pathFrom(from: number, distancesTo: Int32Array): number[] {
    const path = [from];
    for (let v = from; distancesTo[v] > 0; ) {
      const next = this.out[v].find((w) => distancesTo[w] === distancesTo[v] - 1);
      if (next === undefined) throw new Error("inertia: BFS distances disagree");
      path.push(next);
      v = next;
    }
    return path;
  }

  /** The mirror image: a shortest path from the vertex `distancesFrom` was
   * built for, ending at `to`. Both ends included. */
  pathTo(to: number, distancesFrom: Int32Array): number[] {
    const path = [to];
    for (let v = to; distancesFrom[v] > 0; ) {
      const prev = this.in[v].find((w) => distancesFrom[w] === distancesFrom[v] - 1);
      if (prev === undefined) throw new Error("inertia: BFS distances disagree");
      path.push(prev);
      v = prev;
    }
    return path.reverse();
  }
}

// --- the route solver -------------------------------------------------

export type RouteResult = { ok: true; route: number[] } | { ok: false; error: string };

/**
 * A route from the ball's current position that collects every remaining gem,
 * as a sequence of directions.
 *
 * Two tours are grown and the shorter one wins. They differ only in which gem
 * they reach for next: the **nearest** uncollected one, or the **farthest**.
 * Nearest is the obvious greedy choice (and the one upstream makes); farthest is
 * the counter-intuitive classic — committing to the awkward, far-flung gems
 * while the tour is still short lays down a skeleton the near ones can be
 * threaded onto later, instead of leaving them stranded at the end — and on this
 * game's boards it usually wins outright. Growing both is a few milliseconds and
 * can only beat either.
 */
export function solveRoute(state: InertiaState): RouteResult {
  const { board } = state;
  const gems = board.gemSquares();
  if (gems.length === 0) return { ok: false, error: "Game is already solved" };

  const graph = new MoveGraph(board, state.px, state.py);
  let best: number[] | null = null;

  for (const reach of REACH_ORDERS) {
    const grown = growTour(graph, gems, reach);
    if (!grown) continue;
    const tour = shortenTour(graph, grown);

    // Shortening only ever drops a visit to a gem it can see collected
    // elsewhere (see `shortenPass`), so this holds by construction — but
    // collecting the gems is the route's whole job, so make sure of it.
    const collected = new Set(tour.map((v) => graph.squareOf(v)));
    if (gems.some((square) => !collected.has(square))) {
      throw new Error("inertia: the tour lost a gem");
    }

    const route = encodeRoute(graph, tour);
    if (!best || route.length < best.length) best = route;
  }

  return best ? { ok: true, route: best } : { ok: false, error: UNSOLVABLE };
}

/** Which uncollected gem the tour reaches for next. See `solveRoute`. */
const REACH_ORDERS = ["nearest", "farthest"] as const;
type Reach = (typeof REACH_ORDERS)[number];

/**
 * A walk from the ball's position passing over every gem, grown one gem at a
 * time: take the gem the tour can most cheaply reach and get back from (or the
 * one it can least cheaply, per `reach`), and splice a detour to it into the
 * tour. Null if some gem cannot be worked in at all.
 */
function growTour(
  g: MoveGraph,
  gemSquares: readonly number[],
  reach: Reach,
): number[] | null {
  const uncollected = new Set(gemSquares);
  let tour = [0]; // the ball, standing still

  while (uncollected.size > 0) {
    const fromTour = g.distancesFrom(tour);
    const toTour = g.distancesTo(tour);

    // The cost of a detour out to a gem and back is what ranks it. This is only
    // a lower bound on what the splice will really cost — the way out and the
    // way back may leave from different points of the tour — but it is the
    // cheap estimate, and both orderings are heuristics anyway.
    let target = -1;
    let bestCost = reach === "nearest" ? Infinity : -Infinity;
    for (let v = 0; v < g.size; v++) {
      if (!uncollected.has(g.squareOf(v))) continue;
      if (fromTour[v] < 0 || toTour[v] < 0) continue;

      const cost = fromTour[v] + toTour[v];
      if (reach === "nearest" ? cost < bestCost : cost > bestCost) {
        bestCost = cost;
        target = v;
      }
    }
    if (target < 0) return null; // a gem no move can reach, or come back from

    const grown = spliceDetour(g, tour, target);
    if (!grown) return null;
    tour = grown;

    for (const v of tour) uncollected.delete(g.squareOf(v));
  }

  return tour;
}

/**
 * Insert a detour collecting `target` into the tour, wherever it costs the
 * fewest extra moves. Two shapes:
 *
 * - **divert a step**: replace `tour[i] → tour[i+1]` with `tour[i] → target →
 *   tour[i+1]`. The step itself goes away, so this costs one move less than the
 *   two paths it is built from;
 * - **round trip**: replace the single vertex `tour[i]` with an excursion out
 *   to `target` and back to it.
 *
 * Returns null when the target cannot be worked in at all. The tour can reach
 * it and it can reach the tour — that is how it was picked — but an insertion
 * needs both of those at *adjacent* points of the tour, which is a stronger ask
 * in a directed graph.
 */
function spliceDetour(g: MoveGraph, tour: number[], target: number): number[] | null {
  const toTarget = g.distancesTo([target]); // vertex → target
  const fromTarget = g.distancesFrom([target]); // target → vertex

  let leave = -1; // tour index the detour leaves from…
  let rejoin = -1; // …and the one it comes back to
  let bestCost = Infinity;

  for (let i = 0; i < tour.length; i++) {
    const out = toTarget[tour[i]];
    if (out < 0) continue; // no way to the gem from here

    const back = fromTarget[tour[i]];
    if (back >= 0 && out + back < bestCost) {
      bestCost = out + back;
      leave = i;
      rejoin = i;
    }

    const onwards = i + 1 < tour.length ? fromTarget[tour[i + 1]] : -1;
    if (onwards >= 0 && out + onwards - 1 < bestCost) {
      bestCost = out + onwards - 1;
      leave = i;
      rejoin = i + 1;
    }
  }
  if (leave < 0) return null;

  const detour = [
    ...g.pathFrom(tour[leave], toTarget), // tour[leave] … target
    ...g.pathTo(tour[rejoin], fromTarget).slice(1), // … tour[rejoin] (target once)
  ];
  return [...tour.slice(0, leave), ...detour, ...tour.slice(rejoin + 1)];
}

/**
 * The grown tour is wasteful: a detour carefully spliced in to collect one gem
 * may have been made pointless by a *later* detour that passes through it
 * anyway. So shorten it.
 *
 * A vertex is **pinned** if it makes the tour's only visit to some gem, or if
 * it ends the tour. Everything between two consecutive pinned vertices is
 * expendable, and can be replaced by the shortest path between them. Sweep the
 * tour doing that, alternating direction — a gem visited twice can give up
 * either visit, and which one is worth giving up depends on which way you look
 * — until the tour stops shrinking.
 */
function shortenTour(g: MoveGraph, tour: number[]): number[] {
  for (;;) {
    const before = tour.length;
    tour = shortenPass(g, tour, +1);
    tour = shortenPass(g, tour, -1);
    if (tour.length === before) return tour;
  }
}

function shortenPass(g: MoveGraph, tour: number[], step: 1 | -1): number[] {
  // How many times the tour visits each gem. The sweep *spends* a visit each
  // time it passes one that is collected elsewhere too, so the last visit it
  // meets — in sweep order — always finds a count of 1 and pins its vertex.
  // That is why no gem can be stranded, whichever way we sweep.
  const visits = new Map<number, number>();
  for (const v of tour) {
    if (g.hasGem(v)) visits.set(g.squareOf(v), (visits.get(g.squareOf(v)) ?? 0) + 1);
  }

  let anchor = step > 0 ? 0 : tour.length - 1;

  for (let i = anchor; i >= 0 && i < tour.length; i += step) {
    const square = g.squareOf(tour[i]);
    const count = visits.get(square);

    if (count !== undefined && count > 1) {
      visits.set(square, count - 1); // spend this visit: the gem is collected elsewhere
      continue;
    }
    // Not a gem, and not the tour's final vertex: nothing needs it to be here.
    if (count === undefined && i !== tour.length - 1) continue;

    // tour[i] is pinned, so the whole expendable stretch back to the previous
    // pinned vertex can collapse to the shortest path between the two.
    const from = Math.min(i, anchor);
    const to = Math.max(i, anchor);

    const distances = g.distancesTo([tour[to]]);
    const length = distances[tour[from]];
    if (length < 0 || length > to - from) {
      // The stretch we are replacing is itself a walk from `from` to `to`, so a
      // shortest path exists and cannot be longer than it.
      throw new Error("inertia: tour reduction found no shorter path");
    }

    tour = [
      ...tour.slice(0, from),
      ...g.pathFrom(tour[from], distances),
      ...tour.slice(to + 1),
    ];

    // The replacement collects gems of its own, on the way past.
    for (let k = from + 1; k < from + length; k++) {
      if (g.hasGem(tour[k])) {
        visits.set(g.squareOf(tour[k]), (visits.get(g.squareOf(tour[k])) ?? 0) + 1);
      }
    }

    // Sweeping forwards the pinned vertex has moved back to `from + length`;
    // sweeping backwards it is at `from === i` and everything before it — where
    // we are headed — is untouched.
    if (step > 0) i = from + length;
    anchor = i;
  }

  return tour;
}

/**
 * The tour as a sequence of directions. Sliding vertices drop out: they are
 * gems the ball passes *through*, not places it stops and turns, so the moves
 * are the steps between consecutive at-rest vertices.
 */
function encodeRoute(g: MoveGraph, tour: number[]): number[] {
  const route: number[] = [];
  let from = g.squareOf(tour[0]);

  for (const v of tour.slice(1)) {
    if (!g.isAtRest(v)) continue;
    const to = g.squareOf(v);
    const dir = directionBetween(g.board, from, to);
    if (dir < 0) throw new Error("inertia: tour step is not a straight move");
    route.push(dir);
    from = to;
  }

  return route;
}

/** Direction index by (dx, dy) step, each in -1..1; -1 for the centre of the
 * 3×3, which is no move at all. */
const DIRECTION_BY_STEP: readonly number[] = (() => {
  const table = new Array<number>(9).fill(-1);
  for (let d = 0; d < DIRECTIONS; d++) table[(DY[d] + 1) * 3 + (DX[d] + 1)] = d;
  return table;
})();

/** The direction of a straight-line move between two squares, or -1 if they
 * are not in a straight line (which would mean the tour was not made of moves). */
function directionBetween(board: Board, from: number, to: number): number {
  const dx = board.x(to) - board.x(from);
  const dy = board.y(to) - board.y(from);
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return -1;
  return DIRECTION_BY_STEP[(Math.sign(dy) + 1) * 3 + (Math.sign(dx) + 1)];
}
