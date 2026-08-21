# Tasks — fix-cross-file-mock-collision

## 1. Diagnose before fixing

- [x] 1.1 Reproduce deterministically rather than re-running. Two full runs
      under `sequence.shuffle.files` passed; forcing the suspects into one
      worker (`VITEST_MAX_WORKERS=1 vitest run <a> <b>`) failed every time.
- [x] 1.2 Narrow to the single file that causes it, by pairing each candidate
      with the failing file in turn — `toast.test.ts` and `saved-games.test.ts`
      are innocent; `puzzle-screen-load.test.ts` is the one.
- [x] 1.3 Establish whether it predates the work in flight. It does: it
      reproduces on the clean tree at `12d3aad`. (Owned regardless — this repo
      does not have an "unrelated" category — but the attribution matters for
      knowing what to fix.)
- [x] 1.4 Check whether the pair is the only one. `vi.mock` is used by exactly
      three call sites across two files, and both duplicated modules are that
      pair, so merging closes the whole instance.

## 2. Fix

- [x] 2.1 Merge `puzzle-screen-load.test.ts` into `puzzle-screen.test.ts`: one
      `vi.hoisted` block, one factory per mocked module. 16 tests, none dropped.
- [x] 2.2 Scope the board-choice `beforeEach` to its own `describe`, so the
      command tests do not each pay for a `fake-indexeddb` round trip.
- [x] 2.3 Verify under the order that reproduced the failure.

## 3. Guard

- [x] 3.1 `src/no-duplicate-module-mocks.test.ts` — no module `vi.mock`ed from
      two test files, with relative specifiers resolved against the importer.
- [x] 3.2 Proved to fail: restoring the deleted file from `12d3aad` makes it
      report both collisions by name, then reverted.
- [x] 3.3 Vacuity guards: test-file count, and that any `vi.mock` was found at
      all — this check's whole failure mode is looking at nothing.

## 4. Correct the record

- [x] 4.1 `vitest.config.ts` claimed the game registry was *the* one shared
      mutable singleton. There are two; the second is vitest's own module
      registry. Corrected, with the localisation technique that works and a note
      that the shuffle it recommends did not catch this.
- [x] 4.2 `repo-layout` spec delta (ADDED).

## 5. Close out

- [x] 5.1 Owner acceptance (2026-08-21), then archive.
