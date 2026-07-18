/**
 * Pearl generator — faithful port of `pearl_loopgen` + `new_clues` +
 * `new_game_desc` (pearl.c). Byte-match critical: the RNG draw order is
 * reproduced exactly so `newDesc(p, randomNew(seed))` equals the C output.
 *
 * The generator: build a random loop over the shared `generateLoop` (biased
 * toward black-pearl corners), derive the maximal clue set, gate on the
 * solver finding a unique solution at the requested difficulty (and failing
 * one tier easier), then greedily minimise the clues.
 */
import { type Grid, gridNewSquare } from "../../engine/grid.ts";
import {
  FACE_BLACK,
  FACE_WHITE,
  generateLoop,
  type LoopgenBias,
} from "../../engine/loopgen.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
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

/** Build the black-clue bias function for `generateLoop`. Faithful to
 * `pearl_loopgen_bias`, but computed by full rescan each call rather than
 * incrementally: the bias's only observable effect is its return value (a
 * count of black-clue corner sites in the WHITE and BLACK boundaries, a pure
 * function of the board), so a rescan yields the identical score — and thus
 * the identical candidate choice — while consuming no RNG. */
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
      // Which edges lie on this colour's boundary.
      for (let ei = 0; ei < nEdges; ei++) {
        const e = g.edges[ei];
        const fc1 = e.face1 ? board[e.face1.index] : FACE_BLACK;
        const fc2 = e.face2 ? board[e.face2.index] : FACE_BLACK;
        onLoop[ei] = (fc1 === c) !== (fc2 === c) ? 1 : 0;
      }
      // Vertex types (corner / straight / off-loop) + loop neighbours.
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
      // A black-clue site: a corner whose two loop neighbours are non-corners.
      for (let di = 0; di < nDots; di++) {
        if (vtype[di] & 0x10 && !((vtype[nbr0[di]] | vtype[nbr1[di]]) & 0x10)) score++;
      }
    }
    return score;
  };
}

/** Generate a random loop into `lines` (length w*h) via the biased loop
 * generator, converting the face colouring to per-cell R/U/L/D line bits.
 * Faithful to `pearl_loopgen`. */
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

  const faceColour = (f: (typeof g.faces)[number] | null): number =>
    f === null ? FACE_BLACK : board[f.index];

  for (let i = 0; i < g.numEdges; i++) {
    const e = g.edges[i];
    const c1 = faceColour(e.face1);
    const c2 = faceColour(e.face2);
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
 * easier), then greedily minimised. Writes `clues` and the solution
 * `gridOut` (both length w*h). Faithful to `new_clues`, including the
 * upstream `corners`-array duplication quirk (design D4) and the
 * 5×5-Tricky→Easy downgrade.
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
      // See if we can solve the puzzle just like this.
      let ret = pearlSolve(w, h, clues, gridOut, diff, false);
      if (ret !== 1) continue; // go round and try again

      // Check it isn't too easy.
      if (diff > DIFF_EASY) {
        ret = pearlSolve(w, h, clues, gridOut, diff - 1, false);
        if (ret === 1) continue; // too easy: try again
      }

      // Shuffle the grid points and gradually remove clues to find a minimal
      // set that still leaves the puzzle soluble. We preferentially remove
      // whichever clue type is currently most numerous.
      //
      // Upstream `corners`-array quirk reproduced verbatim (design D4): the
      // `corners` array is filled from STRAIGHT positions (not CORNER), and
      // removal always indexes the `straights` array — so corner clues are
      // never removed and each straight is processed twice, while the second
      // shuffle still consumes RNG sized by the straight count. Porting the
      // "intended" logic would change the RNG stream and diverge the desc.
      const straights: number[] = [];
      for (let i = 0; i < w * h; i++) if (clues[i] === STRAIGHT) straights.push(i);
      const cornersDummy: number[] = [];
      for (let i = 0; i < w * h; i++) if (clues[i] === STRAIGHT) cornersDummy.push(i);
      const nstraights = straights.length;
      const ncorners = cornersDummy.length;
      let nstraightpos = straights.length;
      let ncornerpos = cornersDummy.length;

      shuffle(straights, rng);
      shuffle(cornersDummy, rng); // consumes RNG; result never read

      while (nstraightpos > 0 || ncornerpos > 0) {
        let cluepos: number;
        // nstraights == ncorners always (both count straights), so the
        // "overrepresented" branch always drains nstraightpos first; then
        // ncornerpos drains, re-reading the straights array.
        if (nstraightpos > 0 && ncornerpos > 0) {
          if (nstraights >= ncorners) cluepos = straights[--nstraightpos];
          else cluepos = straights[--ncornerpos];
        } else {
          if (nstraightpos > 0) cluepos = straights[--nstraightpos];
          else cluepos = straights[--ncornerpos];
        }

        const y = (cluepos / w) | 0;
        const x = cluepos % w;
        const clue = clues[y * w + x];
        clues[y * w + x] = 0; // try removing this clue
        ret = pearlSolve(w, h, clues, gridOut, diff, false);
        if (ret !== 1) clues[y * w + x] = clue; // oops, put it back
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

  const desc = encodeClues(clues, w * h);

  // aux: the full solution as a hex string (upstream `new_game_desc`).
  let aux = "";
  for (let i = 0; i < w * h; i++) {
    const v = grid[i];
    aux += v < 10 ? String.fromCharCode(v + 48) : String.fromCharCode(v + 65 - 10);
  }

  return { desc, aux };
}
