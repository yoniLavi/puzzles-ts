import { describe, expect, it } from "vitest";
import { nTimesRootK } from "./n-times-root-k.ts";

/**
 * `nTimesRootK` is checked against its *definition* (nearest integer to n·√k)
 * rather than against recorded values: the property is closed-form, so a
 * fixture would be strictly weaker. The float comparison here is the oracle,
 * not the implementation — see the module doc for why the shipped code is
 * exact instead.
 */
describe("nTimesRootK", () => {
  for (const k of [3, 5]) {
    describe(`k = ${k}`, () => {
      it("returns the nearest integer to n*sqrt(k)", () => {
        for (let n = -2000; n <= 2000; n++) {
          expect(nTimesRootK(n, k)).toBe(Math.round(n * Math.sqrt(k)));
        }
      });

      it("stays within half a unit of the true value at large magnitudes", () => {
        for (const n of [12345, 99999, 1_000_003, -12345, -99999, -1_000_003]) {
          expect(Math.abs(nTimesRootK(n, k) - n * Math.sqrt(k))).toBeLessThanOrEqual(
            0.5,
          );
        }
      });

      it("is symmetric about zero rather than floored", () => {
        for (const n of [1, 2, 7, 33, 1234]) {
          expect(nTimesRootK(-n, k)).toBe(-nTimesRootK(n, k));
        }
      });

      // Negative zero survives `===` and reaches dot coordinates, where dedup
      // is by exact equality; only a structural check sees it. This is the
      // hazard that nearly shipped in floret (change 1's addendum).
      it("returns positive zero for zero, never negative zero", () => {
        expect(Object.is(nTimesRootK(0, k), 0)).toBe(true);
        expect(Object.is(nTimesRootK(-0, k), 0)).toBe(true);
      });
    });
  }

  it("agrees with the exact residual invariant at a spot value", () => {
    // 1000*sqrt(3) = 1732.0508..., 1000*sqrt(5) = 2236.0679...
    expect(nTimesRootK(1000, 3)).toBe(1732);
    expect(nTimesRootK(1000, 5)).toBe(2236);
  });
});
