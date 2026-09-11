/*
 * Upstream `random.c` (Simon Tatham's portable RNG), byte for byte: identical
 * seeds produce identical streams, which is what keeps shared game IDs
 * reproducible. `__fixtures__/corpus.json` is a C-recorded replay corpus of it.
 */

import { shaSimple } from "./sha1.ts";

export type RandomState = {
  seedbuf: Uint8Array; // 40 bytes
  databuf: Uint8Array; // 20 bytes
  pos: number; // 0..20
};

const SEEDBUF_LEN = 40;
const DATABUF_LEN = 20;

function toBytes(seed: string | Uint8Array): Uint8Array {
  return typeof seed === "string" ? new TextEncoder().encode(seed) : seed;
}

export function randomNew(seed: string | Uint8Array): RandomState {
  const bytes = toBytes(seed);
  const seedbuf = new Uint8Array(SEEDBUF_LEN);
  const databuf = new Uint8Array(DATABUF_LEN);
  // Three rounds of SHA, matching random.c exactly.
  shaSimple(bytes, seedbuf.subarray(0, 20));
  shaSimple(seedbuf.subarray(0, 20), seedbuf.subarray(20, 40));
  shaSimple(seedbuf, databuf);
  return { seedbuf, databuf, pos: 0 };
}

export function randomCopy(state: RandomState): RandomState {
  return {
    seedbuf: new Uint8Array(state.seedbuf),
    databuf: new Uint8Array(state.databuf),
    pos: state.pos,
  };
}

export function randomBits(state: RandomState, bits: number): number {
  let ret = 0;
  for (let n = 0; n < bits; n += 8) {
    if (state.pos >= DATABUF_LEN) {
      // Increment seedbuf as a little-endian big integer, then re-hash it to
      // refill databuf.
      for (let i = 0; i < SEEDBUF_LEN; i++) {
        if (state.seedbuf[i] !== 0xff) {
          state.seedbuf[i]++;
          break;
        }
        state.seedbuf[i] = 0;
      }
      shaSimple(state.seedbuf, state.databuf);
      state.pos = 0;
    }
    // Multiply rather than shift: with `bits` up to 32 the value can reach
    // 2^32-1, past JS's signed-int32 bitwise range but exact as a number.
    ret = ret * 256 + state.databuf[state.pos++];
  }
  // Trim to the low `bits` bits (bits ∈ [1, 32]).
  return ret % 2 ** bits;
}

export function randomUpto(state: RandomState, limit: number): number {
  let bits = 0;
  let v = limit;
  while (v !== 0) {
    bits++;
    v = Math.floor(v / 2);
  }
  bits += 3;
  if (bits >= 32) {
    throw new RangeError(`random_upto: limit ${limit} requires ${bits} bits >= 32`);
  }
  const maxBound = 2 ** bits;
  const divisor = Math.floor(maxBound / limit);
  const max = limit * divisor;
  let data: number;
  do {
    data = randomBits(state, bits);
  } while (data >= max);
  return Math.floor(data / divisor);
}

export function randomStateEncode(state: RandomState): string {
  let s = "";
  for (let i = 0; i < SEEDBUF_LEN; i++) {
    s += state.seedbuf[i].toString(16).padStart(2, "0");
  }
  for (let i = 0; i < DATABUF_LEN; i++) {
    s += state.databuf[i].toString(16).padStart(2, "0");
  }
  s += state.pos.toString(16).padStart(2, "0");
  return s;
}

export function randomStateDecode(input: string): RandomState {
  const state: RandomState = {
    seedbuf: new Uint8Array(SEEDBUF_LEN),
    databuf: new Uint8Array(DATABUF_LEN),
    pos: 0,
  };
  let byte = 0;
  let digits = 0;
  let pos = 0;
  for (let k = 0; k < input.length; k++) {
    const c = input.charCodeAt(k);
    let v: number;
    if (c >= 0x30 && c <= 0x39)
      v = c - 0x30; // 0-9
    else if (c >= 0x41 && c <= 0x46)
      v = c - 0x41 + 10; // A-F
    else if (c >= 0x61 && c <= 0x66)
      v = c - 0x61 + 10; // a-f
    else v = 0;
    byte = (byte << 4) | v;
    digits++;
    if (digits === 2) {
      if (pos < SEEDBUF_LEN) {
        state.seedbuf[pos++] = byte;
      } else if (pos < SEEDBUF_LEN + DATABUF_LEN) {
        state.databuf[pos++ - SEEDBUF_LEN] = byte;
      } else if (pos === SEEDBUF_LEN + DATABUF_LEN && byte <= DATABUF_LEN) {
        state.pos = byte;
        // `pos` is not advanced, so trailing bytes are ignored, as upstream.
      }
      byte = 0;
      digits = 0;
    }
  }
  return state;
}
