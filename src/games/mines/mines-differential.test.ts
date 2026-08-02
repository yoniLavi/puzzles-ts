/**
 * Gated byte-match differential: mines TS generator vs the frozen C reference
 * (design D6). Because `random.ts` is bit-identical to `random.c`, a faithful
 * generator reproduces each public desc `x,y,m<hex>` exactly for a given seed.
 * A mismatch means one of the D6 traps was missed (the two burned draws, the
 * double-increment livelock guard, the never-updated `prevret`, or the set /
 * candidate scan order) — check those first.
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/mines-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
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
