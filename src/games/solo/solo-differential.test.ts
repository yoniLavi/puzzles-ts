/**
 * Gated C-vs-TS differential for solo (`add-solo-ts-port`).
 *
 * Solo's generator is RNG-driven over the bit-identical `random.ts` with no
 * `qsort`/order-dependent step in any of the four variants' paths (design D5),
 * so a faithful port reproduces the C desc **byte-for-byte** for the same seed —
 * the strongest bar (docs/games/testing.md § "Byte-match: fidelity where there is a right answer"). On top of that we decode each C-published
 * board and assert the TS solver reaches the *same* (diff, kdiff) the C solver
 * recorded — the solver-gated minimiser depends on that exact agreement
 * (docs/games/solver-and-generator.md § "Solver-gated generation"), so it is the real proof the solver is faithful.
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/solo-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
import cReference from "./__fixtures__/solo-c-reference.json" with { type: "json" };
import { newSoloDesc } from "./generator.ts";
import { solveSolo } from "./solver.ts";
import {
  DIFF_KINTERSECT,
  DIFF_RECURSIVE,
  newState,
  type SoloParams,
  validateDesc,
} from "./state.ts";

interface Fixture {
  c: number;
  r: number;
  symm: number;
  diff: number;
  kdiff: number;
  xtype: boolean;
  killer: boolean;
  seed: string;
  desc: string;
  solverDiff: number;
  solverKdiff: number;
}

const data = cReference as { fixtures: Fixture[] };

function paramsOf(f: Fixture): SoloParams {
  return {
    c: f.c,
    r: f.r,
    symm: f.symm,
    diff: f.diff,
    kdiff: f.kdiff,
    xtype: f.xtype,
    killer: f.killer,
  };
}

function label(f: Fixture): string {
  const v = `${f.c}x${f.r}${f.xtype ? "X" : ""}${f.killer ? "K" : ""}`;
  return `${v} diff=${f.diff} kdiff=${f.kdiff} seed=${f.seed}`;
}

describe("solo differential (frozen C reference)", () => {
  for (const f of data.fixtures) {
    // Both bars run with `upstreamForcingTier`, the *only* place it is set.
    // `audit-guessing-tier-names` moved the forcing-chain rung from Extreme to
    // Unreasonable, which changes every Extreme description and regrades any
    // board whose solution needs a chain. Running the fixtures against
    // upstream's placement keeps the byte-match over the symmetric clue
    // removal, the block structure, every cheaper technique, the killer cages
    // and the codec. See `Difficulty.upstreamForcingTier`.
    it(`${label(f)}: TS desc matches C byte-for-byte`, () => {
      const { desc } = newSoloDesc(paramsOf(f), randomNew(f.seed), true);
      expect(desc).toBe(f.desc);
      expect(validateDesc(paramsOf(f), desc)).toBeNull();
    });

    it(`${label(f)}: TS solver grades the published board as C did`, () => {
      const p = paramsOf(f);
      const s = newState(p, f.desc);
      const { diff, kdiff } = solveSolo(s, DIFF_RECURSIVE, DIFF_KINTERSECT, true);
      expect(diff).toBe(f.solverDiff);
      expect(kdiff).toBe(f.solverKdiff);
    });
  }
});
