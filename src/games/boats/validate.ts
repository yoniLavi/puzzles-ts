/**
 * Boats — the board-validation family (upstream's "Validation and Tools"
 * block). One pass per rule: row/column occupancy counts, the
 * boats-never-touch-diagonally check, the fleet inventory, the given-clue
 * agreement check, and the unfinished-boat disjoint-set check.
 *
 * **`adjustShips` mutates the board, and that is load-bearing.** Upstream's
 * `boats_adjust_ships` rewrites every `SHIP_VAGUE` into its resolved shape
 * (`TOP`/`LEFT`/`CENTER`/…) from its neighbors, and `boats_validate_full_state`
 * calls it in the middle of validating. Both the solver and `executeMove`
 * depend on that side effect — several deductions test for a specific shape,
 * and the fleet inventory only counts boats it can see a `LEFT`…`RIGHT` or
 * `TOP`…`BOTTOM` pair for. Porting `validateFullState` as a pure predicate
 * would silently disable half the solver (the mutating-validator hazard in
 * docs/games/solver-and-generator.md § "Solver-gated generation"). It is why
 * the solver works on a mutable {@link BoatsBoard} rather than on a
 * `BoatsState`.
 *
 * Each `errs` parameter is optional and, when given, is *filled in* with the
 * per-slot or per-cell error flags the renderer paints (and the hint reads back
 * to name the rule a refuted trial breaks); the solver passes none.
 */

import type { Dsf } from "../../engine/dsf.ts";
import {
  type BoatsBoard,
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
  STATUS_COMPLETE,
  STATUS_INCOMPLETE,
  STATUS_INVALID,
  WATER,
} from "./state.ts";

/** Per-cell error flags (upstream `FE_*` / `FD_*`). */
export const FE_COLLISION = 0x01;
/** A placed segment contradicts the given clue on that square. */
export const FE_MISMATCH = 0x02;
/** This square belongs to a completed boat the fleet has no room for. */
export const FE_FLEET = 0x04;
/** Not an error — the keyboard cursor is on this square. */
export const FD_CURSOR = 0x08;

/** A maximal run of not-known-to-be-water cells along one row or column. */
export interface BoatsRun {
  /** The row index for a horizontal run, the column index for a vertical one. */
  row: number;
  start: number;
  len: number;
  /** How many of the run's cells already hold a ship. */
  ships: number;
  horizontal: boolean;
}

/** The four orthogonal neighbors of `(x, y)`, with off-board treated as
 * water — the idiom every upstream deduction opens with. */
export function neighbors(
  b: BoatsBoard,
  x: number,
  y: number,
): { left: number; right: number; up: number; down: number } {
  const { w, h, grid } = b;
  return {
    left: x === 0 ? WATER : grid[y * w + (x - 1)],
    right: x === w - 1 ? WATER : grid[y * w + (x + 1)],
    up: y === 0 ? WATER : grid[(y - 1) * w + x],
    down: y === h - 1 ? WATER : grid[(y + 1) * w + x],
  };
}

/** Total ship squares the fleet requires. */
export function fleetShipCount(b: BoatsBoard): number {
  let total = 0;
  for (let i = 0; i < b.fleet; i++) total += b.fleetData[i] * (i + 1);
  return total;
}

/**
 * Upstream `boats_count_ships`: per-row and per-column tallies of ships and
 * water, checked against the border numbers. `blankCounts`/`shipCounts` are
 * indexed columns `0…w−1` then rows `w…w+h−1`; `errs` (same indexing) receives
 * the per-line `STATUS_*` the renderer colors the number with.
 */
export function countShips(
  b: BoatsBoard,
  blankCounts?: Int32Array,
  shipCounts?: Int32Array,
  errs?: Int32Array,
): number {
  const { w, h, grid, borderClues } = b;
  let ret = STATUS_COMPLETE;

  for (let x = 0; x < w; x++) {
    let blanks = 0;
    let ships = 0;
    for (let y = 0; y < h; y++) {
      const cell = grid[y * w + x];
      if (cell === WATER) blanks++;
      else if (isShip(cell)) ships++;
      else if (cell !== EMPTY) ret = STATUS_INVALID; // CORRUPT
    }
    if (blankCounts) blankCounts[x] = blanks;
    if (shipCounts) shipCounts[x] = ships;
    if (borderClues[x] === NO_CLUE) continue;

    if (ships > borderClues[x] || blanks > h - borderClues[x]) {
      ret = STATUS_INVALID;
      if (errs) errs[x] = STATUS_INVALID;
    } else if (ships < borderClues[x]) {
      ret = ret !== STATUS_INVALID ? STATUS_INCOMPLETE : ret;
      if (errs) errs[x] = STATUS_INCOMPLETE;
    } else if (errs) {
      errs[x] = STATUS_COMPLETE;
    }
  }

  for (let y = 0; y < h; y++) {
    let blanks = 0;
    let ships = 0;
    for (let x = 0; x < w; x++) {
      const cell = grid[y * w + x];
      if (cell === WATER) blanks++;
      else if (isShip(cell)) ships++;
    }
    if (blankCounts) blankCounts[y + w] = blanks;
    if (shipCounts) shipCounts[y + w] = ships;
    if (borderClues[y + w] === NO_CLUE) continue;

    if (ships > borderClues[y + w] || blanks > w - borderClues[y + w]) {
      ret = STATUS_INVALID;
      if (errs) errs[y + w] = STATUS_INVALID;
    } else if (ships < borderClues[y + w]) {
      ret = ret !== STATUS_INVALID ? STATUS_INCOMPLETE : ret;
      if (errs) errs[y + w] = STATUS_INCOMPLETE;
    } else if (errs) {
      errs[y + w] = STATUS_COMPLETE;
    }
  }

  return ret;
}

/**
 * Upstream `boats_adjust_ships` — **mutates `b.grid`**. Every ship square is
 * rewritten to the shape its neighbors imply: surrounded by water ⇒ a single;
 * ships on both sides ⇒ a center; water (or a given end-cap clue) on one side
 * and a ship on the other ⇒ the matching end; otherwise still vague.
 *
 * The "exactly enough ships are placed" shortcut is what turns the last
 * placement into finished boats: once the ship count equals the fleet's total,
 * every remaining unknown neighbor is treated as water.
 */
export function adjustShips(b: BoatsBoard): number {
  const { w, h, grid, gridClues } = b;
  const maxShips = fleetShipCount(b);
  let shipSum = 0;
  let waterSum = 0;
  for (let i = 0; i < w * h; i++) {
    if (isShip(grid[i])) shipSum++;
    else if (grid[i] === WATER) waterSum++;
  }

  let ret = STATUS_COMPLETE;
  if (shipSum > maxShips || w * h - waterSum < maxShips) ret = STATUS_INVALID;
  else if (shipSum < maxShips) ret = STATUS_INCOMPLETE;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (!isShip(grid[y * w + x])) continue;

      let { left, right, up, down } = neighbors(b, x, y);

      const clue = gridClues[y * w + x];
      // A given end-cap clue already says which way the boat runs.
      const edge = isShip(clue) && clue !== SHIP_VAGUE && clue !== SHIP_CENTER;

      if (maxShips === shipSum) {
        if (left === EMPTY) left = WATER;
        if (right === EMPTY) right = WATER;
        if (up === EMPTY) up = WATER;
        if (down === EMPTY) down = WATER;
      }

      let shape: number;
      if (left === WATER && right === WATER && up === WATER && down === WATER)
        shape = SHIP_SINGLE;
      else if ((isShip(left) && isShip(right)) || (isShip(up) && isShip(down)))
        shape = SHIP_CENTER;
      else if ((edge || left === WATER) && isShip(right)) shape = SHIP_LEFT;
      else if ((edge || right === WATER) && isShip(left)) shape = SHIP_RIGHT;
      else if ((edge || up === WATER) && isShip(down)) shape = SHIP_TOP;
      else if ((edge || down === WATER) && isShip(up)) shape = SHIP_BOTTOM;
      else shape = SHIP_VAGUE;

      grid[y * w + x] = shape;
    }
  }

  return ret;
}

/**
 * Upstream `boats_check_collision`: two boats touching diagonally. The flag is
 * recorded on the top-left cell of the offending 2×2 block, which is where the
 * renderer draws its warning diamond (between the four cells).
 */
export function checkCollision(b: BoatsBoard, errs?: Int32Array): boolean {
  const { w, h, grid } = b;
  let found = false;
  for (let x = 0; x < w - 1; x++) {
    for (let y = 0; y < h - 1; y++) {
      if (
        (isShip(grid[y * w + x]) && isShip(grid[(y + 1) * w + (x + 1)])) ||
        (isShip(grid[(y + 1) * w + x]) && isShip(grid[y * w + (x + 1)]))
      ) {
        if (errs) errs[y * w + x] |= FE_COLLISION;
        found = true;
      } else if (errs) {
        errs[y * w + x] &= ~FE_COLLISION;
      }
    }
  }
  return found;
}

/**
 * Upstream `boats_check_fleet`: count every *completed* boat (one whose shape
 * is resolved end to end) and compare against the fleet inventory. A boat of a
 * size the fleet has no room for is flagged `FE_FLEET` on each of its squares.
 * A `SHIP_VAGUE` square breaks a run — an unresolved boat is not counted.
 */
export function checkFleet(
  b: BoatsBoard,
  fleetCount?: Int32Array,
  errs?: Int32Array,
): number {
  const { w, h, fleet, grid, fleetData } = b;
  const counts = fleetCount ?? new Int32Array(fleet);
  counts.fill(0);
  let ret = STATUS_COMPLETE;

  if (errs) for (let i = 0; i < w * h; i++) errs[i] &= ~FE_FLEET;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (fleet >= 1 && grid[y * w + x] === SHIP_SINGLE) {
        if (errs && fleetData[0] === 0) errs[y * w + x] |= FE_FLEET;
        counts[0]++;
      }
    }
  }

  // Vertical boats, then horizontal ones — same walk on each axis.
  for (let x = 0; x < w; x++) {
    let len = 0;
    let inShip = false;
    for (let y = 0; y < h; y++) {
      let isError = false;
      if (grid[y * w + x] === SHIP_TOP) inShip = true;
      if (inShip) len++;

      if (inShip && grid[y * w + x] === SHIP_BOTTOM) {
        inShip = false;
        if (len > fleet) {
          ret = STATUS_INVALID;
          isError = true;
        } else if (len > 0) {
          counts[len - 1]++;
          if (fleetData[len - 1] === 0) isError = true;
        }
        if (errs && isError)
          for (let i = 0; i < len; i++) errs[(y - i) * w + x] |= FE_FLEET;
        len = 0;
      } else if (grid[y * w + x] === SHIP_VAGUE) {
        inShip = false;
        len = 0;
      }
    }
  }

  for (let y = 0; y < h; y++) {
    let len = 0;
    let inShip = false;
    for (let x = 0; x < w; x++) {
      let isError = false;
      if (grid[y * w + x] === SHIP_LEFT) inShip = true;
      if (inShip) len++;

      if (inShip && grid[y * w + x] === SHIP_RIGHT) {
        inShip = false;
        if (len > fleet) {
          ret = STATUS_INVALID;
          isError = true;
        } else if (len > 0) {
          counts[len - 1]++;
          if (fleetData[len - 1] === 0) isError = true;
        }
        if (errs && isError)
          for (let i = 0; i < len; i++) errs[y * w + x - i] |= FE_FLEET;
        len = 0;
      } else if (grid[y * w + x] === SHIP_VAGUE) {
        inShip = false;
        len = 0;
      }
    }
  }

  for (let i = 0; i < fleet; i++) {
    if (counts[i] < fleetData[i] && ret !== STATUS_INVALID) ret = STATUS_INCOMPLETE;
    else if (counts[i] > fleetData[i]) ret = STATUS_INVALID;
  }

  return ret;
}

/**
 * Upstream `boats_collect_runs`: every maximal run of non-water cells, first
 * along each row and then along each column. The solver uses these to reason
 * about where a boat of a given length can still go; the generator uses them
 * to place one.
 */
export function collectRuns(b: BoatsBoard): BoatsRun[] {
  const { w, h, grid } = b;
  const runs: BoatsRun[] = [];

  for (let y = 0; y < h; y++) {
    let run: BoatsRun | null = null;
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === WATER) {
        run = null;
        continue;
      }
      if (!run) {
        run = { row: y, start: x, len: 0, ships: 0, horizontal: true };
        runs.push(run);
      }
      run.len++;
      if (isShip(grid[y * w + x])) run.ships++;
    }
  }

  for (let x = 0; x < w; x++) {
    let run: BoatsRun | null = null;
    for (let y = 0; y < h; y++) {
      if (grid[y * w + x] === WATER) {
        run = null;
        continue;
      }
      if (!run) {
        run = { row: x, start: y, len: 0, ships: 0, horizontal: false };
        runs.push(run);
      }
      run.len++;
      if (isShip(grid[y * w + x])) run.ships++;
    }
  }

  return runs;
}

/**
 * Upstream `boats_validate_gridclues`: does each given clue still agree with
 * the board? A given end-cap must have a ship on its open side, a center must
 * have ships on one whole axis, and a resolved shape must equal the clue.
 * Also reports `STATUS_INCOMPLETE` while any square is still `SHIP_VAGUE`.
 */
export function validateGridClues(b: BoatsBoard, errs?: Int32Array): number {
  const { w, h, grid, gridClues } = b;
  let ret = STATUS_COMPLETE;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (grid[i] === SHIP_VAGUE && ret !== STATUS_INVALID) ret = STATUS_INCOMPLETE;

      if (gridClues[i] === EMPTY) {
        if (errs) errs[i] &= ~FE_MISMATCH;
        continue;
      }

      let error = false;
      if (
        gridClues[i] !== SHIP_VAGUE &&
        grid[i] !== SHIP_VAGUE &&
        gridClues[i] !== grid[i]
      ) {
        error = true;
      } else {
        const { left, right, up, down } = neighbors(b, x, y);
        if (gridClues[i] === SHIP_LEFT && right === WATER) error = true;
        else if (gridClues[i] === SHIP_RIGHT && left === WATER) error = true;
        else if (gridClues[i] === SHIP_TOP && down === WATER) error = true;
        else if (gridClues[i] === SHIP_BOTTOM && up === WATER) error = true;
        else if (
          gridClues[i] === SHIP_CENTER &&
          (left === WATER || right === WATER) &&
          (up === WATER || down === WATER)
        )
          error = true;
      }

      if (error) {
        ret = STATUS_INVALID;
        if (errs) errs[i] |= FE_MISMATCH;
      } else if (errs) {
        errs[i] &= ~FE_MISMATCH;
      }
    }
  }

  return ret;
}

/**
 * Upstream `boats_check_dsf`: group the *unfinished* boats and check none has
 * already outgrown the fleet. Water, empty cells and every finished boat go
 * into one big class anchored at the sentinel index `w·h`, so what is left is
 * exactly the partially-drawn boats.
 *
 * **This is why the shared {@link Dsf} must not be swapped for another
 * union-find** (docs/games/solver-and-generator.md § "Solver-gated
 * generation"). The finished-boat tests read `grid[dsf.canonify(i)]` as an
 * *element* — upstream's comment is "the canonical index always points to the
 * first square of a boat" — so the deduction branches on which square
 * union-by-size happened to make the root, not merely on connectivity. The
 * shared `Dsf` is aligned to `dsf.c`'s root choice for exactly this case; the
 * byte-match differential is what proves it.
 */
export function checkDsf(b: BoatsBoard, dsf: Dsf, fleetCount: Int32Array): number {
  const { w, h, fleet, grid, fleetData } = b;
  const end = w * h;
  const tempFleet = Int32Array.from(fleetCount);
  let ret = STATUS_COMPLETE;

  dsf.reinit();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (grid[i] === EMPTY || grid[i] === WATER) {
        dsf.merge(i, end);
        continue;
      }

      if (x < w - 1 && isShip(grid[i]) && isShip(grid[y * w + x + 1]))
        dsf.merge(i, y * w + x + 1);
      if (y < h - 1 && isShip(grid[i]) && isShip(grid[(y + 1) * w + x]))
        dsf.merge(i, (y + 1) * w + x);

      if (grid[i] === SHIP_SINGLE) dsf.merge(i, end);
      else if (grid[i] === SHIP_RIGHT && grid[dsf.canonify(i)] === SHIP_LEFT)
        dsf.merge(i, end);
      else if (grid[i] === SHIP_BOTTOM && grid[dsf.canonify(i)] === SHIP_TOP)
        dsf.merge(i, end);
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dsf.canonify(i) === dsf.canonify(end)) continue;
      if (i === dsf.canonify(i)) {
        if (ret !== STATUS_INVALID) ret = STATUS_INCOMPLETE;
        if (dsf.size(i) > fleet) ret = STATUS_INVALID;
        else tempFleet[dsf.size(i) - 1]++;
      }
    }
  }

  for (let i = fleet - 1; i >= 0; i--) {
    if (fleetCount[i] < fleetData[i]) break;
    if (tempFleet[i] > fleetData[i]) ret = STATUS_INVALID;
  }

  return ret;
}

/**
 * Upstream `boats_validate_full_state`. **Mutates the board** (via
 * {@link adjustShips}) — see the module header. Pass a `dsf` to include the
 * unfinished-boat check (the solver does so from Normal upward; the final
 * verdict pass deliberately does not).
 */
export function validateFullState(
  b: BoatsBoard,
  blankCounts?: Int32Array,
  shipCounts?: Int32Array,
  fleetCount?: Int32Array,
  dsf?: Dsf,
): number {
  let status = countShips(b, blankCounts, shipCounts);
  if (status === STATUS_INVALID) return status;
  if (checkCollision(b)) return STATUS_INVALID;

  const adjustStatus = adjustShips(b);

  status = Math.max(status, checkFleet(b, fleetCount));
  status = Math.max(status, validateGridClues(b));

  if (status !== STATUS_INVALID && dsf && fleetCount)
    status = Math.max(status, checkDsf(b, dsf, fleetCount));

  // When every ship is placed, everything else must already be finished.
  if (
    adjustStatus === STATUS_INVALID ||
    (adjustStatus === STATUS_COMPLETE && status !== STATUS_COMPLETE)
  )
    return STATUS_INVALID;

  return status;
}
