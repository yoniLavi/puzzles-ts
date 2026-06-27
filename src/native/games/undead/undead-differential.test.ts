/**
 * Gated C-vs-TS differential for Undead — **solver-agreement**, not byte-match.
 *
 * Undead's generator orders equal-length paths with `qsort`, whose tie-break is
 * implementation-defined and differs across libc builds (native-glibc trace vs
 * wasm-musl), so the emitted desc is not reproducible byte-for-byte (design D1).
 * Instead this differential decodes a frozen set of **C-generated** boards and
 * asserts the TS solver reaches the same *order-independent* verdicts the C
 * solver did: uniquely solvable, the iterative solver solved-or-not, the same
 * post-fixpoint ambiguity count, and the brute-force outcome. These three
 * quantities are provably path-order-independent (the iterative fixpoint is the
 * intersection of monotone per-path constraints; ambiguity reads that fixpoint;
 * brute-force scans the narrowed candidate space).
 *
 * The `gradeUndead`-vs-C assertions verify the *ported iterative/brute solver*,
 * which is unchanged. They are **not** a difficulty-grade match: with the fork's
 * deductive ladder (`strengthen-undead-deduction`) Undead grades by rung and
 * deliberately diverges from upstream, which has no forcing layer. The
 * differential's role narrows to **soundness** — every published (unique) board
 * is solved by the deductive ladder to *the* unique solution, and the ladder
 * never solves a board the brute-force oracle finds non-unique.
 *
 * Regenerate while `puzzles/undead.c` still exists (deleted at acceptance):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make undead-trace)
 *   build/native/auxiliary/undead-trace \
 *     > src/native/games/undead/__fixtures__/undead-c-reference.json
 */
import { describe, expect, it } from "vitest";
import cReference from "./__fixtures__/undead-c-reference.json" with { type: "json" };
import { findUndeadSolution, gradeUndead, isUniquelySolvable, solveDeductive } from "./solver.ts";
import { diffFromLevel, MON_NONE, newState, type UndeadParams } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  diff: number;
  seed: string;
  desc: string;
  iterativeSolved: boolean;
  ambiguous: number;
  bruteforceSolved: boolean;
  inconsistent: boolean;
}

const data = cReference as { fixtures: Fixture[] };

describe("undead differential (frozen C reference, solver-agreement)", () => {
  for (const fx of data.fixtures) {
    it(`${fx.w}x${fx.h} diff=${fx.diff} seed=${fx.seed}`, () => {
      const params: UndeadParams = { w: fx.w, h: fx.h, diff: diffFromLevel(fx.diff) };
      const state = newState(params, fx.desc);

      // Every published board is uniquely solvable.
      expect(isUniquelySolvable(state.common)).toBe(true);

      // The ported iterative/brute solver reaches the same order-independent
      // verdicts as C (solver-correctness, not a difficulty-grade match).
      const start = new Uint8Array(state.common.numTotal).fill(MON_NONE);
      const grade = gradeUndead(state.common, start, fx.diff !== 0);
      expect(grade.inconsistent).toBe(fx.inconsistent);
      expect(grade.iterativeSolved).toBe(fx.iterativeSolved);
      expect(grade.ambiguous).toBe(fx.ambiguous);
      expect(grade.bruteforceSolved).toBe(fx.bruteforceSolved);

      // Soundness (the fork's narrowed differential role): the deductive ladder
      // solves every published unique board to *the* unique solution, with no
      // recursion.
      const deductive = solveDeductive(state.common, start);
      expect(deductive.inconsistent).toBe(false);
      expect(deductive.solved).toBe(true);
      const sol = findUndeadSolution(state);
      expect(sol.ok).toBe(true);
      if (sol.ok) expect(Array.from(deductive.guess)).toEqual(Array.from(sol.guess));
    });
  }
});
