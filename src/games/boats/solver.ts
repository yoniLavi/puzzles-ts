/**
 * Boats — the four-tier deductive solver (upstream's "Solver" block).
 *
 * `solveBoats(board, maxDiff)` runs a fixpoint loop of named techniques, each
 * gated by a difficulty threshold, and reports the **highest tier the deduction
 * actually needed**. It never guesses and never backtracks: there is no
 * board-wide trial, no recursion, no dup-and-try. The Hard tier's "attempt"
 * techniques try a *single* cell and keep the result only when the trial is
 * immediately contradictory, which is a deduction (a refutation), not a guess.
 *
 * So **Boats satisfies the guess-free-generation policy at every named
 * difficulty** — Easy/Normal/Tricky/Hard are progressively harder *deduction*
 * and there is no "Unreasonable" guessing tier to exempt. Don't add a knob.
 *
 * **The loop is ported directly rather than onto the shared
 * `runDeductionFixpoint`** (playbook §4, "check what a shared runner's
 * bookkeeping actually decides"). Three pieces of this loop's bookkeeping feed
 * back into which puzzles exist, and none of them fits the shared runner:
 *
 *  - `hasCenters` / `hasNoClue` are *latching* optimisation flags. Once
 *    `centersTrivial` reports every centre clue satisfied, the three
 *    centre techniques are never tried again for the rest of the solve.
 *  - `diff` is a running maximum that a technique *reads*: the cheap
 *    `findMaxFleet(simple)` runs only while `diff < DIFF_TRICKY`, so it
 *    switches itself off once the solve has needed a Tricky technique once.
 *  - the Tricky tier writes missing border numbers *into the board* and the
 *    solver restores them on exit.
 *
 * The shared runner restarts from rung 0 on any firing and grades by "highest
 * rung that fired"; here the grade is "deepest tier the loop had to reach",
 * which is a different number. Since the generator is solver-gated, adopting
 * the shared loop would silently change every board.
 */

import { Dsf } from "../../engine/dsf.ts";
import {
  type BoatsBoard,
  type BoatsParams,
  type BoatsState,
  CORRUPT,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_NORMAL,
  DIFF_TRICKY,
  DIFFCOUNT,
  EMPTY,
  isShip,
  NO_CLUE,
  SHIP_BOTTOM,
  SHIP_CENTER,
  SHIP_LEFT,
  SHIP_RIGHT,
  SHIP_SINGLE,
  SHIP_TOP,
  SHIP_VAGUE,
  STATUS_INCOMPLETE,
  STATUS_INVALID,
  WATER,
} from "./state.ts";
import {
  type BoatsRun,
  collectRuns,
  neighbours,
  validateFullState,
  validateState,
} from "./validate.ts";

/**
 * What a solve attempt concluded. Upstream returns the reached difficulty, or
 * the magic `-1` (stuck) / `-2` (contradiction); this discriminates them so a
 * caller cannot compare a difficulty against a sentinel by accident.
 */
export type BoatsSolveResult =
  | { kind: "solved"; diff: number }
  /** Ran out of deductions with the board unfinished — upstream's `-1`. */
  | { kind: "stuck" }
  /** The board contradicts itself — upstream's `-2`. */
  | { kind: "invalid" };

// --- primitive placements --------------------------------------------------

/**
 * Upstream `boats_solver_place_water`. Returns how many squares changed (0 if
 * out of bounds or already water). Writing over a ship yields `CORRUPT`, which
 * is how the solver signals a contradiction to the validator.
 */
export function placeWater(b: BoatsBoard, x: number, y: number): number {
  const { w, h, grid } = b;
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  const i = y * w + x;
  if (isShip(grid[i])) {
    grid[i] = CORRUPT;
    return 1;
  }
  if (grid[i] === EMPTY) {
    grid[i] = WATER;
    return 1;
  }
  return 0;
}

/**
 * Upstream `boats_solver_place_ship`: place a ship and, since boats never touch
 * diagonally, water on all four diagonal neighbours.
 *
 * **Divergence (deliberate, and free):** upstream `assert`s that the square is
 * in bounds where this port returns 0. A release build compiles that assert
 * out and then indexes out of bounds, so the C has no defined behaviour there
 * — playbook §4 rule 1, "divergence is free where C has no defined behaviour".
 * It is not reachable from a generated board (`centersTrivial` is the only
 * caller that could pass an off-board square, and only for a centre clue on an
 * edge row whose boat cannot be perpendicular), but a hand-written game ID can
 * reach it, and a silent out-of-bounds read is the worse answer.
 */
export function placeShip(b: BoatsBoard, x: number, y: number): number {
  const { w, h, grid } = b;
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  const i = y * w + x;
  if (grid[i] === WATER) {
    grid[i] = CORRUPT;
    return 1;
  }
  if (grid[i] === EMPTY) {
    grid[i] = SHIP_VAGUE;
    let ret = 1;
    ret += placeWater(b, x - 1, y - 1);
    ret += placeWater(b, x + 1, y - 1);
    ret += placeWater(b, x - 1, y + 1);
    ret += placeWater(b, x + 1, y + 1);
    return ret;
  }
  return 0;
}

/** Upstream `boats_solver_fill_row`: fill an axis-aligned block. */
export function fillRow(
  b: BoatsBoard,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  fill: number,
): number {
  let ret = 0;
  for (let x = sx; x <= ex; x++) {
    for (let y = sy; y <= ey; y++) {
      if (b.grid[y * b.w + x] !== EMPTY) continue;
      if (isShip(fill)) ret += placeShip(b, x, y);
      else if (fill === WATER) ret += placeWater(b, x, y);
    }
  }
  return ret;
}

// --- Easy tier -------------------------------------------------------------

/**
 * Upstream `boats_solver_initial`: clear the board and re-derive it from the
 * given clues alone. An end-cap clue also forces the neighbour it points at
 * and the water behind it; a single is surrounded by water.
 */
function solverInitial(b: BoatsBoard): number {
  const { w, h, gridClues } = b;
  b.grid.fill(EMPTY);
  let ret = 0;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      switch (gridClues[y * w + x]) {
        case WATER:
          ret += placeWater(b, x, y);
          break;
        case SHIP_VAGUE:
        case SHIP_CENTER:
          ret += placeShip(b, x, y);
          break;
        case SHIP_TOP:
          ret += placeShip(b, x, y);
          ret += placeShip(b, x, y + 1);
          ret += placeWater(b, x, y - 1);
          break;
        case SHIP_BOTTOM:
          ret += placeShip(b, x, y);
          ret += placeShip(b, x, y - 1);
          ret += placeWater(b, x, y + 1);
          break;
        case SHIP_LEFT:
          ret += placeShip(b, x, y);
          ret += placeShip(b, x + 1, y);
          ret += placeWater(b, x - 1, y);
          break;
        case SHIP_RIGHT:
          ret += placeShip(b, x, y);
          ret += placeShip(b, x - 1, y);
          ret += placeWater(b, x + 1, y);
          break;
        case SHIP_SINGLE:
          ret += placeShip(b, x, y);
          ret += placeWater(b, x + 1, y);
          ret += placeWater(b, x - 1, y);
          ret += placeWater(b, x, y + 1);
          ret += placeWater(b, x, y - 1);
          break;
      }
    }
  }

  return ret;
}

/**
 * Upstream `boats_solver_check_fill`: if the water already on the board plus
 * the fleet's own squares account for the whole grid, every remaining square
 * is a ship.
 */
function checkFill(b: BoatsBoard, blankCounts: Int32Array): number {
  const { w, h } = b;
  let count = 0;
  for (let i = 0; i < b.fleet; i++) count += b.fleetData[i] * (i + 1);
  for (let i = 0; i < w; i++) count += blankCounts[i];

  if (count !== w * h) return 0;

  let ret = 0;
  for (let i = 0; i < w * h; i++)
    if (b.grid[i] === EMPTY) ret += placeShip(b, i % w, Math.floor(i / w));
  return ret;
}

/**
 * Upstream `boats_solver_check_counts`: a line whose ships already meet its
 * number is finished with water; a line whose water already meets its
 * complement is finished with ships.
 */
function checkCounts(
  b: BoatsBoard,
  blankCounts: Int32Array,
  shipCounts: Int32Array,
): number {
  const { w, h, borderClues } = b;
  let ret = 0;

  for (let i = 0; i < w; i++) {
    if (borderClues[i] === NO_CLUE) continue;
    if (shipCounts[i] === borderClues[i] && blankCounts[i] !== h - borderClues[i])
      ret += fillRow(b, i, 0, i, h - 1, WATER);
    else if (shipCounts[i] !== borderClues[i] && blankCounts[i] === h - borderClues[i])
      ret += fillRow(b, i, 0, i, h - 1, SHIP_VAGUE);
  }
  for (let i = 0; i < h; i++) {
    const c = borderClues[i + w];
    if (c === NO_CLUE) continue;
    if (shipCounts[i + w] === c && blankCounts[i + w] !== w - c)
      ret += fillRow(b, 0, i, w - 1, i, WATER);
    else if (shipCounts[i + w] !== c && blankCounts[i + w] === w - c)
      ret += fillRow(b, 0, i, w - 1, i, SHIP_VAGUE);
  }

  return ret;
}

/**
 * Upstream `boats_solver_remove_singles`: once every size-1 boat is placed, an
 * isolated empty square can hold no boat at all (it would be another single),
 * and an isolated *ship* square must extend into its one free neighbour.
 */
function removeSingles(b: BoatsBoard, fleetCount: Int32Array): number {
  const { w, h, grid } = b;
  if (fleetCount[0] !== b.fleetData[0]) return 0;

  let ret = 0;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (grid[y * w + x] === WATER) continue;
      const { left, right, up, down } = neighbours(b, x, y);

      if (
        left === WATER &&
        right === WATER &&
        up === WATER &&
        down === WATER &&
        grid[y * w + x] === EMPTY
      )
        ret += placeWater(b, x, y);

      if (grid[y * w + x] !== SHIP_VAGUE) continue;

      if (left === WATER && right === WATER && up === WATER && down === EMPTY)
        ret += placeShip(b, x, y + 1);
      else if (left === WATER && right === WATER && down === WATER && up === EMPTY)
        ret += placeShip(b, x, y - 1);
      else if (down === WATER && right === WATER && up === WATER && left === EMPTY)
        ret += placeShip(b, x - 1, y);
      else if (down === WATER && left === WATER && up === WATER && right === EMPTY)
        ret += placeShip(b, x + 1, y);
    }
  }
  return ret;
}

/**
 * Upstream `boats_solver_centers_trivial`: a centre clue with water on one side
 * of an axis must run along the other axis. Also latches `hasCenters` off once
 * every centre clue is satisfied, so the solver stops trying centre techniques.
 */
function centersTrivial(b: BoatsBoard): { ret: number; hasCenters: boolean } {
  const { w, h, gridClues } = b;
  let ret = 0;
  let hasCenters = false;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (gridClues[y * w + x] !== SHIP_CENTER) continue;
      const { left, right, up, down } = neighbours(b, x, y);
      if ((isShip(left) && isShip(right)) || (isShip(up) && isShip(down))) continue;

      hasCenters = true;

      if (left === WATER || right === WATER) {
        ret += placeShip(b, x, y - 1);
        ret += placeShip(b, x, y + 1);
      } else if (up === WATER || down === WATER) {
        ret += placeShip(b, x - 1, y);
        ret += placeShip(b, x + 1, y);
      }
    }
  }

  return { ret, hasCenters };
}

// --- Normal tier -----------------------------------------------------------

/**
 * Upstream `boats_solver_centers_normal`: a centre clue needs two more ships in
 * whichever line its boat runs along, so a line that cannot take two more
 * rules that direction out.
 */
function centersNormal(b: BoatsBoard, shipCounts: Int32Array): number {
  const { w, h, gridClues, borderClues } = b;
  let ret = 0;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (gridClues[y * w + x] !== SHIP_CENTER) continue;
      const { left, right, up, down } = neighbours(b, x, y);
      if ((isShip(left) && isShip(right)) || (isShip(up) && isShip(down))) continue;

      if (borderClues[y + w] !== NO_CLUE && borderClues[y + w] - shipCounts[y + w] < 2)
        ret += placeWater(b, x + 1, y);
      if (borderClues[x] !== NO_CLUE && borderClues[x] - shipCounts[x] < 2)
        ret += placeWater(b, x, y + 1);
    }
  }

  return ret;
}

/**
 * Upstream `boats_solver_min_expand_dsf_forward`: an unfinished boat whose
 * *first* square carries an end cap pointing right/down must grow that way,
 * once every boat of its current length is already accounted for. At most one
 * placement per call — adding a ship invalidates the dsf.
 */
function minExpandForward(
  b: BoatsBoard,
  fleetCount: Int32Array,
  dsf: Dsf,
  sx: number,
  sy: number,
  d: number,
  ship: number,
): number {
  const { w, h, grid } = b;
  const end = dsf.canonify(w * h);

  for (let y = sy; y < h; y++) {
    for (let x = sx; x < w; x++) {
      const i1 = y * w + x;
      const i2 = i1 - d;
      if (grid[i1] !== EMPTY || dsf.canonify(i2) === end) continue;
      // Reads the canonical root as an *element* — see `checkDsf`.
      if (grid[dsf.canonify(i2)] !== ship) continue;

      const s = dsf.size(i2) - 1;
      if (s < 1 || s >= b.fleet || b.fleetData[s] !== fleetCount[s]) continue;

      return placeShip(b, x, y);
    }
  }
  return 0;
}

/**
 * Upstream `boats_solver_min_expand_dsf_back`: the mirror case — an end cap
 * pointing left/up means the boat can only grow the other way, and the square
 * to grow into is derived from the canonical (first) square of the run.
 */
function minExpandBack(
  b: BoatsBoard,
  fleetCount: Int32Array,
  dsf: Dsf,
  d: number,
  ship: number,
): number {
  const { w, h, grid } = b;
  const end = dsf.canonify(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i1 = y * w + x;
      if (grid[i1] !== ship) continue;
      const c1 = dsf.canonify(i1);
      if (c1 === end) continue;

      const s = dsf.size(i1) - 1;
      if (s < 1 || s >= b.fleet || b.fleetData[s] !== fleetCount[s]) continue;

      const i2 = c1 - d;
      return placeShip(b, i2 % w, Math.floor(i2 / w));
    }
  }
  return 0;
}

/** Upstream `boats_solver_min_expand_dsf`: try each of the four directions. */
function minExpandDsf(b: BoatsBoard, fleetCount: Int32Array, dsf: Dsf): number {
  const { w } = b;
  if (minExpandForward(b, fleetCount, dsf, 0, 1, w, SHIP_TOP)) return 1;
  if (minExpandForward(b, fleetCount, dsf, 1, 0, 1, SHIP_LEFT)) return 1;
  if (minExpandBack(b, fleetCount, dsf, w, SHIP_BOTTOM)) return 1;
  if (minExpandBack(b, fleetCount, dsf, 1, SHIP_RIGHT)) return 1;
  return 0;
}

/**
 * Upstream `boats_solver_max_expand_dsf`: an empty square that would join its
 * neighbouring runs into a boat longer than any the fleet still owes must be
 * water.
 */
function maxExpandDsf(b: BoatsBoard, fleetCount: Int32Array, dsf: Dsf): number {
  const { w, h, grid } = b;
  let max = -1;
  for (let i = 0; i < b.fleet; i++) if (b.fleetData[i] - fleetCount[i] !== 0) max = i;

  let ret = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] !== EMPTY) continue;

      let count = 1;
      if (x > 0 && grid[y * w + x - 1] === SHIP_VAGUE) count += dsf.size(y * w + x - 1);
      if (x < w - 1 && grid[y * w + x + 1] === SHIP_VAGUE)
        count += dsf.size(y * w + x + 1);
      if (y > 0 && grid[(y - 1) * w + x] === SHIP_VAGUE)
        count += dsf.size((y - 1) * w + x);
      if (y < h - 1 && grid[(y + 1) * w + x] === SHIP_VAGUE)
        count += dsf.size((y + 1) * w + x);

      if (count > max + 1) ret += placeWater(b, x, y);
    }
  }
  return ret;
}

/**
 * Upstream `boats_solver_find_max_fleet`: if the runs that can still take the
 * largest outstanding boat are exactly as many as there are such boats to
 * place, every one of them is used — so the squares every placement in a run
 * has in common are ships.
 *
 * With `simple` (the Normal tier) only runs that fit the boat *exactly* are
 * confirmed, and the technique gives up when more than one boat is outstanding.
 */
function findMaxFleet(
  b: BoatsBoard,
  shipCounts: Int32Array,
  fleetCount: Int32Array,
  runs: BoatsRun[],
  simple: boolean,
): number {
  const { w, borderClues } = b;
  let max = -1;
  for (let i = 0; i < b.fleet; i++) if (b.fleetData[i] - fleetCount[i] !== 0) max = i;
  if (max === -1) return 0;

  let bc = b.fleetData[max] - fleetCount[max];
  // Unreachable from a non-contradictory board (an over-placed size makes
  // `checkFleet` report INVALID and the solve loop exits first), but upstream
  // would `snewn` a negative length here, so refuse rather than follow it.
  if (bc < 1) return 0;
  if (simple && bc > 1) return 0;

  const idx: number[] = [];
  let r = 0;

  for (let i = 0; i < runs.length; i++) {
    if (runs[i].ships === runs[i].len) continue; // already full
    if (runs[i].len < max + 1) continue; // too small

    const j = runs[i].row + (runs[i].horizontal ? w : 0);
    if (
      borderClues[j] !== NO_CLUE &&
      borderClues[j] - (shipCounts[j] - runs[i].ships) < max + 1
    )
      continue; // the line's number cannot take the boat

    // A run with room for two of them tells us nothing.
    if (runs[i].len >= (max + 1) * 2 + 1) bc = -1;

    if (r < bc) idx.push(i);
    r++;
  }

  if (r !== bc) return 0;

  let ret = 0;
  for (let i = 0; i < r; i++) {
    const run = runs[idx[i]];
    // On lower difficulties, only runs that fit a boat exactly.
    if (simple && run.len > max + 1) continue;

    const start = run.start + run.len - (max + 1);
    const end = run.start + (max + 1);

    if (end - start === 1) {
      // Only one square is common to every placement — and its perpendicular
      // neighbours are then water, because the boat runs along this line.
      if (run.horizontal) {
        ret += placeShip(b, start, run.row);
        ret += placeWater(b, start, run.row - 1);
        ret += placeWater(b, start, run.row + 1);
      } else {
        ret += placeShip(b, run.row, start);
        ret += placeWater(b, run.row - 1, start);
        ret += placeWater(b, run.row + 1, start);
      }
    } else if (end - start > 1) {
      if (run.horizontal)
        ret += fillRow(b, start, run.row, end - 1, run.row, SHIP_VAGUE);
      else ret += fillRow(b, run.row, start, run.row, end - 1, SHIP_VAGUE);
    }
  }

  return ret;
}

/**
 * Upstream `boats_solver_split_runs`: a run with exactly one free square would
 * become a boat of the run's length if filled — so when every boat of that
 * length is already placed, the free square is water.
 */
function splitRuns(b: BoatsBoard, fleetCount: Int32Array, runs: BoatsRun[]): number {
  let ret = 0;
  for (const run of runs) {
    const len = run.len;
    if (len < 2 || len > b.fleet) continue;
    if (len - run.ships !== 1) continue;
    if (b.fleetData[len - 1] !== fleetCount[len - 1]) continue;

    if (run.horizontal)
      ret += fillRow(b, run.start, run.row, run.start + len - 1, run.row, WATER);
    else ret += fillRow(b, run.row, run.start, run.row, run.start + len - 1, WATER);
  }
  return ret;
}

// --- Tricky tier -----------------------------------------------------------

/**
 * Upstream `boats_solver_shared_diagonals`: in a line that needs only one or
 * two more water squares, look at three consecutive positions. If more of them
 * could be ships than the line has room to *not* be, at least one of the outer
 * pair is a ship — and either way the two squares diagonally between them
 * (directly above and below the middle) must be water.
 */
function sharedDiagonals(
  b: BoatsBoard,
  waterCounts: Int32Array,
  shipCounts: Int32Array,
): number {
  const { w, h, grid, borderClues } = b;
  let ret = 0;

  for (let y = 0; y < h; y++) {
    if (borderClues[y + w] === NO_CLUE) continue;
    const target = w - (borderClues[y + w] + waterCounts[y + w]);
    if (target !== 1 && target !== 2) continue;

    for (let x = 0; x < w; x++) {
      const front = x > 0 && grid[y * w + (x - 1)] === EMPTY ? 1 : 0;
      const center =
        grid[y * w + x] === EMPTY && borderClues[x] - shipCounts[x] === 1 ? 1 : 0;
      const back = x < w - 1 && grid[y * w + (x + 1)] === EMPTY ? 1 : 0;

      if (front + center + back > target) {
        ret += placeWater(b, x, y - 1);
        ret += placeWater(b, x, y + 1);
      }
    }
  }

  for (let x = 0; x < w; x++) {
    if (borderClues[x] === NO_CLUE) continue;
    const target = h - (borderClues[x] + waterCounts[x]);
    if (target !== 1 && target !== 2) continue;

    for (let y = 0; y < h; y++) {
      const front = y > 0 && grid[(y - 1) * w + x] === EMPTY ? 1 : 0;
      const center =
        grid[y * w + x] === EMPTY && borderClues[y + w] - shipCounts[y + w] === 1
          ? 1
          : 0;
      const back = y < h - 1 && grid[(y + 1) * w + x] === EMPTY ? 1 : 0;

      if (front + center + back > target) {
        ret += placeWater(b, x - 1, y);
        ret += placeWater(b, x + 1, y);
      }
    }
  }

  return ret;
}

/**
 * Upstream `boats_solver_borderclues_fill`: a line that is completely decided
 * reveals its own hidden number. Returns whether *any* line still lacks one —
 * the latch that turns the whole missing-number machinery off.
 */
function borderCluesFill(
  b: BoatsBoard,
  blankCounts: Int32Array,
  shipCounts: Int32Array,
): boolean {
  const { w, h, borderClues } = b;
  let found = false;

  for (let i = 0; i < w; i++) {
    if (borderClues[i] !== NO_CLUE) continue;
    found = true;
    if (shipCounts[i] + blankCounts[i] === h) borderClues[i] = shipCounts[i];
  }
  for (let i = 0; i < h; i++) {
    if (borderClues[i + w] !== NO_CLUE) continue;
    found = true;
    if (shipCounts[i + w] + blankCounts[i + w] === w)
      borderClues[i + w] = shipCounts[i + w];
  }

  return found;
}

/**
 * Upstream `boats_solver_borderclues_last`: the fleet's total ship count is
 * known, so if exactly one column (or row) number is hidden it is the
 * remainder. Also used by the generator to refuse a puzzle that hides only one
 * number, since that is no puzzle at all.
 */
export function borderCluesLast(b: BoatsBoard): number {
  const { w, h, borderClues } = b;
  let maxShips = 0;
  for (let i = 0; i < b.fleet; i++) maxShips += b.fleetData[i] * (i + 1);
  let ret = 0;

  let found = -1;
  let shipCount = 0;
  for (let i = 0; i < w; i++) {
    if (borderClues[i] !== NO_CLUE) {
      shipCount += borderClues[i];
      continue;
    }
    found = found === -1 ? i : -2;
  }
  if (found >= 0) {
    borderClues[found] = maxShips - shipCount;
    ret++;
  }

  found = -1;
  shipCount = 0;
  for (let i = 0; i < h; i++) {
    if (borderClues[i + w] !== NO_CLUE) {
      shipCount += borderClues[i + w];
      continue;
    }
    found = found === -1 ? i : -2;
  }
  if (found >= 0) {
    borderClues[found + w] = maxShips - shipCount;
    ret++;
  }

  return ret;
}

// --- Hard tier: single-square refutation -----------------------------------

/**
 * Upstream `boats_solver_attempt_ship_rows`: in a line needing exactly one more
 * water square, try that square as the water. If completing the line then
 * *immediately* contradicts the board, the square is a ship instead.
 *
 * This is refutation, not guessing: nothing is kept unless its negation is
 * provably impossible, and `validateState` looks only one step ahead.
 */
function attemptShipRows(
  b: BoatsBoard,
  tmpGrid: Int8Array,
  waterCounts: Int32Array,
): number {
  const { w, h, grid, borderClues } = b;
  let ret = 0;
  tmpGrid.set(grid);

  const lineNeedsOneWater = (line: number, span: number): boolean =>
    borderClues[line] !== NO_CLUE &&
    span - (borderClues[line] + waterCounts[line]) === 1;

  for (let y = 0; y < h; y++) {
    if (!lineNeedsOneWater(y + w, w)) continue;
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] !== EMPTY) continue;

      placeWater(b, x, y);
      fillRow(b, 0, y, w - 1, y, SHIP_VAGUE);
      // Also fill the column when this square sits at an intersection.
      if (lineNeedsOneWater(x, h)) fillRow(b, x, 0, x, h - 1, SHIP_VAGUE);

      if (validateState(b) === STATUS_INVALID) {
        grid.set(tmpGrid);
        ret += placeShip(b, x, y);
        tmpGrid.set(grid);
      } else {
        grid.set(tmpGrid);
      }
    }
  }

  for (let x = 0; x < w; x++) {
    if (!lineNeedsOneWater(x, h)) continue;
    for (let y = 0; y < h; y++) {
      if (lineNeedsOneWater(y + w, w)) continue; // already tried above
      if (grid[y * w + x] !== EMPTY) continue;

      placeWater(b, x, y);
      fillRow(b, x, 0, x, h - 1, SHIP_VAGUE);

      if (validateState(b) === STATUS_INVALID) {
        grid.set(tmpGrid);
        ret += placeShip(b, x, y);
        tmpGrid.set(grid);
      } else {
        grid.set(tmpGrid);
      }
    }
  }

  grid.set(tmpGrid);
  return ret;
}

/**
 * Upstream `boats_solver_attempt_water_rows`: the mirror — in a line needing
 * exactly one more ship, a square whose ship placement immediately contradicts
 * the board is water.
 */
function attemptWaterRows(
  b: BoatsBoard,
  tmpGrid: Int8Array,
  shipCounts: Int32Array,
): number {
  const { w, h, grid, borderClues } = b;
  let ret = 0;
  tmpGrid.set(grid);

  const lineNeedsOneShip = (line: number): boolean =>
    borderClues[line] !== NO_CLUE && borderClues[line] - shipCounts[line] === 1;

  for (let y = 0; y < h; y++) {
    if (!lineNeedsOneShip(y + w)) continue;
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] !== EMPTY) continue;

      placeShip(b, x, y);
      fillRow(b, 0, y, w - 1, y, WATER);
      if (lineNeedsOneShip(x)) fillRow(b, x, 0, x, h - 1, WATER);

      if (validateState(b) === STATUS_INVALID) {
        grid.set(tmpGrid);
        ret += placeWater(b, x, y);
        tmpGrid.set(grid);
      } else {
        grid.set(tmpGrid);
      }
    }
  }

  for (let x = 0; x < w; x++) {
    if (!lineNeedsOneShip(x)) continue;
    for (let y = 0; y < h; y++) {
      if (lineNeedsOneShip(y + w)) continue;
      if (grid[y * w + x] !== EMPTY) continue;

      placeShip(b, x, y);
      fillRow(b, x, 0, x, h - 1, WATER);

      if (validateState(b) === STATUS_INVALID) {
        grid.set(tmpGrid);
        ret += placeWater(b, x, y);
        tmpGrid.set(grid);
      } else {
        grid.set(tmpGrid);
      }
    }
  }

  grid.set(tmpGrid);
  return ret;
}

/**
 * Upstream `boats_solver_centers_attempt`: try each orientation of an
 * unsatisfied centre clue; an orientation that immediately contradicts the
 * board rules itself out, leaving water past the centre on that axis.
 *
 * Note there is no final restore here (unlike the two above): every branch
 * restores `grid` from `tmpGrid` before the next clue, so the board is already
 * back to its entry contents plus whatever water was deduced.
 */
function centersAttempt(b: BoatsBoard, tmpGrid: Int8Array): number {
  const { w, h, grid, gridClues } = b;
  let ret = 0;
  tmpGrid.set(grid);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (gridClues[y * w + x] !== SHIP_CENTER) continue;
      const { left, right, up, down } = neighbours(b, x, y);
      if ((isShip(left) && isShip(right)) || (isShip(up) && isShip(down))) continue;

      placeShip(b, x - 1, y);
      placeShip(b, x + 1, y);
      if (validateState(b) === STATUS_INVALID) {
        grid.set(tmpGrid);
        ret += placeWater(b, x + 1, y);
        tmpGrid.set(grid);
        continue;
      }
      grid.set(tmpGrid);

      placeShip(b, x, y - 1);
      placeShip(b, x, y + 1);
      if (validateState(b) === STATUS_INVALID) {
        grid.set(tmpGrid);
        ret += placeWater(b, x, y + 1);
        tmpGrid.set(grid);
        continue;
      }
      grid.set(tmpGrid);
    }
  }

  return ret;
}

// --- the fixpoint loop -----------------------------------------------------

/**
 * A runaway backstop, never a gate. Every loop iteration must either resolve at
 * least one square (monotone: `EMPTY` → water/ship, or a contradiction to
 * `CORRUPT`, which ends the solve on the next validation) or reveal a hidden
 * border number (of which there are at most `w + h`), so the real bound is
 * `w·h + w + h`. The factor of two leaves room without letting a genuine
 * divergence hang the browser — playbook §5.2, "bound non-termination in the
 * code, where it can actually be caught".
 */
function iterationBudget(b: BoatsBoard): number {
  return (b.w * b.h + b.w + b.h) * 2 + 16;
}

/**
 * Upstream `boats_solve_game`. **Mutates `b`**: on return `b.grid` holds
 * however far the deduction got, and `b.borderClues` is restored to the
 * numbers it came in with (the Tricky tier fills hidden ones in as it works).
 */
export function solveBoats(b: BoatsBoard, maxDiff: number): BoatsSolveResult {
  const { w, h } = b;

  const blankCounts = new Int32Array(w + h);
  const shipCounts = new Int32Array(w + h);
  const fleetCount = new Int32Array(b.fleet);

  let dsf: Dsf | undefined;
  if (maxDiff >= DIFF_NORMAL) dsf = new Dsf(w * h + 1);

  let diff = DIFF_EASY;
  // Optimisation latches — see the module header; both are load-bearing.
  let hasCenters = true;
  let hasNoClue = false;
  for (let i = 0; i < w + h && !hasNoClue; i++)
    if (b.borderClues[i] === NO_CLUE) hasNoClue = true;

  // The Tricky tier writes deduced numbers into the board; keep the originals.
  const savedBorderClues =
    maxDiff >= DIFF_TRICKY && hasNoClue ? Int32Array.from(b.borderClues) : undefined;
  const tmpGrid = maxDiff >= DIFF_HARD ? new Int8Array(w * h) : undefined;

  solverInitial(b);

  let runs: BoatsRun[] = [];
  let budget = iterationBudget(b);

  for (;;) {
    if (budget-- <= 0)
      throw new Error("boats solver exceeded its iteration budget (a port bug)");

    if (
      validateFullState(b, blankCounts, shipCounts, fleetCount, dsf) !==
      STATUS_INCOMPLETE
    )
      break;

    // Easy techniques.
    if (hasNoClue && checkFill(b, blankCounts)) continue;
    if (checkCounts(b, blankCounts, shipCounts)) continue;
    if (hasCenters) {
      const centers = centersTrivial(b);
      hasCenters = centers.hasCenters;
      if (centers.ret) continue;
    }
    if (fleetCount[0] === b.fleetData[0] && removeSingles(b, fleetCount)) continue;

    // Normal techniques.
    if (maxDiff < DIFF_NORMAL) break;
    diff = Math.max(diff, DIFF_NORMAL);

    if (hasCenters && centersNormal(b, shipCounts)) continue;
    // biome-ignore lint/style/noNonNullAssertion: dsf exists whenever maxDiff >= NORMAL.
    if (maxExpandDsf(b, fleetCount, dsf!)) continue;
    // biome-ignore lint/style/noNonNullAssertion: as above.
    if (minExpandDsf(b, fleetCount, dsf!)) continue;

    runs = collectRuns(b);

    // Deliberately skipped once the solve has needed a Tricky technique: the
    // unrestricted form below subsumes it, and running both would double-count.
    if (diff < DIFF_TRICKY && findMaxFleet(b, shipCounts, fleetCount, runs, true))
      continue;
    if (splitRuns(b, fleetCount, runs)) continue;

    // Tricky techniques.
    if (maxDiff < DIFF_TRICKY) break;
    diff = Math.max(diff, DIFF_TRICKY);

    if (hasNoClue) {
      hasNoClue = borderCluesFill(b, blankCounts, shipCounts);
      if (borderCluesLast(b)) continue;
    }
    if (sharedDiagonals(b, blankCounts, shipCounts)) continue;
    if (findMaxFleet(b, shipCounts, fleetCount, runs, false)) continue;

    // Hard techniques.
    if (maxDiff < DIFF_HARD) break;
    diff = Math.max(diff, DIFF_HARD);

    // biome-ignore lint/style/noNonNullAssertion: tmpGrid exists whenever maxDiff >= HARD.
    if (hasCenters && centersAttempt(b, tmpGrid!)) continue;
    // biome-ignore lint/style/noNonNullAssertion: as above.
    if (attemptShipRows(b, tmpGrid!, blankCounts)) continue;
    // biome-ignore lint/style/noNonNullAssertion: as above.
    if (attemptWaterRows(b, tmpGrid!, shipCounts)) continue;

    break;
  }

  const status = validateFullState(b, blankCounts, shipCounts, fleetCount);
  if (savedBorderClues) b.borderClues.set(savedBorderClues);

  if (status === STATUS_INCOMPLETE) return { kind: "stuck" };
  if (status === STATUS_INVALID) return { kind: "invalid" };
  return { kind: "solved", diff };
}

// --- entry points for `solve()` and `findMistakes()` ------------------------

/**
 * Solve a board with **whichever difficulty cap works**, lowest first.
 *
 * This exists because upstream's solver is *not monotone in `maxDiff`*: raising
 * the cap can turn a solved board into a stuck one. The cause is
 * `checkDsf`, which only runs from Normal upward and whose final loop counts an
 * **unfinished** run of length `k` as though it were a completed size-`k` boat.
 * When every size-`k` boat is already placed, that reports a contradiction the
 * board does not have — and `validateFullState` returning `STATUS_INVALID`
 * breaks the solve loop on the spot. Measured across the twelve presets, 20
 * seeds each: **13–17 of 20 Easy boards are stuck at the maximum cap** while
 * solving fine at Easy, and no board at Normal or above is affected (an
 * Easy board is the only kind never gated against these techniques). Not one
 * stuck board had a wrong square — the solver stops, it does not err. Verified
 * identical in the C via a throwaway `boats-dbg` harness, so this is upstream's
 * behaviour and not a porting divergence.
 *
 * **The repair is here rather than in `checkDsf`** (playbook §4 rule 3). A false
 * *abort* only ever makes the solver weaker, never wrong, and the generator
 * re-verifies every board with the same solver — so generated puzzles are
 * correct and uniquely solvable as they stand, and "fixing" the solver would
 * change which boards exist while buying nothing. Asking each cap in turn costs
 * at most four solves, leaves the solver byte-exact against the C, and restores
 * Solve and Check & Save on the Easy presets, where both were silently broken:
 * `findMistakes` returning `[]` makes Check & Save degrade to a plain save and
 * happily store a wrong board, which is exactly the failure the hook exists to
 * prevent (playbook §3.5).
 */
export function solveAtAnyTier(b: BoatsBoard): BoatsSolveResult {
  let sawInvalid = false;
  for (let maxDiff = DIFF_EASY; maxDiff < DIFFCOUNT; maxDiff++) {
    const attempt = {
      ...b,
      grid: Int8Array.from(b.grid),
      borderClues: Int32Array.from(b.borderClues),
    };
    const result = solveBoats(attempt, maxDiff);
    if (result.kind === "solved") {
      b.grid.set(attempt.grid);
      return result;
    }
    if (result.kind === "invalid") sawInvalid = true;
  }
  return sawInvalid ? { kind: "invalid" } : { kind: "stuck" };
}

/**
 * Solve from the given clues alone and return the completed grid. Upstream
 * `solve_game`: any square the deduction never decided is filled with water, so
 * the returned move describes the whole board.
 */
export function solveToGrid(
  params: BoatsParams,
  gridClues: Int8Array,
  borderClues: Int32Array,
): { ok: true; grid: Int8Array } | { ok: false; error: string } {
  const b: BoatsBoard = {
    w: params.w,
    h: params.h,
    fleet: params.fleet,
    fleetData: params.fleetData,
    gridClues,
    borderClues: Int32Array.from(borderClues),
    grid: new Int8Array(params.w * params.h),
  };

  const result = solveAtAnyTier(b);
  if (result.kind === "invalid") return { ok: false, error: "Puzzle is invalid." };
  if (result.kind === "stuck")
    return { ok: false, error: "Solver could not solve this puzzle." };

  for (let i = 0; i < b.grid.length; i++) if (b.grid[i] === EMPTY) b.grid[i] = WATER;
  return { ok: true, grid: b.grid };
}

/** A cell the player has decided that the unique solution contradicts. */
export interface BoatsMistake {
  x: number;
  y: number;
}

/**
 * Re-solve the puzzle from its clues to the unique solution and report every
 * square the player has decided differently — the playbook §3.5 Check & Save
 * basis. Returns `[]` when the board is not uniquely deducible, so a puzzle the
 * solver cannot finish never accuses the player.
 *
 * A re-solve is the right basis here rather than the live rule checks, which
 * this game also renders: a player can place a locally-legal boat on a square
 * the solution has as water without yet exceeding a number or touching another
 * boat, and a live-only check would let Check & Save bless that board.
 */
export function findBoatsMistakes(state: BoatsState): readonly BoatsMistake[] {
  const { w, h } = state.params;
  const solved = solveToGrid(state.params, state.gridClues, state.borderClues);
  if (!solved.ok) return [];

  const out: BoatsMistake[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const player = state.grid[i];
      if (player === EMPTY) continue;
      const truth = solved.grid[i];
      if (isShip(player) !== isShip(truth)) out.push({ x, y });
    }
  }
  return out;
}
