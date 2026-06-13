/**
 * Fisher-Yates shuffle over the engine's `RandomState` — the idiomatic
 * port of upstream `misc.c shuffle()`. Promoted from Galaxies'
 * generator when Mosaic became the second consumer.
 */
import { type RandomState, randomUpto } from "../random/index.ts";

export function shuffle<T>(arr: T[], rng: RandomState): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomUpto(rng, i + 1);
    if (i !== j) {
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
  }
}

/**
 * Parity (0 or 1) of the number of inversions in the first `n` entries of
 * `perm` — the shared generator check used by sliding-tile puzzles to
 * decide whether a shuffled permutation is reachable. Per-game parity
 * *correction* (which entries to swap, under what condition) stays local
 * to each game's generator.
 */
export function permParity(perm: Int32Array, n: number): number {
  let ret = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      if (perm[i] > perm[j]) ret = 1 - ret;
    }
  }
  return ret;
}
