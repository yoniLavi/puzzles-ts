## Context

This is the integration half of `port-random-to-typescript`. That change's
design.md picked Option A (TS owns state, C holds an integer handle) and
`--js-library` as the bridge mechanism. This document records what
actually went wrong while wiring it up, so the next seam (tree234, dsf,
…) doesn't relearn the same lessons.

The TL;DR of what got built end-to-end: a single CMake option
`USE_TS_RANDOM` (default OFF) flips `random.c` out of `core_obj` and
links `puzzles/random_bridge.js` into every wasm via
`em_link_js_library`. The worker installs a `Map<number, RandomState>`
handle table on `Module.tsRandomBridge` before WASM instantiation, gated
by `VITE_USE_TS_RANDOM`. Five puzzles (cube, flip, mines, loopy, solo)
load and render with zero console errors against the bridged build.

Byte-fidelity is locked at the board level: Solo with
`randomSeed=3x3#786954740169111` produces byte-identical
`formatAsText()` output under both flag positions (MD5
`d704406cde2b755bf708f9dc543b1c96`), proving the C generator's seed →
board pipeline produces the same result whether `random_*` is resolved
by `random.c` or by `Module.tsRandomBridge`. The flag-OFF rebuild is
itself green and reproduces the pre-change baseline.

## Surprises hit while implementing

These are not in the original `port-random-to-typescript` design.md. They
all bit on the *first attempt* and forced a rebuild each (~4 min cold
docker, so ~half an hour wasted before we had the right shape).

### 1. `random.c` carries `misc.c`'s SHA-1 dependency

`random.c` defines both the `random_*` functions *and* `SHA_Init` /
`SHA_Bytes` / `SHA_Final` / `SHA_Simple`. `misc.c` consumes the SHA half
(for game-seed obfuscation). The original design.md noted "SHA-1 stays
internal to the random module (for now) — misc.c stays on C SHA" but
that's incompatible with *excluding random.c entirely*: doing so kills
misc.c too with a link-time `undefined symbol: SHA_Final`.

**Fix.** A new `puzzles/sha.c` carrying a verbatim extract of the SHA
portion of `random.c` (lines 1-198). It is conditionally substituted for
`random.c` in `core_obj` when `USE_TS_RANDOM=ON`. The SHA seam will
delete this file when it ports the C SHA to TS.

**Lesson for the next seam.** Before excluding a C module, grep the rest
of the C tree for *every* symbol it defines, not just the ones in the
module's "public" interface. `nm --defined-only file.c.o` gives the
complete list.

### 2. `Docker/build-emcc.sh` is baked into the image

`build-emcc.Dockerfile` does `COPY ./Docker/build-emcc.sh /app/build-emcc.sh`
at build time. Editing the script locally has no effect on container
runs unless `-v ./Docker/build-emcc.sh:/app/build-emcc.sh:ro` is also
mounted (the Dockerfile comment notes this) or the image is rebuilt.

**Lesson.** Any future seam that adds env-var plumbing through this
script needs to either rebuild the image or document the mount. The
README now does the latter for `USE_TS_RANDOM`.

### 3. `tee` in our run command swallowed the docker exit code

`docker run ... build-emcc 2>&1 | tee log.txt` exits 0 even when the
container failed (it's `tee`'s exit code that propagates). The first
"successful" build I thought I had was actually a silent failure with
hundreds of `undefined symbol: SHA_*` errors. Hours of debugging the
wrong layer.

**Lesson.** When running docker via bash, either skip `tee` (write the
log via `--log` or `> log 2>&1`), or use `set -o pipefail`, or check
`PIPESTATUS[0]` explicitly. The harness's Bash tool does not enable
pipefail by default.

### 4. `--js-library` requires a live C reference to emit JS imports

This is the big one. The emscripten linker (wasm-ld) only emits an
`(import "env" "random_new" ...)` declaration in a puzzle's wasm if the
puzzle's link set has an *undefined* reference to `random_new`. Symbols
that no C code uses (e.g. `random_copy` — no puzzle calls it) are
dead-code-eliminated; their JS-library bodies are dropped too.

This breaks the build-emcc.sh invariant that a single `emcc-runtime.js`
(copied from `nullgame.js`) can load every puzzle's wasm. Each puzzle's
.js inlines JS bodies *only for the JS-library functions its wasm
imports*: nullgame imports 3 of the 7 random_* symbols (random_new,
random_upto, random_free), mines imports 6 of 7 (adding random_bits,
random_state_encode, random_state_decode). Using nullgame.js to
instantiate mines.wasm throws `LinkError: import object field
random_bits is not a Function`.

Things I tried that did not work, listed so the next seam doesn't waste
the cycles:

- `[[maybe_unused]] volatile void *const arr[] = { &random_new, ... };`
  — DCE'd by wasm-ld despite `volatile`, because the array is in an
  anonymous namespace with no external linkage and the values are never
  read.
- `__deps:` arrays in `random_bridge.js` referencing the other six
  bridge functions — emscripten's library processor reads `__deps` at
  compile time, but the dependents themselves must be referenced from
  *somewhere* (C or another included JS-library entry) for the inclusion
  to chain through. A function that nothing imports stays excluded
  regardless of `__deps`.

**Fix that worked.**

```cpp
extern "C" __attribute__((used))
void puzzles_ts_force_link_random_bridge(void) {
    (void)random_new(nullptr, 0);
    (void)random_copy(nullptr);
    // ... all seven
}
```

`__attribute__((used))` is the only annotation wasm-ld respects for "do
not eliminate this symbol." It must be paired with `extern "C"` (so the
mangled C++ name doesn't hide the un-mangled `random_*` references) and
the function body must actually call/reference each random_* symbol.
The function is never invoked at runtime; its body exists purely to
force-import all seven into every puzzle's wasm.

**Lesson for the next seam.** When you bridge a C module of N functions
via --js-library, you almost certainly need a `__attribute__((used))`
keep-alive in `webapp.cpp` (or some other always-linked .cpp) that
references every public function. Don't try to be clever with volatile
pointer arrays or __deps — neither works.

### 5. `--js-library` link order doesn't go where CMake puts it

Initially I followed the upstream pattern and added
`em_link_js_library(${TARGET} .../random_bridge.js)` inside the
`set_platform_puzzle_target_properties` function. That puts the
`--js-library` arg in the link command (CMakeFiles/<target>/linklibs.rsp)
correctly, but emcc only resolves JS-library entries against *undefined
symbols at link time*. If the linker doesn't see any references (point
4), the JS-library bodies are dropped from the output even though the
file was technically "linked." Easy to confuse with "the link library
was never wired up."

**How to verify it IS wired up.** Look at
`build/CMakeFiles/<puzzle>.dir/linklibs.rsp` after a cmake configure.
Search for `--js-library`. If it's there, the wiring is good and you
should debug emission via wasm-dis instead.

## Tooling for the next bridge

These commands are the inner debugging loop I converged on:

```bash
# 1) Confirm the right .o files have undefined refs:
docker run --rm -v "$BUILD_DIR:/b:ro" --entrypoint /bin/bash build-emcc -c \
  '/emsdk/upstream/bin/llvm-nm --undefined-only /b/CMakeFiles/<name>.dir/<file>.c.o | grep <prefix>_'

# 2) Confirm the wasm import section has the env entries you expect:
docker run --rm -v "$DIST:/wasm:ro" --entrypoint /bin/bash build-emcc -c \
  '/emsdk/upstream/bin/wasm-dis /wasm/<puzzle>.wasm | grep -oE "\"<prefix>_[a-z_]+\"" | sort -u'

# 3) Confirm the runtime .js inlines the JS-library bodies:
grep -oE "_<prefix>_[a-z_]+" src/assets/puzzles/emcc-runtime.js | sort -u

# 4) Confirm the worker installed the bridge object:
# In dev server with VITE_USE_<X>=1, eval in the worker:
self.<Module>.<bridge>  // should be present
```

## What still needs follow-up

- **Docker → native emsdk migration.** Discussed during the session.
  Worth its own openspec change once this lands; the Docker iteration
  cycle (~4 min cold) was the dominant time sink while debugging the
  surprises above. Halibut + emsdk are already installable on macOS.

- **`puzzles/sha.c` is a duplication.** Lives in the subtree as a
  verbatim extract of random.c's SHA portion. Will be deleted by the
  SHA-1 seam port. Until then, if upstream changes random.c's SHA
  implementation, re-sync sha.c by hand.

- **`puzzles_ts_force_link_random_bridge` in webapp.cpp** is dead code
  at runtime but live for the linker. The next seam's bridge will
  probably want a similarly-named symbol; consider promoting a single
  `puzzles_ts_force_link_bridges()` umbrella function that all seams
  contribute to.
