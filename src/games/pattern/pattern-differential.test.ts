/**
 * C-vs-TS differential for the Pattern port: over each fixture's seed,
 * `newPatternDesc` must reproduce upstream's desc byte-for-byte. The RNG is
 * bit-identical and the value grid is computed in single precision via
 * `Math.fround`, so the clue descs agree exactly.
 *
 * The fixture is frozen and cannot be regenerated; see
 * `engine/testing/differential.ts`.
 */
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/pattern-c-reference.json" with { type: "json" };
import { newPatternDesc } from "./generator.ts";
import { type PatternParams, validateDesc } from "./state.ts";

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
