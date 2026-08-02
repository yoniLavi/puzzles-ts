/**
 * The greedy human-style solver from `fifteen.c` (`compute_hint` +
 * `next_move` + `next_move_3x2`). It returns the next single-cell gap
 * destination that makes progress toward the solved board: fill the
 * shorter of "top row, left→right" / "left column, top→bottom"
 * tile-by-tile, walking the next piece toward its home, with a
 * hard-coded shortest-move table for the awkward end-of-line 3×2 corner.
 *
 * Ported branch-for-branch from the C; the pointer-swapping at the call
 * sites (upstream passes `&dy, &dx` to reuse the same routine for the
 * column axis) is reproduced by mapping the returned `{dx, dy}` value
 * object at each site.
 */

import type { FifteenState } from "./state.ts";

interface Delta {
  dx: number;
  dy: number;
}

const D3X2: ReadonlyArray<Delta> = [
  { dx: +1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: +1 },
  { dx: 0, dy: -1 },
];

// Hard-coded shortest solutions for the 3×2 end-of-row corner. Verbatim
// from upstream `next_move_3x2`. Sorry. (Indexes a (piece-a, piece-b,
// gap) configuration to one of the four directions in D3X2.)
// biome-ignore format: keep the upstream 6-wide rows for cross-checking.
const MOVE_3X2: ReadonlyArray<number> = [
  1,2,0,1,2,2,
  2,0,0,2,0,0,
  0,0,2,0,2,0,
  0,0,0,2,0,2,
  2,0,0,0,2,0,

  0,3,0,1,1,1,
  3,0,3,2,1,2,
  2,1,1,0,1,0,
  2,1,2,1,0,1,
  1,2,0,2,1,2,

  0,1,3,1,3,0,
  1,3,1,3,0,3,
  0,0,3,3,0,0,
  0,0,0,1,2,1,
  3,0,0,1,1,1,

  3,1,1,1,3,0,
  1,1,1,1,1,1,
  1,3,1,1,3,0,
  1,1,3,3,1,3,
  1,3,0,0,0,0,
];

/** When w = 3 and h = 2 and the tile going in the top left corner is at
 * (ax, ay), the tile going in the bottom left corner is at (bx, by), and
 * the blank is at (gx, gy): which way to move. Returns `{dx, dy}` (the
 * natural first/second outputs of upstream's two pointer args). */
function nextMove3x2(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  gx: number,
  gy: number,
): Delta {
  const ea = 3 * ay + ax;
  let eb = 3 * by + bx;
  let eg = 3 * gy + gx;
  if (eb > ea) --eb;
  if (eg > ea) --eg;
  if (eg > eb) --eg;
  const v = MOVE_3X2[ea + eb * 6 + eg * 5 * 6];
  return { dx: D3X2[v].dx, dy: D3X2[v].dy };
}

/** Faithful port of upstream `next_move`. Returns `{dx, dy}` for the two
 * pointer outputs in the order they appear in the C signature. */
function nextMove(
  nx: number,
  ny: number,
  ox: number,
  oy: number,
  gx: number,
  gy: number,
  tx: number,
  ty: number,
  w: number,
): Delta {
  const out: Delta = { dx: 0, dy: 0 };

  const toTileX = gx < nx ? +1 : -1;
  const toGoalX = gx < tx ? +1 : -1;
  const gapXOnGoalSide = (nx - tx) * (nx - gx) > 0;

  // End-of-row, when the last two pieces are in the top-right 2×3 box.
  if (
    tx === w - 2 &&
    ny <= ty + 2 &&
    (nx === tx || nx === tx + 1) &&
    oy <= ty + 2 &&
    (ox === tx || ox === tx + 1) &&
    gy <= ty + 2 &&
    (gx === tx || gx === tx + 1)
  ) {
    // C passes pointers (dy, dx): first output → dy, second → dx; then dx *= -1.
    const r = nextMove3x2(
      oy - ty,
      tx + 1 - ox,
      ny - ty,
      tx + 1 - nx,
      gy - ty,
      tx + 1 - gx,
    );
    out.dy = r.dx;
    out.dx = -r.dy;
    return out;
  }

  if (tx === w - 1) {
    if (
      ny <= ty + 2 &&
      (nx === tx || nx === tx - 1) &&
      gy <= ty + 2 &&
      (gx === tx || gx === tx - 1)
    ) {
      const r = nextMove3x2(ny - ty, tx - nx, 0, 1, gy - ty, tx - gx);
      out.dy = r.dx;
      out.dx = -r.dy;
    } else if (gy === ty) {
      out.dy = +1;
    } else if (nx !== tx || ny !== ty + 1) {
      // C passes pointers (dx, dy) in the same order; then dx *= -1.
      const r = nextMove(w - 1 - nx, ny, -1, -1, w - 1 - gx, gy, 0, ty + 1, -1);
      out.dx = -r.dx;
      out.dy = r.dy;
    } else if (gx === nx) {
      out.dy = -1;
    } else {
      out.dx = +1;
    }
    return out;
  }

  if (gy < ny) {
    if (nx === gx || (gy === ty && gx === tx)) out.dy = +1;
    else if (!gapXOnGoalSide) out.dx = toTileX;
    else if (ny - ty > Math.abs(nx - tx)) out.dx = toTileX;
    else out.dy = +1;
  } else if (gy === ny) {
    if (nx === tx) {
      // then we know ny > ty
      if (gx > nx || ny > ty + 1) out.dy = -1;
      else out.dy = +1;
    } else if (gapXOnGoalSide) out.dx = toTileX;
    else if (gy === ty || (gy === ty + 1 && gx < tx)) out.dy = +1;
    else out.dy = -1;
  } else if (nx === tx) {
    // gy > ny
    if (gx > nx) out.dy = -1;
    else out.dx = +1;
  } else if (gx === nx) {
    out.dx = toGoalX;
  } else if (gapXOnGoalSide) {
    if (gy === ty + 1 && gx < tx) out.dx = toTileX;
    else out.dy = -1;
  } else if (ny - ty > Math.abs(nx - tx)) {
    out.dy = -1;
  } else {
    out.dx = toTileX;
  }

  return out;
}

/** The overall greedy solving process: find the next piece to place,
 * then move the gap one cell toward where that piece needs to go.
 * Returns the gap's next destination cell plus `target` — the tile the
 * solver is currently working toward its home (upstream's `nextpiece`),
 * which the hint narration uses to explain *which* tile a maneuvering
 * move serves — or `null` when the board is already solved (no hint).
 * Faithful port of upstream `compute_hint`. */
export function computeHint(
  state: FifteenState,
): { x: number; y: number; target: number } | null {
  const { w, h, n, tiles } = state;
  const gx = state.gapPos % w;
  const gy = Math.floor(state.gapPos / w);

  // 1. Find the next piece. If there are no more unfinished columns than
  //    rows, fill the top-most row left→right; otherwise the left-most
  //    column top→bottom.
  let nextPiece = 0;
  let nextPiece2 = 0;
  let solr = 0;
  let solc = 0;
  let unsolvedRows = h;
  let unsolvedCols = w;

  while (solr < h && solc < w) {
    const step = unsolvedCols <= unsolvedRows ? 1 : w;
    const stop = unsolvedCols <= unsolvedRows ? unsolvedCols : unsolvedRows;
    const start = solr * w + solc;
    let i = 0;
    for (; i < stop; i++) {
      const j = start + i * step;
      if (tiles[j] !== j + 1) {
        nextPiece = j + 1;
        nextPiece2 = nextPiece + step;
        break;
      }
    }
    if (i < stop) break;

    if (unsolvedCols <= unsolvedRows) {
      solr++;
      unsolvedRows--;
    } else {
      solc++;
      unsolvedCols--;
    }
  }

  if (nextPiece === n) return null; // solved

  // 2, 3. Move the next piece towards its place.
  const tx = (nextPiece - 1) % w;
  const ty = Math.floor((nextPiece - 1) / w);

  let i = 0;
  for (; i < n && tiles[i] !== nextPiece; i++);
  const nx = i % w;
  const ny = Math.floor(i / w);

  let i2 = 0;
  for (; i2 < n && tiles[i2] !== nextPiece2; i2++);
  const ox = i2 % w;
  const oy = Math.floor(i2 / w);

  let dx: number;
  let dy: number;
  if (unsolvedCols <= unsolvedRows) {
    const r = nextMove(nx, ny, ox, oy, gx, gy, tx, ty, w);
    dx = r.dx;
    dy = r.dy;
  } else {
    // Column axis: upstream swaps the x/y args and the output pointers.
    const r = nextMove(ny, nx, oy, ox, gy, gx, ty, tx, h);
    dy = r.dx;
    dx = r.dy;
  }

  return { x: gx + dx, y: gy + dy, target: nextPiece };
}
