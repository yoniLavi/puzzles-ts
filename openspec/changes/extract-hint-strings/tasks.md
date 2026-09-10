# extract-hint-strings — tasks

Read `proposal.md` first. `cap-hint-narration-length`'s wording is committed
and its owner acceptance waits on this change, so this is a pure move: no
sentence changes.

## 1. Decide the shape

- [x] 1.1 Derive the population by shape, not by name: every function a
      `hint()` narration flows through, engine modules included. A scan keyed
      on `narrate` will miss games whose narration is named otherwise
      (`AGENTS.md` § "A scan that keys on a name").
      Keyed on what a step *is* rather than what code is called: a census
      reads `step.explanation` from every `hint()` the registry declares, every
      tier (or every preset, untiered), three seeds, thirty plans deep. 2026-09-10:
      **31 games, 16,059 steps, 2,382 distinct sentences, 32 refusals.** The
      source side, a sentence-literal grep, adds the two engine modules
      (`latin-hint.ts`, `candidate-hint.ts`); `hint-refusal.ts` is already one
      file of strings and stays as it is.
- [x] 1.2 Pick the catalog form (typed per-game modules recommended) and show
      that it expresses the hardest arms without loss: Salad's border clues,
      the Latin chain, Light Up's quantified discount, Singles' offset.
      Typed modules: `src/games/<id>/hint-text.ts` exporting `say`, a string
      per fixed sentence and a typed function per templated one, taking values
      as the board means them (an axis, a count, a direction) and choosing
      every word itself. All four hard cases are "values in, sentence out"
      already; none needs anything a function cannot say.
- [x] 1.3 Pilot on one game end to end, and measure the diff against a pure
      move. Tracks: +136 −86 over two files, all 374 census steps byte-identical,
      and all 58 literal runs on removed lines re-added (a scratch diff check,
      shown to fail on a one-word change before it was trusted).

## 2. Make the length guard static

- [ ] 2.1 Lint every catalog template at its longest interpolation, reachable
      or not, keeping the runtime walk as the check that the templates are the
      ones actually spoken.
- [ ] 2.2 Retire the per-arm `narrate()` length tests that the static check
      subsumes, saying what still covers each.

## 3. Roll out

- [ ] 3.1 Migrate the remaining games and the shared engine templates.
- [ ] 3.2 Spec delta (`ts-engine`) and delete `.openspec.yaml`'s marker.
