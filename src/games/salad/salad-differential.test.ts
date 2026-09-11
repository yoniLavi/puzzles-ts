/**
 * Gated C-vs-TS differential for Salad: the **byte-for-byte desc match**
 * (docs/games/testing.md § "Byte-match: fidelity where there is a right answer").
 *
 * Salad's generator is solver-gated at every clue removal — a clue stays only
 * while the puzzle still solves by pure deduction at the target difficulty — so
 * the published description depends on the solver's verdict on every
 * intermediate board. One byte-match assertion therefore validates the
 * generator's RNG draw order, the solver's exact deductive power (the ABC End
 * View border rule, and the generic cube's reasoning about the empty square)
 * and the run-length codec, all at once. It is also the evidence that the
 * cube's repeated-symbol encoding of the empty square is deductively equivalent
 * to upstream's hole translation (a full order-`o` square whose surplus symbols
 * mean "empty") on every board the generator asks about.
 *
 * **`upstreamLooseGate` is set here and nowhere else.** The shipped generator
 * rejects a board that the tier below already solves, which upstream never
 * checks (see `SaladGenerateOptions.upstreamLooseGate`). That correction changes
 * every Extreme description, so the byte-match is preserved by running the
 * fixtures against upstream's original gate — the shape `spokes` established.
 * The `extra` check below is what the fixtures now say about difficulty: they
 * record C's own grading, misgrades and all, which is the evidence for the
 * divergence rather than a bar the shipped generator is held to.
 *
 * The fixtures span both game modes, both difficulties, every upstream preset,
 * and a size sweep either side of the `order < 8` "empty grid" quality rule.
 * The fixture is **frozen and cannot be regenerated**: the C build and the
 * trace harness that captured it are gone — see `engine/testing/differential.ts`.
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
   * — a wall-clock assertion measures the box, not the code; docs/games/testing.md § "Seed-deterministic, never clock-gated"). */
  genMs: number;
}

const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, SaladParams>({
  title: "salad differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) =>
    `${f.mode === GAMEMODE_LETTERS ? "letters" : "numbers"} ${f.order}x${f.order} n${f.nums} d${f.diff}`,
  params: (f) => ({ order: f.order, nums: f.nums, mode: f.mode, diff: f.diff }),
  newDesc: (p, rng) => newSaladDesc(p, rng, { upstreamLooseGate: true }),
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
