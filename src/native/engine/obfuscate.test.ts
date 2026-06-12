/**
 * Tier-1 tests for the obfuscation desc codec. The authoritative
 * vectors are lifted from `puzzles/auxiliary/obfusc.c`'s C self-tests
 * (`obfusc -t`) — so this asserts byte-for-byte agreement with the C
 * `obfuscate_bitmap`, including the SHA-1 keystream rollover.
 */
import { describe, expect, it } from "vitest";
import { bin2hex, hex2bin, obfuscateBitmap } from "./obfuscate.ts";

describe("bin2hex / hex2bin", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = Uint8Array.of(0x00, 0x12, 0xab, 0xff, 0x7e, 0x01);
    expect(bin2hex(bytes)).toBe("0012abff7e01");
    expect(Array.from(hex2bin("0012abff7e01", 6))).toEqual(Array.from(bytes));
  });

  it("emits high nibble first, lowercase", () => {
    expect(bin2hex(Uint8Array.of(0xa0, 0x0f))).toBe("a00f");
  });
});

describe("obfuscateBitmap (C-authoritative vectors)", () => {
  it("matches the 28-bit C self-test vector", () => {
    // 1234567[0] -> 07FA650[0] (obfusc.c test 1).
    const b = hex2bin("12345670", 4);
    obfuscateBitmap(b, 28, false);
    expect(bin2hex(b)).toBe("07fa6500");
    obfuscateBitmap(b, 28, true);
    expect(bin2hex(b)).toBe("12345670");
  });

  it("matches the 50-byte all-zero C self-test vector (SHA rollover)", () => {
    const b = new Uint8Array(50);
    obfuscateBitmap(b, 50 * 8, false);
    expect(bin2hex(b)).toBe(
      "b202c07b990c01f6ff2d544707f60e506019b671fcb1d8b5a2" +
        "10b0af913db85d37ca27f52a9f78bba3a80030db3d01d8df78",
    );
    obfuscateBitmap(b, 50 * 8, true);
    expect(bin2hex(b)).toBe("00".repeat(50));
  });

  it("round-trips guess-length byte strings", () => {
    for (const hex of ["01020304", "0504030201", "0601020304", "0807060504"]) {
      const n = hex.length / 2;
      const b = hex2bin(hex, n);
      obfuscateBitmap(b, n * 8, false);
      const enc = bin2hex(b);
      expect(enc).not.toBe(hex); // actually obfuscated
      obfuscateBitmap(b, n * 8, true);
      expect(bin2hex(b)).toBe(hex);
    }
  });
});
