/*
 * TypeScript port of `puzzles/combi.c` — lex-order r-of-n combination
 * iterator. The replay corpus lives at `__fixtures__/corpus.json` and
 * is recorded by `puzzles/auxiliary/combi-trace.c`. Internals mirror
 * the C `next_combi` control flow step-for-step; the public surface
 * is an idiomatic TS class per AGENTS.md's "idiomatic surface,
 * faithful internals" dictum.
 */

export class Combi {
  readonly r: number;
  readonly n: number;
  readonly total: number;
  #a: number[];
  #nleft = 0;

  constructor(r: number, n: number) {
    if (n < 1) throw new RangeError(`combi: n must be >= 1, got ${n}`);
    if (r < 0) throw new RangeError(`combi: r must be >= 0, got ${r}`);
    if (r > n) throw new RangeError(`combi: r (${r}) must be <= n (${n})`);

    this.r = r;
    this.n = n;
    this.total = choose(n, r);
    this.#a = new Array(r);
    this.reset();
  }

  /** Current r-tuple. Valid after a truthy `next()` call. */
  get a(): readonly number[] {
    return this.#a;
  }

  /** Enumerations remaining; decrements on each successful `next()`. */
  get nleft(): number {
    return this.#nleft;
  }

  reset(): void {
    this.#nleft = this.total;
    for (let i = 0; i < this.r; i++) this.#a[i] = i;
  }

  next(): boolean {
    let i = this.r - 1;

    // The very first call after reset returns the initial tuple [0..r-1]
    // unchanged (mirrors the `goto done` branch in C's next_combi);
    // subsequent calls do the lex-successor walk.
    if (this.#nleft === this.total) {
      // initial tuple already populated by reset()
    } else if (this.#nleft <= 0) {
      return false;
    } else {
      while (this.#a[i] === this.n - this.r + i) i--;
      this.#a[i] += 1;
      for (let j = i + 1; j < this.r; j++) {
        this.#a[j] = this.#a[i] + j - i;
      }
    }

    this.#nleft--;
    return true;
  }

  /** Each yielded array is a snapshot — internal state mutates on next iteration. */
  *[Symbol.iterator](): IterableIterator<readonly number[]> {
    while (this.next()) yield this.#a.slice();
  }
}

function choose(n: number, r: number): number {
  // C(n, r) accumulated as ((n-r+1) * (n-r+2) * ... * n) / r!, multiplying
  // before dividing so each intermediate is an integer (matches the
  // factx(n, r+1) / factx(n-r, 1) shape in combi.c).
  let result = 1;
  for (let k = 1; k <= r; k++) {
    result = (result * (n - r + k)) / k;
  }
  return result;
}
