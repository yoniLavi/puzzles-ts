/**
 * Gated C-vs-TS differential for Salad: the **byte-for-byte desc match**
 * (playbook §4.3/§4.4).
 *
 * Salad's generator is solver-gated at every clue removal — a clue stays only
 * while the puzzle still solves by pure deduction at the target difficulty — so
 * the published description depends on the solver's verdict on every
 * intermediate board. One byte-match assertion therefore validates the
 * generator's RNG draw order, the solver's exact deductive power (including the
 * pseudo-Latin hole translation and the ABC End View border rule) and the
 * run-length codec, all at once.
 *
 * The fixtures span both game modes, both difficulties, every upstream preset,
 * and a size sweep either side of the `order < 8` "empty grid" quality rule.
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/salad-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/salad-c-reference.json" with { type: "json" };
import { newSaladDesc } from "./generator.ts";
import { saladSolve } from "./solver.ts";
import {
  GAMEMODE_LETTERS,
  newState,
  type SaladParams,
  scratchBoard,
  validateDesc,
} from "./state.ts";

interface Fixture {
  order: number;
  nums: number;
  mode: number;
  diff: number;
  seed: string;
  desc: string;
  /** Lowest difficulty at which the C solver finishes the board. */
  solverDiff: number;
  /** The C's own generation wall-clock, carried for reference (never asserted
   * — a wall-clock assertion measures the box, not the code; playbook §5.2). */
  genMs: number;
}

const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, SaladParams>({
  title: "salad differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) =>
    `${f.mode === GAMEMODE_LETTERS ? "letters" : "numbers"} ${f.order}x${f.order} n${f.nums} d${f.diff}`,
  params: (f) => ({ order: f.order, nums: f.nums, mode: f.mode, diff: f.diff }),
  newDesc: newSaladDesc,
  extra: (f, p) => {
    // The C desc must decode cleanly, and the TS solver must reach the same
    // verdict the C solver recorded for it.
    expect(validateDesc(p, f.desc)).toBeNull();
    const s = newState(p, f.desc);
    expect(saladSolve(scratchBoard(s), f.solverDiff)).toBe(true);
    if (f.solverDiff > 0) {
      expect(saladSolve(scratchBoard(s), f.solverDiff - 1)).toBe(false);
    }
  },
});
