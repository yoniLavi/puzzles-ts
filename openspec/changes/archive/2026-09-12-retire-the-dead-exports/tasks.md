## 1. Take the categories first

- [x] 1.1 Grouped by name. The four largest — `DIFF_NAMES` (9), `DIFF_CHARS`
      (9), `DIFFCOUNT` (5), `HINT_PLAN_MAX` (4) — are **not** what this task
      expected. Each is read by its own declaring file (a game's `state.ts`
      names its tiers in `presets()` and `paramConfig`), so they are not copies
      a convention left behind but local bindings exported out of habit: the
      fix is the keyword, and it is the same fix 199 times.
- [x] 1.2 Solo's `SYMM_ROT4` is a shadow, and it is also read by its own file,
      so un-exporting it is what removes the second *importable* spelling of one
      meaning while leaving Solo's own use alone. The engine's live constant in
      `symmetric-blacks.ts` stays the one anything can import.

## 2. The rest, one file at a time

- [x] 2.1 Sorted, and the answer is lopsided: **199 un-exports, 5 deletions, 0
      ledger entries**, out of 204 after the check learned about signature types
      (proposal, "What the 373 turned out to be"). The five deleted are
      Galaxies' `_internals` (a test hook no test reads; Loopy's live one is
      what made it look plausible) and `removeDot`, and Undead's `CELL_EMPTY`,
      `CELL_UNDEF` and `diffChar`. The two `CELL_*` leave a gap in a
      transcribed enum, so the block says why they are absent.
- [x] 2.2 The types are the *largest* category, 163 of 376, and neither
      deletion nor a ledger is right for them — the check learned the rule
      instead. The Lit classes need no entry either: a class registered by
      `@customElement` in its own file is not imported by anything.
- [x] 2.3 Verified by shape rather than by a green suite: a throwaway that reads
      `git diff -U0` and asserts every removed line is the same line with
      `export ` gone. 182 hunks, **10 exceptions, every one read**: the check's
      own doc comment, three signatures biome rejoined onto one line once the
      keyword no longer pushed them over 88 characters, the `export type { … }`
      list Flip's `MatrixType` came out of, and the five deletions.

## 3. Close

- [x] 3.1 `scripts/checks/unused-exports.mjs` is in the gate's fast prefix, and
      in `AGENTS.md`'s step list — which was **missing `vacuous-assertions.mjs`
      too**, so the one place the steps are written out had already drifted by
      one. Both are there now.
- [x] 3.2 Proved red twice, because the check gained a rule in this change and
      one direction is not enough: re-exporting `hint-mark.ts`'s `MARK_TOP`
      fails it, and so does a planted dead `interface` — which is what shows the
      signature rule did not blanket-exempt every type.
- [x] 3.3 Full gate green.
- [x] 3.4 Archived.
