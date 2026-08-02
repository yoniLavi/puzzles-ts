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
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/abcd-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
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
