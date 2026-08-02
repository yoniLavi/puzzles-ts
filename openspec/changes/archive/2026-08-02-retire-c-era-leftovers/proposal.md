# retire-c-era-leftovers

## Why

`retire-c-engine` deleted the C engine, the Emscripten build, the CMake tree and
the `USE_TS_*` flags. What it could not delete in one pass is everything those
things had *taught the rest of the tree to say*. A year of comments, one type
declaration and one config glob still describe a machine that no longer exists —
and they do it in the **present tense**, which is the part that matters.

`retire-c-engine`'s own review recorded the shape: *"Deleting the mechanism is
the easy half; the guards are what convey the false picture."* This is the rest
of that sweep, prompted by `group-crowded-source-directories` task 6.2 and then
widened by the owner: **get rid of anything that was made to work with the C
code and is not relevant any more.**

### The line this change draws

Not every mention of C is a leftover, and deleting the wrong ones would lose real
information. The test applied throughout is **can a reader act on this sentence?**

- **A comment that records where something came from is kept.**
  `random/index.ts`'s *"TypeScript port of `puzzles/random.c`"*, `sha1.ts`'s
  byte-equivalence claim, `drawing.ts`'s *"copied from upstream's emcclib.js"* —
  these name the upstream source a behaviour was derived from. Upstream still
  exists; the derivation is still true; and in `drawing.ts`'s case the comment is
  the only explanation of an otherwise arbitrary pixel rule.
- **A comment that explains why something is absent is kept.** `sentry.ts`'s note
  that `wasmIntegration()` was removed, `about-dialog.ts`'s on the deleted
  `dependencies.json` fetch, `Brewfile`'s and `build-manual.sh`'s headers. These
  are the guards `retire-c-engine` wrote *on purpose*, to stop the machinery
  being re-added. They are load-bearing.
- **An instruction that cannot be followed goes.** A command block invoking a
  binary that does not exist, against a source tree that does not exist, with a
  flag that no longer parses, writing to a directory that no longer exists.
- **A statement that is simply false goes.** "Production is the unchanged
  all-WASM path." "Public API to the remote WASM puzzle module."

## What Changes

**Dead configuration — two declared environment variables.**
`src/vite-env.d.ts` still types `VITE_USE_TS_LEAVES` and `VITE_USE_TS_RANDOM`,
with comments explaining how they pair with `-DUSE_TS_LEAVES=ON` "on the CMake
side" and install "the JS-side random bridge on the Emscripten Module". The
umbrella flag family, the bridges and the Emscripten Module are all gone; the
file's own `strictImportMetaEnv` means these are the *allowed* env keys, so this
is not a stale comment but **live configuration for a removed toolchain**.

**A glob that matches nothing.** `scripts/diff.vitest.config.mts` collects
`scripts/diff-*.test.ts`; no such file has existed since the last live
differential went with its port. Its comment says the glob is *"kept because it
costs nothing and reads as the history"* — but a config entry is not where
history goes, and the next reader has to check the filesystem to find out it is
inert.

**37 regeneration recipes that cannot be run.** Every per-game differential (and
three engine ones) carries a block like:

```
 * Regenerate the fixture while puzzles/map.c still exists:
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make map-trace)
 *   build/native/auxiliary/map-trace \
 *     > src/native/games/map/__fixtures__/map-c-reference.json
```

Every line is dead: no `puzzles/`, no CMake tree, no `USE_TS_RANDOM`, no
`build/`, no `src/native/`. **Repointing the output path would be the worst
outcome** — it would make a dead recipe look live. Each is replaced by a short
note that the fixture is frozen, naming the `<game>-trace` harness (the search
key for `git log`) and pointing at the shared helper for the full reason. The
fixtures themselves are untouched: they are the refactoring net, and this change
is exactly the kind of refactor they exist to guard.

**Four false present-tense statements.** `puzzle.ts`'s class doc ("remote WASM
puzzle module", "WASM Frontend APIs"), `engine-surface.ts`'s ("Both the
C/WASM-backed `WorkerPuzzle` and the TS-midend-backed `TsWorkerPuzzle`
`implements` this" — `WorkerPuzzle` was deleted, and `worker.ts` already records
the decision this doc contradicts), `games/index.ts`'s "production is the
unchanged all-WASM path", and `new-game-port.sh`'s checklist item pointing a new
contributor at "the C trace".

Explicitly **not** in this change:

- **The frozen fixtures, and the differentials that read them.** They are the net
  under the refactoring rounds, and `retire-c-engine` already decided they stay.
- **`PuzzleEngineSurface`.** It was built to let `worker.ts` dispatch between two
  implementations and now has one — genuinely C-era in origin. But it still earns
  its keep as the narrowed Comlink boundary type (`Remote<PuzzleEngineSurface>`
  rather than `Remote<TsWorkerPuzzle>`, which would drag the concrete class's
  whole surface across the worker boundary), and `worker.ts` states that decision
  already. Its **doc comment** is corrected; the interface stays.
- **Provenance comments naming upstream C files.** See the line drawn above.

## Impact

- **Affected specs**: `repo-layout` — the rule that a comment describing a
  procedure must be executable or marked as history, added to the requirement
  that already governs the differential shape.
- **Affected code**: `src/vite-env.d.ts`, `scripts/diff.vitest.config.mts`,
  `scripts/new-game-port.sh`, 37 differential test headers,
  `src/puzzle/{puzzle,engine-surface}.ts`, `src/games/index.ts`,
  `src/engine/testing/differential.ts` (gains the canonical note).
- **Risk**: low, and asymmetric. The comment edits cannot fail; the two real
  deletions can, and both fail loudly — removing an `ImportMetaEnv` key is a
  `tsc` error at every use site under `strictImportMetaEnv`, and removing a
  vitest `include` entry is visible in the file count `npm run diff` reports.
