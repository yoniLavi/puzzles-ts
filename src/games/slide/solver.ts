/**
 * Slide's solver: an exhaustive breadth-first search over canonical board
 * layouts (upstream `solve_board`). It returns the *minimum* number of moves
 * that brings the main block's anchor to the target, and optionally the move
 * sequence itself.
 *
 * One "move" is a whole slide: for each block, the search BFSes over every
 * square that block's anchor can be *slid* to (through any number of empty
 * squares, around corners), and each such position is one board at depth
 * `dist + 1`. So a five-square shuffle around a corner counts as one move,
 * matching what the player does with one drag.
 *
 * ## Why there is no `tree234` port here (design D1)
 *
 * Upstream uses `tree234` twice in this one function, in two *different*
 * roles, and neither is an ordered multiset — so this is deliberately **not**
 * a `tree234` port and deliberately **not** `SortedMultiset`, which is the
 * right answer for almost every other `tree234` in the collection
 * (playbook §2.1):
 *
 *  - `sorted` is a set of already-seen boards under the comparator
 *    `memcmp(a->data, b->data, w*h)`. It exists purely to **deduplicate by
 *    exact board bytes**; the ordering is never read out. ⇒ a `Map` keyed by
 *    the canonical bytes, which gives byte-exact dedup and somewhere to hang
 *    the BFS parent pointer for path reconstruction.
 *  - `queue` is created with a **`NULL` comparator** and driven by
 *    `addpos234(queue, b, qlen)` / `delpos234(queue, 0)`. A null comparator
 *    means it is not a sorted collection at all — it is an index-addressed
 *    list used as a **FIFO**. ⇒ a plain array with a head index.
 *
 * Neither substitution is observable. The result depends only on FIFO order
 * (which gives the shortest-path property) and on exact dedup; the tree's
 * internal ordering never decides which board is expanded next. Do not
 * "restore fidelity" by porting `tree234` here.
 *
 * The *enumeration* order, by contrast, **is** observable — it decides which
 * of several equally short solutions is reported, and the generator is gated
 * on this solver's verdict at every step, so the desc depends on it. The
 * per-anchor loop, the direction order (left, right, up, down) and the
 * apparently redundant re-enqueue of the anchor's own square are therefore
 * reproduced exactly.
 */

import { EMPTY, isAnchor, isDist, MAINANCHOR, type SlideStep } from "./state.ts";

export interface SolveOutcome {
  /** Minimum number of moves, or `-1` when unsolvable (or not solvable within
   * `movelimit`). */
  moves: number;
  /** The move sequence, when `wantPath` was set and a solution was found. */
  path: SlideStep[] | null;
}

interface BoardNode {
  data: Uint8Array;
  dist: number;
  prev: BoardNode | null;
}

/**
 * The visited set is bucketed by a 32-bit FNV-1a hash of the board bytes, with
 * an exact byte comparison inside each bucket — so its *semantics* are `memcmp`
 * equality, exactly as upstream's `boardcmp`, while nothing per-candidate is
 * allocated.
 *
 * The obvious encoding (a `Map` keyed by `String.fromCharCode(...data)`) was
 * measured at **35% of total generation time** on the 8×6 preset, because a
 * board string is built for every candidate move and most candidates turn out
 * to be duplicates. Hashing costs no allocation, and the byte-for-byte desc
 * differential proves the substitution changed no behaviour.
 */
function hashOf(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

function sameBoard(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Find the minimum move sequence taking the main block's anchor to
 * `(tx, ty)`.
 *
 * `movelimit >= 0` abandons the search as soon as a board at that depth is
 * dequeued, so the answer is "solvable in at most `movelimit` moves, and here
 * is the minimum" or `-1`. Pass `-1` for no limit.
 */
export function solveBoard(
  w: number,
  h: number,
  board: Uint8Array,
  forcefield: Uint8Array,
  tx: number,
  ty: number,
  movelimit: number,
  wantPath = false,
): SolveOutcome {
  const wh = w * h;

  const start: BoardNode = { data: board.slice(), dist: 0, prev: null };
  const visited = new Map<number, BoardNode[]>();
  visited.set(hashOf(start.data), [start]);
  const queue: BoardNode[] = [start];
  let qhead = 0;

  /** Candidate board, built in place and only copied out on a cache miss. */
  const scratch = new Uint8Array(wh);

  // Per-board scratch: `next[i]` is the following square of i's block,
  // `which[i]` the anchor its block belongs to.
  const next = new Int32Array(wh);
  const which = new Int32Array(wh);
  const anchors = new Uint8Array(wh);
  const movereached = new Uint8Array(wh);
  // One longer than the board: upstream never marks the starting square as
  // reached, so the anchor's own position can be enqueued a second time (the
  // "slide it back where it was" candidate, which the visited set then
  // discards). C writes one past its `wh`-element array here.
  const movequeue = new Int32Array(wh + 1);

  let solution: BoardNode | null = null;

  search: while (qhead < queue.length) {
    const b = queue[qhead++];
    if (movelimit >= 0 && b.dist >= movelimit) {
      // Not soluble in under `movelimit` moves, so stop right now.
      break;
    }
    const data = b.data;

    // Find every anchor and thread each block's squares into a linked list.
    for (let i = 0; i < wh; i++) {
      next[i] = -1;
      anchors[i] = 0;
      which[i] = -1;
      if (isAnchor(data[i])) {
        anchors[i] = 1;
        which[i] = i;
      } else if (isDist(data[i])) {
        const j = i - data[i];
        next[j] = i;
        which[i] = which[j];
      }
    }

    for (let i = 0; i < wh; i++) {
      if (!anchors[i]) continue;

      // An array-based BFS over the squares this block's anchor can slide to.
      movereached.fill(0);
      let mqhead = 0;
      let mqtail = 0;
      movequeue[mqtail++] = i;
      while (mqhead < mqtail) {
        const pos = movequeue[mqhead++];

        for (let dir = 0; dir < 4; dir++) {
          const dx = dir === 0 ? -1 : dir === 1 ? 1 : 0;
          const dy = dir === 2 ? -1 : dir === 3 ? 1 : 0;
          const newpos = pos + dy * w + dx;
          const d = newpos - i;

          // Every square of the block must land on an empty square, on a
          // square of this same block, and (unless this is the main block) not
          // on a forcefield. The in-range test comes first so the board reads
          // below are always in bounds.
          let j = i;
          for (; j >= 0; j = next[j]) {
            const rel = pos + j - i;
            const jy = Math.floor(rel / w) + dy;
            const jx = (rel % w) + dx;
            if (
              jy >= 0 &&
              jy < h &&
              jx >= 0 &&
              jx < w &&
              (data[j + d] === EMPTY || which[j + d] === i) &&
              (data[i] === MAINANCHOR || !forcefield[j + d])
            ) {
              /* this square is fine */
            } else break;
          }
          if (j >= 0) continue; // this direction wasn't feasible

          if (movereached[newpos]) continue;
          movereached[newpos] = 1;
          movequeue[mqtail++] = newpos;

          // A viable move: make it.
          scratch.set(data);
          for (let k = i; k >= 0; k = next[k]) scratch[k] = EMPTY;
          for (let k = i; k >= 0; k = next[k]) scratch[k + d] = data[k];

          const hash = hashOf(scratch);
          let bucket = visited.get(hash);
          if (bucket) {
            let seen = false;
            for (const node of bucket)
              if (sameBoard(node.data, scratch)) {
                seen = true;
                break;
              }
            if (seen) continue; // already got one
          } else {
            bucket = [];
            visited.set(hash, bucket);
          }

          const nd = scratch.slice();
          const nb: BoardNode = { data: nd, dist: b.dist + 1, prev: b };
          bucket.push(nb);
          queue.push(nb);
          if (nd[ty * w + tx] === MAINANCHOR) {
            solution = nb;
            break search;
          }
        }
      }
    }
  }

  if (!solution) return { moves: -1, path: null };

  const moves = solution.dist;
  if (!wantPath) return { moves, path: null };

  // Backtrack, diffing each consecutive pair of boards to recover which
  // block's anchor moved and where to. Exactly one square stops being an
  // anchor and exactly one starts, because the moved block's own squares
  // never held an anchor byte anywhere but at its anchor.
  const path = new Array<SlideStep>(moves);
  let cur: BoardNode = solution;
  let j = moves;
  while (cur.prev) {
    const prev = cur.prev;
    let from = -1;
    let to = -1;
    for (let i = 0; i < wh; i++) {
      if (isAnchor(prev.data[i]) && !isAnchor(cur.data[i])) from = i;
      else if (!isAnchor(prev.data[i]) && isAnchor(cur.data[i])) to = i;
    }
    if (from < 0 || to < 0)
      throw new Error("slide: could not recover a move from the solver's path");
    path[--j] = { from, to };
    cur = prev;
  }

  return { moves, path };
}
