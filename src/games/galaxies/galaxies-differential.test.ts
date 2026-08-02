/**
 * Galaxies — gated differential check against a frozen snapshot of
 * C-built reference boards (`__fixtures__/galaxies-c-reference.json`).
 *
 * C-free: this test does not link the C build. It asserts that every
 * recorded reference board:
 *   1. Decodes through the TS port (`newState`), and
 *   2. Is uniquely solvable at exactly the C-recorded difficulty
 *      under the TS solver — no `Ambiguous`, no diagnosis at a
 *      different difficulty.
 *
 * Generator divergence between the TS port and the C engine is *not*
 * tested here — by design (see `ts-migration` and the change's
 * design.md, D7). The TS generator may produce different boards for
 * the same seed; that's surfaced (advisorially) by
 * `scripts/diff-galaxies.test.ts`.
 *
 * The fixture is a frozen snapshot — both `puzzles/galaxies.c` and
 * `puzzles/auxiliary/galaxies-trace.c` were deleted in the same change
 * that registered the TS port (per the per-game C-deletion doctrine).
 * If ever regenerating is needed (e.g. to broaden the snapshot), the
 * trace harness can be recovered from git history at
 * `puzzles/auxiliary/galaxies-trace.c` prior to its deletion commit.
 */
import { describe, expect, it } from "vitest";
import cReference from "./__fixtures__/galaxies-c-reference.json" with { type: "json" };
import { GalaxiesDiff } from "./index.ts";
import { clearForSolve, solverState } from "./solver.ts";
import { blankGame, decodeGame, rebuildDots } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  diff: "n" | "u";
  seed: string;
  desc: string;
  solverDiff: string;
}

const data = cReference as { fixtures: Fixture[] };

function diffChar(d: GalaxiesDiff): string {
  if (d === GalaxiesDiff.Normal) return "n";
  if (d === GalaxiesDiff.Unreasonable) return "u";
  if (d === GalaxiesDiff.Impossible) return "I";
  if (d === GalaxiesDiff.Ambiguous) return "A";
  return "U";
}

describe("Galaxies differential (frozen C reference)", () => {
  for (const f of data.fixtures) {
    it(`${f.w}x${f.h}/${f.diff} seed=${f.seed}: TS solver matches C`, () => {
      const s = blankGame(f.w, f.h);
      const err = decodeGame(s, f.desc);
      expect(err).toBeNull();
      s.dots = rebuildDots(s);

      // Run the TS solver from a clean state at UNREASONABLE.
      clearForSolve(s);
      const diff = solverState(s, GalaxiesDiff.Unreasonable);
      expect(diffChar(diff)).toBe(f.solverDiff);
    });
  }
});
