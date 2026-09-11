/**
 * ABCD board generation — idiomatic port of `new_game_desc` (`abcd.c`).
 *
 * Fill the grid with random legal letters, and accept the fill only if the
 * deductive solver drives its clue counts to a unique solution; otherwise
 * retry. If `removenums`, greedily hide clues (in a shuffled order) while the
 * puzzle stays uniquely solvable.
 *
 * The pass reproduces the C desc byte-for-byte: the RNG surface is exactly one
 * `randomUpto` per fill cell plus, for hard mode, one `shuffle` of the clue
 * indices, and `solveAbcd` is deterministic. Because every accept/reject and
 * every clue removal is solver-gated, the differential's one byte-match
 * validates the fill order, the solver's every verdict and the codec together.
 *
 * Large boards can take many attempts; `validateParams`' size bound keeps a
 * player off the ones that never generate.
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { placeLetter, solveAbcd } from "./solver.ts";
import {
  type AbcdParams,
  cuboid,
  EMPTY,
  horClue,
  NO_NUMBER,
  verClue,
} from "./state.ts";

/**
 * ABCD's larger boards legitimately need far more attempts than the house
 * default. Sized against what `validateParams`' `MAX_GENERABLE_AREA` admits:
 * the slowest admitted configuration measured is 8×9 n5 at 1 acceptance in
 * 30,788, so 250,000 attempts leaves it a ~0.03% chance of exhausting the
 * budget, and every other admitted configuration is far safer. A firing here is
 * therefore a defect, as `retryLimit` assumes, not a board a player
 * legitimately asked for: the size bound, not this cap, keeps a player off an
 * ungenerable board.
 */
const ABCD_MAX_ATTEMPTS = 250_000;

export function newAbcdDesc(p: AbcdParams, rng: RandomState): { desc: string } {
  const { w, h, n } = p;
  const a = w * h;
  const l = w + h;

  const attempt = retryLimit(`abcd: generation (${w}x${h} n${n})`, ABCD_MAX_ATTEMPTS);
  // Retry until the solver finds the fill's clue set uniquely solvable.
  let numbers: Int32Array;
  do {
    attempt();

    const grid = new Int8Array(a).fill(EMPTY);
    const cube = new Uint8Array(a * n).fill(1); // all candidates open

    // Random fill in reading order. `placeLetter` (no `remaining`) keeps the
    // partial grid no-touch-legal, so every cell always has a candidate and the
    // fill never dead-ends.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const letters: number[] = [];
        for (let i = 0; i < n; i++) if (cube[cuboid(x, y, i, n, w)]) letters.push(i);
        placeLetter(p, grid, cube, x, y, letters[randomUpto(rng, letters.length)]);
      }
    }

    // Count clues from the finished grid.
    numbers = new Int32Array(l * n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const letter = grid[y * w + x];
        numbers[horClue(y, letter, n)]++;
        numbers[verClue(x, letter, n, h)]++;
      }
    }
  } while (solveAbcd(p, numbers).status !== "solved");

  // Hard mode: greedily hide clues while the puzzle stays uniquely solvable.
  if (p.removenums) {
    const indices = Array.from({ length: l * n }, (_, i) => i);
    shuffle(indices, rng);
    for (const idx of indices) {
      const clue = numbers[idx];
      numbers[idx] = NO_NUMBER;
      if (solveAbcd(p, numbers).status !== "solved") numbers[idx] = clue; // put it back
    }
  }

  // The comma-terminated clue list, `-` for a hidden clue.
  return { desc: Array.from(numbers, (v) => `${v === NO_NUMBER ? "-" : v},`).join("") };
}
