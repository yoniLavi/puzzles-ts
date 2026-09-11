/*
 * Tests for the port of upstream `combi.c`. Three layers:
 *
 *  1. A direct translation of upstream's `auxiliary/combi-test.c`, so the
 *     upstream per-module test acts as the spec.
 *
 *  2. Surface-level behavioral checks (preconditions, reset, iterator
 *     sugar) that are part of the TS API contract.
 *
 *  3. Closed-form properties, exhaustive over a small grid: exactly
 *     `C(n, r)` tuples, strictly ascending, in strict lex order, all
 *     distinct, all drawn from `{0..n-1}`.
 *
 * There is deliberately no C-recorded corpus, and the reason does **not**
 * generalize to the other frozen corpora in this repo. A per-game differential
 * records which boards a solver-gated generator produces, and `random`'s corpus
 * records what bit sequence a seed yields; neither fact can be derived, so the
 * recorded fixture is the only statement of it. `combi` enumerates the subsets
 * of a set, with no upstream quirk in it, so layer 3 states the mathematics
 * directly and holds for every `(r, n)` rather than a recorded handful.
 */

import { describe, expect, it } from "vitest";
import { Combi } from "./index.ts";

// -----------------------------------------------------------------------------
// Port of upstream's auxiliary/combi-test.c — the upstream per-module test as
// our spec. The C program takes `R N` argv and prints:
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
// Surface-level behavioral checks: preconditions, iterator sugar.

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

  it("reset rewinds an exhausted iterator to the same enumeration", () => {
    // The `combi` spec requires this scenario, and nothing else drives `reset()`.
    const c = new Combi(2, 4);
    const first: number[][] = [];
    while (c.next()) first.push([...c.a]);
    expect(first.length).toBe(6);

    c.reset();
    const second: number[][] = [];
    while (c.next()) second.push([...c.a]);
    expect(second).toEqual(first);
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

// -----------------------------------------------------------------------------
// Property tests: these invariants hold for every valid (r, n). Cheap,
// exhaustive over a small grid.

describe("Combi properties (exhaustive over small grid)", () => {
  const pairs: [number, number][] = [];
  for (let n = 1; n <= 8; n++) {
    for (let r = 0; r <= n; r++) {
      pairs.push([r, n]);
    }
  }

  function choose(n: number, r: number): number {
    let result = 1;
    for (let k = 1; k <= r; k++) result = (result * (n - r + k)) / k;
    return result;
  }

  it.each(pairs)("(%i, %i): tuple count equals C(n, r)", (r, n) => {
    const tuples = [...new Combi(r, n)];
    expect(tuples.length).toBe(choose(n, r));
    expect(tuples.length).toBe(new Combi(r, n).total);
  });

  it.each(pairs)("(%i, %i): every tuple is strictly ascending", (r, n) => {
    for (const tuple of new Combi(r, n)) {
      for (let i = 1; i < tuple.length; i++) {
        expect(tuple[i], `tuple ${JSON.stringify(tuple)}`).toBeGreaterThan(
          tuple[i - 1],
        );
      }
    }
  });

  it.each(pairs)("(%i, %i): every tuple is drawn from {0..n-1}", (r, n) => {
    for (const tuple of new Combi(r, n)) {
      for (const x of tuple) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(n);
      }
    }
  });

  it.each(pairs)("(%i, %i): every tuple has length r", (r, n) => {
    for (const tuple of new Combi(r, n)) {
      expect(tuple.length).toBe(r);
    }
  });

  it.each(pairs)("(%i, %i): tuples are emitted in strict lex order", (r, n) => {
    const tuples = [...new Combi(r, n)];
    for (let i = 1; i < tuples.length; i++) {
      expect(lexCompare(tuples[i - 1], tuples[i]), `at #${i}`).toBeLessThan(0);
    }
  });

  it.each(pairs)("(%i, %i): tuples are all distinct", (r, n) => {
    const seen = new Set<string>();
    for (const tuple of new Combi(r, n)) {
      const key = tuple.join(",");
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

function lexCompare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}
