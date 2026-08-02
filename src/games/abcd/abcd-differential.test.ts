/**
 * Gated C-vs-TS differential for ABCD.
 *
 * For each frozen C-reference fixture (see `puzzles/auxiliary/abcd-trace.c`),
 * the TS `newAbcdDesc`, replayed over the bit-identical `random.ts` seeded the
 * same way, must reproduce the C desc byte-for-byte. Because the generator is
 * solver-gated at every accept/reject and every hard-mode clue removal, this
 * one assertion validates the fill order, the deductive solver's every verdict,
 * and the codec together (design D6).
 *
 * Regenerate the fixture while puzzles/unreleased/abcd.c still exists:
 *   rm -rf build/native
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make abcd-trace)
 *   build/native/auxiliary/abcd-trace \
 *     > src/native/games/abcd/__fixtures__/abcd-c-reference.json
 */

import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/abcd-c-reference.json" with { type: "json" };
import { newAbcdDesc } from "./generator.ts";
import { type AbcdParams, validateDesc } from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  n: number;
  diag: boolean;
  removenums: boolean;
}

const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, AbcdParams>({
  title: "abcd differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) =>
    `${f.w}x${f.h}n${f.n}${f.diag ? "D" : ""}${f.removenums ? "R" : ""} seed=${f.seed}`,
  params: (f) => ({
    w: f.w,
    h: f.h,
    n: f.n,
    diag: f.diag,
    removenums: f.removenums,
  }),
  newDesc: newAbcdDesc,
  // The generated desc must also pass the port's own validator.
  extra: (f, p) => {
    if (validateDesc(p, f.desc) !== null) throw new Error("C desc failed validateDesc");
  },
});
