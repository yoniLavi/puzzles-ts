# extract-hint-strings — tasks

Not started. Read `proposal.md` first; do this after `cap-hint-narration-length`
is archived.

## 1. Decide the shape

- [ ] 1.1 Derive the population by shape, not by name: every function a
      `hint()` narration flows through, engine modules included. A scan keyed
      on `narrate` will miss games whose narration is named otherwise
      (`AGENTS.md` § "A scan that keys on a name").
- [ ] 1.2 Pick the catalog form (typed per-game modules recommended) and show
      that it expresses the hardest arms without loss: Salad's border clues,
      the Latin chain, Light Up's quantified discount, Singles' offset.
- [ ] 1.3 Pilot on one game end to end, and measure the diff against a pure
      move.

## 2. Make the length guard static

- [ ] 2.1 Lint every catalog template at its longest interpolation, reachable
      or not, keeping the runtime walk as the check that the templates are the
      ones actually spoken.
- [ ] 2.2 Retire the per-arm `narrate()` length tests that the static check
      subsumes, saying what still covers each.

## 3. Roll out

- [ ] 3.1 Migrate the remaining games and the shared engine templates.
- [ ] 3.2 Spec delta (`ts-engine`) and delete `.openspec.yaml`'s marker.
