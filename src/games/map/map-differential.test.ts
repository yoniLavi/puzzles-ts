/**
 * Gated C-vs-TS byte-match differential for Map (openspec add-map-ts-port).
 *
 * The generator is RNG-draw-order-critical (genmap's cumulative-frequency
 * draws, fourcolor's shuffle + random-most-constrained pick, the clue-reduction
 * shuffle) and solver-gated (the desc depends on `map_solver`'s uniqueness
 * verdict on every intermediate board). So we assert two things per fixture:
 *   1. `newMapDesc(p, randomNew(seed))` reproduces the C desc AND aux exactly;
 *   2. the TS solver grades the decoded board at the C-recorded difficulty.
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/map-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
import cReference from "./__fixtures__/map-c-reference.json" with { type: "json" };
import { newMapDesc } from "./generator.ts";
import { newMapData, validateDesc } from "./map-data.ts";
import { gradeMap } from "./solver.ts";
import type { MapParams } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  n: number;
  diff: number;
  seed: string;
  desc: string;
  aux: string;
  solverDiff: number;
}

const data = cReference as { fixtures: Fixture[] };

describe("map differential (frozen C reference)", () => {
  for (const f of data.fixtures) {
    const p: MapParams = { w: f.w, h: f.h, n: f.n, diff: f.diff };
    const label = `${f.w}x${f.h}n${f.n}d${f.diff} seed=${f.seed}`;

    it(`${label}: TS desc + aux match C byte-for-byte`, () => {
      const { desc, aux } = newMapDesc(p, randomNew(f.seed));
      expect(desc).toBe(f.desc);
      expect(aux).toBe(f.aux);
      expect(validateDesc(p, desc)).toBeNull();
    });

    it(`${label}: TS solver grades the board at the C difficulty`, () => {
      const { map, coloring } = newMapData(p, f.desc);
      const clues = new Int32Array(f.n).fill(-1);
      for (let i = 0; i < f.n; i++) if (map.immutable[i]) clues[i] = coloring[i];
      expect(gradeMap(map.graph, f.n, map.ngraph, clues)).toBe(f.solverDiff);
    });
  }
});
