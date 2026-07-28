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
 * once (design D6, playbook §4.4).
 *
 * Regenerate the fixture while puzzles/unreleased/boats.c still exists:
 *   rm -rf build/native
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make boats-trace)
 *   build/native/auxiliary/boats-trace \
 *     > src/native/games/boats/__fixtures__/boats-c-reference.json
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
   * (a wall-clock assertion measures the box, not the code — playbook §5.2). */
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
