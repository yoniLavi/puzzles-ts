/**
 * Random-loop generator — the idiomatic TS port of upstream `loopgen.c`
 * (the loop-generation code Loopy and Pearl share), landed lazily with its
 * first consumer, Pearl.
 *
 * `generateLoop(grid, board, rng, bias?)` colors every face of `grid`
 * inside (WHITE) or outside (BLACK) so the white/black boundary is a single
 * closed loop, writing the coloring into `board`. It is **RNG-faithful**:
 * it reproduces the exact `generate_loop` draw order so a generator built
 * on it (Pearl) is byte-match portable —
 *   1. a per-face 31-bit random score (`randomBits(rng, 31)`),
 *   2. a random seed face (`randomUpto(rng, numFaces)`),
 *   3. per main-loop iteration a random candidate color (`randomUpto(rng, 2)`),
 *   4. one shuffle of the face list, and
 *   5. a final random flip pass (`randomUpto(rng, 10)` per flippable face).
 * The candidate sets are ordered by (score desc, random asc, face index),
 * where the final **face-index** tie-break reproduces upstream's
 * pointer-order tie-break (faces are allocated in index order, so pointer
 * order is index order — see grid.ts). Because the random field is 31 bits
 * the index tie-break is essentially never reached.
 */

import type { Grid, GridFace } from "./grid/index.ts";
import { type RandomState, randomBits, randomUpto } from "./random/index.ts";
import { shuffle } from "./shuffle.ts";
import { SortedMultiset } from "./sorted-multiset.ts";

/** Face colors (mirrors upstream `enum face_colour`). */
export const FACE_WHITE = 0;
export const FACE_GRAY = 1;
export const FACE_BLACK = 2;

/** Bias callback: given the (partially-colored) board and the single face
 * that changed since the previous call, return a desirability score. The
 * contract (upstream `loopgen_bias_fn_t`) is that it consumes **no**
 * randomness, and is called tentative-set → restore → notify-commit so it
 * can track incremental state. */
export type LoopgenBias = (board: Int8Array, face: number) => number;

/** Color of a face reference: the infinite exterior (null) is always
 * BLACK. Mirrors upstream `FACE_COLOR`. */
function faceColor(board: Int8Array, f: GridFace | null): number {
  return f === null ? FACE_BLACK : board[f.index];
}

/** Count the neighbors of `face` currently colored `color`. */
function faceNumNeighbors(board: Int8Array, face: GridFace, color: number): number {
  let count = 0;
  for (let i = 0; i < face.order; i++) {
    const e = face.edges[i];
    if (e === null) continue;
    const f = e.face1 === face ? e.face2 : e.face1;
    if (faceColor(board, f) === color) count++;
  }
  return count;
}

/** Desirability of coloring `face` with `color`: fewer same-colored
 * neighbors is better (`0 - num same-colored neighbors`). */
function faceScore(board: Int8Array, face: GridFace, color: number): number {
  return -faceNumNeighbors(board, face, color);
}

/**
 * Whether it is legal to color `faceIndex` with `color` — the
 * exactly-two-transitions topology test that avoids single-color loops and
 * corner-violations. Faithful port of `can_colour_face`.
 */
function canColorFace(
  g: Grid,
  board: Int8Array,
  faceIndex: number,
  color: number,
): boolean {
  const testFace = g.faces[faceIndex];

  // Can only color a face adjacent to a face already of this color.
  let foundSame = false;
  for (let i = 0; i < testFace.order; i++) {
    const e = testFace.edges[i];
    if (e === null) continue;
    const f = e.face1 === testFace ? e.face2 : e.face1;
    if (faceColor(board, f) === color) {
      foundSame = true;
      break;
    }
  }
  if (!foundSame) return false;

  // Walk the inflated path around the test face, counting color/not-color
  // transitions. i indexes a dot around the test face; j indexes a face
  // around that dot; the current face is testFace.dots[i].faces[j].
  let i = 0;
  let j = 0;
  // biome-ignore lint/style/noNonNullAssertion: square-grid faces always have their dots.
  let currentFace: GridFace | null = testFace.dots[0]!.faces[0];
  if (currentFace === testFace) {
    j = 1;
    // biome-ignore lint/style/noNonNullAssertion: seeded above.
    currentFace = testFace.dots[0]!.faces[1];
  }
  let transitions = 0;
  let currentState = faceColor(board, currentFace) === color;
  let startingDot: number | null = null; // dot index, or null before first step
  let startingFace: GridFace | null = null;

  while (true) {
    // Advance to the next face (may take several goes).
    while (true) {
      j++;
      // biome-ignore lint/style/noNonNullAssertion: dots around a face are set.
      const di = testFace.dots[i]!;
      if (j === di.order) j = 0;
      if (di.faces[j] === testFace) {
        // Advance to next dot round testFace, find currentFace around it,
        // then advance to the next face clockwise.
        i++;
        if (i === testFace.order) i = 0;
        // biome-ignore lint/style/noNonNullAssertion: dots around a face are set.
        const di2 = testFace.dots[i]!;
        let k = 0;
        for (; k < di2.order; k++) if (di2.faces[k] === currentFace) break;
        // Must find currentFace around the new dot.
        j = k;
        // Found; advance to next face and try again.
      } else {
        break;
      }
    }
    // biome-ignore lint/style/noNonNullAssertion: dots around a face are set.
    const di = testFace.dots[i]!;
    currentFace = di.faces[j];
    const s = faceColor(board, currentFace) === color;
    if (startingDot === null) {
      startingDot = di.index;
      startingFace = currentFace;
      currentState = s;
    } else {
      if (s !== currentState) {
        transitions++;
        currentState = s;
        if (transitions > 2) break;
      }
      if (di.index === startingDot && currentFace === startingFace) break;
    }
  }

  return transitions === 2;
}

/**
 * Generate a complete random closed loop for `grid`, writing FACE_WHITE /
 * FACE_BLACK into `board` (length `grid.numFaces`). See the file header for
 * the RNG contract.
 */
export function generateLoop(
  g: Grid,
  board: Int8Array,
  rng: RandomState,
  bias?: LoopgenBias,
): void {
  const numFaces = g.numFaces;

  // Start all gray.
  board.fill(FACE_GRAY, 0, numFaces);

  // Per-face score record: white/black score plus a fixed random field.
  const whiteScore = new Int32Array(numFaces);
  const blackScore = new Int32Array(numFaces);
  const random = new Float64Array(numFaces); // 31-bit values fit exactly
  for (let i = 0; i < numFaces; i++) {
    random[i] = randomBits(rng, 31);
  }

  // Color a random finite face white; the infinite face is implicitly black.
  board[randomUpto(rng, numFaces)] = FACE_WHITE;

  // Candidate sets, sorted by (score desc, random asc, index asc). The
  // comparator reads the *current* score arrays; the delete-before-rescore
  // discipline (mirroring del234/add234) keeps the invariant.
  const cmp =
    (score: Int32Array) =>
    (a: number, b: number): number => {
      const r = score[b] - score[a];
      if (r) return r;
      if (random[a] < random[b]) return -1;
      if (random[a] > random[b]) return 1;
      return a - b;
    };
  const lightable = new SortedMultiset<number>(cmp(whiteScore));
  const darkable = new SortedMultiset<number>(cmp(blackScore));

  // Initialize both candidate lists (needs the full colorability check —
  // the grid keeps no list of the infinite face's neighbors).
  for (let i = 0; i < numFaces; i++) {
    if (board[i] !== FACE_GRAY) continue;
    if (canColorFace(g, board, i, FACE_BLACK)) {
      blackScore[i] = faceScore(board, g.faces[i], FACE_BLACK);
      darkable.add(i);
    }
    if (canColorFace(g, board, i, FACE_WHITE)) {
      whiteScore[i] = faceScore(board, g.faces[i], FACE_WHITE);
      lightable.add(i);
    }
  }

  // Color faces one at a time until none is colorable.
  while (true) {
    const cLight = lightable.size;
    const cDark = darkable.size;
    if (cLight === 0 && cDark === 0) break; // no more faces we can use

    const color = randomUpto(rng, 2) ? FACE_WHITE : FACE_BLACK;
    const facesToPick = color === FACE_WHITE ? lightable : darkable;

    let chosen: number;
    if (bias) {
      // Pick the face the bias likes best, breaking ties by the sorted
      // order (replace only on strictly-greater, matching C's `> bestscore`).
      let best = -1;
      let bestScore = 0;
      for (let k = 0; k < facesToPick.size; k++) {
        const fi = facesToPick.get(k);
        board[fi] = color;
        const score = bias(board, fi);
        board[fi] = FACE_GRAY;
        bias(board, fi); // let bias know we put it back
        if (best === -1 || score > bestScore) {
          bestScore = score;
          best = fi;
        }
      }
      chosen = best;
    } else {
      chosen = facesToPick.get(0);
    }

    const i = chosen;
    board[i] = color;
    if (bias) bias(board, i); // notify bias of the change

    // Remove the newly-colored face from both lists.
    lightable.delete(i);
    darkable.delete(i);

    // Recompute colorability/scores of every face touching the one we just
    // colored (edge or corner). Iterate its corners, then each corner's faces.
    const curFace = g.faces[i];
    for (let ci = 0; ci < curFace.order; ci++) {
      const d = curFace.dots[ci];
      if (d === null) continue;
      for (let cj = 0; cj < d.order; cj++) {
        const f = d.faces[cj];
        if (f === null || f === curFace) continue;
        if (faceColor(board, f) !== FACE_GRAY) continue;
        const fi = f.index;
        // Remove-then-add (even if still colorable) to keep sort order.
        lightable.delete(fi);
        if (canColorFace(g, board, fi, FACE_WHITE)) {
          whiteScore[fi] = faceScore(board, f, FACE_WHITE);
          lightable.add(fi);
        }
        darkable.delete(fi);
        if (canColorFace(g, board, fi, FACE_BLACK)) {
          blackScore[fi] = faceScore(board, f, FACE_BLACK);
          darkable.add(fi);
        }
      }
    }
  }

  // The tendril / random-flip pass needs a shuffled list of all faces.
  const faceList: number[] = [];
  for (let i = 0; i < numFaces; i++) faceList.push(i);
  shuffle(faceList, rng);

  // Normal passes grow 'tendrils' (flip a face adjacent to exactly one
  // opposite-colored face) until no flip occurs, then one final random pass.
  let doRandomPass = false;
  while (true) {
    let flipped = false;
    for (let idx = 0; idx < numFaces; idx++) {
      const jf = faceList[idx];
      const opp = board[jf] === FACE_WHITE ? FACE_BLACK : FACE_WHITE;
      if (canColorFace(g, board, jf, opp)) {
        const face = g.faces[jf];
        if (doRandomPass) {
          if (randomUpto(rng, 10) === 0) board[jf] = opp;
        } else if (faceNumNeighbors(board, face, opp) === 1) {
          board[jf] = opp;
          flipped = true;
        }
      }
    }
    if (doRandomPass) break;
    if (!flipped) doRandomPass = true;
  }
}
