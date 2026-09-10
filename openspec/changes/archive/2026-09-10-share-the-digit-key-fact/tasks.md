# share-the-digit-key-fact — tasks

Implemented 2026-09-10. Read `proposal.md` for the why and `design.md` for
what the re-measure found and what was decided.

- [x] 1.1 Re-measured by shape across every game, reading the `interpretMove`s
      rather than trusting the proposal's grep (`design.md` D1). Twenty games:
      thirteen entering a number (the proposal missed Dominosa and Filling),
      Unequal through its codec (the proposal's other codec, Group, reads
      letters only and was never a member), five binding a command to a digit
      (the proposal missed Clusters, Sticks and Unruly), and Inertia's compass.
- [x] 1.2 `digitOf(button)` in `engine/pointer.ts`, looking through the
      modifier bits (D2), with its own tests in `pointer.test.ts`; cataloged in
      `docs/games/engine-catalog.md` § "`pointer.ts`" and the guide's
      `input.md` § "The numeric keypad never arrives".
- [x] 1.3 Adopted in all twenty, each keeping its bound and its meaning for `0`
      (D3). Every input test passed unedited: the twenty games' own suites plus
      `input-parity.test.ts`, 70 files, 1750 tests. Two games gained a numpad
      route they had been missing (Guess entirely; Ascent's `5` and `0`).
- [x] 1.4 `emittable-keys.test.ts` § 3 — a code-keyed scan under every name the
      collection gives the button, proved on planted snippets and planted live
      once (D4). Two sibling assertions re-founded rather than loosened.
- [x] 1.5 The desc-character half is its own change,
      `share-the-desc-digit-fact`, scaffolded with the measurement (D6).
