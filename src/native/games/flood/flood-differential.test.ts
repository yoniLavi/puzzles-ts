/**
 * Flood — gated differential check against a frozen snapshot of
 * C-generated reference boards (`__fixtures__/flood-c-reference.json`).
 *
 * C-free: this test does not link the C build. Unlike the permutation
 * games (whose generators don't consult a solver, so only the *grid*
 * need reproduce), Flood's move limit is `solver_move_count + leniency`
 * — the par depends on the heuristic solver's exact choices. So the
 * strongest meaningful bar here is that the TS generator reproduces the
 * C engine's **whole** game description for the same seed: the grid
 * characters (proving `random.ts` is bit-identical end-to-end) *and*
 * the trailing move limit (proving the TS solver makes the same choices
 * as C). See the change's design D-RISK.
 *
 * The fixture is a frozen snapshot — both `puzzles/flood.c` and
 * `puzzles/auxiliary/flood-trace.c` are deleted in the same change that
 * registers the TS port (per-game C-deletion doctrine). To regenerate
 * (e.g. to broaden the snapshot) before that deletion:
 *   cmake -B build/native -S puzzles -DUSE_TS_LEAVES=0
 *   make -C build/native flood-trace
 *   ./build/native/auxiliary/flood-trace \
 *     > src/native/games/flood/__fixtures__/flood-c-reference.json
 * (`-DUSE_TS_LEAVES=0` restores the C `random.c`, which the umbrella
 * default drops.) After deletion, recover the harness from git history.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import cReference from "./__fixtures__/flood-c-reference.json" with { type: "json" };
import { newDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  colours: number;
  leniency: number;
  seed: string;
  desc: string;
}

const data = cReference as { fixtures: Fixture[] };

describe("Flood differential (frozen C reference)", () => {
  for (const f of data.fixtures) {
    it(`${f.w}x${f.h}c${f.colours}m${f.leniency} seed=${f.seed}: TS desc matches C byte-for-byte`, () => {
      const { desc } = newDesc(
        { w: f.w, h: f.h, colours: f.colours, leniency: f.leniency },
        randomNew(f.seed),
      );
      expect(desc).toBe(f.desc);
    });
  }
});
