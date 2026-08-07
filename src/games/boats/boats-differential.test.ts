/**
 * Gated C-vs-TS differential for Boats.
 *
 * For each frozen C-reference fixture (see `puzzles/auxiliary/boats-trace.c`),
 * the TS `newBoatsDesc`, replayed over the bit-identical `random.ts` seeded the
 * same way, must reproduce the C description byte-for-byte.
 *
 * That single assertion is unusually strong. `new_game_desc` is solver-gated at
 * every stage — it seeds given clues while the Easy solver is stuck, removes
 * each given clue only while the board still solves at the target difficulty,
 * does the same for the border numbers under "remove numbers", and finally
 * rejects any board that does not need *exactly* the target difficulty. So the
 * published description depends on the solver's verdict on every intermediate
 * board, and matching it validates the generator, all four solver tiers, the
 * `Dsf` root choice that `checkDsf` reads as an element, and the codec, all at
 * once (design D6, docs/games/solver-and-generator.md § "Solver-gated generation").
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/boats-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */

import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/boats-c-reference.json" with { type: "json" };
import { newBoatsDesc, validateParams } from "./generator.ts";
import { type BoatsParams, decodeFleet, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  fleet: number;
  diff: number;
  strip: boolean;
  /** The fleet configuration as `encode_params` writes it, e.g. `"3,2,1"`. */
  fleetdata: string;
  seed: string;
  desc: string;
  /** What the C build took, in ms — carried for comparison, never asserted
   * (a wall-clock assertion measures the box, not the code — docs/games/testing.md § "Seed-deterministic, never clock-gated"). */
  genMs: number;
}

const data = cReference as { fixtures: Fixture[] };

const paramsOf = (f: Fixture): BoatsParams => ({
  w: f.w,
  h: f.h,
  fleet: f.fleet,
  fleetData: decodeFleet(f.fleetdata, f.fleet),
  diff: f.diff,
  strip: f.strip,
});

describeDescDifferential<Fixture, BoatsParams>({
  title: "boats differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) =>
    `${f.w}x${f.h}f${f.fleet}d${f.diff}${f.strip ? "S" : ""} [${f.fleetdata}] seed=${f.seed}`,
  params: paramsOf,
  newDesc: newBoatsDesc,
  extra: (f, p) => {
    // The C description must also pass the port's own validators — a codec
    // that round-trips against itself but rejects upstream's output would
    // otherwise slip through.
    if (validateDesc(p, f.desc) !== null) throw new Error("C desc failed validateDesc");
    if (validateParams(p, true) !== null)
      throw new Error("C fixture params failed validateParams");
  },
});
