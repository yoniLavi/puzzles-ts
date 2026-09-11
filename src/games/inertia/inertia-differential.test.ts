/**
 * Inertia differential — the frozen C-reference check (docs/games/testing.md § "Fixture lifecycle", gated).
 *
 * The fixtures in `__fixtures__/inertia-c-reference.json` were recorded from
 * upstream's C. The two halves of the game get two different bars:
 *
 * 1. **The desc is byte-matched.** The generator's only RNG draws are `shuffle`
 *    calls and `random.ts` is bit-identical to `random.c`, so a faithful
 *    generator reproduces the C board for the same seed
 *    (docs/games/testing.md § "Byte-match: fidelity where there is a right answer")
 *    — a cheap check on the generator and the gem-candidate search it gates on.
 *
 * 2. **The route is not.** A route is a traveling-salesman tour: there is no
 *    right answer to match, only better and worse ones, and byte-matching one
 *    would pin the port to C's in-place `memmove` splicing
 *    (docs/games/solver-and-generator.md § "Divergence and what it costs").
 *    So the route is checked on what matters: it is **legal** (every move a
 *    real slide, never onto a mine), it **collects every gem**, and it is **no
 *    longer than C's** — stronger than byte-equality, which a faithfully
 *    reproduced *bad* route would satisfy.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
import reference from "./__fixtures__/inertia-c-reference.json" with { type: "json" };
import { newInertiaDesc } from "./generator.ts";
import { inertiaGame } from "./index.ts";
import { solveRoute } from "./solver.ts";
import { GEM, type InertiaState, newState, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  seed: string;
  desc: string;
  /** The route C's `solve_game` found, as digits — kept as a quality yardstick,
   * not as an answer to reproduce. */
  route: string | null;
}

const FIXTURES = reference.fixtures as Fixture[];

describe("inertia differential vs the C reference", () => {
  for (const f of FIXTURES) {
    const params = { w: f.w, h: f.h };

    it(`${f.w}x${f.h} seed=${f.seed}: generator reproduces the C desc`, () => {
      const { desc } = newInertiaDesc(params, randomNew(f.seed));
      expect(desc).toBe(f.desc);
      expect(validateDesc(params, f.desc)).toBeNull();
    });

    it(`${f.w}x${f.h} seed=${f.seed}: the route collects every gem, alive`, () => {
      const start = newState(params, f.desc);
      const result = solveRoute(start);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Replaying the route through the real move logic is the check: an
      // illegal direction throws, and a mine kills.
      let state: InertiaState = start;
      for (const dir of result.route) {
        state = inertiaGame.executeMove(state, { type: "move", dir });
        expect(state.dead).toBe(false);
      }
      expect(state.gems).toBe(0);
      expect(state.board.cells.includes(GEM)).toBe(false);
    });

    it(`${f.w}x${f.h} seed=${f.seed}: the route is no longer than C's`, () => {
      const result = solveRoute(newState(params, f.desc));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(f.route).not.toBeNull();

      // Upstream grows one tour, always reaching for the nearest uncollected
      // gem. We grow that tour *and* a farthest-first one and keep the shorter
      // (see `solveRoute`), so we can only match or beat it — and on these ten
      // boards we beat it on six and tie on four, for 521 moves against 553.
      expect(result.route.length).toBeLessThanOrEqual((f.route ?? "").length);
    });
  }
});
