/**
 * Group solver — the two Group-specific user-solvers (Normal associativity +
 * identity fill; Hard identity elimination) and the group validator, riding on
 * the shared generic `LatinSolver` (`engine/latin.ts`).
 *
 * Group's `solver()` is `latin_solver_main` with Group supplying only its own
 * deductions; the generic Latin layers (positional/set elimination, forcing
 * chains, guess-and-verify recursion) supply everything else (design D1). The
 * difficulty mapping onto the config:
 *
 *   Trivial       → generic simple (positional/numeric single).
 *   Normal        → {@link solverNormal} (associativity forward-deduction).
 *   Hard          → {@link solverHard} (identity-hidden candidate elimination).
 *   Extreme       → generic set-elimination + forcing.
 *   Unreasonable  → generic recursion.
 *
 * The cube is indexed `(x·o + y)·o + (n−1)` (`cubepos`) and the grid `y·o + x`
 * (`gridpos`), exactly as latin.ts — so the deductions transcribe verbatim.
 * Note that `solver_normal` reads the grid with *raw* `grid[i*w+j]` indexing
 * while `solver_hard` / `group_valid` use the C `grid(x,y)` macro (`grid[y*w+x]`,
 * transposed); each is ported with the matching index expression.
 *
 * **Hint recording** (the fork's explained-hint divergence): when
 * `solver.recorder` is set, each deduction is captured with the rule + premise
 * that fired it (design D2, `add-group-hint`). The recording branch is gated on
 * `solver.recorder` throughout, so with it unset — the generator/solve path —
 * every RNG draw and deduction verdict is byte-for-byte what the frozen
 * `group-c-reference.json` differential froze. The one control-flow change under
 * recording is `solverHard`'s per-element early return (so one recorded firing =
 * one "this element can't be the identity" deduction); `solverNormal` already
 * returns per firing on both paths.
 */

import {
  type DeductionRecord,
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  type LatinReason,
  type LatinSolver,
  latinSolver,
} from "../../engine/latin.ts";
import { DIFF_EXTREME, DIFF_HARD, DIFF_TRIVIAL, DIFF_UNREASONABLE } from "./state.ts";

export { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE };

/** Why a Group-specific deduction placed or eliminated — the premise the hint
 * narrates and highlights (design D2). Combined with {@link LatinReason} (the
 * generic positional/set/forcing deductions) it covers every technique the
 * recording solver fires; the `kind` fields never collide with the Latin ones.
 *
 * All cell fields are **grid** coordinates (`{x = col, y = row}`); the value
 * fields (`a`/`b`/`c`/…) are 1-based element numbers.
 */
export type GroupReason =
  /** Associativity forced a **placement**: the player has filled `a·b`, `b·c`
   * and one of `(a·b)·c` / `a·(b·c)`; since `(a·b)·c = a·(b·c)` in any group the
   * remaining fourth product is forced to the same value `v`. `knownLeft` = the
   * *left* association `(a·b)·c` is the one already filled (so `a·(b·c)` is the
   * cell placed); the three premise cells are carried for shading. */
  | {
      kind: "associativity";
      a: number;
      b: number;
      c: number;
      ab: number;
      bc: number;
      v: number;
      knownLeft: boolean;
      abCell: { x: number; y: number };
      bcCell: { x: number; y: number };
      thirdCell: { x: number; y: number };
    }
  /** The identity `e` is known (the filled cell `(viaX, viaY)` shows `a·b`
   * equals `a` or `b`, so the other factor is the identity), so the identity's
   * whole row and column are just the element labels — this cell is one of them
   * (a **placement**). */
  | {
      kind: "identityFill";
      e: number;
      viaX: number;
      viaY: number;
      a: number;
      b: number;
      prod: number;
    }
  /** Identity-hidden **elimination**: the filled product at `(wx, wy)` shows
   * `elem` combined with `other` gives `product` (≠ `other`), so `elem` can't be
   * the identity — its identity marks are struck. `left` = `elem` was the left
   * factor (`elem·other`), else the right (`other·elem`). */
  | {
      kind: "identityElim";
      elem: number;
      other: number;
      product: number;
      wx: number;
      wy: number;
      left: boolean;
    };

/** A reason attached to a recorded Group deduction. */
export type HintReason = GroupReason | LatinReason;

/** One recorded Group deduction op (a {@link DeductionRecord} with a narrowed
 * reason). */
export interface HintOp extends DeductionRecord {
  reason: HintReason;
}

/** Group's deductions need no external context (unlike Unequal's links). */
type GroupCtx = null;

/**
 * Find the group identity, if it can be read off a filled cell. Any filled
 * `ab` that equals `a` proves `b` is the identity (and symmetrically). Returns
 * the identity element `1..w`, or 0 if not yet determined (`find_identity`).
 * Raw `grid[i*w+j]` indexing, as upstream.
 */
function findIdentity(solver: LatinSolver): number {
  const w = solver.o;
  const grid = solver.grid;
  for (let i = 0; i < w; i++)
    for (let j = 0; j < w; j++) {
      if (grid[i * w + j] === i + 1) return j + 1;
      if (grid[i * w + j] === j + 1) return i + 1;
    }
  return 0;
}

/** The filled cell that reveals the identity `idn` (hint path only): a filled
 * `a·b` equal to `a` (so `b = idn`) or to `b` (so `a = idn`), returned as its
 * grid coords plus the `a`,`b`,`product` it shows. */
function identityWitness(
  solver: LatinSolver,
  idn: number,
): { viaX: number; viaY: number; a: number; b: number; prod: number } | null {
  const w = solver.o;
  const grid = solver.grid;
  for (let i = 0; i < w; i++)
    for (let j = 0; j < w; j++) {
      // grid[i*w+j] = (i+1)·(j+1); == i+1 ⇒ (j+1) is the (right) identity.
      if (grid[i * w + j] === i + 1 && j + 1 === idn)
        return { viaX: j, viaY: i, a: i + 1, b: j + 1, prod: i + 1 };
      // == j+1 ⇒ (i+1) is the (left) identity.
      if (grid[i * w + j] === j + 1 && i + 1 === idn)
        return { viaX: j, viaY: i, a: i + 1, b: j + 1, prod: j + 1 };
    }
  return null;
}

/**
 * Normal deduction (`solver_normal`): associativity forward-deduction plus
 * filling the identity's row and column once the identity is known.
 *
 * Associativity: for any `a,b,c`, if we know `ab`, `bc` and `(ab)c`, we can
 * place `a(bc)` (and the symmetric case). Returns `1` on the first placement,
 * `-1` on a contradiction *from the identity fill only*, `0` if nothing fired.
 */
function solverNormal(solver: LatinSolver): number {
  const w = solver.o;
  const g = solver.grid;
  const rec = solver.recorder;

  for (let i = 0; i < w; i++)
    for (let j = 0; j < w; j++)
      for (let k = 0; k < w; k++) {
        if (!g[i * w + j] || !g[j * w + k]) continue;
        const ab = g[i * w + j];
        const bc = g[j * w + k];

        // Know (ab)c, want a(bc): place a(bc) = (ab)c at (x=bc-1, y=a).
        if (g[(ab - 1) * w + k] && !g[i * w + (bc - 1)]) {
          const x = bc - 1;
          const y = i;
          const n = g[(ab - 1) * w + k];
          if (solver.cubeGet(x, y, n)) {
            solver.place(
              x,
              y,
              n,
              rec
                ? {
                    kind: "associativity",
                    a: i + 1,
                    b: j + 1,
                    c: k + 1,
                    ab,
                    bc,
                    v: n,
                    knownLeft: true,
                    abCell: { x: j, y: i },
                    bcCell: { x: k, y: j },
                    thirdCell: { x: k, y: ab - 1 },
                  }
                : undefined,
            );
            return 1;
          }
          // The shipped build detects no contradiction here — the `return -1`
          // lives inside `#ifdef STANDALONE_SOLVER`, so this else is empty and
          // the search silently continues (design/byte-parity: faithful to the
          // game build the differential matches, not the standalone solver).
        }

        // Know a(bc), want (ab)c: place (ab)c = a(bc) at (x=c, y=ab-1).
        if (!g[(ab - 1) * w + k] && g[i * w + (bc - 1)]) {
          const x = k;
          const y = ab - 1;
          const n = g[i * w + (bc - 1)];
          if (solver.cubeGet(x, y, n)) {
            solver.place(
              x,
              y,
              n,
              rec
                ? {
                    kind: "associativity",
                    a: i + 1,
                    b: j + 1,
                    c: k + 1,
                    ab,
                    bc,
                    v: n,
                    knownLeft: false,
                    abCell: { x: j, y: i },
                    bcCell: { x: k, y: j },
                    thirdCell: { x: bc - 1, y: i },
                  }
                : undefined,
            );
            return 1;
          }
        }
      }

  // Fill in the identity's row and column, if we've just learned which it is.
  const idn = findIdentity(solver);
  if (idn) {
    const i = idn;
    let doneSomething = false;
    for (let j = 1; j <= w; j++)
      if (!g[(i - 1) * w + (j - 1)] || !g[(j - 1) * w + (i - 1)]) doneSomething = true;

    if (doneSomething) {
      const witness = rec ? identityWitness(solver, idn) : null;
      const reasonFor = (): GroupReason | undefined =>
        witness
          ? {
              kind: "identityFill",
              e: idn,
              viaX: witness.viaX,
              viaY: witness.viaY,
              a: witness.a,
              b: witness.b,
              prod: witness.prod,
            }
          : undefined;
      for (let j = 1; j <= w; j++) {
        if (!g[(j - 1) * w + (i - 1)]) {
          if (!solver.cubeGet(i - 1, j - 1, j)) return -1;
          solver.place(i - 1, j - 1, j, reasonFor());
        }
        if (!g[(i - 1) * w + (j - 1)]) {
          if (!solver.cubeGet(j - 1, i - 1, j)) return -1;
          solver.place(j - 1, i - 1, j, reasonFor());
        }
      }
      return 1;
    }
  }

  return 0;
}

/**
 * Hard deduction (`solver_hard`): systematically rule out identities in
 * identity-hidden mode. A filled `ab` that is neither `a` nor `b` proves that
 * *neither* `a` nor `b` is the identity — so neither can act as the identity on
 * any element, and we strike `ij = j` / `ji = j` candidates directly on the
 * cube. Uses the transposed `grid(x,y)` macro (`grid[y*w+x]`). Returns 1 if it
 * eliminated any candidate, else 0.
 */
function solverHard(solver: LatinSolver): number {
  const w = solver.o;
  const gm = (x: number, y: number): number => solver.grid[y * w + x]; // grid(x,y)
  const rec = solver.recorder;
  let doneSomething = false;

  for (let i = 0; i < w; i++) {
    let iCanBeId = true;
    // The filled product that proves element (i+1) is not the identity.
    let wx = 0;
    let wy = 0;
    let wprod = 0;
    let wother = 0;
    let wleft = false;
    for (let j = 0; j < w; j++) {
      if (gm(i, j) && gm(i, j) !== j + 1) {
        iCanBeId = false;
        // gm(i,j) = grid[j*w+i] = (j+1)·(i+1): (i+1) fails as a *right* identity
        // on (j+1) — cell (col i, row j).
        wx = i;
        wy = j;
        wprod = gm(i, j);
        wother = j + 1;
        wleft = false;
        break;
      }
      if (gm(j, i) && gm(j, i) !== j + 1) {
        iCanBeId = false;
        // gm(j,i) = grid[i*w+j] = (i+1)·(j+1): (i+1) fails as a *left* identity
        // on (j+1) — cell (col j, row i).
        wx = j;
        wy = i;
        wprod = gm(j, i);
        wother = j + 1;
        wleft = true;
        break;
      }
    }

    if (!iCanBeId) {
      let fired = false;
      const reason: GroupReason = {
        kind: "identityElim",
        elem: i + 1,
        other: wother,
        product: wprod,
        wx,
        wy,
        left: wleft,
      };
      for (let j = 0; j < w; j++) {
        if (solver.cubeGet(i, j, j + 1)) {
          if (rec)
            rec({ kind: "elim", x: i, y: j, n: j + 1, reason, group: solver.group });
          solver.cube[solver.cubepos(i, j, j + 1)] = 0;
          doneSomething = true;
          fired = true;
        }
        if (solver.cubeGet(j, i, j + 1)) {
          if (rec)
            rec({ kind: "elim", x: j, y: i, n: j + 1, reason, group: solver.group });
          solver.cube[solver.cubepos(j, i, j + 1)] = 0;
          doneSomething = true;
          fired = true;
        }
      }
      // One element ruled out = one firing; return per firing when recording so
      // a hint step narrates a single "this element can't be the identity"
      // deduction (the un-recorded path keeps accumulating across every element,
      // byte-identical to the C reference).
      if (rec && fired) return 1;
    }
  }

  return doneSomething ? 1 : 0;
}

/**
 * A completed grid is a valid group table iff it is associative
 * (`(ab)c == a(bc)` for all `a,b,c`) — the generic Latin layers already ensure
 * Latin-square-hood, and identity + inverses follow (`group_valid`). Uses the
 * transposed `grid(x,y)` macro; only ever called on a full grid, so no blank
 * cell can index out of range.
 */
function groupValid(solver: LatinSolver): boolean {
  const w = solver.o;
  const gm = (x: number, y: number): number => solver.grid[y * w + x]; // grid(x,y)

  for (let i = 0; i < w; i++)
    for (let j = 0; j < w; j++)
      for (let k = 0; k < w; k++) {
        const ij = gm(i, j) - 1;
        const jk = gm(j, k) - 1;
        const ijK = gm(ij, k) - 1;
        const iJk = gm(i, jk) - 1;
        if (ijK !== iJk) return false;
      }

  return true;
}

/**
 * Solve a Group Cayley table in place up to difficulty `maxdiff`. `grid` is the
 * working grid (0 = blank) seeded with the givens; it is written back with the
 * first solution found. Returns the difficulty reached, or a
 * `DIFF_IMPOSSIBLE`/`DIFF_AMBIGUOUS`/`DIFF_UNFINISHED` sentinel — matching
 * `group.c`'s `solver()` and the shared latin.ts contract.
 *
 * `recorder` (hint path only) captures every deduction in solver order; leaving
 * it unset keeps the generator/solve path byte-for-byte unchanged.
 */
export function solveGroup(
  grid: Uint8Array,
  w: number,
  maxdiff: number,
  recorder?: (rec: DeductionRecord) => void,
): number {
  return latinSolver<GroupCtx>(grid, w, {
    maxdiff,
    diffSimple: DIFF_TRIVIAL,
    diffSet0: DIFF_HARD,
    diffSet1: DIFF_EXTREME,
    diffForcing: DIFF_EXTREME,
    diffRecursive: DIFF_UNREASONABLE,
    usersolvers: [null, solverNormal, solverHard, null, null],
    valid: groupValid,
    ctx: null,
    recorder,
  });
}

/**
 * Run the recording solver on a working grid seeded from the placed
 * givens/entries only (never the player's notes), up to `maxdiff`, and return
 * every candidate elimination and cell placement it makes, in solver order, each
 * tagged with the rule + premise that forced it. This is the raw deduction
 * script a hint narrates; the recorder-off path (`solveGroup` without a
 * callback) is byte-for-byte unchanged. `grid` is treated read-only (a working
 * copy is solved internally).
 */
export function recordGroupDeductions(
  grid: Uint8Array,
  w: number,
  maxdiff: number,
): HintOp[] {
  const ops: HintOp[] = [];
  solveGroup(grid.slice(), w, maxdiff, (rec) => ops.push(rec as HintOp));
  return ops;
}
