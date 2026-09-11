/**
 * Spokes — the solver-gated generator (upstream `spokes_generate` /
 * `new_game_desc`).
 *
 * The shape is "start from everything, then strip":
 *
 * 1. Draw **every** horizontal and vertical line, plus **one** of the two
 *    diagonals in each interior cell, recording each drawn line.
 * 2. Shuffle that list.
 * 3. Walk it, tentatively removing each line; keep the removal only while
 *    every hub still has at least one line and the board still solves
 *    uniquely at the target difficulty. Otherwise put the line back.
 * 4. Accept only if the result additionally does *not* solve one tier easier,
 *    so the puzzle genuinely needs its difficulty (Easy is exempt — there is
 *    no easier tier). **This step diverges from upstream, which runs it on a
 *    dirty board** — see {@link SpokesGenerateOptions.upstreamDirtyGate}.
 *
 * The description is then just each hub's line count as a digit. Every hub
 * keeps a line, so no clue is `0` and a generated board has no holes.
 *
 * **This whole path is byte-match surface.** The only randomness is one
 * `randomUpto(rng, 2)` per interior cell (which diagonal) and the single
 * shuffle; everything after that is decided by the solver's verdict on each
 * intermediate board. So one byte-for-byte desc comparison against the C
 * validates the generator, the tiered solver *and* the codec at once — but it
 * also means any reordering or "optimization" of the draws silently diverges
 * every board.
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { SpokesScratch, spokesSolve } from "./solver.ts";
import {
  blankBoard,
  DIFF_EASY,
  DIR_BOT,
  DIR_BOTLEFT,
  DIR_BOTRIGHT,
  DIR_RIGHT,
  diffToLevel,
  SPOKE_DIRS,
  SPOKE_EMPTY,
  SPOKE_LINE,
  type SpokesBoard,
  type SpokesParams,
  spokesCount,
  spokesPlace,
} from "./state.ts";

/**
 * Fill the board with every horizontal and vertical line plus one random
 * diagonal per interior cell, returning each drawn line as
 * `(cellIndex << 3) | dir`.
 *
 * The sole RNG surface here is the one `randomUpto(rng, 2)` per interior cell.
 */
function spokesGenerateHubs(
  p: SpokesParams,
  b: SpokesBoard,
  rng: RandomState,
): number[] {
  const { w, h } = p;
  const lines: number[] = [];
  const draw = (i: number, d: number): void => {
    spokesPlace(b, i, d, SPOKE_LINE);
    lines.push((i << 3) | d);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) draw(y * w + x, DIR_RIGHT);
  }
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) draw(y * w + x, DIR_BOT);
  }
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      if (randomUpto(rng, 2)) draw(y * w + x, DIR_BOTRIGHT);
      else draw(y * w + x + 1, DIR_BOTLEFT);
    }
  }
  return lines;
}

/**
 * One generation attempt. `generated` accumulates the drawn lines (the answer
 * board) and `board` is the scratch the solver runs on; both are reused across
 * attempts, exactly as upstream reuses its two `game_state`s. On return,
 * `board.numbers` holds the clues.
 *
 * Returns whether the result is acceptable at the requested difficulty.
 */
function spokesGenerate(
  p: SpokesParams,
  generated: SpokesBoard,
  board: SpokesBoard,
  scratch: SpokesScratch,
  rng: RandomState,
  upstreamDirtyGate: boolean,
): boolean {
  const { w, h } = p;
  const n = w * h;
  const diff = diffToLevel(p.diff);
  const linesAt = (i: number): number => spokesCount(generated.spokes[i], SPOKE_LINE);

  blankBoard(w, h, generated);
  const lines = spokesGenerateHubs(p, generated, rng);
  shuffle(lines, rng);

  for (const line of lines) {
    const i = line >> 3;
    const d = line & 7;
    const i2 = i + SPOKE_DIRS[d].dy * w + SPOKE_DIRS[d].dx;

    // Every hub keeps at least one line.
    if (linesAt(i) === 1 || linesAt(i2) === 1) continue;

    spokesPlace(generated, i, d, SPOKE_EMPTY);
    blankBoard(w, h, board);
    for (let k = 0; k < n; k++) board.numbers[k] = linesAt(k);
    if (spokesSolve(board, scratch, diff) !== "valid") {
      spokesPlace(generated, i, d, SPOKE_LINE);
    }
  }

  // The divergence: re-solve from an *empty* position, as the strip loop does,
  // so the gate's verdict is about this puzzle rather than about whatever the
  // last solve left on the scratch board.
  if (!upstreamDirtyGate) blankBoard(w, h, board);
  for (let k = 0; k < n; k++) board.numbers[k] = linesAt(k);
  return diff === DIFF_EASY || spokesSolve(board, scratch, diff - 1) !== "valid";
}

export interface SpokesGenerateOptions {
  /**
   * Reproduce upstream's *dirty* final-difficulty gate verbatim.
   *
   * Upstream's last check reads "…and it must not solve one tier easier", but
   * it re-runs the solver on the scratch board after refreshing only its
   * `numbers` — the `spokes` still hold whatever the previous candidate's solve
   * left behind. So the gate frequently answers a question about the leftover
   * position instead of about the puzzle: measured on fixed seeds it saw an
   * already-*complete* board (which validates instantly, failing the attempt
   * for no difficulty-related reason) in 31–45% of attempts, and it let through
   * boards an easier tier cracks — 10 of 12 4×4 "Hard" boards also solved at
   * Tricky. That is a plain defect, not a difficulty curve upstream chose, so
   * {@link newSpokesDesc} clears the board first and the shipped game grades
   * honestly.
   *
   * Because the generator is solver-gated, that changes every Tricky and Hard
   * description — which would cost the byte-match differential that validates
   * the generator, the whole tiered solver and the codec together. This flag
   * keeps that oracle: `spokes-differential.test.ts` sets it, so the fixtures
   * still match the C byte-for-byte and the only line the oracle no longer
   * covers is the clear before the gate. Nothing else should ever set it.
   */
  readonly upstreamDirtyGate?: boolean;
}

/**
 * Generate a puzzle description: `w*h` clue digits in row-major order.
 *
 * Upstream loops unboundedly until an attempt is accepted; the bound here is
 * the house runaway guard (a faithful port converges in a handful of
 * attempts), and exhausting it throws rather than returning a fallback, so no
 * seed can quietly start producing a different board.
 */
export function newSpokesDesc(
  p: SpokesParams,
  rng: RandomState,
  options: SpokesGenerateOptions = {},
): { desc: string } {
  const { w, h } = p;
  const board = blankBoard(w, h);
  const generated = blankBoard(w, h);
  const scratch = new SpokesScratch(w * h);

  const dirty = options.upstreamDirtyGate ?? false;
  const attempt = retryLimit(`spokes: generation (${w}x${h} ${p.diff})`);
  while (!spokesGenerate(p, generated, board, scratch, rng, dirty)) attempt();

  return { desc: board.numbers.join("") };
}
