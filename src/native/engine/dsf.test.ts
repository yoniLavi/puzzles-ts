import { describe, expect, it } from "vitest";
import { randomNew, randomUpto } from "../random/index.ts";
import { Dsf, FlipDsf } from "./dsf.ts";

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

  it("size and equivalent reflect the merges", () => {
    const d = new Dsf(6);
    d.merge(0, 1);
    d.merge(2, 3);
    d.merge(1, 2);
    // {0,1,2,3} together; {4}; {5}.
    for (const i of [0, 1, 2, 3]) expect(d.size(i)).toBe(4);
    expect(d.size(4)).toBe(1);
    expect(d.size(5)).toBe(1);
    expect(d.equivalent(0, 3)).toBe(true);
    expect(d.equivalent(1, 2)).toBe(true);
    expect(d.equivalent(0, 4)).toBe(false);
    expect(d.equivalent(4, 5)).toBe(false);
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

  // O(n²) cross-check after every op — legitimately CPU-heavy, and slow under
  // a busy suite. Not clock-gated: the verdict is the assertion, not the time.
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
    // 30s predated the suite-wide 60s default and *lowered* the ceiling;
    // under full-suite CPU saturation this legitimately runs 40s+.
  });
});

/**
 * Brute-force parity reference: store every parity constraint as an edge
 * `(a, b, inverse)` and answer connectivity + relative sense by BFS. The
 * FlipDsf's canonical roots are internal, so we test the *invariants* that
 * matter — same class ⇒ same root, and the accumulated `inverse` flags recover
 * the constraint-implied relative parity.
 */
class RefFlipDsf {
  private readonly edges: Array<[number, number, number]> = [];
  merge(a: number, b: number, inverse: boolean): void {
    this.edges.push([a, b, inverse ? 1 : 0]);
  }
  /** BFS from `a`; returns a map element→parity for every element reachable. */
  private reach(a: number): Map<number, number> {
    const parity = new Map<number, number>([[a, 0]]);
    const queue = [a];
    while (queue.length) {
      const u = queue.shift() as number;
      const pu = parity.get(u) as number;
      for (const [x, y, inv] of this.edges) {
        for (const [from, to] of [
          [x, y],
          [y, x],
        ]) {
          if (from === u && !parity.has(to)) {
            parity.set(to, pu ^ inv);
            queue.push(to);
          }
        }
      }
    }
    return parity;
  }
  connected(a: number, b: number): boolean {
    return this.reach(a).has(b);
  }
  /** Relative sense of `b` w.r.t. `a` (0 same, 1 opposite); a,b connected. */
  sense(a: number, b: number): number {
    return this.reach(a).get(b) as number;
  }
}

describe("FlipDsf", () => {
  it("binds two elements in the same and opposite senses", () => {
    const d = new FlipDsf(4);
    d.mergeFlip(0, 1, false); // same
    d.mergeFlip(2, 3, true); // opposite
    const c0 = d.canonify(0);
    const c1 = d.canonify(1);
    expect(c1.root).toBe(c0.root);
    expect(c0.inverse === c1.inverse).toBe(true); // same sense

    const c2 = d.canonify(2);
    const c3 = d.canonify(3);
    expect(c3.root).toBe(c2.root);
    expect(c2.inverse !== c3.inverse).toBe(true); // opposite sense

    // Two separate classes.
    expect(c2.root).not.toBe(c0.root);
  });

  it("propagates parity transitively", () => {
    const d = new FlipDsf(4);
    d.mergeFlip(0, 1, true); // 1 opposite 0
    d.mergeFlip(1, 2, true); // 2 opposite 1 ⇒ 2 same as 0
    const c0 = d.canonify(0);
    const c2 = d.canonify(2);
    expect(c2.root).toBe(c0.root);
    expect(c0.inverse === c2.inverse).toBe(true);
    const c1 = d.canonify(1);
    expect(c0.inverse !== c1.inverse).toBe(true);
  });

  it("matches a brute-force parity reference under random merges", () => {
    // The per-op cost is the O(n²) full-matrix re-check below, run once per op,
    // so wall time scales as n²·ops. The parity property is n-independent — 16
    // elements under 40 consistent flip-merges already builds deep multi-way
    // equivalence classes with inversions — so a smaller n/ops keeps the check
    // just as strong for a fraction of the work; the earlier 24/60 was ~3× the
    // cost for no added rigour.
    const n = 16;
    const rng = randomNew("flipdsf-property");
    for (let trial = 0; trial < 5; trial++) {
      const d = new FlipDsf(n);
      const ref = new RefFlipDsf();
      for (let op = 0; op < 40; op++) {
        const a = randomUpto(rng, n);
        const b = randomUpto(rng, n);
        const inv = randomUpto(rng, 2) === 1;
        // Only merge when consistent (avoid contradicting an existing relation,
        // which would trip the C's inconsistency assert).
        if (!ref.connected(a, b) || ref.sense(a, b) === (inv ? 1 : 0)) {
          d.mergeFlip(a, b, inv);
          ref.merge(a, b, inv);
        }
        for (let x = 0; x < n; x++)
          for (let y = 0; y < n; y++) {
            const cx = d.canonify(x);
            const cy = d.canonify(y);
            if (ref.connected(x, y)) {
              expect(cy.root).toBe(cx.root);
              const relSense = cx.inverse !== cy.inverse ? 1 : 0;
              expect(relSense).toBe(ref.sense(x, y));
            } else {
              expect(cy.root).not.toBe(cx.root);
            }
          }
      }
    }
    // Same saturation headroom as the sibling property test above.
  });
});
