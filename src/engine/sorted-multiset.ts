/**
 * Upstream's `tree234` as the games use it: an ordered collection that is a
 * set *under its comparator* (`add234` returns the existing element when the
 * comparator ties, so a tying insert is dropped), with positional and
 * relative-find operations. A sorted array with binary search stands in for
 * the 2-3-4 tree.
 *
 * `compare(a, b)` returns <0, 0, or >0. Two items that compare equal are the
 * same member (the comparator defines identity).
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

  /** Insert `item`. Returns `false`, leaving the set untouched, if an element
   * comparing equal is already present (upstream `add234`). */
  add(item: T): boolean {
    const i = this.lowerBound(item);
    if (i < this.items.length && this.compare(this.items[i], item) === 0) {
      return false;
    }
    this.items.splice(i, 0, item);
    return true;
  }

  /** Remove the element comparing equal to `item`, if present (upstream `del234`). */
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

  /** Remove and return the element at position `pos` (upstream `delpos234`). */
  removeAt(pos: number): T {
    return this.items.splice(pos, 1)[0];
  }

  /** Position of the greatest element strictly less than `probe`, or `-1` if
   * none (the index upstream `findrelpos234(t, probe, REL234_LT, &pos)`
   * writes to `pos`). */
  lastIndexLessThan(probe: T): number {
    return this.lowerBound(probe) - 1;
  }

  /** The least element strictly greater than `probe`, or `undefined` if none
   * (upstream `findrel234(t, probe, REL234_GT)`). */
  firstGreaterThan(probe: T): T | undefined {
    const i = this.upperBound(probe);
    return i < this.items.length ? this.items[i] : undefined;
  }
}
