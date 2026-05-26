/**
 * Disjoint-set / union-find — idiomatic TS leaf for Galaxies.
 *
 * Lazy idiomatic leaf port per the `ts-migration` spec: ported when a
 * game (Galaxies) needs it, kept local to the game until a second
 * caller appears, then promoted. Galaxies needs four operations only —
 * construct, reinit, canonify, merge — so we port those four. Path
 * compression + union-by-size; ~30 lines.
 */
export class Dsf {
  private readonly parent: Int32Array;
  /** Tree size for union-by-size; only meaningful at a root. */
  private readonly size: Int32Array;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.size = new Int32Array(n);
    this.reinit();
  }

  /** Restore the singleton partition (every element its own root). */
  reinit(): void {
    for (let i = 0; i < this.parent.length; i++) {
      this.parent[i] = i;
      this.size[i] = 1;
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

  /** Merge `a`'s class with `b`'s. No-op if already in the same class. */
  merge(a: number, b: number): void {
    const ra = this.canonify(a);
    const rb = this.canonify(b);
    if (ra === rb) return;
    if (this.size[ra] < this.size[rb]) {
      this.parent[ra] = rb;
      this.size[rb] += this.size[ra];
    } else {
      this.parent[rb] = ra;
      this.size[ra] += this.size[rb];
    }
  }
}
