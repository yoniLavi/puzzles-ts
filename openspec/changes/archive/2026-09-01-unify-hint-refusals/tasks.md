# Tasks — unify-hint-refusals

## 1. Measure, then re-measure the instrument

- [x] 1.1 Scope the population to the hint path. A grep for
      `{ ok: false, error }` counts `SolveResult` and every description parser
      too; the handoff's "nine phrasings" was that number, over a population it
      had not defined. Scoped: **21 games, 17 distinct strings**.
- [x] 1.2 **Check the instrument.** The scoped probe matched functions *named*
      `hint`, so it never saw `netslideHint` — one whole game, absent from every
      figure, with two divergent messages. Same failure as
      `emittable-keys.test.ts`'s first cut keying on a name.
- [x] 1.3 Re-key on **shape**, accepting a superset (Solve, the parsers) and
      classifying it rather than filtering — filtering is what went wrong twice.

## 2. One definition per message

- [x] 2.1 `src/engine/hint-refusal.ts`: `ALREADY_SOLVED`, `FIX_MISTAKES_FIRST`,
      `CONTRADICTION_UNLOCALISED`, `NO_DEDUCTION_LEFT`,
      `NO_DEDUCTION_LEFT_TRIAL_AND_ERROR`, `NO_MOVE_WORTH_MAKING`,
      `PUZZLE_NOT_REASONABLE`, plus `commonHintRefusal`.
- [x] 2.2 Twenty-two games converted; no private copy of an approved message
      survives anywhere.
- [x] 2.3 **The distinction the sweep nearly destroyed.** Bricks' and Subsets'
      extra messages are not spelling: their `findMistakes` is a rule validator
      that cannot see a wrong-but-legal entry (Bricks says so in a comment), so
      `FIX_MISTAKES_FIRST`'s promise of a *highlight* would be false there.
      Given `CONTRADICTION_UNLOCALISED` instead. Clusters' message was already
      making this distinction and joins them.
- [x] 2.4 Untangle and Inertia keep their own words, with reasons recorded in
      the guard's exception table.

## 3. The guard

- [x] 3.1 `hint-refusal.test.ts`, shape-keyed over every non-test source in
      `src/games/`, with a fail-closed exception table carrying a reason per
      entry and a check that no entry has gone stale.
- [x] 3.2 **Proved it fails, both directions**: a fresh phrasing in Unruly went
      red; re-inlining `"This board is already solved."` in place of the import
      went red. Restored.
- [x] 3.3 Vacuity guards: the glob found >150 files and the scan found literals.
- [x] 3.4 Five test files that asserted an old string now assert the constant.

## 4. Close out

- [x] 4.1 `docs/games/hints.md` § "Refusal wording comes from one module",
      including how to choose between the two mistake messages.
- [x] 4.2 Full gate green.
- [x] 4.3 Owner accepted 2026-09-01, wording as shipped. Archived.
