# fix-cross-file-mock-collision

## Why

**The pre-commit gate rejected a tree that had gated clean sixty seconds
earlier, and the difference was which worker two test files landed in.**

`vitest.config.ts` runs the suite with `isolate: false` and argues at length
that this is safe because the suite is order-independent under shared module
state, naming **the one shared mutable singleton** — the game registry — and
how it is kept idempotent.

There is a second, and it is not one this repo wrote: **vitest's per-worker
module registry, which `vi.mock` writes into.** `puzzle-screen.test.ts` and
`puzzle-screen-load.test.ts` both mocked `store/saved-games.ts` and
`dialogs/alert-dialog.ts`, with different factories. When the pair landed in one
worker, the second file silently received the first file's spies — no error, no
warning, just four assertions that stopped observing anything and failed as
*"expected to be called once, got 0 times"*.

Three things make it worth a change rather than a quiet fix:

1. **It fails a good commit for a scheduling accident**, which is the
   self-compounding failure mode `vitest.config.ts`'s whole timeout history is
   about, and the one thing that config says must never happen.
2. **It is invisible to the technique the config recommends.** Two full runs
   under `sequence.shuffle.files` passed; shuffling file order rarely co-locates
   one specific pair in one worker. Forcing the suspects into a single worker
   reproduced it every time, immediately.
3. **The config's claim is now false**, and a comment asserting a safety
   property that does not hold is worse than no comment.

## What Changes

- **Merge the two files.** They are the same component (`PuzzleScreen`), the
  same tier, the same fakes; they were split by subject, not by dependency.
  One file, one `vi.hoisted` block, one factory per mocked module — the
  collision has nowhere to happen. The board-choice suite keeps its own
  `beforeEach` so the command tests do not pay for a `fake-indexeddb` round trip
  each.
- **Guard it**: `src/no-duplicate-module-mocks.test.ts` asserts no module is
  `vi.mock`ed from more than one test file, resolving relative specifiers so two
  files reaching the same module by different paths still collide. The rule is
  deliberately stricter than the hazard — two files with *identical* factories
  would be fine — because "identical" is not a property a check can hold true
  over time, and one mocking file per module is cheap. Two files wanting the
  same mock is a sign they test the same seam.
- **Correct `vitest.config.ts`**: two shared mutable singletons, not one, and
  the localisation technique that actually works (`VITEST_MAX_WORKERS=1` over
  the suspected pair, not a shuffle).

## Impact

- Affected specs: `repo-layout` (one ADDED requirement).
- Affected code: `src/screens/puzzle-screen.test.ts` (absorbs
  `puzzle-screen-load.test.ts`, which is deleted), the new guard,
  `vitest.config.ts`.
- **No production code changes**, and no test is dropped: 9 + 7 = 16, all
  passing, including under the worker order that reproduced the failure.
- Found while doing the `audit-vestigial-contract-surface` follow-up, by the
  gate rejecting a commit. Not caused by it — it reproduces on the clean tree at
  `12d3aad`.
