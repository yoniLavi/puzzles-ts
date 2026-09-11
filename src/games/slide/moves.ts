/**
 * Slide's move application and drag reachability, in their own module because
 * `render.ts` needs them too: upstream's `game_redraw` shows an in-progress
 * drag by *simulating the release move*, so the renderer calls `movePiece`, and
 * from `index.ts` that would be an import cycle
 * (docs/games/rendering.md § "A simulated-release preview lives in `moves.ts`").
 */

import { assertNever } from "../../engine/assert-never.ts";
import {
  EMPTY,
  isAnchor,
  isDist,
  MAINANCHOR,
  type SlideMove,
  type SlideState,
} from "./state.ts";

/**
 * Slide the block anchored at `from` so its anchor lands on `to`, writing into
 * `dst` (a copy of `src`). Returns false — leaving `dst` half-written, which
 * the caller must discard — when the move is illegal (upstream `move_piece`).
 *
 * Note what is *not* checked: that the block keeps its shape. `move_piece`
 * only bounds-checks each square's flat index, so a `to` that wraps the block
 * around a row edge is accepted. Legal moves only ever come from
 * {@link computeReachable} (which does check) or from the solver's own path,
 * so this is upstream's contract preserved, not a hole being opened.
 */
export function movePiece(
  w: number,
  h: number,
  src: Uint8Array,
  dst: Uint8Array,
  ff: Uint8Array,
  from: number,
  to: number,
): boolean {
  const wh = w * h;

  if (!isAnchor(dst[from])) return false;

  // Walk to the far end of the block's back-link list.
  let tail = from;
  for (let j = from; j < wh; j++) if (src[j] === j - tail) tail = j;

  // Lift the block out of its old position...
  for (let j = tail; j >= 0; j = isDist(src[j]) ? j - src[j] : -1) dst[j] = EMPTY;

  // ...and put it down at the new one.
  for (let j = tail; j >= 0; j = isDist(src[j]) ? j - src[j] : -1) {
    const jn = j + to - from;
    if (jn < 0 || jn >= wh) return false;
    if (dst[jn] === EMPTY && (!ff[jn] || src[from] === MAINANCHOR)) dst[jn] = src[j];
    else return false;
  }

  return true;
}

/**
 * Mark, in `reachable`, every square the block anchored at `anchor` can have
 * its anchor slid to — upstream's BFS in `interpret_move`'s press arm. Unlike
 * the solver's equivalent, the block's *own* squares count as free space (it
 * is sliding out of them as it goes), and only the main block may cross a
 * forcefield.
 */
export function computeReachable(
  state: SlideState,
  anchor: number,
  reachable: Uint8Array,
): void {
  const { w, h, board, forcefield } = state;
  const wh = w * h;

  reachable.fill(0);
  const queue = new Int32Array(wh);
  let qhead = 0;
  let qtail = 0;
  reachable[anchor] = 1;
  queue[qtail++] = anchor;

  // The last square of the block: the fit test walks the back-link list, which
  // runs from the tail towards the anchor.
  let tail = anchor;
  for (let j = anchor; j < wh; j++) if (board[j] === j - tail) tail = j;

  while (qhead < qtail) {
    const pos = queue[qhead++];
    const x = pos % w;
    const y = Math.floor(pos / w);

    for (let dir = 0; dir < 4; dir++) {
      const dx = dir === 0 ? -1 : dir === 1 ? 1 : 0;
      const dy = dir === 2 ? -1 : dir === 3 ? 1 : 0;

      if (x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) continue;

      const newpos = pos + dy * w + dx;
      if (reachable[newpos]) continue; // already done this one

      // Would the block fit if it took one more step this way?
      let j = tail;
      for (; j >= 0; j = isDist(board[j]) ? j - board[j] : -1) {
        const rel = j + pos - anchor;
        const jx = rel % w;
        const jy = Math.floor(rel / w);

        if (jx + dx < 0 || jx + dx >= w || jy + dy < 0 || jy + dy >= h) break;

        let j2 = rel + dy * w + dx;

        if (board[j2] === EMPTY && (!forcefield[j2] || board[anchor] === MAINANCHOR))
          continue;
        while (isDist(board[j2])) j2 -= board[j2];
        if (j2 === anchor) continue; // our own square; we're vacating it
        break;
      }

      if (j < 0) {
        reachable[newpos] = 1;
        queue[qtail++] = newpos;
      }
    }
  }
}

/**
 * The reachable square nearest `(tx, ty)` by Manhattan distance, or `null` if
 * none is close enough — upstream's outward spiral in the drag arm, tie-breaks
 * and search bound included. `(tx, ty)` is where the *anchor* would go, i.e.
 * the pointer cell minus the grab offset, and may legitimately be off-board.
 */
export function nearestReachable(
  w: number,
  h: number,
  reachable: Uint8Array,
  tx: number,
  ty: number,
): number | null {
  const distlimit = Math.max(w + tx, h + ty, tx, ty);

  for (let dist = 0; dist <= distlimit; dist++) {
    for (let dx = -dist; dx <= dist; dx++) {
      for (let s = -1; s <= 1; s += 2) {
        const dy = s * (dist - Math.abs(dx));
        const px = tx + dx;
        const py = ty + dy;
        if (px >= 0 && px < w && py >= 0 && py < h && reachable[py * w + px])
          return py * w + px;
      }
    }
  }
  return null;
}

/**
 * Apply a move (upstream `execute_move`). Pure: returns a new state.
 *
 * Two pieces of gameplay logic ride along here:
 *
 *  - **Move counting.** Sliding the *same* block again does not increment the
 *    counter, and sliding it back where it started *decrements* it — so a
 *    multi-nudge slide counts as the one move it is. That is what the
 *    `lastmoved` / `lastmovedPos` pair on the state is for, and it governs the
 *    displayed count that `maxmoves`/`minmoves` are measured in. It is
 *    independent of the engine's undo stack.
 *  - **The stored Solve path.** A `"solve"` move installs a route; each
 *    subsequent slide either advances along it, or strays from it and drops it.
 */
export function executeMove(state: SlideState, move: SlideMove): SlideState {
  if (move.kind === "solve") {
    // If the route's first move is of the block the player has already part-way
    // nudged, rewrite its source to where that block *started*, so the
    // stray/advance checks below line up with `lastmovedPos`.
    const soln = move.moves.map((step, index) =>
      index === 0 && step.from === state.lastmoved
        ? { from: state.lastmovedPos, to: step.to }
        : step,
    );
    return { ...state, soln, solnIndex: 0, cheated: true };
  }
  if (move.kind !== "move") return assertNever(move, "slide: executeMove");

  const { w } = state;
  const { from, to } = move;
  const board = state.board.slice();
  if (!movePiece(w, state.h, state.board, board, state.forcefield, from, to))
    throw new Error("slide: illegal move");

  let { lastmoved, lastmovedPos, movecount, soln, solnIndex, completed } = state;

  if (from === lastmoved) {
    if (to === lastmovedPos) {
      movecount--; // reverted the last move
      lastmoved = -1;
      lastmovedPos = -1;
    } else {
      lastmoved = to; // same block again; lastmovedPos deliberately unchanged
    }
  } else {
    lastmoved = to;
    lastmovedPos = from;
    movecount++;
  }

  if (soln && lastmovedPos >= 0) {
    const step = soln[solnIndex];
    if (lastmovedPos !== step.from) {
      soln = null; // strayed from the path
      solnIndex = -1;
    } else if (lastmoved === step.to) {
      solnIndex++; // advanced along it
      if (solnIndex >= soln.length) {
        soln = null; // finished the path
        solnIndex = -1;
      }
    }
  }

  if (board[to] === MAINANCHOR && to === state.ty * w + state.tx && completed < 0)
    completed = movecount;

  return {
    ...state,
    board,
    lastmoved,
    lastmovedPos,
    movecount,
    soln,
    solnIndex,
    completed,
  };
}
