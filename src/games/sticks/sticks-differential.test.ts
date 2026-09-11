/**
 * Gated C-vs-TS differential for Sticks: for each fixture frozen from
 * upstream's `sticks.c`, `newSticksDesc` over the bit-identical RNG must
 * reproduce the C desc byte-for-byte.
 *
 * Because generation gates every fill attempt and every clue removal on
 * `sticksSolveGame`, one byte-match validates the generator (the symmetric
 * black placement, the fill/clue draws, the minimization shuffle), the
 * contradiction solver's exact deductive power, and the run-length codec
 * together. The `extra` check also round-trips each C desc through
 * `validateDesc` + `newState` + `encodeDesc` (codec inverse property).
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/sticks-c-reference.json" with { type: "json" };
import { newSticksDesc } from "./generator.ts";
import { encodeDesc, newState, type SticksParams, validateDesc } from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  blackpc: number;
  symm: number;
}
const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, SticksParams>({
  title: "sticks differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h}b${f.blackpc}s${f.symm} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h, blackpc: f.blackpc, symm: f.symm }),
  newDesc: newSticksDesc,
  extra: (f, p) => {
    expect(validateDesc(p, f.desc)).toBeNull();
    const state = newState(p, f.desc);
    expect(encodeDesc(state.grid, state.numbers, p.w, p.h)).toBe(f.desc);
  },
});
