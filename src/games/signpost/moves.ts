/**
 * Signpost move application and the drag-release move computation —
 * shared by `index.ts` (real input/executeMove) and `render.ts` (the
 * in-progress-drag preview). Kept in its own module so `render` does not
 * import `index` (which would be a cycle).
 */

import {
  checkCompletion,
  cloneState,
  colourOf,
  inGrid,
  isValidMove,
  makeLink,
  type SignpostMove,
  type SignpostState,
  type SignpostUi,
  unlinkCell,
  updateNumbers,
} from "./state.ts";

/** Pure: apply `move` to `s`, returning a new state (upstream
 * `execute_move`). Throws if the move is illegal. */
export function executeMove(s: SignpostState, move: SignpostMove): SignpostState {
  const { w } = s;
  let ret: SignpostState;

  switch (move.type) {
    case "link": {
      if (!isValidMove(s, false, move.fromX, move.fromY, move.toX, move.toY)) {
        throw new Error("signpost: illegal link move");
      }
      ret = cloneState(s);
      makeLink(ret, move.fromY * w + move.fromX, move.toY * w + move.toX);
      break;
    }
    case "unlinkNext": {
      // Upstream 'C': always sever just this cell.
      ret = cloneState(s);
      unlinkCell(ret, move.y * w + move.x);
      break;
    }
    case "unlinkPrev": {
      // Upstream 'X': sever this cell if it is in a real-numbered region
      // (colour 0), else sever every cell in its colour set.
      const si = move.y * w + move.x;
      const sset = colourOf(s, s.nums[si]);
      ret = cloneState(s);
      if (sset === 0) {
        unlinkCell(ret, si);
      } else {
        for (let i = 0; i < s.n; i++) {
          if (s.nums[i] === 0) continue;
          if (colourOf(s, s.nums[i]) !== sset) continue;
          unlinkCell(ret, i);
        }
      }
      break;
    }
    case "solve": {
      ret = cloneState(s);
      ret.next.set(move.next);
      ret.prev.fill(-1);
      for (let i = 0; i < ret.n; i++) {
        if (ret.next[i] !== -1) ret.prev[ret.next[i]] = i;
      }
      ret.usedSolve = true;
      break;
    }
  }

  updateNumbers(ret);
  if (checkCompletion(ret, true)) ret.completed = true;
  return ret;
}

/** The move a drag-release at grid cell (x,y) produces, or null for a
 * no-op (single click, off-grid with no links, invalid link). Used both
 * for real releases and the render preview. */
export function dragReleaseMove(
  s: SignpostState,
  ui: SignpostUi,
  x: number,
  y: number,
): SignpostMove | null {
  const { w } = s;
  const { sx, sy, dragIsFrom } = ui;

  if (sx === x && sy === y) return null; // single click

  if (!inGrid(s, x, y)) {
    const si = sy * w + sx;
    if (s.prev[si] === -1 && s.next[si] === -1) return null;
    return dragIsFrom
      ? { type: "unlinkNext", x: sx, y: sy }
      : { type: "unlinkPrev", x: sx, y: sy };
  }

  if (dragIsFrom) {
    if (!isValidMove(s, false, sx, sy, x, y)) return null;
    return { type: "link", fromX: sx, fromY: sy, toX: x, toY: y };
  }
  if (!isValidMove(s, false, x, y, sx, sy)) return null;
  return { type: "link", fromX: x, fromY: y, toX: sx, toY: sy };
}
