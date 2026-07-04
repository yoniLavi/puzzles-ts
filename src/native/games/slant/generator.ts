/**
 * Slant generator — faithful port of `slant_generate` / `new_game_desc` in
 * slant.c. Byte-match critical: every RNG draw (one shuffle of the square
 * order, one `random_upto(rs, 2)` per unforced square, one shuffle of the
 * clue order) and every solver verdict in the clue-removal loop must match C
 * exactly for the desc to reproduce byte-for-byte (design D2).
 */
import { Dsf } from "../../engine/dsf.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { fillSquare, SOLVE_UNIQUE, SolverScratch, slantSolve } from "./solver.ts";
import { DIFF_EASY, encodeClues, type SlantParams } from "./state.ts";

/**
 * Generate a random filled grid (upstream `slant_generate`): visit the
 * squares in shuffled order; where connectivity forces an orientation take
 * it, otherwise draw one random bit. Never needs to backtrack — two
 * existing paths across both diagonals of one square would have to cross at
 * a shared point, and chessboard-colouring the points shows they can't.
 */
export function slantGenerate(
  w: number,
  h: number,
  soln: Int8Array,
  rs: RandomState,
): void {
  const W = w + 1;
  soln.fill(0);
  const connected = new Dsf(W * (h + 1));

  const indices = Array.from({ length: w * h }, (_, i) => i);
  shuffle(indices, rs);

  for (const idx of indices) {
    const y = Math.floor(idx / w);
    const x = idx % w;

    const fs =
      connected.canonify(y * W + x) === connected.canonify((y + 1) * W + (x + 1));
    const bs =
      connected.canonify((y + 1) * W + x) === connected.canonify(y * W + (x + 1));
    if (fs && bs) throw new Error("slant generator: both diagonals forced");

    const v = fs ? 1 : bs ? -1 : 2 * randomUpto(rs, 2) - 1;
    fillSquare(w, h, x, y, v, soln, connected, null);
  }
}

/** Derive the full clue set of a filled grid. */
function deriveClues(w: number, h: number, soln: Int8Array): Int8Array {
  const W = w + 1;
  const H = h + 1;
  const clues = new Int8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      if (x > 0 && y > 0 && soln[(y - 1) * w + (x - 1)] === -1) v++;
      if (x > 0 && y < h && soln[y * w + (x - 1)] === 1) v++;
      if (x < w && y > 0 && soln[(y - 1) * w + x] === 1) v++;
      if (x < w && y < h && soln[y * w + x] === -1) v++;
      clues[y * W + x] = v;
    }
  }
  return clues;
}

export function newDesc(
  params: SlantParams,
  rs: RandomState,
): { desc: string; aux: string } {
  const { w, h, diff } = params;
  const W = w + 1;
  const H = h + 1;

  const soln = new Int8Array(w * h);
  const tmpsoln = new Int8Array(w * h);
  let clues: Int8Array;
  const sc = new SolverScratch(w, h);

  do {
    slantGenerate(w, h, soln, rs);
    clues = deriveClues(w, h, soln);

    // With all clue points filled in, every puzzle is Easy-solvable
    // (upstream asserts this; its solve consumes no RNG).
    if (slantSolve(w, h, clues, tmpsoln, sc, DIFF_EASY) !== SOLVE_UNIQUE) {
      throw new Error("slant generator: full clue set not Easy-solvable");
    }

    // Remove as many clues as possible while retaining solubility. In Hard
    // mode, remove the obvious starting points (4s, 0s, border 2s, corner
    // 1s) in a first pass, so as few of them as possible survive.
    const clueIndices = Array.from({ length: W * H }, (_, i) => i);
    shuffle(clueIndices, rs);
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < W * H; i++) {
        const idx = clueIndices[i];
        const y = Math.floor(idx / W);
        const x = idx % W;
        const v = clues[idx];

        const xb = x === 0 || x === W - 1;
        const yb = y === 0 || y === H - 1;
        const pass =
          diff === DIFF_EASY ||
          v === 4 ||
          v === 0 ||
          (v === 2 && (xb || yb)) ||
          (v === 1 && xb && yb)
            ? 0
            : 1;

        if (pass === j) {
          clues[idx] = -1;
          if (slantSolve(w, h, clues, tmpsoln, sc, diff) !== SOLVE_UNIQUE) {
            clues[idx] = v; // put it back
          }
        }
      }
    }

    // Verify the board is of at least the requested difficulty: the solver
    // one level down must fail to converge.
  } while (diff > 0 && slantSolve(w, h, clues, tmpsoln, sc, diff - 1) <= SOLVE_UNIQUE);

  let aux = "";
  for (let i = 0; i < w * h; i++) aux += soln[i] < 0 ? "\\" : "/";

  return { desc: encodeClues(clues), aux };
}
