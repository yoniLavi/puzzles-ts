import { describe, expect, it } from "vitest";
import { randomNew, randomUpto } from "../random/index.ts";
import { SortedMultiset } from "./sorted-multiset.ts";

const numCmp = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);

describe("SortedMultiset", () => {
  it("add dedups on comparator equality and keeps sorted order", () => {
    const s = new SortedMultiset<number>(numCmp);
    expect(s.add(3)).toBe(true);
    expect(s.add(1)).toBe(true);
    expect(s.add(3)).toBe(false); // duplicate by comparator
    expect(s.size).toBe(2);
    expect(s.get(0)).toBe(1);
    expect(s.get(1)).toBe(3);
  });

  it("delete removes the comparator-equal element", () => {
    const s = new SortedMultiset<number>(numCmp);
    for (const n of [5, 2, 8, 1]) s.add(n);
    s.delete(8);
    s.delete(99); // absent: no-op
    expect(s.size).toBe(3);
    expect([s.get(0), s.get(1), s.get(2)]).toEqual([1, 2, 5]);
  });

  it("lastIndexLessThan / firstGreaterThan match a brute-force oracle", () => {
    const s = new SortedMultiset<number>(numCmp);
    const present = [2, 4, 6, 8, 10];
    for (const n of present) s.add(n);
    for (const probe of [1, 2, 5, 6, 11]) {
      const lt = present.filter((x) => x < probe);
      const expectedIdx = lt.length - 1;
      expect(s.lastIndexLessThan(probe)).toBe(expectedIdx);
      const gt = present.find((x) => x > probe);
      expect(s.firstGreaterThan(probe)).toBe(gt);
    }
  });

  it("matches an array oracle over a long random op sequence", () => {
    const s = new SortedMultiset<number>(numCmp);
    const oracle = new Set<number>();
    const rng = randomNew("sorted-multiset-fuzz");
    for (let step = 0; step < 2000; step++) {
      const v = randomUpto(rng, 50);
      if (randomUpto(rng, 2) === 0) {
        const inserted = s.add(v);
        expect(inserted).toBe(!oracle.has(v));
        oracle.add(v);
      } else {
        s.delete(v);
        oracle.delete(v);
      }
      expect(s.size).toBe(oracle.size);
    }
    const sorted = [...oracle].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) expect(s.get(i)).toBe(sorted[i]);
  });
});
