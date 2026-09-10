# retire-the-framework-vision — tasks

## 1. Account for every section before deleting anything

Read in full, 2026-09-10: all six files, 1,747 lines. Each section is one of
**live elsewhere** (the rule is already stated in `AGENTS.md`, a guide or a spec),
**record** (argument and history the archive and postmortems hold), or **moves**.

- [x] 1.1 `README.md`. *Where this stands* and the six rows' lessons: record (each
      row's archived change; the postmortems for rows 3–5; the citation-guard story in
      `guard-change-id-citations`). *What the framework is for*, the owner's
      ambition: **moves** to `AGENTS.md` § "Goal". *The order of work* and its bar
      ("do we positively believe this should be free to differ?"): live in
      `AGENTS.md` § "Convention over configuration". *The dictum*: says itself that
      `AGENTS.md` is its home. The three commitments: live in
      `solver-and-generator.md` § "One engine, two projections" and `AGENTS.md`'s
      ships-with-a-hint bar. *Adding a game in one paragraph*: fiction, superseded
      by `docs/games/README.md`. *AI-native principles*: live as practice (derived
      enrollment, `Tell:` lines in six guides, lessons as guards, `AGENTS.md`
      § "Method"). *What this vision must not break*: live (`AGENTS.md`, the
      scene-graph postmortem, `solver-and-generator.md`'s no-gos, the frozen
      differentials).
- [x] 1.2 `deduction.md`. The measurement banners: record (`explore-the-deduction-
      engine-reach`, `add-tracks-hint`'s `findings.md`), and the premise finding is
      live in `hints.md` § "A rung is not a premise, so return per premise". The
      Technique contract: `id`/`tier` live in `solver-and-generator.md` § "The
      deduction fixpoint"; **the find/apply/narrate open question moves** there. The
      five projections and substrates: shipped as helpers (`candidate-hint.ts`,
      `latin-hint.ts`, `hint-plan.ts`) or refused by spec (the accept loop). Planners:
      live in `AGENTS.md` quality bar 5 and `hints.md` § "Recompute-stable plans".
      Two move sets: live in `hints.md` (Galaxies). Escape hatches: the obligations
      are `solver-and-generator.md`'s table; **the Tell moves** there.
- [x] 1.3 `guarantees.md`. *Having enrolls*: live in `testing.md` and `ts-engine`.
      The capability table: shipped rows live in their guards; the rest is
      withdrawn or record. *Instruments follow structure*: live (`test-strength.md`,
      `AGENTS.md`'s vacuity guard). *Cost control*: live in `testing.md`.
- [x] 1.4 `game-definition.md`. Params: live in `mechanics.md` and `ts-engine`.
      Board model and gestures: withdrawn, postmortems. *What has been lifted*: the
      lifted facts live in `input.md` and `emittable-keys.test.ts`; the cursor and
      completion vocabularies shipped; the note-taking flow shipped; **the extraction
      criterion moves** to `engine-catalog.md`; **digit parsing never shipped** and
      becomes `share-the-digit-key-fact` (task 3.1). Affordances: live in
      `mechanics.md` and `input.md`.
- [x] 1.5 `migration.md`. The organ table and order of adoption: finished, record
      (`re-express-the-collection`). **The invariants, two-lane acceptance and the
      capability diff move** to `docs/games/README.md`; the adapter and falsifiers
      are record (postmortems).
- [x] 1.6 `presentation.md`: withdrawn, `2026-09-09-tile-loop-inversion-withdrawal`.
- [x] 1.7 Every withdrawal has its postmortem: gesture table, board model,
      definition adapter, tile-loop inversion, and the scene graph before them.

## 2. Move, repoint, delete

- [x] 2.1 `AGENTS.md` § "Goal" gains the ambition; its guide list loses the
      design-fiction paragraph.
- [x] 2.2 `docs/games/README.md` § "A cross-game refactor moves no bytes a player
      owns"; `engine-catalog.md`'s extraction criterion; `solver-and-generator.md`'s
      Tell and the find/apply/narrate question, and its citation of the fiction
      dropped.
- [x] 2.3 `add-path-ts-port` cites `AGENTS.md` § "Goal"; the citation guard's
      ledger loses `census-the-hintless-logic-games`, whose one citation was the
      vision README's worked example.
- [x] 2.4 Specs: `repo-layout` (two requirements generalized, retirement rule
      added), `ts-engine` (two requirements name the vision as retired).
- [x] 2.5 `docs/framework-rdd/` deleted; nothing outside the record cites it.

## 3. Follow-ups

- [x] 3.1 `share-the-digit-key-fact` scaffolded, measured first by shape
      (2026-09-10). The vision's own count ("11 games", keyed on `48`/`57`) missed
      every game spelling it `0x30`; the proposal names the games and classifies
      them by what the digit means, and records the desc-character parsing found
      beside it as a separate fact.
