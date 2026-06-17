/**
 * Gated C-vs-TS differential for Untangle.
 *
 * Two assertions per frozen C-reference fixture:
 *  1. **Byte-for-byte desc match** (the strongest bar): the TS generator,
 *     run over the bit-identical `random.ts` seeded the same way,
 *     reproduces the C desc exactly. This proves `random.ts` is
 *     bit-identical end-to-end through both the planar-fill phase and the
 *     circle-permutation re-roll — including the float circle layout that
 *     gates Phase B (V8 and the host libm agree on `sin`/`cos` to the bit
 *     here; if a platform ever diverges, this is where it surfaces).
 *  2. **Planar + tangled**: the decoded board has every vertex degree ≤ 4
 *     and starts with at least one crossing.
 *
 * Regenerate the fixture while `puzzles/untangle.c` still exists (it is
 * deleted at owner acceptance):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make untangle-trace)
 *   build/native/auxiliary/untangle-trace \
 *     > src/native/games/untangle/__fixtures__/untangle-c-reference.json
 */

import { describe, expect, it } from "vitest";
import { expectDescMatches } from "../../engine/testing/differential.ts";
import { randomNew } from "../../random/index.ts";
import cReference from "./__fixtures__/untangle-c-reference.json" with { type: "json" };
import { newUntangleDesc } from "./generator.ts";
import {
  coordLimit,
  decodeGame,
  findCrossings,
  makeCircle,
  type UntangleParams,
} from "./state.ts";

interface Fixture {
  n: number;
  seed: string;
  desc: string;
}
const data = cReference as { fixtures: Fixture[] };

describe("untangle differential (frozen C reference)", () => {
  for (const f of data.fixtures) {
    const params: UntangleParams = { n: f.n };
    it(`n=${f.n} seed=${f.seed}: TS desc matches C byte-for-byte`, () => {
      expectDescMatches(f, params, newUntangleDesc);
    });

    it(`n=${f.n} seed=${f.seed}: board is planar (degree ≤ 4) and starts tangled`, () => {
      const { desc } = newUntangleDesc(params, randomNew(f.seed));
      const edges = decodeGame(desc, f.n);
      const degree = new Array<number>(f.n).fill(0);
      for (const e of edges) {
        degree[e.a]++;
        degree[e.b]++;
      }
      expect(Math.max(...degree)).toBeLessThanOrEqual(4);
      // The circle layout (the played starting position) is tangled.
      const { completed } = findCrossings(makeCircle(f.n, coordLimit(f.n)), edges);
      expect(completed).toBe(false);
    });
  }
});
