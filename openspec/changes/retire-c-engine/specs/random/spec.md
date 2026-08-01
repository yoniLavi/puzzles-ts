# random Specification Delta — retire-c-engine

## REMOVED Requirements

### Requirement: Build flag toggles between C and TypeScript implementations

**Reason**: The flag selected whether the WASM engine's `random_*` calls
resolved to `puzzles/random.c` or, via a JS-library bridge, to
`src/native/random/index.ts`. With the C engine retired there is no WASM engine
making those calls: `random.c`, `random_bridge.js`, `src/native/random/bridge.ts`
and the `USE_TS_RANDOM` / `VITE_USE_TS_RANDOM` flags are all deleted. The
TypeScript implementation is not one of two options any more — it is the
implementation.

**Migration**: None needed at runtime. `src/native/random/index.ts` is reached
by direct import from the games and the engine. The **bit-identical** guarantee
that made the flag interesting is unaffected and still asserted by
`random.test.ts` against the frozen corpus — it is what keeps shared game IDs
reproducible, which was always its real job.
