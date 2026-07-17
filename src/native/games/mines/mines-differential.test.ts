/**
 * Gated byte-match differential: mines TS generator vs the frozen C reference
 * (design D6). Because `random.ts` is bit-identical to `random.c`, a faithful
 * generator reproduces each public desc `x,y,m<hex>` exactly for a given seed.
 * A mismatch means one of the D6 traps was missed (the two burned draws, the
 * double-increment livelock guard, the never-updated `prevret`, or the set /
 * candidate scan order) — check those first.
 *
 * Regenerate the fixture while puzzles/mines.c still exists (deleted at
 * acceptance):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make mines-trace)
 *   build/native/auxiliary/mines-trace \
 *     > src/native/games/mines/__fixtures__/mines-c-reference.json
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import cReference from "./__fixtures__/mines-c-reference.json" with { type: "json" };
import { newGameDescBatch } from "./generator.ts";
import { decodeParams } from "./state.ts";

interface Fixture {
  params: string;
  seed: string;
  desc: string;
}
const fixtures = cReference as Fixture[];

describe("mines differential (frozen C reference)", () => {
  for (const f of fixtures) {
    it(`reproduces the C layout byte-for-byte: ${f.params} seed=${f.seed}`, () => {
      const p = decodeParams(f.params);
      const desc = newGameDescBatch(p, randomNew(f.seed));
      expect(desc).toBe(f.desc);
    }, 30_000);
  }
});
