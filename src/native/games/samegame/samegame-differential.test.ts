/**
 * Same Game — gated differential check against a frozen snapshot of
 * C-generated reference boards (`__fixtures__/samegame-c-reference.json`).
 *
 * C-free: this test does not link the C build. Same Game's generator
 * consults no solver (unlike Flood), so the *desc* is the whole
 * reproducible output. The strongest meaningful bar is therefore that
 * the TS generator reproduces the C engine's grid byte-for-byte for the
 * same seed — across BOTH the guaranteed-soluble inverse-move generator
 * and the legacy not-guaranteed-soluble random generator — proving
 * `random.ts` is bit-identical end-to-end through every `randomUpto`
 * call those generators make. See the change's design D6/R1.
 *
 * The fixture is a frozen snapshot — both `puzzles/samegame.c` and
 * `puzzles/auxiliary/samegame-trace.c` are deleted in the same change
 * that registers the TS port (per-game C-deletion doctrine). To
 * regenerate (e.g. to broaden the snapshot) before that deletion:
 *   cmake -B build/native -S puzzles -DUSE_TS_LEAVES=0
 *   make -C build/native samegame-trace
 *   ./build/native/auxiliary/samegame-trace \
 *     > src/native/games/samegame/__fixtures__/samegame-c-reference.json
 * (`-DUSE_TS_LEAVES=0` restores the C `random.c`, which the umbrella
 * default drops.) After deletion, recover the harness from git history.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import cReference from "./__fixtures__/samegame-c-reference.json" with { type: "json" };
import { newDesc, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  ncols: number;
  scoresub: number;
  soluble: boolean;
  seed: string;
  desc: string;
}

const data = cReference as { fixtures: Fixture[] };

describe("Same Game differential (frozen C reference)", () => {
  for (const f of data.fixtures) {
    const label = `${f.w}x${f.h}c${f.ncols}s${f.scoresub}${f.soluble ? "" : "r"} seed=${f.seed}`;
    it(`${label}: TS desc matches C byte-for-byte`, () => {
      const { desc } = newDesc(
        {
          w: f.w,
          h: f.h,
          ncols: f.ncols,
          scoresub: f.scoresub,
          soluble: f.soluble,
        },
        randomNew(f.seed),
      );
      expect(desc).toBe(f.desc);
      expect(
        validateDesc(
          { w: f.w, h: f.h, ncols: f.ncols, scoresub: f.scoresub, soluble: f.soluble },
          f.desc,
        ),
      ).toBeNull();
    });
  }
});
