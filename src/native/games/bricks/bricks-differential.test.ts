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

describeDescDifferential<Fixture, BricksParams>({
  title: "bricks differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h}d${f.diff} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h, diff: f.diff }),
  newDesc: newBricksDesc,
  extra: (f, p) => {
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
});
