# share-the-digit-key-fact — tasks

Not started. Read `proposal.md` first.

- [ ] 1.1 Re-measure by shape across every game, reading the `interpretMove`s
      rather than trusting the proposal's grep, and classify each site into the
      proposal's three rows — naming the games, not counting them.
- [ ] 1.2 Add the helper to `engine/pointer.ts` with its own test, and catalog it.
- [ ] 1.3 Adopt it game by game, each keeping its bound and its meaning for `0`;
      every input test passes unedited.
- [ ] 1.4 Extend `emittable-keys.test.ts` or an equivalent derived guard so a game
      hand-parsing a digit again is caught.
- [ ] 1.5 Decide the desc-character half (proposal § "Measured beside it"): adopt
      `desc-alphabet.ts`'s `c2n` site by site here, or scaffold it as its own
      change.
