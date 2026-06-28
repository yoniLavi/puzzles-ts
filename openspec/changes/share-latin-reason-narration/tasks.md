# Tasks: Share the generic-LatinReason narration arms

> Conditional refactor (see proposal). Gate: per-game hint suites assert exact strings —
> a passing run with **no string/snapshot change** is the correctness bar. If, after
> Solo's overrides, the shared narrator isn't clearly simpler, **stop and document the
> non-extraction** instead.

- [ ] 1.1 Inventory the `narrate` arms across Keen/Unequal/Solo (and Towers); confirm which
  generic arms (`single`, `set`, `forcing`, row/col `hiddenSingle`/`forcedSingle`/`dup`)
  are byte-identical and which Solo overrides (block/diagonal wording).
- [ ] 1.2 Decision point: if the shared set net of Solo's overrides is worth it, add
  `narrateLatinReason(reason, ns)` to `engine/latin-hint.ts`; else record the
  non-extraction in `docs/porting/hint-authoring.md` §9 and close the change.
- [ ] 1.3 If adopted: delegate the generic arms in keen/unequal/solo `narrate` to the shared
  narrator, keeping game-specific arms local; re-run each hint suite (no string change).
- [ ] 1.4 Full gate green → owner acceptance → commit + archive.
