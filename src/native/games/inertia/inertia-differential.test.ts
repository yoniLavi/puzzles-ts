/**
 * Inertia differential — the frozen C-reference check (playbook §4.1, gated).
 *
 * The fixtures in `__fixtures__/inertia-c-reference.json` were recorded from
 * the C build by `puzzles/auxiliary/inertia-trace.c`. Two bars, both
 * byte-for-byte:
 *
 * 1. **The desc.** The generator's only RNG draws are `shuffle` calls, and
 *    `random.ts` is bit-identical to `random.c`, so a faithful generator
 *    reproduces the C board exactly for the same seed (playbook §4.3).
 *
 * 2. **The route.** `solve_game` is a *deterministic* approximate TSP tour — it
 *    draws no randomness at all — so a faithful port of its graph construction,
 *    BFS orderings and tour reduction reproduces the C's chosen route exactly.
 *    (Its one `qsort` sorts `target·n + source` keys that are distinct by
 *    construction, so implementation-defined tie order never arises — contrast
 *    Undead, playbook §4.8.) This is a far stronger check on ~250 lines of tour
 *    code than "some valid route exists" would be.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
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

    it(`${f.w}x${f.h} seed=${f.seed}: route solver reproduces the C route`, () => {
      const result = solveRoute(newState(params, f.desc));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.route.join("")).toBe(f.route);
    });

    it(`${f.w}x${f.h} seed=${f.seed}: the route actually collects every gem`, () => {
      let state: InertiaState = newState(params, f.desc);
      const result = solveRoute(state);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      for (const dir of result.route) {
        state = inertiaGame.executeMove(state, { type: "move", dir });
      }
      expect(state.dead).toBe(false);
      expect(state.gems).toBe(0);
      expect(state.grid.includes(GEM)).toBe(false);
    });
  }
});
