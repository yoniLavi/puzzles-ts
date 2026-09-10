# retire-the-framework-vision

## Why

`docs/framework-rdd/` was the framework written readme-first (`rewrite-game-dev-docs`,
2026-08-07): a target architecture to debug before any code moved. Every part of it
has now reported. The definition end shipped two rows as helpers a game calls,
withdrew three with postmortems and completed the sixth; presentation was
withdrawn (2026-09-09); the guarantees settled on "having" a capability; and the
deduction end's last question was measured by `add-tracks-hint` (2026-09-10). Its
own README closes on *"this document has nothing further to report."* No open
change realizes any part of it.

The owner asked, 2026-09-10, whether to retire it now that the desired changes are
implemented and written up in the regular docs. A vision nobody is still steered by
is a second copy of the record with a maintenance tax: its struck-through passages
have to be kept true against a tree that no longer consults them, and a session
reading it is one step from citing fiction as fact.

## What changes

- **Every section is accounted for before anything is deleted** (`tasks.md` §1): a
  passage is either already stated as a live rule in `AGENTS.md`, a `docs/games/`
  guide or a spec; or argument and history the archive and the four postmortems
  already hold; or a live rule with no other home, which moves.
- **What moves**, because it lives nowhere else: the owner's stated ambition (to
  `AGENTS.md` § "Goal"); the invariants a cross-game refactor must not move, with
  two-lane acceptance and the capability diff (to `docs/games/README.md`); the
  extraction criterion, *fact → helper, shape → module, per-game only when a game
  would legitimately differ* (to `engine-catalog.md`); the bespoke-loop Tell and the
  recorded open question on splitting a technique into find/apply/narrate (to
  `solver-and-generator.md`).
- **One unshipped survey item becomes a change**: digit keys are still parsed by
  hand across the collection's input code, in several spellings.
  `share-the-digit-key-fact` holds it, measured and classified, rather than the
  fiction.
- **Citations follow**: `AGENTS.md`, `solver-and-generator.md`, the open
  `add-path-ts-port` proposal and the citation guard's ledger. The record (the
  archive, the postmortems) keeps its words.
- **The directory is deleted.**

## Specs

- `repo-layout`: the quarantine requirement and the status-column requirement are
  generalized to *a* design-fiction directory, and the latter gains the rule this
  change follows — a vision with nothing left to report is retired, after its live
  rules have moved and each withdrawal has its postmortem. Its "never deleted" clause
  was written for a live vision and now says so.
- `ts-engine`: two requirements quote the vision to refuse what it proposed; they
  now name it as retired rather than pointing at files that no longer exist.

## Not in scope

Reopening any withdrawn direction. The postmortems are the argument against
re-proposing each one, and they are unchanged.
