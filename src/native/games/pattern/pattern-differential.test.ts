/**
 * Gated C-vs-TS differential for the Pattern port. Reads the committed
 * fixture recorded from upstream pattern.c (puzzles/auxiliary/pattern-trace.c)
 * and asserts that TS `newPatternDesc` over the same seed reproduces the C
 * desc **byte-for-byte** — the generator is a faithful port and the RNG is
 * bit-identical, so the value grids (computed in single precision via
 * `Math.fround`) and the resulting clue descs must agree exactly.
 *
 * Regenerate the fixture (while pattern.c still exists) with:
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make pattern-trace)
 *   build/native/auxiliary/pattern-trace \
 *     > src/native/games/pattern/__fixtures__/pattern-c-reference.json
 */
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/pattern-c-reference.json" with { type: "json" };
import { newPatternDesc } from "./generator.ts";
import type { PatternParams } from "./state.ts";
import { validateDesc } from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
}
const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, PatternParams>({
  title: "Pattern C-vs-TS differential — desc byte-match (gated)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h }),
  newDesc: newPatternDesc,
  // Each C desc must also pass the TS validator.
  extra: (f, p) => {
    if (validateDesc(p, f.desc) !== null) {
      throw new Error(`validateDesc rejected C desc: ${f.desc}`);
    }
  },
});
