/*
 * Tests for the TS port of `puzzles/combi.c`. Three layers:
 *
 *  1. Corpus replay against `__fixtures__/corpus.json`, recorded by
 *     `puzzles/auxiliary/combi-trace.c` running natively. A mismatch
 *     here means the TS port's enumeration has drifted from the C
 *     reference — never acceptable.
 *
 *  2. A direct translation of `puzzles/auxiliary/combi-test.c` so the
 *     upstream per-module test acts as the spec (per AGENTS.md test
 *     discipline layer 2).
 *
 *  3. Surface-level behavioural checks (preconditions, iterator sugar)
 *     that aren't directly covered by the corpus but are part of the
 *     TS API contract.
 */

import { describe, expect, it } from "vitest";
import corpus from "./__fixtures__/corpus.json" with { type: "json" };
import { Combi } from "./index.ts";

type Fixture = {
  name: string;
  r: number;
  n: number;
  reset?: boolean;
  enumeration: number[][];
  enumeration_after_reset?: number[][];
};

describe("Combi vs C corpus", () => {
  for (const fixture of corpus.fixtures as Fixture[]) {
    it(fixture.name, () => {
      const c = new Combi(fixture.r, fixture.n);
      assertEnumerationMatches(c, fixture.enumeration, fixture.name);

      if (fixture.reset) {
        if (!fixture.enumeration_after_reset) {
          throw new Error(`[${fixture.name}]: reset fixture missing enumeration_after_reset`);
        }
        c.reset();
        assertEnumerationMatches(
          c,
          fixture.enumeration_after_reset,
          `${fixture.name} (after reset)`,
        );
        // Sanity: the two recorded passes should themselves be identical.
        expect(fixture.enumeration_after_reset, fixture.name).toEqual(fixture.enumeration);
      }
    });
  }
});

function assertEnumerationMatches(c: Combi, expected: number[][], ctx: string): void {
  for (let i = 0; i < expected.length; i++) {
    const advanced = c.next();
    expect(advanced, `${ctx} #${i}: next() should advance`).toBe(true);
    expect([...c.a], `${ctx} #${i}: tuple`).toEqual(expected[i]);
  }
  expect(c.next(), `${ctx}: next() after final tuple should return false`).toBe(false);
}

// -----------------------------------------------------------------------------
// Port of puzzles/auxiliary/combi-test.c — the upstream per-module test as our
// spec. The C program takes `R N` argv and prints:
//   combi R of N, T elements.
//   <r-tuple, space-separated>
//   ...
// We reproduce that output shape and pin a hand-spelled (3, 5) case so the
// expected output is readable in the test source.

describe("combi-test.c port", () => {
  function runCombiTest(r: number, n: number): string {
    const c = new Combi(r, n);
    const lines: string[] = [`combi ${c.r} of ${c.n}, ${c.total} elements.`];
    for (const tuple of c) {
      // C: `printf("%d ", c->a[i])` for each i — trailing space, then newline.
      lines.push(`${tuple.join(" ")} `);
    }
    return `${lines.join("\n")}\n`;
  }

  it("(3, 5) matches the hand-spelled enumeration", () => {
    expect(runCombiTest(3, 5)).toBe(
      [
        "combi 3 of 5, 10 elements.",
        "0 1 2 ",
        "0 1 3 ",
        "0 1 4 ",
        "0 2 3 ",
        "0 2 4 ",
        "0 3 4 ",
        "1 2 3 ",
        "1 2 4 ",
        "1 3 4 ",
        "2 3 4 ",
        "",
      ].join("\n"),
    );
  });

  it("(2, 5) matches the hand-spelled enumeration", () => {
    expect(runCombiTest(2, 5)).toBe(
      [
        "combi 2 of 5, 10 elements.",
        "0 1 ",
        "0 2 ",
        "0 3 ",
        "0 4 ",
        "1 2 ",
        "1 3 ",
        "1 4 ",
        "2 3 ",
        "2 4 ",
        "3 4 ",
        "",
      ].join("\n"),
    );
  });
});

// -----------------------------------------------------------------------------
// Surface-level behavioural checks: preconditions, iterator sugar.

describe("Combi API surface", () => {
  it("throws when r > n", () => {
    expect(() => new Combi(3, 2)).toThrow(RangeError);
  });

  it("throws when n < 1", () => {
    expect(() => new Combi(0, 0)).toThrow(RangeError);
  });

  it("throws when r < 0", () => {
    expect(() => new Combi(-1, 5)).toThrow(RangeError);
  });

  it("r == 0 yields exactly one empty tuple via the iterator", () => {
    const tuples = [...new Combi(0, 5)];
    expect(tuples).toEqual([[]]);
  });

  it("r == n yields exactly the identity tuple via the iterator", () => {
    const tuples = [...new Combi(4, 4)];
    expect(tuples).toEqual([[0, 1, 2, 3]]);
  });

  it("iterator yields snapshots, not live aliases of `a`", () => {
    const c = new Combi(2, 4);
    const snapshots: (readonly number[])[] = [...c];
    // After exhaustion, mutating-via-advance would corrupt aliased state;
    // but since each yield is a slice(), the snapshots are independent.
    expect(snapshots[0]).toEqual([0, 1]);
    expect(snapshots[snapshots.length - 1]).toEqual([2, 3]);
    // Confirm independence: rebuild and walk explicitly, then verify the
    // first snapshot is unchanged.
    const c2 = new Combi(2, 4);
    while (c2.next()) {
      /* drain */
    }
    expect(snapshots[0]).toEqual([0, 1]);
  });

  it("total matches C(n, r) for the canonical cases", () => {
    expect(new Combi(0, 1).total).toBe(1);
    expect(new Combi(1, 1).total).toBe(1);
    expect(new Combi(2, 5).total).toBe(10);
    expect(new Combi(3, 5).total).toBe(10);
    expect(new Combi(5, 5).total).toBe(1);
    expect(new Combi(2, 10).total).toBe(45);
    expect(new Combi(4, 8).total).toBe(70);
  });

  it("nleft decrements per successful next() and stays at 0 once exhausted", () => {
    const c = new Combi(2, 3);
    expect(c.nleft).toBe(3);
    c.next();
    expect(c.nleft).toBe(2);
    c.next();
    expect(c.nleft).toBe(1);
    c.next();
    expect(c.nleft).toBe(0);
    expect(c.next()).toBe(false);
    expect(c.nleft).toBe(0);
    expect(c.next()).toBe(false);
    expect(c.nleft).toBe(0);
  });
});
