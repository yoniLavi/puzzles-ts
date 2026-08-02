/**
 * Gated C-vs-TS differential for the Signpost port. Reads the committed
 * fixture recorded from upstream signpost.c
 * (puzzles/auxiliary/signpost-trace.c) and asserts that TS `newSignpostDesc`
 * over the same seed reproduces the C desc **byte-for-byte** — the
 * generator is a faithful port (the head+tail random walk, the
 * shuffle-and-solver-gated clue selection), the clue-removal loop is
 * decided by identical solver verdicts, and the RNG is bit-identical.
 * The `extra` step also asserts each C desc parses and re-encodes.
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/signpost-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/signpost-c-reference.json" with { type: "json" };
import { newSignpostDesc } from "./generator.ts";
import { generateDesc, type SignpostParams, unpickDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  forceCornerStart: boolean;
  seed: string;
  desc: string;
}

const data = cReference as { fixtures: Fixture[] };

const params = (f: Fixture): SignpostParams => ({
  w: f.w,
  h: f.h,
  forceCornerStart: f.forceCornerStart,
});
const label = (f: Fixture) =>
  `${f.w}x${f.h}${f.forceCornerStart ? "c" : ""} seed=${f.seed}`;

describeDescDifferential<Fixture, SignpostParams>({
  title: "Signpost C-vs-TS differential — desc byte-match (gated)",
  fixtures: data.fixtures,
  label,
  params,
  newDesc: newSignpostDesc,
  extra: (f, p) => {
    const r = unpickDesc(p, f.desc);
    expect("state" in r).toBe(true);
    if ("state" in r) {
      expect(generateDesc(r.state, false)).toBe(f.desc);
    }
  },
});
