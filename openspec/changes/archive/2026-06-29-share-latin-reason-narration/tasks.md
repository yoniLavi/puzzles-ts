# Tasks: Share the generic-LatinReason narration arms

> Conditional refactor (see proposal). Gate: per-game hint suites assert exact strings —
> a passing run with **no string/snapshot change** is the correctness bar. If, after
> Solo's overrides, the shared narrator isn't clearly simpler, **stop and document the
> non-extraction** instead.

- [x] 1.1 Inventory the `narrate` arms across Keen/Unequal/Solo (and Towers); confirm which
  generic arms (`single`, `set`, `forcing`, row/col `hiddenSingle`/`forcedSingle`/`dup`)
  are byte-identical and which Solo overrides (block/diagonal wording).
- [x] 1.2 Decision point: **partial-adopt.** Added `narrateLatinReason(reason, ns)` to
  `engine/latin-hint.ts` covering all six generic arms (`single`/`hiddenSingle`/
  `forcedSingle`/`dup`/`set`/`forcing`), scoped to the **row/column** games (Keen,
  Unequal), where they are byte-identical. **Solo and Towers are deliberately left local**
  and not on the shared narrator: Solo's generic arms diverge (name "row, column **and
  block**", region names for `hiddenSingle`), and Towers narrates the whole family in
  "height" vocabulary with a single value not an `ns` list — forcing either onto the shared
  narrator would carry per-game overrides for half its arms and read worse than the
  duplication. Decision recorded in `docs/porting/hint-authoring.md` §9.
- [x] 1.3 Delegate the generic arms in **keen/unequal** `narrate` to the shared narrator
  (each switches its game-specific arms then `default: return narrateLatinReason(...)`),
  keeping game-specific arms local; re-ran each hint suite (no string change). Solo/Towers
  unchanged.
- [ ] 1.4 Full gate green → owner acceptance → commit + archive.
