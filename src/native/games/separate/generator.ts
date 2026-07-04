/**
 * Separate generator — faithful port of `separate.c`'s `generate`.
 *
 * `divvyRectangle` picks a random `k`-omino partition; then we repeatedly fill
 * each omino with a shuffled set of the `k` letters and run the solver. The
 * solver records (via `genLock`) which squares' letters a deduction depended on;
 * those stay fixed while the rest are re-randomised, so the board is refined
 * toward one the solver can fully solve. A board is kept only when the solver
 * solves it completely, guaranteeing unique deducibility; a partition that never
 * yields a solvable board is abandoned for a fresh `divvyRectangle`.
 *
 * Every RNG draw (the `divvy` draws, the per-omino `shuffle`) is over the
 * bit-identical `random.ts` in upstream's exact order, so `newDesc` reproduces
 * the C desc byte-for-byte for a given seed (differential §4.3). The solver's
 * verdict gates the loop, so — like every solver-gated generator (§4.4) — the TS
 * solver must reach C's exact verdict; it is a direct port of `solver_attempt`.
 */
import { divvyRectangle } from "../../engine/divvy.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { newSolverScratch, SOLVED, STUCK, solverAttempt } from "./solver.ts";
import { encodeDesc, type SeparateParams } from "./state.ts";

const MAX_REGENERATE = 10000;

/** The letters grid for given params (each cell 0..k-1). */
export function generate(
  w: number,
  h: number,
  k: number,
  rng: RandomState,
): Uint8Array {
  const wh = w * h;
  const n = wh / k; // number of ominoes
  const sc = newSolverScratch(w, h, k);
  const grid = new Uint8Array(wh);
  const permutation = new Int32Array(wh); // permutation[omino*k + slot] = square
  const genLock = new Uint8Array(wh);

  for (let regen = 0; regen < MAX_REGENERATE; regen++) {
    const dsf = divvyRectangle(w, h, k, rng);

    // Number the ominoes by ascending canonical-root index (matching C), and
    // list each omino's k squares in `permutation`.
    const rootOmino = new Int32Array(wh).fill(-1);
    let j = 0;
    for (let i = 0; i < wh; i++) if (dsf.canonify(i) === i) rootOmino[i] = j++;
    const counter = new Int32Array(n);
    for (let i = 0; i < wh; i++) {
      const om = rootOmino[dsf.canonify(i)];
      permutation[om * k + counter[om]++] = i;
    }

    genLock.fill(0);
    sc.init();
    let retries = k * k;
    let m = STUCK;
    for (;;) {
      // Fill each omino with a shuffled set of the letters it still lacks
      // (the locked squares keep their letters).
      for (let i = 0; i < n; i++) {
        const lockedLetter = new Uint8Array(k);
        for (let s = 0; s < k; s++) {
          const index = permutation[i * k + s];
          if (genLock[index]) lockedLetter[grid[index]] = 1;
        }
        const remaining: number[] = [];
        for (let letter = 0; letter < k; letter++)
          if (!lockedLetter[letter]) remaining.push(letter);
        shuffle(remaining, rng); // length == free-square count; matches C
        let m2 = remaining.length;
        for (let s = 0; s < k; s++) {
          const index = permutation[i * k + s];
          if (!genLock[index]) grid[index] = remaining[--m2];
        }
      }

      m = solverAttempt(sc, grid, genLock);
      if (m === SOLVED || (m === STUCK && retries-- <= 0)) break;
      if (m !== STUCK) retries = k * k; // PROGRESS: reset the counter
    }

    if (m === SOLVED) return grid;
  }
  throw new Error(`separate generate: no board after ${MAX_REGENERATE} attempts`);
}

export function newSeparateDesc(p: SeparateParams, rng: RandomState): { desc: string } {
  const grid = generate(p.w, p.h, p.k, rng);
  return { desc: encodeDesc(grid, p.w * p.h) };
}
