## 1. The import cost

- [ ] 1.1 Build the two-arm harness on one game's hot loop: a direction table as
      a module-local const, and the same table imported from a sibling module.
- [ ] 1.2 Measure under vitest, paired and interleaved, and record the ratio.
- [ ] 1.3 Measure the same two arms in a production build, and record whether the
      cost survives bundling.
- [ ] 1.4 Record the outcome either way. If the cost is real only under the test
      transform, say so in `docs/games/testing.md`; if it survives the build, say
      so in `docs/games/solver-and-generator.md` where shared helpers are
      discussed.

## 2. The A/A control

- [ ] 2.1 Run the three arms: one instance timed twice, two instances timed once
      each, and a fuzz-polluted instance.
- [ ] 2.2 Compare the spreads, and decide whether the one-instance control is
      optimistic.
- [ ] 2.3 If it is, add the row to `docs/test-strength.md` § 7 and correct the
      paired-timing recipe wherever it is written down, naming which past
      conclusions rested on the old control.

## 3. Close

- [ ] 3.1 If either claim is false, record that too, so it is not re-investigated.
- [ ] 3.2 Run the full gate.
- [ ] 3.3 Archive the change.
