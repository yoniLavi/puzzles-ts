/**
 * Mine-layout generator (`minegen` + `mineperturb`, mines.c:1447/1863), which
 * drives {@link minesolve} to guarantee a `unique` board is deducible without
 * guessing — the mechanism behind this fork's guess-free policy for every
 * preset (design D5).
 *
 * Byte-match-critical (design D6): the sort is the total-order `squarecmp`
 * (type / random / y / x), and several quirks are ported *verbatim* or the
 * layouts diverge from the C for a given seed —
 *   1. the two burned `random_upto` draws in the interactive desc path (D6.1),
 *      handled in `index.ts`;
 *   2. the double-increment livelock guard here (D6.2);
 *   3. `ss_overlap`'s scan order feeding the perturb target (D6.3), in
 *      `solver.ts`;
 *   4. the never-updated `prevret` in the solve-and-perturb loop (below).
 */

import { retryLimit } from "../../engine/retry-limit.ts";
import { type RandomState, randomBits, randomUpto } from "../../random/index.ts";
import { minesolve, type OpenCb, type Perturbation, type PerturbCb } from "./solver.ts";
import { encodeLayoutHex, type MinesParams } from "./state.ts";

/** Solve/perturb rounds allowed within one layout attempt. Each round perturbs
 * and re-solves, and only a solve (0) or an unsolvable verdict (-1) ends it, so
 * a layout that does neither would spin for ever. */
const MAX_SOLVE_ROUNDS = 10_000;

/** Mutable generation context (upstream `struct minectx`, mines.c:1364). The
 * `grid` here is the *real* mine bitmap; `opened` tracks squares the solver has
 * opened, for the livelock guard. */
interface MineCtx {
  grid: Int8Array; // 1 = mine
  opened: Int8Array; // 1 = opened by the solver
  w: number;
  h: number;
  sx: number;
  sy: number;
  allowBigPerturbs: boolean;
  nperturbsSinceLastNewOpen: number;
  rs: RandomState;
}

/** Open a square: mine-count of its neighbours, or -1 for *bang* (upstream
 * `mineopen`, mines.c:1373). */
function mineopen(ctx: MineCtx, x: number, y: number): number {
  if (ctx.grid[y * ctx.w + x]) return -1; // *bang*
  if (!ctx.opened[y * ctx.w + x]) {
    ctx.opened[y * ctx.w + x] = 1;
    ctx.nperturbsSinceLastNewOpen = 0;
  }
  let n = 0;
  for (let i = -1; i <= 1; i++) {
    if (x + i < 0 || x + i >= ctx.w) continue;
    for (let j = -1; j <= 1; j++) {
      if (y + j < 0 || y + j >= ctx.h) continue;
      if (i === 0 && j === 0) continue;
      if (ctx.grid[(y + j) * ctx.w + (x + i)]) n++;
    }
  }
  return n;
}

interface Square {
  x: number;
  y: number;
  type: number;
  random: number;
}

/** `(type, random, y, x)` total order (upstream `squarecmp`, mines.c:1408) — a
 * genuine total order, which is why the perturb candidate list is deterministic
 * and a byte-match differential is achievable (design D6). */
function squarecmp(a: Square, b: Square): number {
  if (a.type !== b.type) return a.type - b.type;
  if (a.random !== b.random) return a.random - b.random;
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}

/**
 * Nudge the board to make it easier: fill or empty the set (setx, sety, mask),
 * swapping mines with squares outside it to keep the total constant (upstream
 * `mineperturb`, mines.c:1447). `mask === 0` means "the whole unreachable
 * area", only allowed once `allowBigPerturbs`. Returns the list of changes, or
 * `null` to give up.
 */
function mineperturb(
  ctx: MineCtx,
  grid: Int8Array,
  setx: number,
  sety: number,
  mask: number,
): Perturbation[] | null {
  if (!mask && !ctx.allowBigPerturbs) return null;

  // Livelock guard, ported VERBATIM including the double increment (design
  // D6.2): the counter increments twice when the first test fails. It is
  // almost certainly an upstream typo — we keep it so the RNG stream and the
  // give-up point match the C exactly.
  if (
    ctx.nperturbsSinceLastNewOpen++ > ctx.w ||
    ctx.nperturbsSinceLastNewOpen++ > ctx.h
  ) {
    return null;
  }

  // Preference-ordered candidate list: boundary unknowns (1), interior
  // unknowns (2), then known squares (3), each shuffled by a random secondary
  // key. Squares near the start or inside the input set are excluded.
  const sqlist: Square[] = [];
  for (let y = 0; y < ctx.h; y++) {
    for (let x = 0; x < ctx.w; x++) {
      if (Math.abs(y - ctx.sy) <= 1 && Math.abs(x - ctx.sx) <= 1) continue;
      if (
        (mask === 0 && grid[y * ctx.w + x] === -2) ||
        (x >= setx &&
          x < setx + 3 &&
          y >= sety &&
          y < sety + 3 &&
          mask & (1 << ((y - sety) * 3 + (x - setx))))
      ) {
        continue;
      }
      let type: number;
      if (grid[y * ctx.w + x] !== -2) {
        type = 3; // known square
      } else {
        type = 2;
        for (let dy = -1; dy <= 1 && type === 2; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (
              x + dx >= 0 &&
              x + dx < ctx.w &&
              y + dy >= 0 &&
              y + dy < ctx.h &&
              grid[(y + dy) * ctx.w + (x + dx)] !== -2
            ) {
              type = 1;
              break;
            }
          }
        }
      }
      sqlist.push({ x, y, type, random: randomBits(ctx.rs, 31) });
    }
  }
  sqlist.sort(squarecmp);

  // Count full/empty squares in the target set.
  let nfull = 0;
  let nempty = 0;
  if (mask) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        if (mask & (1 << (dy * 3 + dx))) {
          if (ctx.grid[(sety + dy) * ctx.w + (setx + dx)]) nfull++;
          else nempty++;
        }
      }
    }
  } else {
    for (let y = 0; y < ctx.h; y++) {
      for (let x = 0; x < ctx.w; x++) {
        if (grid[y * ctx.w + x] === -2) {
          if (ctx.grid[y * ctx.w + x]) nfull++;
          else nempty++;
        }
      }
    }
  }

  // Walk the sorted list collecting `nfull` empties (to fill the set) or
  // `nempty` fulls (to empty it), whichever we reach first.
  const tofill: Square[] = [];
  const toempty: Square[] = [];
  for (const sq of sqlist) {
    if (ctx.grid[sq.y * ctx.w + sq.x]) toempty.push(sq);
    else tofill.push(sq);
    if (tofill.length === nfull || toempty.length === nempty) break;
  }

  // Partial-fill fallback: not enough outside squares to fully fill or empty,
  // so fill a random subset of the set's empty squares (upstream always
  // chooses to *fill* in this case — dense-corner boards, mines.c:1654).
  let setlist: number[] | null = null;
  if (tofill.length !== nfull && toempty.length !== nempty) {
    const list: number[] = [];
    if (mask) {
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          if (mask & (1 << (dy * 3 + dx))) {
            if (!ctx.grid[(sety + dy) * ctx.w + (setx + dx)]) {
              list.push((sety + dy) * ctx.w + (setx + dx));
            }
          }
        }
      }
    } else {
      for (let y = 0; y < ctx.h; y++) {
        for (let x = 0; x < ctx.w; x++) {
          if (grid[y * ctx.w + x] === -2 && !ctx.grid[y * ctx.w + x]) {
            list.push(y * ctx.w + x);
          }
        }
      }
    }
    // Partial Fisher–Yates: bring `toempty.length` random items to the front.
    const ntoempty = toempty.length;
    const ilen = list.length;
    for (let k = 0; k < ntoempty; k++) {
      const index = k + randomUpto(ctx.rs, ilen - k);
      const tmp = list[k];
      list[k] = list[index];
      list[index] = tmp;
    }
    setlist = list;
  }

  // Build the change list: either fill each empty in the set (+1) and empty a
  // matching outside square (-1), or the reverse.
  const changes: Perturbation[] = [];
  let todo: Square[];
  let dtodo: number;
  let dset: number;
  if (tofill.length === nfull) {
    todo = tofill;
    dtodo = +1;
    dset = -1;
  } else {
    // (Also the partial-fill case.)
    todo = toempty;
    dtodo = -1;
    dset = +1;
  }
  for (const sq of todo) changes.push({ x: sq.x, y: sq.y, delta: dtodo });

  if (setlist) {
    const ntoempty = toempty.length;
    for (let j = 0; j < ntoempty; j++) {
      changes.push({
        x: setlist[j] % ctx.w,
        y: Math.floor(setlist[j] / ctx.w),
        delta: dset,
      });
    }
  } else if (mask) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        if (mask & (1 << (dy * 3 + dx))) {
          const currval = ctx.grid[(sety + dy) * ctx.w + (setx + dx)] ? +1 : -1;
          if (dset === -currval) {
            changes.push({ x: setx + dx, y: sety + dy, delta: dset });
          }
        }
      }
    }
  } else {
    for (let y = 0; y < ctx.h; y++) {
      for (let x = 0; x < ctx.w; x++) {
        if (grid[y * ctx.w + x] === -2) {
          const currval = ctx.grid[y * ctx.w + x] ? +1 : -1;
          if (dset === -currval) {
            changes.push({ x, y, delta: dset });
          }
        }
      }
    }
  }

  // Apply the changes to the real grid and patch the numbers already visible in
  // the solver's grid (so it can carry on without a full rescan).
  for (const change of changes) {
    const { x, y, delta } = change;
    ctx.grid[y * ctx.w + x] = delta > 0 ? 1 : 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (
          x + dx >= 0 &&
          x + dx < ctx.w &&
          y + dy >= 0 &&
          y + dy < ctx.h &&
          grid[(y + dy) * ctx.w + (x + dx)] !== -2
        ) {
          if (dx === 0 && dy === 0) {
            if (delta > 0) {
              grid[y * ctx.w + x] = -1;
            } else {
              let minecount = 0;
              for (let dy2 = -1; dy2 <= 1; dy2++) {
                for (let dx2 = -1; dx2 <= 1; dx2++) {
                  if (
                    x + dx2 >= 0 &&
                    x + dx2 < ctx.w &&
                    y + dy2 >= 0 &&
                    y + dy2 < ctx.h &&
                    ctx.grid[(y + dy2) * ctx.w + (x + dx2)]
                  ) {
                    minecount++;
                  }
                }
              }
              grid[y * ctx.w + x] = minecount;
            }
          } else if (grid[(y + dy) * ctx.w + (x + dx)] >= 0) {
            grid[(y + dy) * ctx.w + (x + dx)] += delta;
          }
        }
      }
    }
  }

  return changes;
}

/**
 * Generate a mine layout of `n` mines on a `w × h` grid, none within one square
 * of the first click (x, y). When `unique`, run the solve-and-perturb loop
 * until the board is deducible without guessing (upstream `minegen`,
 * mines.c:1863). Returns the mine bitmap (1 = mine).
 */
export function minegen(
  w: number,
  h: number,
  n: number,
  x: number,
  y: number,
  unique: boolean,
  rs: RandomState,
): Int8Array {
  const ret = new Int8Array(w * h);
  let success = false;
  let ntries = 0;

  // The guard keeps its own count: `ntries` is load-bearing (it gates
  // `allowBigPerturbs` below), so nudging it would move the generated board.
  const attempt = retryLimit("mines: generation");
  do {
    attempt();

    success = false;
    ntries++;
    ret.fill(0);

    // Place n mines at random, none at or adjacent to (x, y).
    {
      const tmp: number[] = [];
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          if (Math.abs(i - y) > 1 || Math.abs(j - x) > 1) tmp.push(i * w + j);
        }
      }
      let k = tmp.length;
      let nn = n;
      while (nn-- > 0) {
        const i = randomUpto(rs, k);
        ret[tmp[i]] = 1;
        tmp[i] = tmp[--k];
      }
    }

    if (unique) {
      const ctx: MineCtx = {
        grid: ret,
        opened: new Int8Array(w * h),
        w,
        h,
        sx: x,
        sy: y,
        allowBigPerturbs: ntries > 100,
        nperturbsSinceLastNewOpen: 0,
        rs,
      };
      const open: OpenCb = (ox, oy) => mineopen(ctx, ox, oy);
      const perturb: PerturbCb = (g, sx, sy, m) => mineperturb(ctx, g, sx, sy, m);

      const solvegrid = new Int8Array(w * h);
      // `prevret` is declared -2 and, VERBATIM with upstream (mines.c:1940),
      // NEVER reassigned — so the `prevret >= 0` guard is permanently false and
      // the loop breaks only on a full solve (0) or an unsolvable board (-1).
      // "Fixing" it to track the previous perturb count would change the
      // give-up point and diverge the byte-match desc (design D6, trap 4).
      const prevret = -2;
      // A guard of its own, deliberately: bounding this loop via `prevret`
      // would resurrect the dead give-up above and change the desc.
      const round = retryLimit("mines: solve/perturb", MAX_SOLVE_ROUNDS);
      while (true) {
        round();

        solvegrid.fill(-2);
        solvegrid[y * w + x] = mineopen(ctx, x, y); // 0 by deliberate arrangement

        const solveret = minesolve(w, h, n, solvegrid, open, perturb, rs);
        if (solveret < 0 || (prevret >= 0 && solveret >= prevret)) {
          success = false;
          break;
        } else if (solveret === 0) {
          success = true;
          break;
        }
      }
    } else {
      success = true;
    }
  } while (!success);

  return ret;
}

/**
 * Reproduce `new_game_desc(interactive = false)` (mines.c:2033): pick (or take
 * the forced) first click, generate the layout, and return the *public* desc
 * `x,y,m<hex>`. This is the byte-match subject of the differential (design D6) —
 * the running game uses the preliminary `r…` form; this batch form is what the
 * C's `--generate` path and the trace harness produce.
 */
export function newGameDescBatch(p: MinesParams, rs: RandomState): string {
  // Two draws for the initial click, consumed whether or not they are used
  // (design D6.1). Forced first-click params override the values, not the draws.
  const x0 = randomUpto(rs, p.w);
  const y0 = randomUpto(rs, p.h);
  const x = p.firstClickX >= 0 ? p.firstClickX : x0;
  const y = p.firstClickY >= 0 ? p.firstClickY : y0;
  const mines = minegen(p.w, p.h, p.n, x, y, p.unique, rs);
  return `${x},${y},m${encodeLayoutHex(mines, p.w * p.h)}`;
}
