/**
 * Tents solver — faithful port of `tents_solve` in `tents.c`. Returns the
 * upstream verdict: 0 impossible (no consistent solution), 1 unique (fully
 * determined), 2 ambiguous / non-converged. The generator gates on this exact
 * verdict, so the deductive power must match C on every board (playbook §4.4).
 *
 * `diff` is the difficulty ceiling: `< 0` runs only the tent↔tree link
 * deduction; `EASY` adds the non-tent marks, tree single-candidate, and the
 * per-row/column combination enumeration; `TRICKY` additionally enables the
 * tree diagonal-pair elimination and the adjacent-row influence in the
 * enumeration pass.
 */
import {
  BLANK,
  DIFF_TRICKY,
  DX,
  DY,
  FLIP,
  MAGIC,
  MAXDIR,
  N,
  NONTENT,
  TENT,
  TREE,
} from "./state.ts";

export interface SolveResult {
  ret: number;
  soln: Int8Array;
}

export function tentsSolve(
  w: number,
  h: number,
  grid: Int8Array,
  numbers: Int32Array,
  diff: number,
): SolveResult {
  const links = new Int8Array(w * h).fill(N);
  const soln = Int8Array.from(grid);
  const maxlen = Math.max(w, h);
  const locs = new Int32Array(maxlen);
  const place = new Int8Array(maxlen);
  const mrows = new Int8Array(3 * maxlen);
  const trows = new Int8Array(3 * maxlen);

  while (true) {
    let doneSomething = false;

    // Any tent with only one unattached adjacent tree is tied to that tree.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (soln[y * w + x] !== TENT || links[y * w + x]) continue;
        let linkd = 0;
        let d: number;
        for (d = 1; d < MAXDIR; d++) {
          const x2 = x + DX(d);
          const y2 = y + DY(d);
          if (
            x2 >= 0 && x2 < w && y2 >= 0 && y2 < h &&
            soln[y2 * w + x2] === TREE && !links[y2 * w + x2]
          ) {
            if (linkd) break; // found more than one
            linkd = d;
          }
        }
        if (d === MAXDIR && linkd === 0) {
          return { ret: 0, soln }; // tent cannot link to anything
        }
        if (d === MAXDIR) {
          const x2 = x + DX(linkd);
          const y2 = y + DY(linkd);
          links[y * w + x] = linkd;
          links[y2 * w + x2] = FLIP(linkd);
          doneSomething = true;
        }
      }
    }
    if (doneSomething) continue;
    if (diff < 0) break; // link deduction only

    // Mark a blank NONTENT if it is not orthogonally adjacent to any
    // unmatched tree.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (soln[y * w + x] !== BLANK) continue;
        let canBeTent = false;
        for (let d = 1; d < MAXDIR; d++) {
          const x2 = x + DX(d);
          const y2 = y + DY(d);
          if (
            x2 >= 0 && x2 < w && y2 >= 0 && y2 < h &&
            soln[y2 * w + x2] === TREE && !links[y2 * w + x2]
          ) {
            canBeTent = true;
          }
        }
        if (!canBeTent) {
          soln[y * w + x] = NONTENT;
          doneSomething = true;
        }
      }
    }
    if (doneSomething) continue;

    // Mark a blank NONTENT if it is (perhaps diagonally) adjacent to a tent.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (soln[y * w + x] !== BLANK) continue;
        let imposs = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dy && !dx) continue;
            const x2 = x + dx;
            const y2 = y + dy;
            if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h && soln[y2 * w + x2] === TENT) {
              imposs = true;
            }
          }
        }
        if (imposs) {
          soln[y * w + x] = NONTENT;
          doneSomething = true;
        }
      }
    }
    if (doneSomething) continue;

    // A tree with exactly one {unattached tent, BLANK} neighbour must have its
    // tent there.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (soln[y * w + x] !== TREE || links[y * w + x]) continue;
        let linkd = 0;
        let linkd2 = 0;
        let nd = 0;
        for (let d = 1; d < MAXDIR; d++) {
          const x2 = x + DX(d);
          const y2 = y + DY(d);
          if (!(x2 >= 0 && x2 < w && y2 >= 0 && y2 < h)) continue;
          if (
            soln[y2 * w + x2] === BLANK ||
            (soln[y2 * w + x2] === TENT && !links[y2 * w + x2])
          ) {
            if (linkd) linkd2 = d;
            else linkd = d;
            nd++;
          }
        }
        if (nd === 0) {
          return { ret: 0, soln }; // tree cannot link to anything
        }
        if (nd === 1) {
          const x2 = x + DX(linkd);
          const y2 = y + DY(linkd);
          soln[y2 * w + x2] = TENT;
          links[y * w + x] = linkd;
          links[y2 * w + x2] = FLIP(linkd);
          doneSomething = true;
        } else if (
          nd === 2 &&
          (DX(linkd) === 0) !== (DX(linkd2) === 0) &&
          diff >= DIFF_TRICKY
        ) {
          // Two candidate squares diagonally separated (not opposite sides):
          // the square adjacent to both (other than the tree) can't be a tent.
          const x2 = x + DX(linkd) + DX(linkd2);
          const y2 = y + DY(linkd) + DY(linkd2);
          if (soln[y2 * w + x2] === BLANK) {
            soln[y2 * w + x2] = NONTENT;
            doneSomething = true;
          }
        }
      }
    }
    if (doneSomething) continue;

    // The numbers round the edge: for each row/column, enumerate all placements
    // of the unplaced tents, drop invalid (adjacent-tent) ones, and fix any
    // square given the same state by every remaining combination.
    for (let i = 0; i < w + h; i++) {
      let start: number;
      let step: number;
      let len: number;
      let start1: number;
      let start2: number;
      if (i < w) {
        start = i;
        step = w;
        len = h;
        start1 = i > 0 ? start - 1 : -1;
        start2 = i + 1 < w ? start + 1 : -1;
      } else {
        start = (i - w) * w;
        step = 1;
        len = w;
        start1 = i > w ? start - w : -1;
        start2 = i + 1 < w + h ? start + w : -1;
      }
      if (diff < DIFF_TRICKY) {
        start1 = -1;
        start2 = -1;
      }

      let k = numbers[i];
      let n = 0;
      for (let j = 0; j < len; j++) {
        if (soln[start + j * step] === TENT) k--;
        else if (soln[start + j * step] === BLANK) locs[n++] = j;
      }
      if (n === 0) continue;

      // First possibility: k tents in the leftmost of the n free squares.
      for (let j = 0; j < n; j++) place[j] = j < k ? TENT : NONTENT;

      // mrow[0..len) is the row, [len..2len) row1 (start1), [2len..3len) row2.
      mrows.fill(MAGIC, 0, 3 * len);

      while (true) {
        // Valid unless two chosen tents are physically adjacent.
        let valid = true;
        for (let j = 0; j + 1 < n; j++) {
          if (place[j] === TENT && place[j + 1] === TENT && locs[j + 1] === locs[j] + 1) {
            valid = false;
            break;
          }
        }

        if (valid) {
          // Build trow (3*len): row = MAGIC then filled, row1/row2 = BLANK then
          // NONTENT around each tent.
          trows.fill(MAGIC, 0, len);
          trows.fill(BLANK, len, 3 * len);
          for (let j = 0; j < n; j++) {
            trows[locs[j]] = place[j];
            if (place[j] === TENT) {
              for (let jj = locs[j] - 1; jj <= locs[j] + 1; jj++) {
                if (jj >= 0 && jj < len) {
                  trows[len + jj] = NONTENT;
                  trows[2 * len + jj] = NONTENT;
                }
              }
            }
          }
          for (let j = 0; j < 3 * len; j++) {
            if (trows[j] === MAGIC) continue;
            if (mrows[j] === MAGIC || mrows[j] === trows[j]) mrows[j] = trows[j];
            else mrows[j] = BLANK;
          }
        }

        // Next combination of k choices from n.
        let p = 0;
        let j = n - 1;
        for (; j > 0; j--) {
          if (place[j] === TENT) p++;
          if (place[j] === NONTENT && place[j - 1] === TENT) {
            place[j - 1] = NONTENT;
            place[j] = TENT;
            while (p-- > 0) place[++j] = TENT;
            while (++j < n) place[j] = NONTENT;
            break;
          }
        }
        if (j <= 0) break; // finished enumerating
      }

      // No placement valid at all ⇒ inconsistent puzzle.
      if (mrows[locs[0]] === MAGIC) return { ret: 0, soln };

      // Apply anything newly deduced.
      for (let j = 0; j < len; j++) {
        for (let whichrow = 0; whichrow < 3; whichrow++) {
          const base = whichrow * len;
          const tstart = whichrow === 0 ? start : whichrow === 1 ? start1 : start2;
          if (
            tstart >= 0 &&
            mrows[base + j] !== MAGIC &&
            mrows[base + j] !== BLANK &&
            soln[tstart + j * step] === BLANK
          ) {
            soln[tstart + j * step] = mrows[base + j];
            doneSomething = true;
          }
        }
      }
    }

    if (doneSomething) continue;
    break;
  }

  // Return 1 if soln and links are completely filled, 2 otherwise.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (soln[y * w + x] === BLANK) return { ret: 2, soln };
      if (soln[y * w + x] !== NONTENT && links[y * w + x] === 0) return { ret: 2, soln };
    }
  }
  return { ret: 1, soln };
}
