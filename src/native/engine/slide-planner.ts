/**
 * The shared planner for sliding-permutation games (Sixteen, Netslide).
 *
 * A sliding-permutation game is: a toroidal grid of pieces; a move slides one
 * whole line by some displacement, wrapping around; the board is finished when
 * the pieces show the right picture. Everything a *player* cares about — what
 * the pieces mean, what counts as finished, how to talk about a move — is the
 * game's. The search is not, and it is the hard part, so it lives here.
 *
 * The planner works on **the board as the player sees it**: one integer per
 * cell, whatever the game wants that integer to mean (Sixteen's tile numbers,
 * Netslide's wire masks). It never needs to know which *particular* piece is
 * which, and deliberately so — Netslide's tiles include many identical wires, so
 * two boards showing the same picture are the same position, and treating them
 * as different would have the search chasing arrangements no sequence of slides
 * can even produce.
 *
 * What it owns:
 *
 * - **A bucket-queue A\*** over the move set, with lazy node allocation. `f = g +
 *   h` is a small integer, so a bucket per `f` beats a comparison heap.
 * - **An exact bidirectional BFS** that returns a genuinely *shortest* path. Two
 *   uses, chosen by the game (see `exactSearch`): as a last resort when the
 *   heuristic is helpless, or up front when the board is close enough that a
 *   shortest plan is worth having.
 * - **The no-progress gate**, so the expensive search is not spent on boards the
 *   heuristic can already move.
 * - **Partial plans.** A search that improved on the starting board without
 *   reaching the goal returns the path to its best board. The plan runs out, the
 *   player is closer, and the next request recomputes.
 */

/**
 * One slide of a whole line, wrapping around.
 *
 * **`delta` is how far a piece travels**, not how far the line's contents are
 * read from: `{ axis: "row", index: 2, delta: +1 }` moves every piece of row 2
 * one cell to the right, and the rightmost piece wraps to the left. A game whose
 * own move type reads the other way round (Netslide's `dir` names the direction
 * the border *arrow* points, which shifts the contents the opposite way) negates
 * on the way in.
 */
export interface SlideMove {
  axis: "row" | "col";
  index: number;
  delta: number;
}

/** The problem the planner is handed. */
export interface SlidePuzzle {
  w: number;
  h: number;
  /** The board, row-major: one integer per cell, as the player sees it. */
  start: Int32Array;
  /** The finished board, in the same encoding. */
  goal: Int32Array;
  /** Every legal move. Both consumers have a state-independent move set — the
   * lines a game may slide never change mid-game — so this is a plain list. */
  moves: readonly SlideMove[];
  /**
   * How far a board is from finished. Nothing is assumed of it beyond being a
   * non-negative integer that is zero at `goal`; it steers the A\* and nothing
   * else, so a game is free to make it as sharp as it can afford.
   *
   * One warning, learned the hard way. It is tempting to fix a target *once* —
   * decide up front which piece is going to end up where, then measure the total
   * distance to that arrangement. For a game with interchangeable pieces this
   * quietly poisons the search: the further the board drifts from the one the
   * target was chosen on, the cheaper some *other* arrangement becomes, and the
   * frozen target starts reporting progress on moves that visibly make the
   * picture worse. Measure the board in front of you.
   */
  heuristic: (board: Int32Array) => number;
  /**
   * Finished? Defaults to "the board equals `goal`". A game whose win condition
   * is weaker (Netslide wins on *any* arrangement that powers every tile, not
   * only the one the generator drew) supplies its own, and the planner stops the
   * moment it holds.
   */
  isGoal?: (board: Int32Array) => boolean;
  /** Veto a candidate *first* move — used to refuse to undo the slide the player
   * just made, which is both useless advice and the shape a hint ping-pong
   * takes. */
  rejectFirstMove?: (m: SlideMove) => boolean;
  /** Forward-search budget, in nodes expanded. */
  maxStates?: number;
  /**
   * The exact bidirectional search. Omit it to disable it; a game decides for
   * itself whether the cost is worth it, and *when* to spend it:
   *
   * - **`"no-progress"`** — only at a strict local minimum, where the forward
   *   search improved on nothing at all and no budget will rescue it. The
   *   last-resort path (Sixteen's two-swapped-pairs endgame sits ~8 plies uphill
   *   of every slide, but meeting in the middle crosses it at ~4 a side).
   * - **`"first"`** — before the heuristic search runs at all, falling through to
   *   it if the ends do not meet inside the budget. The reason to want this is
   *   not that the plan comes out shorter. **A shortest plan is what stops a
   *   recomputed plan from cycling:** its first move provably shortens the true
   *   distance to the goal by one, so a hint recomputed after every move walks a
   *   strictly decreasing distance and must arrive. A heuristic plan carries no
   *   such guarantee, and near the finish it demonstrably loops — Netslide was
   *   found sending a board five slides of the same row, each separately scoring
   *   as progress, back to exactly where it started.
   *
   * **One budget, whichever you choose.** It is tempting to run a cheap search on
   * every board and hold a bigger one in reserve for when the heuristic proves
   * helpless. That breaks the guarantee in a way that is very hard to see: the big
   * search opens a descent from ten moves out, the player takes one step, and the
   * cheap search cannot sustain it from nine — so the heuristic takes back over and
   * walks the board round a loop. **The search that opens a descent must be the one
   * that finishes it.**
   */
  exactSearch?: {
    when: "first" | "no-progress";
    maxDepth: number;
    maxStates: number;
  };
}

export interface SlidePlan {
  /** The planned moves. Empty when the start is already the goal, or when the
   * search found nothing better than standing still. */
  moves: SlideMove[];
  /** Whether `moves` ends at the goal, as opposed to at the best board the
   * search reached inside its budget (a partial plan). */
  reachedGoal: boolean;
  /** Whether the exact bidirectional search was engaged. Exposed so a game's
   * tests can assert the no-progress gate still gates — a load-independent proxy
   * for the cost, never an elapsed-time assertion. */
  usedExactSearch: boolean;
}

/** Shortest distance between two positions on a wrap-around axis of length
 * `len`. */
export function toroidalDist(from: number, to: number, len: number): number {
  const d = Math.abs(from - to);
  return Math.min(d, len - d);
}

/** Apply `move` to `src`, writing the result into `dest`. The two must not
 * alias. */
export function slidePieces(
  src: Int32Array,
  dest: Int32Array,
  w: number,
  h: number,
  move: SlideMove,
): void {
  const { axis, index, delta } = move;
  dest.set(src);

  if (axis === "row") {
    const offset = index * w;
    for (let x = 0; x < w; x++) {
      const from = (((x - delta) % w) + w) % w;
      dest[offset + x] = src[offset + from];
    }
  } else {
    for (let y = 0; y < h; y++) {
      const from = (((y - delta) % h) + h) % h;
      dest[y * w + index] = src[from * w + index];
    }
  }
}

/**
 * A collision-free string key for a board of small integers, packed several cells
 * to a character.
 *
 * The search visits hundreds of thousands of boards for one hint and keys every
 * one of them, so this is genuinely the hot path: the obvious
 * one-character-per-cell version spends most of a hint building and hashing
 * 25-character strings. Packing to the cell's actual bit width (four bits for a
 * Netslide wire mask, five for a Sixteen tile) cuts that by roughly three.
 *
 * Fifteen bits per character, deliberately — it keeps every code unit well below
 * the surrogate range, so the string stays a plain sequence of BMP characters.
 */
function makeKeyFn(maxValue: number, cells: number): (arr: Int32Array) => string {
  let bits = 1;
  while (1 << bits <= maxValue) bits++;
  const perChar = Math.max(1, Math.floor(15 / bits));

  return (arr: Int32Array): string => {
    let key = "";
    for (let i = 0; i < cells; ) {
      let packed = 0;
      for (let k = 0; k < perChar && i < cells; k++, i++) {
        packed |= arr[i] << (k * bits);
      }
      key += String.fromCharCode(packed);
    }
    return key;
  };
}

function invert(m: SlideMove): SlideMove {
  return { ...m, delta: -m.delta };
}

/**
 * Exact bidirectional BFS from the board to the finished one: expand level by
 * level from both ends, always growing the smaller frontier, until the two
 * visited sets meet. Returns a **shortest** move path, or null when the ends do
 * not meet within the depth/state caps.
 *
 * *Shortest* is load-bearing, not a nicety, and it is the one thing here that is
 * easy to get subtly wrong: **finish the level before answering.** A meet
 * stumbled on midway through expanding a level is a path, but not necessarily
 * the cheapest one that level offers — the node it met may sit deeper in the
 * backward tree than another meet the same level would have turned up. A path
 * one move too long silently destroys the guarantee this search exists to
 * provide: its first move no longer has to shorten the distance to the goal, and
 * a plan recomputed after every move can then cycle for ever.
 */
function bidirectionalPlan(
  p: SlidePuzzle,
  caps: { maxDepth: number; maxStates: number },
  arrayToKey: (arr: Int32Array) => string,
): SlideMove[] | null {
  const { w, h, start, goal, moves } = p;
  const n = start.length;

  /** `parent` walks toward the start; `move` leads from the parent to here. */
  interface FwdInfo {
    parent: string | null;
    move: SlideMove | null;
    depth: number;
  }
  /** `parent` walks toward the goal; `out` is the forward-direction move that
   * leads from here to the parent. */
  interface BwdInfo {
    parent: string | null;
    out: SlideMove | null;
    depth: number;
  }
  interface FrontierNode {
    board: Int32Array;
    key: string;
    /** The move that produced this node, so its successors can be restricted to
     * a canonical ordering (see `redundant`). */
    from: SlideMove | null;
  }

  /**
   * Would this move, played after `prev`, only ever re-tread a board some other
   * ordering already reaches?
   *
   * Slides of the *same axis* commute — sliding row 0 and then row 3 lands
   * exactly where sliding row 3 and then row 0 does — so a plain breadth-first
   * search generates every permutation of a run of row-slides and throws all but
   * one away. Insisting that a run of same-axis moves goes in non-decreasing
   * index order keeps exactly one representative of each, and loses nothing: any
   * shortest path can be reordered into that form, because the moves it reorders
   * commute. It is a large saving — this search is the expensive half of a hint —
   * and it is what lets the budget reach far enough to cross an endgame with two
   * tiles swapped.
   *
   * The same-line immediate undo goes too. A shortest path never contains one:
   * it would be shorter without it.
   */
  const redundant = (prev: SlideMove | null, m: SlideMove): boolean => {
    if (!prev || prev.axis !== m.axis) return false;
    if (m.index < prev.index) return true;
    return m.index === prev.index && m.delta === -prev.delta;
  };

  const startKey = arrayToKey(start);
  const goalKey = arrayToKey(goal);
  const fwdSeen = new Map<string, FwdInfo>([
    [startKey, { parent: null, move: null, depth: 0 }],
  ]);
  const bwdSeen = new Map<string, BwdInfo>([
    [goalKey, { parent: null, out: null, depth: 0 }],
  ]);
  let fwdFrontier: FrontierNode[] = [{ board: start, key: startKey, from: null }];
  let bwdFrontier: FrontierNode[] = [{ board: goal, key: goalKey, from: null }];
  let fwdDepth = 0;
  let bwdDepth = 0;

  const scratch = new Int32Array(n);

  /** The path start→goal through a key present in both visited maps: the forward
   * parent chain (reversed), then the backward chain's outgoing moves. */
  const joinPaths = (meetKey: string): SlideMove[] => {
    const path: SlideMove[] = [];
    for (
      let info = fwdSeen.get(meetKey);
      info !== undefined && info.move !== null && info.parent !== null;
      info = fwdSeen.get(info.parent)
    ) {
      path.push(info.move);
    }
    path.reverse();
    for (
      let info = bwdSeen.get(meetKey);
      info !== undefined && info.out !== null && info.parent !== null;
      info = bwdSeen.get(info.parent)
    ) {
      path.push(info.out);
    }
    return path;
  };

  while (
    fwdFrontier.length > 0 &&
    bwdFrontier.length > 0 &&
    fwdDepth + bwdDepth < caps.maxDepth
  ) {
    const forward = fwdFrontier.length <= bwdFrontier.length;
    const frontier = forward ? fwdFrontier : bwdFrontier;
    const next: FrontierNode[] = [];
    const depth = (forward ? fwdDepth : bwdDepth) + 1;

    // Collect every meet this level turns up, so the cheapest can be taken once
    // the level is done (see the note above — this is what makes it shortest).
    let bestMeet: string | null = null;
    let bestTotal = Number.POSITIVE_INFINITY;

    for (const node of frontier) {
      // The budget is enforced *inside* the level, not merely between levels. One
      // level expands to many times the frontier, so a frontier already near the
      // cap balloons far past it before anyone looks again — a single hint was
      // measured taking 13.7 s against a nominal cap it had long since passed.
      // Abandoning mid-level means giving up rather than answering, because a meet
      // found before the level is finished is not guaranteed to be the cheapest,
      // and a path one move too long is worse than no path at all (see above).
      if (fwdSeen.size + bwdSeen.size >= caps.maxStates) return null;

      for (const move of moves) {
        if (redundant(node.from, move)) continue;

        slidePieces(node.board, scratch, w, h, move);
        const key = arrayToKey(scratch);

        if (forward) {
          if (fwdSeen.has(key)) continue;
          fwdSeen.set(key, { parent: node.key, move, depth });
          const other = bwdSeen.get(key);
          if (other && depth + other.depth < bestTotal) {
            bestTotal = depth + other.depth;
            bestMeet = key;
          }
        } else {
          if (bwdSeen.has(key)) continue;
          // Read forward, this edge runs successor --inv(move)--> node.
          bwdSeen.set(key, { parent: node.key, out: invert(move), depth });
          const other = fwdSeen.get(key);
          if (other && depth + other.depth < bestTotal) {
            bestTotal = depth + other.depth;
            bestMeet = key;
          }
        }
        next.push({ board: new Int32Array(scratch), key, from: move });
      }
    }

    if (bestMeet !== null) return joinPaths(bestMeet);

    if (forward) {
      fwdFrontier = next;
      fwdDepth = depth;
    } else {
      bwdFrontier = next;
      bwdDepth = depth;
    }
  }
  return null;
}

/**
 * Plan a sequence of slides from `start` toward the goal.
 *
 * Always returns *something* honest: the moves to the goal when it found them,
 * the moves to the best board it reached when it did not, or nothing at all when
 * standing still is already as good as the search could do.
 */
export function planSlides(p: SlidePuzzle): SlidePlan {
  const { w, h, start, moves, heuristic } = p;
  const n = start.length;
  const maxStates = p.maxStates ?? 4000;

  let maxValue = 0;
  for (let i = 0; i < n; i++) {
    if (start[i] > maxValue) maxValue = start[i];
    if (p.goal[i] > maxValue) maxValue = p.goal[i];
  }
  const arrayToKey = makeKeyFn(maxValue, n);
  const goalKey = arrayToKey(p.goal);
  const isGoal = p.isGoal ?? ((board: Int32Array) => arrayToKey(board) === goalKey);

  const startH = heuristic(start);
  if (startH === 0 || isGoal(start)) {
    return { moves: [], reachedGoal: true, usedExactSearch: false };
  }

  const exact = p.exactSearch;
  if (exact?.when === "first") {
    const shortest = bidirectionalPlan(p, exact, arrayToKey);
    if (shortest && shortest.length > 0) {
      return { moves: shortest, reachedGoal: true, usedExactSearch: true };
    }
    // Out of reach inside the budget: fall through to the heuristic, which at
    // least gets the board closer.
  }

  interface SearchNode {
    board: Int32Array;
    g: number;
    h: number;
    f: number;
    parent: SearchNode | null;
    move: SlideMove | null;
  }

  // Bucket queue: `f` is a small integer, so a bucket per f-value gives O(1)
  // insert and (amortised) O(1) pop-min.
  const buckets: SearchNode[][] = [];
  let minF = startH;
  let queueSize = 0;

  const push = (node: SearchNode) => {
    let bucket = buckets[node.f];
    if (!bucket) {
      bucket = [];
      buckets[node.f] = bucket;
    }
    bucket.push(node);
    if (node.f < minF) minF = node.f;
    queueSize++;
  };

  const popMin = (): SearchNode | null => {
    while (minF < buckets.length) {
      const bucket = buckets[minF];
      if (bucket && bucket.length > 0) {
        queueSize--;
        return bucket.pop() as SearchNode;
      }
      minF++;
    }
    return null;
  };

  const startNode: SearchNode = {
    board: start,
    g: 0,
    h: startH,
    f: startH,
    parent: null,
    move: null,
  };
  push(startNode);

  const visited = new Map<string, number>([[arrayToKey(start), 0]]);
  let bestNode = startNode;
  let goalNode: SearchNode | null = null;
  let expanded = 0;

  // Scratch buffer: generate a successor and test it against the visited set
  // *before* allocating anything for it.
  const scratch = new Int32Array(n);

  while (queueSize > 0 && expanded < maxStates) {
    const curr = popMin();
    if (!curr) break;
    expanded++;

    if (curr.h === 0 || isGoal(curr.board)) {
      goalNode = curr;
      break;
    }
    if (curr.h < bestNode.h) bestNode = curr;

    for (const move of moves) {
      if (curr.g === 0 && p.rejectFirstMove?.(move)) continue;

      slidePieces(curr.board, scratch, w, h, move);
      const key = arrayToKey(scratch);
      const nextG = curr.g + 1;

      const prevG = visited.get(key);
      if (prevG !== undefined && prevG <= nextG) continue;
      visited.set(key, nextG);

      const nextH = heuristic(scratch);
      push({
        board: new Int32Array(scratch),
        g: nextG,
        h: nextH,
        f: nextG + nextH,
        parent: curr,
        move,
      });
    }
  }

  const pathTo = (node: SearchNode): SlideMove[] => {
    const path: SlideMove[] = [];
    for (let at: SearchNode | null = node; at?.move != null; at = at.parent) {
      path.push(at.move);
    }
    return path.reverse();
  };

  if (goalNode) {
    return { moves: pathTo(goalNode), reachedGoal: true, usedExactSearch: false };
  }

  // The no-progress gate. `bestNode` is still the start node exactly when no
  // expanded board beat the start's heuristic — a strict local minimum, which no
  // forward budget will climb out of. Only there is the exact search worth its
  // cost: as the last resort for a game that keeps it in reserve, or at a bigger
  // budget for a game that already tried it cheaply and first.
  const noProgress = bestNode.move === null;
  if (noProgress && exact?.when === "no-progress") {
    const shortest = bidirectionalPlan(p, exact, arrayToKey);
    if (shortest) return { moves: shortest, reachedGoal: true, usedExactSearch: true };
    return { moves: [], reachedGoal: false, usedExactSearch: true };
  }

  return {
    moves: pathTo(bestNode),
    reachedGoal: false,
    usedExactSearch: exact?.when === "first",
  };
}
