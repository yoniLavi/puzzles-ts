/**
 * Gated C-vs-TS differential for Ascent (design D7 of add-ascent-ts-port):
 * for each frozen fixture recorded from `puzzles/unreleased/ascent.c` via
 * `puzzles/auxiliary/ascent-trace.c`, `newAscentDesc` over the bit-identical
 * RNG must reproduce the C desc byte-for-byte.
 *
 * Because generation is solver-gated at every step (a clue is blanked, or a
 * number moved to an edge arrow, only if the graded solver still solves the
 * result), a single byte-match validates the generator's RNG draw order (the
 * backbite path, the removal shuffle, the Edges matching), the four-tier
 * solver's exact deductive power, the grid padding for every mode, and the
 * run-length codec — all at once. The `extra` check round-trips each C desc
 * through `validateDesc` + `newState` + `encodeGridDesc` (codec inverse).
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/ascent-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/ascent-c-reference.json" with { type: "json" };
import { newAscentDesc } from "./generator.ts";
import {
  type AscentParams,
  encodeGridDesc,
  newAscentState,
  validateAscentDesc,
} from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  diff: number;
  mode: number;
  removeends: boolean;
  symmetrical: boolean;
}
const data = cReference as { fixtures: Fixture[] };

const MODE_CHARS = "ORHCE";
const DIFF_CHARS = "ENTH";

describeDescDifferential<Fixture, AscentParams>({
  title: "ascent differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) =>
    `${f.w}x${f.h} ${MODE_CHARS[f.mode]}${DIFF_CHARS[f.diff]}${f.removeends ? "re" : ""}${f.symmetrical ? "sym" : ""} seed=${f.seed}`,
  params: (f) => ({
    w: f.w,
    h: f.h,
    diff: f.diff,
    mode: f.mode,
    removeends: f.removeends,
    symmetrical: f.symmetrical,
  }),
  newDesc: newAscentDesc,
  extra: (f, p) => {
    expect(validateAscentDesc(p, f.desc)).toBeNull();
    const state = newAscentState(p, f.desc);
    expect(encodeGridDesc(state.grid, state.w * state.h)).toBe(f.desc);
  },
});
