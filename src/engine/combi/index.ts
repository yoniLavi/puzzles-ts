/** Lex-order r-of-n combination iterator (upstream `combi.c`). */

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
    if (this.#nleft <= 0) return false;
    // The first call after reset returns the initial tuple [0..r-1] as it
    // stands; every later call steps to the lex successor.
    if (this.#nleft < this.total) {
      let i = this.r - 1;
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
  // before dividing so each intermediate is an integer.
  let result = 1;
  for (let k = 1; k <= r; k++) {
    result = (result * (n - r + k)) / k;
  }
  return result;
}
