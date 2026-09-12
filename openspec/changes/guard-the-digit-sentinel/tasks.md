# guard-the-digit-sentinel — tasks

Not started. Read `design.md` D1 first — it records why the `number | undefined`
conversion was measured and declined, and re-opening it needs new evidence, not
the general principle.

- [ ] 1.1 State the invariant in `src/engine/decimal.ts`'s header, as the
      **reason** for the sentinel and not a description of it: every accepted
      character yields `>= 0`, so a lower-bound test is also an absence test,
      and an equality test is not. Name the guard that enforces the exception.
- [ ] 1.2 Decide `design.md` D3 (one statement plus a link, or a second
      statement) and apply it to `src/engine/desc-alphabet.ts`.

- [ ] 2.1 Add the equality scan to `src/engine/decimal.test.ts`: any `===`,
      `!==`, `==` or `!=` against a `digitValue`, `c2n` or `c2nUpper` call,
      anywhere in `src/`. Key on the shape; take the superset and classify.
- [ ] 2.2 **Prove it fails.** Plant `if (digitValue(c) !== 0)` in one game, watch
      the guard name the file and line, restore. Carry the planted snippets as
      in-test assertions too, the way the digit scan does.
- [ ] 2.3 Carry a vacuity count: how many files were scanned, asserted against a
      floor, so an unmatched glob cannot pass over nothing.

- [ ] 3.1 Collapse the repeated calls, naming the value once and letting the
      game's bound read as its own sentence: `tracks/state.ts` 342 and 379
      (three calls each), `seismic/state.ts` 467–468, `palisade/state.ts`
      207–208.
- [ ] 3.2 Verify by shape, not by a green suite: every changed line binds a
      value that was already being computed, and no bound moves.

- [ ] 4.1 Run the touched games' suites; every frozen differential must pass
      **unedited**. A fixture that moves means a bound changed, which is a
      finding and not a re-baseline.
- [ ] 4.2 Catalog nothing new (no module is added); update
      `docs/games/mechanics.md` § "Digits and numbers in a desc are one fact,
      and it is not yours" with one line on the invariant, since that is where a
      game author meets the codecs.
