# extract-hint-strings

**Readiness: done, 2026-09-10** (`tasks.md` says how it was checked). Proposed by the owner (2026-09-10),
during `cap-hint-narration-length`: *"extract hint strings into separate files,
to ease maintenance and potentially later add i18n"*. Sequenced after that
change's rewrite landed (2c5d8edb, ~100 sentences across 24 games), since
extracting first would have doubled the churn, and **before its acceptance**:
the owner chose (2026-09-10) to review the new wording from the extracted
files. So this change moves sentences and must not reword one; the wording
under review is the wording that was committed.

## Why

Every hinting game writes its narration inline in its own `narrate` function,
and the collection's most-shared sentences live in engine modules
(`latin-hint.ts`, `candidate-hint.ts`). A wording pass therefore means finding
the sentence in the code that decides it, and a reviewer has no one place to
read a game's voice. The length pass that prompted this found 613 distinct
sentence shapes across 30 games (2026-09-10) and touched every one of the
files above to shorten them.

Two payoffs, the first independent of the second:

- **The length limit could be checked statically.** Today's guard
  (`hint-quality.test.ts` § "hint narration stays readable at a glance") walks
  generated boards, so it sees only the arms that fire. Three of Tracks'
  narratable arms fire on no board its generator produces, and only a direct
  `narrate()` test reads them (`tracks-hint.test.ts`). A catalog lets every
  template be checked at its longest interpolation, reachable or not.
- **i18n would have a seam.** Not a goal yet — see "Not decided here".

## What makes it more than moving strings

Measured or met during the length pass, and each a constraint on the format:

- **Sentences are templates, not strings.** They interpolate values and lists,
  branch on plurals and on degenerate extremes (a clue of 0, a count of 1),
  choose articles by pronunciation (Filling shipped "must be a 8" until the
  length pass caught it), and compute clauses (Salad's clue names, Tracks'
  direction words). A flat key→string map cannot hold them; a catalog needs
  plural/select at least, or typed functions.
- **The cross-game guards are English.** The necessity-voice regex, the
  em-dash and speculative-vocabulary rules, every per-game deixis tie regex
  (Range, Bricks, Clusters, Light Up, Tracks) and the byte-exact wording tests
  (Galaxies) all read English text. The 120-character limit is an English
  budget. Any locale would need each of these made locale-aware or scoped.
- **An exemplar hint never loses a word to an abstraction** (`AGENTS.md`). The
  format must express every arm that ships today without flattening one.
- **Offline PWA.** Catalogs must travel with the game module, not be fetched at
  run time.

## Recommendation for the first step

**Typed per-game catalog modules** — one file per game exporting the narration
functions its `narrate` switch calls — rather than a message-format library.
It gives the one-place-per-game view, lets the length guard become static, and
leaves a seam an i18n layer could replace later, without committing to a
dependency before a second locale exists. That is `AGENTS.md`'s own rule for
framework moves: build the shape a real consumer is pressing on, and only that.

## Not decided here

- Whether i18n happens at all, and if so the message format.
- Whether the length limit becomes per-locale.
- How the English-specific guards are scoped once a second locale exists.
