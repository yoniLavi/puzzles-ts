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
 *    no easier tier).
 *
 * The description is then just each hub's line count as a digit.
 *
 * **This whole path is byte-match surface.** The only randomness is one
 * `randomUpto(rng, 2)` per interior cell (which diagonal) and the single
 * shuffle; everything after that is decided by the solver's verdict on each
 * intermediate board. So one byte-for-byte desc comparison against the C
 * validates the generator, the tiered solver *and* the codec at once — but it
 * also means any reordering or "optimisation" of the draws silently diverges
 * every board.
 */

import { retryLimit } from "../../engine/retry-limit.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { SpokesScratch, spokesSolve } from "./solver.ts";
import {
  blankBoard,
  DIFF_EASY,
  DIR_BOT,
  DIR_BOTLEFT,
  DIR_BOTRIGHT,
  DIR_RIGHT,
  diffToLevel,
  getSpoke,
  invDir,
  SPOKE_DIRS,
  SPOKE_EMPTY,
  SPOKE_HIDDEN,
  SPOKE_LINE,
  type SpokesBoard,
  type SpokesParams,
  setSpoke,
  spokesCount,
  spokesPlace,
} from "./state.ts";

/**
 * Fill the board with every horizontal and vertical line plus one random
 * diagonal per interior cell, recording each drawn line into `temp` as
 * `(cellIndex << 3) | dir`. Returns how many entries were written.
 *
 * The sole RNG surface here is the one `randomUpto(rng, 2)` per interior cell.
 */
function spokesGenerateHubs(
  p: SpokesParams,
  b: SpokesBoard,
  temp: Int32Array,
  rng: RandomState,
): number {
  const { w, h } = p;
  let n = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      spokesPlace(b, y * w + x, DIR_RIGHT, SPOKE_LINE);
      temp[n++] = ((y * w + x) << 3) | DIR_RIGHT;
    }
  }

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      spokesPlace(b, y * w + x, DIR_BOT, SPOKE_LINE);
      temp[n++] = ((y * w + x) << 3) | DIR_BOT;
    }
  }

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      if (randomUpto(rng, 2)) {
        spokesPlace(b, y * w + x, DIR_BOTRIGHT, SPOKE_LINE);
        temp[n++] = ((y * w + x) << 3) | DIR_BOTRIGHT;
      } else {
        spokesPlace(b, y * w + x + 1, DIR_BOTLEFT, SPOKE_LINE);
        temp[n++] = ((y * w + x + 1) << 3) | DIR_BOTLEFT;
      }
    }
  }

  return n;
}

/**
 * Reset a board's playable spokes to `EMPTY` and re-derive the hidden ones
 * from the clue numbers (upstream `spokes_generate_clear`) — a hub with clue
 * `0` is a hole, so it loses its spokes and its neighbours lose theirs
 * pointing at it. This is the `'0'` half of `newState`'s hole processing; the
 * generator never produces the wider `'X'` hole.
 */
function spokesGenerateClear(b: SpokesBoard): void {
  const { w, h } = b;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (b.numbers[i]) {
        for (let d = 0; d < 8; d++) {
          if (getSpoke(b.spokes[i], d) !== SPOKE_HIDDEN)
            setSpoke(b.spokes, i, d, SPOKE_EMPTY);
        }
      } else {
        b.spokes[i] = 0;
        for (let d = 0; d < 8; d++) {
          const dx = x + SPOKE_DIRS[d].dx;
          const dy = y + SPOKE_DIRS[d].dy;
          if (dx < 0 || dx >= w || dy < 0 || dy >= h) continue;
          setSpoke(b.spokes, dy * w + dx, invDir(d), SPOKE_HIDDEN);
        }
      }
    }
  }
}

/** Upstream `shuffle()` over the first `count` entries of `temp`. */
function shufflePrefix(temp: Int32Array, count: number, rng: RandomState): void {
  for (let i = count - 1; i > 0; i--) {
    const j = randomUpto(rng, i + 1);
    if (j !== i) {
      const t = temp[i];
      temp[i] = temp[j];
      temp[j] = t;
    }
  }
}

/**
 * One generation attempt. `generated` accumulates the drawn lines (the answer
 * board) and `board` is the scratch the solver runs on; both are reused across
 * attempts, exactly as upstream reuses its two `game_state`s.
 *
 * Returns whether the result is acceptable at the requested difficulty.
 *
 * **A faithful quirk, deliberately kept — do not "fix" this.** The final "and
 * it must *not* solve one tier easier" gate re-runs the solver on `board` after
 * only its `numbers` have been refreshed: its `spokes` still carry whatever the
 * last candidate's solve left behind. Upstream does exactly this, so the gate
 * mostly does not measure what it claims to. Measured on fixed seeds: the gate
 * saw an already-*complete* leftover board (which validates instantly, failing
 * the attempt for no difficulty-related reason) in 31–45% of attempts, and 10
 * of 12 4×4 "Hard" boards also solve at Tricky.
 *
 * Clearing the board first would genuinely fix the grading — and would also
 * change **every** Tricky and Hard description, forfeiting the byte-match
 * differential that validates this generator, the whole tiered solver and the
 * codec together, plus the reproducibility of any shared game ID. A difficulty
 * curve weaker than intended is the curve upstream shipped, not a defect
 * (playbook §4 rule 3), so the object lifecycle is reproduced exactly.
 * `spokes.test.ts` pins the consequence so this cannot be tidied away silently.
 */
function spokesGenerate(
  p: SpokesParams,
  generated: SpokesBoard,
  board: SpokesBoard,
  scratch: SpokesScratch,
  temp: Int32Array,
  rng: RandomState,
): boolean {
  const { w, h } = p;
  const n = w * h;
  const diff = diffToLevel(p.diff);

  blankBoard(w, h, generated);
  const count = spokesGenerateHubs(p, generated, temp, rng);
  shufflePrefix(temp, count, rng);

  for (let j = 0; j < count; j++) {
    const i = temp[j] >> 3;
    const d = temp[j] & 7;
    const i2 = i + SPOKE_DIRS[d].dy * w + SPOKE_DIRS[d].dx;

    for (let k = 0; k < n; k++)
      board.numbers[k] = spokesCount(generated.spokes[k], SPOKE_LINE);

    // Every hub keeps at least one line.
    if (board.numbers[i] === 1 || board.numbers[i2] === 1) continue;

    blankBoard(w, h, board);
    spokesPlace(generated, i, d, SPOKE_EMPTY);

    for (let k = 0; k < n; k++)
      board.numbers[k] = spokesCount(generated.spokes[k], SPOKE_LINE);
    spokesGenerateClear(board);

    if (spokesSolve(board, scratch, diff) !== "valid") {
      spokesPlace(generated, i, d, SPOKE_LINE);
    }
  }

  for (let k = 0; k < n; k++)
    board.numbers[k] = spokesCount(generated.spokes[k], SPOKE_LINE);
  return diff === DIFF_EASY || spokesSolve(board, scratch, diff - 1) !== "valid";
}

/**
 * Generate a puzzle description: `w*h` clue digits in row-major order.
 *
 * Upstream loops unboundedly until an attempt is accepted; the bound here is
 * the house runaway guard (a faithful port converges in a handful of
 * attempts), and exhausting it throws rather than returning a fallback, so no
 * seed can quietly start producing a different board.
 */
export function newSpokesDesc(p: SpokesParams, rng: RandomState): { desc: string } {
  const { w, h } = p;
  const n = w * h;
  const board = blankBoard(w, h);
  const generated = blankBoard(w, h);
  const temp = new Int32Array(n * 3);
  const scratch = new SpokesScratch(n);

  const attempt = retryLimit(`spokes: generation (${w}x${h} ${p.diff})`);
  while (!spokesGenerate(p, generated, board, scratch, temp, rng)) attempt();

  let desc = "";
  for (let i = 0; i < n; i++) desc += String.fromCharCode(board.numbers[i] + 48);
  return { desc };
}
