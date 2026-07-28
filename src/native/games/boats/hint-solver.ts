/**
 * Boats — the recording deduction pass behind the explained hint.
 *
 * The hint is a **second projection of the same deduction engine as the
 * solver** (hint-authoring §5.6a): `solveBoats` runs the techniques to a
 * fixpoint and reports a difficulty; this module runs the *same* techniques one
 * **firing** at a time and reports what each one forced, why, and from what
 * evidence. Every deduction Boats knows is a named, teachable Battleships
 * technique, and the game guesses at no tier, so no step ever falls back on an
 * unexplained "this is the only possibility".
 *
 * **Deliberately a separate file from `solver.ts`, not an addition to it.** The
 * C is gone — `puzzles/unreleased/boats.c` was deleted at stage-2 acceptance —
 * so the 34-fixture differential now runs against a frozen fixture and is the
 * only guard left on `solveBoats`. Keeping the recording pass in its own module
 * makes "the solver is untouched" a property you can check by looking at the
 * file list rather than by reading a diff.
 *
 * Three things this pass does that `solveBoats` does not, each load-bearing:
 *
 *  - **It resumes from the player's board.** `solveBoats` opens with
 *    `solverInitial`, which *wipes the grid* and re-derives it from the given
 *    clues — fine for a solver, useless for a hint, which must start from what
 *    the player has actually placed (hint-authoring §7.1). So the clue
 *    derivations upstream folds into that wipe become an ordinary narratable
 *    technique here ({@link BoatsTechnique} `givenClue`), and the never-touch
 *    water that `placeShip` applies as a side effect becomes `neverTouch` — the
 *    player's own placements need it too, and seeding it silently would put
 *    water on the deduction's board that the player cannot see, making a later
 *    narration describe a board that isn't theirs (§2.8).
 *  - **It orders goal-first, not solver-first** (§2.10): placements before
 *    rule-outs, cheaper tier before dearer.
 *  - **It never consults the dsf for the board's *status*.** `checkDsf` is the
 *    source of the solver's non-monotonicity (see `solveAtAnyTier`): it can
 *    report a contradiction the board does not have, which inside `solveBoats`
 *    aborts the solve. A hint that aborted there would simply stop advising, so
 *    the status check here is the dsf-less `validateFullState` — the same pass
 *    `solveBoats` uses for its own final verdict. The dsf is still built and
 *    used as a *tool* by the two expand techniques.
 */

import { Dsf } from "../../engine/dsf.ts";
import { deduceHintPlan } from "../../engine/hint-plan.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import {
  borderCluesLast,
  fillRow,
  placeShip,
  placeWater,
  solveBoats,
} from "./solver.ts";
import {
  type BoatsBoard,
  type BoatsState,
  boardOf,
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
  checkCollision,
  checkDsf,
  checkFleet,
  collectRuns,
  countShips,
  FE_COLLISION,
  FE_FLEET,
  FE_MISMATCH,
  fleetShipCount,
  neighbours,
  validateFullState,
  validateGridClues,
} from "./validate.ts";

// --- the vocabulary a firing speaks in --------------------------------------

/** A square the deduction decides, and what it decides it to be. */
export interface BoatsSquare {
  x: number;
  y: number;
  ship: boolean;
}

/** A row or column, named the way the player reads it: 1-based, counting from
 * the top / the left, alongside the occupancy number drawn beside it. */
export interface BoatsLine {
  horizontal: boolean;
  /** 0-based row (`horizontal`) or column index. */
  index: number;
  /** The occupancy number, which may be one this pass deduced — see
   * {@link BoatsLine.deduced}. */
  clue: number;
  /** True when the puzzle hides this number and the deduction recovered it, so
   * the narration must say where it came from rather than cite a number the
   * player cannot see. */
  deduced: boolean;
}

/** Why the board rejected a Hard tier's trial — read straight off the
 * validators' own error arrays (hint-authoring §5.6a′). */
export type BoatsBreach =
  /** Two boats would touch, if only at a corner. */
  | { kind: "collision" }
  /** A row or column's occupancy number could no longer be met. */
  | { kind: "count"; line: BoatsLine }
  /** The fleet has no boat of the size that would be formed. */
  | { kind: "fleet" }
  /** More (or fewer) ship squares than the whole fleet accounts for. */
  | { kind: "fleetTotal"; tooMany: boolean }
  /** A given segment's own shape would be contradicted. */
  | { kind: "clue" }
  /**
   * The board is left with no legal way to finish, without one rule naming
   * itself the culprit. Honest catch-all rather than a fabricated cause
   * (hint-authoring §5.6).
   */
  | { kind: "unfinishable" };

/**
 * The named technique that forced a firing, carrying exactly what its narration
 * needs. One member per solver function, in the order the tiers introduce them.
 */
export type BoatsTechnique =
  // --- Easy ---
  /** A given end cap or single says which way its boat runs. */
  | { kind: "givenClue"; shape: number }
  /** Boats never touch, so the diagonals of a segment are water. */
  | { kind: "neverTouch" }
  /** A line already shows all the ships its number allows. */
  | { kind: "lineSatisfied"; line: BoatsLine }
  /** A line has exactly as many free squares left as ships still to place. */
  | { kind: "lineForced"; line: BoatsLine }
  /** Every square of water is accounted for, so the rest is fleet. */
  | { kind: "allWaterPlaced" }
  /** A centre segment with water to one side must run along the other axis. */
  | { kind: "centreForced"; vertical: boolean }
  /** Every 1-boat is placed, so a square hemmed in on all four sides is water. */
  | { kind: "isolated" }
  /** Every 1-boat is placed, so a segment hemmed in on three sides continues
   * into the fourth. */
  | { kind: "mustExtend" }
  // --- Normal ---
  /** A centre segment's line cannot take the two more ships that direction needs. */
  | { kind: "centreCount"; line: BoatsLine; vertical: boolean }
  /** Filling a square would join runs into a boat longer than any left. */
  | { kind: "growTooLong"; joined: number; largest: number }
  /** Every boat of this length is placed, so an unfinished one must be longer. */
  | { kind: "mustGrow"; length: number }
  /** Every boat of this length is placed, so a run of exactly that length must
   * not be filled. */
  | { kind: "runTooShort"; length: number }
  /** The runs that can still hold the largest missing boat are exactly as many
   * as there are such boats, so every one of them is used. */
  | { kind: "onlyRunsLeft"; size: number; missing: number; runs: number }
  // --- Tricky ---
  /** Two squares in a nearly-full line share diagonal neighbours; one of them is
   * a ship either way, so the shared neighbours are water. */
  | { kind: "sharedDiagonal"; line: BoatsLine; room: number }
  // --- Hard ---
  /** The opposite placement immediately contradicts the board. */
  | { kind: "refuted"; trialShip: boolean; breach: BoatsBreach; local: boolean };

/** One deduction: what it forces, what follows from that by the never-touch
 * rule, and the squares it reasons over. */
export interface BoatsFiring {
  technique: BoatsTechnique;
  /** The squares the player is asked to decide — always still undecided. */
  squares: BoatsSquare[];
  /**
   * Water that follows from this firing's own placements because boats never
   * touch. Shown as part of the step so the player sees the rule doing its
   * work, but never narrated separately and never part of the move: the next
   * recompute re-derives it from the placed segment either way (owner decision,
   * 2026-07-28).
   */
  consequences: BoatsSquare[];
  /** The cells the deduction reasons over, for the `COL_HINT_CELL` area. */
  evidence: { x: number; y: number }[];
  /**
   * The grid **as this firing fired** — every earlier firing applied, this one
   * not yet. The step's move is built against it (a `fill` move is a rectangle
   * that sets every still-empty cell in its span, so "which cells in this span
   * are already decided?" must be asked of the right board), and it is the
   * board the narration and the shaded area describe (hint-authoring §5.2).
   */
  grid: Int8Array;
}

/** Runaway/UX cap on plan length, matching Spokes and Bricks: a player rarely
 * follows more than a few steps before diverging, and a recompute yields the
 * next batch. */
export const HINT_PLAN_MAX = 40;

// --- working state ----------------------------------------------------------

interface Ctx {
  b: BoatsBoard;
  maxDiff: number;
  /** Refilled by the status pass each iteration — see {@link boardStatus}. */
  blankCounts: Int32Array;
  shipCounts: Int32Array;
  fleetCount: Int32Array;
  dsf: Dsf;
  /** Which of the `w + h` occupancy numbers this pass recovered itself. */
  deduced: boolean[];
  /** False once every hidden number has been recovered (upstream's latch). */
  hasNoClue: boolean;
}

function cloneBoard(b: BoatsBoard): BoatsBoard {
  return {
    ...b,
    grid: Int8Array.from(b.grid),
    borderClues: Int32Array.from(b.borderClues),
  };
}

/**
 * The board's status, and the tallies every technique reads. Deliberately the
 * dsf-less form — see the module header.
 */
function boardStatus(ctx: Ctx): number {
  return validateFullState(ctx.b, ctx.blankCounts, ctx.shipCounts, ctx.fleetCount);
}

function lineOf(ctx: Ctx, horizontal: boolean, index: number): BoatsLine {
  const slot = horizontal ? index + ctx.b.w : index;
  return {
    horizontal,
    index,
    clue: ctx.b.borderClues[slot],
    deduced: ctx.deduced[slot],
  };
}

/** Every cell of a line, for the evidence area. */
function lineCells(b: BoatsBoard, horizontal: boolean, index: number) {
  const out: { x: number; y: number }[] = [];
  const n = horizontal ? b.w : b.h;
  for (let k = 0; k < n; k++)
    out.push(horizontal ? { x: k, y: index } : { x: index, y: k });
  return out;
}

/**
 * Assemble a firing from the squares a technique directly forces: drop any the
 * board has already decided, and derive the never-touch consequences by
 * actually running the placements on a scratch copy — so the shown consequences
 * are exactly what applying the firing will produce, never a second guess at
 * the rule.
 */
function firing(
  ctx: Ctx,
  technique: BoatsTechnique,
  forced: BoatsSquare[],
  evidence: { x: number; y: number }[],
): BoatsFiring | null {
  const { b } = ctx;
  const fresh = forced.filter(
    (s) =>
      s.x >= 0 &&
      s.y >= 0 &&
      s.x < b.w &&
      s.y < b.h &&
      b.grid[s.y * b.w + s.x] === EMPTY,
  );
  if (fresh.length === 0) return null;

  const scratch = cloneBoard(b);
  applySquares(scratch, fresh);

  const primary = new Set(fresh.map((s) => s.y * b.w + s.x));
  const consequences: BoatsSquare[] = [];
  for (let i = 0; i < b.w * b.h; i++) {
    if (b.grid[i] !== EMPTY || scratch.grid[i] === EMPTY || primary.has(i)) continue;
    consequences.push({
      x: i % b.w,
      y: Math.floor(i / b.w),
      ship: isShip(scratch.grid[i]),
    });
  }

  return {
    technique,
    squares: fresh,
    consequences,
    evidence: evidence.filter((c) => !primary.has(c.y * b.w + c.x)),
    grid: Int8Array.from(b.grid),
  };
}

function applySquares(b: BoatsBoard, squares: readonly BoatsSquare[]): void {
  for (const s of squares) {
    if (s.ship) placeShip(b, s.x, s.y);
    else placeWater(b, s.x, s.y);
  }
}

/** Apply a firing to the working board — the primary squares only; the
 * never-touch water falls out of `placeShip` exactly as it did when the firing
 * was built. */
export function applyBoatsFiring(b: BoatsBoard, f: BoatsFiring): void {
  applySquares(b, f.squares);
}

// --- Easy tier --------------------------------------------------------------

/** The squares a given end cap or single forces around itself (upstream
 * `boats_solver_initial`, minus the grid wipe). */
function findGivenClue(ctx: Ctx): BoatsFiring | null {
  const { b } = ctx;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const shape = b.gridClues[y * b.w + x];
      const forced: BoatsSquare[] = [];
      switch (shape) {
        case SHIP_TOP:
          forced.push({ x, y: y + 1, ship: true }, { x, y: y - 1, ship: false });
          break;
        case SHIP_BOTTOM:
          forced.push({ x, y: y - 1, ship: true }, { x, y: y + 1, ship: false });
          break;
        case SHIP_LEFT:
          forced.push({ x: x + 1, y, ship: true }, { x: x - 1, y, ship: false });
          break;
        case SHIP_RIGHT:
          forced.push({ x: x - 1, y, ship: true }, { x: x + 1, y, ship: false });
          break;
        case SHIP_SINGLE:
          forced.push(
            { x: x + 1, y, ship: false },
            { x: x - 1, y, ship: false },
            { x, y: y + 1, ship: false },
            { x, y: y - 1, ship: false },
          );
          break;
        default:
          continue;
      }
      const f = firing(ctx, { kind: "givenClue", shape }, forced, [{ x, y }]);
      if (f) return f;
    }
  }
  return null;
}

/** The never-touch rule around a segment already on the board. */
function findNeverTouch(ctx: Ctx): BoatsFiring | null {
  const { b } = ctx;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (!isShip(b.grid[y * b.w + x])) continue;
      const f = firing(
        ctx,
        { kind: "neverTouch" },
        [
          { x: x - 1, y: y - 1, ship: false },
          { x: x + 1, y: y - 1, ship: false },
          { x: x - 1, y: y + 1, ship: false },
          { x: x + 1, y: y + 1, ship: false },
        ],
        [{ x, y }],
      );
      if (f) return f;
    }
  }
  return null;
}

/**
 * Upstream `boats_solver_check_counts`, split by which of its two halves fired
 * so the narration can lead with the right indication. `wantShips` picks the
 * placement half (goal-first: it runs before the water half).
 */
function findLineCount(ctx: Ctx, wantShips: boolean): BoatsFiring | null {
  const { b, shipCounts, blankCounts } = ctx;

  for (const horizontal of [false, true]) {
    const n = horizontal ? b.h : b.w;
    const span = horizontal ? b.w : b.h;
    for (let i = 0; i < n; i++) {
      const slot = horizontal ? i + b.w : i;
      const clue = b.borderClues[slot];
      if (clue === NO_CLUE) continue;

      const shipsMet = shipCounts[slot] === clue;
      const waterMet = blankCounts[slot] === span - clue;
      // Faithful to upstream: each half needs the *other* tally to be unmet, or
      // the line is finished and there is nothing to fill.
      const fires = wantShips ? !shipsMet && waterMet : shipsMet && !waterMet;
      if (!fires) continue;

      const line = lineOf(ctx, horizontal, i);
      const forced: BoatsSquare[] = [];
      for (let k = 0; k < span; k++) {
        const x = horizontal ? k : i;
        const y = horizontal ? i : k;
        forced.push({ x, y, ship: wantShips });
      }

      const f = firing(
        ctx,
        { kind: wantShips ? "lineForced" : "lineSatisfied", line },
        forced,
        lineCells(b, horizontal, i),
      );
      if (f) return f;
    }
  }
  return null;
}

/** Upstream `boats_solver_check_fill`: the water on the board plus the fleet's
 * own squares already account for the whole grid. */
function findAllWaterPlaced(ctx: Ctx): BoatsFiring | null {
  const { b, blankCounts } = ctx;
  let count = 0;
  for (let i = 0; i < b.fleet; i++) count += b.fleetData[i] * (i + 1);
  for (let i = 0; i < b.w; i++) count += blankCounts[i];
  if (count !== b.w * b.h) return null;

  const forced: BoatsSquare[] = [];
  for (let i = 0; i < b.w * b.h; i++)
    if (b.grid[i] === EMPTY)
      forced.push({ x: i % b.w, y: Math.floor(i / b.w), ship: true });

  return firing(ctx, { kind: "allWaterPlaced" }, forced, []);
}

/** Whether a given centre clue still needs its boat's direction settled. */
function unsettledCentre(b: BoatsBoard, x: number, y: number): boolean {
  if (b.gridClues[y * b.w + x] !== SHIP_CENTER) return false;
  const { left, right, up, down } = neighbours(b, x, y);
  return !((isShip(left) && isShip(right)) || (isShip(up) && isShip(down)));
}

/** Upstream `boats_solver_centers_trivial`. */
function findCentreForced(ctx: Ctx): BoatsFiring | null {
  const { b } = ctx;
  for (let x = 0; x < b.w; x++) {
    for (let y = 0; y < b.h; y++) {
      if (!unsettledCentre(b, x, y)) continue;
      const { left, right, up, down } = neighbours(b, x, y);

      let forced: BoatsSquare[];
      let vertical: boolean;
      const evidence = [{ x, y }];
      if (left === WATER || right === WATER) {
        vertical = true;
        forced = [
          { x, y: y - 1, ship: true },
          { x, y: y + 1, ship: true },
        ];
        evidence.push(left === WATER ? { x: x - 1, y } : { x: x + 1, y });
      } else if (up === WATER || down === WATER) {
        vertical = false;
        forced = [
          { x: x - 1, y, ship: true },
          { x: x + 1, y, ship: true },
        ];
        evidence.push(up === WATER ? { x, y: y - 1 } : { x, y: y + 1 });
      } else {
        continue;
      }

      const f = firing(ctx, { kind: "centreForced", vertical }, forced, evidence);
      if (f) return f;
    }
  }
  return null;
}

/**
 * Upstream `boats_solver_remove_singles`, split into its two halves so the
 * placement (`mustExtend`) can run before the rule-out (`isolated`).
 */
function findSingles(ctx: Ctx, wantExtend: boolean): BoatsFiring | null {
  const { b, fleetCount } = ctx;
  if (fleetCount[0] !== b.fleetData[0]) return null;

  for (let x = 0; x < b.w; x++) {
    for (let y = 0; y < b.h; y++) {
      const cell = b.grid[y * b.w + x];
      if (cell === WATER) continue;
      const { left, right, up, down } = neighbours(b, x, y);
      const walls = [left, right, up, down].filter((n) => n === WATER).length;

      if (!wantExtend && cell === EMPTY && walls === 4) {
        const f = firing(
          ctx,
          { kind: "isolated" },
          [{ x, y, ship: false }],
          [
            { x: x - 1, y },
            { x: x + 1, y },
            { x, y: y - 1 },
            { x, y: y + 1 },
          ],
        );
        if (f) return f;
      }

      if (!wantExtend || cell !== SHIP_VAGUE || walls !== 3) continue;

      let forced: BoatsSquare | null = null;
      if (left === WATER && right === WATER && up === WATER && down === EMPTY)
        forced = { x, y: y + 1, ship: true };
      else if (left === WATER && right === WATER && down === WATER && up === EMPTY)
        forced = { x, y: y - 1, ship: true };
      else if (down === WATER && right === WATER && up === WATER && left === EMPTY)
        forced = { x: x - 1, y, ship: true };
      else if (down === WATER && left === WATER && up === WATER && right === EMPTY)
        forced = { x: x + 1, y, ship: true };
      if (!forced) continue;

      const f = firing(ctx, { kind: "mustExtend" }, [forced], [{ x, y }]);
      if (f) return f;
    }
  }
  return null;
}

// --- Normal tier ------------------------------------------------------------

/** Upstream `boats_solver_centers_normal`. */
function findCentreCount(ctx: Ctx): BoatsFiring | null {
  const { b, shipCounts } = ctx;
  for (let x = 0; x < b.w; x++) {
    for (let y = 0; y < b.h; y++) {
      if (!unsettledCentre(b, x, y)) continue;

      // A horizontal boat through the centre needs two more ships in this row.
      if (
        b.borderClues[y + b.w] !== NO_CLUE &&
        b.borderClues[y + b.w] - shipCounts[y + b.w] < 2
      ) {
        const f = firing(
          ctx,
          { kind: "centreCount", line: lineOf(ctx, true, y), vertical: true },
          [{ x: x + 1, y, ship: false }],
          [{ x, y }, ...lineCells(b, true, y)],
        );
        if (f) return f;
      }
      if (b.borderClues[x] !== NO_CLUE && b.borderClues[x] - shipCounts[x] < 2) {
        const f = firing(
          ctx,
          { kind: "centreCount", line: lineOf(ctx, false, x), vertical: false },
          [{ x, y: y + 1, ship: false }],
          [{ x, y }, ...lineCells(b, false, x)],
        );
        if (f) return f;
      }
    }
  }
  return null;
}

/** The largest boat size the fleet is still missing, or −1 when none is. */
function largestMissing(ctx: Ctx): number {
  let max = -1;
  for (let i = 0; i < ctx.b.fleet; i++)
    if (ctx.b.fleetData[i] - ctx.fleetCount[i] !== 0) max = i;
  return max;
}

/** Upstream `boats_solver_max_expand_dsf`. */
function findGrowTooLong(ctx: Ctx): BoatsFiring | null {
  const { b, dsf } = ctx;
  const max = largestMissing(ctx);

  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (b.grid[y * b.w + x] !== EMPTY) continue;

      let count = 1;
      const evidence: { x: number; y: number }[] = [];
      const arm = (nx: number, ny: number): void => {
        if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) return;
        if (b.grid[ny * b.w + nx] !== SHIP_VAGUE) return;
        count += dsf.size(ny * b.w + nx);
        const root = dsf.canonify(ny * b.w + nx);
        for (let i = 0; i < b.w * b.h; i++)
          if (isShip(b.grid[i]) && dsf.canonify(i) === root)
            evidence.push({ x: i % b.w, y: Math.floor(i / b.w) });
      };
      arm(x - 1, y);
      arm(x + 1, y);
      arm(x, y - 1);
      arm(x, y + 1);

      if (count <= max + 1) continue;
      const f = firing(
        ctx,
        { kind: "growTooLong", joined: count, largest: max + 1 },
        [{ x, y, ship: false }],
        evidence,
      );
      if (f) return f;
    }
  }
  return null;
}

/** Every cell of the unfinished boat whose dsf root is `root`. */
function boatCells(b: BoatsBoard, dsf: Dsf, root: number) {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < b.w * b.h; i++)
    if (isShip(b.grid[i]) && dsf.canonify(i) === root)
      out.push({ x: i % b.w, y: Math.floor(i / b.w) });
  return out;
}

/**
 * Upstream `boats_solver_min_expand_dsf`: an unfinished boat whose end cap
 * points one way must grow the other, once every boat of its current length is
 * accounted for.
 */
function findMustGrow(ctx: Ctx): BoatsFiring | null {
  const { b, dsf, fleetCount } = ctx;
  const end = dsf.canonify(b.w * b.h);

  const forward = (sx: number, sy: number, d: number, ship: number) => {
    for (let y = sy; y < b.h; y++) {
      for (let x = sx; x < b.w; x++) {
        const i1 = y * b.w + x;
        const i2 = i1 - d;
        if (b.grid[i1] !== EMPTY || dsf.canonify(i2) === end) continue;
        // The canonical index is read as an *element* — see `checkDsf`.
        if (b.grid[dsf.canonify(i2)] !== ship) continue;
        const length = dsf.size(i2);
        if (length - 1 < 1 || length - 1 >= b.fleet) continue;
        if (b.fleetData[length - 1] !== fleetCount[length - 1]) continue;
        return firing(
          ctx,
          { kind: "mustGrow", length },
          [{ x, y, ship: true }],
          boatCells(b, dsf, dsf.canonify(i2)),
        );
      }
    }
    return null;
  };

  const back = (d: number, ship: number) => {
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const i1 = y * b.w + x;
        if (b.grid[i1] !== ship) continue;
        const c1 = dsf.canonify(i1);
        if (c1 === end) continue;
        const length = dsf.size(i1);
        if (length - 1 < 1 || length - 1 >= b.fleet) continue;
        if (b.fleetData[length - 1] !== fleetCount[length - 1]) continue;
        const i2 = c1 - d;
        return firing(
          ctx,
          { kind: "mustGrow", length },
          [{ x: i2 % b.w, y: Math.floor(i2 / b.w), ship: true }],
          boatCells(b, dsf, c1),
        );
      }
    }
    return null;
  };

  return (
    forward(0, 1, b.w, SHIP_TOP) ??
    forward(1, 0, 1, SHIP_LEFT) ??
    back(b.w, SHIP_BOTTOM) ??
    back(1, SHIP_RIGHT)
  );
}

const runCells = (run: BoatsRun) => {
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < run.len; k++)
    out.push(
      run.horizontal
        ? { x: run.start + k, y: run.row }
        : { x: run.row, y: run.start + k },
    );
  return out;
};

/** Upstream `boats_solver_split_runs`. */
function findRunTooShort(ctx: Ctx, runs: BoatsRun[]): BoatsFiring | null {
  const { b, fleetCount } = ctx;
  for (const run of runs) {
    const len = run.len;
    if (len < 2 || len > b.fleet) continue;
    if (len - run.ships !== 1) continue;
    if (b.fleetData[len - 1] !== fleetCount[len - 1]) continue;

    const f = firing(
      ctx,
      { kind: "runTooShort", length: len },
      runCells(run).map((c) => ({ ...c, ship: false })),
      runCells(run),
    );
    if (f) return f;
  }
  return null;
}

/**
 * Upstream `boats_solver_find_max_fleet`: when the runs that can still take the
 * largest missing boat are exactly as many as there are such boats, every one
 * is used — so the squares common to *every* placement within a run are ships.
 */
function findOnlyRunsLeft(
  ctx: Ctx,
  runs: BoatsRun[],
  simple: boolean,
): BoatsFiring | null {
  const { b, shipCounts, fleetCount } = ctx;
  const max = largestMissing(ctx);
  if (max === -1) return null;

  let bc = b.fleetData[max] - fleetCount[max];
  if (bc < 1) return null;
  if (simple && bc > 1) return null;

  const idx: number[] = [];
  let r = 0;
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].ships === runs[i].len) continue; // already full
    if (runs[i].len < max + 1) continue; // too small

    const j = runs[i].row + (runs[i].horizontal ? b.w : 0);
    if (
      b.borderClues[j] !== NO_CLUE &&
      b.borderClues[j] - (shipCounts[j] - runs[i].ships) < max + 1
    )
      continue; // the line's number cannot take the boat

    // A run with room for two of them tells us nothing.
    if (runs[i].len >= (max + 1) * 2 + 1) bc = -1;
    if (r < bc) idx.push(i);
    r++;
  }
  if (r !== bc) return null;

  for (const i of idx) {
    const run = runs[i];
    if (simple && run.len > max + 1) continue;

    const start = run.start + run.len - (max + 1);
    const end = run.start + (max + 1);
    if (end <= start) continue;

    const forced: BoatsSquare[] = [];
    for (let k = start; k < end; k++)
      forced.push(
        run.horizontal
          ? { x: k, y: run.row, ship: true }
          : { x: run.row, y: k, ship: true },
      );
    // A run whose overlap is a single square also pins the two squares
    // perpendicular to it: the boat runs along the line, so it cannot turn.
    if (end - start === 1) {
      const k = start;
      forced.push(
        run.horizontal
          ? { x: k, y: run.row - 1, ship: false }
          : { x: run.row - 1, y: k, ship: false },
        run.horizontal
          ? { x: k, y: run.row + 1, ship: false }
          : { x: run.row + 1, y: k, ship: false },
      );
    }

    const f = firing(
      ctx,
      { kind: "onlyRunsLeft", size: max + 1, missing: idx.length, runs: r },
      forced,
      idx.flatMap((n) => runCells(runs[n])),
    );
    if (f) return f;
  }
  return null;
}

// --- Tricky tier ------------------------------------------------------------

/** Upstream `boats_solver_shared_diagonals`. */
function findSharedDiagonal(ctx: Ctx): BoatsFiring | null {
  const { b, blankCounts, shipCounts } = ctx;

  for (const horizontal of [true, false]) {
    const n = horizontal ? b.h : b.w;
    const span = horizontal ? b.w : b.h;
    for (let i = 0; i < n; i++) {
      const slot = horizontal ? i + b.w : i;
      if (b.borderClues[slot] === NO_CLUE) continue;
      const target = span - (b.borderClues[slot] + blankCounts[slot]);
      if (target !== 1 && target !== 2) continue;

      for (let k = 0; k < span; k++) {
        const cellAt = (kk: number) => (horizontal ? { x: kk, y: i } : { x: i, y: kk });
        const at = (kk: number) => {
          const c = cellAt(kk);
          return b.grid[c.y * b.w + c.x];
        };
        const crossSlot = horizontal ? k : k + b.w;

        const front = k > 0 && at(k - 1) === EMPTY ? 1 : 0;
        const centre =
          at(k) === EMPTY && b.borderClues[crossSlot] - shipCounts[crossSlot] === 1
            ? 1
            : 0;
        const back = k < span - 1 && at(k + 1) === EMPTY ? 1 : 0;
        if (front + centre + back <= target) continue;

        const here = cellAt(k);
        const forced: BoatsSquare[] = horizontal
          ? [
              { x: here.x, y: here.y - 1, ship: false },
              { x: here.x, y: here.y + 1, ship: false },
            ]
          : [
              { x: here.x - 1, y: here.y, ship: false },
              { x: here.x + 1, y: here.y, ship: false },
            ];

        const evidence = [cellAt(k)];
        if (front) evidence.push(cellAt(k - 1));
        if (back) evidence.push(cellAt(k + 1));

        const f = firing(
          ctx,
          { kind: "sharedDiagonal", line: lineOf(ctx, horizontal, i), room: target },
          forced,
          evidence,
        );
        if (f) return f;
      }
    }
  }
  return null;
}

/**
 * Upstream `boats_solver_borderclues_fill` + `_last`, applied as bookkeeping
 * rather than as a firing: recovering a hidden occupancy number is not a move
 * the player can make. Each number recovered is recorded in `ctx.deduced`, so a
 * narration that later cites it says where it came from instead of quoting a
 * number the board does not show.
 */
function recoverHiddenNumbers(ctx: Ctx): void {
  const { b, blankCounts, shipCounts } = ctx;
  let found = false;

  for (let i = 0; i < b.w + b.h; i++) {
    if (b.borderClues[i] !== NO_CLUE) continue;
    found = true;
    const span = i < b.w ? b.h : b.w;
    if (shipCounts[i] + blankCounts[i] === span) {
      b.borderClues[i] = shipCounts[i];
      ctx.deduced[i] = true;
    }
  }
  ctx.hasNoClue = found;

  const before = Int32Array.from(b.borderClues);
  if (borderCluesLast(b))
    for (let i = 0; i < b.w + b.h; i++)
      if (before[i] === NO_CLUE && b.borderClues[i] !== NO_CLUE) ctx.deduced[i] = true;
}

// --- Hard tier: single-square refutation ------------------------------------

/**
 * Classify *why* a trial board is contradictory by re-running the validation
 * family with its own error arrays and reading the flags back — the Bricks
 * pattern (hint-authoring §5.6a′). A fixed priority picks the clearest reason
 * when several fire at once.
 *
 * **Total by construction, and that is the whole difficulty.** `validateFullState`
 * says INVALID through paths that flag *nothing*: `checkFleet` marks cells only
 * for a boat the fleet has no room for at all, never for the second copy of a
 * size it holds one of, and `adjustShips`' ship-total check marks nothing ever.
 * A classifier that returned "no reason" for those would make the caller skip a
 * perfectly good refutation — which is exactly how the Hard tier first shipped
 * producing zero firings. Every branch below therefore ends in a reason, with
 * `unfinishable` as the honest catch-all rather than an invented cause.
 */
function classifyBreach(
  ctx: Ctx,
  trial: BoatsBoard,
): { breach: BoatsBreach; cells: { x: number; y: number }[] } {
  const { w, h } = trial;
  const cellErrs = new Int32Array(w * h);
  const lineErrs = new Int32Array(w + h);

  const countStatus = countShips(trial, undefined, undefined, lineErrs);
  const collided = checkCollision(trial, cellErrs);
  const fleetStatus = checkFleet(trial, undefined, cellErrs);
  validateGridClues(trial, cellErrs);

  const cellsAt = (pred: (i: number) => boolean) => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < w * h; i++)
      if (pred(i)) out.push({ x: i % w, y: Math.floor(i / w) });
    return out;
  };
  const flagged = (mask: number) => cellsAt((i) => (cellErrs[i] & mask) !== 0);

  // A `CORRUPT` square is `placeWater` having been asked to water a ship (or
  // vice versa) — in a trial that only ever happens through the never-touch
  // water a placement lays down, i.e. two boats touching.
  const corrupt = cellsAt((i) => trial.grid[i] === CORRUPT);
  if (collided || corrupt.length > 0) {
    // The collision flag sits on the top-left cell of the offending 2×2; show
    // all four, so the player sees the corner rather than one lone square.
    const cells = [...corrupt];
    for (const c of flagged(FE_COLLISION))
      cells.push(
        c,
        { x: c.x + 1, y: c.y },
        { x: c.x, y: c.y + 1 },
        { x: c.x + 1, y: c.y + 1 },
      );
    return { breach: { kind: "collision" }, cells };
  }

  if (countStatus === STATUS_INVALID) {
    for (let i = 0; i < w + h; i++) {
      if (lineErrs[i] !== STATUS_INVALID) continue;
      const horizontal = i >= w;
      const index = horizontal ? i - w : i;
      return {
        breach: { kind: "count", line: lineOf(ctx, horizontal, index) },
        cells: lineCells(trial, horizontal, index),
      };
    }
  }

  const fleetCells = flagged(FE_FLEET);
  if (fleetCells.length > 0) return { breach: { kind: "fleet" }, cells: fleetCells };

  const clueCells = flagged(FE_MISMATCH);
  if (clueCells.length > 0) return { breach: { kind: "clue" }, cells: clueCells };

  // The two unflagged paths. `adjustShips`' own verdict: too many ship squares
  // for the fleet, or too few squares left undecided to fit it.
  const maxShips = fleetShipCount(trial);
  let ships = 0;
  let water = 0;
  for (let i = 0; i < w * h; i++) {
    if (isShip(trial.grid[i])) ships++;
    else if (trial.grid[i] === WATER) water++;
  }
  if (ships > maxShips || w * h - water < maxShips)
    return {
      breach: { kind: "fleetTotal", tooMany: ships > maxShips },
      cells: cellsAt((i) => isShip(trial.grid[i])),
    };

  // …and `checkFleet` reporting one size over-placed without flagging it.
  if (fleetStatus === STATUS_INVALID)
    return { breach: { kind: "fleet" }, cells: cellsAt((i) => isShip(trial.grid[i])) };

  return { breach: { kind: "unfinishable" }, cells: [] };
}

/**
 * The Hard tier, as one finder over upstream's three `attempt*` techniques:
 * set a single square to one value, complete whatever that forces, and keep the
 * *opposite* value when the trial is immediately contradictory. Refutation, not
 * search — nothing is kept unless its negation is provably impossible.
 */
function findRefuted(ctx: Ctx): BoatsFiring | null {
  const { b, blankCounts, shipCounts } = ctx;

  const needsOne = (slot: number, span: number, water: boolean): boolean =>
    b.borderClues[slot] !== NO_CLUE &&
    (water
      ? span - (b.borderClues[slot] + blankCounts[slot]) === 1
      : b.borderClues[slot] - shipCounts[slot] === 1);

  // `trialShip` false ⇒ try the square as water (upstream `attempt_ship_rows`,
  // which concludes the square is a *ship*), and vice versa.
  for (const trialShip of [false, true]) {
    for (const horizontal of [true, false]) {
      const n = horizontal ? b.h : b.w;
      const span = horizontal ? b.w : b.h;
      const cross = horizontal ? b.h : b.w;

      for (let i = 0; i < n; i++) {
        const slot = horizontal ? i + b.w : i;
        if (!needsOne(slot, span, !trialShip)) continue;

        for (let k = 0; k < span; k++) {
          const x = horizontal ? k : i;
          const y = horizontal ? i : k;
          if (b.grid[y * b.w + x] !== EMPTY) continue;

          const trial = cloneBoard(b);
          if (trialShip) placeShip(trial, x, y);
          else placeWater(trial, x, y);
          // Completing the line is what makes the trial decidable: the line
          // needed exactly one more of the opposite kind, so fixing this square
          // settles every other square in it.
          const fill = trialShip ? WATER : SHIP_VAGUE;
          if (horizontal) fillRow(trial, 0, i, b.w - 1, i, fill);
          else fillRow(trial, i, 0, i, b.h - 1, fill);
          // …and the crossing line too, when it is in the same position.
          const crossSlot = horizontal ? k : k + b.w;
          if (needsOne(crossSlot, cross, !trialShip)) {
            if (horizontal) fillRow(trial, k, 0, k, b.h - 1, fill);
            else fillRow(trial, 0, k, b.w - 1, k, fill);
          }

          if (validateFullState(trial) !== STATUS_INVALID) continue;

          const found = classifyBreach(ctx, trial);

          // Honesty about locality (hint-authoring §5.6): a refutation can
          // break three rows away, and ringing a distant cause as though it
          // were adjacent misleads.
          const local = found.cells.some(
            (c) => Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1,
          );
          const f = firing(
            ctx,
            { kind: "refuted", trialShip, breach: found.breach, local },
            [{ x, y, ship: !trialShip }],
            found.cells,
          );
          if (f) return f;
        }
      }
    }
  }

  // Upstream `boats_solver_centers_attempt`: an orientation of a centre clue
  // that immediately contradicts the board rules itself out.
  for (let x = 0; x < b.w; x++) {
    for (let y = 0; y < b.h; y++) {
      if (!unsettledCentre(b, x, y)) continue;

      for (const vertical of [false, true]) {
        const trial = cloneBoard(b);
        if (vertical) {
          placeShip(trial, x, y - 1);
          placeShip(trial, x, y + 1);
        } else {
          placeShip(trial, x - 1, y);
          placeShip(trial, x + 1, y);
        }
        if (validateFullState(trial) !== STATUS_INVALID) continue;

        const found = classifyBreach(ctx, trial);

        const forced: BoatsSquare = vertical
          ? { x, y: y + 1, ship: false }
          : { x: x + 1, y, ship: false };
        const local = found.cells.some(
          (c) => Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1,
        );
        const f = firing(
          ctx,
          { kind: "refuted", trialShip: true, breach: found.breach, local },
          [forced],
          [{ x, y }, ...found.cells],
        );
        if (f) return f;
      }
    }
  }

  return null;
}

// --- the firing order -------------------------------------------------------

/**
 * The next firing, **goal-first** (hint-authoring §2.10): within each tier the
 * placements — the moves that build the fleet — run before the rule-outs, and a
 * cheaper tier always runs before a dearer one, so an Easy board is taught the
 * Easy technique that suffices rather than a Hard refutation that reaches the
 * same square. This deliberately reorders `solveBoats`' internal rungs; the
 * hint only needs each firing to be *forced*, not to match the solver's order.
 */
function nextBoatsFiring(ctx: Ctx): BoatsFiring | null {
  const { b, maxDiff } = ctx;

  // Easy.
  const easy =
    findGivenClue(ctx) ??
    findNeverTouch(ctx) ??
    findLineCount(ctx, true) ??
    (ctx.hasNoClue ? findAllWaterPlaced(ctx) : null) ??
    findCentreForced(ctx) ??
    findSingles(ctx, true) ??
    findLineCount(ctx, false) ??
    findSingles(ctx, false);
  if (easy) return easy;
  if (maxDiff < DIFF_NORMAL) return null;

  // Normal. The dsf is a *tool* here, so populate it before the two expand
  // techniques read it (its status verdict is deliberately discarded — see the
  // module header).
  checkDsf(b, ctx.dsf, ctx.fleetCount);
  const runs = collectRuns(b);
  const normal =
    findOnlyRunsLeft(ctx, runs, true) ??
    findCentreCount(ctx) ??
    findGrowTooLong(ctx) ??
    findRunTooShort(ctx, runs) ??
    // Last in the rung deliberately: `mustGrow` is a **safety net, not a
    // preferred technique**. Measured over 200 generated boards spanning every
    // preset and both "remove numbers" settings it never fires — its position
    // (an unfinished boat with a resolved end cap, every boat of that length
    // already found) is reliably reached first by a cheaper rung, most often
    // `allWaterPlaced`, whose precondition it very nearly implies. It stays in
    // because dropping it could strand a board none of that sample covered, and
    // because a technique that only fires when nothing else can is exactly what
    // belongs at the bottom of a rung.
    findMustGrow(ctx);
  if (normal) return normal;
  if (maxDiff < DIFF_TRICKY) return null;

  // Tricky.
  if (ctx.hasNoClue) recoverHiddenNumbers(ctx);
  const tricky = findOnlyRunsLeft(ctx, runs, false) ?? findSharedDiagonal(ctx);
  if (tricky) return tricky;
  if (maxDiff < DIFF_HARD) return null;

  // Hard.
  return findRefuted(ctx);
}

// --- the plan ---------------------------------------------------------------

export interface BoatsPlan {
  /** The board's status when deduction stopped. */
  status: number;
  firings: BoatsFiring[];
  /** The difficulty cap the plan was replayed at (design D2). */
  diff: number;
}

/**
 * The lowest difficulty cap at which this puzzle actually solves.
 *
 * The `boats` spec records that the solver is **not monotone in its cap**, so
 * "just replay at the maximum" is wrong twice over: it would inherit the
 * false-contradiction abort that strands most Easy boards, and it would teach a
 * Hard refutation on a board whose own difficulty admits a one-line count.
 * Derived from the puzzle's clues alone, so it does not move as the player
 * plays — a hint plan must be recompute-stable, not merely correct (§6.3).
 */
function lowestSolvingDiff(state: BoatsState): number {
  for (let maxDiff = DIFF_EASY; maxDiff < DIFFCOUNT; maxDiff++) {
    const attempt = boardOf(state);
    attempt.grid.fill(EMPTY);
    if (solveBoats(attempt, maxDiff).kind === "solved") return maxDiff;
  }
  return DIFF_HARD;
}

function planAt(state: BoatsState, maxDiff: number): BoatsPlan {
  const b = boardOf(state);
  const ctx: Ctx = {
    b,
    maxDiff,
    blankCounts: new Int32Array(b.w + b.h),
    shipCounts: new Int32Array(b.w + b.h),
    fleetCount: new Int32Array(b.fleet),
    dsf: new Dsf(b.w * b.h + 1),
    deduced: new Array(b.w + b.h).fill(false),
    hasNoClue: b.borderClues.some((c) => c === NO_CLUE),
  };

  const { status, plan } = deduceHintPlan<Ctx, BoatsFiring, number>({
    board: ctx,
    // Also refills the tallies every technique reads (Subsets' shape).
    status: boardStatus,
    incomplete: STATUS_INCOMPLETE,
    next: nextBoatsFiring,
    apply: (c, f) => applyBoatsFiring(c.b, f),
    planCap: HINT_PLAN_MAX,
    budget: stepBudget("boats hint"),
  });

  return { status, firings: plan, diff: maxDiff };
}

/**
 * Replay the deduction from the player's board, one firing at a time.
 *
 * Starts at the puzzle's own difficulty and escalates only if that tier has
 * nothing left to say — so the plan teaches the simplest technique that works,
 * while a board the player has walked into a harder corner still gets advice.
 */
export function deduceBoatsPlan(state: BoatsState): BoatsPlan {
  const lowest = lowestSolvingDiff(state);
  let last = planAt(state, lowest);
  for (let d = lowest + 1; d < DIFFCOUNT && last.firings.length === 0; d++)
    last = planAt(state, d);
  return last;
}
