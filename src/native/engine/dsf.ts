/**
 * Disjoint-set / union-find — idiomatic TS leaf for Galaxies.
 *
 * Lazy idiomatic leaf port per the `ts-migration` spec: ported when a
 * game (Galaxies) needs it, kept local to the game until a second
 * caller appears, then promoted. The original four operations —
 * construct, reinit, canonify, merge — cover Galaxies/Pegs; Palisade
 * added the two read accessors upstream's `dsf.c` also exposes
 * (`size`, `equivalent`). Path compression + union-by-size; ~40 lines.
 */
export class Dsf {
  private readonly parent: Int32Array;
  /** Tree size for union-by-size; only meaningful at a root. */
  private readonly classSize: Int32Array;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.classSize = new Int32Array(n);
    this.reinit();
  }

  /** Restore the singleton partition (every element its own root). */
  reinit(): void {
    for (let i = 0; i < this.parent.length; i++) {
      this.parent[i] = i;
      this.classSize[i] = 1;
    }
  }

  /** Canonical root of `i`'s equivalence class. */
  canonify(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root];
    // Path compression: walk again, repointing every node to the root.
    let cur = i;
    while (this.parent[cur] !== root) {
      const next = this.parent[cur];
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }

  /** Merge `a`'s class with `b`'s. No-op if already in the same class.
   *
   * Tie-breaking mirrors upstream `dsf.c`'s `dsf_merge` exactly: the larger
   * class becomes the root, and on a tie the *second* argument's root wins
   * (`if (s1 > s2) root = r1; else root = r2`). This matters because a few
   * upstream algorithms branch on the canonical-root *identity* (e.g.
   * Filling's `learn_critical_square` walks a region's `connected` list from
   * its canonical cell), so matching the root choice is required for
   * differential parity, not just connectivity. */
  merge(a: number, b: number): void {
    const ra = this.canonify(a);
    const rb = this.canonify(b);
    if (ra === rb) return;
    if (this.classSize[ra] > this.classSize[rb]) {
      this.parent[rb] = ra;
      this.classSize[ra] += this.classSize[rb];
    } else {
      this.parent[ra] = rb;
      this.classSize[rb] += this.classSize[ra];
    }
  }

  /** Number of elements in `i`'s equivalence class. */
  size(i: number): number {
    return this.classSize[this.canonify(i)];
  }

  /** True iff `a` and `b` are in the same equivalence class. */
  equivalent(a: number, b: number): boolean {
    return this.canonify(a) === this.canonify(b);
  }

  /** A deep copy — a fresh forest with the same partition. Used by games
   * (Signpost) whose immutable state clones its `Dsf` per move. */
  clone(): Dsf {
    const copy = new Dsf(this.parent.length);
    copy.parent.set(this.parent);
    copy.classSize.set(this.classSize);
    return copy;
  }
}
