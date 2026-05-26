/**
 * The on-demand, idiomatic replacement for upstream `tree234` as used
 * by Flip's RANDOM matrix generator (`ts-migration`: leaf libs ported
 * "lazily and idiomatically … as ordinary TS dependencies", not as
 * bridged seams with corpora).
 *
 * Flip uses three `tree234`s purely as ordered collections that are
 * sets *under their comparator* (`add234` returns the existing element
 * when the comparator ties, so a tying insert is dropped) plus
 * positional / relative-find operations. Flip grids are tiny (presets
 * ≤ 5×5 = 25 cells; the puzzle is impractical at large sizes), so a
 * sorted array with binary search is the right structure — a 2-3-4
 * tree would be gratuitous. Promote to `src/native/lib/` only when a
 * second game needs it (YAGNI).
 *
 * `compare(a, b)` returns <0, 0, or >0. Two items that compare equal
 * are treated as the same member (the comparator defines identity).
 */
export class SortedMultiset<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  /** First index `i` with `compare(items[i], probe) >= 0` (lower bound). */
  private lowerBound(probe: T): number {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.compare(this.items[mid], probe) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** First index `i` with `compare(items[i], probe) > 0` (upper bound). */
  private upperBound(probe: T): number {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.compare(this.items[mid], probe) <= 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Insert `item`. Returns `true` if inserted, `false` if an element
   * comparing equal is already present (left untouched) — upstream
   * `add234`'s "already there" behaviour.
   */
  add(item: T): boolean {
    const i = this.lowerBound(item);
    if (i < this.items.length && this.compare(this.items[i], item) === 0) {
      return false;
    }
    this.items.splice(i, 0, item);
    return true;
  }

  /** Remove the element comparing equal to `item`, if present
   * (upstream `del234`). */
  delete(item: T): void {
    const i = this.lowerBound(item);
    if (i < this.items.length && this.compare(this.items[i], item) === 0) {
      this.items.splice(i, 1);
    }
  }

  /** Element at position `pos` (upstream `index234`). */
  get(pos: number): T {
    return this.items[pos];
  }

  /** Remove and return the element at position `pos` (upstream
   * `delpos234`). */
  removeAt(pos: number): T {
    return this.items.splice(pos, 1)[0];
  }

  /**
   * Position of the greatest element strictly less than `probe`, or
   * `-1` if none — upstream `findrelpos234(t, probe, REL234_LT, &pos)`
   * (returns the element and its index).
   */
  lastIndexLessThan(probe: T): number {
    return this.lowerBound(probe) - 1;
  }

  /**
   * The least element strictly greater than `probe`, or `undefined`
   * if none — upstream `findrel234(t, probe, REL234_GT)`.
   */
  firstGreaterThan(probe: T): T | undefined {
    const i = this.upperBound(probe);
    return i < this.items.length ? this.items[i] : undefined;
  }
}
