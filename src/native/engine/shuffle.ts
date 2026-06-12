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
