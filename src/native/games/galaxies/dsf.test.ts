import { describe, expect, it } from "vitest";
import { randomNew, randomUpto } from "../../random/index.ts";
import { Dsf } from "../../engine/dsf.ts";

/**
 * Brute-force reference: a plain parent array, walked to a root each
 * time. No path compression, no union-by-size. Property tests cross
 * the optimised `Dsf` against this.
 */
class RefDsf {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  reinit(): void {
    for (let i = 0; i < this.parent.length; i++) this.parent[i] = i;
  }
  canonify(i: number): number {
    while (this.parent[i] !== i) i = this.parent[i];
    return i;
  }
  merge(a: number, b: number): void {
    const ra = this.canonify(a);
    const rb = this.canonify(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

function classesEqual(
  a: { canonify(i: number): number },
  b: { canonify(i: number): number },
  n: number,
): void {
  // Same equivalence relation: i ≡ j in `a` iff i ≡ j in `b`. (We
  // can't compare canonical roots directly — `a` may pick a different
  // representative than `b`.)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const aSame = a.canonify(i) === a.canonify(j);
      const bSame = b.canonify(i) === b.canonify(j);
      expect(aSame).toBe(bSame);
    }
  }
}

describe("Dsf", () => {
  it("starts as n singletons", () => {
    const d = new Dsf(5);
    for (let i = 0; i < 5; i++) expect(d.canonify(i)).toBe(i);
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        expect(d.canonify(i) === d.canonify(j)).toBe(false);
      }
    }
  });

  it("merge unifies the equivalence classes", () => {
    const d = new Dsf(6);
    d.merge(0, 1);
    d.merge(2, 3);
    d.merge(1, 2);
    // {0,1,2,3} together; {4}; {5}.
    expect(d.canonify(0)).toBe(d.canonify(3));
    expect(d.canonify(1)).toBe(d.canonify(2));
    expect(d.canonify(0) === d.canonify(4)).toBe(false);
    expect(d.canonify(4) === d.canonify(5)).toBe(false);
  });

  it("merge is idempotent on already-equivalent elements", () => {
    const d = new Dsf(4);
    d.merge(0, 1);
    const root = d.canonify(0);
    d.merge(0, 1);
    d.merge(1, 0);
    expect(d.canonify(0)).toBe(root);
    expect(d.canonify(1)).toBe(root);
  });

  it("reinit restores n singletons", () => {
    const d = new Dsf(5);
    d.merge(0, 1);
    d.merge(2, 3);
    d.reinit();
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        expect(d.canonify(i) === d.canonify(j)).toBe(false);
      }
    }
  });

  it("matches brute-force reference over long random sequences", () => {
    const n = 20;
    const rng = randomNew("dsf-property");
    for (let trial = 0; trial < 5; trial++) {
      const d = new Dsf(n);
      const ref = new RefDsf(n);
      for (let op = 0; op < 200; op++) {
        const a = randomUpto(rng, n);
        const b = randomUpto(rng, n);
        d.merge(a, b);
        ref.merge(a, b);
        classesEqual(d, ref, n);
      }
      d.reinit();
      ref.reinit();
      classesEqual(d, ref, n);
    }
  });
});
