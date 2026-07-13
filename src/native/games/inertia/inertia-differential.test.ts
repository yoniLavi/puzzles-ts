/**
 * Inertia differential — the frozen C-reference check (playbook §4.1, gated).
 *
 * The fixtures in `__fixtures__/inertia-c-reference.json` were recorded from the
 * C build by `puzzles/auxiliary/inertia-trace.c`. The two halves of the game get
 * two quite different bars, and the difference is the point:
 *
 * 1. **The desc is byte-matched.** The generator's only RNG draws are `shuffle`
 *    calls and `random.ts` is bit-identical to `random.c`, so a faithful
 *    generator reproduces the C board exactly for the same seed (playbook §4.3).
 *    That is a real, cheap check on the generator *and* on the gem-candidate
 *    search it gates on, so it stays.
 *
 * 2. **The route is not.** `solve_game` is deterministic, so an exactly faithful
 *    port would reproduce C's route too — and the original port did, which is
 *    how it caught a bug. But a route is a *travelling-salesman tour*: there is
 *    no right answer to match, only better and worse answers, and byte-matching
 *    one pins the port to C's in-place `memmove` splicing (see the tour history
 *    in `solver.ts`). The byte-parity scope doctrine (playbook §4) puts the
 *    generator/solver/codec under fidelity and everything else under "write it
 *    well", and an approximate optimiser is squarely the latter.
 *
 *    So the route is checked on what actually matters — it is **legal** (every
 *    move is a real slide, and it never touches a mine), it **collects every
 *    gem**, and it is **no longer than the route C found**. That is a stronger
 *    guarantee than byte-equality, which would have been satisfied by faithfully
 *    reproducing a *bad* route.
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
