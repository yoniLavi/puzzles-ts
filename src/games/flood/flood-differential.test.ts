/**
 * Flood — gated differential check against a frozen snapshot of
 * C-generated reference boards (`__fixtures__/flood-c-reference.json`).
 *
 * Flood's move limit is `solver_move_count + leniency`, so the par depends
 * on the heuristic solver's exact choices. The bar is therefore the
 * **whole** game description for the same seed: the grid characters
 * (proving `random.ts` is bit-identical end-to-end) *and* the trailing
 * move limit (proving the TS solver makes the same choices as C).
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/flood-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/flood-c-reference.json" with { type: "json" };
import { type FloodParams, newDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  colors: number;
  leniency: number;
  seed: string;
  desc: string;
}

const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, FloodParams>({
  title: "Flood differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h}c${f.colors}m${f.leniency} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h, colors: f.colors, leniency: f.leniency }),
  newDesc,
});
