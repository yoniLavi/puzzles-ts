/**
 * Seismic's generator — `new_game_desc` and its four stages from `seismic.c`.
 *
 * The pipeline, retried wholesale until every stage succeeds:
 *  1. **Fill a full solution.** Seismic shuffles the cells and drops the lowest
 *     legal number into each; Tectonic walks them in order, picks a random legal
 *     number from a per-cell shuffle, then relabels the digits by frequency.
 *  2. **Grow the regions.** Start from singletons, shuffle the border list and
 *     merge across a border whenever the two regions share no number — so a
 *     region of size `k` automatically holds `k` distinct numbers. Fail if any
 *     region ends up holding something other than exactly `1..k`.
 *  3. **Strip clues.** Shuffle the cells and remove each one whose removal
 *     leaves the puzzle still solvable at the target difficulty.
 *  4. **Grade.** Accept only when the result solves at `diff` and *not* one
 *     tier easier.
 *
 * Because stages 3 and 4 gate on the solver's verdict, the published clue set —
 * and so the description — is decided by the solver's exact deductive power, and
 * a byte-match differential against the C validates generator, solver and codec
 * in one assertion (playbook §4.4).
 *
 * **Known scaling limit, upstream's own (`docs/seismic.md`):** "has a near-zero
 * chance of generating sizes higher than 7x7. The generator step that creates
 * randomly filled regions needs to be completely replaced." That is the game
 * upstream shipped and its presets stop at 7×7; stage 2's blind merge is what
 * fails, and rewriting it would change every board. Ported faithfully, with the
 * retry loop bounded so an unreachable size fails loudly instead of spinning the
 * worker for ever (playbook §4.6).
 */

import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { placeNumber, SOLVE_FAILED, solveGame } from "./solver.ts";
import {
  ALL_MARKS,
  areaBits,
  blankBoard,
  borderCount,
  encodeDesc,
  MODE_TECTONIC,
  numBit,
  type SeismicBoard,
  type SeismicParams,
} from "./state.ts";

/**
 * The runaway guard on the retry loop (playbook §4.6).
 *
 * It has to be enormous, because upstream's region-growing stage succeeds by
 * luck: measured over the 28 differential fixtures, the costliest legitimate
 * board (7×7 Hard, Seismic) needed **1,184,978** attempts, and 7×7 boards
 * routinely need several hundred thousand. Five million is roughly twelve times
 * the mean of that worst configuration, so a board the generator can reach will
 * not trip it, while a porting divergence still fails with a labelled error
 * rather than owning the worker for ever.
 *
 * The sizes that provably *cannot* generate never get here at all —
 * `validateParams` rejects them up front (see `MAX_CELLS`), which is what keeps
 * this bound free to be generous.
 */
const MAX_ATTEMPTS = 5_000_000;

/** Stage 1, Seismic: visit the cells in a random order and take the lowest
 * number still legal there. Fails when a cell has no legal number left. */
function genNumbers(board: SeismicBoard, rng: RandomState): boolean {
  const { w, h, marks } = board;
  const s = w * h;
  const spaces: number[] = [];
  for (let i = 0; i < s; i++) {
    marks[i] = ALL_MARKS;
    spaces.push(i);
  }

  shuffle(spaces, rng);

  for (let j = 0; j < s; j++) {
    const i = spaces[j];
    let placed = false;
    for (let n = 1; n <= 9; n++) {
      if (marks[i] & numBit(n)) {
        placeNumber(board, i % w, (i / w) | 0, n);
        placed = true;
        break;
      }
    }
    if (!placed) return false;
  }

  return true;
}

/**
 * Stage 1, Tectonic: every region is five cells, so fill sequentially with a
 * random legal digit, then **relabel** through a frequency map.
 *
 * The relabel is upstream's, reproduced as written: the map is built by
 * repeatedly taking the most frequent remaining digit (ties keeping the lower
 * digit), and then applied as `grid[i] = map[grid[i] - 1]`. Any relabelling is
 * sound — the rules only ever compare digits for equality — so this is a
 * byte-match surface, not a correctness one.
 */
function tectonicGenNumbers(board: SeismicBoard, rng: RandomState): boolean {
  const { w, h, grid, marks } = board;
  const s = w * h;
  const spaces = [1, 2, 3, 4, 5];
  const counts = [0, 0, 0, 0, 0];

  for (let i = 0; i < s; i++) marks[i] = areaBits(5);

  for (let i = 0; i < s; i++) {
    shuffle(spaces, rng);
    let placed = false;
    for (let j = 0; j < 5; j++) {
      const n = spaces[j];
      if (marks[i] & numBit(n)) {
        placeNumber(board, i % w, (i / w) | 0, n);
        counts[n - 1]++;
        placed = true;
        break;
      }
    }
    // Unreachable: cells are filled in row-major order and the regions are still
    // singletons here, so at most four already-placed neighbours (left and the
    // three above) can veto digits, leaving at least one of five. Upstream has
    // no guard and would index `map[-1]` if this ever fired.
    if (!placed) throw new Error("seismic: tectonic fill found no legal digit");
  }

  for (let j = 0; j < 5; j++) {
    let best = -1;
    let bestCount = -1;
    for (let n = 0; n < 5; n++) {
      if (counts[n] > bestCount) {
        best = n;
        bestCount = counts[n];
      }
    }
    spaces[j] = best + 1;
    counts[best] = -1;
  }

  for (let i = 0; i < s; i++) grid[i] = spaces[grid[i] - 1];

  return true;
}

/**
 * Stage 2: merge regions across randomly-ordered borders whenever the two sides
 * share no number. Fails if any resulting region does not hold exactly `1..k`
 * for its size `k` — which is what makes larger grids near-impossible (a blind
 * merge order strands regions holding, say, `{1, 3}`).
 */
function genAreas(board: SeismicBoard, rng: RandomState): boolean {
  const { w, h, grid, dsf } = board;
  const s = w * h;
  const ws = borderCount(w, h);

  const spaces: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) spaces.push(y * w + x);
  }
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) spaces.push(s + y * w + x);
  }

  /** The union of numbers held by the region rooted at each index. */
  const cells = new Int32Array(s);
  for (let i = 0; i < s; i++) cells[i] = numBit(grid[i]);

  shuffle(spaces, rng);

  for (let i = 0; i < ws; i++) {
    const i1 = spaces[i] % s;
    const i2 = spaces[i] >= s ? i1 + w : i1 + 1;

    const c1 = cells[dsf.canonify(i1)];
    const c2 = cells[dsf.canonify(i2)];

    // Two regions sharing a number cannot merge — the result would repeat it.
    if (c1 & c2) continue;

    dsf.merge(i1, i2);
    cells[dsf.canonify(i1)] |= c1 | c2;
  }

  for (let i = 0; i < s; i++) {
    if (cells[dsf.canonify(i)] !== areaBits(dsf.size(i))) return false;
  }

  return true;
}

/** Stage 3: strip each clue, in a random order, whenever the board still solves
 * at the target difficulty without it. */
function genClues(board: SeismicBoard, rng: RandomState, diff: number): void {
  const { w, h, grid } = board;
  const s = w * h;

  const spaces: number[] = [];
  for (let i = 0; i < s; i++) spaces.push(i);
  shuffle(spaces, rng);

  const kept = grid.slice();

  for (let j = 0; j < s; j++) {
    const i = spaces[j];

    grid[i] = 0;
    const status = solveGame(board, diff);
    // The solver fills the board in; put the clue set back before judging.
    grid.set(kept);

    if (status !== SOLVE_FAILED) {
      grid[i] = 0;
      kept[i] = 0;
    }
  }
}

/** Stage 4: the puzzle must solve at `diff`, and must *not* solve one tier
 * easier — otherwise it belongs in the easier band. */
function genDiff(board: SeismicBoard, diff: number): boolean {
  const scratch = scratchCopy(board);
  if (solveGame(scratch, diff) === SOLVE_FAILED) return false;

  if (diff <= 0) return true;

  const easier = scratchCopy(board);
  return solveGame(easier, diff - 1) === SOLVE_FAILED;
}

/** A board the solver may destroy: same regions (shared — the solver never
 * touches them), a private copy of everything it writes. */
function scratchCopy(board: SeismicBoard): SeismicBoard {
  return {
    w: board.w,
    h: board.h,
    mode: board.mode,
    dsf: board.dsf,
    grid: board.grid.slice(),
    flags: board.flags.slice(),
    marks: board.marks.slice(),
  };
}

function genPuzzle(board: SeismicBoard, rng: RandomState, diff: number): boolean {
  if (board.mode === MODE_TECTONIC) {
    if (!tectonicGenNumbers(board, rng)) return false;
  } else if (!genNumbers(board, rng)) {
    return false;
  }
  if (!genAreas(board, rng)) return false;
  genClues(board, rng, diff);
  return genDiff(board, diff);
}

export function newSeismicDesc(p: SeismicParams, rng: RandomState): { desc: string } {
  const board = blankBoard(p.w, p.h, p.mode);
  const attempt = retryLimit(
    `seismic: ${p.w}x${p.h} generation (upstream's generator does not scale past 7x7)`,
    MAX_ATTEMPTS,
  );

  for (;;) {
    attempt();
    board.grid.fill(0);
    board.dsf.reinit();
    if (genPuzzle(board, rng, p.diff)) break;
  }

  return { desc: encodeDesc(board) };
}
