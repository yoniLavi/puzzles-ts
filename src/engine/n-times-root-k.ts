/**
 * Exact `round(n · √k)` in integer arithmetic — the idiomatic TS port of
 * upstream `n_times_root_k` (`misc.c:569`).
 *
 * This is the bridge where the aperiodic tilings' exact irrational arithmetic
 * finally becomes integer pixels: Penrose works in ℤ[√5] and spectres in ℤ[√3],
 * and each coordinate arrives as a pair `(a, b)` denoting `a + b√k`. The
 * rational part scales by a plain integer; the irrational part comes through
 * here. (The hat tiling needs none of this — its coordinates are already
 * integers on a triangular lattice.)
 *
 * **Why not `Math.round(n * Math.sqrt(k))`.** For the magnitudes a grid
 * produces, the floating-point substitute gives identical answers today. It is
 * still the wrong port: upstream wrote this deliberately to avoid a *triple*
 * rounding (rounding √k, rounding the product, then rounding to an integer),
 * each of which can go the wrong way. Since dot deduplication downstream is by
 * **exact** coordinate equality, a single one-unit disagreement does not
 * degrade a coordinate — it silently splits one shared corner into two dots and
 * produces a structurally broken grid. Keeping the exact algorithm also keeps
 * the C reference fixtures trustworthy as a check rather than as a check that
 * happens to agree.
 *
 * ## Method
 *
 * A binary square-root variant. `m` is built from `|n|` one bit at a time, most
 * significant first, maintaining two invariants:
 *
 * - `x === floor(m·√k)`
 * - `x² + r === k·m²`  (so `r` is the residual)
 *
 * Each step replaces `m` with `2m + b` and `x` with `2x + a`, choosing the
 * largest `a` that keeps the residual non-negative. Pulling `n` out rather than
 * computing `√(n²k)` is upstream's trick to halve the integer width needed;
 * here it simply keeps every intermediate far below `2⁵³`, so plain JS numbers
 * are exact and no `| 0` masking is wanted (that would *introduce* an overflow
 * this arithmetic does not otherwise have).
 *
 * Rounding to nearest at the end is `r > x`, which is exactly the condition
 * `(x + ½)² < km²`. No tie-break is needed: √k is irrational, so an exact
 * halfway case cannot occur.
 *
 * Upstream's sign handling ends in `INT_MIN + (int)(-x - (unsigned)INT_MIN)`,
 * which exists purely to keep a C compiler from inferring signed-overflow UB. It
 * has no TS analogue and reduces to negation — the odd spelling is intentional
 * upstream, not a bug to preserve.
 *
 * @param n Multiplier; may be negative. Rounding is symmetric about zero
 *          (magnitude is rounded, then the sign reapplied) — **not** floored.
 * @param k Radicand. Callers use 3 (spectres) and 5 (Penrose).
 */
export function nTimesRootK(n: number, k: number): number {
  const sign = n < 0 ? -1 : 1;
  const magnitude = n * sign;

  let x = 0; // floor(m * sqrt(k))
  let r = 0; // residual: x*x + r === k*m*m
  let m = 0; // the prefix of |n| consumed so far

  for (let bit = 31; bit >= 0; bit--) {
    const b = Math.floor(magnitude / 2 ** bit) % 2;

    // Replacing m with 2m+b and x with 2x+a makes the new residual
    //   k(2m+b)² − (2x+a)² = 4r + (4m + 1)kb − 4ax − a²
    // whose positive part does not depend on `a`.
    const positive = 4 * r + k * b * (4 * m + 1);
    let a = 0;
    while (positive >= 4 * a * x + a * a) a++;
    a--; // the loop stops one past the largest `a` that keeps r >= 0

    r = positive - (4 * a * x + a * a);
    m = 2 * m + b;
    x = 2 * x + a;
  }

  if (r > x) x++; // round to nearest rather than down

  // Guard the sign multiply: `-1 * 0` is negative zero, which survives `===`
  // and would reach a dot coordinate, where only a structural comparison could
  // ever see it. Unreachable for k >= 3 (|n·√k| >= 1.73 for any n != 0), but
  // this function is the one place the sign is reapplied, so it is the one
  // place worth being sure.
  return x === 0 ? 0 : sign * x;
}
