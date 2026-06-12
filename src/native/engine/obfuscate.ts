/**
 * Faithful TS port of `puzzles/misc.c`'s `obfuscate_bitmap` +
 * `bin2hex`/`hex2bin`, used to mask a solution into the game description
 * so the shareable game id does not spell out the answer. Started local
 * to Guess (the "lazy, idiomatic, local until a second consumer"
 * doctrine, like Galaxies' `dsf.ts`); promoted here when Black Box became
 * its second consumer (same rule as `Dsf`/`SortedMultiset`). Mosaic,
 * Mines and others obfuscate their descs too and will reuse it unchanged.
 *
 * The obfuscation is an OAEP-style reversible masking: split the byte
 * stream in half (rounding down), mask the first half with a SHA-1
 * keystream seeded from the second half, then mask the second half with
 * a keystream seeded from the (now-masked) first half. Decoding runs the
 * same two steps in the reverse order. The keystream for a seed is the
 * concatenation of SHA-1(seed ‖ "0"), SHA-1(seed ‖ "1"), … — hence the
 * `shaCopy` fork of the seed-primed base state per 20-byte block.
 */

import { shaBytes, shaCopy, shaFinal, shaInit } from "../random/sha1.ts";

interface MaskStep {
  seedStart: number;
  seedLen: number;
  targetStart: number;
  targetLen: number;
}

const ASCII = new TextEncoder();

/** Mask (`decode = false`) or unmask (`decode = true`) `bmp` in place.
 * `bits` is the meaningful bit length; trailing pad bits in the final
 * byte are cleared after each step (a no-op when `bits` is a multiple
 * of 8, which is Guess's case). */
export function obfuscateBitmap(bmp: Uint8Array, bits: number, decode: boolean): void {
  const bytes = (bits + 7) >> 3;
  const firstHalf = bytes >> 1;
  const secondHalf = bytes - firstHalf;

  const steps: MaskStep[] = [];
  steps[decode ? 1 : 0] = {
    seedStart: firstHalf,
    seedLen: secondHalf,
    targetStart: 0,
    targetLen: firstHalf,
  };
  steps[decode ? 0 : 1] = {
    seedStart: 0,
    seedLen: firstHalf,
    targetStart: firstHalf,
    targetLen: secondHalf,
  };

  for (const step of steps) {
    const base = shaInit();
    shaBytes(base, bmp.subarray(step.seedStart, step.seedStart + step.seedLen));

    const digest = new Uint8Array(20);
    let digestPos = 20;
    let counter = 0;

    for (let j = 0; j < step.targetLen; j++) {
      if (digestPos >= 20) {
        const fork = shaCopy(base);
        shaBytes(fork, ASCII.encode(String(counter++)));
        shaFinal(fork, digest);
        digestPos = 0;
      }
      bmp[step.targetStart + j] ^= digest[digestPos++];
    }

    if (bits % 8) {
      bmp[bits >> 3] &= 0xff & (0xff00 >> (bits % 8));
    }
  }
}

/** Lowercase hex, high nibble first — matches `bin2hex`. */
export function bin2hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Parse the first `2*outlen` hex chars of `hex` into `outlen` bytes,
 * high nibble first — matches `hex2bin`. Non-hex chars decode as 0. */
export function hex2bin(hex: string, outlen: number): Uint8Array {
  const ret = new Uint8Array(outlen);
  for (let i = 0; i < outlen * 2; i++) {
    const c = hex.charCodeAt(i);
    let v: number;
    if (c >= 0x30 && c <= 0x39) v = c - 0x30;
    else if (c >= 0x61 && c <= 0x66) v = c - 0x61 + 10;
    else if (c >= 0x41 && c <= 0x46) v = c - 0x41 + 10;
    else v = 0;
    ret[i >> 1] |= v << (4 * (1 - (i % 2)));
  }
  return ret;
}
