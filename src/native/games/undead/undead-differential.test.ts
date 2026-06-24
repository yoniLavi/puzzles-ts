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
 * Regenerate while `puzzles/undead.c` still exists (deleted at acceptance):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make undead-trace)
 *   build/native/auxiliary/undead-trace \
 *     > src/native/games/undead/__fixtures__/undead-c-reference.json
 */
import { describe, expect, it } from "vitest";
import cReference from "./__fixtures__/undead-c-reference.json" with { type: "json" };
import { gradeUndead, isUniquelySolvable } from "./solver.ts";
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

      // The TS grading reaches the same order-independent verdicts as C.
      const start = new Uint8Array(state.common.numTotal).fill(MON_NONE);
      const grade = gradeUndead(state.common, start, fx.diff !== 0);
      expect(grade.inconsistent).toBe(fx.inconsistent);
      expect(grade.iterativeSolved).toBe(fx.iterativeSolved);
      expect(grade.ambiguous).toBe(fx.ambiguous);
      expect(grade.bruteforceSolved).toBe(fx.bruteforceSolved);
    });
  }
});
