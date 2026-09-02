/**
 * Seismic's generator.
 *
 * The pipeline, retried until every stage succeeds:
 *  1. **Partition the grid into regions** — {@link growRegions}.
 *  2. **Fill a full solution into that partition** — {@link fillRegions}.
 *  3. **Strip clues.** Shuffle the cells and remove each one whose removal
 *     leaves the puzzle still solvable at the target difficulty ({@link genClues}).
 *  4. **Grade.** Accept only when the result solves at `diff` and *not* one
 *     tier easier ({@link genDiff}).
 *
 * Stages 3 and 4 are upstream's, untouched. Because they gate on the solver's
 * verdict, the published clue set — and so the description — is decided by the
 * solver's exact deductive power.
 *
 * # Stages 1–2 replace upstream's, deliberately
 *
 * Upstream runs the first two stages **the other way round**: fill a solution
 * over singleton regions first, then grow regions by merging across randomly
 * ordered borders whenever the two sides share no number, and only at the very
 * end check that every region holds exactly `1..k` for its size `k`. That check
 * can only pass by luck, because "share no number" is far weaker than the
 * invariant the result must satisfy — merging a `{1}` region with a `{3}` region
 * is permitted and yields `{1, 3}`, which needs `{1, 2}` and can never be
 * repaired. So the algorithm walks into dead states and finds out at the end,
 * discarding the whole board. Measured success rate of that stage:
 *
 * | cells | 16   | 25    | 36      | 48        | 49        | 56 | 64 |
 * |-------|------|-------|---------|-----------|-----------|----|----|
 * | rate  | 1/22 | 1/191 | 1/4,167 | 1/66,667  | 1/200,000 | 0  | 0  |
 *
 * — so 7×7 took **9–25 seconds** and nothing above ~50 cells generated at all,
 * which is why `MAX_CELLS` used to bar 10×10, the size Hakyuu is normally played
 * at. This is upstream's own documented fault, and its author asked for exactly
 * this fix (`unreleased/docs/seismic.md`: "The generator step that creates
 * randomly filled regions needs to be completely replaced with a different
 * approach"), which makes it a docs/games/solver-and-generator.md § "Divergence and what it costs" rule 3 divergence — a real defect the
 * author identified, not a difficulty curve they chose.
 *
 * Inverting the two stages removes the failure entirely: the region sizes are
 * fixed **before** any number is placed, so a region of size `k` is asking for
 * `1..k` from the start rather than discovering at the end that it holds
 * `{1, 3}`. See `replace-seismic-region-generator`.
 *
 * # The byte-match oracle is retained, not sacrificed
 *
 * Upstream's two stages survive behind
 * {@link SeismicGenerateOptions.upstreamRegionGrower}, which **only the
 * differential test sets**. All 28 frozen fixtures still match the C
 * byte-for-byte, so the solver, the clue-stripping loop and the codec keep the
 * oracle that validates them; only the new partition-and-fill sits outside it,
 * and it carries property tests instead (docs/games/solver-and-generator.md § "Solver-gated generation").
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
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
 * The runaway guard on the retry loop for the **shipped** generator
 * (docs/games/testing.md § "Quirks are load-bearing — capped, not cleaned").
 *
 * An attempt is now cheap and almost always productive: the partition cannot
 * fail and the fill essentially never backtracks, so an attempt is discarded
 * only by the *grading* stage — a Hard request that came out solvable at Easy.
 * Measured, that costs a handful of attempts at every preset and never more than
 * low hundreds. Ten thousand leaves three orders of magnitude of headroom while
 * still turning a porting divergence into a labeled error in seconds rather
 * than a hung worker.
 */
const MAX_ATTEMPTS = 10_000;

/**
 * The runaway guard for the **oracle** path
 * ({@link SeismicGenerateOptions.upstreamRegionGrower}), which needs a wildly
 * larger bound because upstream's region-growing stage succeeds by luck:
 * measured over the 28 differential fixtures, the costliest legitimate board
 * (7×7 Hard, Seismic) needed **1,184,978** attempts. Five million is roughly
 * twelve times the mean of that worst configuration.
 *
 * This bound is reachable only from the differential test, and it is the single
 * clearest statement of why the shipped path no longer uses this algorithm.
 */
const MAX_ATTEMPTS_UPSTREAM = 5_000_000;

/**
 * **Upstream stage 1, Seismic. RETAINED DELIBERATELY — do not delete as dead
 * code.** It is unreachable in production (only `upstreamRegionGrower` reaches
 * it) and that is the point: together with {@link tectonicGenNumbers} and
 * {@link genAreas} it is the *oracle* the byte-match differential runs against.
 * Deleting the "unused" branch would silently delete the differential's ability
 * to validate the solver, the clue-stripping loop and the codec against the C.
 *
 * Visit the cells in a random order and take the lowest number still legal
 * there. Fails when a cell has no legal number left.
 */
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
 * **Upstream stage 1, Tectonic. RETAINED DELIBERATELY as differential oracle —
 * see {@link genNumbers}.**
 *
 * Fill sequentially with a random legal digit, then **relabel** through a
 * frequency map.
 *
 * The relabel is upstream's, reproduced as written: the map is built by
 * repeatedly taking the most frequent remaining digit (ties keeping the lower
 * digit), and then applied as `grid[i] = map[grid[i] - 1]`. Any relabeling is
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
    // singletons here, so at most four already-placed neighbors (left and the
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
 * **Upstream stage 2. RETAINED DELIBERATELY as differential oracle — see
 * {@link genNumbers}.** Replaced in production by
 * {@link growRegions} + {@link fillRegions}.
 *
 * Merge regions across randomly-ordered borders whenever the two sides share no
 * number. Fails if any resulting region does not hold exactly `1..k` for its
 * size `k` — which is what makes larger grids near-impossible (a blind merge
 * order strands regions holding, say, `{1, 3}`), and so the whole reason this
 * change exists.
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

// --- the constructive generator (stages 1–2, replacing upstream's) ----------

/**
 * The largest region a mode admits: Tectonic numbers run `1..5`, Seismic
 * `1..9`, and a region of size `k` must hold exactly `1..k`. Exported as the
 * single source of truth the structural property tests check against.
 */
export function maxRegionSize(mode: number): number {
  return mode === MODE_TECTONIC ? 5 : 9;
}

/**
 * The sizes {@link growRegions} aims for in Seismic mode, drawn uniformly.
 *
 * **Chosen by measurement against upstream, not invented.** Region layout is
 * emergent in the C (it falls out of random merging) and so is not readable from
 * its source — but it *is* recoverable from the 28 frozen C descriptions, whose
 * partitions decode to:
 *
 * | size | 1     | 2     | 3     | 4     | 5    | 6    |
 * |------|-------|-------|-------|-------|------|------|
 * | C    | 28.4% | 16.8% | 27.7% | 20.0% | 5.8% | 1.3% |
 *
 * — mean 2.62, and **never above 6** even though Seismic's numbers run to 9.
 * That ceiling is not arbitrary: a size-`k` region needs `k` distinct numbers,
 * and the keep-apart rule (an `n` bars the `n` cells either side on both axes)
 * makes large regions progressively harder to satisfy, so aiming higher would
 * only make the fill backtrack.
 *
 * This table aims a little larger than upstream (mean draw 3.5) because the
 * *realized* distribution comes out smaller than the draw — a region stops early
 * when it runs out of free neighbors, and the leftover pockets are small. The
 * realized mean lands at ~2.9 against upstream's 2.62, with the same shape and
 * the same size-6 ceiling. Deliberately **not** matched exactly: there is no
 * oracle for region layout (it is display-adjacent taste — docs/games/solver-and-generator.md § "Divergence and what it costs"), the C's
 * distribution is an artifact of a broken algorithm rather than a design, and
 * its 28% singletons are the least interesting cells on the board — a size-1
 * region is forced to `1`, so it is a free given.
 */
const SEISMIC_REGION_SIZES: readonly number[] = [2, 3, 3, 4, 4, 5];

/** Tectonic wants fives (upstream realizes 63.5% of them, and five-cell regions
 * are what the puzzle is called after); it still gets a tail of smaller regions
 * from pockets, exactly as upstream does. */
const TECTONIC_REGION_SIZE = 5;

/** The size to aim for next. */
function drawRegionSize(mode: number, rng: RandomState): number {
  if (mode === MODE_TECTONIC) return TECTONIC_REGION_SIZE;
  return SEISMIC_REGION_SIZES[randomUpto(rng, SEISMIC_REGION_SIZES.length)];
}

/**
 * The largest region the generator can **produce** in a mode — as distinct from
 * {@link maxRegionSize}, the largest the *format* admits. The two differ in
 * Seismic mode (5 against 9), and the difference is player-visible: entry is
 * capped at the pressed cell's region size, so a digit above this bound is
 * inert on every board the app can make. `requestKeys` sizes the on-screen
 * keypad from here for exactly that reason.
 *
 * Derived from the distribution rather than written as a number, because
 * {@link growRegions} caps every region at `drawRegionSize`'s result — no larger
 * region is constructible, and a pocket is simply the next draw — so this
 * cannot disagree with the array it reads. Widen the distribution and the
 * keypad widens with it. (An earlier inline literal in `requestKeys` copied the
 * format bound instead, and went stale the day the distribution moved.)
 */
export function maxGeneratedRegionSize(mode: number): number {
  return mode === MODE_TECTONIC
    ? TECTONIC_REGION_SIZE
    : Math.max(...SEISMIC_REGION_SIZES);
}

/**
 * **Stage 1 (new): partition the grid into connected regions**, sizes drawn from
 * {@link drawRegionSize}, writing the partition into `board.dsf`.
 *
 * This always succeeds — no number constraints are in play yet, and every pocket
 * it could strand is itself a legal region (any size from 1 up to the mode's
 * maximum is legal, and a pocket larger than the maximum is simply partitioned
 * by a later pass of the same loop). That is the whole reason the pipeline is
 * inverted: upstream's stage 2 could fail, this cannot.
 *
 * Two heuristics keep the shapes reasonable:
 *  - **Seed at the most constrained free cell** (fewest free neighbors, ties
 *    broken randomly). Consuming awkward cells — corners, and the necks left
 *    behind by earlier regions — before they are surrounded is what keeps the
 *    board from filling up with stranded singletons.
 *  - **Grow into a uniformly random frontier cell**, which gives organic blobs
 *    rather than the rigid combs a min-degree growth rule produces.
 *
 * A region that runs out of frontier before reaching its target simply ends
 * short; that is legal, and it is where the small tail of the realized size
 * distribution comes from.
 */
export function growRegions(board: SeismicBoard, rng: RandomState): void {
  const { w, h, dsf } = board;
  const s = w * h;
  dsf.reinit();

  /** Cells not yet claimed by a region. */
  const free = new Uint8Array(s).fill(1);
  let remaining = s;

  const nb: number[] = [];
  const neighbors = (i: number): number[] => {
    nb.length = 0;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) nb.push(i - 1);
    if (x < w - 1) nb.push(i + 1);
    if (y > 0) nb.push(i - w);
    if (y < h - 1) nb.push(i + w);
    return nb;
  };
  const freeDegree = (i: number): number => {
    let n = 0;
    for (const j of neighbors(i)) if (free[j]) n++;
    return n;
  };

  const frontier: number[] = [];

  while (remaining > 0) {
    // Seed: fewest free neighbors, ties broken by reservoir sampling so the
    // choice is uniform among equally-constrained cells.
    let seed = -1;
    let bestDegree = 5;
    let ties = 0;
    for (let i = 0; i < s; i++) {
      if (!free[i]) continue;
      const d = freeDegree(i);
      if (d < bestDegree) {
        bestDegree = d;
        seed = i;
        ties = 1;
      } else if (d === bestDegree) {
        ties++;
        if (randomUpto(rng, ties) === 0) seed = i;
      }
    }

    const target = Math.min(drawRegionSize(board.mode, rng), remaining);
    let size = 1;
    free[seed] = 0;
    remaining--;
    frontier.length = 0;
    for (const j of neighbors(seed)) if (free[j]) frontier.push(j);

    while (size < target && frontier.length > 0) {
      // Swap-remove a uniformly random frontier entry. Entries can be stale
      // (claimed by this same region via another neighbor) or duplicated;
      // both are filtered here rather than kept unique, which would cost a set
      // lookup per push for no behavioral difference.
      const k = randomUpto(rng, frontier.length);
      const cell = frontier[k];
      frontier[k] = frontier[frontier.length - 1];
      frontier.pop();
      if (!free[cell]) continue;

      free[cell] = 0;
      remaining--;
      dsf.merge(seed, cell);
      size++;
      for (const j of neighbors(cell)) if (free[j]) frontier.push(j);
    }
  }
}

/**
 * How many cell placements {@link fillRegions} may try before giving up and
 * asking for a fresh partition.
 *
 * The fill is a most-constrained-first search with backtracking, so a *typical*
 * board is solved in about one placement per cell — measured, the mean is under
 * 1.05 nodes per cell across every preset. The budget is therefore enormous
 * relative to the work: it is a runaway guard for a pathological partition, not
 * a tuning knob. Exhausting it costs one re-partition, which is cheap and
 * bounded by the caller's own {@link MAX_ATTEMPTS}.
 */
const FILL_NODE_BUDGET = 200_000;

/**
 * **Stage 2 (new): fill the partition with a complete, legal solution.**
 *
 * Reuses the solver's own {@link placeNumber} as the propagator rather than
 * writing a second one — place `n`, and it strikes `n` from the cells the mode's
 * keep-apart rule forbids it in and from the rest of that cell's region. So the
 * rules this enforces are, by construction, the ones the solver judges by.
 *
 * The search is most-constrained-cell-first with candidates tried in random
 * order and chronological backtracking. Because every cell's candidate set
 * starts as `areaBits(regionSize)` and same-region cells strike each other's
 * choices, a completed fill gives every size-`k` region exactly `1..k` and
 * satisfies the keep-apart rule — it is valid by construction, with no post-hoc
 * check needed (the property tests assert this independently rather than trust
 * it).
 *
 * Returns false if the budget runs out, which means "re-partition", not "this
 * board is impossible".
 */
export function fillRegions(board: SeismicBoard, rng: RandomState): boolean {
  const { w, h, grid, marks, dsf } = board;
  const s = w * h;

  grid.fill(0);
  for (let i = 0; i < s; i++) marks[i] = areaBits(dsf.size(i));

  let budget = FILL_NODE_BUDGET;
  const areas = new Int32Array(s);

  /**
   * Can every region still house every number it owes?
   *
   * This is **the solver's own Hard-rung feasibility test** (`solverAttempt`'s
   * inner check), reused as the search's pruning rule. Forward-checking alone —
   * which is all {@link placeNumber} does — is far too weak here: Seismic's
   * keep-apart rule bars an `n` from the `n` cells either side on *both* axes,
   * so a placement can starve a distant region of its last home for some number
   * without touching any cell the placement itself looks at. Without this test
   * the search only discovers such a dead end many levels deeper, and 10×10
   * boards thrash to exhaustion; with it they fill essentially first try.
   */
  const regionsViable = (): boolean => {
    areas.fill(0);
    for (let j = 0; j < s; j++) areas[dsf.canonify(j)] |= marks[j];
    for (let j = 0; j < s; j++) {
      if (j !== dsf.canonify(j)) continue;
      // Candidate sets only ever shrink from `areaBits(size)`, so anything
      // other than equality means some number has lost every home.
      if (areas[j] !== areaBits(dsf.size(j))) return false;
    }
    return true;
  };

  const step = (): boolean => {
    let target = -1;
    let bestCount = 10;
    for (let i = 0; i < s; i++) {
      if (grid[i] !== 0) continue;
      let count = 0;
      for (let n = 1; n <= 9; n++) if (marks[i] & numBit(n)) count++;
      // A cell with nothing left: this branch is dead, backtrack immediately.
      if (count === 0) return false;
      if (count < bestCount) {
        bestCount = count;
        target = i;
        // Nothing beats a forced cell, so stop looking.
        if (count === 1) break;
      }
    }
    // No empty cell left: the board is full, and full means valid here.
    if (target < 0) return true;

    const candidates: number[] = [];
    for (let n = 1; n <= 9; n++) if (marks[target] & numBit(n)) candidates.push(n);
    shuffle(candidates, rng);

    const gridSave = grid.slice();
    const marksSave = marks.slice();
    for (const n of candidates) {
      if (budget-- <= 0) return false;
      placeNumber(board, target % w, (target / w) | 0, n);
      if (regionsViable() && step()) return true;
      grid.set(gridSave);
      marks.set(marksSave);
    }
    return false;
  };

  return step();
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

export interface SeismicGenerateOptions {
  /**
   * Build the regions with **upstream's** fill-then-merge stages
   * ({@link genNumbers} / {@link tectonicGenNumbers} / {@link genAreas}) instead
   * of {@link growRegions} + {@link fillRegions}.
   *
   * **Only `seismic-differential.test.ts` sets this**, and it must stay that
   * way: it is what keeps all 28 frozen fixtures matching the C byte-for-byte,
   * and with them the oracle over the solver, the clue-stripping loop and the
   * codec. It is *not* a fallback, a preference, or a thing to expose in the UI
   * — it reinstates the 9–25 s 7×7 generation this change exists to remove.
   *
   * `seismic.test.ts` asserts that this flag still *changes* the description, so
   * the oracle cannot silently decay into re-testing the shipped path.
   */
  upstreamRegionGrower?: boolean;
}

function genPuzzle(
  board: SeismicBoard,
  rng: RandomState,
  diff: number,
  upstreamRegionGrower: boolean,
): boolean {
  if (upstreamRegionGrower) {
    if (board.mode === MODE_TECTONIC) {
      if (!tectonicGenNumbers(board, rng)) return false;
    } else if (!genNumbers(board, rng)) {
      return false;
    }
    if (!genAreas(board, rng)) return false;
  } else {
    growRegions(board, rng);
    // A budget-exhausted fill means "this partition was awkward"; returning
    // false sends the caller round for a fresh one.
    if (!fillRegions(board, rng)) return false;
  }
  genClues(board, rng, diff);
  return genDiff(board, diff);
}

export function newSeismicDesc(
  p: SeismicParams,
  rng: RandomState,
  options: SeismicGenerateOptions = {},
): { desc: string } {
  const upstreamRegionGrower = options.upstreamRegionGrower ?? false;
  const board = blankBoard(p.w, p.h, p.mode);
  const attempt = retryLimit(
    `seismic: ${p.w}x${p.h} generation`,
    upstreamRegionGrower ? MAX_ATTEMPTS_UPSTREAM : MAX_ATTEMPTS,
  );

  for (;;) {
    attempt();
    board.grid.fill(0);
    board.dsf.reinit();
    if (genPuzzle(board, rng, p.diff, upstreamRegionGrower)) break;
  }

  return { desc: encodeDesc(board) };
}
