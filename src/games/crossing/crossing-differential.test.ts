/**
 * Gated C-vs-TS differential for Crossing.
 *
 * For each frozen C-reference fixture, the TS `newCrossingDesc`, replayed over
 * the bit-identical `random.ts` seeded the same way and asked for upstream's
 * isolated-cell behavior, must reproduce the C desc byte-for-byte. Because
 * generation retries until the deductive solver reaches a complete unique
 * answer, this one assertion validates the wall-growth loop (including
 * `checkPool`'s mutating test), the digit fill, the run collection order, the
 * solver's every deduction and the codec together.
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/crossing-trace.c` against upstream's C, under an
 * Emscripten/CMake build this repo does not have — see
 * `engine/testing/differential.ts`.
 */

import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/crossing-c-reference.json" with { type: "json" };
import { newCrossingDesc } from "./generator.ts";
import { solveCrossing } from "./solver.ts";
import {
  type CrossingParams,
  collectRuns,
  makePuzzle,
  readDesc,
  validateDesc,
} from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  sym: boolean;
}

const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, CrossingParams>({
  title: "crossing differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h}${f.sym ? "S" : ""} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h, sym: f.sym }),
  // Upstream accepts boards containing an isolated open cell; the shipped
  // generator rejects them. Reproducing the C's descriptions therefore needs
  // upstream's behavior explicitly — the four-line divergence is the only code
  // this oracle cannot see, and `crossing.test.ts` asserts separately that the
  // flag still changes the outcome, so this can't silently decay into testing
  // the shipped path.
  newDesc: (params, rng) =>
    newCrossingDesc(params, rng, { upstreamIsolatedCells: true }),
  extra: (f, p) => {
    // The C desc must also pass the port's own validator, decode to exactly one
    // number per run (what a solvable Nansuke means), and re-solve to a unique
    // complete answer under the TS solver.
    if (validateDesc(p, f.desc) !== null) throw new Error("C desc failed validateDesc");
    const { walls, numbers } = readDesc(p, f.desc);
    const runs = collectRuns(p.w, p.h, walls);
    if (runs.length !== numbers.length)
      throw new Error(`run/number count mismatch: ${runs.length} vs ${numbers.length}`);
    if (solveCrossing(makePuzzle(p.w, p.h, walls, numbers)).status !== "valid")
      throw new Error("TS solver did not uniquely solve the C board");
  },
});
