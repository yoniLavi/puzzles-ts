/**
 * Gated C-vs-TS differential for solo — SCAFFOLD STUB.
 *
 * A differential is per-game OPTIONAL — it earns its place on solver/codec
 * games (uniqueness/difficulty loops, non-obvious codecs), not every port. If
 * solo skips it, delete this file and note the skip in the port's design.md.
 *
 * If it earns one, regenerate the frozen fixture while puzzles/solo.c still
 * exists (the C is deleted at acceptance):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make solo-trace)
 *   build/native/auxiliary/solo-trace \
 *     > src/native/games/solo/__fixtures__/solo-c-reference.json
 *
 * Then replace the `it.todo` below with the wiring commented underneath it.
 * Most ports use the shared byte-for-byte desc-match helper; solver-agreement
 * (decode + solve + difficulty) stays inline (playbook §4).
 */
import { describe, it } from "vitest";

describe("solo differential (scaffold stub)", () => {
  it.todo("record a C fixture, then enable the byte-match differential below");
});

// Uncomment once __fixtures__/solo-c-reference.json exists (delete the
// `it.todo` stub above), and adjust Fixture/params to this game's shape:
//
// import { describeDescDifferential } from "../../engine/testing/differential.ts";
// import cReference from "./__fixtures__/solo-c-reference.json" with { type: "json" };
// import { newSoloDesc } from "./generator.ts";
// import type { SoloParams } from "./state.ts";
//
// interface Fixture { seed: string; desc: string; w: number; h: number; }
// const data = cReference as { fixtures: Fixture[] };
//
// describeDescDifferential<Fixture, SoloParams>({
//   title: "solo differential (frozen C reference)",
//   fixtures: data.fixtures,
//   label: (f) => `${f.w}x${f.h} seed=${f.seed}`,
//   params: (f) => ({ w: f.w, h: f.h }),
//   newDesc: newSoloDesc,
// });
