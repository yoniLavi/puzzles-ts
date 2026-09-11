/**
 * Byte-match differential for the dominosa generator.
 *
 * `random.ts` is bit-identical to `random.c`, so a faithful generator port
 * reproduces the C desc byte-for-byte for the same seed. Because the generator
 * is solver-gated (it keeps a board only if the solver grades it at exactly the
 * target difficulty), a byte-match on the desc transitively proves the TS
 * solver reached C's verdict on every intermediate board. The `extra` hook
 * also re-checks that each C board decodes validly, solves uniquely, and grades
 * at exactly its recorded difficulty under the TS solver.
 *
 * The fixture is frozen and cannot be regenerated: it was captured from
 * upstream's C by a harness that no longer exists (see
 * `engine/testing/differential.ts`).
 */
import { expect } from "vitest";
import {
  type DescFixture,
  describeDescDifferential,
} from "../../engine/testing/differential.ts";
import reference from "./__fixtures__/dominosa-c-reference.json" with { type: "json" };
import { newDominosaDesc } from "./generator.ts";
import { solveNumbers } from "./solver.ts";
import { DIFF_AMBIGUOUS, DIFFCOUNT, newState, validateDesc } from "./state.ts";

interface DominosaFixture extends DescFixture {
  name: string;
  n: number;
  diff: number;
}

const fixtures = reference.fixtures as DominosaFixture[];

describeDescDifferential<DominosaFixture, { n: number; diff: number }>({
  title: "dominosa generator matches the C reference byte-for-byte",
  fixtures,
  label: (f) => `${f.name} (n=${f.n}, diff=${f.diff}, seed=${f.seed})`,
  params: (f) => ({ n: f.n, diff: f.diff }),
  newDesc: (p, rng) => newDominosaDesc(p, rng),
  extra: (f, p) => {
    // The C board decodes validly and (for graded difficulties) solves uniquely
    // at exactly its recorded difficulty under the TS solver.
    expect(validateDesc(p, f.desc)).toBeNull();
    if (p.diff !== DIFF_AMBIGUOUS) {
      const state = newState(p, f.desc);
      const full = solveNumbers(p.n, state.numbers, DIFFCOUNT);
      expect(full.result).toBe(1);
      const graded = solveNumbers(p.n, state.numbers, p.diff);
      expect(graded.result).toBe(1);
      expect(graded.maxDiffUsed).toBe(p.diff);
    }
  },
});
