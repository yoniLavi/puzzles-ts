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

/** The root/inverse pair a flip-dsf canonify returns. */
export interface FlipCanon {
  /** Canonical root of the equivalence class. */
  root: number;
  /** True iff `n`'s sense is flipped relative to the root. */
  inverse: boolean;
}

/**
 * Flip (parity) disjoint-set — a union-find whose classes additionally track a
 * parity bit, so two elements can be bound "in the same sense" or "in opposite
 * senses". An idiomatic TS port of `dsf.c`'s flip variant (`dsf_new_flip` /
 * `dsf_canonify_flip` / `dsf_merge_flip`), ported for Dominosa's forcing-chain
 * deduction (two domino placements are linked either always-together or
 * always-opposite).
 *
 * Path compression carries the accumulated flip parity exactly as
 * `dsf_path_compress_flip`; union is by class size with the same tie-break as
 * {@link Dsf} (the second argument's root wins on a tie).
 */
export class FlipDsf {
  private readonly parent: Int32Array;
  private readonly classSize: Int32Array;
  /** For a non-root `n`, whether its sense is flipped relative to its parent. */
  private readonly flip: Uint8Array;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.classSize = new Int32Array(n);
    this.flip = new Uint8Array(n);
    this.reinit();
  }

  /** Restore the singleton partition (every element its own root, no flips). */
  reinit(): void {
    for (let i = 0; i < this.parent.length; i++) {
      this.parent[i] = i;
      this.classSize[i] = 1;
      this.flip[i] = 0;
    }
  }

  /** Walk to the root of `n`, accumulating the flip parity along the way.
   * Mirrors `dsf_find_root_flip`. */
  private findRoot(n: number): { root: number; flip: number } {
    let flip = 0;
    while (this.parent[n] !== n) {
      flip ^= this.flip[n];
      n = this.parent[n];
    }
    return { root: n, flip };
  }

  /** Repoint every node on the path from `n` to `root`, fixing up its stored
   * flip so the parity relative to the root is preserved.
   * Mirrors `dsf_path_compress_flip`. */
  private pathCompress(n: number, root: number, flip: number): void {
    while (this.parent[n] !== n) {
      const prev = n;
      const flipPrev = flip;
      n = this.parent[n];
      flip ^= this.flip[prev];
      this.flip[prev] = flipPrev;
      this.parent[prev] = root;
    }
  }

  /** Canonical root of `n`'s class and whether `n` is flipped relative to it. */
  canonify(n: number): FlipCanon {
    const { root, flip } = this.findRoot(n);
    this.pathCompress(n, root, flip);
    return { root, inverse: flip !== 0 };
  }

  /** Bind `n1` and `n2` into one class. `inverse` is `true` to bind them in
   * opposite senses, `false` for the same sense. No-op (but parity-checked in
   * dev) if they are already related. Mirrors `dsf_merge_flip`. */
  mergeFlip(n1: number, n2: number, inverse: boolean): void {
    const inv = inverse ? 1 : 0;
    const c1 = this.findRoot(n1);
    const c2 = this.findRoot(n2);
    const r1 = c1.root;
    const r2 = c2.root;
    let f1 = c1.flip;
    let f2 = c2.flip;
    let root: number;

    if (r1 === r2) {
      root = r1;
    } else {
      const s1 = this.classSize[r1];
      const s2 = this.classSize[r2];
      if (s1 > s2) {
        this.parent[r2] = root = r1;
        this.flip[r2] = f1 ^ f2 ^ inv;
        f2 ^= this.flip[r2];
      } else {
        this.parent[r1] = root = r2;
        this.flip[r1] = f1 ^ f2 ^ inv;
        f1 ^= this.flip[r1];
      }
      this.classSize[root] = s1 + s2;
    }

    this.pathCompress(n1, root, f1);
    this.pathCompress(n2, root, f2);
  }
}
