/*
 * diff-unruly.test.ts — ADVISORY live C-vs-TS differential spot-check for
 * the Unruly port (openspec add-unruly-ts-port). NOT part of the
 * commit/CI gate: it lives outside `src/`, so the default `vitest run`
 * (vitest.config.ts → include `src/**`) never collects it. Run on demand
 * after rebuilding the fixture from C:
 *
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0   # needs puzzles/unruly.c
 *   (cd build/native && make unruly-trace)
 *   build/native/auxiliary/unruly-trace \
 *     > src/native/games/unruly/__fixtures__/unruly-c-reference.json
 *   npx vitest run --config scripts/diff-unruly.vitest.config.mts
 *
 * It reads the same JSON fixture the gated
 * `src/native/games/unruly/unruly-differential.test.ts` reads and asserts
 * TS `newDesc` reproduces the C desc byte-for-byte over the same seed.
 * Because the generator is a faithful port over the bit-identical RNG,
 * exact equality is the bar here (unlike Galaxies, where only solver
 * agreement is required).
 *
 * unruly.c (hence unruly-trace) is deleted when the port ships at
 * owner-confirmed parity; the C-free form of this check is the gated test
 * above. Re-run this from the change's commit if ever needed.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newDesc } from "../src/native/games/unruly/generator.ts";
import type { UnrulyParams } from "../src/native/games/unruly/state.ts";
import { randomNew } from "../src/native/random/index.ts";

const FIXTURE = "src/native/games/unruly/__fixtures__/unruly-c-reference.json";

interface Fixture {
  w2: number;
  h2: number;
  unique: boolean;
  diff: number;
  seed: string;
  desc: string;
  solverDiff: number;
}

describe("Unruly live differential (advisory)", () => {
  if (!existsSync(FIXTURE)) {
    it.skip("fixture missing — regenerate via build/native/auxiliary/unruly-trace", () => {});
    return;
  }
  const data: { fixtures: Fixture[] } = JSON.parse(readFileSync(FIXTURE, "utf8"));
  for (const f of data.fixtures) {
    const p: UnrulyParams = { w2: f.w2, h2: f.h2, unique: f.unique, diff: f.diff };
    it(`${f.w2}x${f.h2}${f.unique ? "u" : ""}/d${f.diff} seed=${f.seed}: TS desc matches C`, () => {
      const { desc } = newDesc(p, randomNew(f.seed));
      if (desc !== f.desc) {
        console.warn(`Unruly divergence seed=${f.seed}: C=${f.desc}, TS=${desc}`);
      }
      expect(desc).toBe(f.desc);
    });
  }
});
