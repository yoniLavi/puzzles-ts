/*
 * random_bridge.js: Emscripten --js-library shim that routes the seven
 * public random_* symbols (puzzles.h:552-558) to a TypeScript bridge
 * installed on the Module as `tsRandomBridge`.
 *
 * The TS side owns canonical RandomState objects; the C side gets back
 * opaque integer handles. See openspec/changes/wire-random-to-wasm/ for
 * the full design (and Option A in the port-random-to-typescript design.md).
 *
 * This file is part of the in-tree subtree (puzzles/) but is *not*
 * upstream — it's the only meaningful local addition under puzzles/
 * for this seam. Linked into each WASM target via em_link_js_library
 * iff USE_TS_RANDOM is ON.
 *
 * Every random_* symbol __deps on every other one. This is wasteful in
 * theory (a puzzle that only calls random_upto pays the JS bytes for
 * all seven). In practice it's the invariant that lets us keep
 * `Docker/build-emcc.sh` copying a single nullgame.js as
 * `emcc-runtime.js` shared across all puzzle wasms. Without it,
 * nullgame.js (whose wasm only imports random_new/upto/free) would be
 * missing JS bodies for the four imports that show up in other puzzle
 * wasms (random_bits, random_copy, random_state_encode,
 * random_state_decode), and instantiation of those wasms would throw
 * LinkError. The dep arrays must be JS literals — emscripten's library
 * processor reads them at compile time and does not evaluate captured
 * variable references.
 */

mergeInto(LibraryManager.library, {
    // random_state *random_new(const char *seed, int len)
    //
    // seed is a `len`-byte binary buffer (NOT a null-terminated string —
    // callers like galaxies.c pass `(void*)&time_t`). We must read from
    // HEAPU8 directly rather than UTF8ToString, which stops at NULs.
    random_new__deps: ['random_copy', 'random_bits', 'random_upto', 'random_free', 'random_state_encode', 'random_state_decode'],
    random_new: function(seedPtr, len) {
        var seed = HEAPU8.slice(seedPtr, seedPtr + len);
        return Module.tsRandomBridge.randomNew(seed);
    },

    // random_state *random_copy(random_state *tocopy)
    random_copy: function(handle) {
        return Module.tsRandomBridge.randomCopy(handle);
    },

    // unsigned long random_bits(random_state *state, int bits)
    random_bits: function(handle, bits) {
        // Coerce to unsigned 32-bit. random_bits can return up to 2^32-1,
        // which would be negative under JS signed-int32 semantics.
        return Module.tsRandomBridge.randomBits(handle, bits) >>> 0;
    },

    // unsigned long random_upto(random_state *state, unsigned long limit)
    random_upto: function(handle, limit) {
        return Module.tsRandomBridge.randomUpto(handle, limit >>> 0) >>> 0;
    },

    // void random_free(random_state *state)
    random_free: function(handle) {
        Module.tsRandomBridge.randomFree(handle);
    },

    // char *random_state_encode(random_state *state)
    //
    // Returns C-owned heap memory. Caller (game code via sfree) frees it.
    random_state_encode__deps: ['$stringToUTF8', '$lengthBytesUTF8', 'malloc'],
    random_state_encode: function(handle) {
        var s = Module.tsRandomBridge.randomStateEncode(handle);
        var lenbytes = lengthBytesUTF8(s) + 1;
        var dest = _malloc(lenbytes);
        if (dest !== 0) {
            stringToUTF8(s, dest, lenbytes);
        }
        return dest;
    },

    // random_state *random_state_decode(const char *input)
    //
    // input is a null-terminated hex string, so UTF8ToString is safe.
    random_state_decode__deps: ['$UTF8ToString'],
    random_state_decode: function(inputPtr) {
        var input = UTF8ToString(inputPtr);
        return Module.tsRandomBridge.randomStateDecode(input);
    },
});
