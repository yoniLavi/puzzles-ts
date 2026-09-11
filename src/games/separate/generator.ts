/**
 * Separate generator — a port of `separate.c`'s `generate`.
 *
 * `divvyRectangle` picks a random `k`-omino partition; then we repeatedly fill
 * each omino with a shuffled set of the `k` letters and run the solver. The
 * solver records (via `genLock`) which squares' letters a deduction depended on;
 * those stay fixed while the rest are re-randomized, so the board is refined
 * toward one the solver can fully solve. A board is kept only when the solver
 * solves it completely, guaranteeing unique deducibility; a partition that never
 * yields a solvable board is abandoned for a fresh `divvyRectangle`.
 *
 * Every RNG draw (the `divvy` draws, the per-omino `shuffle`) is in upstream's
 * exact order over the bit-identical `random.ts`, and the solver's verdict gates
 * the loop, so the desc byte-matches C's for a seed only while the solver
 * reaches C's exact verdict too. The differential checks both.
 */
import { divvyRectangle } from "../../engine/divvy.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { SOLVED, SolverScratch, STUCK, solverAttempt } from "./solver.ts";
import { encodeDesc, type SeparateParams } from "./state.ts";

const MAX_REGENERATE = 10000;

export function newSeparateDesc(p: SeparateParams, rng: RandomState): { desc: string } {
  const { w, h, k } = p;
  const wh = w * h;
  const n = wh / k; // number of ominoes
  const sc = new SolverScratch(w, h, k);
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

    if (m === SOLVED) return { desc: encodeDesc(grid, wh) };
  }
  throw new Error(`separate generate: no board after ${MAX_REGENERATE} attempts`);
}
