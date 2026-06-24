/**
 * Undead generator — port of `new_game_desc` (+ `get_unique` / `count_monsters`)
 * from `undead.c`.
 *
 * Fill the grid with random mirrors and monster cells; reject grids that are too
 * sparse/dense or have an over-long sightline; trace the paths; seed
 * unique-solution sightlines (`getUnique`) until a difficulty-dependent fraction
 * of the grid is determined; fill the rest with random monsters; compute the
 * sighting clues from that solution; then grade with the iterative + brute-force
 * solver and accept only at the requested difficulty (regenerate otherwise).
 *
 * Ported faithfully over `random.ts` (deterministic in TS) but, unlike the other
 * solver/codec ports, *not* byte-match-gated: generation orders equal-length
 * paths with `qsort`, whose tie-break is implementation-defined (design D1). A
 * stable sort is used here; the differential validates the solver/codec instead.
 */

import { randomUpto, type RandomState } from "../../random/index.ts";
import { gradeUndead, nextList } from "./solver.ts";
import {
  CELL_EMPTY,
  CELL_GHOST,
  CELL_MIRROR_L,
  CELL_MIRROR_R,
  CELL_VAMPIRE,
  CELL_ZOMBIE,
  DIFF_EASY,
  DIFF_NORMAL,
  DIFF_TRICKY,
  diffToLevel,
  makePaths,
  MON_GHOST,
  MON_NONE,
  MON_VAMPIRE,
  MON_ZOMBIE,
  newCommon,
  range2grid,
  sortPaths,
  type UndeadCommon,
  type UndeadParams,
} from "./state.ts";

/** Backstop against a porting slip turning the (capped, upstream) regenerate
 * loop into a hang; a faithful port converges quickly. */
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

function lowestBit(v: number): number {
  return v & 1 ? 1 : v & 2 ? 2 : 4;
}

/**
 * Force one path's cells to a monster assignment that yields a *uniquely*
 * achievable (start, end) sighting pair, chosen at random (upstream
 * `get_unique`). Mutates `guess` for the cells on path `counter`.
 */
function getUnique(common: UndeadCommon, guess: Uint8Array, counter: number, rs: RandomState): void {
  const path = common.paths[counter];
  const len = path.numMonsters;
  if (len <= 0) return;

  const pgGuess = new Int32Array(len);
  const pgPossible = new Int32Array(len);
  for (let p = 0; p < len; p++) {
    pgPossible[p] = guess[path.mapping[p]];
    pgGuess[p] = lowestBit(pgPossible[p]);
  }

  const pathlimit = path.length + 1;
  // For each distinct (start_view, end_view) pair: how many assignments hit it,
  // and the first assignment that did (Map keeps insertion order).
  const counts = new Map<number, number>();
  const firstGuess = new Map<number, Int32Array>();

  // Resolve a step's monster index to its position in the path_guess vector.
  const posOf = (m: number): number => {
    for (let i = 0; i < len; i++) if (path.mapping[i] === m) return i;
    return -1;
  };

  while (true) {
    let mirror = false;
    let startView = 0;
    for (let p = 0; p < path.length; p++) {
      if (path.p[p] === -1) {
        mirror = true;
      } else {
        const i = posOf(path.p[p]);
        if (i >= 0) {
          if (pgGuess[i] === 1 && mirror) startView++;
          if (pgGuess[i] === 2 && !mirror) startView++;
          if (pgGuess[i] === 4) startView++;
        }
      }
    }
    mirror = false;
    let endView = 0;
    for (let p = path.length - 1; p >= 0; p--) {
      if (path.p[p] === -1) {
        mirror = true;
      } else {
        const i = posOf(path.p[p]);
        if (i >= 0) {
          if (pgGuess[i] === 1 && mirror) endView++;
          if (pgGuess[i] === 2 && !mirror) endView++;
          if (pgGuess[i] === 4) endView++;
        }
      }
    }

    const key = startView * pathlimit + endView;
    const c = (counts.get(key) ?? 0) + 1;
    counts.set(key, c);
    if (c === 1) firstGuess.set(key, pgGuess.slice());

    if (!nextList(pgGuess, pgPossible, len - 1)) break;
  }

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
  const W = params.w;
  const H = params.h;
  const stride = W + 2;
  const diff = diffToLevel(params.diff);

  for (let attempt = 0; attempt < MAX_REGENERATE; attempt++) {
    const common = newCommon(params);
    const grid = common.grid;
    const xinfo = common.xinfo;

    // Fill the grid with random mirrors and (empty) monster cells.
    let count = 0;
    for (let h = 1; h < H + 1; h++) {
      for (let w = 1; w < W + 1; w++) {
        const c = randomUpto(rng, 5);
        const cell = w + h * stride;
        if (c >= 2) {
          grid[cell] = CELL_EMPTY;
          xinfo[cell] = count++;
        } else if (c === 0) {
          grid[cell] = CELL_MIRROR_L;
          xinfo[cell] = -1;
        } else {
          grid[cell] = CELL_MIRROR_R;
          xinfo[cell] = -1;
        }
      }
    }
    common.numTotal = count;

    if (common.numTotal <= 4) continue;
    const ratio = common.numTotal / (W * H);
    if (ratio < 0.48 || ratio > 0.78) continue;

    // Assign (temporary) clue identifiers to the border cells.
    for (let r = 0; r < 2 * (W + H); r++) {
      const g = range2grid(r, W, H);
      grid[g.x + g.y * stride] = g.dir;
      xinfo[g.x + g.y * stride] = 0;
    }
    // The four corners are irrelevant.
    for (const cell of [0, W + 1, W + 1 + (H + 1) * stride, (H + 1) * stride]) {
      grid[cell] = 0;
      xinfo[cell] = 0;
    }

    const guess = new Uint8Array(common.numTotal).fill(MON_NONE);
    common.fixed = new Uint8Array(common.numTotal);

    makePaths(common);

    // Reject grids with an over-long sightline.
    let maxLength: number;
    if (diff === DIFF_EASY) maxLength = Math.min(W, H) + 1;
    else if (diff === DIFF_NORMAL) maxLength = Math.floor((Math.max(W, H) * 3) / 2);
    else maxLength = 9;
    let abort = false;
    for (const path of common.paths) if (path.numMonsters > maxLength) abort = true;
    if (abort) continue;

    sortPaths(common);

    // How much of the grid to fix with unique-solution paths.
    let filling: number;
    if (diff === DIFF_EASY) filling = 2;
    else if (diff === DIFF_NORMAL) filling = Math.min(W + H, Math.floor(common.numTotal / 2));
    else filling = Math.max(W + H, Math.floor(common.numTotal / 2));

    let idx = 0;
    while (countMonsters(common, guess).none > filling) {
      if (idx >= common.numPaths) break;
      if (common.paths[idx].numMonsters === 0) {
        idx++;
        continue;
      }
      getUnique(common, guess, idx, rng);
      idx++;
    }

    // Fill remaining undecided cells with random monsters.
    for (let g = 0; g < common.numTotal; g++) {
      if (guess[g] === MON_NONE) {
        const r = randomUpto(rng, 3);
        guess[g] = r === 0 ? MON_GHOST : r === 1 ? MON_VAMPIRE : MON_ZOMBIE;
      }
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

    // Bake the solution monster types into the grid (vestigial for the desc, but
    // faithful to upstream).
    for (let w = 1; w < W + 1; w++) {
      for (let h = 1; h < H + 1; h++) {
        const cell = w + h * stride;
        const c = xinfo[cell];
        if (c >= 0) {
          if (guess[c] === MON_GHOST) grid[cell] = CELL_GHOST;
          else if (guess[c] === MON_VAMPIRE) grid[cell] = CELL_VAMPIRE;
          else if (guess[c] === MON_ZOMBIE) grid[cell] = CELL_ZOMBIE;
        }
      }
    }

    // Compute each path's sightings from the solution and write them into the
    // border cells.
    for (const path of common.paths) {
      let mirror = false;
      let s = 0;
      for (let g = 0; g < path.length; g++) {
        const m = path.p[g];
        if (m === -1) mirror = true;
        else if (guess[m] === MON_GHOST && mirror) s++;
        else if (guess[m] === MON_VAMPIRE && !mirror) s++;
        else if (guess[m] === MON_ZOMBIE) s++;
      }
      path.sightingsStart = s;

      mirror = false;
      s = 0;
      for (let g = path.length - 1; g >= 0; g--) {
        const m = path.p[g];
        if (m === -1) mirror = true;
        else if (guess[m] === MON_GHOST && mirror) s++;
        else if (guess[m] === MON_VAMPIRE && !mirror) s++;
        else if (guess[m] === MON_ZOMBIE) s++;
      }
      path.sightingsEnd = s;

      const a = range2grid(path.gridStart, W, H);
      grid[a.x + a.y * stride] = path.sightingsStart;
      const b = range2grid(path.gridEnd, W, H);
      grid[b.x + b.y * stride] = path.sightingsEnd;
    }

    // Snapshot the solution for `aux` before the grading reset.
    const aux = `S${Array.from(guess, (g) => (g === MON_GHOST ? "G" : g === MON_VAMPIRE ? "V" : "Z")).join("")}`;

    // Grade by re-solving from scratch.
    const allUndecided = new Uint8Array(common.numTotal).fill(MON_NONE);
    const grade = gradeUndead(common, allUndecided, diff !== DIFF_EASY);

    let accept = false;
    if (
      diff === DIFF_EASY &&
      grade.iterativeSolved &&
      grade.iterativeDepth <= 3 &&
      !grade.inconsistent
    )
      accept = true;
    else if (
      diff === DIFF_NORMAL &&
      ((grade.iterativeSolved && grade.iterativeDepth > 3) ||
        (grade.bruteforceSolved && grade.ambiguous < 4)) &&
      !grade.inconsistent
    )
      accept = true;
    else if (
      diff === DIFF_TRICKY &&
      grade.bruteforceSolved &&
      grade.iterativeDepth > 0 &&
      grade.ambiguous >= 4 &&
      !grade.inconsistent
    )
      accept = true;

    if (!accept) continue;

    return { desc: encodeDesc(common), aux };
  }
  throw new Error(`undead: failed to generate a ${params.w}x${params.h} board`);
}

/** Encode the accepted board to a desc (totals + run-length grid + sightings). */
function encodeDesc(common: UndeadCommon): string {
  const W = common.w;
  const H = common.h;
  const stride = W + 2;
  const grid = common.grid;

  let desc = `${common.numGhosts},${common.numVampires},${common.numZombies},`;

  // Grid: monster cells run-length encoded, mirrors as L/R.
  let count = 0;
  const flushRun = (): string => (count > 0 ? String.fromCharCode(count - 1 + 97) : "");
  let body = "";
  for (let y = 1; y < H + 1; y++) {
    for (let x = 1; x < W + 1; x++) {
      const c = grid[x + y * stride];
      if (count > 25) {
        body += "z";
        count -= 26;
      }
      if (c !== CELL_MIRROR_L && c !== CELL_MIRROR_R) {
        count++;
      } else if (c === CELL_MIRROR_L) {
        body += flushRun();
        body += "L";
        count = 0;
      } else {
        body += flushRun();
        body += "R";
        count = 0;
      }
    }
  }
  body += flushRun();
  desc += body;

  // Sightings.
  for (let p = 0; p < 2 * (W + H); p++) {
    const g = range2grid(p, W, H);
    desc += `,${grid[g.x + g.y * stride]}`;
  }

  return desc;
}
