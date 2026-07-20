/**
 * Byte-match differential for the Loopy generator, solver and codec.
 *
 * **This is the assertion that validates the whole port at once.** Loopy's
 * generator is solver-gated at every step — `gameHasUniqueSoln` decides each
 * clue removal, each board retry and the too-easy rejection — so the emitted
 * description depends on the solver's verdict about every intermediate board.
 * A single wrong deduction anywhere in the ~1,100 lines of `solver.ts`, a
 * single RNG draw out of order in `generator.ts` or `loopgen.ts`, or one
 * off-by-one in the run-length clue encoding, and the description differs.
 * Nothing else available is as strong.
 *
 * It is also this change's first real exercise of `extend-grid-tilings` and
 * `add-aperiodic-tilings`, which shipped with no user-visible surface and were
 * accepted on the explicit basis that Loopy would be their first acceptance
 * test. Hence the matrix is skewed to **breadth**: all 18 grid types appear.
 *
 * Regenerate the fixture with:
 *   scripts/build-native.sh loopy-trace && build/native/auxiliary/loopy-trace \
 *     > src/native/games/loopy/__fixtures__/loopy-c-reference.json
 *
 * **What this cannot cover**, and where to look instead: the C *aborts* on a
 * degenerate Penrose patch and *hangs* on an unfavourable one, so no fixture
 * can be recorded for either. Those paths are the TS port's own recovery (see
 * `grid-build.ts` and `generator.ts`) and are covered by `loopy.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import reference from "./__fixtures__/loopy-c-reference.json" with { type: "json" };
import { newDesc } from "./generator.ts";
import { encodeParams, LOOPY_DIFFS, LOOPY_GRIDS, type LoopyParams } from "./params.ts";
import { solveGame } from "./solver.ts";
import { newState, validateDesc } from "./state.ts";

interface LoopyFixture {
  /** Loopy's own grid-type index — not `grid.ts`'s `GRIDGEN_LIST` ordering. */
  type: number;
  typeName: string;
  w: number;
  h: number;
  /** The difficulty's params character (`e`/`n`/`t`/`h`). */
  diff: string;
  diffIndex: number;
  /** The C's `encode_params(params, true)`. */
  params: string;
  seed: string;
  /** The C's generated game description. */
  desc: string;
}

const fixtures = (reference as { fixtures: LoopyFixture[] }).fixtures;

const paramsOf = (f: LoopyFixture): LoopyParams => ({
  w: f.w,
  h: f.h,
  diff: f.diffIndex,
  type: f.type,
});

describe("loopy C differential", () => {
  it("covers every grid type and every difficulty", () => {
    // The point of the matrix, asserted rather than assumed: a fixture file
    // regenerated with a narrower matrix should fail loudly, not silently
    // weaken the guarantee.
    expect(new Set(fixtures.map((f) => f.type)).size).toBe(LOOPY_GRIDS.length);
    expect(new Set(fixtures.map((f) => f.diff)).size).toBe(LOOPY_DIFFS.length);
  });

  for (const f of fixtures) {
    describe(`${f.typeName} ${f.w}x${f.h} ${f.diff} (${f.seed})`, () => {
      it("encodes the same params string as the C", () => {
        expect(encodeParams(paramsOf(f), true)).toBe(f.params);
      });

      it("generates the same description, byte for byte", () => {
        const { desc } = newDesc(paramsOf(f), randomNew(f.seed));
        expect(desc).toBe(f.desc);
      });

      it("accepts and grades the C's board at exactly its recorded difficulty", () => {
        // Independent of the byte-match above: this checks the solver against a
        // board the C built, so it still says something if the generator and
        // the solver ever diverged together.
        const p = paramsOf(f);
        expect(validateDesc(p, f.desc)).toBeNull();
        const state = newState(p, f.desc);
        expect(solveGame(state, p.diff).status).toBe("solved");
        if (p.diff > 0) {
          // The generator rejects a board solvable one rung easier, so the C's
          // board must genuinely need the difficulty it claims.
          expect(solveGame(state, p.diff - 1).status).not.toBe("solved");
        }
      });
    });
  }
});
