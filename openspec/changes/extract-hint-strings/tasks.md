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

- [x] 2.1 Lint every catalog template at its longest interpolation, reachable
      or not, keeping the runtime walk as the check that the templates are the
      ones actually spoken.
      **Declined, with the measurement that decided it.** A typed function has
      no "longest interpolation" to read without sample arguments for every
      parameter, and a table of those is a manifest only the guard reads —
      the shape `AGENTS.md` refuses. The half that *is* static, the plain-string
      entries, is the half the runtime walk already reaches: every constant
      sentence the census recorded was spoken on a generated board. The
      unreachable arms (Tracks' three, Palisade's post-dedup singleton) are
      held by their games' direct `narrate()` tests, as before.
- [x] 2.2 Retire the per-arm `narrate()` length tests that the static check
      subsumes, saying what still covers each. Nothing to retire: 2.1 was
      declined, so those tests remain the cover for the unreachable arms.

## 3. Roll out

- [x] 3.1 Migrate the remaining games and the shared engine templates. Thirty
      text modules: 29 games' plus the engine's. Untangle's hint speaks no
      words and has none. Every batch was checked the same two ways — the
      census byte-identical for its games (374 + 2,279 + 2,451 + 8,349 +
      2,606 = all 16,059 steps) and every literal on a removed line re-added —
      and committed through the gate in five commits.
- [x] 3.2 Spec delta (`ts-engine`) and delete `.openspec.yaml`'s marker. The
      shared-narrator requirement names its new module; a new requirement
      states the convention and its derived guard.
- [x] 3.3 `engine/hint-vocab.ts` folds into `engine/hint-text.ts`: the
      sliding-tile prefix was already one small file of shared words, and two
      homes for shared words is the drift this change exists to stop.
- [x] 3.4 Refusals stay out. `hint-refusal.test.ts` holds every
      `{ ok: false, error: <literal> }` in the tree to one list, with Inertia's
      dead ball as a named exception; moving a refusal into `say` would take it
      out of that guard's sight.
- [x] 3.5 Guard: `engine/hint-text-convention.test.ts` derives which hints
      speak and which games have a text module, and asserts each against the
      other. Shown to fail with Tracks hidden from it before it was trusted.
- [x] 3.6 `docs/games/hints.md` § "The sentences live in one file per game",
      the engine catalog's `hint-text.ts` entry, and the sliding-tile link
      repointed.

## 4. What the extraction found

- [x] 4.1 With every sentence in one place per game, one sweep for an article
      before an interpolation found six sentences in four games that read "a 8"
      at an 8 (Keen's cage line, Solo's `dup`, two of Crossing's, two of
      Dominosa's). Fixed in the commit after the move, and recorded under
      `cap-hint-narration-length`, whose wording is the owner's to accept.
