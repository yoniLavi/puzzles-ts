# declare-params-and-presets — tasks

Scaffolded 2026-09-04. **Not ready to implement — task 0 first.**
Its dependency has landed (`derive-difficulty-from-the-technique-ladder` and
`adopt-conventional-tier-names`, archived 2026-09-04); the proposal's block quote
says what those changed about this change's ground, and it is not what the
proposal originally expected.

## 0. Explore before proposing anything concrete

- [ ] 0.1 `/opsx:explore`. This change exists to hold the strategy decision, not
      a design. Do not start editing `params.ts` from this file as written.
- [ ] 0.2 Measure how many games' params codecs a shared parser could actually
      serve, by reading them. A shared form escaped by more games than it serves
      is not a win, and the count is the decision.
- [ ] 0.3 Decide whether the "declares `paramConfig` iff it has varying params"
      guard splits out as its own small change — it may close the documented
      blank-dialog trap on its own, and shipping it early would follow the same
      pattern as the difficulty projection.
- [ ] 0.4 Rewrite this task list from what the exploration finds.

## Standing constraints (true regardless of what the exploration decides)

- [ ] C1 **Existing games keep byte-stable params encodings.** A shared game ID
      is a promise to players; a derived codec is for new games. Any change to an
      existing encoding goes to the owner beforehand with the cost stated.
- [ ] C2 The frozen differentials cover descs, and params appear in game IDs —
      check which fixtures would actually catch an encoding change before
      relying on them.
- [ ] C3 Both shapes coexist: a game with a bespoke codec stays first-class.

## Findings

_(none yet — not started)_
