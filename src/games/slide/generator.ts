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
 * together (playbook §4.4).
 *
 * Upstream's FIXMEs ask for variety in stage 2 ("vary the extreme, and the
 * piece", "vary this too") and it never delivers any: the main block is always
 * a 2×2 at the top left and the exit is always a two-square hole punched in the
 * right wall, guarded by forcefield squares only the main block can cross. That
 * unvaried placement is ported as-is — a less varied generator is the curve
 * upstream shipped, not a defect (playbook §4 rule 3, design D6).
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

export interface GeneratedBoard {
  board: Uint8Array;
  forcefield: Uint8Array;
  tx: number;
  ty: number;
  minmoves: number;
}

export function generateBoard(
  w: number,
  h: number,
  rng: RandomState,
  movelimit: number,
): GeneratedBoard {
  const wh = w * h;

  // 1. A board of singletons inside a wall border.
  const board = new Uint8Array(wh).fill(ANCHOR);
  const forcefield = new Uint8Array(wh);
  const board2 = new Uint8Array(wh);
  for (let i = 0; i < w; i++) {
    board[i] = WALL;
    board[i + w * (h - 1)] = WALL;
  }
  for (let i = 0; i < h; i++) {
    board[i * w] = WALL;
    board[i * w + (w - 1)] = WALL;
  }

  const triedMerge = new Uint8Array(wh * wh);
  const dsf = new Dsf(wh);

  // 2. The main piece, at one extreme. (Upstream FIXME: vary the extreme, and
  // the piece.) A 2×2 whose anchor sits just inside the top-left corner.
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

  // 3. Gradually remove singletons until the game becomes soluble. Note the
  // check happens *before* each removal, so the board kept is the first one
  // that solves.
  let moves = 0;
  let soluble = false;
  scan: for (let j = w; j-- > 0; ) {
    for (let i = h; i-- > 0; ) {
      if (board[i * w + j] === ANCHOR) {
        moves = solveBoard(w, h, board, forcefield, tx, ty, movelimit).moves;
        if (moves >= 0) {
          soluble = true;
          break scan;
        }
        board[i * w + j] = EMPTY;
      }
    }
  }
  if (!soluble) {
    // Upstream tests solubility *before* each removal and never after the last
    // one, so a board that only becomes soluble once the final singleton goes
    // falls out of the loop into `assert(!"We shouldn't get here")`. That is not
    // hypothetical: it is every 5×4 board, the smallest size `validateParams`
    // admits, where the interior holds just two singletons and removing both is
    // exactly what frees the main block.
    //
    // So this is playbook §4 rule 1 — divergence is free where the C has no
    // defined behaviour. Running the missing final check costs nothing anywhere
    // the C works (those boards leave the loop early, by the branch above) and
    // draws no randomness, so every byte-matched desc is untouched; it only
    // gives an answer where upstream aborted.
    moves = solveBoard(w, h, board, forcefield, tx, ty, movelimit).moves;
    soluble = moves >= 0;
  }
  if (!soluble)
    throw new Error("slide: no board of this size is soluble within the move limit");

  // 4. Every edge between two adjacent squares, shuffled once — the whole RNG
  // surface of the generator.
  const list: number[] = [];
  for (let i = 0; i + 1 < w; i++)
    for (let j = 0; j < h; j++) list.push((j * w + i) * 2 + 0); // right of (i,j)
  for (let j = 0; j + 1 < h; j++)
    for (let i = 0; i < w; i++) list.push((j * w + i) * 2 + 1); // below (i,j)
  shuffle(list, rng);

  // Walked from the end, as upstream's `list[--nlist]` does.
  while (list.length > 0) {
    const pos = list.pop() as number;
    const y1 = Math.floor(pos / (w * 2));
    const x1 = Math.floor(pos / 2) % w;
    const y2 = pos % 2 ? y1 + 1 : y1;
    const x2 = pos % 2 ? x1 : x1 + 1;
    let p1 = y1 * w + x1;
    let p2 = y2 * w + x2;

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
    board2.set(board);
    let j = -1;
    while (p1 < wh || p2 < wh) {
      const i = Math.min(p1, p2);
      if (j < 0) {
        board[i] = ANCHOR;
      } else {
        if (i - j > MAXDIST)
          throw new Error("slide: merged block spans more than a DIST byte");
        board[i] = i - j;
      }
      j = i;

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
      board.set(board2);
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
  const { board, forcefield, tx, ty, minmoves } = generateBoard(
    p.w,
    p.h,
    rng,
    p.maxmoves,
  );
  return { desc: encodeDesc(p.w * p.h, board, forcefield, tx, ty, minmoves) };
}
