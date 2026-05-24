/*
 * diff-galaxies.test.ts — ADVISORY live C-vs-TS differential spot-check
 * for the Galaxies port (openspec `add-galaxies-ts-port`). NOT part of
 * the commit/CI gate: it lives outside `src/`, so the default
 * `vitest run` (vitest.config.ts → include `src/**`) never collects it.
 * Run on demand with its own config:
 *
 *   ./scripts/build-native.sh galaxies-trace          # needs puzzles/galaxies.c
 *   npx vitest run --config scripts/diff-galaxies.vitest.config.mts
 *
 * It reads the JSON fixture produced by the trace harness (the same
 * file the gated `galaxies-differential.test.ts` reads) and, for every
 * recorded board, verifies that the TS solver returns a unique
 * solution at exactly the C-recorded difficulty. Per design D7, this
 * is the "real bar" — generator divergence between C and TS is OK,
 * solver agreement is what matters.
 *
 * galaxies.c (hence galaxies-trace) is deleted when the port ships at
 * owner-confirmed parity; the C-free form of this check is the gated
 * `src/native/games/galaxies/galaxies-differential.test.ts`. Re-run
 * this from the change's commit if ever needed.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GalaxiesDiff } from "../src/native/games/galaxies/index.ts";
import { clearForSolve, solverState } from "../src/native/games/galaxies/solver.ts";
import {
  blankGame,
  decodeGame,
  rebuildDots,
} from "../src/native/games/galaxies/state.ts";

const FIXTURE = "src/native/games/galaxies/__fixtures__/galaxies-c-reference.json";

interface Fixture {
  w: number;
  h: number;
  diff: "n" | "u";
  seed: string;
  desc: string;
  solverDiff: string;
}

function diffChar(d: GalaxiesDiff): string {
  if (d === GalaxiesDiff.Normal) return "n";
  if (d === GalaxiesDiff.Unreasonable) return "u";
  if (d === GalaxiesDiff.Impossible) return "I";
  if (d === GalaxiesDiff.Ambiguous) return "A";
  return "U";
}

describe("Galaxies live differential (advisory)", () => {
  if (!existsSync(FIXTURE)) {
    it.skip("fixture missing — regenerate via scripts/build-native.sh galaxies-trace", () => {});
    return;
  }
  const data: { fixtures: Fixture[] } = JSON.parse(readFileSync(FIXTURE, "utf8"));
  for (const f of data.fixtures) {
    it(`${f.w}x${f.h}/${f.diff} seed=${f.seed}: TS solver matches C-recorded diff`, () => {
      const s = blankGame(f.w, f.h);
      const err = decodeGame(s, f.desc);
      expect(err).toBeNull();
      s.dots = rebuildDots(s);
      clearForSolve(s);
      const diff = solverState(s, GalaxiesDiff.Unreasonable);
      const got = diffChar(diff);
      if (got !== f.solverDiff) {
        // Advisory: this is review signal, not a hard pass/fail in
        // CI. The test still fails when run on demand so the diff
        // is loud.
        // eslint-disable-next-line no-console
        console.warn(
          `Galaxies divergence: ${f.w}x${f.h}/${f.diff} seed=${f.seed}: C=${f.solverDiff}, TS=${got}`,
        );
      }
      expect(got).toBe(f.solverDiff);
    });
  }
});
