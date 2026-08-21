# repo-layout Specification Delta — fix-cross-file-mock-collision

## ADDED Requirements

### Requirement: A module is mocked by at most one test file

No module SHALL be passed to `vi.mock` from more than one test file, and a check
SHALL assert it across the test tree.

The suite runs with `isolate: false`, so the module registry `vi.mock` writes
into is shared per worker. Two files mocking the same module with different
factories therefore race: whichever loads first wins, and the other silently
receives spies it never created — assertions that stop observing anything rather
than failing loudly. `puzzle-screen.test.ts` and `puzzle-screen-load.test.ts`
both mocked `store/saved-games.ts` and `dialogs/alert-dialog.ts`, and whenever
the pair landed in one worker four assertions failed as "expected to be called
once, got 0 times" — rejecting a tree that had gated clean minutes earlier, for
no reason but where its files were scheduled.

The rule is deliberately stricter than the hazard, since two files with
identical factories would be safe: "identical" is not a property a check can
hold true over time, and one mocking file per module is cheap to keep. Two files
wanting the same mock is evidence they exercise the same seam and should be one
file.

The check SHALL resolve relative specifiers against the importing file, so two
files reaching one module by different paths still count as a collision, and
SHALL assert how many test files it scanned and that it found any `vi.mock` at
all, so a mis-rooted glob or a regex that stopped matching cannot report a clean
suite.

#### Scenario: Two test files mocking one module are reported

- **WHEN** two test files pass the same module to `vi.mock`
- **THEN** the check fails, naming the module and both files

#### Scenario: Localising a suspected cross-file leak

- **WHEN** a test fails only in a full run and passes alone
- **THEN** the suspected files are forced into one worker
  (`VITEST_MAX_WORKERS=1 vitest run <a> <b>`) rather than re-run under file-order
  shuffle, which rarely co-locates a specific pair and passed twice against this
  defect
