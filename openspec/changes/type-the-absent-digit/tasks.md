# type-the-absent-digit — tasks

Not started. Read `design.md` first: D1 records why the opposite change was
scaffolded and withdrawn, and D4 is the per-site guidance.

- [ ] 1.1 Change `digitValue` in `src/engine/decimal.ts` to return
      `number | undefined`, and state in the header that the absent case is
      outside the return type **because** a value inside it is one nobody has to
      check.
- [ ] 1.2 The same for `c2n` and `c2nUpper` in `src/engine/desc-alphabet.ts`.
      Their `-1` is also quoted in the module header and in
      `docs/games/engine-catalog.md`; repoint both.
- [ ] 1.3 Fix the two round-trip tests that assert `-1` for a rejected
      character (`desc-alphabet.test.ts`, `decimal.test.ts`), keeping what they
      assert: that exactly the alphabet's own characters are accepted, and the
      count of them.

- [ ] 2.1 Work the call sites the compiler names, **reading each** (all 42;
      `design.md` D4 has the shapes). Lower-bound sites bind and test; typed-
      array writes state the array's own absent constant.
- [ ] 2.2 Filling first, as the exemplar: its array's absent value is `0`, not
      `-1`, so today a non-digit would store `255`. Make the write say which
      constant it means.
- [ ] 2.3 Where a write is safe only because `validateDesc` screened the
      character, say so at the write. That cross-function dependency is the
      defect class this change exists for.

- [ ] 3.1 Every frozen differential passes **unedited**; `params-stability`
      moves no line; no snapshot is re-baselined. A fixture that moves is a
      finding, not a re-baseline.
- [ ] 3.2 Verify by shape, not by a green suite: every changed line either
      binds a value that was already computed or names an absent constant. Read
      the exceptions.
- [ ] 3.3 Run the app. The codecs sit under every desc, so a mistake reaches
      the board rather than a test: Crossing, Salad in both modes, Slant,
      Filling, Palisade, Bridges, Tracks, Loopy.

- [ ] 4.1 Update `docs/games/mechanics.md` § "Digits and numbers in a desc are
      one fact, and it is not yours" with the rule and the reason.
- [ ] 4.2 Check whether the `decimal.test.ts` digit scan needs widening: with
      the sentinel gone, `- 48` is still banned, but a new `?? -1` spelling is
      now legitimate and must not be caught.
