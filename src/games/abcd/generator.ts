/**
 * ABCD board generation — idiomatic port of `new_game_desc` (`abcd.c`).
 *
 * The simplest generation method: fill the grid with random legal letters, then
 * accept it only if the deductive solver drives its clue counts to a unique
 * solution; otherwise retry. If `removenums`, greedily hide clues (in a shuffled
 * order) while the puzzle stays uniquely solvable.
 *
 * The whole pass is a pure function of the seed and reproduces the C desc
 * byte-for-byte. The RNG surface is exactly one `randomUpto` per fill cell, plus
 * — for hard mode — one `shuffle` of the clue-index array; `solveAbcd` is
 * deterministic. Because the generator is solver-gated at every accept/reject
 * and every clue-removal decision, a single byte-match assertion validates the
 * fill order, the solver's every verdict, and the codec together (design D6).
 *
 * **Cost note (inherent, not a bug):** even×even large grids can take *many*
 * attempts (upstream's own TODO: a valid 10×10 n4 was never found; 9×9 n4 can
 * take tens of thousands). The retry cap is set high enough that the shipped
 * presets never reach it; there is no difficulty knob to add.
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

/** ABCD's even×even grids legitimately need far more attempts than the house
 * default (upstream ships a 6×6 n4 preset whose generation is slow by design). */
const ABCD_MAX_ATTEMPTS = 5_000_000;

export function newAbcdDesc(p: AbcdParams, rng: RandomState): { desc: string } {
  const { w, h, n } = p;
  const a = w * h;
  const l = w + h;

  const attempt = retryLimit(`abcd: generation (${w}x${h} n${n})`, ABCD_MAX_ATTEMPTS);
  let numbers = new Int32Array(l * n);

  for (;;) {
    attempt();

    const grid = new Int8Array(a).fill(EMPTY);
    const cube = new Uint8Array(a * n).fill(1); // all candidates open

    // Random fill, left-to-right / top-to-bottom. `placeLetter` (no `remaining`)
    // keeps the partial grid no-touch-legal, so every cell always has ≥1
    // candidate and the fill never dead-ends.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const letters: number[] = [];
        for (let i = 0; i < n; i++) if (cube[cuboid(x, y, i, n, w)]) letters.push(i);
        const rl = randomUpto(rng, letters.length);
        placeLetter(p, grid, cube, x, y, letters[rl]);
      }
    }

    // Count clues from the finished grid.
    numbers = new Int32Array(l * n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const let_ = grid[y * w + x];
        numbers[horClue(y, let_, n)]++;
        numbers[verClue(x, let_, n, h)]++;
      }
    }

    // Accept iff the solver finds this clue set uniquely solvable.
    if (solveAbcd(p, numbers).status === "solved") break;
  }

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

  // Emit the comma-terminated clue list (`-` for a hidden clue).
  let desc = "";
  for (let i = 0; i < l * n; i++) {
    desc += numbers[i] !== NO_NUMBER ? String(numbers[i]) : "-";
    desc += ",";
  }
  return { desc };
}
