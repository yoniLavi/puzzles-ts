/**
 * Tests for the shared byte-match differential helper. The per-fixture
 * contract (`expectDescMatches`) is exercised directly — pass on match, throw
 * on mismatch, `extra` runs and can fail — and `describeDescDifferential` is
 * driven for real with a matching fake so its registered `it`s go green and
 * the seed/params threading is verified.
 */
import { describe, expect, it } from "vitest";
import { type RandomState, randomNew } from "../../random/index.ts";
import { describeDescDifferential, expectDescMatches } from "./differential.ts";

interface FakeFixture {
  seed: string;
  desc: string;
  size: number;
}

const FIXTURES: FakeFixture[] = [
  { seed: "seed-a", desc: "AAAA", size: 3 },
  { seed: "seed-b", desc: "BBBB", size: 4 },
];

const params = (f: FakeFixture) => ({ size: f.size });

describe("expectDescMatches", () => {
  it("passes when newDesc reproduces the fixture desc", () => {
    const f = FIXTURES[0];
    expect(() =>
      expectDescMatches(f, params(f), () => ({ desc: f.desc })),
    ).not.toThrow();
  });

  it("throws when newDesc diverges from the fixture desc", () => {
    const f = FIXTURES[0];
    expect(() => expectDescMatches(f, params(f), () => ({ desc: "WRONG" }))).toThrow();
  });

  it("threads the mapped params and a seed-derived RandomState into newDesc", () => {
    const f = FIXTURES[1];
    const seen: { params?: { size: number }; rngKeys?: string[] } = {};
    expectDescMatches(f, params(f), (p, rng: RandomState) => {
      seen.params = p;
      seen.rngKeys = Object.keys(rng).sort();
      return { desc: f.desc };
    });
    expect(seen.params).toEqual({ size: 4 });
    // A RandomState seeded from the same string is the same object shape the
    // helper must have built (the bit-identical RNG seam the bar depends on).
    expect(seen.rngKeys).toEqual(Object.keys(randomNew(f.seed)).sort());
  });

  it("runs the extra assertion and surfaces its failure", () => {
    const f = FIXTURES[0];
    let extraRan = false;
    expectDescMatches(
      f,
      params(f),
      () => ({ desc: f.desc }),
      () => {
        extraRan = true;
      },
    );
    expect(extraRan).toBe(true);

    expect(() =>
      expectDescMatches(
        f,
        params(f),
        () => ({ desc: f.desc }),
        () => {
          throw new Error("extra failed");
        },
      ),
    ).toThrow("extra failed");
  });
});

// Drive the describe-wrapper for real: a faithful fake that echoes the
// fixture desc keeps every registered `it` green, and the recorded calls let
// a trailing test confirm one `it` per fixture ran the comparison + extra.
const calls: Array<{ size: number; seed: string }> = [];
describeDescDifferential<FakeFixture, { size: number }>({
  title: "describeDescDifferential (fake game)",
  fixtures: FIXTURES,
  label: (f) => `size=${f.size}`,
  params,
  newDesc: (p, rng) => {
    // Find the fixture for this run by matching params (rng proves threading).
    expect(rng).toBeTruthy();
    const f = FIXTURES.find((x) => x.size === p.size);
    return { desc: f?.desc ?? "MISSING" };
  },
  extra: (f, p) => {
    calls.push({ size: p.size, seed: f.seed });
  },
});

describe("describeDescDifferential wiring", () => {
  it("registered and ran one comparison (with extra) per fixture", () => {
    // The wrapper's `it`s run before this trailing test (vitest executes a
    // file's tests in registration order), so `calls` is fully populated.
    expect(calls).toEqual([
      { size: 3, seed: "seed-a" },
      { size: 4, seed: "seed-b" },
    ]);
  });
});
