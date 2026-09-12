## 1. Measure the catch rate first

- [x] 1.1 Take the thirteen tests the tidy pass strengthened, reconstruct each
      one's pre-fix body from git history, and measure how many of the three
      shapes would have caught each.

      **Done by running each candidate over every test file of those thirteen
      games at the tidy commit's parent and again at the commit**, so the
      measurement is of files rather than of a hand-identified test. Result:
      shape 1 caught **0 of 13** (and reports five sites at HEAD, every one a
      sound determinism check); shape 2 caught **0 of 13** (eleven sites, the
      residue an earlier change already reviewed and recorded); shape 3 caught
      **5 of 13**. The proposal's "perhaps half" was optimistic, and its
      confidence ordering was inverted.

      The measurement imports the rule from the shipped guard rather than
      restating it, so it measures the guard and not a paraphrase.

## 2. Build the guard

- [x] 2.1 ~~an assertion whose two sides are the same expression~~ **Not built.**
      0 of 13, and all five hits in the tree are legitimate.
- [x] 2.2 ~~the unconditional-bound shape~~ **Not built.** 0 of 13, and the
      single-character `toContain` was already measured and settled by
      `close-bulk-edit-blind-spots`'s follow-up.
- [x] 2.3 The conditional-only shape, as `scripts/checks/vacuous-assertions.mjs`,
      with floors on files and tests and a title-keyed ledger. The key counts
      `if (…) continue;` and `if (…) return;` as the same guard, which is what
      took the rate from 4 to 5; `docs/test-strength.md` § 3 records why it stops
      before loop bodies (301 sites, a wall).
- [x] 2.4 For each shape, plant a vacuous test, see the guard fail, and remove
      it. **Done as a permanent property rather than a one-off**: the guard
      self-tests on every run against seven fixtures — three it must report,
      four it must not — and fails if any behaves wrongly. A guard about tests
      that cannot fail may not be one.
- [x] 2.5 Fix the 53 sites the first run found. 51 fixed, 2 ledgered with
      reasons. Every counter added held when the suite ran, which is the evidence
      that each scan really does reach its case.

## 3. Close

- [x] 3.1 Wire the guard into the gate's fast prefix. ~1.2 s, in the same range
      as the spelling guard.
- [x] 3.2 Record the measured catch rate in `docs/test-strength.md` § 3 beside
      the shapes it already names.
- [x] 3.3 Archive the change.
