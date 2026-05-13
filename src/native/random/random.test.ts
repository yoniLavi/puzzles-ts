/*
 * Replay the C-recorded random.c corpus against `random.ts`, byte by byte.
 *
 * The corpus at `__fixtures__/corpus.json` is produced by
 * `puzzles/auxiliary/random-trace.c` running natively against
 * `puzzles/random.c`. A mismatch here means the TS port's output
 * has drifted from upstream's — never acceptable.
 */

import { describe, expect, it } from "vitest";
import corpus from "./__fixtures__/corpus.json" with { type: "json" };
import {
  type RandomState,
  randomBits,
  randomCopy,
  randomNew,
  randomStateDecode,
  randomStateEncode,
  randomUpto,
} from "./index.ts";

type Call =
  | { op: "bits"; bits: number; out: number }
  | { op: "upto"; limit: number; out: number }
  | { op: "copy"; out: null }
  | { op: "copy_bits"; bits: number; out: number }
  | { op: "encode"; out: string }
  | { op: "decode"; input: string; out: null };

type Fixture = {
  name: string;
  seed: string;
  calls: Call[];
};

describe("random.ts vs C corpus", () => {
  for (const fixture of corpus.fixtures as Fixture[]) {
    it(fixture.name, () => {
      let state: RandomState = randomNew(fixture.seed);
      let copyState: RandomState | null = null;

      for (let i = 0; i < fixture.calls.length; i++) {
        const call = fixture.calls[i];
        const ctx = `[${fixture.name}] call #${i} (${call.op})`;
        switch (call.op) {
          case "bits": {
            const got = randomBits(state, call.bits);
            expect(got, ctx).toBe(call.out);
            break;
          }
          case "upto": {
            const got = randomUpto(state, call.limit);
            expect(got, ctx).toBe(call.out);
            break;
          }
          case "copy": {
            copyState = randomCopy(state);
            break;
          }
          case "copy_bits": {
            if (copyState === null) {
              throw new Error(`${ctx}: no copy state — corpus is malformed`);
            }
            const got = randomBits(copyState, call.bits);
            expect(got, ctx).toBe(call.out);
            break;
          }
          case "encode": {
            const got = randomStateEncode(state);
            expect(got, ctx).toBe(call.out);
            break;
          }
          case "decode": {
            // Decode replaces the live state. Output is null — just
            // verify by reading the next call (which is usually a
            // `bits` against the decoded state).
            state = randomStateDecode(call.input);
            break;
          }
        }
      }
    });
  }
});
