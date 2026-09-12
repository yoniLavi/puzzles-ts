# share-the-desc-digit-fact — tasks

Implemented 2026-09-12. Read `proposal.md` for the original grep and
`design.md` for what reading the sites found instead.

- [x] 1.1 Re-measure by shape — every digit test, digit-run scan, digit read
      and digit write in a non-test game source, read and classified
      (`design.md` D1: ~110 sites in some 40 files, four shapes plus a second
      alphabet; the decimal scanner already existed in `params.ts`).
- [x] 1.2 Decide per shape (`design.md` D2–D4): `engine/decimal.ts` with
      `isDigit`, `digitValue` and the moved `parseLeadingInt`; `n2cUpper` /
      `c2nUpper` in `desc-alphabet.ts`; `String(n)` for a written digit;
      hex stays `parseInt(c, 16)`; Salad's and Unequal's own codecs keep
      their shape and lose the reserved names.
- [x] 1.3 Adopt, game by game. Every frozen differential passes unedited;
      `params-stability.test.ts` moves no line. The three deliberate
      behavior changes are `design.md` D5.
- [x] 1.4 Widen the digit guard from "against the button" to "any operand
      in any game source" (`decimal.test.ts`), proved on planted copies of
      each shape; generalize the shadow scan in `emittable-keys.test.ts` § 2
      to the four fact modules, proved on the eleven copies it found.
- [x] 1.5 Catalog `decimal.ts` and the second alphabet
      (`docs/games/engine-catalog.md`); the desc-codec guidance in
      `docs/games/mechanics.md` § "Digits and numbers in a desc are one fact,
      and it is not yours"; repoint `docs/games/input.md`; spec deltas under
      `specs/ts-engine/`.
