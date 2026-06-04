/*
 * diff-flip.test.ts — ADVISORY live C-vs-TS differential spot-check for
 * the Flip port (openspec `add-flip-ts-port`). NOT part of the commit/
 * CI gate: it lives outside `src/`, so the default `vitest run`
 * (vitest.config.ts → include `src/**`) never collects it. Run on
 * demand with its own config:
 *
 *   ./scripts/build-native.sh flip-trace          # needs puzzles/flip.c
 *   npx vitest run --config scripts/diff-flip.vitest.config.mts
 *
 * It shells the C generator and compares with the TS port for the same
 * seed/params. CROSSES must match exactly; RANDOM is expected to differ
 * (idiomatic generator) — there the bar is "TS board is solvable".
 * flip.c (hence flip-trace) is deleted when the port ships; the
 * reproducible, C-free form of this check is the gated
 * `src/native/games/flip/flip-differential.test.ts` against a frozen
 * snapshot. Re-run this from the change's commit if ever needed.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type FlipParams, flipGame } from "../src/native/games/flip/index.ts";
import { randomNew } from "../src/native/random/index.ts";

const BIN = "build/native/auxiliary/flip-trace";
const SEEDS = ["testseed", "flip-1", "flip-2", "12345", "puzzles-ts"];
const SHAPES: Array<[number, number, "crosses" | "random"]> = [
  [3, 3, "crosses"],
  [4, 4, "crosses"],
  [5, 5, "crosses"],
  [3, 3, "random"],
  [4, 4, "random"],
  [5, 5, "random"],
];

const solveFlip = flipGame.solve as NonNullable<typeof flipGame.solve>;

describe("Flip live differential (advisory)", () => {
  if (!existsSync(BIN)) {
    it.skip(`skipped: ${BIN} not built (./scripts/build-native.sh flip-trace)`, () => {});
    return;
  }
  for (const [w, h, matrixType] of SHAPES) {
    const p: FlipParams = { w, h, matrixType };
    const flag = matrixType === "crosses" ? "c" : "r";
    for (const seed of SEEDS) {
      const tag = `${w}x${h} ${matrixType} seed=${seed}`;
      it(tag, () => {
        const c = execFileSync(BIN, [`${w}`, `${h}`, flag, seed])
          .toString()
          .trim();
        const ts = flipGame.newDesc(p, randomNew(seed)).desc;
        if (matrixType === "crosses") {
          expect(ts, `${tag}: CROSSES must match C exactly`).toBe(c);
        } else {
          const st = flipGame.newState(p, ts);
          expect(solveFlip(st, st).ok, `${tag}: TS board must be solvable`).toBe(true);
          // RANDOM divergence from C is expected; surface as a note.
          console.log(
            `  ${tag}: ${ts === c ? "matched C" : "differs from C (expected)"}`,
          );
        }
      });
    }
  }
});
