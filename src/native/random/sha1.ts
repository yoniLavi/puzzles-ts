/*
 * SHA-1 implementation, byte-for-byte equivalent to `puzzles/random.c`'s
 * internal SHA-1. Used by random.ts as the engine behind the
 * Simon-Tatham game RNG.
 *
 * Not exported as a general-purpose SHA-1 yet. puzzles/misc.c also calls
 * the C `SHA_*` functions for non-random work; that's a separate seam.
 */

export type ShaState = {
  h: Uint32Array; // length 5
  block: Uint8Array; // length 64
  blkused: number;
  lenhi: number; // top 32 bits of total length (in bytes)
  lenlo: number; // bottom 32 bits of total length (in bytes)
};

const rol = (x: number, n: number): number => ((x << n) | (x >>> (32 - n))) >>> 0;

const u32 = (x: number): number => x >>> 0;

export function shaInit(): ShaState {
  return {
    h: Uint32Array.of(0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0),
    block: new Uint8Array(64),
    blkused: 0,
    lenhi: 0,
    lenlo: 0,
  };
}

function shaTransform(digest: Uint32Array, block: Uint8Array): void {
  const w = new Uint32Array(80);
  for (let t = 0; t < 16; t++) {
    w[t] =
      ((block[t * 4 + 0] << 24) |
        (block[t * 4 + 1] << 16) |
        (block[t * 4 + 2] << 8) |
        block[t * 4 + 3]) >>>
      0;
  }
  for (let t = 16; t < 80; t++) {
    const tmp = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
    w[t] = rol(tmp, 1);
  }

  let a = digest[0];
  let b = digest[1];
  let c = digest[2];
  let d = digest[3];
  let e = digest[4];

  for (let t = 0; t < 20; t++) {
    const tmp = u32(rol(a, 5) + ((b & c) | (~b & d)) + e + w[t] + 0x5a827999);
    e = d;
    d = c;
    c = rol(b, 30);
    b = a;
    a = tmp;
  }
  for (let t = 20; t < 40; t++) {
    const tmp = u32(rol(a, 5) + (b ^ c ^ d) + e + w[t] + 0x6ed9eba1);
    e = d;
    d = c;
    c = rol(b, 30);
    b = a;
    a = tmp;
  }
  for (let t = 40; t < 60; t++) {
    const tmp = u32(rol(a, 5) + ((b & c) | (b & d) | (c & d)) + e + w[t] + 0x8f1bbcdc);
    e = d;
    d = c;
    c = rol(b, 30);
    b = a;
    a = tmp;
  }
  for (let t = 60; t < 80; t++) {
    const tmp = u32(rol(a, 5) + (b ^ c ^ d) + e + w[t] + 0xca62c1d6);
    e = d;
    d = c;
    c = rol(b, 30);
    b = a;
    a = tmp;
  }

  digest[0] = u32(digest[0] + a);
  digest[1] = u32(digest[1] + b);
  digest[2] = u32(digest[2] + c);
  digest[3] = u32(digest[3] + d);
  digest[4] = u32(digest[4] + e);
}

export function shaBytes(s: ShaState, data: Uint8Array): void {
  const len = data.length;
  let q = 0;
  let remaining = len;

  // Update length field. lenlo/lenhi mirror the C uint32 wrap behaviour.
  const prevLenlo = s.lenlo;
  s.lenlo = u32(s.lenlo + len);
  if (s.lenlo < prevLenlo) s.lenhi = u32(s.lenhi + 1);

  if (s.blkused && s.blkused + remaining < 64) {
    s.block.set(data.subarray(q, q + remaining), s.blkused);
    s.blkused += remaining;
    return;
  }

  while (s.blkused + remaining >= 64) {
    const take = 64 - s.blkused;
    s.block.set(data.subarray(q, q + take), s.blkused);
    q += take;
    remaining -= take;
    shaTransform(s.h, s.block);
    s.blkused = 0;
  }
  s.block.set(data.subarray(q, q + remaining), 0);
  s.blkused = remaining;
}

export function shaFinal(s: ShaState, output: Uint8Array): void {
  const pad = s.blkused >= 56 ? 56 + 64 - s.blkused : 56 - s.blkused;
  // Bit-length of the input. C does:
  //   lenhi = (s->lenhi << 3) | (s->lenlo >> 29);
  //   lenlo = (s->lenlo << 3);
  const lenhi = u32((s.lenhi << 3) | (s.lenlo >>> 29));
  const lenlo = u32(s.lenlo << 3);

  const padBuf = new Uint8Array(64);
  padBuf[0] = 0x80;
  shaBytes(s, padBuf.subarray(0, pad));

  const lenBuf = new Uint8Array(8);
  lenBuf[0] = (lenhi >>> 24) & 0xff;
  lenBuf[1] = (lenhi >>> 16) & 0xff;
  lenBuf[2] = (lenhi >>> 8) & 0xff;
  lenBuf[3] = lenhi & 0xff;
  lenBuf[4] = (lenlo >>> 24) & 0xff;
  lenBuf[5] = (lenlo >>> 16) & 0xff;
  lenBuf[6] = (lenlo >>> 8) & 0xff;
  lenBuf[7] = lenlo & 0xff;
  shaBytes(s, lenBuf);

  for (let i = 0; i < 5; i++) {
    output[i * 4 + 0] = (s.h[i] >>> 24) & 0xff;
    output[i * 4 + 1] = (s.h[i] >>> 16) & 0xff;
    output[i * 4 + 2] = (s.h[i] >>> 8) & 0xff;
    output[i * 4 + 3] = s.h[i] & 0xff;
  }
}

export function shaSimple(input: Uint8Array, output: Uint8Array): void {
  const s = shaInit();
  shaBytes(s, input);
  shaFinal(s, output);
}
