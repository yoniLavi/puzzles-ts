/**
 * Gated differential: the TS generator reproduces the C generator's desc
 * **byte for byte** for the same seed.
 *
 * This is the strongest bar available (playbook §4.3), and it is valid here
 * because the desc is a pure function of (params, seed): `random.ts` is
 * bit-identical to `random.c`, every RNG draw is a `randomUpto`, and the one
 * ordered structure the generator indexes into — the sorted set of candidate
 * grid extensions, keyed by upstream's `xyd_cmp` — is reproduced exactly by
 * `SortedMultiset`. Nothing on the path to the desc is a `qsort`, so no
 * implementation-defined tie order can leak in (contrast Undead, §4.8).
 *
 * It pins, in particular, the three things a plausible-looking port gets subtly
 * wrong: the growth loop's draw-then-remove-at-index order; the shuffle's
 * *reject after drawing* loop (a declined slide has already consumed its RNG
 * draws, and must not be retried by re-rolling them); and that barriers are
 * chosen after the shuffle rather than before.
 *
 * The fixtures were recorded from `puzzles/auxiliary/netslide-trace.c`. That
 * harness and `puzzles/netslide.c` are deleted when the port ships at
 * owner-confirmed parity; this frozen snapshot is what survives.
 */

import { describe, expect, it } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import { randomNew } from "../../random/index.ts";
import reference from "./__fixtures__/netslide-c-reference.json" with { type: "json" };
import { newDesc } from "./generator.ts";
import { isComplete, type NetslideParams, newState, validateDesc } from "./state.ts";

interface NetslideFixture {
  w: number;
  h: number;
  wrapping: boolean;
  barrierProbability: number;
  movetarget: number;
  seed: string;
  desc: string;
  aux: string;
}

const FIXTURES: readonly NetslideFixture[] = reference.fixtures;

const paramsOf = (f: NetslideFixture): NetslideParams => ({
  w: f.w,
  h: f.h,
  wrapping: f.wrapping,
  barrierProbability: f.barrierProbability,
  movetarget: f.movetarget,
});

describeDescDifferential<NetslideFixture, NetslideParams>({
  title: "netslide differential (vs C reference)",
  fixtures: FIXTURES,
  params: paramsOf,
  label: (f) =>
    `${f.w}x${f.h}${f.wrapping ? "w" : ""} b=${f.barrierProbability}` +
    `${f.movetarget ? ` m=${f.movetarget}` : ""}`,
  newDesc,
  extra: (f, p) => {
    expect(validateDesc(p, f.desc)).toBeNull();
  },
});

describe("netslide differential: the solution grid", () => {
  for (const f of FIXTURES) {
    it(`${f.w}x${f.h} ${f.seed}: TS aux matches C, and solves the board`, () => {
      const p = paramsOf(f);
      const { aux } = newDesc(p, randomNew(f.seed));
      expect(aux).toBe(f.aux);

      // The aux *is* the solve move, so this also pins that Solve leaves a
      // genuinely finished board — not merely a grid C happened to emit.
      const s = newState(p, f.desc);
      const solved = {
        ...s,
        tiles: Uint8Array.from(f.aux, (c) => Number.parseInt(c, 16)),
      };
      expect(isComplete(solved)).toBe(true);
    });
  }
});
