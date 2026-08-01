/**
 * Gated C-vs-TS differential for Bricks (design D8 of add-bricks-ts-port):
 * for each frozen fixture recorded from `puzzles/unreleased/bricks.c` via
 * `puzzles/auxiliary/bricks-trace.c`, the TS `newBricksDesc` over the
 * bit-identical RNG must reproduce the C desc byte-for-byte.
 *
 * Because generation gates every clue removal on `solveGame`, one byte-match
 * validates the generator (the conditional fill draws, the removal shuffle),
 * the contradiction solver's exact deductive power, and the run-length codec
 * together. The `extra` check also round-trips each C desc through
 * `validateDesc` + `newState` + `encodeDesc` (codec inverse property) and
 * confirms a fresh solve of the decoded board reaches completion.
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/bricks-c-reference.json" with { type: "json" };
import { newBricksDesc } from "./generator.ts";
import { solveGame } from "./solver.ts";
import { type BricksParams, encodeDesc, newState, validateDesc } from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  diff: number;
}
const data = cReference as { fixtures: Fixture[] };

/** The 12x8 Tricky fixture alone costs **100 s** of the suite's 1,178 — 87% of
 * this file. Its difficulty is already carried by the 7x6, 8x5 and 10x8 Tricky
 * fixtures, so it adds board size against the same generator/solver/codec path,
 * not a configuration. It runs under `npm run test:slow`. */
const isSlow = (f: Fixture) => f.w * f.h >= 96;

const common = {
  label: (f: Fixture) => `${f.w}x${f.h}d${f.diff} seed=${f.seed}`,
  params: (f: Fixture): BricksParams => ({ w: f.w, h: f.h, diff: f.diff }),
  newDesc: newBricksDesc,
  extra: (f: Fixture, p: BricksParams) => {
    // Codec inverse: validate → decode → re-encode is the identity.
    expect(validateDesc(p, f.desc)).toBeNull();
    const state = newState(p, f.desc);
    expect(encodeDesc(state.grid, state.w, state.h)).toBe(f.desc);
    // The decoded board solves uniquely to completion.
    const grid = state.grid.slice();
    expect(solveGame(grid, state.w, state.h, 2 /* TRICKY */, true, true)).toBe(
      "complete",
    );
  },
};

describeDescDifferential<Fixture, BricksParams>({
  title: "bricks differential (frozen C reference)",
  fixtures: data.fixtures.filter((f) => !isSlow(f)),
  ...common,
});

describeDescDifferential<Fixture, BricksParams>({
  title: "bricks differential, 12x8 (frozen C reference; slow by construction)",
  fixtures: data.fixtures.filter(isSlow),
  ...common,
  slow: true,
});
