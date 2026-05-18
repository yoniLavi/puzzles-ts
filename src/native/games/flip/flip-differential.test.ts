/*
 * Frozen differential check (behavioural, gating): asserts the Flip TS
 * port's generator against a committed snapshot of the C reference
 * (`__fixtures__/flip-c-reference.json`, produced by the deleted
 * `puzzles/flip-trace.c` before flip.c was removed). This is the
 * reproducible, C-free form of the differential spot-check; the live
 * C-vs-TS comparison lives in `scripts/diff-flip.test.ts` (advisory,
 * on-demand, not gated).
 *
 * Per the `flip` spec: CROSSES is deterministic and `random.ts` is
 * bit-identical, so the TS desc MUST equal the C reference exactly;
 * RANDOM uses an idiomatic generator and is EXPECTED to differ — there
 * the real bar is "every generated board is solvable".
 */

import { describe, expect, it } from "vitest";
import cReference from "./__fixtures__/flip-c-reference.json" with {
  type: "json",
};
import { type FlipParams, flipGame } from "./index.ts";
import { randomNew } from "../../random/index.ts";

interface RefEntry {
  seed: string;
  w: number;
  h: number;
  matrixType: "crosses" | "random";
  desc: string;
}

const solveFlip = flipGame.solve as NonNullable<typeof flipGame.solve>;

describe("Flip differential vs frozen C reference", () => {
  for (const e of cReference as RefEntry[]) {
    const p: FlipParams = { w: e.w, h: e.h, matrixType: e.matrixType };
    const tag = `${e.w}x${e.h} ${e.matrixType} seed=${e.seed}`;

    if (e.matrixType === "crosses") {
      it(`${tag}: TS desc matches C exactly`, () => {
        const ts = flipGame.newDesc(p, randomNew(e.seed)).desc;
        expect(ts).toBe(e.desc);
      });
    } else {
      it(`${tag}: TS board solvable (RANDOM may differ from C)`, () => {
        const ts = flipGame.newDesc(p, randomNew(e.seed)).desc;
        expect(flipGame.validateDesc(p, ts)).toBeNull();
        const st = flipGame.newState(p, ts);
        const r = solveFlip(st, st);
        expect(r.ok).toBe(true);
      });
    }
  }
});
