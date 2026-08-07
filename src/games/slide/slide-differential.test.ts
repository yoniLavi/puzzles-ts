/**
 * Gated C-vs-TS differential for Slide, against a frozen reference recorded
 * from `puzzles/unfinished/slide.c` via `puzzles/auxiliary/slide-trace.c`.
 *
 * Slide's generator is **solver-gated at every step**: it deletes singleton
 * blocks until the board becomes soluble, then keeps each block merge only
 * while the puzzle *stays* soluble. So the published description depends on the
 * exhaustive BFS solver's verdict on every intermediate board, and the single
 * byte-for-byte desc assertion validates the solver, the disjoint-set merge
 * bookkeeping, the run-length codec and the one `shuffle` draw together
 * (docs/games/solver-and-generator.md § "Solver-gated generation") — nothing weaker would come close.
 *
 * The second assertion re-derives the minimum solution length from the C's own
 * published board with the TS solver, so the solver is also checked against a
 * number the generator didn't hand it.
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/slide-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 * Both died in the `add-slide-ts-port` stage-2 commit, if git history is ever
 * needed.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
import cReference from "./__fixtures__/slide-c-reference.json" with { type: "json" };
import { newSlideDesc } from "./generator.ts";
import { solveBoard } from "./solver.ts";
import { newState, type SlideParams, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  maxmoves: number;
  seed: string;
  desc: string;
  minMoves: number;
  /** The C's own generation wall-clock. Carried, never asserted on: a
   * wall-clock assertion measures the box, not the code (docs/games/testing.md § "Seed-deterministic, never clock-gated"). It is
   * here because Slide's generation cost has a huge seed-dependent tail, and
   * this is what distinguishes "upstream's algorithm is slow" from "the port
   * regressed". */
  genMs: number;
}

const { fixtures } = cReference as { fixtures: Fixture[] };
const params = (f: Fixture): SlideParams => ({
  w: f.w,
  h: f.h,
  maxmoves: f.maxmoves,
});
const label = (f: Fixture): string =>
  `${f.w}x${f.h}${f.maxmoves >= 0 ? `m${f.maxmoves}` : "u"} seed=${f.seed}`;

describe("slide differential (frozen C reference)", () => {
  it("covers every upstream preset", () => {
    for (const preset of [
      { w: 7, h: 6, maxmoves: 25 },
      { w: 7, h: 6, maxmoves: -1 },
      { w: 8, h: 6, maxmoves: -1 },
    ]) {
      expect(
        fixtures.some(
          (f) => f.w === preset.w && f.h === preset.h && f.maxmoves === preset.maxmoves,
        ),
      ).toBe(true);
    }
  });

  for (const f of fixtures) {
    it(`${label(f)}: TS desc matches C byte-for-byte`, () => {
      const p = params(f);
      const { desc } = newSlideDesc(p, randomNew(f.seed));
      expect(desc).toBe(f.desc);
      expect(validateDesc(p, f.desc)).toBeNull();
    });
  }

  for (const f of fixtures) {
    it(`${label(f)}: TS solver agrees on the minimum solution length`, () => {
      const p = params(f);
      const s = newState(p, f.desc);
      const { moves, path } = solveBoard(
        s.w,
        s.h,
        s.board,
        s.forcefield,
        s.tx,
        s.ty,
        -1,
        true,
      );
      expect(moves).toBe(f.minMoves);
      // The desc's own `minmoves` field is what the generator published; it
      // must agree with a fresh solve of the board it describes.
      expect(s.minmoves).toBe(f.minMoves);
      expect(path).toHaveLength(f.minMoves);
    });
  }
});
