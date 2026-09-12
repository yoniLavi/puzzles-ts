/**
 * Slide's board generator (upstream `generate_board` / `new_game_desc`).
 *
 * The algorithm has four stages, and the *only* randomness in the whole thing
 * is one `shuffle` of the inter-block edge list in stage 4:
 *
 *  1. Fill the interior with 1×1 singleton blocks inside a wall border.
 *  2. Place the main block and the target — both at **fixed** positions.
 *  3. Delete singletons, in a fixed scan order, until the puzzle is soluble.
 *  4. Shuffle the list of edges between adjacent blocks, then walk it trying to
 *     merge the two blocks either side of each edge, keeping a merge only while
 *     the puzzle stays soluble.
 *
 * Because stage 4's solubility test is the solver's verdict on every candidate
 * board, the description is decided end-to-end by the solver — which is what
 * makes a single byte-for-byte desc match validate generator, solver and codec
 * together (docs/games/solver-and-generator.md § "Solver-gated generation").
 *
 * Upstream's FIXMEs ask for variety in stage 2 and it never delivers any: the
 * main block is always a 2×2 at the top left and the exit is always a
 * two-square hole punched in the right wall, guarded by forcefield squares only
 * the main block can cross. That is ported as-is — a less varied generator is
 * the curve upstream shipped, not a defect
 * (docs/games/solver-and-generator.md § "Divergence and what it costs" rule 3).
 */

import { Dsf } from "../../engine/dsf.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { solveBoard } from "./solver.ts";
import {
  ANCHOR,
  EMPTY,
  encodeDesc,
  isBlock,
  isDist,
  MAINANCHOR,
  MAXDIST,
  type SlideParams,
  WALL,
} from "./state.ts";

interface GeneratedBoard {
  board: Uint8Array;
  forcefield: Uint8Array;
  tx: number;
  ty: number;
  minmoves: number;
}

function generateBoard(
  w: number,
  h: number,
  rng: RandomState,
  movelimit: number,
): GeneratedBoard {
  const wh = w * h;

  // 1. A board of singletons inside a wall border.
  const board = new Uint8Array(wh).fill(ANCHOR);
  const forcefield = new Uint8Array(wh);
  for (let i = 0; i < w; i++) {
    board[i] = WALL;
    board[i + w * (h - 1)] = WALL;
  }
  for (let i = 0; i < h; i++) {
    board[i * w] = WALL;
    board[i * w + (w - 1)] = WALL;
  }

  // 2. The main piece, at one extreme: a 2×2 whose anchor sits just inside the
  // top-left corner. (Upstream FIXME: vary the extreme, and the piece.)
  board[w + 1] = MAINANCHOR;
  board[w + 2] = 1;
  board[w * 2 + 1] = w - 1;
  board[w * 2 + 2] = 1;

  // ...and the target. (Upstream FIXME: vary this too.) The main block's anchor
  // must reach (w-2, h-3), which puts half the block in a two-square hole in
  // the right wall; forcefields on those two squares stop anything else
  // escaping through it.
  const tx = w - 2;
  const ty = h - 3;
  forcefield[ty * w + tx + 1] = 1;
  forcefield[(ty + 1) * w + tx + 1] = 1;
  board[ty * w + tx + 1] = EMPTY;
  board[(ty + 1) * w + tx + 1] = EMPTY;

  // 3. Gradually remove singletons until the game becomes soluble. The check
  // happens *before* each removal, so the board kept is the first that solves.
  let moves = -1;
  scan: for (let x = w - 1; x >= 0; x--) {
    for (let y = h - 1; y >= 0; y--) {
      if (board[y * w + x] !== ANCHOR) continue;
      moves = solveBoard(w, h, board, forcefield, tx, ty, movelimit).moves;
      if (moves >= 0) break scan;
      board[y * w + x] = EMPTY;
    }
  }
  // Upstream never checks after the last removal, so a board that only becomes
  // soluble once the final singleton goes falls into `assert(!"We shouldn't get
  // here")`. That is every 5×4 board, the smallest size `validateParams`
  // admits, where removing both interior singletons is exactly what frees the
  // main block. Divergence is free where the C has no defined behavior
  // (docs/games/solver-and-generator.md § "Divergence and what it costs" rule 1):
  // the missing check draws no randomness and runs only where the C aborts.
  if (moves < 0) moves = solveBoard(w, h, board, forcefield, tx, ty, movelimit).moves;
  if (moves < 0)
    throw new Error("slide: no board of this size is soluble within the move limit");

  // 4. Every edge between two adjacent squares, as `square * 2` for the edge to
  // its right and `square * 2 + 1` for the edge below, shuffled once — the
  // whole RNG surface of the generator.
  const list: number[] = [];
  for (let x = 0; x + 1 < w; x++)
    for (let y = 0; y < h; y++) list.push((y * w + x) * 2);
  for (let y = 0; y + 1 < h; y++)
    for (let x = 0; x < w; x++) list.push((y * w + x) * 2 + 1);
  shuffle(list, rng);

  const triedMerge = new Uint8Array(wh * wh);
  const dsf = new Dsf(wh);
  const unmerged = new Uint8Array(wh);

  // Walked from the end, as upstream's `list[--nlist]` does.
  while (list.length > 0) {
    const pos = list.pop() as number;
    let p1 = Math.floor(pos / 2);
    let p2 = pos % 2 ? p1 + w : p1 + 1;

    // Abandon immediately if this same *pair of blocks* has already been tried
    // along a different edge.
    const c1 = dsf.canonify(p1);
    const c2 = dsf.canonify(p2);
    if (triedMerge[c1 * wh + c2]) continue;

    // Both squares must belong to a block, and to *different* non-main blocks.
    if (!isBlock(board[p1]) || !isBlock(board[p2])) continue;
    while (isDist(board[p1])) p1 -= board[p1];
    while (isDist(board[p2])) p2 -= board[p2];
    if (board[p1] === MAINANCHOR || board[p2] === MAINANCHOR || p1 === p2) continue;

    // Merge them by interleaving the two back-link lists in index order, then
    // see whether the puzzle survives. Writes run in increasing index order and
    // the scans read strictly ahead of them, so reading the board while
    // rewriting it is safe — as it is in the C.
    unmerged.set(board);
    let prev = -1;
    while (p1 < wh || p2 < wh) {
      const i = Math.min(p1, p2);
      if (prev < 0) {
        board[i] = ANCHOR;
      } else {
        if (i - prev > MAXDIST)
          throw new Error("slide: merged block spans more than a DIST byte");
        board[i] = i - prev;
      }
      prev = i;

      // Advance whichever list that square came from, to its next member.
      if (i === p1) {
        do {
          p1++;
        } while (p1 < wh && board[p1] !== p1 - i);
      } else {
        do {
          p2++;
        } while (p2 < wh && board[p2] !== p2 - i);
      }
    }

    const solved = solveBoard(w, h, board, forcefield, tx, ty, movelimit).moves;
    if (solved < 0) {
      // Didn't work. Revert the merge, and remember not to retry this pair.
      board.set(unmerged);
      triedMerge[c1 * wh + c2] = 1;
      triedMerge[c2 * wh + c1] = 1;
    } else {
      moves = solved;

      dsf.merge(c1, c2);
      const c = dsf.canonify(c1);
      // Propagate the merged class's "already tried" row and column. Note the
      // column pass reads entries the row pass has just written when `c` is
      // `c1` or `c2` — reproduced verbatim, because those reads decide which
      // merges are attempted and therefore which board is published.
      for (let i = 0; i < wh; i++)
        triedMerge[c * wh + i] =
          triedMerge[c1 * wh + i] || triedMerge[c2 * wh + i] ? 1 : 0;
      for (let i = 0; i < wh; i++)
        triedMerge[i * wh + c] =
          triedMerge[i * wh + c1] || triedMerge[i * wh + c2] ? 1 : 0;
    }
  }

  return { board, forcefield, tx, ty, minmoves: moves };
}

export function newSlideDesc(p: SlideParams, rng: RandomState): { desc: string } {
  const b = generateBoard(p.w, p.h, rng, p.maxmoves);
  return { desc: encodeDesc(p.w * p.h, b.board, b.forcefield, b.tx, b.ty, b.minmoves) };
}
