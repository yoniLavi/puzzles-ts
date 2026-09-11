/**
 * Pearl generator — port of `pearl_loopgen` + `new_clues` + `new_game_desc`
 * (pearl.c). Byte-match critical: the RNG draw order is reproduced exactly so
 * `newDesc(p, randomNew(seed))` equals the C output.
 *
 * The generator: build a random loop over the shared `generateLoop` (biased
 * toward black-pearl corners), derive the maximal clue set, gate on the
 * solver finding a unique solution at the requested difficulty (and failing
 * one tier easier), then greedily minimize the clues.
 */
import { type Grid, gridNewSquare } from "../../engine/grid/index.ts";
import {
  FACE_BLACK,
  FACE_WHITE,
  generateLoop,
  type LoopgenBias,
} from "../../engine/loopgen.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { pearlSolve } from "./solver.ts";
import {
  bLD,
  bLR,
  bLU,
  bRD,
  bRU,
  bUD,
  CORNER,
  D,
  DIFF_EASY,
  DX,
  DY,
  encodeClues,
  L,
  NOCLUE,
  type PearlParams,
  R,
  STRAIGHT,
  U,
} from "./state.ts";

/** Build the black-clue bias for `generateLoop` (upstream `pearl_loopgen_bias`),
 * rescanning the board on each call rather than updating incrementally. The
 * score (the count of black-clue corner sites on the WHITE and BLACK
 * boundaries) is a pure function of the board and draws no RNG, so a rescan
 * picks the identical candidate. */
function makeBias(g: Grid): LoopgenBias {
  const nEdges = g.numEdges;
  const nDots = g.numDots;
  const onLoop = new Uint8Array(nEdges);
  const vtype = new Int32Array(nDots);
  const nbr0 = new Int32Array(nDots);
  const nbr1 = new Int32Array(nDots);

  return (board: Int8Array, _face: number): number => {
    let score = 0;
    for (let bi = 0; bi < 2; bi++) {
      const c = bi === 0 ? FACE_WHITE : FACE_BLACK;
      // Which edges lie on this color's boundary.
      for (let ei = 0; ei < nEdges; ei++) {
        const e = g.edges[ei];
        const fc1 = e.face1 ? board[e.face1.index] : FACE_BLACK;
        const fc2 = e.face2 ? board[e.face2.index] : FACE_BLACK;
        onLoop[ei] = (fc1 === c) !== (fc2 === c) ? 1 : 0;
      }
      // Vertex types (corner / straight / off-loop) + loop neighbors.
      for (let di = 0; di < nDots; di++) {
        const d = g.dots[di];
        let type = 0;
        let n0 = 0;
        let n1 = 0;
        let n = 0;
        for (let k = 0; k < d.order; k++) {
          const e = d.edges[k];
          const d2 = e.dot1 === d ? e.dot2 : e.dot1;
          // dir == 0,1,2,3 for an edge going L,U,R,D.
          const dir = (d.y === d2.y ? 1 : 0) + 2 * (d.x + d.y > d2.x + d2.y ? 1 : 0);
          if (onLoop[e.index]) {
            type |= 1 << dir;
            if (n === 0) n0 = d2.index;
            else if (n === 1) n1 = d2.index;
            n++;
          }
        }
        // A corner: on the loop but not a straight run.
        if (type !== 0 && type !== 0x5 && type !== 0xa) type |= 0x10;
        vtype[di] = type;
        nbr0[di] = n0;
        nbr1[di] = n1;
      }
      // A black-clue site: a corner whose two loop neighbors are non-corners.
      for (let di = 0; di < nDots; di++) {
        if (vtype[di] & 0x10 && !((vtype[nbr0[di]] | vtype[nbr1[di]]) & 0x10)) score++;
      }
    }
    return score;
  };
}

/** Generate a random loop into `lines` (length w*h) via the biased loop
 * generator, converting the face coloring to per-cell R/U/L/D line bits
 * (upstream `pearl_loopgen`). */
export function pearlLoopgen(
  w: number,
  h: number,
  lines: Uint8Array,
  rng: RandomState,
  g: Grid,
): void {
  const board = new Int8Array(g.numFaces);
  const s = g.tileSize;
  lines.fill(0, 0, w * h);

  generateLoop(g, board, rng, makeBias(g));

  const faceColor = (f: (typeof g.faces)[number] | null): number =>
    f === null ? FACE_BLACK : board[f.index];

  for (let i = 0; i < g.numEdges; i++) {
    const e = g.edges[i];
    const c1 = faceColor(e.face1);
    const c2 = faceColor(e.face2);
    if (c1 !== c2) {
      // This grid edge is on the loop: lay a line along it.
      let x1 = (e.dot1.x / s) | 0;
      let y1 = (e.dot1.y / s) | 0;
      let x2 = (e.dot2.x / s) | 0;
      let y2 = (e.dot2.y / s) | 0;
      if (x1 === x2) {
        if (y1 > y2) [y1, y2] = [y2, y1];
        lines[y1 * w + x1] |= D;
        lines[y2 * w + x1] |= U;
      } else if (y1 === y2) {
        if (x1 > x2) [x1, x2] = [x2, x1];
        lines[y1 * w + x1] |= R;
        lines[y1 * w + x2] |= L;
      }
    }
  }
}

/**
 * Build a puzzle: a random loop, its maximal clue set, solver-gated to a
 * unique solution at `difficulty` (and — for Tricky — not solvable one tier
 * easier), then greedily minimized. Writes `clues` and the solution
 * `gridOut` (both length w*h). Follows `new_clues`, including the upstream
 * `corners`-array duplication quirk and the 5×5-Tricky→Easy downgrade.
 */
function newClues(
  params: PearlParams,
  rng: RandomState,
  clues: Uint8Array,
  gridOut: Uint8Array,
): void {
  const w = params.w;
  const h = params.h;
  let diff = params.difficulty;
  const g = gridNewSquare(w - 1, h - 1);

  // 5x5 Tricky is not generable (spins forever), so fudge it to Easy.
  if (w === 5 && h === 5 && diff > DIFF_EASY) diff = DIFF_EASY;

  const attempt = retryLimit("pearl: newClues");
  while (true) {
    attempt();
    pearlLoopgen(w, h, gridOut, rng, g);

    // Set up the maximal clue array.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const type = gridOut[y * w + x];
        clues[y * w + x] = NOCLUE;
        if ((bLR | bUD) & (1 << type)) {
          // A straight: a viable white clue iff at least one connected
          // square is a corner.
          let d = 1;
          for (; d <= 8; d += d)
            if (type & d) {
              const xx = x + DX(d);
              const yy = y + DY(d);
              if ((bLU | bLD | bRU | bRD) & (1 << gridOut[yy * w + xx])) break;
            }
          if (d <= 8) clues[y * w + x] = STRAIGHT;
        } else if ((bLU | bLD | bRU | bRD) & (1 << type)) {
          // A corner: a viable black clue iff every connected square is a
          // straight.
          let d = 1;
          for (; d <= 8; d += d)
            if (type & d) {
              const xx = x + DX(d);
              const yy = y + DY(d);
              if (!((bLR | bUD) & (1 << gridOut[yy * w + xx]))) break;
            }
          if (d > 8) clues[y * w + x] = CORNER;
        }
      }

    if (!params.nosolve) {
      // See if we can solve the puzzle just like this, and that it isn't too
      // easy; otherwise go round and try again.
      if (pearlSolve(w, h, clues, gridOut, diff, false) !== 1) continue;
      if (diff > DIFF_EASY && pearlSolve(w, h, clues, gridOut, diff - 1, false) === 1)
        continue;

      // Shuffle the clues and remove them one at a time, keeping each removal
      // that leaves the puzzle soluble. Upstream meant to remove whichever clue
      // type is more numerous, but fills its `corners` array from STRAIGHT
      // positions too: corner clues are never removed and every straight is
      // tried twice. Reproduced, the second shuffle's RNG draws included,
      // because the frozen differential checks the desc byte for byte.
      const straights: number[] = [];
      for (let i = 0; i < w * h; i++) if (clues[i] === STRAIGHT) straights.push(i);
      shuffle(straights, rng);
      shuffle(straights.slice(), rng); // upstream's `corners` shuffle; only its draws matter

      for (let pass = 0; pass < 2; pass++)
        for (let k = straights.length - 1; k >= 0; k--) {
          const i = straights[k];
          const clue = clues[i];
          clues[i] = NOCLUE; // try removing this clue
          if (pearlSolve(w, h, clues, gridOut, diff, false) !== 1) clues[i] = clue; // oops, put it back
        }
    }

    break; // got it
  }
}

export function newDesc(
  params: PearlParams,
  rng: RandomState,
): { desc: string; aux: string } {
  const w = params.w;
  const h = params.h;
  const grid = new Uint8Array(w * h);
  const clues = new Uint8Array(w * h);

  newClues(params, rng, clues, grid);

  // aux: the full solution as a hex string (upstream `new_game_desc`).
  let aux = "";
  for (const v of grid) aux += v.toString(16).toUpperCase();

  return { desc: encodeClues(clues, w * h), aux };
}
