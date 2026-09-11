/**
 * Flip's two toggle matrices.
 *
 * `crosses` is the fixed plus-shape: a cell toggles itself and its four
 * orthogonal neighbors. `random` is upstream's greedy construction (`flip.c`'s
 * RANDOM branch of `new_game_desc`), which grows overlapping blobs chosen by
 * three sort orders — pick order, coverage, and omino size — so that every cell
 * is covered and the matrix stays interesting to solve.
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { SortedMultiset } from "../../engine/sorted-multiset.ts";

// --- RANDOM matrix generator ------------------------------------------

/** A proposal to add output cell (x, y) to the lights input cell (cx, cy)
 * flips. `coverage` counts the cells already flipping (x, y); `ominosize`
 * counts the lights (cx, cy) already flips. */
interface Candidate {
  cx: number;
  cy: number;
  x: number;
  y: number;
  coverage: number;
  ominosize: number;
}

function cmp(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Upstream's sqcmp_pick, sqcmp_cov and sqcmp_osize, exactly: `randomUpto`
// indexes the pick order, so these orders decide the board.
function pickOrder(a: Candidate, b: Candidate): number {
  return (
    cmp(a.coverage, b.coverage) ||
    cmp(a.ominosize, b.ominosize) ||
    cmp(a.cy, b.cy) ||
    cmp(a.cx, b.cx) ||
    cmp(a.y, b.y) ||
    cmp(a.x, b.x)
  );
}
function coverageOrder(a: Candidate, b: Candidate): number {
  return (
    cmp(a.coverage, b.coverage) ||
    cmp(a.y, b.y) ||
    cmp(a.x, b.x) ||
    cmp(a.ominosize, b.ominosize) ||
    cmp(a.cy, b.cy) ||
    cmp(a.cx, b.cx)
  );
}
function sizeOrder(a: Candidate, b: Candidate): number {
  return (
    cmp(a.ominosize, b.ominosize) ||
    cmp(a.cy, b.cy) ||
    cmp(a.cx, b.cx) ||
    cmp(a.coverage, b.coverage) ||
    cmp(a.y, b.y) ||
    cmp(a.x, b.x)
  );
}

export function genRandomMatrix(w: number, h: number, rng: RandomState): Uint8Array {
  const wh = w * h;
  const matrix = new Uint8Array(wh * wh);
  for (;;) {
    const pick = new SortedMultiset(pickOrder);
    const cov = new SortedMultiset(coverageOrder);
    const osize = new SortedMultiset(sizeOrder);
    const remove = (c: Candidate) => {
      pick.delete(c);
      cov.delete(c);
      osize.delete(c);
    };
    const insert = (c: Candidate) => {
      pick.add(c);
      cov.add(c);
      osize.add(c);
    };
    const addCandidate = (cx: number, cy: number, x: number, y: number) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      if (Math.abs(x - cx) > 1 || Math.abs(y - cy) > 1) return;
      if (matrix[(cy * w + cx) * wh + y * w + x]) return;
      let coverage = 0;
      let ominosize = 0;
      for (let i = 0; i < wh; i++) {
        if (matrix[i * wh + y * w + x]) coverage++;
        if (matrix[(cy * w + cx) * wh + i]) ominosize++;
      }
      const c: Candidate = { cx, cy, x, y, coverage, ominosize };
      // The three sets share the one object (a candidate is identified by
      // (cx,cy,x,y); all three comparators tie only on the same candidate).
      if (pick.add(c)) {
        cov.add(c);
        osize.add(c);
      }
    };
    const addNeighbors = (cx: number, cy: number, x: number, y: number) => {
      addCandidate(cx, cy, x - 1, y);
      addCandidate(cx, cy, x + 1, y);
      addCandidate(cx, cy, x, y - 1);
      addCandidate(cx, cy, x, y + 1);
    };

    matrix.fill(0);
    for (let i = 0; i < wh; i++) matrix[i * wh + i] = 1;
    for (let i = 0; i < wh; i++) {
      const ix = i % w;
      const iy = (i / w) | 0;
      addNeighbors(ix, iy, ix, iy);
    }

    let limit = 4 * wh - 2 * (w + h);
    while (limit-- > 0 && pick.size > 0) {
      // Lowest pick element; then the run of equal (coverage,ominosize).
      const low = pick.get(0);
      const k = pick.lastIndexLessThan({ ...low, cx: wh, cy: wh, x: wh, y: wh });
      const chosen = pick.removeAt(randomUpto(rng, k + 1));
      cov.delete(chosen);
      osize.delete(chosen);

      matrix[(chosen.cy * w + chosen.cx) * wh + (chosen.y * w + chosen.x)] = 1;

      // Bump coverage of every candidate pointing at this output cell.
      const covProbe = { ...chosen, cx: -1, cy: -1, ominosize: -1 };
      for (;;) {
        const c = cov.firstGreaterThan(covProbe);
        if (
          !c ||
          c.coverage !== chosen.coverage ||
          c.x !== chosen.x ||
          c.y !== chosen.y
        ) {
          break;
        }
        remove(c);
        c.coverage++;
        insert(c);
      }

      // Bump omino size of every candidate from this input cell.
      const osizeProbe = { ...chosen, x: -1, y: -1, coverage: -1 };
      for (;;) {
        const c = osize.firstGreaterThan(osizeProbe);
        if (
          !c ||
          c.ominosize !== chosen.ominosize ||
          c.cx !== chosen.cx ||
          c.cy !== chosen.cy
        ) {
          break;
        }
        remove(c);
        c.ominosize++;
        insert(c);
      }

      addNeighbors(chosen.cx, chosen.cy, chosen.x, chosen.y);
    }

    // Reject if any two matrix rows are identical (flip.c does the same).
    let dup = false;
    for (let i = 0; i < wh && !dup; i++) {
      for (let j = i + 1; j < wh && !dup; j++) {
        let c = 0;
        while (c < wh && matrix[i * wh + c] === matrix[j * wh + c]) c++;
        dup = c === wh;
      }
    }
    if (!dup) return matrix;
  }
}

export function genCrossesMatrix(w: number, h: number): Uint8Array {
  const wh = w * h;
  const matrix = new Uint8Array(wh * wh);
  for (let i = 0; i < wh; i++) {
    const ix = i % w;
    const iy = (i / w) | 0;
    for (let j = 0; j < wh; j++) {
      const jx = j % w;
      const jy = (j / w) | 0;
      if (Math.abs(jx - ix) + Math.abs(jy - iy) <= 1) matrix[i * wh + j] = 1;
    }
  }
  return matrix;
}
