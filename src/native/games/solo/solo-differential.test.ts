/**
 * Gated C-vs-TS differential for solo (`add-solo-ts-port`).
 *
 * Solo's generator is RNG-driven over the bit-identical `random.ts` with no
 * `qsort`/order-dependent step in any of the four variants' paths (design D5),
 * so a faithful port reproduces the C desc **byte-for-byte** for the same seed —
 * the strongest bar (playbook §4.3). On top of that we decode each C-published
 * board and assert the TS solver reaches the *same* (diff, kdiff) the C solver
 * recorded — the solver-gated minimiser depends on that exact agreement
 * (playbook §4.4), so it is the real proof the solver is faithful.
 *
 * Regenerate the frozen fixture while `puzzles/solo.c` still exists:
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make solo-trace)
 *   build/native/auxiliary/solo-trace \
 *     > src/native/games/solo/__fixtures__/solo-c-reference.json
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
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
    it(`${label(f)}: TS desc matches C byte-for-byte`, () => {
      const { desc } = newSoloDesc(paramsOf(f), randomNew(f.seed));
      expect(desc).toBe(f.desc);
      expect(validateDesc(paramsOf(f), desc)).toBeNull();
    }, 30_000);

    it(`${label(f)}: TS solver grades the published board as C did`, () => {
      const p = paramsOf(f);
      const s = newState(p, f.desc);
      const { diff, kdiff } = solveSolo(s, DIFF_RECURSIVE, DIFF_KINTERSECT);
      expect(diff).toBe(f.solverDiff);
      expect(kdiff).toBe(f.solverKdiff);
    });
  }
});
