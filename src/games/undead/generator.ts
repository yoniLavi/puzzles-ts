/**
 * Undead generator — port of `new_game_desc` (+ `get_unique` / `count_monsters`)
 * from `undead.c`.
 *
 * Fill the grid with random mirrors and monster cells; reject grids that are too
 * sparse/dense or have an over-long sightline; trace the paths; seed
 * unique-solution sightlines (`getUnique`) until a difficulty-dependent fraction
 * of the grid is determined; fill the rest with random monsters; compute the
 * sighting clues from that solution; then grade by the deductive ladder and
 * accept only at the requested tier (regenerate otherwise).
 *
 * Not byte-matched with upstream: C orders equal-length paths with `qsort`,
 * whose tie order is unspecified, where this port sorts stably. The
 * differential validates the solver and codec instead.
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import {
  type DeductiveResult,
  EASY_MAX_ARC_PASSES,
  isUniquelySolvable,
  lowestBit,
  nextList,
  RUNG_ARC,
  RUNG_COUNTING,
  RUNG_FORCING,
  solveDeductive,
  TIER_RUNG,
} from "./solver.ts";
import {
  CELL_MIRROR_L,
  CELL_MIRROR_R,
  DIFF_EASY,
  DIFF_NORMAL,
  DIFF_TRICKY,
  diffToLevel,
  MON_GHOST,
  MON_NONE,
  MON_VAMPIRE,
  MON_ZOMBIE,
  MONSTERS,
  makePaths,
  newCommon,
  range2grid,
  sortPaths,
  type UndeadCommon,
  type UndeadParams,
  visibleCount,
} from "./state.ts";

/**
 * Does this board's grade match the requested tier? Every tier accepts only a
 * board the ladder solves outright, never by recursion (the re-grade found no
 * unique board the ladder cannot solve, so this turns none away):
 *
 *  - **Easy**   = arc-consistency alone, within {@link EASY_MAX_ARC_PASSES} passes
 *  - **Normal** = arc-consistency beyond the cap, or the exact-counting rung
 *  - **Unreasonable** = the depth-1 forcing rung
 */
function gradeMatchesTier(grade: DeductiveResult, diff: number): boolean {
  if (!grade.solved) return false;
  switch (diff) {
    case DIFF_EASY:
      return grade.rung === RUNG_ARC && grade.arcPasses <= EASY_MAX_ARC_PASSES;
    case DIFF_NORMAL:
      return (
        (grade.rung === RUNG_ARC && grade.arcPasses > EASY_MAX_ARC_PASSES) ||
        grade.rung === RUNG_COUNTING
      );
    case DIFF_TRICKY:
      return grade.rung === RUNG_FORCING;
    default:
      return false;
  }
}

/** Backstop against a regression turning the regenerate loop into a hang;
 * generation converges quickly. */
const MAX_REGENERATE = 5000;

interface CountResult {
  none: number;
  ghosts: number;
  vampires: number;
  zombies: number;
}

function countMonsters(common: UndeadCommon, guess: Uint8Array): CountResult {
  let none = 0;
  let ghosts = 0;
  let vampires = 0;
  let zombies = 0;
  for (let i = 0; i < common.numTotal; i++) {
    if (guess[i] === MON_GHOST) ghosts++;
    else if (guess[i] === MON_VAMPIRE) vampires++;
    else if (guess[i] === MON_ZOMBIE) zombies++;
    else none++;
  }
  return { none, ghosts, vampires, zombies };
}

/**
 * Force one path's cells to a monster assignment that yields a *uniquely*
 * achievable (start, end) sighting pair, chosen at random (upstream
 * `get_unique`). Mutates `guess` for the cells on path `counter`.
 */
function getUnique(
  common: UndeadCommon,
  guess: Uint8Array,
  counter: number,
  rs: RandomState,
): void {
  const path = common.paths[counter];
  const len = path.numMonsters;
  if (len <= 0) return;

  const pgGuess = new Int32Array(len);
  const pgPossible = new Int32Array(len);
  for (let p = 0; p < len; p++) {
    pgPossible[p] = guess[path.mapping[p]];
    pgGuess[p] = lowestBit(pgPossible[p]);
  }

  // For each distinct (start_view, end_view) pair: how many assignments hit it,
  // and the first assignment that did (Map keeps insertion order).
  const counts = new Map<number, number>();
  const firstGuess = new Map<number, Int32Array>();
  const full = new Int32Array(common.numTotal);
  do {
    for (let i = 0; i < len; i++) full[path.mapping[i]] = pgGuess[i];
    const key =
      visibleCount(path, full, false) * (path.length + 1) +
      visibleCount(path, full, true);
    const c = (counts.get(key) ?? 0) + 1;
    counts.set(key, c);
    if (c === 1) firstGuess.set(key, pgGuess.slice());
  } while (nextList(pgGuess, pgPossible, len - 1));

  // The (start, end) pairs achieved by exactly one assignment.
  const singles: Int32Array[] = [];
  for (const [key, c] of counts) {
    if (c === 1) {
      const g = firstGuess.get(key);
      if (g) singles.push(g);
    }
  }

  if (singles.length > 0) {
    const pick = singles[randomUpto(rs, singles.length)];
    for (let i = 0; i < len; i++) guess[path.mapping[i]] = pick[i];
  }
}

export function newUndeadDesc(
  params: UndeadParams,
  rng: RandomState,
): { desc: string; aux: string } {
  const { w, h } = params;
  const stride = w + 2;
  const diff = diffToLevel(params.diff);

  for (let attempt = 0; attempt < MAX_REGENERATE; attempt++) {
    const common = newCommon(params);
    const { grid, xinfo } = common;

    // Fill the grid with random mirrors and (empty) monster cells.
    let count = 0;
    for (let y = 1; y <= h; y++) {
      for (let x = 1; x <= w; x++) {
        const c = randomUpto(rng, 5);
        const cell = x + y * stride;
        if (c >= 2) {
          xinfo[cell] = count++;
        } else {
          grid[cell] = c === 0 ? CELL_MIRROR_L : CELL_MIRROR_R;
          xinfo[cell] = -1;
        }
      }
    }
    common.numTotal = count;

    if (count <= 4) continue;
    const ratio = count / (w * h);
    if (ratio < 0.48 || ratio > 0.78) continue;

    // The border and corner cells stay 0 until the clues are written below.
    const guess = new Uint8Array(count).fill(MON_NONE);
    makePaths(common);

    // Reject grids with an over-long sightline.
    let maxLength: number;
    if (diff === DIFF_EASY) maxLength = Math.min(w, h) + 1;
    else if (diff === DIFF_NORMAL) maxLength = Math.floor((Math.max(w, h) * 3) / 2);
    else maxLength = 9;
    if (common.paths.some((path) => path.numMonsters > maxLength)) continue;

    sortPaths(common);

    // How much of the grid to fix with unique-solution paths.
    let filling: number;
    if (diff === DIFF_EASY) filling = 2;
    else if (diff === DIFF_NORMAL) filling = Math.min(w + h, Math.floor(count / 2));
    else filling = Math.max(w + h, Math.floor(count / 2));

    for (let i = 0; i < common.numPaths; i++) {
      if (countMonsters(common, guess).none <= filling) break;
      getUnique(common, guess, i, rng);
    }

    // Fill remaining undecided cells with random monsters.
    for (let i = 0; i < count; i++) {
      if (guess[i] === MON_NONE) guess[i] = MONSTERS[randomUpto(rng, 3)];
    }

    // Determine the monster totals.
    const totals = countMonsters(common, guess);
    common.numGhosts = totals.ghosts;
    common.numVampires = totals.vampires;
    common.numZombies = totals.zombies;

    // Discard a trivial puzzle (one monster type only).
    if (
      (totals.ghosts === 0 && totals.vampires === 0) ||
      (totals.ghosts === 0 && totals.zombies === 0) ||
      (totals.vampires === 0 && totals.zombies === 0)
    )
      continue;
    if (
      diff === DIFF_TRICKY &&
      (totals.ghosts <= 1 || totals.vampires <= 1 || totals.zombies <= 1)
    )
      continue;

    // Compute each path's sightings from the solution and write them into the
    // border cells.
    for (const path of common.paths) {
      path.sightingsStart = visibleCount(path, guess, false);
      path.sightingsEnd = visibleCount(path, guess, true);
      const a = range2grid(path.gridStart, w, h);
      grid[a.x + a.y * stride] = path.sightingsStart;
      const b = range2grid(path.gridEnd, w, h);
      grid[b.x + b.y * stride] = path.sightingsEnd;
    }

    // The solution, for Solve.
    const aux = `S${Array.from(guess, (g) => (g === MON_GHOST ? "G" : g === MON_VAMPIRE ? "V" : "Z")).join("")}`;

    // Grade by the deductive ladder, capped at the tier's rung (a board the
    // tier can't use is rejected anyway, so Easy and Normal skip forcing), and
    // confirm uniqueness independently against the brute-force oracle.
    const allUndecided = new Uint8Array(count).fill(MON_NONE);
    const grade = solveDeductive(common, allUndecided, TIER_RUNG[diff]);
    if (!gradeMatchesTier(grade, diff) || !isUniquelySolvable(common)) continue;

    return { desc: encodeDesc(common), aux };
  }
  throw new Error(`undead: failed to generate a ${params.w}x${params.h} board`);
}

/** Encode the accepted board to a desc (totals + run-length grid + sightings). */
function encodeDesc(common: UndeadCommon): string {
  const { w, h, grid } = common;
  const stride = w + 2;

  // Grid: runs of monster cells as `a`–`z` (1–26 cells), mirrors as L/R.
  let body = "";
  let run = 0;
  const flushRun = (): string => (run > 0 ? String.fromCharCode(96 + run) : "");
  for (let y = 1; y <= h; y++) {
    for (let x = 1; x <= w; x++) {
      const c = grid[x + y * stride];
      if (run > 25) {
        body += "z";
        run -= 26;
      }
      if (c === CELL_MIRROR_L || c === CELL_MIRROR_R) {
        body += flushRun() + (c === CELL_MIRROR_L ? "L" : "R");
        run = 0;
      } else {
        run++;
      }
    }
  }
  body += flushRun();

  let desc = `${common.numGhosts},${common.numVampires},${common.numZombies},${body}`;
  for (let p = 0; p < 2 * (w + h); p++) {
    const g = range2grid(p, w, h);
    desc += `,${grid[g.x + g.y * stride]}`;
  }
  return desc;
}
