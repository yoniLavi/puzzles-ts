/*
 * Worker-side bridge between WASM-resident `random_*` calls and the
 * TypeScript random module in `random.ts`.
 *
 * See `puzzles/random_bridge.js` for the JS-library shim that calls in
 * here. The C side holds opaque integer handles; this module maintains
 * the `Map<number, RandomState>` they index into.
 *
 * Handle 0 is reserved as a sentinel — never handed out, so a C caller
 * holding NULL never collides with a live state. Handles are 32-bit
 * unsigned (the C `random_state *` is a wasm32 pointer); we never
 * actually approach 2^32 distinct generators per worker, but the
 * monotonic counter is plain `number`.
 */

import {
  randomBits,
  randomCopy,
  randomNew,
  type RandomState,
  randomStateDecode,
  randomStateEncode,
  randomUpto,
} from "./random.ts";

export interface TsRandomBridge {
  randomNew(seed: Uint8Array): number;
  randomCopy(handle: number): number;
  randomBits(handle: number, bits: number): number;
  randomUpto(handle: number, limit: number): number;
  randomFree(handle: number): void;
  randomStateEncode(handle: number): string;
  randomStateDecode(input: string): number;
}

export function createTsRandomBridge(): TsRandomBridge {
  const table = new Map<number, RandomState>();
  let nextHandle = 1;

  const intern = (state: RandomState): number => {
    const handle = nextHandle++;
    table.set(handle, state);
    return handle;
  };

  const get = (handle: number): RandomState => {
    const state = table.get(handle);
    if (!state) {
      throw new Error(`tsRandomBridge: unknown random_state handle ${handle}`);
    }
    return state;
  };

  return {
    randomNew: (seed) => intern(randomNew(seed)),
    randomCopy: (handle) => intern(randomCopy(get(handle))),
    randomBits: (handle, bits) => randomBits(get(handle), bits),
    randomUpto: (handle, limit) => randomUpto(get(handle), limit),
    randomFree: (handle) => {
      table.delete(handle);
    },
    randomStateEncode: (handle) => randomStateEncode(get(handle)),
    randomStateDecode: (input) => intern(randomStateDecode(input)),
  };
}
