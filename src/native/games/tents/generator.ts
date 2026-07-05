/**
 * Tents generator — faithful port of `new_game_desc` in tents.c. Byte-match
 * critical (design D1 / playbook §4.3–4.4): every RNG draw must reproduce C
 * exactly — the `random_upto` tent-placement permutation and the bipartite
 * `matching`'s own internal draws (RNG-faithful in `engine/latin.ts`) — and
 * the solver's verdict must match C on every candidate board (the difficulty
 * gate rejects any board solvable one level down).
 *
 * Generation strategy: place `w*h/5` tents at random non-adjacent squares,
 * place trees by matching each tent to a distinct orthogonally-adjacent
 * square, reject empty rows/columns, derive the edge numbers, and accept only
 * when the puzzle is solvable at the target difficulty but not one below.
 */
import { matching } from "../../engine/latin.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { tentsSolve } from "./solver.ts";
import {
  BLANK,
  DIFF_EASY,
  DX,
  DY,
  encodeDesc,
  MAXDIR,
  type TentsParams,
  TENT,
  TREE,
} from "./state.ts";

export function newTentsDesc(
  params: TentsParams,
  rs: RandomState,
): { desc: string; aux: string } {
  let { w, h, diff } = params;
  const ntrees = Math.floor((w * h) / 5);

  // Downgrade tiny grids to prevent a tight loop.
  if (diff > DIFF_EASY && w <= 4 && h <= 4) diff = DIFF_EASY;

  const grid = new Int8Array(w * h);
  const order = new Int32Array(w * h);
  const treemap = new Int32Array(w * h);
  const numbers = new Int32Array(w + h);

  while (true) {
    for (let i = 0; i < w * h; i++) {
      order[i] = i;
      treemap[i] = -1;
    }

    // Place tents at random without making any two (even diagonally) adjacent.
    grid.fill(BLANK);
    let j = ntrees;
    let nr = 0;
    // Loop ends when all tents are placed (j==0), or too few squares remain.
    for (let i = 0; j > 0 && i + j <= w * h; i++) {
      const which = i + randomUpto(rs, w * h - i);
      const tmp = order[which];
      order[which] = order[i];
      order[i] = tmp;

      const x = order[i] % w;
      const y = Math.floor(order[i] / w);
      let ok = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (
            x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h &&
            grid[(y + dy) * w + (x + dx)] === TENT
          ) {
            ok = false;
          }
        }
      }
      if (ok) {
        grid[order[i]] = TENT;
        for (let d = 1; d < MAXDIR; d++) {
          const x2 = x + DX(d);
          const y2 = y + DY(d);
          if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h && treemap[y2 * w + x2] === -1) {
            treemap[y2 * w + x2] = nr++;
          }
        }
        j--;
      }
    }
    if (j > 0) continue; // couldn't place all the tents

    // Build the bipartite graph (tents on the left, potential-tree squares on
    // the right) for matching().
    const adjlists: number[][] = [];
    const adjsizes: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (grid[i] !== TENT) continue;
      const x = i % w;
      const y = Math.floor(i / w);
      const list: number[] = [];
      for (let d = 1; d < MAXDIR; d++) {
        const x2 = x + DX(d);
        const y2 = y + DY(d);
        if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h) list.push(treemap[y2 * w + x2]);
      }
      adjlists.push(list);
      adjsizes.push(list.length);
    }

    // Place the trees via matching. `matching` returns the left→right
    // assignment; invert to the right→left form C reads as `outr`.
    const ltoR = matching(ntrees, nr, adjlists, adjsizes, rs);
    const outr = new Int32Array(nr).fill(-1);
    let matched = 0;
    for (let L = 0; L < ntrees; L++) {
      if (ltoR[L] !== -1) {
        outr[ltoR[L]] = L;
        matched++;
      }
    }
    if (matched < ntrees) continue; // couldn't place all the trees

    for (let i = 0; i < w * h; i++) {
      if (treemap[i] !== -1 && outr[treemap[i]] !== -1) grid[i] = TREE;
    }

    // Reject a completely empty row or column (looks ugly; gives nothing away).
    let emptyColumn = false;
    for (let i = 0; i < w && !emptyColumn; i++) {
      let jj = 0;
      for (; jj < h; jj++) if (grid[jj * w + i] !== BLANK) break;
      if (jj === h) emptyColumn = true;
    }
    if (emptyColumn) continue;
    let emptyRow = false;
    for (let jj = 0; jj < h && !emptyRow; jj++) {
      let i = 0;
      for (; i < w; i++) if (grid[jj * w + i] !== BLANK) break;
      if (i === w) emptyRow = true;
    }
    if (emptyRow) continue;

    // Edge numbers.
    for (let i = 0; i < w; i++) {
      let n = 0;
      for (let jj = 0; jj < h; jj++) if (grid[jj * w + i] === TENT) n++;
      numbers[i] = n;
    }
    for (let i = 0; i < h; i++) {
      let n = 0;
      for (let jj = 0; jj < w; jj++) if (grid[i * w + jj] === TENT) n++;
      numbers[w + i] = n;
    }

    // Solve at diff-1 (must fail: ambiguous) and diff (must succeed: unique).
    const puzzle = new Int8Array(w * h);
    for (let i = 0; i < w * h; i++) puzzle[i] = grid[i] === TREE ? TREE : BLANK;
    const easier = tentsSolve(w, h, puzzle, numbers, diff - 1).ret;
    const target = tentsSolve(w, h, puzzle, numbers, diff).ret;
    if (easier === 2 && target === 1) break;
  }

  const desc = encodeDesc(w, h, grid, numbers);

  // aux: the solution as a `;T<x>,<y>` list of tent positions.
  let aux = "S";
  for (let i = 0; i < w * h; i++) {
    if (grid[i] === TENT) aux += `;T${i % w},${Math.floor(i / w)}`;
  }

  return { desc, aux };
}
