# separate Specification Delta — retire-completed-migration-requirements

## REMOVED Requirements

### Requirement: Separate is registered, catalogued, and its C is deleted

**Reason**: This described a **one-time migration event** — register the TS port
for owner smoke-testing while the game still ran on C/WASM via the empty-registry
fallback, then on owner-accepted parity flip the CMake `TS_PORTED` marker and
delete the `.c`. That event completed for this game, and `retire-c-engine`
removed every mechanism it names: there is no C source, no `TS_PORTED` flag, no
CMake, and no fallback path to be served by. Its scenarios ("`TS_PORTED` is not
set and `puzzles/separate.c` is not deleted") cannot be evaluated, let alone fail.

Keeping it would assert an ongoing obligation about files that do not exist,
which is exactly how a spec starts lying to the next reader.

**Migration**: The event itself is recorded in this game's archived port change
and in git history. The **rule** it was an instance of — that owner acceptance,
not a green automated suite, decides game work is done — survives as a
requirement of its own in the `ts-migration` spec, where it belongs: it is a
lesson about verification, not a fact about the C build.
