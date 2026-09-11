## 1. Measure the catch rate first

- [ ] 1.1 Take the thirteen tests the tidy pass strengthened, reconstruct each
      one's pre-fix body from git history, and measure how many of the three
      shapes would have caught each. Record the count; it decides whether shape 3
      is worth building.

## 2. Build the guard

- [ ] 2.1 Add a check under `scripts/checks/` that fails on an assertion whose
      two sides are the same expression, with a floor on the test files scanned.
- [ ] 2.2 Add the unconditional-bound shape, with a ledger for the cases where a
      non-negative assertion is meaningful.
- [ ] 2.3 If 1.1 supports it, add the conditional-only shape: a test whose
      assertions all sit under a conditional must also assert how many cases it
      reached.
- [ ] 2.4 For each shape, plant a vacuous test, see the guard fail, and remove it.
      Verify the whole tree passes the guard.

## 3. Close

- [ ] 3.1 Wire the guard into the gate's fast prefix, and verify its cost is in
      the same range as the other node checks.
- [ ] 3.2 Record the measured catch rate in `docs/test-strength.md` § 3 beside the
      shapes it already names.
- [ ] 3.3 Archive the change.
